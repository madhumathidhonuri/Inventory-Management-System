const express = require('express');
const router = express.Router();
const db = require('../db/database');

function getDefaultTemplateColumns(category = '', name = '') {
  const cat = String(category).toLowerCase();
  const n = String(name).toLowerCase();
  if (cat.includes('fuel') || n.includes('fuel')) {
    return ['IMEI / Serial Number', 'SIM Number', 'Rod Length (mm)', 'Calibration Code', 'Price', 'Vendor', 'Invoice No'];
  }
  if (cat.includes('obd') || n.includes('obd')) {
    return ['IMEI Number', 'SIM Number', 'Protocol', 'Price', 'Vendor', 'Invoice No'];
  }
  if (cat.includes('accessory') || n.includes('accessory') || cat.includes('sensor')) {
    return ['Serial Number', 'Model Code', 'Price', 'Vendor', 'Remarks'];
  }
  // Default GPS Tracker
  return ['IMEI Number', 'SIM Number', 'Price', 'Vendor', 'Warranty Months', 'Invoice No'];
}

function parseTemplateColumns(raw, category = '', name = '') {
  try {
    if (!raw) return getDefaultTemplateColumns(category, name);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return getDefaultTemplateColumns(category, name);
  } catch {
    return getDefaultTemplateColumns(category, name);
  }
}

