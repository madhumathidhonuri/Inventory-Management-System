const express = require('express');
const router = express.Router();
const db = require('../db/database');

// POST /api/installations - Single Action Installation + Auto Customer CRM lookup/creation
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
    payment_status,
    installed_by,
    sales_manager,
    sales_person,
    installation_location,
    installation_date,
    remarks,
    warranty_end_date,
    software_user_id,
    software_password
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
  const cleanSoftwareUser = software_user_id ? String(software_user_id).trim() : '';
  const cleanSoftwarePass = software_password ? String(software_password).trim() : '';
  const cleanPayStatus = payment_status ? String(payment_status).toUpperCase().trim() : (sale_price && parseFloat(sale_price) > 0 ? 'RECEIVED' : 'NOT RECEIVED');
  const instDate = installation_date ? String(installation_date).trim() : new Date().toISOString().split('T')[0];

  const transaction = db.transaction(() => {
    // 1. Verify device exists or auto-create if not uploaded yet
    let dev = db.prepare('SELECT * FROM devices WHERE imei_number = ?').get(cleanImei);
    if (!dev) {
      const defaultType = db.prepare('SELECT id FROM device_types LIMIT 1').get() || { id: 1 };
      const initAttrs = {
        'VEHICLE NUMBER': cleanVehicle,
        'CUSTOMER NAME': customer_name.trim(),
        'CUSTOMER PHONE NUMBER': cleanPhone,
        'INSTALLATION DATE': instDate
      };
      const info = db.prepare(`
        INSERT INTO devices (imei_number, device_type_id, purchase_date, vendor_name, current_status, current_holder_type, current_holder_name, additional_attributes)
        VALUES (?, ?, ?, 'Direct Entry', 'INSTALLED', 'CUSTOMER', ?, ?)
      `).run(cleanImei, defaultType.id, instDate, `${customer_name.trim()} (${cleanVehicle})`, JSON.stringify(initAttrs));

      dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
    }

    // 2. Customer Lookup & Auto Deduplication
    let customer = db.prepare('SELECT * FROM customers WHERE phone_number = ?').get(cleanPhone);
    let customerId;

    if (customer) {
      customerId = customer.id;
      // Update customer info if software credentials or additional details provided
      db.prepare(`
        UPDATE customers
        SET name = COALESCE(?, name),
            email = COALESCE(?, email),
            address = COALESCE(?, address),
            software_user_id = COALESCE(NULLIF(?, ''), software_user_id),
            software_password = COALESCE(NULLIF(?, ''), software_password)
        WHERE id = ?
      `).run(customer_name.trim(), customer_email || null, customer_address || null, cleanSoftwareUser, cleanSoftwarePass, customerId);
    } else {
      const custResult = db.prepare(`
        INSERT INTO customers (name, phone_number, alternate_phone, email, address, customer_type, source, software_user_id, software_password)
        VALUES (?, ?, ?, ?, ?, ?, 'Direct Entry', ?, ?)
      `).run(
        customer_name.trim(),
        cleanPhone,
        alternate_phone || null,
        customer_email || null,
        customer_address || null,
        customer_type || 'Individual',
        cleanSoftwareUser || null,
        cleanSoftwarePass || null
      );
      customerId = custResult.lastInsertRowid;
    }

    // 3. Create Installation Record
    const instResult = db.prepare(`
      INSERT INTO installations (
        device_id, imei_number, customer_id, installation_date, installed_by,
        sales_manager, sales_person, customer_name, customer_contact, vehicle_number,
        vehicle_type, sale_price, payment_status, installation_location, remarks, warranty_end_date,
        software_user_id, software_password
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dev.id,
      cleanImei,
      customerId,
      instDate,
      installed_by || 'Technician',
      sales_manager || 'Sales Team',
      sales_person || installed_by || 'Sales Team',
      customer_name.trim(),
      cleanPhone,
      cleanVehicle,
      vehicle_type || 'Commercial / Heavy',
      sale_price ? parseFloat(sale_price) : 0,
      cleanPayStatus,
      installation_location || 'Field Site',
      remarks || '',
      warranty_end_date || null,
      cleanSoftwareUser || null,
      cleanSoftwarePass || null
    );

    const installationId = instResult.lastInsertRowid;

    // 4. Update Device Status, Holder & Attributes
    let attrs = {};
    try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

    const vehKey = Object.keys(attrs).find(k => /vehicle|veh_no|reg_no/i.test(k)) || 'VEHICLE NUMBER';
    const custKey = Object.keys(attrs).find(k => /customer.*name|client.*name/i.test(k)) || 'CUSTOMER NAME';
    const phoneKey = Object.keys(attrs).find(k => /customer.*phone|mobile|contact/i.test(k)) || 'CUSTOMER PHONE NUMBER';
    const dateKey = Object.keys(attrs).find(k => /install.*date|installation/i.test(k)) || 'INSTALLATION DATE';
    const payKey = Object.keys(attrs).find(k => /amount.*received|payment/i.test(k)) || 'AMOUNT RECEIVED';

    attrs[vehKey] = cleanVehicle;
    attrs[custKey] = customer_name.trim();
    attrs[phoneKey] = cleanPhone;
    attrs[dateKey] = instDate;
    attrs[payKey] = cleanPayStatus;
    if (cleanSoftwareUser) attrs['SOFTWARE LOGIN ID'] = cleanSoftwareUser;
    if (cleanSoftwarePass) attrs['SOFTWARE PASSWORD'] = cleanSoftwarePass;

    db.prepare(`
      UPDATE devices
      SET current_status = 'INSTALLED',
          current_holder_type = 'CUSTOMER',
          current_holder_id = ?,
          current_holder_name = ?,
          additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(customerId, `${customer_name.trim()} (${cleanVehicle})`, JSON.stringify(attrs), dev.id);

    // 5. Update Dispatch item status if device was dispatched
    db.prepare(`UPDATE dispatch_items SET status = 'INSTALLED' WHERE imei_number = ?`).run(cleanImei);

    // 6. Log Device Audit History
    db.prepare(`
      INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
      VALUES (?, ?, 'INSTALLED', datetime('now'), ?, ?, ?, ?)
    `).run(
      dev.id,
      cleanImei,
      dev.current_holder_name || 'Central Warehouse',
      `Customer: ${customer_name.trim()} (${cleanVehicle})`,
      installed_by || 'Admin',
      `Installed in vehicle ${cleanVehicle} for customer ${customer_name.trim()} (Software ID: ${cleanSoftwareUser || 'N/A'})`
    );

    // 7. Auto-create warranty reminder
    const calculatedWarranty = warranty_end_date || new Date(new Date(instDate).setFullYear(new Date(instDate).getFullYear() + 1)).toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO reminders (customer_id, device_id, imei_number, type, due_date, status, remarks)
      VALUES (?, ?, ?, 'WARRANTY_EXPIRY', ?, 'PENDING', ?)
    `).run(customerId, dev.id, cleanImei, calculatedWarranty, `1-Year Warranty & Service due for vehicle ${cleanVehicle}`);

    return {
      installationId,
      customerId,
      imei: cleanImei,
      vehicle: cleanVehicle,
      customer_name: customer_name.trim(),
      phone: cleanPhone,
      software_user_id: cleanSoftwareUser,
      software_password: cleanSoftwarePass,
      payment_status: cleanPayStatus
    };
  });

  try {
    const result = transaction();
    res.json({
      success: true,
      data: result,
      message: `Successfully linked ${cleanVehicle} with IMEI ${cleanImei} for customer ${customer_name.trim()}`
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/installations/bulk - Process batch of installations (e.g. daily WhatsApp batch)
router.post('/bulk', (req, res) => {
  const { installations } = req.body;
  if (!Array.isArray(installations) || installations.length === 0) {
    return res.status(400).json({ success: false, error: 'Array of installations is required' });
  }

  const processed = [];
  const errors = [];

  const defaultType = db.prepare('SELECT id FROM device_types LIMIT 1').get() || { id: 1 };

  for (const item of installations) {
    const cleanImei = String(item.imei_number || item.imei || '').trim();
    const cleanPhone = String(item.customer_phone || item.phone || '').trim();
    const cleanName = String(item.customer_name || item.name || '').trim();
    const cleanVehicle = String(item.vehicle_number || item.vehicle || '').trim().toUpperCase();

    if (!cleanImei || !cleanVehicle || !cleanPhone) {
      errors.push({ item, error: 'Missing IMEI, Vehicle Number, or Phone Number' });
      continue;
    }

    try {
      const instDate = item.installation_date ? String(item.installation_date).trim() : new Date().toISOString().split('T')[0];
      const cleanSoftwareUser = item.software_user_id ? String(item.software_user_id).trim() : '';
      const cleanSoftwarePass = item.software_password ? String(item.software_password).trim() : '';
      const cleanPayStatus = item.payment_status ? String(item.payment_status).toUpperCase().trim() : (item.sale_price && parseFloat(item.sale_price) > 0 ? 'RECEIVED' : 'NOT RECEIVED');

      // 1. Device
      let dev = db.prepare('SELECT * FROM devices WHERE imei_number = ?').get(cleanImei);
      if (!dev) {
        const initAttrs = {
          'VEHICLE NUMBER': cleanVehicle,
          'CUSTOMER NAME': cleanName,
          'CUSTOMER PHONE NUMBER': cleanPhone,
          'INSTALLATION DATE': instDate
        };
        const info = db.prepare(`
          INSERT INTO devices (imei_number, device_type_id, purchase_date, vendor_name, current_status, current_holder_type, current_holder_name, additional_attributes)
          VALUES (?, ?, ?, 'Direct Entry', 'INSTALLED', 'CUSTOMER', ?, ?)
        `).run(cleanImei, defaultType.id, instDate, `${cleanName} (${cleanVehicle})`, JSON.stringify(initAttrs));
        dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
      }

      // 2. Customer
      let customer = db.prepare('SELECT * FROM customers WHERE phone_number = ?').get(cleanPhone);
      let customerId;
      if (customer) {
        customerId = customer.id;
        db.prepare(`
          UPDATE customers
          SET name = COALESCE(?, name),
              software_user_id = COALESCE(NULLIF(?, ''), software_user_id),
              software_password = COALESCE(NULLIF(?, ''), software_password)
          WHERE id = ?
        `).run(cleanName, cleanSoftwareUser, cleanSoftwarePass, customerId);
      } else {
        const custResult = db.prepare(`
          INSERT INTO customers (name, phone_number, source, software_user_id, software_password)
          VALUES (?, ?, 'Direct Entry', ?, ?)
        `).run(cleanName, cleanPhone, cleanSoftwareUser || null, cleanSoftwarePass || null);
        customerId = custResult.lastInsertRowid;
      }

      // 3. Installation
      const instResult = db.prepare(`
        INSERT INTO installations (
          device_id, imei_number, customer_id, installation_date, installed_by,
          customer_name, customer_contact, vehicle_number, sale_price, payment_status,
          installation_location, software_user_id, software_password
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        dev.id,
        cleanImei,
        customerId,
        instDate,
        item.installed_by || 'Technician',
        cleanName,
        cleanPhone,
        cleanVehicle,
        item.sale_price ? parseFloat(item.sale_price) : 0,
        cleanPayStatus,
        item.installation_location || 'Field Site',
        cleanSoftwareUser || null,
        cleanSoftwarePass || null
      );

      // 4. Update Device Attributes
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
      attrs['VEHICLE NUMBER'] = cleanVehicle;
      attrs['CUSTOMER NAME'] = cleanName;
      attrs['CUSTOMER PHONE NUMBER'] = cleanPhone;
      attrs['INSTALLATION DATE'] = instDate;
      attrs['AMOUNT RECEIVED'] = cleanPayStatus;
      if (cleanSoftwareUser) attrs['SOFTWARE LOGIN ID'] = cleanSoftwareUser;
      if (cleanSoftwarePass) attrs['SOFTWARE PASSWORD'] = cleanSoftwarePass;

      db.prepare(`
        UPDATE devices
        SET current_status = 'INSTALLED',
            current_holder_type = 'CUSTOMER',
            current_holder_id = ?,
            current_holder_name = ?,
            additional_attributes = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(customerId, `${cleanName} (${cleanVehicle})`, JSON.stringify(attrs), dev.id);

      // 5. History
      db.prepare(`
        INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
        VALUES (?, ?, 'INSTALLED', datetime('now'), ?, ?, 'Admin', ?)
      `).run(dev.id, cleanImei, dev.current_holder_name || 'Warehouse', `Customer: ${cleanName} (${cleanVehicle})`, `Batch Install: ${cleanVehicle}`);

      processed.push({ imei: cleanImei, vehicle: cleanVehicle, customer: cleanName });
    } catch (err) {
      errors.push({ imei: cleanImei, vehicle: cleanVehicle, error: err.message });
    }
  }

  res.json({
    success: true,
    processed_count: processed.length,
    error_count: errors.length,
    processed,
    errors,
    message: `Successfully processed ${processed.length} installation(s)`
  });
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
