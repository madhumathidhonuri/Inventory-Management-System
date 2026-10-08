const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('../db/database');
const { standardizeDate } = require('../db/syncFitments');

const upload = multer({ storage: multer.memoryStorage() });

function cleanImeiString(raw) {
  if (raw === undefined || raw === null) return '';
  let str = String(raw).trim().replace(/^['"\s]+|['"\s]+$/g, '');
  if (!str) return '';

  // Handle scientific notation numbers like 8.64925e+14 or 8.64925E14
  if (typeof raw === 'number' || /[eE][+-]?\d+/.test(str)) {
    try {
      const num = Number(str);
      if (!isNaN(num) && num > 0) {
        str = BigInt(Math.round(num)).toString();
      }
    } catch {}
  }

  // Remove trailing decimal zeroes like .0, .00
  str = str.replace(/\.0+$/, '').replace(/[^a-zA-Z0-9]/g, '').trim();
  return str;
}

/**
 * Robust device lookup by IMEI - matches exact, normalized, or embedded IMEI
 */
function findDeviceByImei(imei) {
  if (!imei) return null;
  const clean = cleanImeiString(imei);
  if (!clean) return null;

  // 1. Exact match
  let dev = db.prepare('SELECT * FROM devices WHERE imei_number = ?').get(clean);
  if (dev) return dev;

  // 2. Normalized match (stripping spaces, quotes, hyphens)
  dev = db.prepare(`
    SELECT * FROM devices 
    WHERE REPLACE(REPLACE(REPLACE(imei_number, ' ', ''), '-', ''), '''', '') = ?
    LIMIT 1
  `).get(clean);
  if (dev) return dev;

  // 3. Substring match for 10+ digits (safe for standard 15-digit IMEIs)
  if (clean.length >= 10) {
    dev = db.prepare(`SELECT * FROM devices WHERE imei_number LIKE ? LIMIT 1`).get(`%${clean}%`);
    if (dev) return dev;
  }

  // 4. Match within additional_attributes JSON
  dev = db.prepare(`SELECT * FROM devices WHERE additional_attributes LIKE ? LIMIT 1`).get(`%${clean}%`);
  return dev || null;
}

function cleanPhoneString(raw) {
  if (raw === undefined || raw === null) return '';
  let str = String(raw).trim().replace(/\.0+$/, '').replace(/[^\d+]/g, '');
  if (str === '9999999999' || str === '0000000000') return '';
  if (str.length > 10) {
    const digitsOnly = str.replace(/\D/g, '');
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      str = digitsOnly.substring(2);
    } else if (digitsOnly.length >= 10) {
      str = digitsOnly.slice(-10);
    }
  }
  return str;
}

function detectInstallationColumns(headers = []) {
  const mapping = {
    imei: '',
    vehicle_number: '',
    customer_name: '',
    customer_phone: '',
    installed_by: '',
    installation_date: '',
    category: '',
    installation_location: '',
    sale_price: '',
    payment_status: '',
    chasis_number: '',
    engine_number: '',
    aadhar_number: '',
    pan_number: '',
    software_user_id: '',
    software_password: '',
    remarks: ''
  };

  const findCol = (patterns) => {
    return headers.find(h => {
      const cleanH = String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!cleanH) return false;
      return patterns.some(p => {
        const cleanP = p.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanH === cleanP || cleanH.includes(cleanP);
      });
    }) || '';
  };

  mapping.imei = findCol(['imei', 'device_id', 'imei_number', 'imei_no', 'device_imei', 'serial_number', 'serial_no', 'vltd_sno', 'vltdsno', 'tracker_id']) || headers[0] || '';
  mapping.vehicle_number = findCol(['vehicle_number', 'vehicle_no', 'vehicleno', 'vehicle', 'reg_no', 'registration_no', 'reg_number', 'plate_no', 'machinery_number', 'equipment_number', 'tipper_no', 'truck_no']) || '';
  mapping.customer_name = findCol(['customer_name', 'client_name', 'party_name', 'owner_name', 'customer', 'client', 'party', 'name', 'mining_site', 'site_name']) || '';
  mapping.customer_phone = findCol(['customer_phone', 'customer_mobile', 'phone_number', 'mobile_number', 'phone', 'mobile', 'contact_number', 'contact', 'customer_contact']) || '';
  mapping.installed_by = findCol(['installed_by', 'technician', 'technician_name', 'installer', 'fitter', 'staff_name', 'staff', 'engineer']) || '';
  mapping.installation_date = findCol(['installation_date', 'installed_on', 'install_date', 'cert_date', 'certificate_issued_date', 'tg_mining_date', 'tgminingdate', 'mining_date', 'date', 'fitting_date']) || '';
  mapping.category = findCol(['category', 'device_category', 'project_category', 'service_category', 'project', 'type', 'scheme', 'mining']) || '';
  mapping.installation_location = findCol(['installation_location', 'rto_location', 'rto', 'location', 'city', 'site_name', 'site', 'area', 'place', 'mining_location']) || '';
  mapping.sale_price = findCol(['sale_price', 'price', 'amount', 'cost', 'total_cost', 'fitting_charges']) || '';
  mapping.payment_status = findCol(['payment_status', 'payment', 'paid_status', 'amount_received', 'status']) || '';
  mapping.chasis_number = findCol(['chasis_number', 'chassis_number', 'chasis_no', 'chassis_no', 'chassis', 'chasis']) || '';
  mapping.engine_number = findCol(['engine_number', 'engine_no', 'engine']) || '';
  mapping.aadhar_number = findCol(['aadhar_number', 'aadhaar_number', 'aadhar_no', 'aadhaar_no', 'aadhar', 'aadhaar']) || '';
  mapping.pan_number = findCol(['pan_number', 'pan_no', 'pan_card', 'pan']) || '';
  mapping.software_user_id = findCol(['software_user_id', 'software_id', 'software_username', 'login_id', 'username', 'user_id', 'gps_user_id']) || '';
  mapping.software_password = findCol(['software_password', 'software_pass', 'password', 'pwd', 'gps_password']) || '';
  mapping.remarks = findCol(['remarks', 'notes', 'comment', 'description']) || '';

  return mapping;
}

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

    // Auto-sync instantly to Google Sheets in real time
    try {
      const googleSheetsSync = require('../services/googleSheetsSync');
      googleSheetsSync.syncDeviceUpdate(cleanImei);
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

// POST /api/installations/excel-preview - Upload & parse daily installation report Excel/CSV
router.post('/excel-preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No Excel file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName || !workbook.Sheets[sheetName]) {
      return res.status(400).json({ success: false, error: 'The uploaded Excel file has no readable sheets' });
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    if (!rawData || rawData.length === 0) {
      return res.status(400).json({ success: false, error: 'Uploaded sheet is empty' });
    }

    // Determine range and headers
    const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    const headers = [];
    let emptyIdx = 0;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
      const cell = worksheet[cellAddress];
      const val = cell && cell.v !== undefined && cell.v !== null ? String(cell.v).trim() : '';
      if (val) {
        headers.push(val);
      } else {
        const emptyKey = emptyIdx === 0 ? '__EMPTY' : `__EMPTY_${emptyIdx}`;
        headers.push(emptyKey);
        emptyIdx++;
      }
    }

    const rowObjects = xlsx.utils.sheet_to_json(worksheet, { header: headers, range: range.s.r + 1, defval: '' });
    const autoMapping = detectInstallationColumns(headers);

    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;

    const previewRows = rowObjects.map((row, idx) => {
      const rowNum = idx + 2; // 1-based header + data row
      const imeiKey = autoMapping.imei || Object.keys(row)[0];
      const vehicleKey = autoMapping.vehicle_number;
      const custNameKey = autoMapping.customer_name;
      const phoneKey = autoMapping.customer_phone;
      const techKey = autoMapping.installed_by;
      const dateKey = autoMapping.installation_date;
      const catKey = autoMapping.category;
      const locKey = autoMapping.installation_location;
      const priceKey = autoMapping.sale_price;
      const payKey = autoMapping.payment_status;

      const imeiVal = cleanImeiString(row[imeiKey]);
      const vehicleVal = String(vehicleKey && row[vehicleKey] ? row[vehicleKey] : '').trim().toUpperCase();
      const custNameVal = String(custNameKey && row[custNameKey] ? row[custNameKey] : '').trim();
      const phoneVal = cleanPhoneString(phoneKey && row[phoneKey] ? row[phoneKey] : '');
      const techVal = String(techKey && row[techKey] ? row[techKey] : '').trim();
      const dateVal = standardizeDate(dateKey && row[dateKey] ? row[dateKey] : '') || new Date().toISOString().split('T')[0];
      const catVal = String(catKey && row[catKey] ? row[catKey] : '').trim().toUpperCase() || 'VLTD';
      const locVal = String(locKey && row[locKey] ? row[locKey] : '').trim();
      const priceVal = priceKey && row[priceKey] ? parseFloat(String(row[priceKey]).replace(/[^0-9.]/g, '')) || 0 : 0;
      const payVal = String(payKey && row[payKey] ? row[payKey] : '').trim().toUpperCase() || (priceVal > 0 ? 'RECEIVED' : 'NOT RECEIVED');

      const issues = [];
      if (!imeiVal) {
        issues.push('Missing IMEI');
      } else if (imeiVal.length < 8) {
        issues.push('Invalid IMEI format');
      }

      if (!vehicleVal) {
        issues.push('Missing Vehicle Number');
      }

      let deviceStatus = 'NEW';
      let existingHolder = '';
      if (imeiVal) {
        const existingDev = findDeviceByImei(imeiVal);
        if (existingDev) {
          deviceStatus = existingDev.current_status || 'IN_STOCK';
          existingHolder = existingDev.current_holder_name || '';
          if (existingDev.current_status === 'INSTALLED') {
            issues.push(`Will update installation (${existingDev.current_holder_name || 'Installed'})`);
          }
        }
      }

      let rowStatus = 'VALID';
      if (!imeiVal || !vehicleVal || imeiVal.length < 8) {
        rowStatus = 'ERROR';
        errorCount++;
      } else if (issues.length > 0) {
        rowStatus = 'WARNING';
        warningCount++;
      } else {
        validCount++;
      }

      return {
        row_number: rowNum,
        raw: row,
        detected_imei: imeiVal,
        detected_vehicle: vehicleVal,
        detected_customer_name: custNameVal,
        detected_phone: phoneVal,
        detected_tech: techVal,
        detected_date: dateVal,
        detected_category: catVal,
        detected_location: locVal,
        detected_price: priceVal,
        detected_payment_status: payVal,
        device_status: deviceStatus,
        existing_holder: existingHolder,
        status: rowStatus,
        issues
      };
    });

    res.json({
      success: true,
      total_rows: rowObjects.length,
      valid_count: validCount,
      warning_count: warningCount,
      error_count: errorCount,
      headers: headers.filter(h => !h.startsWith('__EMPTY')),
      all_headers: headers,
      autoMapping,
      previewRows: previewRows.slice(0, 500)
    });

  } catch (err) {
    console.error('[Excel Preview Error]', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to parse Excel file' });
  }
});

