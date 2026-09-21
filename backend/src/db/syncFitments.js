// Lazy database getter to prevent circular dependency on initialization
function getDb(customDb) {
  if (customDb && typeof customDb.prepare === 'function') return customDb;
  return require('./database');
}

/**
 * Normalize date into standard YYYY-MM-DD
 */
function standardizeDate(rawDate) {
  if (rawDate === undefined || rawDate === null) return '';
  
  // 1. Number or Excel serial integer (e.g. 46283)
  if (typeof rawDate === 'number' || /^\d{5}$/.test(String(rawDate).trim())) {
    const num = Number(rawDate);
    if (num > 30000 && num < 65000) {
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    }
  }

  const str = String(rawDate).trim();
  if (!str) return '';

  // 2. ISO timestamp or date starting with YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // 3. Match DD-MM-YYYY or DD/MM/YYYY or D-M-YYYY or D/M/YYYY
  const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // 4. Match YYYY/MM/DD or YYYY-MM-DD
  const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, '0');
    const day = ymd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 5. JavaScript Date parsing fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
    return parsed.toISOString().split('T')[0];
  }

  return str;
}

/**
 * Extract vehicle number from device and attributes
 */
function extractVehicleNumber(dev = {}, attrs = {}) {
  const keys = [
    'VEHICLE NUMBER', 'Vehicle Number', 'Vehicle ID', 'Vehicle No', 'VEHICLE NO', 
    'Reg No', 'vehicle_number', 'vehicle_no', 'MACHINERY NUMBER', 'EQUIPMENT NUMBER'
  ];
  for (const k of keys) {
    if (attrs[k] && String(attrs[k]).trim()) {
      const val = String(attrs[k]).trim().toUpperCase();
      if (/^VAMO1AA|^TNOW|^VOLTY|^VLT1AA|^[0-9]{15}$/i.test(val) || (attrs.vltdsno && val === attrs.vltdsno) || val === '-' || val === '—' || val === 'NULL') {
        continue;
      }
      return val;
    }
  }
  return '';
}

/**
 * Extract clean customer name
 */
function extractCustomerName(attrs = {}) {
  const keys = ['CUSTOMER NAME', 'Customer Name', 'CERTIFICATE ISSUED TO', 'Certificate Issued To', 'Name', 'Customer', 'client_name', 'owner_name', 'MINING SITE', 'SITE NAME'];
  for (const k of keys) {
    if (attrs[k] && String(attrs[k]).trim()) {
      const val = String(attrs[k]).trim();
      if (val.toLowerCase() !== 'fuelview' && val !== '-' && val !== '—') {
        return val;
      }
    }
  }
  return 'Customer';
}

/**
 * Extract customer phone
 */
function extractCustomerPhone(attrs = {}) {
  const keys = ['CUSTOMER PHONE NUMBER', 'Customer Phone Number', 'CUSTOMER PHONE', 'Customer Phone', 'Phone Number', 'phone_number', 'MOBILE', 'Mobile', 'PHONE', 'Phone', 'CUSTOMER CONTACT', 'Customer Contact'];
  for (const k of keys) {
    if (attrs[k] && String(attrs[k]).trim()) {
      const clean = String(attrs[k]).replace(/[^0-9]/g, '');
      if (clean.length >= 10) return clean;
    }
  }
  return '9999999999';
}

/**
 * Extract sale price / cost
 */
function extractSalePrice(attrs = {}, dev = {}) {
  const keys = ['TOTAL COST', 'Total Cost', 'TOTAL_COST', 'COST', 'Cost', 'SALE PRICE', 'Sale Price', 'PRICE', 'Price', 'INSTALLATION CHARGES', 'Amount', 'AMOUNT'];
  for (const k of keys) {
    if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
      const clean = String(attrs[k]).replace(/[^0-9.]/g, '');
      if (clean && !isNaN(Number(clean)) && Number(clean) > 0) {
        return Number(clean);
      }
    }
  }
  if (dev.purchase_price && Number(dev.purchase_price) > 0) {
    return Number(dev.purchase_price);
  }
  return 0;
}

/**
 * Extract payment status: RECEIVED vs PENDING
 */
