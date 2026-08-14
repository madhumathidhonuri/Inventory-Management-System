const express = require('express');
const router = express.Router();
const db = require('../db/database');

// POST /api/installations - Workflow C: Single Action Installation + Auto Customer CRM lookup/creation
router.post('/', (req, res) => {
  const {
    imei_number,
    customer_phone,
    customer_name,
    alternate_phone,
    customer_email,
    customer_address,
    customer_type,
    vehicle_number,
    vehicle_type,
    sale_price,
    installed_by,
    sales_manager,
    sales_person,
    installation_location,
    installation_date,
    remarks,
    warranty_end_date
  } = req.body;

  if (!imei_number || !customer_phone || !customer_name || !vehicle_number) {
    return res.status(400).json({
      success: false,
      error: 'IMEI, Customer Phone, Customer Name, and Vehicle Number are required'
    });
  }

  const cleanImei = String(imei_number).trim();
  const cleanPhone = String(customer_phone).trim();
  const cleanVehicle = String(vehicle_number).trim().toUpperCase();

  const transaction = db.transaction(() => {
    // 1. Verify device exists and is available (IN_WAREHOUSE or WITH_DEALER)
    const dev = db.prepare('SELECT * FROM devices WHERE imei_number = ?').get(cleanImei);
    if (!dev) {
      throw new Error(`Device with IMEI '${cleanImei}' not found in inventory`);
    }

    if (dev.current_status === 'INSTALLED') {
      throw new Error(`Device with IMEI '${cleanImei}' is already marked INSTALLED in vehicle`);
    }

    // 2. Customer Lookup & Auto Deduplication
    let customer = db.prepare('SELECT * FROM customers WHERE phone_number = ?').get(cleanPhone);
    let customerId;

    if (customer) {
      customerId = customer.id;
      // Update customer info if additional details provided
      db.prepare(`
        UPDATE customers
        SET name = COALESCE(?, name),
            email = COALESCE(?, email),
            address = COALESCE(?, address)
        WHERE id = ?
      `).run(customer_name, customer_email, customer_address, customerId);
    } else {
      const custResult = db.prepare(`
        INSERT INTO customers (name, phone_number, alternate_phone, email, address, customer_type, source)
        VALUES (?, ?, ?, ?, ?, ?, 'Installer App Entry')
      `).run(
        customer_name,
        cleanPhone,
        alternate_phone || null,
        customer_email || null,
        customer_address || null,
        customer_type || 'Individual'
      );
      customerId = custResult.lastInsertRowid;
    }

    // 3. Create Installation Record
    const instDate = installation_date || new Date().toISOString().split('T')[0];
    const instResult = db.prepare(`
      INSERT INTO installations (
        device_id, imei_number, customer_id, installation_date, installed_by,
        sales_manager, sales_person, customer_name, customer_contact, vehicle_number,
        vehicle_type, sale_price, installation_location, remarks, warranty_end_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dev.id,
      cleanImei,
      customerId,
      instDate,
      installed_by || 'Field Installer',
      sales_manager || 'Sales Team',
      sales_person || installed_by || 'Sales Team',
      customer_name,
      cleanPhone,
      cleanVehicle,
      vehicle_type || 'Car',
      sale_price ? parseFloat(sale_price) : 0,
      installation_location || 'Field Site',
      remarks || '',
      warranty_end_date || null
    );

    const installationId = instResult.lastInsertRowid;

    // 4. Update Device Status & Holder
    const prevHolder = dev.current_holder_name || 'Central Warehouse';
    db.prepare(`
      UPDATE devices
      SET current_status = 'INSTALLED',
          current_holder_type = 'CUSTOMER',
          current_holder_id = ?,
          current_holder_name = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(customerId, `${customer_name} (${cleanVehicle})`, dev.id);

    // 5. Update Dispatch item status if device was dispatched
    db.prepare(`
      UPDATE dispatch_items SET status = 'INSTALLED' WHERE imei_number = ?
    `).run(cleanImei);

    // 6. Log Device Audit History
    db.prepare(`
      INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
      VALUES (?, ?, 'INSTALLED', datetime('now'), ?, ?, ?, ?)
    `).run(
      dev.id,
      cleanImei,
      prevHolder,
      `Customer: ${customer_name} (${cleanVehicle})`,
      installed_by || 'Installer',
      `Installed in vehicle ${cleanVehicle} for customer ${customer_name}`
    );

    // 7. Auto-create warranty reminder if end date set
    if (warranty_end_date) {
      db.prepare(`
        INSERT INTO reminders (customer_id, device_id, imei_number, type, due_date, status, remarks)
        VALUES (?, ?, ?, 'WARRANTY_EXPIRY', ?, 'PENDING', ?)
      `).run(customerId, dev.id, cleanImei, warranty_end_date, `Warranty expiry for vehicle ${cleanVehicle}`);
    }

    return { installationId, customerId, imei: cleanImei, vehicle: cleanVehicle };
  });

  try {
    const result = transaction();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/installations - List installations
router.get('/', (req, res) => {
  try {
    const { search, installer, customer_id, date_from, date_to } = req.query;
    let query = `
      SELECT i.*, d.sim_number, dt.name as device_type_name
      FROM installations i
      JOIN devices d ON i.device_id = d.id
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (i.customer_name LIKE ? OR i.customer_contact LIKE ? OR i.vehicle_number LIKE ? OR i.imei_number LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (installer) {
      query += ` AND i.installed_by = ?`;
      params.push(installer);
    }

    if (customer_id) {
      query += ` AND i.customer_id = ?`;
      params.push(customer_id);
    }

    if (date_from) {
      query += ` AND i.installation_date >= ?`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND i.installation_date <= ?`;
      params.push(date_to);
    }

    query += ` ORDER BY i.installation_date DESC, i.id DESC`;

    const list = db.prepare(query).all(...params);
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