// POST /api/installations/excel-upload - Process and commit daily installation report
router.post('/excel-upload', upload.single('file'), (req, res) => {
  try {
    let rowsToProcess = [];
    let customMapping = null;
    let defaultCategory = req.body.default_category || 'VLTD';
    let defaultTech = req.body.default_technician || 'Technician';

    if (req.body.mapping) {
      try {
        customMapping = typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : req.body.mapping;
      } catch (e) {}
    }

    if (req.file) {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      const headers = [];
      let emptyIdx = 0;

      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
        const cell = worksheet[cellAddress];
        const val = cell && cell.v !== undefined && cell.v !== null ? String(cell.v).trim() : '';
        if (val) {
          headers.push(val);
        } else {
          headers.push(emptyIdx === 0 ? '__EMPTY' : `__EMPTY_${emptyIdx}`);
          emptyIdx++;
        }
      }

      const rawRows = xlsx.utils.sheet_to_json(worksheet, { header: headers, range: range.s.r + 1, defval: '' });
      const mapping = customMapping || detectInstallationColumns(headers);

      rowsToProcess = rawRows.map((r, idx) => ({
        row_number: idx + 2,
        raw: r,
        imei: cleanImeiString(r[mapping.imei]),
        vehicle_number: String(mapping.vehicle_number && r[mapping.vehicle_number] ? r[mapping.vehicle_number] : '').trim().toUpperCase(),
        customer_name: String(mapping.customer_name && r[mapping.customer_name] ? r[mapping.customer_name] : '').trim(),
        customer_phone: cleanPhoneString(mapping.customer_phone && r[mapping.customer_phone] ? r[mapping.customer_phone] : ''),
        installed_by: String(mapping.installed_by && r[mapping.installed_by] ? r[mapping.installed_by] : defaultTech).trim(),
        installation_date: standardizeDate(mapping.installation_date && r[mapping.installation_date] ? r[mapping.installation_date] : '') || new Date().toISOString().split('T')[0],
        category: String(mapping.category && r[mapping.category] ? r[mapping.category] : defaultCategory).trim().toUpperCase() || 'VLTD',
        installation_location: String(mapping.installation_location && r[mapping.installation_location] ? r[mapping.installation_location] : '').trim(),
        sale_price: mapping.sale_price && r[mapping.sale_price] ? parseFloat(String(r[mapping.sale_price]).replace(/[^0-9.]/g, '')) || 0 : 0,
        payment_status: String(mapping.payment_status && r[mapping.payment_status] ? r[mapping.payment_status] : '').trim().toUpperCase(),
        chasis_number: String(mapping.chasis_number && r[mapping.chasis_number] ? r[mapping.chasis_number] : '').trim().toUpperCase(),
        engine_number: String(mapping.engine_number && r[mapping.engine_number] ? r[mapping.engine_number] : '').trim().toUpperCase(),
        aadhar_number: String(mapping.aadhar_number && r[mapping.aadhar_number] ? r[mapping.aadhar_number] : '').trim(),
        pan_number: String(mapping.pan_number && r[mapping.pan_number] ? r[mapping.pan_number] : '').trim().toUpperCase(),
        software_user_id: String(mapping.software_user_id && r[mapping.software_user_id] ? r[mapping.software_user_id] : '').trim(),
        software_password: String(mapping.software_password && r[mapping.software_password] ? r[mapping.software_password] : '').trim(),
        remarks: String(mapping.remarks && r[mapping.remarks] ? r[mapping.remarks] : '').trim()
      }));
    } else if (req.body.rows) {
      const parsedRows = typeof req.body.rows === 'string' ? JSON.parse(req.body.rows) : req.body.rows;
      rowsToProcess = parsedRows.map((r, idx) => ({
        row_number: r.row_number || idx + 2,
        raw: r.raw || r,
        imei: cleanImeiString(r.detected_imei || r.imei || r.imei_number),
        vehicle_number: String(r.detected_vehicle || r.vehicle_number || r.vehicle || '').trim().toUpperCase(),
        customer_name: String(r.detected_customer_name || r.customer_name || '').trim(),
        customer_phone: cleanPhoneString(r.detected_phone || r.customer_phone || r.phone),
        installed_by: String(r.detected_tech || r.installed_by || defaultTech).trim(),
        installation_date: standardizeDate(r.detected_date || r.installation_date) || new Date().toISOString().split('T')[0],
        category: String(r.detected_category || r.category || defaultCategory).trim().toUpperCase() || 'VLTD',
        installation_location: String(r.detected_location || r.installation_location || '').trim(),
        sale_price: r.detected_price !== undefined ? parseFloat(r.detected_price) || 0 : (r.sale_price ? parseFloat(r.sale_price) || 0 : 0),
        payment_status: String(r.detected_payment_status || r.payment_status || '').trim().toUpperCase(),
        chasis_number: String(r.chasis_number || '').trim().toUpperCase(),
        engine_number: String(r.engine_number || '').trim().toUpperCase(),
        aadhar_number: String(r.aadhar_number || '').trim(),
        pan_number: String(r.pan_number || '').trim().toUpperCase(),
        software_user_id: String(r.software_user_id || '').trim(),
        software_password: String(r.software_password || '').trim(),
        remarks: String(r.remarks || '').trim()
      }));
    }

    if (rowsToProcess.length === 0) {
      return res.status(400).json({ success: false, error: 'No records to process' });
    }

    const defaultType = db.prepare('SELECT id FROM device_types LIMIT 1').get() || { id: 1 };
    const successful = [];
    const failed = [];

    const processTransaction = db.transaction(() => {
      for (const item of rowsToProcess) {
        const rowNum = item.row_number;
        const cleanImei = item.imei;
        const cleanVehicle = item.vehicle_number;
        const rawName = item.customer_name ? String(item.customer_name).trim() : '';
        const cleanName = (/^(customer|valued customer|client|party|-|—|na|n\/a)$/i.test(rawName)) ? '' : rawName;
        const cleanPhone = item.customer_phone ? cleanPhoneString(item.customer_phone) : '';
        const instDate = item.installation_date || new Date().toISOString().split('T')[0];
        const cleanCategory = item.category || defaultCategory || 'VLTD';
        const cleanTech = item.installed_by ? String(item.installed_by).trim() : '';
        const rawLocation = item.installation_location ? String(item.installation_location).trim() : '';
        const cleanLocation = (/^(field site|-|—|na|n\/a)$/i.test(rawLocation)) ? '' : rawLocation;
        const cleanPrice = item.sale_price || 0;
        const cleanPayStatus = item.payment_status || (cleanPrice > 0 ? 'RECEIVED' : 'NOT RECEIVED');
        const cleanChasis = item.chasis_number || '';
        const cleanEngine = item.engine_number || '';
        const cleanAadhar = item.aadhar_number || '';
        const cleanPan = item.pan_number || '';
        const cleanSoftwareUser = item.software_user_id || '';
        const cleanSoftwarePass = item.software_password || '';
        const cleanRemarks = item.remarks || '';

        // Validation Checks
        if (!cleanImei) {
          failed.push({
            row_number: rowNum,
            imei: '',
            vehicle_number: cleanVehicle,
            customer_name: cleanName,
            phone: cleanPhone,
            reason: 'IMEI number is missing in this row'
          });
          continue;
        }

        if (cleanImei.length < 8) {
          failed.push({
            row_number: rowNum,
            imei: cleanImei,
            vehicle_number: cleanVehicle,
            customer_name: cleanName,
            phone: cleanPhone,
            reason: `Invalid IMEI length (${cleanImei})`
          });
          continue;
        }

        if (!cleanVehicle) {
          failed.push({
            row_number: rowNum,
            imei: cleanImei,
            vehicle_number: '',
            customer_name: cleanName,
            phone: cleanPhone,
            reason: 'Vehicle number is missing in this row'
          });
          continue;
        }

        try {
          // 1. Device Auto-lookup or Create (In-place match with fuzzy/normalized lookup)
          let dev = findDeviceByImei(cleanImei);
          let attrs = {};

          if (!dev) {
            attrs = {
              'CATEGORY': cleanCategory,
              'DEVICE CATEGORY': cleanCategory,
              'PROJECT CATEGORY': cleanCategory,
              'VEHICLE NUMBER': cleanVehicle,
              'INSTALLATION DATE': instDate
            };
            if (cleanName) attrs['CUSTOMER NAME'] = cleanName;
            if (cleanPhone) attrs['CUSTOMER PHONE NUMBER'] = cleanPhone;
            if (cleanTech) attrs['TECHNICIAN'] = cleanTech;
            if (cleanLocation) attrs['RTO LOCATION'] = cleanLocation;
            if (cleanPayStatus) attrs['AMOUNT RECEIVED'] = cleanPayStatus;
            if (cleanPrice) attrs['COST'] = cleanPrice;

            if (item.raw && typeof item.raw === 'object') {
              Object.keys(item.raw).forEach(k => {
                if (!k.startsWith('__EMPTY')) attrs[k] = item.raw[k];
              });
            }

            const holderName = cleanName ? `${cleanName} (${cleanVehicle})` : cleanVehicle;
            const info = db.prepare(`
              INSERT INTO devices (imei_number, device_type_id, purchase_date, vendor_name, current_status, current_holder_type, current_holder_name, additional_attributes)
              VALUES (?, ?, ?, 'Direct Entry', 'INSTALLED', 'CUSTOMER', ?, ?)
            `).run(cleanImei, defaultType.id, instDate, holderName, JSON.stringify(attrs));

            dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
          } else {
            // Existing Device: In-place update preserving master batch/vendor info
            try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
            if (item.raw && typeof item.raw === 'object') {
              Object.keys(item.raw).forEach(k => {
                if (!k.startsWith('__EMPTY')) attrs[k] = item.raw[k];
              });
            }
            attrs['CATEGORY'] = cleanCategory;
            attrs['DEVICE CATEGORY'] = cleanCategory;
            attrs['PROJECT CATEGORY'] = cleanCategory;
            attrs['VEHICLE NUMBER'] = cleanVehicle;
            attrs['INSTALLATION DATE'] = instDate;
            if (cleanCategory.includes('TG MINING') || cleanCategory.includes('MINING')) {
              attrs['TG MINING DATE'] = instDate;
              attrs['MINING DATE'] = instDate;
            }
            if (cleanName) attrs['CUSTOMER NAME'] = cleanName;
            if (cleanPhone) attrs['CUSTOMER PHONE NUMBER'] = cleanPhone;
            if (cleanTech) attrs['TECHNICIAN'] = cleanTech;
            if (cleanLocation) attrs['RTO LOCATION'] = cleanLocation;
            if (cleanPayStatus) attrs['AMOUNT RECEIVED'] = cleanPayStatus;
            if (cleanPrice) attrs['COST'] = cleanPrice;
          }

          if (cleanChasis) attrs['CHASIS NUMBER'] = cleanChasis;
          if (cleanEngine) attrs['ENGINE NUMBER'] = cleanEngine;
          if (cleanAadhar) attrs['AADHAAR NUMBER'] = cleanAadhar;
          if (cleanPan) attrs['PAN NUMBER'] = cleanPan;
          if (cleanSoftwareUser) attrs['USERNAME'] = cleanSoftwareUser;
          if (cleanSoftwarePass) attrs['PASSWORD'] = cleanSoftwarePass;

          // 2. Customer Lookup / Deduplication (only if name or phone exists)
          let customerId = null;
          if (cleanPhone || (cleanName && cleanName !== 'Customer')) {
            let customer = cleanPhone ? db.prepare('SELECT * FROM customers WHERE phone_number = ?').get(cleanPhone) : null;
            if (customer) {
              customerId = customer.id;
              db.prepare(`
                UPDATE customers
                SET name = COALESCE(NULLIF(?, ''), name),
                    aadhar_number = COALESCE(NULLIF(?, ''), aadhar_number),
                    pan_number = COALESCE(NULLIF(?, ''), pan_number),
                    software_user_id = COALESCE(NULLIF(?, ''), software_user_id),
                    software_password = COALESCE(NULLIF(?, ''), software_password)
                WHERE id = ?
              `).run(cleanName || '', cleanAadhar, cleanPan, cleanSoftwareUser, cleanSoftwarePass, customerId);
            } else {
              const custResult = db.prepare(`
                INSERT INTO customers (name, phone_number, customer_type, source, aadhar_number, pan_number, software_user_id, software_password)
                VALUES (?, ?, 'Individual', 'Daily Excel Import', ?, ?, ?, ?)
              `).run(cleanName || null, cleanPhone || null, cleanAadhar || null, cleanPan || null, cleanSoftwareUser || null, cleanSoftwarePass || null);
              customerId = custResult.lastInsertRowid;
            }
          }

          // 3. Upsert Installation Record (Update if exists for this device/IMEI, Insert if new)
          const existingInst = db.prepare('SELECT id FROM installations WHERE device_id = ? OR imei_number = ?').get(dev.id, cleanImei);
          if (existingInst) {
            db.prepare(`
              UPDATE installations
              SET device_id = ?,
                  customer_id = COALESCE(?, customer_id),
                  installation_date = ?,
                  installed_by = COALESCE(?, installed_by),
                  sales_person = COALESCE(?, sales_person),
                  customer_name = COALESCE(?, customer_name),
                  customer_contact = COALESCE(?, customer_contact),
                  vehicle_number = ?,
                  vehicle_type = ?,
                  aadhar_number = COALESCE(?, aadhar_number),
                  pan_number = COALESCE(?, pan_number),
                  chasis_number = COALESCE(?, chasis_number),
                  engine_number = COALESCE(?, engine_number),
                  sale_price = ?,
                  payment_status = ?,
                  installation_location = COALESCE(?, installation_location),
                  remarks = COALESCE(?, remarks),
                  software_user_id = COALESCE(?, software_user_id),
                  software_password = COALESCE(?, software_password)
              WHERE id = ?
            `).run(
              dev.id,
              customerId,
              instDate,
              cleanTech || null,
              cleanTech || null,
              cleanName || null,
              cleanPhone || null,
              cleanVehicle,
              cleanCategory,
              cleanAadhar || null,
              cleanPan || null,
              cleanChasis || null,
              cleanEngine || null,
              cleanPrice,
              cleanPayStatus,
              cleanLocation || null,
              cleanRemarks || null,
              cleanSoftwareUser || null,
              cleanSoftwarePass || null,
              existingInst.id
            );
          } else {
            db.prepare(`
              INSERT INTO installations (
                device_id, imei_number, customer_id, installation_date, installed_by,
                sales_manager, sales_person, customer_name, customer_contact, vehicle_number,
                vehicle_type, aadhar_number, pan_number, chasis_number, engine_number,
                sale_price, payment_status, installation_location, remarks,
                software_user_id, software_password
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              dev.id,
              cleanImei,
              customerId,
              instDate,
              cleanTech || null,
              null,
              cleanTech || null,
              cleanName || null,
              cleanPhone || null,
              cleanVehicle,
              cleanCategory,
              cleanAadhar || null,
              cleanPan || null,
              cleanChasis || null,
              cleanEngine || null,
              cleanPrice,
              cleanPayStatus,
              cleanLocation || null,
              cleanRemarks || null,
              cleanSoftwareUser || null,
              cleanSoftwarePass || null
            );
          }

          // 4. Update Device in place
          const finalHolder = cleanName ? `${cleanName} (${cleanVehicle})` : cleanVehicle;
          db.prepare(`
            UPDATE devices
            SET current_status = 'INSTALLED',
                current_holder_type = 'CUSTOMER',
                current_holder_id = ?,
                current_holder_name = ?,
                additional_attributes = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(customerId, finalHolder, JSON.stringify(attrs), dev.id);

          // 5. Update Dispatches
          db.prepare(`UPDATE dispatch_items SET status = 'INSTALLED' WHERE imei_number = ?`).run(cleanImei);

          // 6. Audit History
          db.prepare(`
            INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
            VALUES (?, ?, 'INSTALLED', datetime('now'), ?, ?, ?, ?)
          `).run(
            dev.id,
            cleanImei,
            dev.current_holder_name || 'Central Warehouse',
            `Customer: ${cleanName} (${cleanVehicle})`,
            cleanTech || 'Admin',
            `Daily Report Install: ${cleanVehicle} (Cat: ${cleanCategory})`
          );

          // 7. 1-Year Warranty Reminder
          const warrantyDue = new Date(new Date(instDate).setFullYear(new Date(instDate).getFullYear() + 1)).toISOString().split('T')[0];
          db.prepare(`
            INSERT INTO reminders (customer_id, device_id, imei_number, type, due_date, status, remarks)
            VALUES (?, ?, ?, 'WARRANTY_EXPIRY', ?, 'PENDING', ?)
          `).run(customerId, dev.id, cleanImei, warrantyDue, `1-Year Warranty & Renewal due for vehicle ${cleanVehicle}`);

          successful.push({
            row_number: rowNum,
            imei: cleanImei,
            vehicle_number: cleanVehicle,
            customer_name: cleanName,
            phone: cleanPhone,
            technician: cleanTech,
            category: cleanCategory,
            date: instDate,
            payment_status: cleanPayStatus
          });

        } catch (rowErr) {
          failed.push({
            row_number: rowNum,
            imei: cleanImei,
            vehicle_number: cleanVehicle,
            customer_name: cleanName,
            phone: cleanPhone,
            reason: rowErr.message || 'Database error during record insertion'
          });
        }
      }
    });

    processTransaction();

    // Auto-sync successfully processed IMEIs to Supabase and Google Sheets
    try {
      const cloudSync = require('../db/cloudSync');
      cloudSync.triggerDebouncedSync(1000);
      const googleSheetsSync = require('../services/googleSheetsSync');
      const successfulImeis = successful.map(s => s.imei).filter(Boolean);
      if (successfulImeis.length > 0) {
        googleSheetsSync.syncBulkDevices(successfulImeis);
      }
    } catch (syncErr) {
      console.warn('[Sync Warning after Excel Upload]', syncErr.message);
    }

    res.json({
      success: true,
      total_count: rowsToProcess.length,
      success_count: successful.length,
      failed_count: failed.length,
      successful,
      failed,
      message: `Processed ${successful.length} of ${rowsToProcess.length} installation(s) successfully.${failed.length > 0 ? ` ${failed.length} record(s) failed.` : ''}`
    });

  } catch (err) {
    console.error('[Excel Upload Error]', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to process daily report upload' });
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

  // Auto-sync instantly to Supabase Cloud Storage & Google Sheets
  try {
    const cloudSync = require('../db/cloudSync');
    cloudSync.triggerDebouncedSync(1000);
    const googleSheetsSync = require('../services/googleSheetsSync');
    const processedImeis = processed.map(p => p.imei).filter(Boolean);
    if (processedImeis.length > 0) {
      googleSheetsSync.syncBulkDevices(processedImeis);
    }
  } catch (e) {}

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
  if (!inst) return 'VLTD';
  let devAttrs = {};
  try {
    devAttrs = typeof inst.device_additional_attributes === 'string'
      ? JSON.parse(inst.device_additional_attributes || '{}')
      : (inst.device_additional_attributes || {});
  } catch {}

  const rawCat = (
    inst.category ||
    devAttrs['CATEGORY'] ||
    devAttrs['DEVICE CATEGORY'] ||
    devAttrs['PROJECT CATEGORY'] ||
    devAttrs['SERVICE CATEGORY'] ||
    devAttrs['Category'] ||
    inst.device_type_category ||
    inst.device_type_name ||
    'VLTD'
  ).toString().toUpperCase().trim();

  if (rawCat.includes('TG MINING') || (rawCat.includes('TG') && rawCat.includes('MINING'))) return 'TG MINING';
  if (rawCat.includes('AP MINING') || (rawCat.includes('AP') && rawCat.includes('MINING'))) return 'AP MINING';
  if (rawCat.includes('VLTD') || rawCat.includes('VLT')) return 'VLTD';
  if (rawCat.includes('GENERAL') || rawCat.includes('BASIC') || rawCat.includes('GPS')) return 'GENERAL';
  return rawCat || 'VLTD';
}

// GET /api/installations/daily-log - Date-wise installation grouping, daily summaries and record ledger
router.get('/daily-log', (req, res) => {
  try {
    const { syncFitmentsToInstallations, standardizeDate, extractInstallationDate } = require('../db/syncFitments');
    try {
      syncFitmentsToInstallations();
    } catch (sErr) {
      console.warn('[DailyLog] Sync fitments notice:', sErr.message);
    }

    const today = new Date().toISOString().split('T')[0];
    const requestedDate = req.query.date ? standardizeDate(req.query.date) : null;

    // Fetch all installations
    const allRows = db.prepare(`
      SELECT i.*, d.sim_number, d.additional_attributes as device_additional_attributes, d.purchase_date as device_purchase_date, dt.name as device_type_name
      FROM installations i
      LEFT JOIN devices d ON i.device_id = d.id
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      ORDER BY i.installation_date DESC, i.id DESC
    `).all();

    const dateMap = {};

    for (const item of allRows) {
      let attrs = {};
      try {
        attrs = typeof item.device_additional_attributes === 'string'
          ? JSON.parse(item.device_additional_attributes || '{}')
          : (item.device_additional_attributes || {});
      } catch {}

      const attrDate = extractInstallationDate(item, attrs);
      const rawInstDate = attrDate || item.installation_date;
      let instDate = '';
      if (rawInstDate && String(rawInstDate).trim()) {
        instDate = standardizeDate(rawInstDate);
      } else if (item.device_purchase_date && String(item.device_purchase_date).trim()) {
        instDate = standardizeDate(item.device_purchase_date);
      } else if (item.created_at && String(item.created_at).trim()) {
        instDate = standardizeDate(item.created_at.split(' ')[0]);
      } else {
        instDate = 'Undated';
      }
      
      let displayDate = instDate;
      if (/^\d{4}-\d{2}-\d{2}$/.test(instDate)) {
        const [y, m, d] = instDate.split('-');
        displayDate = `${d}-${m}-${y}`;
      }

      const cat = (attrs['CATEGORY'] || attrs['DEVICE CATEGORY'] || item.vehicle_type || 'VLTD').toString().toUpperCase().trim();
      const payStatus = (item.payment_status || 'RECEIVED').toUpperCase();
      const isPaid = payStatus.includes('REC') || payStatus.includes('PAID');
      const price = parseFloat(item.sale_price) || 0;

      if (!dateMap[instDate]) {
        dateMap[instDate] = {
          date: instDate,
          display_date: displayDate,
          total_count: 0,
          categories: { 'VLTD': 0, 'TG MINING': 0, 'AP MINING': 0, 'GENERAL': 0, 'OTHER': 0 },
          technicians: new Set(),
          paid_count: 0,
          pending_count: 0,
          total_revenue: 0,
          pending_amount: 0,
          items: []
        };
      }

      dateMap[instDate].total_count++;
      if (cat.includes('TG MINING') || (cat.includes('TG') && cat.includes('MINING'))) {
        dateMap[instDate].categories['TG MINING']++;
      } else if (cat.includes('AP MINING') || (cat.includes('AP') && cat.includes('MINING'))) {
        dateMap[instDate].categories['AP MINING']++;
      } else if (cat.includes('VLTD')) {
        dateMap[instDate].categories['VLTD']++;
      } else if (cat.includes('GENERAL')) {
        dateMap[instDate].categories['GENERAL']++;
      } else {
        dateMap[instDate].categories['OTHER']++;
      }

      if (item.installed_by && item.installed_by.trim() && item.installed_by !== 'Technician') {
        dateMap[instDate].technicians.add(item.installed_by.trim());
      }

      if (isPaid) {
        dateMap[instDate].paid_count++;
        dateMap[instDate].total_revenue += price;
      } else {
        dateMap[instDate].pending_count++;
        dateMap[instDate].pending_amount += price;
      }

      dateMap[instDate].items.push({
        ...item,
        category: cat,
        extracted_date: instDate,
        display_date: displayDate
      });
    }

    // Sort available dates DESC
    const availableDates = Object.keys(dateMap)
      .sort((a, b) => b.localeCompare(a))
      .map(dateKey => {
        const entry = dateMap[dateKey];
        return {
          date: entry.date,
          display_date: entry.display_date,
          total_count: entry.total_count,
          categories: entry.categories,
          technician_count: entry.technicians.size,
          technicians: Array.from(entry.technicians),
          paid_count: entry.paid_count,
          pending_count: entry.pending_count,
          total_revenue: entry.total_revenue,
          pending_amount: entry.pending_amount
        };
      });

    const activeDate = requestedDate || (availableDates.length > 0 ? availableDates[0].date : today);
    const activeDateData = dateMap[activeDate] || {
      date: activeDate,
      display_date: activeDate,
      total_count: 0,
      categories: { 'VLTD': 0, 'TG MINING': 0, 'AP MINING': 0, 'GENERAL': 0, 'OTHER': 0 },
      technicians: [],
      paid_count: 0,
      pending_count: 0,
      total_revenue: 0,
      pending_amount: 0,
      items: []
    };

    res.json({
      success: true,
      server_today: today,
      active_date: activeDate,
      available_dates: availableDates,
      date_summary: {
        date: activeDateData.date,
        display_date: activeDateData.display_date,
        total_count: activeDateData.total_count,
        categories: activeDateData.categories,
        technicians: Array.isArray(activeDateData.technicians) ? activeDateData.technicians : Array.from(activeDateData.technicians),
        paid_count: activeDateData.paid_count,
        pending_count: activeDateData.pending_count,
        total_revenue: activeDateData.total_revenue,
        pending_amount: activeDateData.pending_amount
      },
      records: activeDateData.items
    });

  } catch (err) {
    console.error('[DailyLog Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

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

/**
 * Helper to clean or delete device after installation is removed
 */
function cleanDeviceAfterInstallationDelete(devId, imei) {
  if (!devId && !imei) return;
  try {
    const dev = devId 
      ? db.prepare('SELECT id, vendor_name, purchase_batch_id, additional_attributes FROM devices WHERE id = ?').get(devId)
      : db.prepare('SELECT id, vendor_name, purchase_batch_id, additional_attributes FROM devices WHERE imei_number = ?').get(imei);
    
    if (!dev) return;

    // Reset device status to warehouse stock while safely retaining customer & vehicle metadata in history
    db.prepare(`
      UPDATE devices 
      SET current_status = 'IN_WAREHOUSE', 
          current_holder_type = 'WAREHOUSE', 
          current_holder_name = 'Central Warehouse', 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(dev.id);
  } catch (err) {
    console.warn('[cleanDeviceAfterInstallationDelete error]', err.message);
  }
}

// DELETE /api/installations/clear-all - Delete ALL daily installation reports & records
router.delete('/clear-all', (req, res) => {
  try {
    const { extractInstallationDate } = require('../db/syncFitments');

    const transaction = db.transaction(() => {
      // 1. Get all installations and linked devices
      const allInsts = db.prepare('SELECT id, device_id, imei_number FROM installations').all();
      const devIds = allInsts.map(i => i.device_id).filter(Boolean);
      const imeis = allInsts.map(i => i.imei_number).filter(Boolean);

      // 2. Delete all records from installations table
      const deleteResult = db.prepare('DELETE FROM installations').run();

      // 3. Find all devices that are marked INSTALLED or Direct Entry
      const devices = db.prepare(`
        SELECT id, imei_number, vendor_name, purchase_batch_id, additional_attributes 
        FROM devices 
        WHERE current_status = 'INSTALLED' 
           OR vendor_name = 'Direct Entry'
      `).all();

      for (const dev of devices) {
        cleanDeviceAfterInstallationDelete(dev.id, dev.imei_number);
      }

      for (const id of devIds) {
        cleanDeviceAfterInstallationDelete(id, null);
      }

      for (const imei of imeis) {
        cleanDeviceAfterInstallationDelete(null, imei);
      }

      return deleteResult.changes;
    });

    const deletedCount = transaction();

    try {
      const cloudSync = require('../db/cloudSync');
      cloudSync.triggerDebouncedSync(1000);
    } catch (e) {}

    res.json({
      success: true,
      deleted_count: deletedCount,
      message: `Successfully cleared all ${deletedCount} installation reports.`
    });
  } catch (err) {
    console.error('[ClearAllInstallations Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/installations/by-date - Delete installation records for a specific date
router.delete('/by-date', (req, res) => {
  try {
    const rawDate = req.query.date || req.body.date;
    if (!rawDate) {
      return res.status(400).json({ success: false, error: 'Date is required to delete daily records' });
    }

    const { standardizeDate, extractInstallationDate } = require('../db/syncFitments');
    const targetDate = standardizeDate(rawDate);
    
    // Also support dd-mm-yyyy matching
    let altDate = targetDate;
    if (/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      const [y, m, d] = targetDate.split('-');
      altDate = `${d}-${m}-${y}`;
    } else if (/^\d{2}-\d{2}-\d{4}$/.test(targetDate)) {
      const [d, m, y] = targetDate.split('-');
      altDate = `${y}-${m}-${d}`;
    }

    const transaction = db.transaction(() => {
      // Find all installations with this installation_date or matching date
      const matchingInsts = db.prepare(`
        SELECT i.id, i.device_id, i.imei_number, i.installation_date, d.additional_attributes, d.vendor_name, d.purchase_batch_id
        FROM installations i
        LEFT JOIN devices d ON i.device_id = d.id
        WHERE i.installation_date = ? 
           OR i.installation_date = ?
           OR i.installation_date LIKE ?
      `).all(targetDate, altDate, `%${targetDate}%`);

      // Also find all devices whose extracted date matches targetDate
      const allDevs = db.prepare('SELECT id, imei_number, vendor_name, purchase_batch_id, additional_attributes, current_status FROM devices').all();
      const extraDevs = [];

      for (const dev of allDevs) {
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
        const devDate = extractInstallationDate(dev, attrs);
        if (devDate === targetDate || devDate === altDate) {
          extraDevs.push(dev);
        }
      }

      const instIdsToDelete = new Set(matchingInsts.map(i => i.id));
      
      // Also match installations that have device_id in extraDevs
      for (const ed of extraDevs) {
        const found = db.prepare('SELECT id FROM installations WHERE device_id = ? OR imei_number = ?').all(ed.id, ed.imei_number);
        for (const f of found) {
          instIdsToDelete.add(f.id);
        }
      }

      const deleteInstStmt = db.prepare('DELETE FROM installations WHERE id = ?');
      for (const id of instIdsToDelete) {
        deleteInstStmt.run(id);
      }

      // Clean up linked devices
      const processedDevIds = new Set();
      const allTargetDevs = [
        ...matchingInsts.map(i => ({ id: i.device_id, imei_number: i.imei_number })),
        ...extraDevs.map(d => ({ id: d.id, imei_number: d.imei_number }))
      ].filter(d => d && (d.id || d.imei_number));

      for (const dev of allTargetDevs) {
        const key = dev.id ? `id_${dev.id}` : `imei_${dev.imei_number}`;
        if (processedDevIds.has(key)) continue;
        processedDevIds.add(key);
        cleanDeviceAfterInstallationDelete(dev.id, dev.imei_number);
      }

      return instIdsToDelete.size;
    });

    const deletedCount = transaction();

    try {
      const cloudSync = require('../db/cloudSync');
      cloudSync.triggerDebouncedSync(1000);
    } catch (e) {}

    res.json({
      success: true,
      deleted_count: deletedCount,
      date: targetDate,
      message: `Successfully deleted ${deletedCount} installation records for ${targetDate}.`
    });
  } catch (err) {
    console.error('[DeleteByDate Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/installations/bulk-delete - Delete multiple installations by IDs or IMEIs
router.post('/bulk-delete', (req, res) => {
  try {
    const { ids = [], imeis = [] } = req.body;
    if ((!ids || ids.length === 0) && (!imeis || imeis.length === 0)) {
      return res.status(400).json({ success: false, error: 'No installations specified for deletion' });
    }

    const transaction = db.transaction(() => {
      let insts = [];
      if (ids && ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        insts = db.prepare(`SELECT i.id, i.device_id, i.imei_number FROM installations i WHERE i.id IN (${placeholders})`).all(...ids);
      } else if (imeis && imeis.length > 0) {
        const placeholders = imeis.map(() => '?').join(',');
        insts = db.prepare(`SELECT i.id, i.device_id, i.imei_number FROM installations i WHERE i.imei_number IN (${placeholders})`).all(...imeis);
      }

      const deleteInstStmt = db.prepare('DELETE FROM installations WHERE id = ?');
      let count = 0;

      for (const inst of insts) {
        deleteInstStmt.run(inst.id);
        count++;
        cleanDeviceAfterInstallationDelete(inst.device_id, inst.imei_number);
      }

      return count;
    });

    const deletedCount = transaction();

    try {
      const cloudSync = require('../db/cloudSync');
      cloudSync.triggerDebouncedSync(1000);
    } catch (e) {}

    res.json({
      success: true,
      deleted_count: deletedCount,
      message: `Deleted ${deletedCount} installations successfully.`
    });
  } catch (err) {
    console.error('[BulkDeleteInstallations Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/installations/:id - Delete single installation
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const inst = db.prepare(`
      SELECT i.*, d.vendor_name, d.purchase_batch_id, d.additional_attributes
      FROM installations i
      LEFT JOIN devices d ON i.device_id = d.id
      WHERE i.id = ?
    `).get(id);

    if (!inst) {
      return res.status(404).json({ success: false, error: 'Installation record not found' });
    }

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM installations WHERE id = ?').run(id);
      cleanDeviceAfterInstallationDelete(inst.device_id, inst.imei_number);
    });

    transaction();

    try {
      const cloudSync = require('../db/cloudSync');
      cloudSync.triggerDebouncedSync(1000);
    } catch (e) {}

    res.json({ success: true, message: 'Installation record deleted successfully.' });
  } catch (err) {
    console.error('[DeleteInstallation Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
