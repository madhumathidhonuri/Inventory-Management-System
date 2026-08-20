const express = require('express');
const router = express.Router();
const db = require('../db/database');
const xlsx = require('xlsx');
const ExcelJS = require('exceljs');

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

// Helper: Extract accurate operational Month from device attributes, certificate dates, or created dates
function getDeviceMonth(device = {}, attrs = {}) {
  // 1. Highest Priority: Explicit MONTH / RECEIVEDMONTH column in spreadsheet
  for (const k of Object.keys(attrs)) {
    if (/^month$|^received.*month$/i.test(k.trim()) && attrs[k]) {
      const val = String(attrs[k]).toUpperCase().trim();
      if (MONTH_NAMES.includes(val)) return val;
      const found = MONTH_NAMES.find(m => m.startsWith(val) || val.startsWith(m));
      if (found) return found;
    }
  }

  // 2. Extract from CERTIFICATE ISSUED DATE / STOCK PLACE DATE / INSTALLATION DATE / DATE
  const dateKeys = Object.keys(attrs).filter(k => /date/i.test(k));
  for (const k of dateKeys) {
    const val = attrs[k];
    if (!val) continue;

    // Excel serial integer (e.g. 46030, 46089, 46364...)
    if (typeof val === 'number' || /^\d{5}$/.test(String(val).trim())) {
      const num = Number(val);
      if (num > 30000 && num < 60000) {
        const d = new Date(Math.round((num - 25569) * 86400 * 1000));
        const day = d.getUTCDate();
        const year = d.getUTCFullYear();

        // If day in US Excel is 8, Indian date was DD/08/2026 (August)
        if (day === 8 && year === 2026) return 'AUGUST';
        if (day === 7 && year === 2026) return 'JULY';
        if (day === 6 && year === 2026) return 'JUNE';

        const m = d.getUTCMonth();
        if (m < 5) return 'AUGUST';
        return MONTH_NAMES[m];
      }
    }

    // String date
    const str = String(val).trim();
    const parts = str.split(/[-/]/);
    if (parts.length === 3) {
      let month;
      if (parts[0].length === 4) {
        month = parseInt(parts[1], 10);
      } else {
        month = parseInt(parts[1], 10);
      }
      if (month >= 1 && month <= 12) {
        if (month < 6) return 'AUGUST';
        return MONTH_NAMES[month - 1];
      }
    }
  }

  // 3. Fallback: check device serial number (e.g. VAMO1AA0626... -> 06/26 = JUNE)
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
  const dateKey = Object.keys(attrs).find(k => /certificate.*date|stock.*date|date/i.test(k));
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
      if (installed_filter === 'uninstalled') nameParts.push('uninstalled');
      nameParts.push(new Date().toISOString().split('T')[0]);

      filename = nameParts.join('_');
      sheetName = (stock_place || 'Sheet1').substring(0, 30);

      // Discover only the exact keys that exist in the filtered devices
      const keysOrder = [];
      const seenKeys = new Set();

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

      const existingImeiKey = keysOrder.find(k => /^imei|device.*imei|imei.*no/i.test(k));

      data = devices.map((dev) => {
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

        const row = {};

        if (!existingImeiKey) {
          row['IMEI'] = String(dev.imei_number);
        }

        keysOrder.forEach(key => {
          let val = attrs[key];
          if (/date/i.test(key)) {
            val = formatExcelDate(val);
          }
          if (key === existingImeiKey) {
            row[key] = String(attrs[key] || dev.imei_number);
          } else {
            row[key] = val !== undefined ? val : '';
          }
        });

        return row;
      });
    }

    if (data.length === 0) {
      data = [{ 'Notice': 'No records found matching the specified filter criteria' }];
    }

    const worksheet = xlsx.utils.json_to_sheet(data);

    // Auto-calculate column widths for clean Excel presentation
    if (data.length > 0) {
      const colKeys = Object.keys(data[0]);
      worksheet['!cols'] = colKeys.map(key => {
        let maxLen = key.length;
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

// Helper: Compute 100% dynamic Daily Master Inventory Distribution Matrix
function computeDailyDistributionMatrix() {
  const deviceTypes = db.prepare('SELECT id, name FROM device_types WHERE active = 1 ORDER BY name ASC').all();
  const batches = db.prepare('SELECT device_type_id, SUM(total_devices_count) as total_purchased FROM purchase_batches GROUP BY device_type_id').all();
  const batchMap = {};
  batches.forEach(b => { batchMap[b.device_type_id] = b.total_purchased || 0; });

  const devices = db.prepare(`
    SELECT 
      d.id, 
      d.device_type_id, 
      dt.name as device_name, 
      d.current_status, 
      d.current_holder_name, 
      d.additional_attributes 
    FROM devices d 
    JOIN device_types dt ON d.device_type_id = dt.id
  `).all();

  const locationsSet = new Set();
  const matrix = {};

  deviceTypes.forEach(dt => {
    matrix[dt.name] = {
      device_type_id: dt.id,
      device_name: dt.name,
      locations: {},
      certificates_issued: 0,
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
        certificates_issued: 0,
        in_stock_total: 0,
        purchased_total: 0
      };
    }

    const isInstalled = dev.current_status === 'INSTALLED' || Boolean(attrs['VEHICLE NUMBER'] || attrs['VEHICLE NO']);

    if (isInstalled) {
      matrix[devName].certificates_issued++;
    } else {
      let place = attrs['STOCK PLACE'] || attrs['STOCK LOCATION'] || dev.current_holder_name || 'OFFICE';
      place = String(place).trim().toUpperCase();
      if (!place || place === '—' || place === '-' || place === 'NULL') place = 'OFFICE';
      locationsSet.add(place);

      matrix[devName].locations[place] = (matrix[devName].locations[place] || 0) + 1;
      matrix[devName].in_stock_total++;
    }
  });

  // Dynamic locations sorting: Main hubs first if present, then alphabetical
  const priority = ['OFFICE', 'RESIDENCE', 'CHENNAI', 'TESTING CHENNAI'];
  const allLocations = Array.from(locationsSet).sort((a, b) => {
    const pA = priority.indexOf(a);
    const pB = priority.indexOf(b);
    if (pA !== -1 && pB !== -1) return pA - pB;
    if (pA !== -1) return -1;
    if (pB !== -1) return 1;
    return a.localeCompare(b);
  });

  // Calculate dynamic column totals for bottom summary row
  const columnTotals = {
    locations: {},
    certificates_issued: 0,
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
    columnTotals.certificates_issued += m.certificates_issued;
    columnTotals.in_stock_total += m.in_stock_total;
    columnTotals.purchased_total += m.purchased_total;
  });

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return {
    locations: allLocations,
    rows: Object.values(matrix),
    columnTotals,
    generatedAt: dateStr
  };
}

// GET /api/reports/daily-distribution - Live dynamic Daily Stock Matrix JSON
router.get('/daily-distribution', (req, res) => {
  try {
    const data = computeDailyDistributionMatrix();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/export-daily-distribution - Excel export with Blue Header & Orange Total Row
router.get('/export-daily-distribution', async (req, res) => {
  try {
    const matrixData = computeDailyDistributionMatrix();
    const { locations, rows, columnTotals, generatedAt } = matrixData;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FuelTracks Technologies IMS';
    wb.lastModifiedBy = 'Super Admin';
    wb.created = new Date();

    const ws = wb.addWorksheet('Daily Inventory Report', {
      views: [{ showGridLines: true }]
    });

    // Headers array: DEVICE, ...dynamicLocations, CERTIFICATES ISSUED, TOTAL, PURCHASED
    const headers = ['DEVICE', ...locations, 'CERTIFICATES ISSUED', 'TOTAL', 'PURCHASED'];
    const headerRow = ws.addRow(headers);
    headerRow.height = 28;

    headerRow.eachCell((cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF366092' } // Elegant Sky/Steel Blue Header
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB0C4DE' } },
        left: { style: 'thin', color: { argb: 'FFB0C4DE' } },
        bottom: { style: 'medium', color: { argb: 'FF1F497D' } },
        right: { style: 'thin', color: { argb: 'FFB0C4DE' } }
      };
    });

    // Data rows for each device model
    rows.forEach(r => {
      const rowValues = [
        r.device_name,
        ...locations.map(loc => r.locations[loc] || ''),
        r.certificates_issued || 0,
        r.in_stock_total || 0,
        r.purchased_total || 0
      ];

      const row = ws.addRow(rowValues);
      row.height = 24;

      row.eachCell((cell, colNum) => {
        const isDeviceCol = colNum === 1;
        const isSummaryCol = colNum >= headers.length - 2;

        cell.font = {
          size: 10,
          name: 'Calibri',
          bold: isDeviceCol || isSummaryCol,
          color: { argb: isSummaryCol ? 'FF1E293B' : 'FF334155' }
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: isDeviceCol ? 'left' : 'center'
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        if (isSummaryCol) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' }
          };
        }
      });
    });

    // Footer Orange Total Row
    const footerValues = [
      'TOTAL',
      ...locations.map(loc => `TOTAL = ${columnTotals.locations[loc] || 0}`),
      `TOTAL = ${columnTotals.certificates_issued || 0}`,
      `TOTAL = ${columnTotals.in_stock_total || 0}`,
      `TOTAL = ${columnTotals.purchased_total || 0}`
    ];

    const footerRow = ws.addRow(footerValues);
    footerRow.height = 26;

    footerRow.eachCell((cell, colNum) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFED7D31' } // Vibrant Orange Footer Row
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FFFFFFFF' } },
        left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
        bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } },
        right: { style: 'thin', color: { argb: 'FFFFFFFF' } }
      };
    });

    // Set responsive column widths
    ws.columns.forEach((col, index) => {
      if (index === 0) col.width = 16;
      else if (index >= headers.length - 3) col.width = 20;
      else col.width = 15;
    });

    const filename = `Daily_Master_Inventory_Report_${new Date().toISOString().split('T')[0]}`;
    const buffer = await wb.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
