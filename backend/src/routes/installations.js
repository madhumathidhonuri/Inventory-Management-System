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
    category,
    service_category,
    project_category,
    chasis_number,
    engine_number,
    aadhar_number,
    pan_number,
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
  const cleanAadhar = aadhar_number ? String(aadhar_number).trim() : '';
  const cleanPan = pan_number ? String(pan_number).trim().toUpperCase() : '';
  const cleanChasis = chasis_number ? String(chasis_number).trim().toUpperCase() : '';
  const cleanEngine = engine_number ? String(engine_number).trim().toUpperCase() : '';
  const cleanSoftwareUser = software_user_id ? String(software_user_id).trim() : '';
  const cleanSoftwarePass = software_password ? String(software_password).trim() : '';
  const cleanPayStatus = payment_status ? String(payment_status).toUpperCase().trim() : (sale_price && parseFloat(sale_price) > 0 ? 'RECEIVED' : 'NOT RECEIVED');
  const cleanCategory = (category || service_category || project_category || 'VLTD').toString().trim().toUpperCase();
  const instDate = installation_date ? String(installation_date).trim() : new Date().toISOString().split('T')[0];

  const transaction = db.transaction(() => {
    // 1. Verify device exists or auto-create if not uploaded yet
    let dev = db.prepare('SELECT * FROM devices WHERE imei_number = ?').get(cleanImei);
    if (!dev) {
      const defaultType = db.prepare('SELECT id FROM device_types LIMIT 1').get() || { id: 1 };
      const initAttrs = {
        'CATEGORY': cleanCategory,
        'DEVICE CATEGORY': cleanCategory,
        'VEHICLE NUMBER': cleanVehicle,
        'CUSTOMER NAME': customer_name.trim(),
        'CUSTOMER PHONE NUMBER': cleanPhone,
        'INSTALLATION DATE': instDate,
        'CHASIS NUMBER': cleanChasis,
        'ENGINE NUMBER': cleanEngine,
        'AADHAR NUMBER': cleanAadhar,
        'PAN NUMBER': cleanPan
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
      // Update customer info if software credentials, aadhar, pan or additional details provided
      db.prepare(`
        UPDATE customers
        SET name = COALESCE(?, name),
            email = COALESCE(?, email),
            address = COALESCE(?, address),
            aadhar_number = COALESCE(NULLIF(?, ''), aadhar_number),
            pan_number = COALESCE(NULLIF(?, ''), pan_number),
            software_user_id = COALESCE(NULLIF(?, ''), software_user_id),
            software_password = COALESCE(NULLIF(?, ''), software_password)
        WHERE id = ?
      `).run(customer_name.trim(), customer_email || null, customer_address || null, cleanAadhar, cleanPan, cleanSoftwareUser, cleanSoftwarePass, customerId);
    } else {
      const custResult = db.prepare(`
        INSERT INTO customers (name, phone_number, alternate_phone, email, address, customer_type, source, aadhar_number, pan_number, software_user_id, software_password)
        VALUES (?, ?, ?, ?, ?, ?, 'Direct Entry', ?, ?, ?, ?)
      `).run(
        customer_name.trim(),
        cleanPhone,
        alternate_phone || null,
        customer_email || null,
        customer_address || null,
        customer_type || 'Individual',
        cleanAadhar || null,
        cleanPan || null,
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
        vehicle_type, aadhar_number, pan_number, chasis_number, engine_number,
        sale_price, payment_status, installation_location, remarks, warranty_end_date,
        software_user_id, software_password
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      cleanAadhar || null,
      cleanPan || null,
      cleanChasis || null,
      cleanEngine || null,
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
    try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch { }

    if (req.body.additional_attributes && typeof req.body.additional_attributes === 'object') {
      attrs = { ...attrs, ...req.body.additional_attributes };
    }

    const vehKey = Object.keys(attrs).find(k => /vehicle|veh_no|reg_no/i.test(k)) || 'VEHICLE NUMBER';
    const custKey = Object.keys(attrs).find(k => /customer.*name|client.*name/i.test(k)) || 'CUSTOMER NAME';
    const phoneKey = Object.keys(attrs).find(k => /customer.*phone|mobile|contact/i.test(k)) || 'CUSTOMER PHONE NUMBER';
    const dateKey = Object.keys(attrs).find(k => /install.*date|installation/i.test(k)) || (attrs['CERTIFICATE ISSUED DATE'] !== undefined ? 'CERTIFICATE ISSUED DATE' : 'DATE');
    const payKey = Object.keys(attrs).find(k => /amount.*received|payment/i.test(k)) || 'AMOUNT RECEIVED';
    const costKey = Object.keys(attrs).find(k => /total.*cost|cost/i.test(k)) || 'COST';

    attrs[vehKey] = cleanVehicle;
    attrs[custKey] = customer_name.trim();
    attrs[phoneKey] = cleanPhone;
    attrs[dateKey] = instDate;
    attrs[payKey] = cleanPayStatus;
    if (sale_price) attrs[costKey] = parseFloat(sale_price);

    if (cleanAadhar) {
      const aadharKey = Object.keys(attrs).find(k => /aadhar/i.test(k)) || 'AADHAAR NUMBER';
      attrs[aadharKey] = cleanAadhar;
    }
    if (cleanChasis) {
      const chasisKey = Object.keys(attrs).find(k => /chasis|chassis/i.test(k)) || 'CHASIS NUMBER';
      attrs[chasisKey] = cleanChasis;
    }
    if (cleanEngine) {
      const engineKey = Object.keys(attrs).find(k => /engine/i.test(k)) || 'ENGINE NUMBER';
      attrs[engineKey] = cleanEngine;
    }
    if (cleanPan) {
      const panKey = Object.keys(attrs).find(k => /pan/i.test(k)) || 'PAN NUMBER';
      attrs[panKey] = cleanPan;
    }
    if (installation_location) {
      const rtoKey = Object.keys(attrs).find(k => /rto|location/i.test(k)) || 'RTO LOCATION';
      attrs[rtoKey] = installation_location;
    }
    if (sales_person) {
      const salesKey = Object.keys(attrs).find(k => /sales.*person/i.test(k)) || 'SALES PERSON NAME';
      attrs[salesKey] = sales_person;
    }
    if (cleanSoftwareUser) attrs['USERNAME'] = cleanSoftwareUser;
    if (cleanSoftwarePass) attrs['PASSWORD'] = cleanSoftwarePass;
    attrs['CATEGORY'] = cleanCategory;
    attrs['DEVICE CATEGORY'] = cleanCategory;


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

    // Auto-sync instantly to Supabase Cloud Storage (No manual click needed)
    try {
      const cloudSync = require('../db/cloudSync');
      cloudSync.triggerDebouncedSync(1000);
    } catch (e) { }

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
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch { }
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

// Helper: Extract clean Category from installation record
function extractInstCategory(inst) {
  let devAttrs = {};
  try {
    devAttrs = typeof inst.device_additional_attributes === 'string'
      ? JSON.parse(inst.device_additional_attributes || '{}')
      : (inst.device_additional_attributes || {});
  } catch {}
  return (devAttrs['CATEGORY'] || devAttrs['DEVICE CATEGORY'] || inst.vehicle_type || 'VLTD').toString().toUpperCase().trim();
}

// GET /api/installations/pending-alerts - Return date-wise and month-wise grouped pending payment alerts with aging and reminders
router.get('/pending-alerts', (req, res) => {
  try {
    const { syncFitmentsToInstallations, standardizeDate, extractInstallationDate } = require('../db/syncFitments');
    try {
      syncFitmentsToInstallations();
    } catch (sErr) {
      console.warn('[PendingAlerts] Sync fitments notice:', sErr.message);
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const requestedMonth = req.query.month; // e.g. '2026-09' or 'all'

    // Fetch ALL installations so we can calculate total installed vs paid vs pending per date
    const allRows = db.prepare(`
      SELECT i.*, d.sim_number, d.additional_attributes as device_additional_attributes, dt.name as device_type_name
      FROM installations i
      LEFT JOIN devices d ON i.device_id = d.id
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      ORDER BY i.installation_date DESC, i.id DESC
    `).all();

    const dailyStatsMap = {};
    const monthlyStatsMap = {};
    const allPendingItems = [];

    let overallPendingCount = 0;
    let overallPendingAmount = 0;
    let todayPendingCount = 0;
    let todayPendingAmount = 0;
    let yesterdayPendingCount = 0;
    let yesterdayPendingAmount = 0;
    let olderPendingCount = 0;
    let olderPendingAmount = 0;

    for (const item of allRows) {
      const price = parseFloat(item.sale_price) || 0;
      let attrs = {};
      try {
        attrs = typeof item.device_additional_attributes === 'string'
          ? JSON.parse(item.device_additional_attributes || '{}')
          : (item.device_additional_attributes || {});
      } catch {}

      // Extract accurate date from attributes first, fallback to installation_date
      const attrDate = extractInstallationDate(item, attrs);
      const rawInstDate = attrDate || item.installation_date;
      const instDate = (rawInstDate && String(rawInstDate).trim()) ? standardizeDate(rawInstDate) : 'Date Not Specified';
      
      let displayDate = instDate;
      if (/^\d{4}-\d{2}-\d{2}$/.test(instDate)) {
        const [y, m, d] = instDate.split('-');
        displayDate = `${d}-${m}-${y}`;
      }

      const monthKey = instDate.length >= 7 && /^\d{4}-\d{2}/.test(instDate) ? instDate.substring(0, 7) : 'Unknown Month';

      // Initialize daily stats map
      if (!dailyStatsMap[instDate]) {
        dailyStatsMap[instDate] = {
          date: instDate,
          display_date: displayDate,
          month: monthKey,
          total_installed: 0,
          paid_count: 0,
          pending_count: 0,
          pending_amount: 0,
          items: []
        };
      }

      // Initialize monthly stats map
      if (!monthlyStatsMap[monthKey]) {
        let monthLabel = monthKey;
        if (/^\d{4}-\d{2}$/.test(monthKey)) {
          const [y, m] = monthKey.split('-');
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const mIdx = parseInt(m, 10) - 1;
          if (mIdx >= 0 && mIdx < 12) {
            monthLabel = `${monthNames[mIdx]} ${y}`;
          }
        }
        monthlyStatsMap[monthKey] = {
          month: monthKey,
          month_label: monthLabel,
          total_installed: 0,
          paid_count: 0,
          pending_count: 0,
          pending_amount: 0
        };
      }

      dailyStatsMap[instDate].total_installed += 1;
      monthlyStatsMap[monthKey].total_installed += 1;

      const totalPrice = parseFloat(item.sale_price) || 0;
      const amountPaid = parseFloat(item.amount_paid) || 0;
      const statusUpper = (item.payment_status || '').toString().toUpperCase().trim();
      
      const isFullyPaid = ['RECEIVED', 'PAID', 'YES'].includes(statusUpper) && (amountPaid === 0 || amountPaid >= totalPrice);
      const isPartial = statusUpper === 'PARTIAL' || (amountPaid > 0 && amountPaid < totalPrice && statusUpper !== 'RECEIVED');
      
      const pendingAmount = isFullyPaid ? 0 : (isPartial ? Math.max(0, totalPrice - amountPaid) : totalPrice);

      if (isFullyPaid) {
        dailyStatsMap[instDate].paid_count += 1;
        monthlyStatsMap[monthKey].paid_count += 1;
      } else {
        dailyStatsMap[instDate].pending_count += 1;
        dailyStatsMap[instDate].pending_amount += pendingAmount;
        monthlyStatsMap[monthKey].pending_count += 1;
        monthlyStatsMap[monthKey].pending_amount += pendingAmount;

        overallPendingCount += 1;
        overallPendingAmount += pendingAmount;

        let daysOverdue = 0;
        if (/^\d{4}-\d{2}-\d{2}$/.test(instDate)) {
          try {
            const dInst = new Date(instDate);
            const dToday = new Date(today);
            const diffMs = dToday - dInst;
            daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          } catch (e) {
            daysOverdue = 0;
          }
        }

        let bucket = 'OTHER';
        let urgency = 'NORMAL';
        let agingLabel = '';

        if (instDate === today) {
          bucket = 'TODAY';
          urgency = 'TODAY_PENDING';
          agingLabel = isPartial ? 'Partially Paid Today' : 'Installed Today';
          todayPendingCount++;
          todayPendingAmount += pendingAmount;
        } else if (instDate === yesterdayDate || daysOverdue === 1) {
          bucket = 'YESTERDAY';
          urgency = 'YESTERDAY_OVERDUE';
          agingLabel = isPartial ? 'Partial (1 day due)' : 'Installed Yesterday (1 day due)';
          yesterdayPendingCount++;
          yesterdayPendingAmount += pendingAmount;
        } else if (daysOverdue > 1 && daysOverdue <= 7) {
          bucket = 'RECENT_DUE';
          urgency = 'MODERATE';
          agingLabel = isPartial ? `Partial (${daysOverdue} days due)` : `${daysOverdue} days due`;
          olderPendingCount++;
          olderPendingAmount += pendingAmount;
        } else {
          bucket = 'CRITICAL_OVERDUE';
          urgency = 'CRITICAL';
          agingLabel = isPartial ? `Partial Overdue (${daysOverdue} days)` : (daysOverdue > 7 ? `Overdue (${daysOverdue} days)` : 'Pending Collection');
          olderPendingCount++;
          olderPendingAmount += pendingAmount;
        }

        const reminderMessage = `Dear ${item.customer_name || 'Customer'},\n\nThis is a friendly payment reminder from FuelTracks IMS for the GPS Tracker installed in your vehicle *${item.vehicle_number || ''}* on *${displayDate}*.\n\n*Remaining Balance Due:* ₹${pendingAmount.toLocaleString('en-IN')}${isPartial ? ` (Paid: ₹${amountPaid.toLocaleString('en-IN')})` : ''}\n\nPlease transfer via UPI / Bank or contact us to clear the balance.\n\nThank you!`;

        const pendingObj = {
          ...item,
          device_id: item.device_id || item.id,
          sale_price: pendingAmount,
          total_sale_price: totalPrice,
          amount_paid: amountPaid,
          is_partial: isPartial,
          installation_date: instDate,
          display_date: displayDate,
          month: monthKey,
          days_overdue: daysOverdue,
          bucket,
          urgency,
          aging_label: agingLabel,
          reminder_message: reminderMessage
        };

        dailyStatsMap[instDate].items.push(pendingObj);
        allPendingItems.push(pendingObj);
      }
    }

    // Generate date_groups sorted chronologically DESC
    const dateGroups = Object.values(dailyStatsMap)
      .filter(g => g.pending_count > 0)
      .sort((a, b) => b.date.localeCompare(a.date));

    // Generate date-wise reminders (e.g. "3 vehicles payment pending installed on 17-09-2026")
    const dateReminders = dateGroups.map(g => ({
      date: g.date,
      display_date: g.display_date,
      month: g.month,
      pending_count: g.pending_count,
      total_installed: g.total_installed,
      paid_count: g.paid_count,
      pending_amount: g.pending_amount,
      reminder_text: `${g.pending_count} ${g.pending_count === 1 ? 'vehicle' : 'vehicles'} payment pending installed on ${g.display_date}`
    }));

    // Available months list sorted DESC
    const availableMonths = Object.values(monthlyStatsMap)
      .filter(m => m.month !== 'Unknown Month')
      .sort((a, b) => b.month.localeCompare(a.month));

    // Determine current active month (e.g. '2026-09')
    const currentMonthKey = today.substring(0, 7);

    res.json({
      success: true,
      summary: {
        total_pending_count: overallPendingCount,
        total_pending_amount: overallPendingAmount,
        today_pending_count: todayPendingCount,
        today_pending_amount: todayPendingAmount,
        yesterday_pending_count: yesterdayPendingCount,
        yesterday_pending_amount: yesterdayPendingAmount,
        older_pending_count: olderPendingCount,
        older_pending_amount: olderPendingAmount,
        server_date: today,
        yesterday_date: yesterdayDate,
        current_month: currentMonthKey
      },
      available_months: availableMonths,
      date_groups: dateGroups,
      date_reminders: dateReminders,
      data: allPendingItems
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/installations - List installations with category filtering & category counts breakdown
router.get('/', (req, res) => {
  try {
    const { search, installer, customer_id, date_from, date_to, category } = req.query;
    let query = `
      SELECT i.*, d.sim_number, d.additional_attributes as device_additional_attributes, dt.name as device_type_name
      FROM installations i
      LEFT JOIN devices d ON i.device_id = d.id
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
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

    const allList = db.prepare(query).all(...params);

    // Compute category counts breakdown
    const counts = {
      all: allList.length,
      tg_mining: 0,
      ap_mining: 0,
      vltd: 0,
      general: 0,
      by_category: {}
    };

    allList.forEach(inst => {
      const cat = extractInstCategory(inst);
      counts.by_category[cat] = (counts.by_category[cat] || 0) + 1;
      if (cat.includes('TG MINING') || (cat.includes('TG') && cat.includes('MINING'))) {
        counts.tg_mining++;
      } else if (cat.includes('AP MINING') || (cat.includes('AP') && cat.includes('MINING'))) {
        counts.ap_mining++;
      } else if (cat.includes('VLTD')) {
        counts.vltd++;
      } else if (cat.includes('GENERAL')) {
        counts.general++;
      }
    });

    let filteredList = allList;
    if (category && category !== 'ALL') {
      const catUpper = category.toUpperCase().trim();
      filteredList = allList.filter(inst => {
        const cat = extractInstCategory(inst);
        return cat.includes(catUpper) || catUpper.includes(cat);
      });
    }

    res.json({
      success: true,
      count: filteredList.length,
      total_count: allList.length,
      counts,
      data: filteredList
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/installations/export - Server-side Excel export with category filtering
router.get('/export', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { category, search, installer, customer_id, date_from, date_to } = req.query;

    let query = `
      SELECT i.*, d.sim_number, d.additional_attributes as device_additional_attributes, dt.name as device_type_name
      FROM installations i
      LEFT JOIN devices d ON i.device_id = d.id
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
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

    let list = db.prepare(query).all(...params);

    const safeCategory = (category || 'ALL').toUpperCase().trim();
    if (safeCategory !== 'ALL') {
      list = list.filter(inst => {
        const cat = extractInstCategory(inst);
        return cat.includes(safeCategory) || safeCategory.includes(cat);
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FuelTracks IMS';
    workbook.created = new Date();

    const sheetName = (safeCategory === 'ALL' ? 'All Installations' : `${safeCategory} Installs`).substring(0, 31);
    const worksheet = workbook.addWorksheet(sheetName, { views: [{ showGridLines: true }] });

    let themeColor = '1E293B';
    if (safeCategory.includes('TG MINING')) themeColor = 'B45309';
    else if (safeCategory.includes('AP MINING')) themeColor = '7E22CE';
    else if (safeCategory.includes('VLTD')) themeColor = '1D4ED8';
    else if (safeCategory.includes('GENERAL')) themeColor = '047857';

    worksheet.columns = [
      { key: 'sl_no', width: 8 },
      { key: 'installation_date', width: 16 },
      { key: 'category', width: 16 },
      { key: 'vehicle_number', width: 18 },
      { key: 'vehicle_type', width: 18 },
      { key: 'imei_number', width: 20 },
      { key: 'sim_number', width: 18 },
      { key: 'customer_name', width: 24 },
      { key: 'customer_contact', width: 16 },
      { key: 'software_user_id', width: 20 },
      { key: 'software_password', width: 16 },
      { key: 'installed_by', width: 18 },
      { key: 'installation_location', width: 20 },
      { key: 'sale_price', width: 14 },
      { key: 'payment_status', width: 16 },
      { key: 'remarks', width: 26 }
    ];

    // Banner
    worksheet.mergeCells('A1:P1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = safeCategory === 'ALL'
      ? 'FUELTRACKS TECHNOLOGIES — MASTER VEHICLE INSTALLATIONS REPORT'
      : `FUELTRACKS TECHNOLOGIES — ${safeCategory} PROJECT INSTALLATION REPORT`;
    titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${themeColor}` } };
    worksheet.getRow(1).height = 36;

    // Subtitle
    worksheet.mergeCells('A2:P2');
    const metaCell = worksheet.getCell('A2');
    const totalRev = list.reduce((sum, item) => sum + (parseFloat(item.sale_price) || 0), 0);
    metaCell.value = `Category: ${safeCategory}  |  Records: ${list.length}  |  Revenue: ₹${totalRev.toLocaleString('en-IN')}  |  Generated: ${new Date().toISOString().split('T')[0]}`;
    metaCell.font = { name: 'Segoe UI', size: 9.5, italic: true, bold: true, color: { argb: 'FF1E293B' } };
    metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
    metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    worksheet.getRow(2).height = 22;

    worksheet.addRow([]);

    const headers = [
      'Sl No', 'Date', 'Category', 'Vehicle Number', 'Vehicle Type',
      'Device IMEI', 'SIM Number', 'Customer Name', 'Phone Number',
      'GPS Software ID', 'GPS Password', 'Technician', 'City / Location',
      'Price (₹)', 'Payment Status', 'Remarks'
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${themeColor}` } };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    list.forEach((inst, index) => {
      let devAttrs = {};
      try {
        devAttrs = typeof inst.device_additional_attributes === 'string'
          ? JSON.parse(inst.device_additional_attributes || '{}')
          : (inst.device_additional_attributes || {});
      } catch {}

      const itemCat = extractInstCategory(inst);
      const softwareUser = inst.software_user_id || devAttrs['SOFTWARE USER ID'] || devAttrs['GPS USER ID'] || '—';
      const softwarePass = inst.software_password || devAttrs['SOFTWARE PASSWORD'] || devAttrs['GPS PASSWORD'] || '—';
      const priceNum = parseFloat(inst.sale_price) || 0;
      const payStatus = (inst.payment_status || 'RECEIVED').toUpperCase();
      const isPaid = payStatus.includes('REC') || payStatus.includes('PAID');

      const rowData = [
        index + 1,
        inst.installation_date || '—',
        itemCat,
        inst.vehicle_number || '—',
        inst.vehicle_type || 'Commercial',
        String(inst.imei_number || '—'),
        inst.sim_number || devAttrs['SIM NUMBER'] || devAttrs['SIM'] || '—',
        inst.customer_name || '—',
        inst.customer_contact || '—',
        softwareUser,
        softwarePass,
        inst.installed_by || '—',
        inst.installation_location || '—',
        priceNum,
        isPaid ? 'PAID' : 'PENDING',
        inst.remarks || '—'
      ];

      const row = worksheet.addRow(rowData);
      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9.5 };
        if (colNumber === 1 || colNumber === 2 || colNumber === 3) cell.alignment = { vertical: 'middle', horizontal: 'center' };
        else if (colNumber === 14) {
          cell.numFmt = '₹#,##0.00';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (colNumber === 15) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: isPaid ? 'FF166534' : 'FF991B1B' } };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const formattedDate = `${day}-${month}-${year}`;
    const cleanCat = safeCategory.toUpperCase().replace(/[_\s]+/g, '');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanCat}_${formattedDate}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
