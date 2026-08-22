const express = require('express');
const router = express.Router();
const db = require('../db/database');

// POST /api/dispatches - Dispatch stock to dealer or sales person (Workflow B)
router.post('/', (req, res) => {
  const {
    dispatched_by,
    dealer_name,
    dealer_contact,
    location,
    dispatch_type, // DEALER | SALES_PERSON | OTHER
    remarks,
    imeis // Array of IMEI strings scanned during bulk scan
  } = req.body;

  if (!dealer_name || !location || !imeis || !Array.isArray(imeis) || imeis.length === 0) {
    return res.status(400).json({ success: false, error: 'Dealer name, location, and scanned IMEIs are required' });
  }

  const transaction = db.transaction(() => {
    // 1. Verify all IMEIs exist and are currently available in warehouse or returned
    const findDeviceStmt = db.prepare('SELECT * FROM devices WHERE imei_number = ?');
    const validDevices = [];
    const invalidImeis = [];

    for (const imei of imeis) {
      const dev = findDeviceStmt.get(imei);
      if (!dev) {
        invalidImeis.push({ imei, reason: 'IMEI not found in system' });
      } else if (dev.current_status === 'INSTALLED') {
        invalidImeis.push({ imei, reason: `Device is already INSTALLED in vehicle (${dev.current_holder_name || 'Customer'}). Cannot dispatch installed device.` });
      } else {
        validDevices.push(dev);
      }
    }

    if (validDevices.length === 0) {
      throw new Error(`No valid devices available for dispatch. ${invalidImeis.map(i => i.imei + ': ' + i.reason).join('; ')}`);
    }

    // 2. Create Dispatch Record
    const year = new Date().getFullYear();
    const countRow = db.prepare('SELECT COUNT(*) as c FROM dispatches').get();
    const nextNum = (countRow ? countRow.c : 0) + 1;
    const challanNumber = `FT-DCN-${year}-${String(nextNum).padStart(4, '0')}`;

    const dispatchResult = db.prepare(`
      INSERT INTO dispatches (dispatch_date, dispatched_by, dealer_name, dealer_contact, receiver_phone, location, dispatch_type, device_count, remarks, challan_number, transport_details, status)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISPATCHED')
    `).run(
      dispatched_by || 'Warehouse Manager',
      dealer_name,
      dealer_contact || '',
      dealer_contact || '',
      location,
      dispatch_type || 'DEALER',
      validDevices.length,
      remarks || '',
      challanNumber,
      req.body.transport_details || 'Hand Delivery / Field Courier'
    );

    const dispatchId = dispatchResult.lastInsertRowid;

    const insertDispatchItemStmt = db.prepare(`
      INSERT INTO dispatch_items (dispatch_id, device_id, imei_number, status)
      VALUES (?, ?, ?, 'DISPATCHED')
    `);

    const updateDeviceStmt = db.prepare(`
      UPDATE devices
      SET current_status = 'WITH_DEALER',
          current_holder_type = 'DEALER',
          current_holder_id = NULL,
          current_holder_name = ?,
          additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const insertHistoryStmt = db.prepare(`
      INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
      VALUES (?, ?, 'DISPATCHED', datetime('now'), ?, ?, ?, ?)
    `);

    const todayDate = new Date().toISOString().split('T')[0];

    for (const dev of validDevices) {
      // Insert item
      insertDispatchItemStmt.run(dispatchId, dev.id, dev.imei_number);

      // Parse existing additional_attributes
      let attr = {};
      try {
        attr = dev.additional_attributes ? JSON.parse(dev.additional_attributes) : {};
      } catch (e) {
        attr = {};
      }
      attr['STOCK PLACE'] = `${dealer_name} (${location})`;
      attr['STOCK PLACE DATE'] = todayDate;

      // Update Device status and additional attributes
      updateDeviceStmt.run(dealer_name, JSON.stringify(attr), dev.id);

      // Log Audit History
      insertHistoryStmt.run(
        dev.id,
        dev.imei_number,
        dev.current_holder_name || 'Central Warehouse',
        dealer_name,
        dispatched_by || 'Warehouse Manager',
        `Dispatched under Dispatch #${dispatchId} to ${dealer_name} (${location})`
      );
    }

    return { dispatchId, dispatchedCount: validDevices.length, skipped: invalidImeis };
  });

  try {
    const result = transaction();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/dispatches - List all dispatches (with optional dealer_name filter)
router.get('/', (req, res) => {
  try {
    const { dealer_name } = req.query;
    let query = 'SELECT * FROM dispatches';
    const params = [];

    if (dealer_name) {
      query += ' WHERE dealer_name LIKE ? OR location LIKE ?';
      params.push(`%${dealer_name}%`, `%${dealer_name}%`);
    }

    query += ' ORDER BY dispatch_date DESC';

    const dispatches = db.prepare(query).all(...params);

    res.json({ success: true, data: dispatches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to fetch and resolve dispatch items with intelligent fallback & SIM formatting
function getDispatchItems(dispatchId, dispatch) {
  let items = db.prepare(`
    SELECT di.id, di.imei_number, d.sim_number, d.sim_operator, d.additional_attributes, dt.name as device_type_name
    FROM dispatch_items di
    JOIN devices d ON di.device_id = d.id
    JOIN device_types dt ON d.device_type_id = dt.id
    WHERE di.dispatch_id = ?
  `).all(dispatchId);

  // If no items were explicitly bound yet, look up devices assigned to this dealer / location
  if (!items || items.length === 0) {
    const dealerName = dispatch.dealer_name || '';
    const location = dispatch.location || '';
    const limit = dispatch.device_count || 50;

    const fallbackDevs = db.prepare(`
      SELECT d.id, d.imei_number, d.sim_number, d.sim_operator, d.additional_attributes, dt.name as device_type_name
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE d.current_holder_name LIKE ? 
         OR d.additional_attributes LIKE ?
         OR (d.additional_attributes LIKE ? AND ? != '')
      LIMIT ?
    `).all(`%${dealerName}%`, `%${dealerName}%`, `%${location}%`, location, limit);

    if (fallbackDevs && fallbackDevs.length > 0) {
      items = fallbackDevs;
      try {
        const insertStmt = db.prepare('INSERT OR IGNORE INTO dispatch_items (dispatch_id, device_id, imei_number) VALUES (?, ?, ?)');
        for (const dev of fallbackDevs) {
          insertStmt.run(dispatchId, dev.id, dev.imei_number);
        }
      } catch (e) {}
    }
  }

  return (items || []).map(it => {
    let attrs = {};
    try { attrs = JSON.parse(it.additional_attributes || '{}'); } catch {}
    const sim = it.sim_number || attrs['simno1'] || attrs['SIM NUMBER'] || attrs['sim_number'] || attrs['simno2'] || '';
    return {
      id: it.id,
      imei_number: it.imei_number,
      sim_number: sim ? String(sim) : '-',
      sim_operator: it.sim_operator || attrs['SIM OPERATOR'] || attrs['NETWORK'] || 'Airtel',
      device_type_name: it.device_type_name || 'AIS-140 GPS'
    };
  });
}

// GET /api/dispatches/summary/dealer-stock - Group stock by dealer & device type
router.get('/summary/dealer-stock', (req, res) => {
  try {
    const { dealer_name } = req.query;
    let query = `
      SELECT 
        d.current_holder_name as dealer_name,
        dt.name as device_type_name,
        COUNT(d.id) as device_count
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE d.current_status = 'WITH_DEALER'
    `;
    const params = [];
    if (dealer_name) {
      query += ` AND (d.current_holder_name LIKE ? OR d.current_holder_name = ?)`;
      params.push(`%${dealer_name}%`, dealer_name);
    }
    query += ` GROUP BY d.current_holder_name, dt.name ORDER BY d.current_holder_name, dt.name`;

    const summary = db.prepare(query).all(...params);
    res.json({ success: true, data: summary || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/dispatches/:id - Drill down into a dispatch record
router.get('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(id);
    if (!dispatch) {
      return res.status(404).json({ success: false, error: 'Dispatch record not found' });
    }

    const items = getDispatchItems(id, dispatch);
    const challanNo = dispatch.challan_number || `FT-DCN-2026-${String(dispatch.id).padStart(4, '0')}`;

    res.json({ success: true, data: { ...dispatch, challan_number: challanNo, items } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/dispatches/:id/challan - Structured Delivery Challan (DCN) details
router.get('/:id/challan', (req, res) => {
  const { id } = req.params;
  try {
    const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(id);
    if (!dispatch) return res.status(404).json({ success: false, error: 'Dispatch record not found' });

    const items = getDispatchItems(id, dispatch);
    const challanNo = dispatch.challan_number || `FT-DCN-2026-${String(dispatch.id).padStart(4, '0')}`;

    res.json({
      success: true,
      data: {
        challan_number: challanNo,
        dispatch_id: dispatch.id,
        dispatch_date: dispatch.dispatch_date,
        dispatched_by: dispatch.dispatched_by,
        dealer_name: dispatch.dealer_name,
        dealer_contact: dispatch.dealer_contact || '',
        location: dispatch.location,
        transport_details: dispatch.transport_details || 'Field Courier / Direct Handover',
        device_count: items.length || dispatch.device_count || 0,
        status: dispatch.status,
        accepted_at: dispatch.accepted_at,
        remarks: dispatch.remarks,
        items
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/dispatches/:id/acknowledge - Dealer digital acceptance of stock
router.post('/:id/acknowledge', (req, res) => {
  const { id } = req.params;
  const { acknowledged_by } = req.body;
  try {
    const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(id);
    if (!dispatch) return res.status(404).json({ success: false, error: 'Dispatch not found' });

    db.prepare(`
      UPDATE dispatches
      SET accepted_at = CURRENT_TIMESTAMP,
          remarks = COALESCE(remarks, '') || ' [Accepted by ' || ? || ' on ' || datetime('now') || ']'
      WHERE id = ?
    `).run(acknowledged_by || dispatch.dealer_name, id);

    res.json({ success: true, message: `Dispatch #${id} confirmed and accepted into custody.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/dispatches/return - Return items from dealer to warehouse (Workflow D)
router.post('/return', (req, res) => {
  const { imeis, returned_by, reason } = req.body;
  if (!imeis || !Array.isArray(imeis) || imeis.length === 0) {
    return res.status(400).json({ success: false, error: 'IMEIs array required for return' });
  }

  const transaction = db.transaction(() => {
    const updateDevStmt = db.prepare(`
      UPDATE devices
      SET current_status = 'IN_WAREHOUSE',
          current_holder_type = 'WAREHOUSE',
          current_holder_id = 1,
          current_holder_name = 'Central Warehouse',
          updated_at = CURRENT_TIMESTAMP
      WHERE imei_number = ?
    `);

    const updateDispatchItemStmt = db.prepare(`
      UPDATE dispatch_items SET status = 'RETURNED' WHERE imei_number = ?
    `);

    const insertHistoryStmt = db.prepare(`
      INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
      VALUES (?, ?, 'RETURNED', datetime('now'), ?, 'Central Warehouse', ?, ?)
    `);

    const returnedList = [];
    for (const imei of imeis) {
      const dev = db.prepare('SELECT * FROM devices WHERE imei_number = ?').get(imei);
      if (dev) {
        const prevHolder = dev.current_holder_name;
        updateDevStmt.run(imei);
        updateDispatchItemStmt.run(imei);
        insertHistoryStmt.run(dev.id, imei, prevHolder, returned_by || 'Admin', reason || 'Stock returned to central warehouse');
        returnedList.push(imei);
      }
    }
    return { returnedCount: returnedList.length };
  });

  try {
    const result = transaction();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/dispatches/clear-all - Delete all dispatch history records and optionally reset stock to warehouse
router.delete('/clear-all', (req, res) => {
  try {
    const { revert_stock = true } = req.query;

    const transaction = db.transaction(() => {
      // 1. If requested, revert all devices held by dealers back to Central Warehouse
      if (revert_stock === true || revert_stock === 'true') {
        const withDealerDevs = db.prepare(`SELECT id, imei_number, additional_attributes FROM devices WHERE current_status = 'WITH_DEALER'`).all();
        const updateDev = db.prepare(`
          UPDATE devices
          SET current_status = 'IN_WAREHOUSE',
              current_holder_type = 'WAREHOUSE',
              current_holder_name = 'Central Warehouse',
              additional_attributes = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
        for (const dev of withDealerDevs) {
          let attrs = {};
          try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
          attrs['STOCK PLACE'] = 'Central Warehouse';
          delete attrs['DEALER'];
          updateDev.run(JSON.stringify(attrs), dev.id);
        }
      }

      // 2. Clear tables
      db.prepare(`DELETE FROM dispatch_items`).run();
      const info = db.prepare(`DELETE FROM dispatches`).run();
      return info;
    });

    transaction();
    res.json({ success: true, message: 'All dispatch records cleared successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/dispatches/:id - Delete a single dispatch record and optionally revert stock
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { revert_stock = true } = req.query;
  try {
    const dispatch = db.prepare(`SELECT * FROM dispatches WHERE id = ?`).get(id);
    if (!dispatch) return res.status(404).json({ success: false, error: 'Dispatch not found' });

    const transaction = db.transaction(() => {
      // 1. If reverting stock, get items and reset their status back to IN_WAREHOUSE
      if (revert_stock === true || revert_stock === 'true') {
        const items = db.prepare(`SELECT device_id, imei_number FROM dispatch_items WHERE dispatch_id = ?`).all(id);
        const updateDev = db.prepare(`
          UPDATE devices
          SET current_status = 'IN_WAREHOUSE',
              current_holder_type = 'WAREHOUSE',
              current_holder_name = 'Central Warehouse',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? OR imei_number = ?
        `);
        for (const it of items) {
          updateDev.run(it.device_id, it.imei_number);
        }
      }

      // 2. Delete dispatch items & dispatch record
      db.prepare(`DELETE FROM dispatch_items WHERE dispatch_id = ?`).run(id);
      db.prepare(`DELETE FROM dispatches WHERE id = ?`).run(id);
    });

    transaction();
    res.json({ success: true, message: `Dispatch #${id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/dispatches/reset-dealer-stock - Revert all stock held by a dealer back to central warehouse
router.post('/reset-dealer-stock', (req, res) => {
  const { dealer_name } = req.body;
  if (!dealer_name) return res.status(400).json({ success: false, error: 'dealer_name is required' });

  try {
    const devs = db.prepare(`
      SELECT id, additional_attributes
      FROM devices
      WHERE current_holder_name LIKE ? OR additional_attributes LIKE ?
    `).all(`%${dealer_name}%`, `%"STOCK PLACE":"${dealer_name}%`);

    const updateDev = db.prepare(`
      UPDATE devices
      SET current_status = 'IN_WAREHOUSE',
          current_holder_type = 'WAREHOUSE',
          current_holder_name = 'Central Warehouse',
          additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    db.transaction(() => {
      for (const dev of devs) {
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
        attrs['STOCK PLACE'] = 'Central Warehouse';
        updateDev.run(JSON.stringify(attrs), dev.id);
      }
    })();

    res.json({ success: true, count: devs.length, message: `Reverted ${devs.length} devices from ${dealer_name} back to Central Warehouse.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
