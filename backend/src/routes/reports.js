const express = require('express');
const router = express.Router();
const db = require('../db/database');
const xlsx = require('xlsx');
const ExcelJS = require('exceljs');

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

// Helper: Parse exact Month name from date string, month string, or Excel serial
function parseMonthFromValue(val) {
  if (!val) return null;
  
  // 1. If it is already a Month name (e.g. "JULY", "JUNE", "August", "Jul", etc.)
  const str = String(val).trim().toUpperCase();
  if (MONTH_NAMES.includes(str)) return str;
  const directMatch = MONTH_NAMES.find(m => str.startsWith(m) || m.startsWith(str));
  if (directMatch && str.length >= 3) return directMatch;

  // 2. Excel serial integer (e.g. 46089, 46030, etc.)
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 65000 && !String(val).includes('-') && !String(val).includes('/')) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    const m = d.getUTCMonth();
    if (m >= 0 && m <= 11) return MONTH_NAMES[m];
  }

  // 3. String date formats: DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, etc.
  const parts = String(val).trim().split(/[-/]/);
  if (parts.length === 3) {
    let m = NaN;
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      m = parseInt(parts[1], 10);
    } else if (parts[2].length === 4 || parts[2].length === 2) {
      // DD-MM-YYYY
      m = parseInt(parts[1], 10);
    }
    if (!isNaN(m) && m >= 1 && m <= 12) {
      return MONTH_NAMES[m - 1];
    }
  }

  return null;
}

// Helper: Extract accurate operational Month from device attributes, certificate dates, or created dates
function getDeviceMonth(device = {}, attrs = {}) {
  // 1. Highest Priority: Explicit MONTH / RECEIVEDMONTH column in spreadsheet
  for (const k of Object.keys(attrs)) {
    if (/^month$|^received.*month$/i.test(k.trim()) && attrs[k]) {
      const parsed = parseMonthFromValue(attrs[k]);
      if (parsed) return parsed;
    }
  }

  // 2. Key operational date columns in priority order
  const priorityDateKeys = [
    'PAYMENT RECEIVED DATE',
    'PAYMENT DATE',
    'CERTIFICATE ISSUED DATE',
    'CERTIFICATE ISSUED',
    'INSTALLATION DATE',
    'SIM ACTIVATION DATE',
    'SIM ACTIVATED DATE',
    'DATE',
    'STOCK PLACE DATE'
  ];

  for (const k of priorityDateKeys) {
    if (attrs[k]) {
      const parsed = parseMonthFromValue(attrs[k]);
      if (parsed) return parsed;
    }
  }

  // Check any remaining attribute containing "date" or "month"
  for (const k of Object.keys(attrs)) {
    if (/date|month/i.test(k) && attrs[k]) {
      const parsed = parseMonthFromValue(attrs[k]);
      if (parsed) return parsed;
    }
  }

  // 3. Fallback: check device serial number (e.g. VAMO1AA0626 -> 06 = JUNE)
  const serialKey = Object.keys(attrs).find(k => /vltdsno|serial/i.test(k));
  if (serialKey && attrs[serialKey]) {
    const s = String(attrs[serialKey]);
    if (s.includes('0626')) return 'JUNE';
    if (s.includes('0726')) return 'JULY';
    if (s.includes('0826')) return 'AUGUST';
  }

  if (device && device.purchase_date) {
    const d = new Date(device.purchase_date);
    if (!isNaN(d.getTime())) return MONTH_NAMES[d.getMonth()];
  }

  return 'AUGUST';
}

