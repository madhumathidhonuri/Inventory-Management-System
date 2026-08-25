const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET devices list with search & filter
router.get('/', (req, res) => {
  try {
    const { status, current_status, device_type_id, purchase_batch_id, holder_type, holder_name, dealer_name, stock_place, search } = req.query;
    let query = `
      SELECT d.*, dt.name as device_type_name, dt.category as device_type_category
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE 1=1
    `;
    const params = [];

    const activeStatus = status || current_status;
    if (activeStatus) {
      query += ` AND d.current_status = ?`;
      params.push(activeStatus);
    }
    if (device_type_id) {
      query += ` AND d.device_type_id = ?`;
      params.push(device_type_id);
    }
    if (purchase_batch_id) {
      query += ` AND d.purchase_batch_id = ?`;
      params.push(purchase_batch_id);
    }
    if (holder_type) {
      query += ` AND d.current_holder_type = ?`;
      params.push(holder_type);
    }
    const targetDealer = dealer_name || stock_place;
    if (targetDealer) {
      query += ` AND (d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)`;
      params.push(`%${targetDealer}%`, `%${targetDealer}%`);
    } else if (holder_name) {
      query += ` AND d.current_holder_name LIKE ?`;
      params.push(`%${holder_name}%`);
    }
    if (search) {
      query += ` AND (d.imei_number LIKE ? OR d.sim_number LIKE ? OR d.vendor_name LIKE ? OR d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY d.updated_at DESC`;

    const devices = db.prepare(query).all(...params);
    const formatted = devices.map(d => ({
      ...d,
      additional_attributes: JSON.parse(d.additional_attributes || '{}')
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/devices/aging-analysis - Dead-Stock & Stock Age Analysis
router.get('/aging-analysis', (req, res) => {
  try {
    const devices = db.prepare(`
      SELECT d.*, dt.name as device_type_name
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE d.current_status != 'INSTALLED'
    `).all();

    const now = new Date();
    const fresh = [];
    const aging = [];
    const stale = [];

    devices.forEach(d => {
      let attrs = {};
      try { attrs = JSON.parse(d.additional_attributes || '{}'); } catch {}
      const dateStr = d.purchase_date || attrs['STOCK PLACE DATE'] || d.created_at;
      const itemDate = new Date(dateStr);
      const ageDays = !isNaN(itemDate.getTime()) ? Math.max(0, Math.floor((now - itemDate) / (1000 * 86400))) : 0;

      const record = {
        id: d.id,
        imei_number: d.imei_number,
        device_type_name: d.device_type_name,
        current_holder_name: d.current_holder_name || attrs['STOCK PLACE'] || 'Central Warehouse',
        current_status: d.current_status,
        age_days: ageDays,
        purchase_date: dateStr
      };

      if (ageDays > 60) {
        stale.push(record);
      } else if (ageDays >= 30) {
        aging.push(record);
      } else {
        fresh.push(record);
      }
    });

    res.json({
      success: true,
      summary: {
        totalUninstalled: devices.length,
        staleCount: stale.length,
        agingCount: aging.length,
        freshCount: fresh.length
      },
      stale: stale.sort((a, b) => b.age_days - a.age_days),
      aging: aging.sort((a, b) => b.age_days - a.age_days),
      fresh: fresh.sort((a, b) => b.age_days - a.age_days)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/devices/sim-validity - SIM Card Validity & Telecom Expiry Watcher
router.get('/sim-validity', (req, res) => {
  try {
    const devices = db.prepare(`
      SELECT d.*, dt.name as device_type_name
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE (d.sim_number IS NOT NULL AND d.sim_number != '') OR d.sim_expiry_date IS NOT NULL
    `).all();

    const now = new Date();
    const expiringSoon = [];
    const expired = [];
    const active = [];
    const carrierCounts = {};

    devices.forEach(d => {
      let attrs = {};
      try { attrs = JSON.parse(d.additional_attributes || '{}'); } catch {}

      const carrier = d.sim_operator || attrs['SIM OPERATOR'] || attrs['NETWORK'] || 'Airtel / BSNL / Vi';
      carrierCounts[carrier] = (carrierCounts[carrier] || 0) + 1;

      const expiryStr = d.sim_expiry_date || attrs['SIM EXPIRY'] || attrs['VALIDITY'];
      let daysRemaining = null;
      if (expiryStr) {
        const expDate = new Date(expiryStr);
        if (!isNaN(expDate.getTime())) {
          daysRemaining = Math.ceil((expDate - now) / (1000 * 86400));
        }
      }

      const item = {
        id: d.id,
        imei_number: d.imei_number,
        sim_number: d.sim_number,
        sim_operator: carrier,
        sim_expiry_date: expiryStr,
        days_remaining: daysRemaining,
        current_holder_name: d.current_holder_name,
        current_status: d.current_status,
        customer_name: attrs['CUSTOMER NAME'] || attrs['PARTY NAME'] || '',
        vehicle_number: attrs['VEHICLE NO'] || attrs['REG NO'] || ''
      };

      if (daysRemaining !== null) {
        if (daysRemaining < 0) {
          expired.push(item);
        } else if (daysRemaining <= 30) {
          expiringSoon.push(item);
        } else {
          active.push(item);
        }
      } else {
        active.push(item);
      }
    });

    res.json({
      success: true,
      summary: {
        totalSims: devices.length,
        expiringSoonCount: expiringSoon.length,
        expiredCount: expired.length,
        activeCount: active.length
      },
      data: {
        carrier_counts: carrierCounts,
        expiring_soon: expiringSoon.sort((a, b) => (a.days_remaining || 0) - (b.days_remaining || 0)),
        expired: expired.sort((a, b) => (a.days_remaining || 0) - (b.days_remaining || 0)),
        active: active
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/:id/rma-update - Update RMA stage and vendor tracking
router.post('/:id/rma-update', (req, res) => {
  try {
    const { id } = req.params;
    const { rma_status, rma_vendor_name, rma_replacement_imei, rma_notes, performed_by = 'Super Admin' } = req.body;

    const device = db.prepare(`SELECT * FROM devices WHERE id = ?`).get(id);
    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });

    let newStatus = device.current_status;
    if (rma_status === 'FAULTY_REPORTED' || rma_status === 'RECEIVED_LAB' || rma_status === 'SENT_TO_OEM') {
      newStatus = 'FAULTY';
    } else if (rma_status === 'REPLACED') {
      newStatus = 'IN_WAREHOUSE';
    }

    db.prepare(`
      UPDATE devices
      SET rma_status = ?, rma_vendor_name = ?, rma_replacement_imei = ?, rma_notes = ?, rma_date = CURRENT_TIMESTAMP, current_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(rma_status, rma_vendor_name || null, rma_replacement_imei || null, rma_notes || null, newStatus, id);

    // Audit log entry
    db.prepare(`
      INSERT INTO inventory_audit_logs (device_id, imei_number, event_type, performed_by, old_values, new_values, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      device.imei_number,
      'RMA_UPDATE',
      performed_by,
      JSON.stringify({ rma_status: device.rma_status }),
      JSON.stringify({ rma_status, rma_vendor_name, rma_replacement_imei }),
      rma_notes || `RMA status transitioned to ${rma_status}`
    );

    res.json({ success: true, message: `RMA updated to ${rma_status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/bulk-sim-update - Bulk update SIM details and validity
router.post('/bulk-sim-update', (req, res) => {
  try {
    const { updates = [], performed_by = 'Super Admin' } = req.body;
    const stmt = db.prepare(`
      UPDATE devices
      SET sim_operator = ?, sim_expiry_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? OR imei_number = ?
    `);

    db.transaction(() => {
      for (const u of updates) {
        stmt.run(u.sim_operator || null, u.sim_expiry_date || null, u.id || null, u.imei_number || null);
      }
    })();

    res.json({ success: true, count: updates.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/devices/global-search - Universal search across IMEI, Vehicle, Customer, Phone, SIM, and Stock Place
router.get('/global-search', (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.json({ success: true, count: 0, data: [] });
  }

  try {
    const term = q.trim();
    const query = `
      SELECT d.*, dt.name as device_type_name
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE d.imei_number LIKE ?
         OR d.sim_number LIKE ?
         OR d.current_holder_name LIKE ?
         OR d.additional_attributes LIKE ?
      LIMIT 15
    `;
    const wildcard = `%${term}%`;
    const devices = db.prepare(query).all(wildcard, wildcard, wildcard, wildcard);

    const results = devices.map(d => {
      let attrs = {};
      try { attrs = JSON.parse(d.additional_attributes || '{}'); } catch {}

      const vehKey = Object.keys(attrs).find(k => /vehicle|veh_no|reg_no/i.test(k));
      const vehNo = vehKey && attrs[vehKey] ? String(attrs[vehKey]).trim() : '';

      const custKey = Object.keys(attrs).find(k => /customer.*name|name|certificate.*to/i.test(k));
      const custName = custKey && attrs[custKey] ? String(attrs[custKey]).trim() : d.current_holder_name || '';

      const phoneKey = Object.keys(attrs).find(k => /phone|contact|mobile/i.test(k));
      const phone = phoneKey && attrs[phoneKey] ? String(attrs[phoneKey]).trim() : '';

      const placeKey = Object.keys(attrs).find(k => /stock.*place|place|location/i.test(k));
      const place = placeKey && attrs[placeKey] ? String(attrs[placeKey]).trim() : '';

      return {
        id: d.id,
        imei_number: d.imei_number,
        sim_number: d.sim_number,
        device_type_name: d.device_type_name,
        current_status: d.current_status,
        vehicle_number: vehNo,
        customer_name: custName,
        phone_number: phone,
        stock_place: place
      };
    });

    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/devices/audit-logs - Super Admin complete history of all edits made by Admin and Sales teams
router.get('/audit-logs', (req, res) => {
  try {
    const { search, performed_by, limit = 500 } = req.query;
    let query = `
      SELECT dh.*, d.vendor_name, d.sim_number, d.current_status as current_device_status,
             d.additional_attributes, dt.name as device_type_name
      FROM device_history dh
      JOIN devices d ON dh.device_id = d.id
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (dh.imei_number LIKE ? OR dh.remarks LIKE ? OR dh.performed_by LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (performed_by) {
      query += ` AND dh.performed_by LIKE ?`;
      params.push(`%${performed_by}%`);
    }

    query += ` ORDER BY dh.id DESC LIMIT ?`;
    params.push(parseInt(limit));

    const logs = db.prepare(query).all(...params);
    const formatted = logs.map(l => ({
      ...l,
      additional_attributes: JSON.parse(l.additional_attributes || '{}')
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/devices/dealers-summary - Group devices count by Stock Place / Dealer
router.get('/dealers-summary', (req, res) => {
  try {
    const devices = db.prepare('SELECT id, current_status, current_holder_name, additional_attributes, updated_at FROM devices').all();
    const dealerMap = {};

    for (const d of devices) {
      let attrs = {};
      try { attrs = JSON.parse(d.additional_attributes || '{}'); } catch {}

      const placeKey = Object.keys(attrs).find(k => /stock.*place/i.test(k));
      const place = (placeKey && attrs[placeKey] ? String(attrs[placeKey]).trim() : d.current_holder_name || 'Unassigned').trim();

      const dateKey = Object.keys(attrs).find(k => /stock.*place.*date|date/i.test(k));
      const dateVal = dateKey && attrs[dateKey] ? String(attrs[dateKey]).trim() : '';

      const vehKey = Object.keys(attrs).find(k => /vehicle|veh_no|reg_no/i.test(k));
      const isInstalled = Boolean(vehKey && attrs[vehKey]) || d.current_status === 'INSTALLED';

      if (!dealerMap[place]) {
        dealerMap[place] = {
          stock_place: place,
          total_count: 0,
          installed_count: 0,
          in_stock_count: 0,
          latest_date: dateVal
        };
      }

      dealerMap[place].total_count++;
      if (isInstalled) {
        dealerMap[place].installed_count++;
      } else {
        dealerMap[place].in_stock_count++;
      }
      if (dateVal && (!dealerMap[place].latest_date || dateVal > dealerMap[place].latest_date)) {
        dealerMap[place].latest_date = dateVal;
      }
    }

    const summaryList = Object.values(dealerMap).sort((a, b) => b.total_count - a.total_count);
    res.json({ success: true, count: summaryList.length, data: summaryList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/devices/aging-analysis - Stale & Idle stock aging report
router.get('/aging-analysis', (req, res) => {
  try {
    const devices = db.prepare(`
      SELECT d.*, dt.name as device_type_name
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE d.current_status != 'INSTALLED'
    `).all();

    const now = new Date();
    const brackets = {
      fresh: [],      // < 30 days
      aging: [],      // 30 - 60 days
      stale: [],      // > 60 days
      summary: { freshCount: 0, agingCount: 0, staleCount: 0, totalIdle: 0 }
    };

    devices.forEach(dev => {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

      // Calculate days in stock
      let dateStr = dev.purchase_date || dev.created_at;
      const placeDate = attrs['STOCK PLACE DATE'] || attrs['DATE'] || attrs['UPLOAD DATE'];
      if (placeDate) {
        if (typeof placeDate === 'number' && placeDate > 30000) {
          const d = new Date(Math.round((placeDate - 25569) * 86400 * 1000));
          dateStr = d.toISOString();
        } else {
          dateStr = String(placeDate);
        }
      }

      const itemDate = new Date(dateStr);
      const validDate = !isNaN(itemDate.getTime()) ? itemDate : new Date(dev.created_at);
      const ageDays = Math.max(0, Math.floor((now - validDate) / (1000 * 60 * 60 * 24)));

      const holder = dev.current_holder_name || attrs['STOCK PLACE'] || 'Central Warehouse';
      const item = {
        id: dev.id,
        imei_number: dev.imei_number,
        sim_number: dev.sim_number,
        device_type_name: dev.device_type_name,
        current_holder_name: holder,
        current_status: dev.current_status,
        age_days: ageDays,
        stock_since: validDate.toISOString().split('T')[0],
        vendor_name: dev.vendor_name
      };

      if (ageDays > 60) {
        brackets.stale.push(item);
        brackets.summary.staleCount++;
      } else if (ageDays >= 30) {
        brackets.aging.push(item);
        brackets.summary.agingCount++;
      } else {
        brackets.fresh.push(item);
        brackets.summary.freshCount++;
      }
      brackets.summary.totalIdle++;
    });

    res.json({ success: true, data: brackets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/devices/sim-validity - SIM card expiry tracker & carrier analytics
router.get('/sim-validity', (req, res) => {
  try {
    const devices = db.prepare(`
      SELECT d.id, d.imei_number, d.sim_number, d.sim_operator, d.sim_expiry_date, d.sim_status,
             d.current_status, d.current_holder_name, d.purchase_date, dt.name as device_type_name,
             i.customer_name, i.customer_contact, i.vehicle_number, i.installation_date
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      LEFT JOIN installations i ON d.id = i.device_id
      WHERE d.sim_number IS NOT NULL AND d.sim_number != ''
    `).all();

    const now = new Date();
    const result = {
      expiring_soon: [], // within 30 days
      expired: [],       // past expiry
      active: [],        // safe
      carrier_counts: { Airtel: 0, Vi: 0, BSNL: 0, Jio: 0, Other: 0 }
    };

    devices.forEach(dev => {
      const carrier = dev.sim_operator || 'Airtel';
      result.carrier_counts[carrier] = (result.carrier_counts[carrier] || 0) + 1;

      // Determine expiry date: use explicit sim_expiry_date or fallback to 1 year from install/purchase
      let expDateStr = dev.sim_expiry_date;
      if (!expDateStr) {
        const baseDateStr = dev.installation_date || dev.purchase_date;
        if (baseDateStr) {
          const d = new Date(baseDateStr);
          if (!isNaN(d.getTime())) {
            d.setFullYear(d.getFullYear() + 1);
            expDateStr = d.toISOString().split('T')[0];
          }
        }
      }

      if (!expDateStr) {
        expDateStr = new Date(now.getTime() + 180 * 86400 * 1000).toISOString().split('T')[0];
      }

      const expDate = new Date(expDateStr);
      const daysRemaining = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

      const item = {
        ...dev,
        sim_operator: carrier,
        sim_expiry_date: expDateStr,
        days_remaining: daysRemaining
      };

      if (daysRemaining < 0) {
        item.status_tag = 'EXPIRED';
        result.expired.push(item);
      } else if (daysRemaining <= 30) {
        item.status_tag = 'EXPIRING_SOON';
        result.expiring_soon.push(item);
      } else {
        item.status_tag = 'ACTIVE';
        result.active.push(item);
      }
    });

    res.json({
      success: true,
      summary: {
        totalSims: devices.length,
        expiringSoonCount: result.expiring_soon.length,
        expiredCount: result.expired.length,
        activeCount: result.active.length
      },
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/:id/rma-update - Update RMA warranty lifecycle
router.post('/:id/rma-update', (req, res) => {
  const { id } = req.params;
  const { rma_status, rma_notes, rma_vendor_name, rma_replacement_imei, performed_by = 'Super Admin' } = req.body;

  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });

    const newStatus = rma_status === 'REPLACED' ? 'RETURNED' : (rma_status !== 'NONE' ? 'FAULTY' : device.current_status);
    const rmaDate = new Date().toISOString().split('T')[0];

    db.prepare(`
      UPDATE devices
      SET rma_status = ?,
          rma_notes = ?,
          rma_vendor_name = ?,
          rma_replacement_imei = ?,
          rma_date = ?,
          current_status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(rma_status || 'NONE', rma_notes || '', rma_vendor_name || '', rma_replacement_imei || '', rmaDate, newStatus, id);

    // Audit log in history
    db.prepare(`
      INSERT INTO device_history (device_id, imei_number, event_type, from_holder, to_holder, performed_by, remarks)
      VALUES (?, ?, 'STATUS_CHANGED', ?, ?, ?, ?)
    `).run(
      device.id,
      device.imei_number,
      device.current_holder_name,
      rma_status === 'SENT_TO_OEM' ? (rma_vendor_name || 'OEM Vendor') : device.current_holder_name,
      performed_by,
      `RMA Stage Updated: ${rma_status}. Notes: ${rma_notes || 'N/A'}${rma_replacement_imei ? ` | Replacement IMEI: ${rma_replacement_imei}` : ''}`
    );

    res.json({ success: true, message: `RMA status updated to ${rma_status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/bulk-sim-update - Bulk update SIM validity & carrier
router.post('/bulk-sim-update', (req, res) => {
  const { imeis, sim_operator, sim_expiry_date } = req.body;
  if (!Array.isArray(imeis) || imeis.length === 0) {
    return res.status(400).json({ success: false, error: 'No IMEI numbers provided' });
  }

  try {
    const stmt = db.prepare(`
      UPDATE devices
      SET sim_operator = COALESCE(?, sim_operator),
          sim_expiry_date = COALESCE(?, sim_expiry_date),
          updated_at = CURRENT_TIMESTAMP
      WHERE imei_number = ?
    `);

    const updateMany = db.transaction((list) => {
      for (const imei of list) {
        stmt.run(sim_operator || null, sim_expiry_date || null, String(imei).trim());
      }
    });

    updateMany(imeis);
    res.json({ success: true, message: `Updated SIM details for ${imeis.length} devices.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single device by IMEI with complete journey / audit history timeline
router.get('/:imei', (req, res) => {
  const { imei } = req.params;
  try {
    const device = db.prepare(`
      SELECT d.*, dt.name as device_type_name, dt.category as device_type_category,
             pb.upload_date, pb.source_file, pb.uploaded_by as batch_uploader
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      LEFT JOIN purchase_batches pb ON d.purchase_batch_id = pb.id
      WHERE d.imei_number = ?
    `).get(imei);

    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const history = db.prepare(`
      SELECT * FROM device_history
      WHERE device_id = ? OR imei_number = ?
      ORDER BY event_date DESC
    `).all(device.id, imei);

    let installation = null;
    try {
      installation = db.prepare(`
        SELECT i.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
        FROM installations i
        LEFT JOIN customers c ON i.customer_id = c.id
        WHERE i.device_id = ? OR i.imei_number = ?
        ORDER BY i.id DESC LIMIT 1
      `).get(device.id, imei);
    } catch (e) {
      installation = null;
    }

    res.json({
      success: true,
      data: {
        ...device,
        additional_attributes: JSON.parse(device.additional_attributes || '{}'),
        journey_history: history,
        history: history,
        installation: installation || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update device record details
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { imei_number, sim_number, vendor_name, purchase_price, current_status, current_holder_name, additional_attributes } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const newImei = imei_number ? String(imei_number).trim() : existing.imei_number;
    const newSim = sim_number !== undefined ? (sim_number ? String(sim_number).trim() : null) : existing.sim_number;
    const newVendor = vendor_name !== undefined ? String(vendor_name).trim() : existing.vendor_name;
    const newPrice = purchase_price !== undefined ? (purchase_price !== null ? parseFloat(purchase_price) : null) : existing.purchase_price;
    const newStatus = current_status !== undefined ? String(current_status).trim() : existing.current_status;
    const newHolder = current_holder_name !== undefined ? String(current_holder_name).trim() : existing.current_holder_name;

    let newAttrsStr = existing.additional_attributes;
    if (additional_attributes !== undefined) {
      let parsedAttrs = typeof additional_attributes === 'object' ? { ...additional_attributes } : JSON.parse(additional_attributes || '{}');
      
      // Auto-normalize any Excel serial date numbers to readable DD-MM-YYYY format
      Object.keys(parsedAttrs).forEach(k => {
        if (/date|month|validity/i.test(k) && parsedAttrs[k] !== undefined && parsedAttrs[k] !== null) {
          const val = parsedAttrs[k];
          const num = Number(val);
          if (!isNaN(num) && num > 30000 && num < 65000) {
            try {
              const d = new Date(Math.round((num - 25569) * 86400 * 1000));
              let day = d.getUTCDate();
              let month = d.getUTCMonth() + 1;
              const year = d.getUTCFullYear();
              parsedAttrs[k] = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
            } catch {}
          }
        }
      });

      newAttrsStr = JSON.stringify(parsedAttrs);
    }

    db.prepare(`
      UPDATE devices
      SET imei_number = ?,
          sim_number = ?,
          vendor_name = ?,
          purchase_price = ?,
          current_status = ?,
          current_holder_name = ?,
          additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newImei, newSim, newVendor, newPrice, newStatus, newHolder, newAttrsStr, id);

    // Track field changes for audit
    const changes = [];
    if (newImei !== existing.imei_number) changes.push(`IMEI: ${existing.imei_number} → ${newImei}`);
    if (newSim !== existing.sim_number) changes.push(`SIM: ${existing.sim_number || 'None'} → ${newSim || 'None'}`);
    if (newVendor !== existing.vendor_name) changes.push(`Vendor: ${existing.vendor_name} → ${newVendor}`);
    if (newPrice !== existing.purchase_price) changes.push(`Price: ${existing.purchase_price ?? 'None'} → ${newPrice ?? 'None'}`);
    if (newStatus !== existing.current_status) changes.push(`Status: ${existing.current_status} → ${newStatus}`);
    if (newHolder !== existing.current_holder_name) changes.push(`Holder: ${existing.current_holder_name} → ${newHolder}`);
    
    if (newAttrsStr !== existing.additional_attributes) {
      let oldAttrs = {};
      let nextAttrs = {};
      try { oldAttrs = JSON.parse(existing.additional_attributes || '{}'); } catch {}
      try { nextAttrs = typeof additional_attributes === 'object' ? additional_attributes : JSON.parse(additional_attributes || '{}'); } catch {}

      const allKeys = Array.from(new Set([...Object.keys(oldAttrs), ...Object.keys(nextAttrs)]));
      allKeys.forEach(k => {
        const oldVal = oldAttrs[k] !== undefined && oldAttrs[k] !== null ? String(oldAttrs[k]).trim() : '';
        const newVal = nextAttrs[k] !== undefined && nextAttrs[k] !== null ? String(nextAttrs[k]).trim() : '';
        if (oldVal !== newVal) {
          changes.push(`${k}: "${oldVal || 'empty'}" → "${newVal || 'empty'}"`);
        }
      });
    }

    const remarksText = changes.length > 0 ? changes.join('; ') : 'Record details updated';

    // Insert history record for this update
    db.prepare(`
      INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
      VALUES (?, ?, 'STATUS_CHANGED', datetime('now'), ?, ?, ?, ?)
    `).run(id, newImei, existing.current_holder_name, newHolder, req.body.performed_by || 'Admin', remarksText);

    const updated = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    res.json({
      success: true,
      data: {
        ...updated,
        additional_attributes: JSON.parse(updated.additional_attributes || '{}')
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH update payment status & mode in 1 click
router.patch('/:id/quick-payment', (req, res) => {
  const { id } = req.params;
  const { payment_status, payment_mode, amount_received, performed_by } = req.body;

  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    let attrs = {};
    try { attrs = JSON.parse(device.additional_attributes || '{}'); } catch {}

    const isPaid = String(payment_status || '').toUpperCase() === 'RECEIVED';
    attrs['AMOUNT RECEIVED'] = isPaid ? 'RECEIVED' : 'PENDING';
    attrs['PAYMENT STATUS'] = isPaid ? 'RECEIVED' : 'PENDING';

    if (isPaid) {
      if (payment_mode) attrs['AMOUNT RECEIVED BY'] = String(payment_mode).trim();
      if (amount_received !== undefined && amount_received !== null && !isNaN(Number(amount_received))) {
        attrs['COST'] = Number(amount_received);
        attrs['TOTAL COST'] = Number(amount_received);
      }
    } else {
      delete attrs['AMOUNT RECEIVED BY'];
    }

    const updatedAttrsStr = JSON.stringify(attrs);

    db.prepare(`
      UPDATE devices
      SET additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(updatedAttrsStr, id);

    // Record History Audit
    const remarks = isPaid
      ? `Payment marked RECEIVED${payment_mode ? ` via ${payment_mode}` : ''}`
      : 'Payment marked PENDING';

    db.prepare(`
      INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
      VALUES (?, ?, 'PAYMENT_UPDATED', datetime('now'), ?, ?, ?, ?)
    `).run(id, device.imei_number, device.current_holder_name || 'Dealer/Customer', device.current_holder_name || 'Dealer/Customer', performed_by || 'Staff', remarks);

    res.json({
      success: true,
      message: 'Payment updated successfully',
      data: {
        id: device.id,
        imei_number: device.imei_number,
        payment_status: isPaid ? 'RECEIVED' : 'PENDING',
        payment_mode: attrs['AMOUNT RECEIVED BY'] || '',
        additional_attributes: attrs
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update device status manually (e.g. mark FAULTY, RETURNED, IN_WAREHOUSE)
router.put('/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, remarks, performed_by } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, error: 'Status is required' });
  }

  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const oldStatus = device.current_status;
    const oldHolder = device.current_holder_name;

    let newHolderType = device.current_holder_type;
    let newHolderId = device.current_holder_id;
    let newHolderName = device.current_holder_name;

    if (status === 'IN_WAREHOUSE' || status === 'FAULTY' || status === 'RMA') {
      newHolderType = 'WAREHOUSE';
      newHolderId = 1;
      newHolderName = status === 'FAULTY' ? 'Central Warehouse (Faulty Bay)' : 'Central Warehouse';
    }

    // Update Device
    db.prepare(`
      UPDATE devices
      SET current_status = ?,
          current_holder_type = ?,
          current_holder_id = ?,
          current_holder_name = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, newHolderType, newHolderId, newHolderName, id);

    // Record History Audit
    db.prepare(`
      INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
      VALUES (?, ?, 'STATUS_CHANGED', datetime('now'), ?, ?, ?, ?)
    `).run(id, device.imei_number, `${oldHolder} (${oldStatus})`, `${newHolderName} (${status})`, performed_by || 'Admin', remarks || `Status changed from ${oldStatus} to ${status}`);

    const updated = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/bulk-transfer - Batch transfer stock place for selected devices
router.post('/bulk-transfer', (req, res) => {
  const { ids, imeis, stock_place, stock_place_date, performed_by, remarks } = req.body;

  if ((!ids || ids.length === 0) && (!imeis || imeis.length === 0)) {
    return res.status(400).json({ success: false, error: 'No devices selected for transfer' });
  }
  if (!stock_place) {
    return res.status(400).json({ success: false, error: 'Target stock place / branch is required' });
  }

  try {
    const targetPlace = String(stock_place).trim();
    const targetDate = stock_place_date ? String(stock_place_date).trim() : new Date().toISOString().split('T')[0];
    const who = performed_by || 'Operations Team';

    let devicesToUpdate = [];
    if (ids && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      devicesToUpdate = db.prepare(`SELECT * FROM devices WHERE id IN (${placeholders})`).all(...ids);
    } else if (imeis && imeis.length > 0) {
      const placeholders = imeis.map(() => '?').join(',');
      devicesToUpdate = db.prepare(`SELECT * FROM devices WHERE imei_number IN (${placeholders})`).all(...imeis);
    }

    const updateStmt = db.prepare(`
      UPDATE devices
      SET current_holder_name = ?,
          current_status = ?,
          additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const insertHistoryStmt = db.prepare(`
      INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
      VALUES (?, ?, 'STOCK_TRANSFERRED', datetime('now'), ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const dev of devicesToUpdate) {
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

        const prevPlace = dev.current_holder_name || attrs['STOCK PLACE'] || 'Unassigned Stock';

        // Update place and place date in additional_attributes
        attrs['STOCK PLACE'] = targetPlace;
        attrs['STOCK PLACE DATE'] = targetDate;
        if (attrs['Stock Place'] !== undefined) attrs['Stock Place'] = targetPlace;
        if (attrs['Stock Place Date'] !== undefined) attrs['Stock Place Date'] = targetDate;

        const isCentral = /unassigned|warehouse|office/i.test(targetPlace);
        const newStatus = isCentral ? 'IN_WAREHOUSE' : 'WITH_DEALER';

        updateStmt.run(targetPlace, newStatus, JSON.stringify(attrs), dev.id);

        insertHistoryStmt.run(
          dev.id,
          dev.imei_number,
          prevPlace,
          targetPlace,
          who,
          remarks || `Transferred from "${prevPlace}" to "${targetPlace}" on ${targetDate}`
        );
      }
    })();

    res.json({
      success: true,
      message: `Successfully transferred ${devicesToUpdate.length} devices to ${targetPlace}`,
      count: devicesToUpdate.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE single device record (Super Admin permission)
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device record not found' });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM device_history WHERE device_id = ? OR imei_number = ?').run(id, device.imei_number);
      db.prepare('DELETE FROM dispatch_items WHERE device_id = ? OR imei_number = ?').run(id, device.imei_number);
      db.prepare('DELETE FROM installations WHERE device_id = ? OR imei_number = ?').run(id, device.imei_number);
      db.prepare('DELETE FROM reminders WHERE device_id = ? OR imei_number = ?').run(id, device.imei_number);
      db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    })();

    res.json({ success: true, message: `Device '${device.imei_number}' deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/bulk-delete - Delete multiple selected devices, specific device type list, specific purchase batch list, or clear complete inventory list
router.post('/bulk-delete', (req, res) => {
  const { device_ids, device_type_id, purchase_batch_id, clear_all } = req.body;

  try {
    const transaction = db.transaction(() => {
      let deletedCount = 0;
      if (clear_all) {
        const allDevs = db.prepare('SELECT id FROM devices').all();
        deletedCount = allDevs.length;
        db.prepare('DELETE FROM device_history').run();
        db.prepare('DELETE FROM dispatch_items').run();
        db.prepare('DELETE FROM installations').run();
        db.prepare('DELETE FROM reminders').run();
        db.prepare('DELETE FROM devices').run();
        db.prepare('DELETE FROM purchase_batches').run();
      } else if (purchase_batch_id) {
        const batchDevs = db.prepare('SELECT id, imei_number FROM devices WHERE purchase_batch_id = ?').all(purchase_batch_id);
        deletedCount = batchDevs.length;
        for (const dev of batchDevs) {
          db.prepare('DELETE FROM device_history WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
          db.prepare('DELETE FROM dispatch_items WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
          db.prepare('DELETE FROM installations WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
          db.prepare('DELETE FROM reminders WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
        }
        db.prepare('DELETE FROM devices WHERE purchase_batch_id = ?').run(purchase_batch_id);
        db.prepare('DELETE FROM purchase_batches WHERE id = ?').run(purchase_batch_id);
      } else if (device_type_id) {
        const typeDevs = db.prepare('SELECT id, imei_number FROM devices WHERE device_type_id = ?').all(device_type_id);
        deletedCount = typeDevs.length;
        for (const dev of typeDevs) {
          db.prepare('DELETE FROM device_history WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
          db.prepare('DELETE FROM dispatch_items WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
          db.prepare('DELETE FROM installations WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
          db.prepare('DELETE FROM reminders WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
        }
        db.prepare('DELETE FROM devices WHERE device_type_id = ?').run(device_type_id);
        db.prepare('DELETE FROM purchase_batches WHERE device_type_id = ?').run(device_type_id);
      } else if (Array.isArray(device_ids) && device_ids.length > 0) {
        for (const id of device_ids) {
          const dev = db.prepare('SELECT id, imei_number FROM devices WHERE id = ?').get(id);
          if (dev) {
            db.prepare('DELETE FROM device_history WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
            db.prepare('DELETE FROM dispatch_items WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
            db.prepare('DELETE FROM installations WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
            db.prepare('DELETE FROM reminders WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
            db.prepare('DELETE FROM devices WHERE id = ?').run(dev.id);
            deletedCount++;
          }
        }
      }
      return deletedCount;
    });

    const count = transaction();
    res.json({ success: true, count, message: `Successfully deleted ${count} device record(s)` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/bulk-assign-dealer - Bulk assign scanned IMEIs to a Dealer / Stock Place with date & history
router.post('/bulk-assign-dealer', (req, res) => {
  const { imeis, stock_place, stock_place_date, status = 'WITH_DEALER', performed_by = 'Admin', remarks = '', device_type_id } = req.body;

  if (!Array.isArray(imeis) || imeis.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one IMEI is required' });
  }
  if (!stock_place || !stock_place.trim()) {
    return res.status(400).json({ success: false, error: 'Dealer / Stock Place name is required' });
  }

  const cleanPlace = stock_place.trim();
  const cleanDate = stock_place_date ? String(stock_place_date).trim() : new Date().toISOString().split('T')[0];

  try {
    const updatedDevices = [];
    const missingImeis = [];

    // Resolve intelligent default device type (prioritize VAMO/VAMOSYS/TRACKNOW/VOLTY instead of BSTPL)
    let defaultTypeId = device_type_id ? parseInt(device_type_id) : null;
    if (!defaultTypeId) {
      const preferredType = db.prepare(`
        SELECT id FROM device_types 
        WHERE name NOT IN ('BSTPL')
        ORDER BY (CASE WHEN name LIKE '%VAMO%' THEN 1 WHEN name LIKE '%TRACK%' THEN 2 WHEN name LIKE '%VOLTY%' THEN 3 ELSE 4 END), id DESC 
        LIMIT 1
      `).get();
      defaultTypeId = preferredType ? preferredType.id : 1;
    }

    const transaction = db.transaction(() => {
      for (const rawImei of imeis) {
        const imei = String(rawImei).trim();
        if (!imei) continue;

        let dev = db.prepare('SELECT * FROM devices WHERE imei_number = ?').get(imei);
        
        if (!dev) {
          // If not in database yet, auto-create the device record with the assigned Stock Place & Date
          const initAttrs = {
            'STOCK PLACE': cleanPlace,
            'STOCK PLACE DATE': cleanDate
          };
          const info = db.prepare(`
            INSERT INTO devices (imei_number, device_type_id, purchase_date, vendor_name, current_status, current_holder_type, current_holder_name, additional_attributes)
            VALUES (?, ?, ?, 'Direct Entry', ?, 'DEALER', ?, ?)
          `).run(imei, defaultTypeId, cleanDate, status, cleanPlace, JSON.stringify(initAttrs));

          const newId = info.lastInsertRowid;

          db.prepare(`
            INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
            VALUES (?, ?, 'DISPATCHED', datetime('now'), 'Unassigned', ?, ?, ?)
          `).run(newId, imei, cleanPlace, performed_by, `Device added & dispatched to ${cleanPlace} on ${cleanDate}`);

          updatedDevices.push({
            id: newId,
            imei_number: imei,
            stock_place: cleanPlace,
            stock_place_date: cleanDate
          });
          continue;
        }

        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

        // Preserve case or update existing key
        const placeKey = Object.keys(attrs).find(k => /stock.*place/i.test(k)) || 'STOCK PLACE';
        const dateKey = Object.keys(attrs).find(k => /stock.*place.*date|date/i.test(k)) || 'STOCK PLACE DATE';

        attrs[placeKey] = cleanPlace;
        attrs[dateKey] = cleanDate;

        const attrsJson = JSON.stringify(attrs);

        db.prepare(`
          UPDATE devices
          SET current_status = ?,
              current_holder_type = 'DEALER',
              current_holder_name = ?,
              additional_attributes = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(status, cleanPlace, attrsJson, dev.id);

        // Audit Trail in device_history
        const historyRemarks = remarks
          ? `${remarks} | Assigned to ${cleanPlace} on ${cleanDate}`
          : `Dispatched & Allocated to ${cleanPlace} on ${cleanDate}`;

        db.prepare(`
          INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
          VALUES (?, ?, 'DISPATCHED', datetime('now'), ?, ?, ?, ?)
        `).run(dev.id, imei, dev.current_holder_name || 'Warehouse', cleanPlace, performed_by, historyRemarks);

        updatedDevices.push({
          id: dev.id,
          imei_number: imei,
          stock_place: cleanPlace,
          stock_place_date: cleanDate
        });
      }
    });

    transaction();

    res.json({
      success: true,
      updated_count: updatedDevices.length,
      missing_count: missingImeis.length,
      updated_devices: updatedDevices,
      missing_imeis: missingImeis,
      message: `Successfully allocated ${updatedDevices.length} device(s) to "${cleanPlace}" on ${cleanDate}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
