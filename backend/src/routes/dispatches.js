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
    const dispatchResult = db.prepare(`
      INSERT INTO dispatches (dispatch_date, dispatched_by, dealer_name, dealer_contact, location, dispatch_type, device_count, remarks, status)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, 'DISPATCHED')
    `).run(dispatched_by || 'Warehouse Manager', dealer_name, dealer_contact || '', location, dispatch_type || 'DEALER', validDevices.length, remarks || '');

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

// GET /api/dispatches/:id - Drill down into a dispatch record
router.get('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(id);
    if (!dispatch) {
      return res.status(404).json({ success: false, error: 'Dispatch record not found' });
    }

    const items = db.prepare(`
      SELECT di.*, d.sim_number, d.current_status, dt.name as device_type_name
      FROM dispatch_items di
      JOIN devices d ON di.device_id = d.id
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE di.dispatch_id = ?
    `).all(id);

    res.json({ success: true, data: { ...dispatch, items } });
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

// GET /api/dispatches/dealer-summary - Group stock by dealer & device type
router.get('/summary/dealer-stock', (req, res) => {
  try {
    const summary = db.prepare(`
      SELECT 
        d.current_holder_name as dealer_name,
        dt.name as device_type_name,
        COUNT(d.id) as device_count
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE d.current_status = 'WITH_DEALER'
      GROUP BY d.current_holder_name, dt.name
      ORDER BY d.current_holder_name, dt.name
    `).all();

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