// Helper: Format Excel date serial numbers or standard date strings into clean DD-MM-YYYY
function formatExcelDate(val) {
  if (!val) return '';
  if (typeof val === 'number' || (!isNaN(val) && !String(val).includes('-') && !String(val).includes('/'))) {
    const num = Number(val);
    if (num > 30000 && num < 60000) {
      // Excel epoch date conversion (1900 system)
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${day}-${month}-${year}`;
    }
  }
  return String(val).trim();
}

// Helper: Extract real vehicle number (excluding VLTD device serial numbers)
function getVehicleNumber(device, attrs = {}) {
  const keys = ['VEHICLE NUMBER', 'Vehicle Number', 'Vehicle ID', 'Vehicle No', 'VEHICLE NO', 'Reg No', 'vehicle_number'];
  for (const k of keys) {
    if (attrs[k] && String(attrs[k]).trim()) {
      const val = String(attrs[k]).trim();
      // Skip if it is actually a VLTD serial number or IMEI
      if (/^VAMO1AA|^TNOW|^VOLTY|^VLT1AA|^[0-9]{15}$/i.test(val) || (attrs.vltdsno && val === attrs.vltdsno)) {
        continue;
      }
      return val;
    }
  }
  return '';
}

// Helper: Extract stock place from attributes
function getStockPlace(attrs = {}) {
  const placeKey = Object.keys(attrs).find(k => /stock.*place|place|location|office|site|branch/i.test(k));
  if (placeKey && attrs[placeKey]) {
    return String(attrs[placeKey]).trim();
  }
  return '';
}

// Helper: Extract real customer name (prioritizing actual person / company owner over generic software platform names)
function getCustomerName(attrs = {}) {
  if (attrs['CUSTOMER NAME'] && String(attrs['CUSTOMER NAME']).trim()) {
    return String(attrs['CUSTOMER NAME']).trim();
  }
  if (attrs['CERTIFICATE ISSUED TO'] && String(attrs['CERTIFICATE ISSUED TO']).trim()) {
    return String(attrs['CERTIFICATE ISSUED TO']).trim();
  }
  if (attrs['Name'] && String(attrs['Name']).trim()) {
    return String(attrs['Name']).trim();
  }
  if (attrs['Customer'] && String(attrs['Customer']).trim() && String(attrs['Customer']).trim().toLowerCase() !== 'fuelview') {
    return String(attrs['Customer']).trim();
  }
  const custKey = Object.keys(attrs).find(k => /customer.*name|client|owner/i.test(k));
  if (custKey && attrs[custKey]) {
    return String(attrs[custKey]).trim();
  }
  return '—';
}

// Helper: Extract customer phone from attributes
function getCustomerPhone(attrs = {}) {
  const phoneKey = Object.keys(attrs).find(k => /phone|contact|mobile/i.test(k));
  if (phoneKey && attrs[phoneKey]) {
    return String(attrs[phoneKey]).trim();
  }
  return '—';
}

// Helper: Extract clean Device Name (without prepended serial indexes)
function getDeviceName(device, attrs = {}) {
  const devKey = Object.keys(attrs).find(k => /device.*name|model|product.*name/i.test(k));
  let name = '';
  if (devKey && attrs[devKey]) {
    name = String(attrs[devKey]).trim();
  } else {
    name = device.device_type_name || 'GPS Tracker';
  }
  return name.replace(/^[0-9]+[\s.-]*/, '').trim() || name;
}

// Helper: Extract SIM numbers (supports Sim 1, Sim 2, simno1, simno2, or primary SIM)
function getSimNumbers(device, attrs = {}) {
  const sim1 = attrs['Sim 1'] || attrs['simno1'] || attrs['SIM NUMBER'] || device.sim_number || '';
  const sim2 = attrs['Sim 2'] || attrs['simno2'] || '';
  const sims = [sim1, sim2].filter(Boolean).map(s => String(s).trim());
  return sims.length > 0 ? sims.join(' / ') : '—';
}

// Helper: Extract Total Cost / Cost strictly as formatted currency numbers (ignoring text like "NOT RECEIVED")
function getTotalCost(attrs = {}) {
  const keys = ['TOTAL COST', 'TOTAL_COST', 'COST', 'SALE PRICE', 'PRICE', 'INSTALLATION CHARGES'];
  for (const k of keys) {
    if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
      const clean = String(attrs[k]).replace(/[^0-9.]/g, '');
      if (clean && !isNaN(Number(clean))) {
        return `₹${Number(clean).toLocaleString('en-IN')}`;
      }
    }
  }
  if (attrs['Amount']) {
    const clean = String(attrs['Amount']).replace(/[^0-9.]/g, '');
    if (clean && !isNaN(Number(clean))) {
      return `₹${Number(clean).toLocaleString('en-IN')}`;
    }
  }
  return '—';
}

// Helper: Extract clean Amount Received Status (RECEIVED, NOT RECEIVED, or RECEIVED with recipient)
function getAmountReceivedStatus(attrs = {}) {
  const rawStatus = attrs['AMOUNT RECEIVED'] || attrs['Amount Received'] || attrs['PAYMENT STATUS'];
  if (rawStatus && String(rawStatus).trim()) {
    const val = String(rawStatus).trim().toUpperCase();
    if (val.includes('NOT') || val.includes('UNPAID') || val.includes('PENDING') || val.includes('DUE')) {
      return 'NOT RECEIVED';
    }
    if (val.includes('REC') || val.includes('PAID') || val.includes('DONE')) {
      return 'RECEIVED';
    }
    return val;
  }

  // Check if amount was received by a specific person
  if (attrs['AMOUNT RECEIVED BY'] && String(attrs['AMOUNT RECEIVED BY']).trim()) {
    const by = String(attrs['AMOUNT RECEIVED BY']).trim();
    return `RECEIVED (${by})`;
  }

  return '—';
}

// Helper: Extract Date
function getDateValue(device, attrs = {}) {
  const explicitDate = attrs['STOCK PLACE DATE'] || attrs['Stock Place Date'] || attrs['CERTIFICATE ISSUED DATE'] || attrs['Certificate Issued Date'] || attrs['INSTALLATION DATE'] || attrs['Installation Date'];
  if (explicitDate) {
    return formatExcelDate(explicitDate);
  }
  const dateKey = Object.keys(attrs).find(k => /certificate.*date|stock.*date|dispatch.*date|^date$/i.test(k.trim()));
  if (dateKey && attrs[dateKey]) {
    return formatExcelDate(attrs[dateKey]);
  }
  return formatExcelDate(device.purchase_date || (device.created_at ? device.created_at.split(' ')[0] : ''));
}

// Helper: Match stock place
function matchStockPlace(attrs = {}, targetPlace) {
  if (!targetPlace) return true;
  const placeKey = Object.keys(attrs).find(k => /stock.*place|place|location|office|site|branch/i.test(k));
  if (!placeKey || !attrs[placeKey]) return false;
  const actualVal = String(attrs[placeKey]).trim().toLowerCase();
  const searchVal = targetPlace.trim().toLowerCase();
  return actualVal === searchVal || actualVal.includes(searchVal);
}

// Helper: Match installation
function matchInstalled(dev, attrs = {}, installedFilter) {
  if (!installedFilter || installedFilter === 'all') return true;
  const vehVal = getVehicleNumber(dev, attrs);
  const isInstalled = Boolean(vehVal) || dev.current_status === 'INSTALLED';
  if (installedFilter === 'installed') return isInstalled;
  if (installedFilter === 'uninstalled') return !isInstalled;
  return true;
}

// GET /api/reports/options - Return filter options, available months, and summary counts
router.get('/options', (req, res) => {
  try {
    const batches = db.prepare(`
      SELECT pb.id, pb.notes, pb.source_file, pb.vendor_name, pb.upload_date,
             (SELECT COUNT(*) FROM devices d WHERE d.purchase_batch_id = pb.id) as live_devices_count
      FROM purchase_batches pb
      ORDER BY pb.upload_date DESC
    `).all();

    const deviceTypes = db.prepare(`
      SELECT dt.id, dt.name, dt.category,
             (SELECT COUNT(*) FROM devices d WHERE d.device_type_id = dt.id) as device_count
      FROM device_types dt
      ORDER BY dt.name ASC
    `).all();

    const allDevices = db.prepare(`
      SELECT d.id, d.purchase_batch_id, d.purchase_date, d.created_at, d.current_status, d.additional_attributes
      FROM devices d
    `).all();

    const batchPlacesMap = {};
    const placesMap = {};
    const monthsMap = {};
    MONTH_NAMES.forEach(m => {
      monthsMap[m] = { month: m, total: 0, received: 0, pending: 0 };
    });

    let totalInstalled = 0;

    allDevices.forEach(d => {
      let attrs = {};
      try { attrs = JSON.parse(d.additional_attributes || '{}'); } catch {}
      
      const vehNo = getVehicleNumber(d, attrs);
      const isInstalled = Boolean(vehNo) || d.current_status === 'INSTALLED';
      if (isInstalled) totalInstalled++;

      const place = getStockPlace(attrs);
      if (place) {
        placesMap[place] = (placesMap[place] || 0) + 1;
        const bId = d.purchase_batch_id ? String(d.purchase_batch_id) : 'none';
        if (!batchPlacesMap[bId]) batchPlacesMap[bId] = {};
        batchPlacesMap[bId][place] = (batchPlacesMap[bId][place] || 0) + 1;
      }

      // Track months and payments
      const m = getDeviceMonth(d, attrs);
      const payStatus = getAmountReceivedStatus(attrs);
      const isPaid = payStatus.includes('RECEIVED') && !payStatus.includes('NOT');
      if (m && monthsMap[m]) {
        monthsMap[m].total++;
        if (isPaid) monthsMap[m].received++;
        else monthsMap[m].pending++;
      }
    });

    const stockPlaces = Object.keys(placesMap).map(place => ({
      name: place,
      count: placesMap[place]
    })).sort((a, b) => b.count - a.count);

    const availableMonths = Object.values(monthsMap).filter(m => m.total > 0);

    res.json({
      success: true,
      data: {
        batches,
        deviceTypes,
        stockPlaces,
        batchPlacesMap,
        availableMonths,
        allMonths: MONTH_NAMES,
        stats: {
          totalDevices: allDevices.length,
          installedDevices: totalInstalled,
          uninstalledDevices: allDevices.length - totalInstalled
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: Query and filter devices
function queryFilteredDevices(query) {
  const {
    purchase_batch_id,
    stock_place,
    installed_filter, // 'all' | 'installed' | 'uninstalled'
    status,
    device_type_id,
    month,
    payment_status,
    start_date,
    end_date,
    search
  } = query;

  let sql = `
    SELECT 
      d.*,
      dt.name as device_type_name,
      dt.category as device_type_category,
      pb.notes as batch_notes,
      pb.source_file as batch_source_file
    FROM devices d
    JOIN device_types dt ON d.device_type_id = dt.id
    LEFT JOIN purchase_batches pb ON d.purchase_batch_id = pb.id
    WHERE 1=1
  `;
  const params = [];

  if (purchase_batch_id) {
    sql += ` AND d.purchase_batch_id = ?`;
    params.push(purchase_batch_id);
  }

  if (device_type_id) {
    sql += ` AND d.device_type_id = ?`;
    params.push(device_type_id);
  }

  if (status && status !== 'ALL') {
    sql += ` AND d.current_status = ?`;
    params.push(status);
  }

  if (start_date) {
    sql += ` AND (d.purchase_date >= ? OR d.created_at >= ?)`;
    params.push(start_date, start_date);
  }

  if (end_date) {
    sql += ` AND (d.purchase_date <= ? OR d.created_at <= ?)`;
    params.push(end_date, end_date + ' 23:59:59');
  }

  if (search) {
    sql += ` AND (d.imei_number LIKE ? OR d.sim_number LIKE ? OR d.vendor_name LIKE ? OR d.additional_attributes LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY d.id ASC`;

  const devices = db.prepare(sql).all(...params);

  // In-memory filter for dynamic JSON attributes
  return devices.filter(dev => {
    let attrs = {};
    try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

    if (stock_place && !matchStockPlace(attrs, stock_place)) {
      return false;
    }

    if (!matchInstalled(dev, attrs, installed_filter)) {
      return false;
    }

    // Month filter
    if (month && month !== 'ALL') {
      const devMonth = getDeviceMonth(dev, attrs);
      const targetMonth = month.toUpperCase().trim();
      if (!devMonth || (!devMonth.includes(targetMonth) && !targetMonth.includes(devMonth))) {
        return false;
      }
    }

    // Payment Status filter
    if (payment_status && payment_status !== 'ALL') {
      const amountStatus = getAmountReceivedStatus(attrs);
      const isPaid = amountStatus.includes('RECEIVED') && !amountStatus.includes('NOT');
      const pStatus = payment_status.toUpperCase().trim();
      if (pStatus === 'RECEIVED' || pStatus === 'PAID') {
        if (!isPaid) return false;
      } else if (pStatus === 'PENDING' || pStatus === 'NOT_RECEIVED' || pStatus === 'NOT RECEIVED') {
        if (isPaid) return false;
      }
    }

    return true;
  });
}

// GET /api/reports/preview - Preview report count & top rows
router.get('/preview', (req, res) => {
  try {
    const devices = queryFilteredDevices(req.query);

    res.json({
      success: true,
      totalCount: devices.length,
      preview: devices.slice(0, 5).map(d => {
        let attrs = {};
        try { attrs = JSON.parse(d.additional_attributes || '{}'); } catch {}
        return {
          id: d.id,
          imei_number: d.imei_number,
          device_name: getDeviceName(d, attrs),
          sim_numbers: getSimNumbers(d, attrs),
          device_type_name: d.device_type_name,
          vehicle_number: getVehicleNumber(d, attrs) || 'Unassigned',
          customer_name: getCustomerName(attrs),
          phone_number: getCustomerPhone(attrs),
          total_cost: getTotalCost(attrs),
          amount_received_status: getAmountReceivedStatus(attrs),
          stock_place: getStockPlace(attrs) || '—',
          month: getDeviceMonth(d, attrs) || '—',
          date: getDateValue(d, attrs),
          current_status: d.current_status
        };
      })
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/export - Export Excel/CSV with support for Manager Executive Statement format & Monthly Payments
router.get('/export', (req, res) => {
  const { type, format, purchase_batch_id, device_type_id, stock_place, installed_filter, report_layout, month, payment_status } = req.query;

  try {
    let data = [];
    let filename = `inventory_export_${new Date().toISOString().split('T')[0]}`;
    let sheetName = 'InventoryData';

    const isMonthlyPayments = type === 'monthly_payments' || Boolean(month || payment_status);
    const isManagerStatement = report_layout === 'manager' || type === 'manager_statement';

    if (type === 'dealers') {
      filename = `dealer_stock_summary_${new Date().toISOString().split('T')[0]}`;
      sheetName = 'DealerStock';
      data = db.prepare(`
        SELECT 
          d.current_holder_name as "Dealer / Holder Name",
          dt.name as "Device Type",
          dt.category as "Category",
          COUNT(d.id) as "Device Count"
        FROM devices d
        JOIN device_types dt ON d.device_type_id = dt.id
        WHERE d.current_status = 'WITH_DEALER'
        GROUP BY d.current_holder_name, dt.id
        ORDER BY d.current_holder_name
      `).all();
    } else if (type === 'purchases') {
      filename = `purchase_batches_report_${new Date().toISOString().split('T')[0]}`;
      sheetName = 'PurchaseBatches';
      data = db.prepare(`
        SELECT 
          pb.id as "Batch ID",
          pb.upload_date as "Upload Date",
          pb.uploaded_by as "Uploaded By",
          pb.vendor_name as "Vendor Name",
          dt.name as "Device Type",
          pb.total_devices_count as "Total Devices Uploaded",
          (SELECT COUNT(*) FROM devices d WHERE d.purchase_batch_id = pb.id) as "Live Remaining Count",
          pb.source_file as "Source File Name",
          pb.notes as "Notes"
        FROM purchase_batches pb
        JOIN device_types dt ON pb.device_type_id = dt.id
        ORDER BY pb.upload_date DESC
      `).all();
    } else if (isMonthlyPayments) {
      // Monthly Payments Statement Format
      const devices = queryFilteredDevices(req.query);
      const mLabel = month ? month.toUpperCase() : 'ALL_MONTHS';
      const pLabel = payment_status ? (payment_status.toUpperCase() === 'RECEIVED' ? 'PAID_RECEIVED' : payment_status.toUpperCase()) : 'ALL_PAYMENTS';
      
      let typeLabel = '';
      if (device_type_id) {
        const dt = db.prepare('SELECT name FROM device_types WHERE id = ?').get(device_type_id);
        if (dt) typeLabel = `_${dt.name}`;
      } else if (purchase_batch_id) {
        const pb = db.prepare('SELECT source_file, notes FROM purchase_batches WHERE id = ?').get(purchase_batch_id);
        if (pb) typeLabel = `_${(pb.notes || pb.source_file || '').replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      }

      filename = `Monthly_Payments_${pLabel}_${mLabel}${typeLabel}_${new Date().toISOString().split('T')[0]}`;
      sheetName = `${mLabel.substring(0, 10)} Payments`;

      data = devices.map((dev, idx) => {
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

        const devMonth = getDeviceMonth(dev, attrs) || mLabel;
        const devName = getDeviceName(dev, attrs);
        const vehNo = getVehicleNumber(dev, attrs);
        const custName = getCustomerName(attrs);
        const custPhone = getCustomerPhone(attrs);
        const sims = getSimNumbers(dev, attrs);
        const totalCost = getTotalCost(attrs);
        const amountReceived = getAmountReceivedStatus(attrs);
        const receivedBy = attrs['AMOUNT RECEIVED BY'] || attrs['Amount Received By'] || attrs['Received By'] || (amountReceived.includes('(') ? amountReceived.split('(')[1].replace(')', '') : '—');
        const stockPlace = getStockPlace(attrs);
        const dateVal = getDateValue(dev, attrs);

        return {
          'Sl No': idx + 1,
          'Month': devMonth,
          'IMEI Number': String(dev.imei_number),
          'Device Model / Name': devName || dev.device_type_name || 'GPS Tracker',
          'Vehicle Number': vehNo || (dev.current_status === 'INSTALLED' ? 'Installed' : 'N/A'),
          'Customer Name': custName,
          'Customer Phone': custPhone,
          'Total Cost': totalCost,
          'Payment Status': amountReceived,
          'Amount Received By / Mode': receivedBy,
          'Stock Place / Holder': stockPlace || '—',
          'Certificate / Install Date': dateVal || '—',
          'SIM Numbers': sims
        };
      });
    } else if (isManagerStatement) {
      // Manager Executive Statement format
      let queryParams = { ...req.query };
      if (!queryParams.installed_filter && type === 'manager_statement') {
        queryParams.installed_filter = 'installed';
      }

      const devices = queryFilteredDevices(queryParams);

      filename = `manager_vehicle_billing_statement_${new Date().toISOString().split('T')[0]}`;
      sheetName = 'ManagerStatement';

      data = devices.map((dev, idx) => {
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

        const devName = getDeviceName(dev, attrs);
        const vehNo = getVehicleNumber(dev, attrs);
        const custName = getCustomerName(attrs);
        const custPhone = getCustomerPhone(attrs);
        const sims = getSimNumbers(dev, attrs);
        const totalCost = getTotalCost(attrs);
        const amountReceived = getAmountReceivedStatus(attrs);
        const stockPlace = getStockPlace(attrs);
        const dateVal = getDateValue(dev, attrs);

        return {
          'Sl No': idx + 1,
          'Device Name': devName || dev.device_type_name || 'GPS Tracker',
          'Vehicle Number': vehNo || (dev.current_status === 'INSTALLED' ? 'Installed' : 'N/A'),
          'Customer Name': custName,
          'Phone Number': custPhone,
          'SIM Numbers': sims,
          'IMEI Number': String(dev.imei_number),
          'Total Cost': totalCost,
          'Amount Received Status': amountReceived,
          'Stock Place': stockPlace || '—',
          'Date': dateVal || '—'
        };
      });
    } else {
      // Original List Exact Columns Format
      let queryParams = { ...req.query };
      if (type === 'installed') queryParams.installed_filter = 'installed';
      if (type === 'uninstalled' || type === 'instock') queryParams.installed_filter = 'uninstalled';

      const devices = queryFilteredDevices(queryParams);

      // Name filename accurately based on filters
      let nameParts = ['report'];
      if (purchase_batch_id) {
        const batch = db.prepare('SELECT source_file, notes FROM purchase_batches WHERE id = ?').get(purchase_batch_id);
        if (batch) {
          const rawName = (batch.source_file || batch.notes || '').replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
          nameParts.push(rawName);
        }
      }
      if (stock_place) nameParts.push(stock_place.replace(/[^a-zA-Z0-9_-]/g, '_'));
      if (installed_filter === 'installed' || type === 'installed') nameParts.push('installed');
      if (installed_filter === 'uninstalled' || type === 'uninstalled' || type === 'instock') nameParts.push('instock');
      nameParts.push(new Date().toISOString().split('T')[0]);

      filename = nameParts.join('_');
      sheetName = (stock_place || 'StockReport').substring(0, 30);

      // 1. Discover target Device Type ID to get exact uploaded Excel column template order
      let targetDeviceTypeId = device_type_id || null;
      if (!targetDeviceTypeId && purchase_batch_id) {
        const batch = db.prepare('SELECT device_type_id FROM purchase_batches WHERE id = ?').get(purchase_batch_id);
        if (batch && batch.device_type_id) targetDeviceTypeId = batch.device_type_id;
      }
      if (!targetDeviceTypeId && devices.length > 0) {
        const uniqueTypeIds = new Set(devices.map(d => d.device_type_id).filter(Boolean));
        if (uniqueTypeIds.size === 1) {
          targetDeviceTypeId = Array.from(uniqueTypeIds)[0];
        }
      }

      const keysOrder = [];
      const seenKeys = new Set();

      // If a specific device type is identified, seed keysOrder with exact template columns from upload
      if (targetDeviceTypeId) {
        const dtRecord = db.prepare('SELECT template_columns, custom_fields FROM device_types WHERE id = ?').get(targetDeviceTypeId);
        if (dtRecord) {
          let cols = [];
          try {
            cols = JSON.parse(dtRecord.template_columns || dtRecord.custom_fields || '[]');
          } catch {
            cols = [];
          }
          if (Array.isArray(cols)) {
            cols.forEach(c => {
              const trimmed = String(c || '').trim();
              if (trimmed && trimmed !== 'original_row' && !seenKeys.has(trimmed)) {
                seenKeys.add(trimmed);
                keysOrder.push(trimmed);
              }
            });
          }
        }
      }

      // 2. Discover any additional keys that exist in the filtered devices
      devices.forEach(dev => {
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
        Object.keys(attrs).forEach(k => {
          if (k && k !== 'original_row' && !seenKeys.has(k)) {
            seenKeys.add(k);
            keysOrder.push(k);
          }
        });
      });

      // If mixed device types and no columns discovered, supply standard columns
      if (keysOrder.length === 0) {
        keysOrder.push('Device IMEI', 'Device Type', 'SIM Number', 'Status', 'Current Location', 'Vendor', 'Purchase Price');
      }

      const existingImeiKey = keysOrder.find(k => /^imei|device.*imei|imei.*no|^uid$/i.test(k));

      data = devices.map((dev) => {
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

        const row = {};

        // If no explicit IMEI column is in the template and multiple types exist, ensure Device IMEI is available
        if (!existingImeiKey && !targetDeviceTypeId && !keysOrder.includes('Device IMEI')) {
          row['Device IMEI'] = String(dev.imei_number);
        }

        keysOrder.forEach(key => {
          let val = attrs[key];

          // Case-insensitive fallback lookup in attrs
          if (val === undefined || val === null || String(val).trim() === '') {
            const cleanTarget = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchingAttrKey = Object.keys(attrs).find(k => k.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget);
            if (matchingAttrKey && attrs[matchingAttrKey] !== undefined && attrs[matchingAttrKey] !== null) {
              val = attrs[matchingAttrKey];
            }
          }

          // Fallbacks to top-level device properties
          if (val === undefined || val === null || String(val).trim() === '') {
            if (key === 'Device IMEI' || key === existingImeiKey || /^imei|device.*imei|imei.*no|^serial.*number$|^vltd\s*sno$/i.test(key.trim())) {
              val = dev.imei_number || '';
            } else if (key === 'Device Type' || /^device\s*model|^device\s*name$/i.test(key.trim())) {
              val = dev.device_type_name || '';
            } else if (/^sim\s*1?$|^simno1?$|^sim\s*number$|^iccid$/i.test(key.trim())) {
              val = dev.sim_number || '';
            } else if (/^price$|^purchase\s*price$|^cost$/i.test(key.trim())) {
              val = dev.purchase_price !== null && dev.purchase_price !== undefined ? dev.purchase_price : '';
            } else if (/^vendor$|^vendor\s*name$/i.test(key.trim())) {
              val = dev.vendor_name || '';
            } else if (/^stock\s*place$|^current\s*location$|^holder$/i.test(key.trim())) {
              val = dev.current_holder_name || '';
            } else if (/^status$|^current\s*status$/i.test(key.trim())) {
              val = dev.current_status || '';
            } else {
              val = '';
            }
          }

          if (/date|month|validity/i.test(key)) {
            val = formatExcelDate(val);
          }

          row[key] = val !== undefined && val !== null ? val : '';
        });

        return row;
      });
    }

    if (data.length === 0) {
      data = [{ 'Notice': 'No records found matching the specified filter criteria' }];
    }

    const worksheet = xlsx.utils.json_to_sheet(data);

    // Clean up any __EMPTY header labels in the first row of worksheet so they remain in exact position as blank/nameless cells
    const wsRange = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    for (let c = wsRange.s.c; c <= wsRange.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({ r: wsRange.s.r, c });
      const cell = worksheet[cellAddress];
      if (cell && typeof cell.v === 'string' && cell.v.startsWith('__EMPTY')) {
        cell.v = '';
        cell.t = 's';
        if (cell.w) cell.w = '';
      }
    }

    // Auto-calculate column widths for clean Excel presentation
    if (data.length > 0) {
      const colKeys = Object.keys(data[0]);
      worksheet['!cols'] = colKeys.map(key => {
        let maxLen = key.startsWith('__EMPTY') ? 10 : key.length;
        for (let i = 0; i < Math.min(data.length, 50); i++) {
          const valStr = String(data[i][key] || '');
          if (valStr.length > maxLen) maxLen = valStr.length;
        }
        return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
      });
    }


    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);

    if (format === 'csv') {
      const csvOutput = xlsx.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csvOutput);
    } else {
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      return res.send(buffer);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: Extract normalized YYYY-MM-DD certificate date from device & attributes
function extractDeviceCertificateDate(dev = {}, attrs = {}) {
  const isInstalled = dev.current_status === 'INSTALLED' || 
    Boolean(String(attrs['VEHICLE NUMBER'] || attrs['VEHICLE NO'] || attrs['vehicle_number'] || '').trim()) ||
    Boolean(String(attrs['CERTIFICATE ISSUED TO'] || attrs['CERTIFICATE ISSUED'] || '').trim()) ||
    Boolean(String(attrs['CUSTOMER NAME'] || attrs['CUSTOMER'] || '').trim());

  const directCertKeys = [
    'CERTIFICATE ISSUED DATE', 'Certificate Issued Date', 'certificate_issued_date',
    'CERTIFICATE DATE', 'Certificate Date', 'certificate_date',
    'INSTALLATION DATE', 'Installation Date', 'installation_date'
  ];

  for (const k of directCertKeys) {
    if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
      const val = attrs[k];

      // Excel serial integer (e.g. 46256...)
      if (typeof val === 'number' || /^\d{5}$/.test(String(val).trim())) {
        const num = Number(val);
        if (num > 30000 && num < 60000) {
          const d = new Date(Math.round((num - 25569) * 86400 * 1000));
          if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
          }
        }
      }

      const str = String(val).trim();
      // Match DD/MM/YYYY or DD-MM-YYYY
      const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (dmy) {
        const day = dmy[1].padStart(2, '0');
        const month = dmy[2].padStart(2, '0');
        const year = dmy[3];
        return `${year}-${month}-${day}`;
      }

      // Match YYYY-MM-DD
      const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (ymd) {
        const year = ymd[1];
        const month = ymd[2].padStart(2, '0');
        const day = ymd[3].padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      const parsed = new Date(str);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2020 && parsed.getFullYear() < 2100) {
        return parsed.toISOString().split('T')[0];
      }
    }
  }

  // Only if the device is actually installed / has vehicle, fallback to general date
  if (isInstalled) {
    for (const k of ['DATE', 'Date', 'date']) {
      if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
        const val = attrs[k];
        if (typeof val === 'number' || /^\d{5}$/.test(String(val).trim())) {
          const num = Number(val);
          if (num > 30000 && num < 60000) {
            const d = new Date(Math.round((num - 25569) * 86400 * 1000));
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
          }
        }
        const str = String(val).trim();
        const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
      }
    }
    if (dev.updated_at && dev.current_status === 'INSTALLED') {
      return dev.updated_at.split('T')[0].split(' ')[0];
    }
  }

  return null;
}