function extractPaymentStatus(attrs = {}) {
  const rawStatus = attrs['AMOUNT RECEIVED'] || attrs['Amount Received'] || attrs['PAYMENT STATUS'] || attrs['Payment Status'] || attrs['AMOUNT RECEIVED STATUS'] || '';
  if (rawStatus && String(rawStatus).trim()) {
    const val = String(rawStatus).trim().toUpperCase();
    if (val.includes('NOT') || val.includes('UNPAID') || val.includes('PENDING') || val.includes('DUE') || val === 'NO') {
      return 'PENDING';
    }
    if (val.includes('REC') || val.includes('PAID') || val.includes('DONE') || val === 'YES') {
      return 'RECEIVED';
    }
  }
  if (attrs['AMOUNT RECEIVED BY'] && String(attrs['AMOUNT RECEIVED BY']).trim()) {
    return 'RECEIVED';
  }
  return 'PENDING';
}

/**
 * Extract installation/effective date
 */
function extractInstallationDate(dev = {}, attrs = {}) {
  const keys = [
    'CERTIFICATE ISSUED DATE', 'Certificate Issued Date', 'certificate_issued_date',
    'CERTIFICATE DATE', 'Certificate Date', 'certificate_date',
    'INSTALLATION DATE', 'Installation Date', 'installation_date',
    'TG MINING DATE', 'TG_MINING_DATE', 'Tg Mining Date', 'tg_mining_date',
    'MINING DATE', 'Mining Date', 'mining_date',
    'STOCK PLACE DATE', 'Stock Place Date',
    'PAYMENT RECEIVED DATE', 'Payment Received Date',
    'PAYMENT DATE', 'Payment Date',
    'DATE', 'Date'
  ];
  for (const k of keys) {
    if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
      const parsed = standardizeDate(attrs[k]);
      if (parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
    }
  }
  if (dev.purchase_date) {
    const parsed = standardizeDate(dev.purchase_date);
    if (parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
  }
  if (dev.created_at) {
    const parsed = standardizeDate(dev.created_at);
    if (parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
  }
  return '';
}

/**
 * Core idempotent synchronization from devices table to installations & customers tables
 */
function syncFitmentsToInstallations(dbParam) {
  try {
    const db = getDb(dbParam);
    const devices = db.prepare('SELECT * FROM devices').all();
    if (!devices || devices.length === 0) return { synchronized: 0 };

    let createdCount = 0;
    let updatedCount = 0;

    const findCustomerByPhoneStmt = db.prepare('SELECT id FROM customers WHERE phone_number = ?');
    const insertCustomerStmt = db.prepare(`
      INSERT INTO customers (name, phone_number, email, address, aadhar_number, pan_number, software_user_id, software_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const findInstByDeviceOrImeiStmt = db.prepare('SELECT id, payment_status, sale_price, vehicle_number, installation_date FROM installations WHERE device_id = ? OR imei_number = ?');
    const insertInstStmt = db.prepare(`
      INSERT INTO installations (
        device_id, imei_number, customer_id, installation_date, installed_by,
        sales_manager, sales_person, customer_name, customer_contact,
        vehicle_number, vehicle_type, sale_price, installation_location,
        payment_status, aadhar_number, pan_number, chasis_number,
        engine_number, software_user_id, software_password, payment_date,
        remarks
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?
      )
    `);

    const updateInstStmt = db.prepare(`
      UPDATE installations
      SET device_id = ?,
          customer_id = COALESCE(?, customer_id),
          installation_date = COALESCE(NULLIF(?, ''), installation_date),
          customer_name = COALESCE(?, customer_name),
          customer_contact = COALESCE(?, customer_contact),
          vehicle_number = COALESCE(?, vehicle_number),
          sale_price = ?,
          payment_status = ?,
          software_user_id = COALESCE(?, software_user_id),
          software_password = COALESCE(?, software_password),
          installation_location = COALESCE(?, installation_location)
      WHERE id = ?
    `);

    const updateDeviceStmt = db.prepare(`
      UPDATE devices
      SET current_status = 'INSTALLED',
          current_holder_type = 'CUSTOMER',
          current_holder_id = ?,
          current_holder_name = ?
      WHERE id = ?
    `);

    const syncTx = db.transaction(() => {
      for (const dev of devices) {
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch { attrs = {}; }

        const vehicleNo = extractVehicleNumber(dev, attrs);
        const hasCert = Boolean(attrs['CERTIFICATE ISSUED DATE'] || attrs['Certificate Issued Date']);
        const isInstalled = dev.current_status === 'INSTALLED' || Boolean(vehicleNo) || hasCert;

        if (!isInstalled && !vehicleNo) continue;

        const effectiveVehicle = vehicleNo || (dev.current_status === 'INSTALLED' ? `INSTALLED-${dev.imei_number.slice(-4)}` : '');
        if (!effectiveVehicle) continue;

        const customerName = extractCustomerName(attrs);
        const customerPhone = extractCustomerPhone(attrs);
        const salePrice = extractSalePrice(attrs, dev);
        const paymentStatus = extractPaymentStatus(attrs);
        const instDate = extractInstallationDate(dev, attrs);
        const category = (attrs['CATEGORY'] || attrs['DEVICE CATEGORY'] || attrs['PROJECT CATEGORY'] || 'VLTD').toString().trim().toUpperCase();
        const location = attrs['RTO LOCATION'] || attrs['STOCK PLACE'] || attrs['LOCATION'] || 'Vijayawada';
        const technician = attrs['TECHNICIAN'] || attrs['INSTALLED BY'] || attrs['FITTER'] || attrs['SALES PERSON NAME'] || 'Technician';
        const salesManager = attrs['SALES MANAGER'] || null;
        const salesPerson = attrs['SALES PERSON NAME'] || attrs['SALES PERSON'] || null;
        const softwareUser = attrs['USERNAME'] || attrs['SOFTWARE USER ID'] || attrs['GPS USER ID'] || null;
        const softwarePass = attrs['PASSWORD'] || attrs['SOFTWARE PASSWORD'] || attrs['GPS PASSWORD'] || '123456';

        // 1. Customer Lookup / Creation
        let customer = findCustomerByPhoneStmt.get(customerPhone);
        let customerId;
        if (customer) {
          customerId = customer.id;
        } else {
          const custRes = insertCustomerStmt.run(
            customerName,
            customerPhone,
            attrs['EMAIL ID'] || null,
            location,
            attrs['AADHAR NUMBER'] || null,
            attrs['PAN CARD'] || attrs['PAN NUMBER'] || null,
            softwareUser,
            softwarePass
          );
          customerId = custRes.lastInsertRowid;
        }

        // 2. Check if installation exists
        const existing = findInstByDeviceOrImeiStmt.get(dev.id, dev.imei_number);
        if (!existing) {
          insertInstStmt.run(
            dev.id,
            dev.imei_number,
            customerId,
            instDate,
            technician,
            salesManager,
            salesPerson,
            customerName,
            customerPhone,
            effectiveVehicle,
            category,
            salePrice,
            location,
            paymentStatus,
            attrs['AADHAR NUMBER'] || null,
            attrs['PAN CARD'] || attrs['PAN NUMBER'] || null,
            attrs['CHASIS NUMBER'] || null,
            attrs['ENGINE NUMBER'] || null,
            softwareUser,
            softwarePass,
            paymentStatus === 'RECEIVED' ? instDate : null,
            `Auto-synced fitment - Location: ${location}`
          );
          createdCount++;
        } else {
          // Update installation record with linked device_id and latest status
          updateInstStmt.run(
            dev.id,
            customerId,
            instDate,
            customerName,
            customerPhone,
            effectiveVehicle,
            salePrice,
            paymentStatus,
            softwareUser,
            softwarePass,
            location,
            existing.id
          );
          updatedCount++;
        }

        // Ensure device status is marked INSTALLED
        if (dev.current_status !== 'INSTALLED' || !dev.current_holder_name || dev.current_holder_name.includes('Warehouse')) {
          updateDeviceStmt.run(customerId, `${customerName} (${effectiveVehicle})`, dev.id);
        }
      }
    });

    syncTx();
    return { synchronized: createdCount + updatedCount, created: createdCount, updated: updatedCount };
  } catch (err) {
    console.warn('[SyncFitments] Warning during fitments sync:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  syncFitmentsToInstallations,
  standardizeDate,
  extractVehicleNumber,
  extractCustomerName,
  extractCustomerPhone,
  extractSalePrice,
  extractPaymentStatus,
  extractInstallationDate
};
