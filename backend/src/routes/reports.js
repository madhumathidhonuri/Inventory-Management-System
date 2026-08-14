const express = require('express');
const router = express.Router();
const db = require('../db/database');
const xlsx = require('xlsx');

// Helper: Format Excel date serial numbers or standard date strings
function formatExcelDate(val) {
  if (!val) return '';
  if (typeof val === 'number' || (!isNaN(val) && !String(val).includes('-') && !String(val).includes('/'))) {
    const num = Number(val);
    if (num > 30000 && num < 60000) {
      // Excel epoch date conversion
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${day}-${month}-${year}`;
    }
  }
  return String(val).trim();
}

// Helper: Extract vehicle number from device and attributes
function getVehicleNumber(device, attrs = {}) {
  const vehKey = Object.keys(attrs).find(k => /vehicle|veh_no|reg_no|truck|bus|car|auto/i.test(k));
  if (vehKey && attrs[vehKey]) {
    return String(attrs[vehKey]).trim();
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

// Helper: Extract customer name from attributes (prioritizing real individual/client names over platform names)
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

// Helper: Extract Device Name
function getDeviceName(device, attrs = {}) {
  const devKey = Object.keys(attrs).find(k => /device.*name|model|product.*name/i.test(k));
  if (devKey && attrs[devKey]) {
    return String(attrs[devKey]).trim();
  }
  return device.device_type_name || 'GPS Tracker';
}

// Helper: Extract SIM numbers (supports Sim 1, Sim 2, simno1, simno2, or primary SIM)
function getSimNumbers(device, attrs = {}) {
  const sim1 = attrs['Sim 1'] || attrs['simno1'] || attrs['SIM NUMBER'] || device.sim_number || '';
  const sim2 = attrs['Sim 2'] || attrs['simno2'] || '';
  const sims = [sim1, sim2].filter(Boolean).map(s => String(s).trim());
  return sims.length > 0 ? sims.join(' / ') : '—';
}

// Helper: Extract Total Cost / Cost (strictly currency numbers, excluding "AMOUNT RECEIVED")
function getTotalCost(attrs = {}) {
  const keys = ['TOTAL COST', 'TOTAL_COST', 'COST', 'SALE PRICE', 'PRICE', 'INSTALLATION CHARGES'];
  for (const k of keys) {
    if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '' && !isNaN(Number(attrs[k]))) {
      return `₹${Number(attrs[k]).toLocaleString('en-IN')}`;
    }
  }
  if (attrs['Amount'] !== undefined && !isNaN(Number(attrs['Amount'])) && String(attrs['Amount']).trim() !== '') {
    return `₹${Number(attrs['Amount']).toLocaleString('en-IN')}`;
  }
  return '—';
}

// Helper: Extract Amount Received Status
function getAmountReceivedStatus(attrs = {}) {
  const keys = ['AMOUNT RECEIVED', 'Amount Received', 'AMOUNT RECEIVED BY', 'PAYMENT STATUS'];
  for (const k of keys) {
    if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
      const val = String(attrs[k]).trim().toUpperCase();
      if (val.includes('NOT') || val.includes('UNPAID') || val.includes('DUE') || val.includes('PENDING')) {
        return 'NOT RECEIVED';
      }
      if (val.includes('REC') || val.includes('PAID') || val.includes('DONE')) {
        return 'RECEIVED';
      }
      return val;
    }
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

// GET /api/reports/options - Return filter options and summary counts
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
      SELECT d.id, d.purchase_batch_id, d.current_status, d.additional_attributes
      FROM devices d
    `).all();

    const batchPlacesMap = {};
    const placesMap = {};
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
    });

    const stockPlaces = Object.keys(placesMap).map(place => ({
      name: place,
      count: placesMap[place]
    })).sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: {
        batches,
        deviceTypes,
        stockPlaces,
        batchPlacesMap,
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

    return true;
  });
}

// GET /api/reports/preview - Preview report count & top rows
router.get('/preview', (req, res) => {
  try {
    const devices = queryFilteredDevices(req.query);
    const isManagerLayout = req.query.report_layout === 'manager' || req.query.type === 'manager_statement';

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
          date: getDateValue(d, attrs),
          current_status: d.current_status
        };
      })
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/export - Export Excel/CSV with support for Manager Executive Statement format
router.get('/export', (req, res) => {
  const { type, format, purchase_batch_id, stock_place, installed_filter, report_layout } = req.query;

  try {
    let data = [];
    let filename = `inventory_export_${new Date().toISOString().split('T')[0]}`;
    let sheetName = 'InventoryData';

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

module.exports = router;