// Helper: Check if device belongs to TG MINING category
function isTgMiningDevice(dev = {}, attrs = {}) {
  const cat = String(attrs['CATEGORY'] || attrs['DEVICE CATEGORY'] || attrs['PROJECT CATEGORY'] || attrs['PROJECT'] || attrs['Category'] || '').toUpperCase().trim();
  const typeName = String(dev.device_name || dev.device_type_name || '').toUpperCase().trim();
  return cat.includes('TG MINING') || cat.includes('TG_MINING') || (cat.includes('MINING') && !cat.includes('AP MINING')) || typeName.includes('TG MINING') || typeName.includes('TG_MINING');
}

// Helper: Extract normalized YYYY-MM-DD TG Mining date from device & attributes
function extractTgMiningDate(dev = {}, attrs = {}) {
  const directKeys = [
    'TG MINING DATE', 'TG_MINING_DATE', 'Tg Mining Date', 'tg_mining_date',
    'MINING DATE', 'Mining Date', 'mining_date',
    'ACTIVATION DATE', 'Activation Date', 'activation_date',
    'ISSUE DATE', 'Issue Date', 'issue_date',
    'INSTALLATION DATE', 'Installation Date', 'installation_date',
    'DATE', 'Date', 'date',
    'STOCK PLACE DATE', 'Stock Place Date'
  ];

  for (const k of directKeys) {
    if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
      const val = attrs[k];
      if (typeof val === 'number' || /^\d{5}$/.test(String(val).trim())) {
        const num = Number(val);
        if (num > 30000 && num < 60000) {
          const d = new Date(Math.round((num - 25569) * 86400 * 1000));
          if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        }
      }

      const str = String(val).trim();
      const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
      const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;

      const parsed = new Date(str);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2020 && parsed.getFullYear() < 2100) {
        return parsed.toISOString().split('T')[0];
      }
    }
  }

  if (dev.updated_at && (dev.current_status === 'INSTALLED' || dev.current_status === 'WITH_DEALER')) {
    return dev.updated_at.split('T')[0].split(' ')[0];
  }

  return null;
}

