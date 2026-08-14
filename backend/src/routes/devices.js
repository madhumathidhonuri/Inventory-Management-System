const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET devices list with search & filter
router.get('/', (req, res) => {
  try {
    const { status, device_type_id, purchase_batch_id, holder_type, holder_name, search } = req.query;
    let query = `
      SELECT d.*, dt.name as device_type_name, dt.category as device_type_category
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ` AND d.current_status = ?`;
      params.push(status);
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
    if (holder_name) {
      query += ` AND d.current_holder_name LIKE ?`;
      params.push(`%${holder_name}%`);
    }
    if (search) {
      query += ` AND (d.imei_number LIKE ? OR d.sim_number LIKE ? OR d.vendor_name LIKE ? OR d.current_holder_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
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

// GET single device by IMEI with complete journey / audit history timeline
router.get('/:imei', (req, res) => {
  const { imei } = req.params;
  try {
    const device = db.prepare(`
      SELECT d.*, dt.name as device_type_name, dt.category as device_type_category
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE d.imei_number = ?
    `).get(imei);

    if (!device) {
      return res.status(404).json({ success: false, error: `Device with IMEI '${imei}' not found` });
    }

    // Parse attributes
    device.additional_attributes = JSON.parse(device.additional_attributes || '{}');

    // Fetch chronological history
    const history = db.prepare(`
      SELECT * FROM device_history
      WHERE device_id = ? OR imei_number = ?
      ORDER BY event_date ASC
    `).all(device.id, imei);

    // Fetch installation detail if installed
    let installation = null;
    if (device.current_status === 'INSTALLED') {
      installation = db.prepare(`
        SELECT i.*, c.phone_number as customer_phone, c.email as customer_email, c.address as customer_address
        FROM installations i
        JOIN customers c ON i.customer_id = c.id
        WHERE i.device_id = ?
        ORDER BY i.created_at DESC
        LIMIT 1
      `).get(device.id);
    }

    res.json({
      success: true,
      data: {
        device,
        history,
        installation
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update device details (IMEI, SIM, Vendor, Price, additional_attributes)
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { imei_number, sim_number, vendor_name, purchase_price, additional_attributes } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const newImei = imei_number ? String(imei_number).trim() : existing.imei_number;
    const newSim = sim_number !== undefined ? (sim_number ? String(sim_number).trim() : null) : existing.sim_number;
    const newVendor = vendor_name !== undefined ? String(vendor_name).trim() : existing.vendor_name;
    const newPrice = purchase_price !== undefined ? (purchase_price !== null ? parseFloat(purchase_price) : null) : existing.purchase_price;

    let newAttrsStr = existing.additional_attributes;
    if (additional_attributes !== undefined) {
      newAttrsStr = typeof additional_attributes === 'object' ? JSON.stringify(additional_attributes) : additional_attributes;
    }

    db.prepare(`
      UPDATE devices
      SET imei_number = ?,
          sim_number = ?,
          vendor_name = ?,
          purchase_price = ?,
          additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newImei, newSim, newVendor, newPrice, newAttrsStr, id);

    // Track field changes for audit
    const changes = [];
    if (newImei !== existing.imei_number) changes.push(`IMEI: ${existing.imei_number} → ${newImei}`);
    if (newSim !== existing.sim_number) changes.push(`SIM: ${existing.sim_number || 'None'} → ${newSim || 'None'}`);
    if (newVendor !== existing.vendor_name) changes.push(`Vendor: ${existing.vendor_name} → ${newVendor}`);
    if (newPrice !== existing.purchase_price) changes.push(`Price: ${existing.purchase_price ?? 'None'} → ${newPrice ?? 'None'}`);
    if (newAttrsStr !== existing.additional_attributes) changes.push(`Attributes updated`);

    const remarksText = changes.length > 0 ? changes.join('; ') : 'Record details updated';

    // Insert history record for this update
    db.prepare(`
      INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
      VALUES (?, ?, 'STATUS_CHANGED', datetime('now'), ?, ?, ?, ?)
    `).run(id, newImei, existing.current_holder_name, existing.current_holder_name, req.body.performed_by || 'Admin', remarksText);

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

module.exports = router;