// GET all device types
router.get('/', (req, res) => {
  try {
    const types = db.prepare('SELECT * FROM device_types ORDER BY id ASC').all();
    const formatted = types.map(t => ({
      ...t,
      custom_fields: JSON.parse(t.custom_fields || '{}'),
      template_columns: parseTemplateColumns(t.template_columns, t.category, t.name)
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST new device type
router.post('/', (req, res) => {
  const { name, category, custom_fields, template_columns } = req.body;
  if (!name || !category) {
    return res.status(400).json({ success: false, error: 'Name and category are required' });
  }
  try {
    const fieldsStr = typeof custom_fields === 'object' ? JSON.stringify(custom_fields) : (custom_fields || '{}');
    const cols = Array.isArray(template_columns) ? template_columns : getDefaultTemplateColumns(category, name);
    const colsStr = JSON.stringify(cols);
    const stmt = db.prepare('INSERT INTO device_types (name, category, custom_fields, template_columns) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name, category, fieldsStr, colsStr);
    const created = db.prepare('SELECT * FROM device_types WHERE id = ?').get(result.lastInsertRowid);
    res.json({
      success: true,
      data: {
        ...created,
        custom_fields: JSON.parse(created.custom_fields || '{}'),
        template_columns: parseTemplateColumns(created.template_columns, created.category, created.name)
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT update device type
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, custom_fields, template_columns, active } = req.body;
  try {
    const fieldsStr = typeof custom_fields === 'object' ? JSON.stringify(custom_fields) : custom_fields;
    const colsStr = Array.isArray(template_columns) ? JSON.stringify(template_columns) : (typeof template_columns === 'string' ? template_columns : undefined);
    
    const stmt = db.prepare(`
      UPDATE device_types
      SET name = COALESCE(?, name),
          category = COALESCE(?, category),
          custom_fields = COALESCE(?, custom_fields),
          template_columns = COALESCE(?, template_columns),
          active = COALESCE(?, active)
      WHERE id = ?
    `);
    stmt.run(name, category, fieldsStr, colsStr, active, id);
    const updated = db.prepare('SELECT * FROM device_types WHERE id = ?').get(id);
    res.json({
      success: true,
      data: {
        ...updated,
        custom_fields: JSON.parse(updated.custom_fields || '[]'),
        template_columns: parseTemplateColumns(updated.template_columns, updated.category, updated.name)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to normalize custom_fields to an array of field names
function parseCustomFields(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object' && parsed !== null) return Object.keys(parsed);
    return [];
  } catch {
    return [];
  }
}

// POST /api/device-types/columns/add - Add custom column to device type schema
router.post('/columns/add', (req, res) => {
  const { device_type_id, column_name } = req.body;
  if (!column_name || !column_name.trim()) {
    return res.status(400).json({ success: false, error: 'Column name is required' });
  }
  const name = column_name.trim();
  try {
    if (device_type_id && device_type_id !== 'ALL') {
      const dt = db.prepare('SELECT * FROM device_types WHERE id = ? OR LOWER(name) = LOWER(?)').get(device_type_id, String(device_type_id));
      if (!dt) return res.status(404).json({ success: false, error: 'Device type not found' });

      let fields = parseCustomFields(dt.custom_fields);
      if (!fields.includes(name)) {
        fields.push(name);
        db.prepare('UPDATE device_types SET custom_fields = ? WHERE id = ?').run(JSON.stringify(fields), dt.id);
      }
      res.json({ success: true, custom_fields: fields, message: `Column "${name}" added to ${dt.name}` });
    } else {
      // Add to ALL device types
      const types = db.prepare('SELECT * FROM device_types').all();
      types.forEach(dt => {
        let fields = parseCustomFields(dt.custom_fields);
        if (!fields.includes(name)) {
          fields.push(name);
          db.prepare('UPDATE device_types SET custom_fields = ? WHERE id = ?').run(JSON.stringify(fields), dt.id);
        }
      });
      res.json({ success: true, message: `Column "${name}" added to all device lists` });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/device-types/columns/rename - Rename custom column key across device type schema and devices
router.post('/columns/rename', (req, res) => {
  const { device_type_id, old_name, new_name } = req.body;
  if (!device_type_id || !old_name || !new_name || !new_name.trim()) {
    return res.status(400).json({ success: false, error: 'Device type ID, old name, and new name are required' });
  }
  const oldKey = old_name.trim();
  const newKey = new_name.trim();

  try {
    const transaction = db.transaction(() => {
      if (device_type_id === 'all') {
        const types = db.prepare('SELECT * FROM device_types').all();
        for (const dt of types) {
          let fields = parseCustomFields(dt.custom_fields);
          if (fields.includes(oldKey)) {
            fields = fields.map(f => f === oldKey ? newKey : f);
            db.prepare('UPDATE device_types SET custom_fields = ? WHERE id = ?').run(JSON.stringify(fields), dt.id);
          }
        }

        const devices = db.prepare('SELECT id, additional_attributes FROM devices').all();
        const updateStmt = db.prepare('UPDATE devices SET additional_attributes = ? WHERE id = ?');

        for (const dev of devices) {
          let attrs = {};
          try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
          if (Object.prototype.hasOwnProperty.call(attrs, oldKey)) {
            attrs[newKey] = attrs[oldKey];
            delete attrs[oldKey];
            updateStmt.run(JSON.stringify(attrs), dev.id);
          }
        }
        return [];
      } else {
        const dt = db.prepare('SELECT * FROM device_types WHERE id = ?').get(device_type_id);
        if (!dt) throw new Error('Device type not found');

        let fields = parseCustomFields(dt.custom_fields);
        fields = fields.map(f => f === oldKey ? newKey : f);
        db.prepare('UPDATE device_types SET custom_fields = ? WHERE id = ?').run(JSON.stringify(fields), device_type_id);

        // Update all devices of this device type
        const devices = db.prepare('SELECT id, additional_attributes FROM devices WHERE device_type_id = ?').all(device_type_id);
        const updateStmt = db.prepare('UPDATE devices SET additional_attributes = ? WHERE id = ?');

        for (const dev of devices) {
          let attrs = {};
          try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
          if (Object.prototype.hasOwnProperty.call(attrs, oldKey)) {
            attrs[newKey] = attrs[oldKey];
            delete attrs[oldKey];
            updateStmt.run(JSON.stringify(attrs), dev.id);
          }
        }
        return fields;
      }
    });

    const updatedFields = transaction();
    res.json({ success: true, custom_fields: updatedFields });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/device-types/columns/delete - Delete custom column from device type schema and devices
router.post('/columns/delete', (req, res) => {
  const { device_type_id, column_name } = req.body;
  if (!device_type_id || !column_name) {
    return res.status(400).json({ success: false, error: 'Device type ID and column name are required' });
  }
  const targetCol = column_name.trim();

  try {
    const transaction = db.transaction(() => {
      if (device_type_id === 'all') {
        const types = db.prepare('SELECT * FROM device_types').all();
        for (const dt of types) {
          let fields = parseCustomFields(dt.custom_fields);
          if (fields.includes(targetCol)) {
            fields = fields.filter(f => f !== targetCol);
            db.prepare('UPDATE device_types SET custom_fields = ? WHERE id = ?').run(JSON.stringify(fields), dt.id);
          }
        }

        const devices = db.prepare('SELECT id, additional_attributes FROM devices').all();
        const updateStmt = db.prepare('UPDATE devices SET additional_attributes = ? WHERE id = ?');

        for (const dev of devices) {
          let attrs = {};
          try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
          if (Object.prototype.hasOwnProperty.call(attrs, targetCol)) {
            delete attrs[targetCol];
            updateStmt.run(JSON.stringify(attrs), dev.id);
          }
        }
        return [];
      } else {
        const dt = db.prepare('SELECT * FROM device_types WHERE id = ?').get(device_type_id);
        if (!dt) throw new Error('Device type not found');

        let fields = parseCustomFields(dt.custom_fields);
        fields = fields.filter(f => f !== targetCol);
        db.prepare('UPDATE device_types SET custom_fields = ? WHERE id = ?').run(JSON.stringify(fields), device_type_id);

        // Update all devices of this device type
        const devices = db.prepare('SELECT id, additional_attributes FROM devices WHERE device_type_id = ?').all(device_type_id);
        const updateStmt = db.prepare('UPDATE devices SET additional_attributes = ? WHERE id = ?');

        for (const dev of devices) {
          let attrs = {};
          try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
          if (Object.prototype.hasOwnProperty.call(attrs, targetCol)) {
            delete attrs[targetCol];
            updateStmt.run(JSON.stringify(attrs), dev.id);
          }
        }
        return fields;
      }
    });

    const updatedFields = transaction();
    res.json({ success: true, custom_fields: updatedFields });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE device type
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const attachedDevices = db.prepare('SELECT count(*) as count FROM devices WHERE device_type_id = ?').get(id);
    if (attachedDevices && attachedDevices.count > 0) {
      return res.status(400).json({ success: false, error: `Cannot delete device type with ${attachedDevices.count} active device records attached.` });
    }
    db.prepare('DELETE FROM device_types WHERE id = ?').run(id);
    res.json({ success: true, message: 'Device type deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