// Helper: Compute 100% dynamic Daily Master Inventory Distribution Matrix with Today's Issued Certificates & TG Mining Devices
function computeDailyDistributionMatrix(requestedDate = null) {
  const targetDate = requestedDate || new Date().toISOString().split('T')[0];

  const deviceTypes = db.prepare('SELECT id, name FROM device_types WHERE active = 1 ORDER BY name ASC').all();
  const batches = db.prepare('SELECT device_type_id, SUM(total_devices_count) as total_purchased FROM purchase_batches GROUP BY device_type_id').all();
  const batchMap = {};
  batches.forEach(b => { batchMap[b.device_type_id] = b.total_purchased || 0; });

  const devices = db.prepare(`
    SELECT 
      d.id, 
      d.imei_number,
      d.device_type_id, 
      dt.name as device_name, 
      d.current_status, 
      d.current_holder_name, 
      d.additional_attributes,
      d.updated_at,
      d.created_at
    FROM devices d 
    JOIN device_types dt ON d.device_type_id = dt.id
  `).all();

  const locationsSet = new Set();
  const matrix = {};
  const todayIssuedDevices = [];
  const todayTgMiningDevices = [];

  deviceTypes.forEach(dt => {
    matrix[dt.name] = {
      device_type_id: dt.id,
      device_name: dt.name,
      locations: {},
      certificates_issued_today: 0,
      tg_mining_issued_today: 0,
      total_installed: 0,
      total_certificates_issued: 0,
      in_stock_total: 0,
      purchased_total: batchMap[dt.id] || 0
    };
  });

  devices.forEach(dev => {
    let attrs = {};
    try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

    const devName = dev.device_name || 'UNKNOWN';
    if (!matrix[devName]) {
      matrix[devName] = {
        device_type_id: dev.device_type_id,
        device_name: devName,
        locations: {},
        certificates_issued_today: 0,
        tg_mining_issued_today: 0,
        total_installed: 0,
        total_certificates_issued: 0,
        in_stock_total: 0,
        purchased_total: 0
      };
    }

    const vehNo = String(attrs['VEHICLE NUMBER'] || attrs['VEHICLE NO'] || attrs['vehicle_number'] || attrs['vehicle_no'] || attrs['MACHINERY NUMBER'] || attrs['EQUIPMENT NUMBER'] || '').trim();
    const hasVehicle = Boolean(vehNo && vehNo !== '-' && vehNo !== '—' && vehNo !== 'NULL');
    const isInstalled = dev.current_status === 'INSTALLED' || hasVehicle;
    const isMining = isTgMiningDevice(dev, attrs);

    const certDate = extractDeviceCertificateDate(dev, attrs);
    const tgMiningDate = extractTgMiningDate(dev, attrs);

    const phone = attrs['CUSTOMER PHONE NUMBER'] || attrs['CUSTOMER PHONE'] || attrs['CUSTOMER CONTACT'] ||
      attrs['Customer Phone Number'] || attrs['Customer Phone'] || attrs['Customer Contact'] ||
      attrs['MOBILE'] || attrs['MOBILE NUMBER'] || attrs['PHONE'] || attrs['PHONE NUMBER'] ||
      attrs['customer_phone'] || attrs['customer_phone_number'] || attrs['customer_contact'] ||
      attrs['phone_number'] || attrs['phone'] || attrs['mobile'] || '-';

    const custName = attrs['CUSTOMER NAME'] || attrs['CERTIFICATE ISSUED TO'] || attrs['CUSTOMER'] ||
      attrs['Customer Name'] || attrs['customer_name'] || attrs['MINING SITE'] || attrs['SITE NAME'] || '-';

    const rawInstaller = attrs['TECHNICIAN'] || attrs['Technician'] || attrs['INSTALLED BY'] || attrs['Installed By'] ||
      attrs['FITTER'] || attrs['Fitter'] || attrs['INSTALLER'] || attrs['Installer'] || attrs['installed_by'] || '';
    const installer = (rawInstaller && String(rawInstaller).trim() && String(rawInstaller).trim().toLowerCase() !== 'technician') ? String(rawInstaller).trim() : '-';

    const chasis = attrs['CHASIS NUMBER'] || attrs['CHASSIS NUMBER'] || attrs['CHASIS NO'] ||
      attrs['CHASSIS NO'] || attrs['chasis_number'] || attrs['chassis_number'] || '-';

    const engine = attrs['ENGINE NUMBER'] || attrs['ENGINE NO'] || attrs['engine_number'] || '-';

    const locName = attrs['RTO LOCATION'] || attrs['RTO Location'] || attrs['rto_location'] || attrs['STOCK PLACE'] || attrs['LOCATION'] || dev.current_holder_name || '';

    // TG MINING device issued today
    if (isMining && tgMiningDate && tgMiningDate === targetDate) {
      matrix[devName].tg_mining_issued_today++;
      todayTgMiningDevices.push({
        id: dev.id,
        imei_number: dev.imei_number,
        device_name: devName,
        vehicle_number: vehNo || '-',
        customer_name: custName,
        customer_phone: phone,
        tg_mining_date: tgMiningDate,
        installed_by: installer,
        chasis_number: chasis,
        engine_number: engine,
        location: locName
      });
    }

    // VLTD certificate issued today (non-mining or explicit cert)
    if (!isMining && certDate && certDate === targetDate) {
      matrix[devName].certificates_issued_today++;
      todayIssuedDevices.push({
        id: dev.id,
        imei_number: dev.imei_number,
        device_name: devName,
        vehicle_number: vehNo || '-',
        customer_name: custName,
        customer_phone: phone,
        certificate_issued_date: certDate,
        installed_by: installer,
        chasis_number: chasis,
        engine_number: engine,
        rto_location: locName
      });
    }

    if (isInstalled) {
      matrix[devName].total_installed++;
      matrix[devName].total_certificates_issued++;
    } else {
      let place = attrs['STOCK PLACE'] || attrs['STOCK LOCATION'] || dev.current_holder_name || 'OFFICE';
      place = String(place).trim().toUpperCase();
      if (!place || place === '—' || place === '-' || place === 'NULL') place = 'OFFICE';
      locationsSet.add(place);

      matrix[devName].locations[place] = (matrix[devName].locations[place] || 0) + 1;
      matrix[devName].in_stock_total++;
    }
  });

  // Calculate certificates issued text summary for each device
  Object.keys(matrix).forEach(devName => {
    const devCerts = todayIssuedDevices.filter(item => item.device_name === devName);
    const locCounts = {};
    devCerts.forEach(item => {
      let loc = item.rto_location || item.stock_place || item.location || '';
      loc = String(loc).trim().toUpperCase();
      const shortDev = devName.length > 5 ? devName.slice(0, 4) : devName;
      const key = loc ? `${loc} ${shortDev}` : devName;
      locCounts[key] = (locCounts[key] || 0) + 1;
    });
    const summaryList = Object.entries(locCounts).map(([k, cnt]) => `${k} ${cnt}`);
    matrix[devName].certificates_issued_summary = summaryList.join(', ');
  });

  // Dynamic locations sorting with exact priority order
  const priority = [
    'OFFICE',
    'RESIDENCE',
    'SWIFT CAR',
    'ADONI',
    'GUNTUR',
    'KALWAKURTHY',
    'KUKATPALLY',
    'RAJAMANDRY',
    'SURYAPET',
    'VIJAYAWADA',
    'VIZAG',
    'ZAHEERABHAD',
    'JAIPAL REDDY'
  ];
  const allLocations = Array.from(locationsSet).sort((a, b) => {
    const pA = priority.indexOf(a);
    const pB = priority.indexOf(b);
    if (pA !== -1 && pB !== -1) return pA - pB;
    if (pA !== -1) return -1;
    if (pB !== -1) return 1;
    return a.localeCompare(b);
  });

  // Column totals
  const columnTotals = {
    locations: {},
    certificates_issued_today: 0,
    tg_mining_issued_today: 0,
    total_installed: 0,
    total_certificates_issued: 0,
    in_stock_total: 0,
    purchased_total: 0
  };

  allLocations.forEach(loc => {
    columnTotals.locations[loc] = 0;
    Object.values(matrix).forEach(m => {
      columnTotals.locations[loc] += (m.locations[loc] || 0);
    });
  });

  Object.values(matrix).forEach(m => {
    columnTotals.certificates_issued_today += (m.certificates_issued_today || 0);
    columnTotals.tg_mining_issued_today += (m.tg_mining_issued_today || 0);
    columnTotals.total_installed += (m.total_installed || 0);
    columnTotals.total_certificates_issued += m.total_certificates_issued;
    columnTotals.in_stock_total += m.in_stock_total;
    columnTotals.purchased_total += m.purchased_total;
  });

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return {
    locations: allLocations,
    rows: Object.values(matrix),
    columnTotals,
    todayIssuedDevices,
    todayTgMiningDevices,
    todayIssuedCount: todayIssuedDevices.length,
    todayTgMiningCount: todayTgMiningDevices.length,
    targetDate,
    generatedAt: dateStr
  };
}

// GET /api/reports/daily-distribution - Live dynamic Daily Stock Matrix JSON
router.get('/daily-distribution', (req, res) => {
  try {
    const { date } = req.query;
    const data = computeDailyDistributionMatrix(date);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/export-daily-distribution - Excel export (SINGLE SHEET with Stock Matrix + VLTD Certs + TG Mining)
router.get('/export-daily-distribution', async (req, res) => {
  try {
    const { date } = req.query;
    const matrixData = computeDailyDistributionMatrix(date);
    const { locations, rows, columnTotals, todayIssuedDevices, todayTgMiningDevices, targetDate, generatedAt } = matrixData;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FuelTracks Technologies IMS';
    wb.lastModifiedBy = 'Super Admin';
    wb.created = new Date();

    // -------------------------------------------------------------------------
    // SINGLE UNIFIED SHEET: Stock Matrix + VLTD Certificates + TG Mining
    // -------------------------------------------------------------------------
    const ws = wb.addWorksheet('Daily Master Report', {
      views: [{ showGridLines: true }]
    });

    const totalColumns = Math.max(locations.length + 6, 9);

    // Main Super Header
    const titleRow = ws.addRow(['FUELTRACKS TECHNOLOGIES — DAILY MASTER STOCK & DEPLOYMENT REPORT']);
    titleRow.height = 32;
    ws.mergeCells(1, 1, 1, totalColumns);
    const titleCell = ws.getCell(1, 1);
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Slate 800 Dark
    };
    titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14, name: 'Calibri' };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Subtitle Row
    const subRow = ws.addRow([`Report Date: ${targetDate}    |    Generated On: ${generatedAt}    |    VLTD Issued Today: ${todayIssuedDevices.length}    |    TG Mining Issued Today: ${todayTgMiningDevices.length}`]);
    subRow.height = 22;
    ws.mergeCells(2, 1, 2, totalColumns);
    const subCell = ws.getCell(2, 1);
    subCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF334155' } // Slate 700
    };
    subCell.font = { bold: true, color: { argb: 'FFE2E8F0' }, size: 9, name: 'Calibri' };
    subCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Blank Gap Row
    ws.addRow([]);

    // =========================================================================
    // SECTION 1: DAILY INVENTORY DISTRIBUTION MATRIX
    // =========================================================================
    const sec1Row = ws.addRow(['1. DAILY INVENTORY DISTRIBUTION MATRIX (LOCATION STOCK & DAILY MOVEMENTS)']);
    sec1Row.height = 24;
    const sec1RowIndex = sec1Row.number;
    ws.mergeCells(sec1RowIndex, 1, sec1RowIndex, locations.length + 6);
    const sec1Cell = ws.getCell(sec1RowIndex, 1);
    sec1Cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' } // Deep Blue Banner
    };
    sec1Cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    sec1Cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const matrixHeaders = [
      'DEVICE',
      ...locations,
      'VLTD CERTS TODAY',
      'TG MINING TODAY',
      'INSTALLED',
      'TOTAL STOCK',
      'PURCHASED'
    ];
    const headerRow = ws.addRow(matrixHeaders);
    headerRow.height = 28;

    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF366092' } // Steel Blue Header
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB0C4DE' } },
        left: { style: 'thin', color: { argb: 'FFB0C4DE' } },
        bottom: { style: 'medium', color: { argb: 'FF1F497D' } },
        right: { style: 'thin', color: { argb: 'FFB0C4DE' } }
      };
    });

    rows.forEach(r => {
      const rowValues = [
        r.device_name,
        ...locations.map(loc => r.locations[loc] || ''),
        r.certificates_issued_today || 0,
        r.tg_mining_issued_today || 0,
        r.total_installed || 0,
        r.in_stock_total || 0,
        r.purchased_total || 0
      ];
      const dataRow = ws.addRow(rowValues);
      dataRow.height = 22;

      dataRow.eachCell((cell, colNumber) => {
        cell.font = { size: 9.5, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };

        if (colNumber === 1) {
          cell.font = { bold: true, name: 'Calibri', size: 9.5, color: { argb: 'FF1A202C' } };
        } else if (colNumber === locations.length + 2) {
          // VLTD CERTS TODAY column
          cell.font = { bold: true, color: { argb: 'FF0D5C3A' }, name: 'Calibri' };
        } else if (colNumber === locations.length + 3) {
          // TG MINING TODAY column
          cell.font = { bold: true, color: { argb: 'FFB45309' }, name: 'Calibri' }; // Warm Amber
        } else if (colNumber === locations.length + 4) {
          // INSTALLED column
          cell.font = { bold: true, name: 'Calibri', size: 9.5 };
        }
      });
    });

    // Orange Summary Totals Footer Row
    const totalRowValues = [
      'TOTAL',
      ...locations.map(loc => `TOTAL = ${columnTotals.locations[loc] || 0}`),
      `TOTAL = ${columnTotals.certificates_issued_today || 0}`,
      `TOTAL = ${columnTotals.tg_mining_issued_today || 0}`,
      `TOTAL = ${columnTotals.total_installed || 0}`,
      `TOTAL = ${columnTotals.in_stock_total || 0}`,
      `TOTAL = ${columnTotals.purchased_total || 0}`
    ];
    const totalRow = ws.addRow(totalRowValues);
    totalRow.height = 25;

    totalRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFED7D31' } // Orange
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FFC65911' } },
        left: { style: 'thin', color: { argb: 'FFF4B183' } },
        bottom: { style: 'medium', color: { argb: 'FFC65911' } },
        right: { style: 'thin', color: { argb: 'FFF4B183' } }
      };
    });

    // 2 Blank Rows Gap
    ws.addRow([]);
    ws.addRow([]);

    // =========================================================================
    // SECTION 2: VLTD CERTIFICATES ISSUED TODAY
    // =========================================================================
    const sec2Row = ws.addRow([`2. VLTD CERTIFICATES ISSUED TODAY (${todayIssuedDevices.length} Devices Issued on ${targetDate})`]);
    sec2Row.height = 24;
    const sec2RowIndex = sec2Row.number;
    ws.mergeCells(sec2RowIndex, 1, sec2RowIndex, 9);
    const sec2Cell = ws.getCell(sec2RowIndex, 1);
    sec2Cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D5C3A' } // Deep Emerald Green Banner
    };
    sec2Cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    sec2Cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const certHeaders = [
      'Sl No',
      'Certificate Issue Date',
      'IMEI Number',
      'Device Model',
      'Vehicle Number',
      'Customer Name',
      'Customer Contact',
      'Chassis Number',
      'Engine Number'
    ];
    const certHeaderRow = ws.addRow(certHeaders);
    certHeaderRow.height = 26;

    certHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF15803D' } // Emerald Header
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF86EFAC' } },
        left: { style: 'thin', color: { argb: 'FF86EFAC' } },
        bottom: { style: 'medium', color: { argb: 'FF14532D' } },
        right: { style: 'thin', color: { argb: 'FF86EFAC' } }
      };
    });

    if (todayIssuedDevices.length === 0) {
      const emptyRow = ws.addRow(['-', targetDate, 'No VLTD certificates issued on this date', '-', '-', '-', '-', '-', '-']);
      emptyRow.height = 22;
      emptyRow.eachCell((cell) => {
        cell.font = { italic: true, size: 9.5, color: { argb: 'FF64748B' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
    } else {
      todayIssuedDevices.forEach((item, idx) => {
        const r = ws.addRow([
          idx + 1,
          item.certificate_issued_date || targetDate,
          item.imei_number,
          item.device_name,
          item.vehicle_number,
          item.customer_name,
          item.customer_phone,
          item.chasis_number,
          item.engine_number
        ]);
        r.height = 21;
        r.eachCell((cell, colNumber) => {
          cell.font = { size: 9.5, name: 'Calibri' };
          cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'center' : 'left' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };
          if (colNumber === 3 || colNumber === 5) {
            cell.font = { bold: true, name: 'Calibri', size: 9.5 };
          }
        });
      });
    }

    // 2 Blank Rows Gap
    ws.addRow([]);
    ws.addRow([]);

    // =========================================================================
    // SECTION 3: TG MINING DEVICES ISSUED TODAY
    // =========================================================================
    const sec3Row = ws.addRow([`3. TG MINING DEVICES ISSUED / ACTIVATED TODAY (${todayTgMiningDevices.length} Devices Issued on ${targetDate})`]);
    sec3Row.height = 24;
    const sec3RowIndex = sec3Row.number;
    ws.mergeCells(sec3RowIndex, 1, sec3RowIndex, 9);
    const sec3Cell = ws.getCell(sec3RowIndex, 1);
    sec3Cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFB45309' } // Warm Amber / Bronze Banner
    };
    sec3Cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    sec3Cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const tgMiningHeaders = [
      'Sl No',
      'Installation Date',
      'IMEI Number',
      'Device Model',
      'Vehicle / Equipment No',
      'Customer / Mining Site',
      'TECHNICIAN',
      'Customer Contact',
      'Stock Place / Location'
    ];
    const tgMiningHeaderRow = ws.addRow(tgMiningHeaders);
    tgMiningHeaderRow.height = 26;

    tgMiningHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD97706' } // Amber 600 Header
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFFDE68A' } },
        left: { style: 'thin', color: { argb: 'FFFDE68A' } },
        bottom: { style: 'medium', color: { argb: 'FF92400E' } },
        right: { style: 'thin', color: { argb: 'FFFDE68A' } }
      };
    });

    if (todayTgMiningDevices.length === 0) {
      const emptyRow = ws.addRow(['-', targetDate, 'No TG Mining devices issued on this date', '-', '-', '-', '-', '-', '-']);
      emptyRow.height = 22;
      emptyRow.eachCell((cell) => {
        cell.font = { italic: true, size: 9.5, color: { argb: 'FF64748B' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
    } else {
      todayTgMiningDevices.forEach((item, idx) => {
        const r = ws.addRow([
          idx + 1,
          item.tg_mining_date || targetDate,
          item.imei_number,
          item.device_name,
          item.vehicle_number,
          item.customer_name,
          item.installed_by || '-',
          item.customer_phone,
          item.location || '-'
        ]);
        r.height = 21;
        r.eachCell((cell, colNumber) => {
          cell.font = { size: 9.5, name: 'Calibri' };
          cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'center' : 'left' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };
          if (colNumber === 3 || colNumber === 5) {
            cell.font = { bold: true, name: 'Calibri', size: 9.5 };
          }
        });
      });
    }

    // Set Column Widths for comfortable readability
    ws.columns = [
      { width: 8 },
      { width: 22 },
      { width: 22 },
      { width: 20 },
      { width: 22 },
      { width: 26 },
      { width: 20 },
      { width: 22 },
      { width: 22 },
      ...locations.map(() => ({ width: 16 }))
    ];

    const filename = `Daily_Master_Report_${targetDate}`;
    const buffer = await wb.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



const RTO_CODE_MAP = {
  'AP02': 'Anantapur (AP-02)', 'AP03': 'Chittoor (AP-03)', 'AP04': 'Kadapa (AP-04)',
  'AP05': 'Kakinada (AP-05)', 'AP07': 'Guntur (AP-07)', 'AP09': 'Visakhapatnam (AP-09)',
  'AP16': 'Vijayawada (AP-16)', 'AP21': 'Kurnool (AP-21)', 'AP26': 'Nellore (AP-26)',
  'AP27': 'Ongole (AP-27)', 'AP31': 'Visakhapatnam (AP-31)', 'AP39': 'Tirupati (AP-39)',
  'TS01': 'Adilabad (TS-01)', 'TS02': 'Karimnagar (TS-02)', 'TS03': 'Warangal (TS-03)',
  'TS04': 'Khammam (TS-04)', 'TS05': 'Nalgonda (TS-05)', 'TS06': 'Mahabubnagar (TS-06)',
  'TS07': 'Ranga Reddy (TS-07)', 'TS08': 'Medchal (TS-08)', 'TS09': 'Khairatabad (TS-09)',
  'TS10': 'Secunderabad (TS-10)', 'TS11': 'Malakpet (TS-11)', 'TS12': 'Hyderabad South (TS-12)',
  'TS13': 'Tolichowki (TS-13)', 'TS14': 'Hyderabad North (TS-14)', 'TS15': 'Sangareddy (TS-15)',
  'TS16': 'Nizamabad (TS-16)', 'TS29': 'Suryapet (TS-29)', 'TS30': 'Mancherial (TS-30)',
  'TS31': 'Nirmal (TS-31)', 'TS32': 'Jagtial (TS-32)', 'TS33': 'Peddapalli (TS-33)',
  'TS34': 'Bhupalpally (TS-34)', 'TS35': 'Kothagudem (TS-35)', 'TS36': 'Wanaparthy (TS-36)'
};

function deriveRTOLocation(vehNo, attrs = {}) {
  const rtoKeys = ['RTO LOCATION', 'RTO Location', 'rto_location', 'RTO', 'rto', 'RTO_LOCATION', 'RTO Code', 'RTO CODE'];
  for (const k of rtoKeys) {
    if (attrs[k] && String(attrs[k]).trim()) return String(attrs[k]).trim();
  }

  if (!vehNo) return '-';
  const clean = String(vehNo).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prefixMatch = clean.match(/^(AP|TS|KA|TN|MH|DL|HR|GJ|RJ|UP|MP|KL|WB|OD|GA|PB|UK|JH|CH|BR)(\d{1,2})/);
  if (prefixMatch) {
    const code = `${prefixMatch[1]}${prefixMatch[2].padStart(2, '0')}`;
    if (RTO_CODE_MAP[code]) return RTO_CODE_MAP[code];
    return `${prefixMatch[1]}-${prefixMatch[2].padStart(2, '0')}`;
  }
  return '-';
}

function cleanVehicleAndPhone(rawVeh, rawPhone) {
  let veh = String(rawVeh || '').trim();
  let phone = String(rawPhone || '').trim();
  if (veh.includes('/')) {
    const parts = veh.split('/');
    for (const p of parts) {
      const cleanP = p.trim();
      if (/^\d{10}$/.test(cleanP) && !phone) {
        phone = cleanP;
      } else if (/^[A-Z]{2}\d{1,2}[A-Z0-9]+/i.test(cleanP)) {
        veh = cleanP.toUpperCase();
      }
    }
  }
  return { vehicle_number: veh, phone_number: phone };
}

// Helper: Extract clean Device Model
function getDeviceModelName(dev, attrs = {}) {
  const modelKeys = [
    'DEVICE NAME', 'Device Name', 'device_name',
    'MODEL', 'Model', 'model',
    'DEVICE', 'Device',
    'DEVICE TYPE', 'Device Type',
    'PRODUCT', 'Product'
  ];
  for (const k of modelKeys) {
    if (attrs[k] && String(attrs[k]).trim()) return String(attrs[k]).trim();
  }
  if (dev.device_model && dev.device_model !== 'AIS-140 GPS') return dev.device_model;
  return dev.device_model || 'VAMOSYS';
}

// Helper: Extract clean Installation Date
function getInstallationDateValue(dev, attrs = {}) {
  const dateKeys = [
    'DATE', 'Date', 'date',
    'INSTALLATION DATE', 'Installation Date', 'installation_date',
    'CERTIFICATE ISSUED DATE', 'Certificate Issued Date',
    'FITTED DATE', 'Fitted Date',
    'STOCK PLACE DATE', 'Stock Place Date',
    'PAYMENT DATE', 'Payment Date',
    'CREATED AT', 'Created At'
  ];
  for (const k of dateKeys) {
    if (attrs[k] && String(attrs[k]).trim()) {
      const formatted = formatExcelDate(attrs[k]);
      if (formatted) return formatted;
    }
  }
  if (dev.installation_date) return formatExcelDate(dev.installation_date);
  if (dev.purchase_date) return formatExcelDate(dev.purchase_date);
  return '';
}

// Helper: Extract Customer Name across all possible Excel header keys
function getCustomerName(attrs = {}) {
  const custKeys = [
    'CUSTOMER NAME', 'Customer Name', 'customer_name', 'Customer name',
    'CUSTOMER', 'Customer', 'customer',
    'CERTIFICATE ISSUED TO', 'Certificate Issued To', 'certificate_issued_to',
    'CLIENT NAME', 'Client Name', 'Client', 'CLIENT',
    'PARTY NAME', 'Party Name',
    'BENEFICIARY NAME', 'Beneficiary Name',
    'NAME', 'Name', 'name'
  ];
  for (const k of custKeys) {
    if (attrs[k] && String(attrs[k]).trim()) return String(attrs[k]).trim();
  }
  return '';
}

// Helper: Extract Vehicle Number across all possible Excel header keys
function getVehicleNumber(dev = {}, attrs = {}) {
  const vehKeys = [
    'VEHICLE NUMBER', 'Vehicle Number', 'vehicle_number', 'Vehicle number',
    'VEH NO', 'Veh No', 'veh_no', 'Veh no',
    'VEHICLE NO', 'Vehicle No', 'vehicle_no',
    'REG NUMBER', 'Reg Number', 'reg_number',
    'REG NO', 'Reg No', 'reg_no',
    'VEHICLE', 'Vehicle', 'vehicle'
  ];
  for (const k of vehKeys) {
    if (attrs[k] && String(attrs[k]).trim()) return String(attrs[k]).trim();
  }
  return dev.vehicle_number || '';
}

// Helper: Extract Customer Phone across all possible Excel header keys
function getCustomerPhone(attrs = {}) {
  const phoneKeys = [
    'CUSTOMER PHONE NUMBER', 'Customer Phone Number', 'customer_phone_number',
    'CUSTOMER PHONE', 'Customer Phone',
    'CUSTOMER CONTACT', 'Customer Contact', 'customer_contact',
    'CONTACT NUMBER', 'Contact Number', 'contact_number',
    'PHONE NUMBER', 'Phone Number', 'phone_number',
    'MOBILE NUMBER', 'Mobile Number', 'mobile_number',
    'PRIMARY MOBILE', 'Primary Mobile',
    'PHONE', 'Phone', 'phone',
    'MOBILE', 'Mobile', 'mobile',
    'CONTACT', 'Contact', 'contact'
  ];
  for (const k of phoneKeys) {
    if (attrs[k] && String(attrs[k]).trim()) return String(attrs[k]).trim();
  }
  return '';
}

// Helper: Query all customers & vehicles across installations and device inventory
function getCustomerDirectoryRecords() {
  const records = [];
  const seenKeys = new Set();

  // 1. Fetch from installations table
  const installRows = db.prepare(`
    SELECT 
      i.id,
      i.customer_name,
      i.customer_contact as phone_number,
      i.vehicle_number,
      i.installation_date,
      i.installed_by,
      i.sales_manager,
      i.sales_person,
      i.imei_number,
      i.sale_price,
      i.payment_status,
      i.aadhar_number,
      i.pan_number,
      i.chasis_number,
      i.engine_number,
      i.installation_location,
      c.email,
      dt.name as device_model,
      d.additional_attributes
    FROM installations i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN devices d ON i.device_id = d.id
    LEFT JOIN device_types dt ON d.device_type_id = dt.id
    ORDER BY i.id DESC
  `).all();

  // 2. Also fetch all devices across database
  const deviceRows = db.prepare(`
    SELECT 
      d.id,
      d.imei_number,
      d.purchase_date,
      d.current_status,
      d.current_holder_name,
      d.additional_attributes,
      dt.name as device_model
    FROM devices d
    LEFT JOIN device_types dt ON d.device_type_id = dt.id
    ORDER BY d.id DESC
  `).all();

  // Process installations first
  installRows.forEach(row => {
    let attrs = {};
    try {
      attrs = typeof row.additional_attributes === 'string' ? JSON.parse(row.additional_attributes || '{}') : (row.additional_attributes || {});
    } catch {}

    const cleaned = cleanVehicleAndPhone(row.vehicle_number, row.phone_number);
    const chasis = row.chasis_number || attrs['CHASIS NUMBER'] || attrs['Chasis Number'] || attrs['Chassis Number'] || attrs['CHASSIS'] || '';
    const engine = row.engine_number || attrs['ENGINE NUMBER'] || attrs['Engine Number'] || attrs['ENGINE'] || '';
    const aadhar = row.aadhar_number || attrs['AADHAR NUMBER'] || attrs['Aadhar Number'] || attrs['Aadhar'] || attrs['AADHAR'] || '';
    const pan = row.pan_number || attrs['PAN NUMBER'] || attrs['Pan Number'] || attrs['PAN'] || '';
    const email = row.email || attrs['EMAIL'] || attrs['Customer Email'] || attrs['Email'] || '';
    const rtoLoc = deriveRTOLocation(cleaned.vehicle_number, attrs);
    const model = getDeviceModelName(row, attrs);
    const date = getInstallationDateValue(row, attrs);

    const rec = {
      customer_name: row.customer_name || '—',
      phone_number: cleaned.phone_number || '',
      aadhar_number: aadhar,
      pan_number: pan,
      vehicle_number: cleaned.vehicle_number || '',
      rto_location: rtoLoc,
      chasis_number: chasis,
      engine_number: engine,
      email: email,
      imei_number: row.imei_number,
      device_model: model,
      installation_date: date || row.installation_date || '',
      location: row.installation_location || '',
      sale_price: row.sale_price || 0,
      payment_status: row.payment_status || 'PENDING'
    };

    const key = `${rec.vehicle_number || rec.imei_number}_${rec.imei_number}`.toUpperCase();
    seenKeys.add(key);
    records.push(rec);
  });

  // Process any devices in master sheets with customer/vehicle info or installed status
  deviceRows.forEach(dev => {
    let attrs = {};
    try {
      attrs = typeof dev.additional_attributes === 'string' ? JSON.parse(dev.additional_attributes || '{}') : (dev.additional_attributes || {});
    } catch {}

    const rawCust = getCustomerName(attrs);
    const rawVeh = getVehicleNumber(dev, attrs);
    const rawPhone = getCustomerPhone(attrs);
    const cleaned = cleanVehicleAndPhone(rawVeh, rawPhone);

    const isInstalled = dev.current_status === 'INSTALLED' || Boolean(cleaned.vehicle_number) || (rawCust && rawCust !== '—');

    if (isInstalled || cleaned.vehicle_number || (rawCust && rawCust !== '—')) {
      const key = `${cleaned.vehicle_number || dev.imei_number}_${dev.imei_number}`.toUpperCase();
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const chasis = attrs['CHASIS NUMBER'] || attrs['Chasis Number'] || attrs['Chassis Number'] || attrs['CHASSIS'] || attrs['Chasis'] || '';
        const engine = attrs['ENGINE NUMBER'] || attrs['Engine Number'] || attrs['ENGINE'] || attrs['Engine'] || '';
        const aadhar = attrs['AADHAR NUMBER'] || attrs['Aadhar Number'] || attrs['Aadhar'] || attrs['AADHAR'] || attrs['Aadhaar Number'] || '';
        const pan = attrs['PAN NUMBER'] || attrs['Pan Number'] || attrs['PAN'] || attrs['Pan'] || '';
        const email = attrs['EMAIL'] || attrs['Customer Email'] || attrs['Email'] || '';
        const date = getInstallationDateValue(dev, attrs);
        const model = getDeviceModelName(dev, attrs);
        const rtoLoc = deriveRTOLocation(cleaned.vehicle_number, attrs);

        records.push({
          customer_name: (rawCust && rawCust !== '—') ? rawCust : '—',
          phone_number: (cleaned.phone_number && cleaned.phone_number !== '—') ? cleaned.phone_number : '',
          aadhar_number: aadhar,
          pan_number: pan,
          vehicle_number: cleaned.vehicle_number || (dev.current_status === 'INSTALLED' ? 'Installed' : '—'),
          rto_location: rtoLoc,
          chasis_number: chasis,
          engine_number: engine,
          email: email,
          imei_number: dev.imei_number,
          device_model: model,
          installation_date: date || '—',
          location: dev.current_holder_name || attrs['STOCK PLACE'] || '',
          sale_price: attrs['TOTAL COST'] || attrs['COST'] || 0,
          payment_status: attrs['AMOUNT RECEIVED'] ? 'RECEIVED' : 'PENDING'
        });
      }
    }
  });

  return records;
}


// GET /api/reports/customer-directory - List customer KYC & vehicle directory JSON
router.get('/customer-directory', (req, res) => {
  try {
    const records = getCustomerDirectoryRecords();
    res.json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/customer-directory/export - Download Customer Master Excel Sheet (.xlsx)
router.get('/customer-directory/export', async (req, res) => {
  try {
    const records = getCustomerDirectoryRecords();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FuelTracks Technologies';
    wb.lastModifiedBy = 'FuelTracks IMS';
    wb.created = new Date();

    const ws = wb.addWorksheet('Customer KYC Master Directory', {
      views: [{ showGridLines: true, state: 'frozen', ySplit: 3 }]
    });

    // 1. Title Banner
    ws.mergeCells('A1:L1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'FUELTRACKS TECHNOLOGIES - CUSTOMER KYC & VEHICLE DIRECTORY MASTER SHEET';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' } // Slate 900
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 36;

    // 2. Subtitle / Timestamp
    ws.mergeCells('A2:L2');
    const subCell = ws.getCell('A2');
    subCell.value = `Export Generated on ${new Date().toLocaleString('en-IN')} | Total Records: ${records.length}`;
    subCell.font = { italic: true, size: 10, color: { argb: 'FF475569' }, name: 'Calibri' };
    subCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' } // Slate 100
    };
    subCell.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(2).height = 20;

    // 3. Header Row (Includes RTO Location right after Vehicle Number)
    const headers = [
      'Customer Name',
      'Phone Number',
      'Aadhaar Number',
      'PAN Number',
      'Vehicle Number',
      'RTO Location',
      'Chassis Number',
      'Engine Number',
      'Email Address',
      'IMEI Number',
      'Device Model',
      'Installation Date'
    ];

    const headerRow = ws.addRow(headers);
    headerRow.height = 28;

    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4338CA' } // Indigo 700
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF312E81' } },
        left: { style: 'thin', color: { argb: 'FF312E81' } },
        bottom: { style: 'medium', color: { argb: 'FF312E81' } },
        right: { style: 'thin', color: { argb: 'FF312E81' } }
      };
    });

    // 4. Data Rows
    records.forEach((rec, idx) => {
      const rowValues = [
        rec.customer_name || '—',
        rec.phone_number || '',
        rec.aadhar_number || '-',
        rec.pan_number || '-',
        rec.vehicle_number || '-',
        rec.rto_location || '-',
        rec.chasis_number || '-',
        rec.engine_number || '-',
        rec.email || '-',
        rec.imei_number || '',
        rec.device_model || '',
        rec.installation_date || ''
      ];

      const row = ws.addRow(rowValues);
      row.height = 22;

      const isEven = idx % 2 === 0;

      row.eachCell((cell, colNum) => {
        cell.font = {
          size: 10,
          name: 'Calibri',
          color: { argb: 'FF1E293B' },
          bold: colNum === 1 || colNum === 5 // Bold for Customer Name & Vehicle Number
        };

        cell.alignment = {
          vertical: 'middle',
          horizontal: [2, 3, 4, 5, 6, 7, 8, 10, 12].includes(colNum) ? 'center' : 'left'
        };

        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' }
        };

        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        // Format Vehicle Number column with special amber highlight
        if (colNum === 5 && cell.value && cell.value !== '-') {
          cell.font = { bold: true, color: { argb: 'FF92400E' }, name: 'Calibri', size: 10 };
        }
        // Format RTO Location column with blue text
        if (colNum === 6 && cell.value && cell.value !== '-') {
          cell.font = { bold: true, color: { argb: 'FF1E40AF' }, name: 'Calibri', size: 10 };
        }
      });
    });

    // Set Column Widths
    ws.columns = [
      { width: 26 }, // Customer Name
      { width: 18 }, // Phone Number
      { width: 20 }, // Aadhaar Number
      { width: 18 }, // PAN Number
      { width: 20 }, // Vehicle Number
      { width: 24 }, // RTO Location
      { width: 24 }, // Chassis Number
      { width: 22 }, // Engine Number
      { width: 28 }, // Email Address
      { width: 22 }, // IMEI Number
      { width: 20 }, // Device Model
      { width: 20 }  // Installation Date
    ];

    const filename = `FuelTracks_Customer_KYC_Directory_${new Date().toISOString().split('T')[0]}`;
    const buffer = await wb.xlsx.writeBuffer();


    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/backup-database - 1-Click live SQLite database backup snapshot download
router.get('/backup-database', (req, res) => {
  try {
    // Flush all pending WAL journal writes to database file
    db.pragma('wal_checkpoint(TRUNCATE)');

    const fs = require('fs');
    const path = require('path');
    const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
    const dbPath = path.join(dataDir, 'inventory.db');

    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ success: false, error: 'Database file not found' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `FuelTracks_Live_DB_Backup_${timestamp}.db`;

    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const fileStream = fs.createReadStream(dbPath);
    fileStream.pipe(res);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/payments-excel - Formatted Daily & Custom Range Payment Statement (.xlsx)
router.get('/payments-excel', async (req, res) => {
  try {

    const {
      range = 'today',
      start_date,
      end_date,
      dealer_name,
      device_type_id
    } = req.query;

    const now = new Date();
    const todayISO = now.toISOString().split('T')[0];
    const yesterdayObj = new Date(now);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayISO = yesterdayObj.toISOString().split('T')[0];
    const weekAgoObj = new Date(now);
    weekAgoObj.setDate(weekAgoObj.getDate() - 7);
    const weekAgoISO = weekAgoObj.toISOString().split('T')[0];
    const firstDayOfMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    let activeStartDate = todayISO;
    let activeEndDate = todayISO;

    if (range === 'today') {
      activeStartDate = todayISO;
      activeEndDate = todayISO;
    } else if (range === 'yesterday') {
      activeStartDate = yesterdayISO;
      activeEndDate = yesterdayISO;
    } else if (range === 'this_week') {
      activeStartDate = weekAgoISO;
      activeEndDate = todayISO;
    } else if (range === 'this_month') {
      activeStartDate = firstDayOfMonthISO;
      activeEndDate = todayISO;
    } else if (range === 'all') {
      activeStartDate = '1970-01-01';
      activeEndDate = '2099-12-31';
    } else if (range === 'custom') {
      activeStartDate = start_date ? start_date : todayISO;
      activeEndDate = end_date ? end_date : todayISO;
    }

    let whereClauses = [];
    let params = [];

    if (device_type_id) {
      whereClauses.push('d.device_type_id = ?');
      params.push(device_type_id);
    }
    if (dealer_name) {
      whereClauses.push('(d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)');
      params.push(`%${dealer_name}%`, `%${dealer_name}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const devices = db.prepare(`
      SELECT 
        d.*,
        dt.name as device_type_name
      FROM devices d
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      ${whereSql}
      ORDER BY d.id DESC
    `).all(...params);

    const rows = [];
    let totalCollected = 0;
    let totalPending = 0;

    const MONTH_INDEX_MAP = {
      'JANUARY': '01', 'JAN': '01', 'FEBRUARY': '02', 'FEB': '02', 'MARCH': '03', 'MAR': '03',
      'APRIL': '04', 'APR': '04', 'MAY': '05', 'JUNE': '06', 'JUN': '06', 'JULY': '07', 'JUL': '07',
      'AUGUST': '08', 'AUG': '08', 'SEPTEMBER': '09', 'SEP': '09', 'SEPT': '09', 'OCTOBER': '10',
      'OCT': '10', 'NOVEMBER': '11', 'NOV': '11', 'DECEMBER': '12', 'DEC': '12'
    };

    for (const dev of devices) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

      const payStatusRaw = attrs['AMOUNT RECEIVED'] || attrs['PAYMENT STATUS'] || (dev.current_status === 'INSTALLED' ? 'PAID' : 'PENDING');
      const isPaid = String(payStatusRaw).toUpperCase().includes('REC') || 
                     String(payStatusRaw).toUpperCase().includes('PAID') || 
                     String(payStatusRaw).toUpperCase().includes('YES') ||
                     Boolean(attrs['AMOUNT RECEIVED BY']);

      // Strictly ignore any unpaid / pending records
      if (!isPaid) continue;

      // Extract payment date
      const priorityKeys = [
        'PAYMENT DATE', 'Payment Date', 'payment_date',
        'PAYMENT RECEIVED DATE', 'Payment Received Date',
        'DATE', 'Date', 'date',
        'STOCK PLACE DATE', 'CERTIFICATE ISSUED DATE', 'INSTALLATION DATE'
      ];
      let devDateISO = null;
      let rawDate = null;
      let hasExactDate = false;

      for (const k of priorityKeys) {
        if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
          rawDate = String(attrs[k]).trim();
          const upper = rawDate.toUpperCase();

          for (const [mName, mNum] of Object.entries(MONTH_INDEX_MAP)) {
            if (upper === mName || upper.startsWith(mName + ' ') || upper.startsWith(mName + '-')) {
              devDateISO = `2026-${mNum}-01`;
              hasExactDate = false;
              break;
            }
          }
          if (devDateISO) break;

          const num = Number(rawDate);
          if (!isNaN(num) && num > 30000 && num < 65000 && !rawDate.includes('-') && !rawDate.includes('/')) {
            const d = new Date(Math.round((num - 25569) * 86400 * 1000));
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            devDateISO = `${y}-${m}-${day}`;
            hasExactDate = true;
            break;
          }

          const parts = rawDate.split(/[-/.]/);
          if (parts.length === 3) {
            if (parts[0].length === 4) devDateISO = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            else if (parts[2].length === 4) devDateISO = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            else if (parts[2].length === 2) devDateISO = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            hasExactDate = true;
            break;
          }
        }
      }

      if (!devDateISO) {
        for (const k of Object.keys(attrs)) {
          if (/^month$|^received.*month$/i.test(k.trim()) && attrs[k]) {
            const raw = String(attrs[k]).trim().toUpperCase();
            for (const [mName, mNum] of Object.entries(MONTH_INDEX_MAP)) {
              if (raw === mName || raw.startsWith(mName)) {
                devDateISO = `2026-${mNum}-01`;
                rawDate = String(attrs[k]).trim();
                hasExactDate = false;
                break;
              }
            }
          }
          if (devDateISO) break;
        }
      }

      if (!devDateISO) {
        devDateISO = '1970-01-01';
        rawDate = 'Unspecified Date';
        hasExactDate = false;
      }

      let inRange = false;
      if (range === 'today') inRange = hasExactDate && devDateISO === todayISO;
      else if (range === 'yesterday') inRange = hasExactDate && devDateISO === yesterdayISO;
      else if (range === 'this_week') inRange = hasExactDate && devDateISO >= weekAgoISO && devDateISO <= todayISO;
      else if (range === 'this_month') inRange = devDateISO >= firstDayOfMonthISO && devDateISO <= todayISO;
      else if (range === 'all') inRange = true;
      else if (range === 'custom') inRange = devDateISO >= activeStartDate && devDateISO <= activeEndDate;

      if (inRange) {
        // Extract cost & payment status
        let costVal = 0;
        const costKeys = ['TOTAL COST', 'TOTAL_COST', 'COST', 'SALE PRICE', 'PRICE', 'AMOUNT'];
        for (const ck of costKeys) {
          if (attrs[ck]) {
            const clean = String(attrs[ck]).replace(/[^0-9.]/g, '');
            if (clean && !isNaN(Number(clean))) {
              costVal = parseFloat(clean);
              break;
            }
          }
        }
        if (!costVal && dev.purchase_price) costVal = Number(dev.purchase_price);

        totalCollected += costVal;

        const custName = attrs['CUSTOMER NAME'] || attrs['Customer Name'] || attrs['CERTIFICATE ISSUED TO'] || '—';
        const custPhone = attrs['CUSTOMER PHONE NUMBER'] || attrs['Customer Phone'] || '—';
        const vehNo = attrs['VEHICLE NUMBER'] || attrs['Vehicle Number'] || (dev.current_status === 'INSTALLED' ? 'Installed' : '—');
        const stockPlace = attrs['STOCK PLACE'] || dev.current_holder_name || 'Central Warehouse';
        const receivedBy = attrs['AMOUNT RECEIVED BY'] || attrs['SALES PERSON NAME'] || '—';

        rows.push({
          payment_date: rawDate || devDateISO,
          imei_number: dev.imei_number,
          device_type: dev.device_type_name || 'GPS Tracker',
          vehicle_number: vehNo,
          customer_name: custName,
          customer_phone: custPhone,
          stock_place: stockPlace,
          amount: costVal,
          status: 'RECEIVED',
          received_by: receivedBy
        });
      }
    }



    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Payments Statement');

    // Title Row
    ws.mergeCells('A1:J1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'FUELTRACKS TECHNOLOGIES — DAILY PAYMENTS & COLLECTIONS STATEMENT';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Slate-900
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 35;

    // Subtitle Row
    ws.mergeCells('A2:J2');
    const subCell = ws.getCell('A2');
    subCell.value = `Date Range: ${activeStartDate} to ${activeEndDate} | Total Units: ${rows.length} | Generated: ${new Date().toLocaleString('en-IN')}`;
    subCell.font = { italic: true, size: 10, color: { argb: 'FF475569' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 22;

    // Summary Card Row
    ws.mergeCells('A4:D4');
    ws.getCell('A4').value = `Total Collected: ₹${totalCollected.toLocaleString('en-IN')}`;
    ws.getCell('A4').font = { bold: true, size: 11, color: { argb: 'FF065F46' } };
    ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells('E4:G4');
    ws.getCell('E4').value = `Pending Due: ₹${totalPending.toLocaleString('en-IN')}`;
    ws.getCell('E4').font = { bold: true, size: 11, color: { argb: 'FF991B1B' } };
    ws.getCell('E4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    ws.getCell('E4').alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells('H4:J4');
    const efficiency = (totalCollected + totalPending) > 0 ? Math.round((totalCollected / (totalCollected + totalPending)) * 100) : 100;
    ws.getCell('H4').value = `Collection Efficiency: ${efficiency}%`;
    ws.getCell('H4').font = { bold: true, size: 11, color: { argb: 'FF1E40AF' } };
    ws.getCell('H4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    ws.getCell('H4').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(4).height = 26;

    // Table Headers
    const headers = [
      'S.No', 'Payment Date', 'IMEI Number', 'Device Model',
      'Vehicle Number', 'Customer Name', 'Contact Phone',
      'Stock Place / Dealer', 'Amount (₹)', 'Payment Status', 'Received By / Mode'
    ];
    const headerRow = ws.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate-800
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Populate Data
    rows.forEach((r, idx) => {
      const row = ws.addRow([
        idx + 1,
        r.payment_date,
        r.imei_number,
        r.device_type,
        r.vehicle_number,
        r.customer_name,
        r.customer_phone,
        r.stock_place,
        r.amount,
        r.status,
        r.received_by
      ]);
      row.height = 22;

      row.eachCell((cell, colNum) => {
        cell.alignment = { vertical: 'middle', horizontal: colNum === 1 || colNum === 2 || colNum === 9 || colNum === 10 ? 'center' : 'left' };
        cell.font = { name: 'Calibri', size: 10 };

        // Currency format
        if (colNum === 9) {
          cell.numFmt = '₹#,##0';
          cell.font = { bold: true, size: 10 };
        }

        // Status styling
        if (colNum === 10) {
          cell.font = { bold: true, color: { argb: r.status === 'PAID' ? 'FF065F46' : 'FF991B1B' } };
        }
      });
    });

    // Total Row
    const totalRow = ws.addRow([
      '', 'TOTAL', '', '', '', '', '', '',
      totalCollected,
      `${rows.filter(r => r.status === 'PAID').length} Paid`,
      ''
    ]);
    totalRow.height = 26;
    totalRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      if (colNum === 9) cell.numFmt = '₹#,##0';
    });

    ws.columns = [
      { width: 8 },  // S.No
      { width: 16 }, // Payment Date
      { width: 20 }, // IMEI Number
      { width: 16 }, // Device Model
      { width: 18 }, // Vehicle Number
      { width: 22 }, // Customer Name
      { width: 18 }, // Contact Phone
      { width: 24 }, // Stock Place / Dealer
      { width: 16 }, // Amount (₹)
      { width: 16 }, // Payment Status
      { width: 22 }  // Received By / Mode
    ];

    const filename = `FuelTracks_Payments_Statement_${activeStartDate}_to_${activeEndDate}`;
    const buffer = await wb.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/pnl - Comprehensive Profit & Loss Financial Summary
router.get('/pnl', (req, res) => {
  try {
    const { startDate = '', endDate = '' } = req.query;

    let instDateFilter = '';
    let expDateFilter = '';
    const instParams = [];
    const expParams = [];

    if (startDate && endDate) {
      instDateFilter = ' WHERE i.installation_date >= ? AND i.installation_date <= ?';
      instParams.push(startDate, endDate);
      expDateFilter = ' WHERE expense_date >= ? AND expense_date <= ?';
      expParams.push(startDate, endDate);
    } else if (startDate) {
      instDateFilter = ' WHERE i.installation_date >= ?';
      instParams.push(startDate);
      expDateFilter = ' WHERE expense_date >= ?';
      expParams.push(startDate);
    } else if (endDate) {
      instDateFilter = ' WHERE i.installation_date <= ?';
      instParams.push(endDate);
      expDateFilter = ' WHERE expense_date <= ?';
      expParams.push(endDate);
    }

    // 1. Revenue & Hardware Cost from Installations
    const revQuery = `
      SELECT 
        COUNT(i.id) as total_installations,
        SUM(COALESCE(i.sale_price, 0)) as total_billed_revenue,
        SUM(CASE WHEN UPPER(i.payment_status) = 'PAID' THEN COALESCE(i.sale_price, 0) ELSE 0 END) as collected_revenue,
        SUM(CASE WHEN UPPER(i.payment_status) != 'PAID' THEN COALESCE(i.sale_price, 0) ELSE 0 END) as pending_revenue,
        SUM(COALESCE(d.purchase_price, 0)) as hardware_purchase_cost
      FROM installations i
      LEFT JOIN devices d ON i.device_id = d.id
      ${instDateFilter}
    `;
    const revData = db.prepare(revQuery).get(...instParams);

    // 2. Operational Expenses
    const expQuery = `
      SELECT 
        SUM(amount) as total_expenses,
        COUNT(*) as expense_count,
        SUM(CASE WHEN category = 'TECHNICIAN_TRAVEL' THEN amount ELSE 0 END) as travel_expenses,
        SUM(CASE WHEN category = 'COURIER_FREIGHT' THEN amount ELSE 0 END) as courier_expenses,
        SUM(CASE WHEN category = 'TECHNICIAN_PAYOUT' THEN amount ELSE 0 END) as payout_expenses,
        SUM(CASE WHEN category = 'OFFICE_MISC' OR category = 'OTHER' THEN amount ELSE 0 END) as misc_expenses
      FROM expenses
      ${expDateFilter}
    `;
    const expData = db.prepare(expQuery).get(...expParams);

    const totalBilled = revData?.total_billed_revenue || 0;
    const collectedRevenue = revData?.collected_revenue || 0;
    const hardwareCost = revData?.hardware_purchase_cost || 0;
    const totalExpenses = expData?.total_expenses || 0;

    const grossProfit = totalBilled - hardwareCost;
    const netProfit = grossProfit - totalExpenses;
    const marginPct = totalBilled > 0 ? ((netProfit / totalBilled) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        total_installations: revData?.total_installations || 0,
        total_billed_revenue: totalBilled,
        collected_revenue: collectedRevenue,
        pending_revenue: revData?.pending_revenue || 0,
        hardware_cost: hardwareCost,
        gross_profit: grossProfit,
        operating_expenses: totalExpenses,
        expense_breakdown: {
          travel: expData?.travel_expenses || 0,
          courier: expData?.courier_expenses || 0,
          payout: expData?.payout_expenses || 0,
          misc: expData?.misc_expenses || 0,
        },
        net_profit: netProfit,
        profit_margin_pct: Number(marginPct)
      }
    });
  } catch (err) {
    console.error('[Reports] PnL error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

