const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Helper: Extract numeric cost/price from device attributes or fallback price
function extractCostValue(attrs = {}, fallbackPrice = 0) {
  const keys = [
    'TOTAL COST', 'TOTAL_COST', 'Total Cost', 'total_cost',
    'COST', 'Cost', 'cost',
    'SALE PRICE', 'Sale Price', 'sale_price', 'PRICE', 'Price', 'price',
    'AMOUNT', 'Amount', 'amount',
    'INSTALLATION CHARGES', 'Installation Charges'
  ];
  for (const k of keys) {
    if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
      const clean = String(attrs[k]).replace(/[^0-9.]/g, '');
      if (clean && !isNaN(Number(clean))) {
        return parseFloat(clean);
      }
    }
  }
  if (fallbackPrice && !isNaN(Number(fallbackPrice))) {
    return Number(fallbackPrice);
  }
  return 0;
}

// Helper: Determine whether payment was received
function isPaymentReceived(attrs = {}, currentStatus = '') {
  const keys = [
    'AMOUNT RECEIVED', 'Amount Received', 'amount_received',
    'PAYMENT STATUS', 'Payment Status', 'payment_status',
    'Payment', 'PAYMENT'
  ];
  for (const k of keys) {
    if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
      const val = String(attrs[k]).toUpperCase().trim();
      if (val.includes('NOT') || val.includes('UNPAID') || val.includes('PENDING') || val.includes('DUE')) {
        return false;
      }
      if (val.includes('REC') || val.includes('PAID') || val.includes('DONE') || val.includes('YES')) {
        return true;
      }
    }
  }
  if (attrs['AMOUNT RECEIVED BY'] && String(attrs['AMOUNT RECEIVED BY']).trim()) {
    return true;
  }
  return false;
}

// Helper: Normalize various Excel serials or string dates into YYYY-MM-DD
function normalizeDateToISO(val) {
  if (!val) return null;

  // 1. Number or numeric string (Excel serial e.g. 46089, 46030)
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 65000 && !String(val).includes('-') && !String(val).includes('/')) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 2. String date (DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY)
  const str = String(val).trim();
  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    } else if (parts[2].length === 2) {
      // DD-MM-YY
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = '20' + parts[2];
      return `${y}-${m}-${d}`;
    }
  }

  // 3. Fallback Date.parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

// Helper: Extract accurate Payment Date from device attributes or dates
function extractPaymentDate(attrs = {}, device = {}) {
  const priorityKeys = [
    'PAYMENT DATE', 'Payment Date', 'payment_date',
    'PAYMENT RECEIVED DATE', 'Payment Received Date', 'payment_received_date',
    'DATE', 'Date', 'date',
    'STOCK PLACE DATE', 'Stock Place Date',
    'CERTIFICATE ISSUED DATE', 'Certificate Issued Date',
    'INSTALLATION DATE', 'Installation Date'
  ];

  for (const k of priorityKeys) {
    if (attrs[k]) {
      const iso = normalizeDateToISO(attrs[k]);
      if (iso) return { isoDate: iso, rawValue: String(attrs[k]).trim(), sourceColumn: k };
    }
  }

  // Any attribute matching /payment.*date|date/i
  for (const k of Object.keys(attrs)) {
    if (/payment.*date|date/i.test(k) && attrs[k]) {
      const iso = normalizeDateToISO(attrs[k]);
      if (iso) return { isoDate: iso, rawValue: String(attrs[k]).trim(), sourceColumn: k };
    }
  }

  if (device.updated_at) {
    const iso = device.updated_at.split(' ')[0] || device.updated_at.split('T')[0];
    return { isoDate: iso, rawValue: iso, sourceColumn: 'updated_at' };
  }

  if (device.created_at) {
    const iso = device.created_at.split(' ')[0] || device.created_at.split('T')[0];
    return { isoDate: iso, rawValue: iso, sourceColumn: 'created_at' };
  }

  return { isoDate: new Date().toISOString().split('T')[0], rawValue: 'Today', sourceColumn: 'default' };
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

// Helper: Extract accurate operational Month from device attributes
function getDeviceMonth(attrs = {}, device = {}) {
  // 1. Highest Priority: Explicit MONTH / RECEIVEDMONTH column in spreadsheet
  for (const k of Object.keys(attrs)) {

    if (/^month$|^received.*month$/i.test(k.trim()) && attrs[k]) {
      const val = String(attrs[k]).toUpperCase().trim();
      if (MONTH_NAMES.includes(val)) return val;
      const found = MONTH_NAMES.find(m => m.startsWith(val) || val.startsWith(m));
      if (found) return found;
    }
  }

  // 2. Date columns (STOCK PLACE DATE, CERTIFICATE ISSUED DATE, INSTALLATION DATE, DATE)
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

// GET /api/dashboard/stats - Executive Dashboard statistics & metrics
router.get('/stats', (req, res) => {
  const { purchase_batch_id, device_type_id, vendor_name, stock_place, dealer_name, month } = req.query;

  try {
    // 1. Build initial device filter clauses
    let devWhere = [];
    let devParams = [];

    if (purchase_batch_id) {
      devWhere.push('purchase_batch_id = ?');
      devParams.push(purchase_batch_id);
    }
    if (device_type_id) {
      devWhere.push('device_type_id = ?');
      devParams.push(device_type_id);
    }
    if (vendor_name) {
      devWhere.push('vendor_name = ?');
      devParams.push(vendor_name);
    }
    if (dealer_name) {
      devWhere.push('(current_holder_name LIKE ? OR additional_attributes LIKE ?)');
      devParams.push(`%${dealer_name}%`, `%${dealer_name}%`);
    }

    const devWhereSql = devWhere.length > 0 ? `WHERE ${devWhere.join(' AND ')}` : '';

    // Scan devices to detect dynamic placeKey and compute dynamic attributes
    const allFilteredDevices = db.prepare(`
      SELECT id, device_type_id, vendor_name, purchase_batch_id, current_status, current_holder_name, current_holder_type, additional_attributes, updated_at
      FROM devices
      ${devWhereSql}
    `).all(...devParams);

    let placeKey = null;
    for (const dev of allFilteredDevices) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
      const key = Object.keys(attrs).find(k => /stock.*place|place|location|office|site|branch/i.test(k));
      if (key) {
        placeKey = key;
        break;
      }
    }

    // 2. Build dynamic filtering SQL whereClause with alias 'd'
    let filterClauses = [];
    let queryParams = [];

    if (purchase_batch_id) {
      filterClauses.push('d.purchase_batch_id = ?');
      queryParams.push(purchase_batch_id);
    }
    if (device_type_id) {
      filterClauses.push('d.device_type_id = ?');
      queryParams.push(device_type_id);
    }
    if (vendor_name) {
      filterClauses.push('d.vendor_name = ?');
      queryParams.push(vendor_name);
    }
    if (dealer_name) {
      filterClauses.push('(d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)');
      queryParams.push(`%${dealer_name}%`, `%${dealer_name}%`);
    }
    if (stock_place && placeKey) {
      filterClauses.push(`json_extract(d.additional_attributes, '$.' || ?) = ?`);
      queryParams.push(placeKey, stock_place);
    }

    const whereClause = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : '';

    // 3. Track available months and apply month filter if requested
    const monthsMap = {};
    MONTH_NAMES.forEach(m => { monthsMap[m] = 0; });

    const activeMonthFilter = (month && month !== 'ALL') ? month.toUpperCase().trim() : null;
    const devicesToProcess = [];

    for (const dev of allFilteredDevices) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
      const devM = getDeviceMonth(attrs);
      if (devM && monthsMap[devM] !== undefined) {
        monthsMap[devM]++;
      }
      if (activeMonthFilter) {
        if (devM && (devM === activeMonthFilter || devM.includes(activeMonthFilter) || activeMonthFilter.includes(devM))) {
          devicesToProcess.push(dev);
        }
      } else {
        devicesToProcess.push(dev);
      }
    }

    const availableMonths = Object.keys(monthsMap)
      .filter(m => monthsMap[m] > 0)
      .map(m => ({
        key: m,
        label: m.charAt(0) + m.slice(1).toLowerCase(),
        count: monthsMap[m]
      }));

    // 4. Overall status counts accurately computed from dynamic attributes & device status
    let installedCount = 0;
    let withDealerCount = 0;
    let inWarehouseCount = 0;
    let faultyCount = 0;

    for (const dev of devicesToProcess) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

      const vehKey = Object.keys(attrs).find(k => /vehicle.*num|vehicle|veh_no|reg_no/i.test(k));
      const hasVeh = Boolean((vehKey && String(attrs[vehKey]).trim()) || dev.current_status === 'INSTALLED');

      const placeKeyName = Object.keys(attrs).find(k => /stock.*place|place|location/i.test(k));
      const place = placeKeyName && attrs[placeKeyName] ? String(attrs[placeKeyName]).trim().toUpperCase() : '';

      if (dev.current_status === 'FAULTY') {
        faultyCount++;
      } else if (hasVeh) {
        installedCount++;
      } else if (place && !place.includes('OFFICE') && !place.includes('CENTRAL WAREHOUSE') && !place.includes('WAREHOUSE')) {
        withDealerCount++;
      } else {
        inWarehouseCount++;
      }
    }

    const statusCounts = {
      IN_WAREHOUSE: inWarehouseCount,
      WITH_DEALER: withDealerCount,
      INSTALLED: installedCount,
      FAULTY: faultyCount,
      RETURNED: 0,
      RMA: 0,
      TOTAL: devicesToProcess.length
    };

    // 5. Financial & Payment Collection Metrics
    let totalBilled = 0;
    let paymentReceivedAmount = 0;
    let paymentPendingAmount = 0;
    let paymentReceivedCount = 0;
    let paymentPendingCount = 0;

    for (const dev of devicesToProcess) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

      const vehKey = Object.keys(attrs).find(k => /vehicle.*num|vehicle/i.test(k));
      const hasVehicle = Boolean((vehKey && String(attrs[vehKey]).trim()) || dev.current_status === 'INSTALLED');

      const costVal = extractCostValue(attrs, dev.purchase_price);

      if (hasVehicle) {
        totalBilled += costVal;
        const isPaid = isPaymentReceived(attrs, dev.current_status);

        if (isPaid) {
          paymentReceivedCount++;
          paymentReceivedAmount += costVal;
        } else {
          paymentPendingCount++;
          paymentPendingAmount += costVal;
        }
      }
    }

    // Also factor in installations table billing if present (joined with devices matching filter)
    try {
      const instBilling = db.prepare(`
        SELECT 
          COUNT(*) as total_inst,
          COALESCE(SUM(i.sale_price), 0) as total_price,
          COALESCE(SUM(CASE WHEN i.payment_status = 'RECEIVED' THEN i.sale_price ELSE 0 END), 0) as paid_price,
          COALESCE(SUM(CASE WHEN i.payment_status != 'RECEIVED' THEN i.sale_price ELSE 0 END), 0) as pending_price,
          COUNT(CASE WHEN i.payment_status = 'RECEIVED' THEN 1 END) as paid_count,
          COUNT(CASE WHEN i.payment_status != 'RECEIVED' THEN 1 END) as pending_count
        FROM installations i
        JOIN devices d ON i.device_id = d.id
        ${whereClause}
      `).get(...queryParams);

      if (instBilling && instBilling.total_price > totalBilled) {
        totalBilled = instBilling.total_price;
        paymentReceivedAmount = instBilling.paid_price;
        paymentPendingAmount = instBilling.pending_price;
        paymentReceivedCount = instBilling.paid_count;
        paymentPendingCount = instBilling.pending_count;
      }
    } catch (e) {
      // Fallback to attribute-based billing
    }

    // 5. Vendor / Device Type Breakdown computed dynamically
    const allDeviceTypes = db.prepare(`
      SELECT dt.*, (SELECT COUNT(*) FROM devices d WHERE d.device_type_id = dt.id) as live_count
      FROM device_types dt
      ORDER BY dt.name ASC
    `).all();

    const typeMap = {};
    allDeviceTypes.forEach(dt => {
      typeMap[dt.id] = {
        id: dt.id,
        device_type: dt.name,
        category: dt.category,
        total_count: 0,
        installed_count: 0,
        with_dealer_count: 0,
        in_warehouse_count: 0
      };
    });

    for (const dev of devicesToProcess) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

      const vehKey = Object.keys(attrs).find(k => /vehicle.*num|vehicle|veh_no|reg_no/i.test(k));
      const hasVeh = Boolean((vehKey && String(attrs[vehKey]).trim()) || dev.current_status === 'INSTALLED');

      const placeKeyName = Object.keys(attrs).find(k => /stock.*place|place/i.test(k));
      const place = placeKeyName && attrs[placeKeyName] ? String(attrs[placeKeyName]).trim().toUpperCase() : '';

      const dtId = dev.device_type_id || (allDeviceTypes[0] ? allDeviceTypes[0].id : 1);
      if (!typeMap[dtId]) {
        typeMap[dtId] = {
          id: dtId,
          device_type: 'GPS Tracker',
          category: 'GPS',
          total_count: 0,
          installed_count: 0,
          with_dealer_count: 0,
          in_warehouse_count: 0
        };
      }

      typeMap[dtId].total_count++;
      if (hasVeh) {
        typeMap[dtId].installed_count++;
      } else if (place && !place.includes('OFFICE') && !place.includes('CENTRAL WAREHOUSE') && !place.includes('WAREHOUSE')) {
        typeMap[dtId].with_dealer_count++;
      } else {
        typeMap[dtId].in_warehouse_count++;
      }
    }

    const typeCounts = Object.values(typeMap)
      .filter(t => (device_type_id ? t.id.toString() === device_type_id.toString() : t.total_count > 0 || allDeviceTypes.some(d => d.id === t.id)))
      .map(t => ({
        ...t,
        installed_percent: t.total_count > 0 ? Math.round((t.installed_count / t.total_count) * 100) : 0
      }));

    // 6. Dealer / Branch Allocation Matrix
    const dealerMap = {};
    for (const dev of devicesToProcess) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

      const placeKeyName = Object.keys(attrs).find(k => /stock.*place|place/i.test(k));
      let place = (placeKeyName && attrs[placeKeyName] ? String(attrs[placeKeyName]).trim() : dev.current_holder_name || 'Unassigned Stock').trim();
      if (!place || /warehouse|central/i.test(place)) {
        place = 'Unassigned Stock';
      }

      const isInstalled = Boolean(attrs['VEHICLE NUMBER'] || attrs['Vehicle Number']) || dev.current_status === 'INSTALLED';

      if (!dealerMap[place]) {
        dealerMap[place] = {
          dealer: place,
          total: 0,
          installed: 0,
          in_stock: 0
        };
      }

      dealerMap[place].total++;
      if (isInstalled) {
        dealerMap[place].installed++;
      } else {
        dealerMap[place].in_stock++;
      }
    }

    const allUsers = db.prepare('SELECT id, name, monthly_target, device_targets FROM users').all();
    const dealerAllocations = Object.values(dealerMap).map(d => {
      const cleanName = d.dealer.replace(/\s*\(.*?\)/, '').trim().toLowerCase();
      let matchedTarget = 50;
      let matchedDevTargets = {};
      for (const u of allUsers) {
        if (d.dealer.toLowerCase().includes(u.name.toLowerCase()) || u.name.toLowerCase().includes(cleanName)) {
          matchedTarget = u.monthly_target || 50;
          try { matchedDevTargets = JSON.parse(u.device_targets || '{}'); } catch {}
          break;
        }
      }
      return {
        ...d,
        monthly_target: matchedTarget,
        device_targets: matchedDevTargets
      };
    }).sort((a, b) => b.total - a.total);

    let dealerTarget = 50;
    let dealerDeviceTargets = {};
    if (dealer_name) {
      const cleanName = dealer_name.replace(/\s*\(.*?\)/, '').trim().toLowerCase();
      const matched = allUsers.find(u => dealer_name.toLowerCase().includes(u.name.toLowerCase()) || u.name.toLowerCase().includes(cleanName));
      if (matched) {
        dealerTarget = matched.monthly_target || 50;
        try { dealerDeviceTargets = JSON.parse(matched.device_targets || '{}'); } catch {}
      }
    }

    // 7. Upcoming 30-Day SIM & Warranty & Certificate Expiries Alert Center
    const todayDate = new Date();

    const allDevicesForExpiry = db.prepare(`
      SELECT d.id, d.imei_number, d.sim_number, d.additional_attributes, dt.name as device_type_name
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      ${whereClause}
    `).all(...queryParams);

    const upcomingExpiries = [];

    for (const dev of allDevicesForExpiry) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

      const vehKey = Object.keys(attrs).find(k => /vehicle.*num|vehicle|veh_no|reg_no/i.test(k));
      const vehNo = vehKey ? attrs[vehKey] : null;
      if (!vehNo) continue; // Only installed vehicles have renewal certificates

      const custKey = Object.keys(attrs).find(k => /customer.*name|customer|client/i.test(k));
      const custName = custKey ? attrs[custKey] : 'Valued Customer';

      const phoneKey = Object.keys(attrs).find(k => /phone|contact|mobile/i.test(k));
      const custPhone = phoneKey ? String(attrs[phoneKey]).trim() : '';

      const certDateKey = Object.keys(attrs).find(k => /cert.*date|certificate.*issued|install.*date|installation/i.test(k));
      let certDateStr = certDateKey ? String(attrs[certDateKey]).trim() : '';

      let certDateObj = null;

      // Check if Excel serial integer (e.g. 45800)
      if (/^\d{5}$/.test(certDateStr)) {
        const num = Number(certDateStr);
        certDateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
      } else if (certDateStr && !isNaN(Date.parse(certDateStr))) {
        certDateObj = new Date(certDateStr);
      }

      if (certDateObj && !isNaN(certDateObj.getTime())) {
        // 1 Year Certificate Validity
        const expiryDateObj = new Date(certDateObj);
        expiryDateObj.setFullYear(expiryDateObj.getFullYear() + 1);

        const diffTime = expiryDateObj.getTime() - todayDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 45) {
          const expFormatted = expiryDateObj.toISOString().split('T')[0];
          const certFormatted = certDateObj.toISOString().split('T')[0];

          upcomingExpiries.push({
            id: dev.id,
            imei_number: dev.imei_number,
            sim_number: dev.sim_number || attrs['SIM NUMBER'] || '-',
            vehicle_number: vehNo,
            customer_name: custName,
            customer_contact: custPhone,
            certificate_date: certFormatted,
            warranty_end_date: expFormatted,
            days_remaining: diffDays,
            status: diffDays < 0 ? 'OVERDUE' : diffDays <= 15 ? 'URGENT' : 'EXPIRING_SOON',
            device_type_name: dev.device_type_name
          });
        }
      }
    }

    // Sort by soonest expiry
    upcomingExpiries.sort((a, b) => a.days_remaining - b.days_remaining);

    // 8. Live Operations Activity & Dealer Installation Feed
    let recentActivityRaw = [];
    if (dealer_name) {
      recentActivityRaw = db.prepare(`
        SELECT d.id as device_id, d.id, d.imei_number, dt.name as device_type_name, d.current_status, d.vendor_name, d.sim_number, d.additional_attributes, d.updated_at as event_date
        FROM devices d
        JOIN device_types dt ON d.device_type_id = dt.id
        WHERE (d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)
          AND (d.current_status = 'INSTALLED' OR d.additional_attributes LIKE '%VEHICLE%')
        ORDER BY d.updated_at DESC, d.id DESC
        LIMIT 60
      `).all(`%${dealer_name}%`, `%${dealer_name}%`);
    } else {
      recentActivityRaw = db.prepare(`
        SELECT dh.*, dt.name as device_type_name, d.current_status, d.vendor_name, d.sim_number, d.additional_attributes
        FROM device_history dh
        JOIN devices d ON dh.device_id = d.id
        JOIN device_types dt ON d.device_type_id = dt.id
        ${whereClause}
        ORDER BY dh.id DESC, dh.event_date DESC
        LIMIT 50
      `).all(...queryParams);
    }

    const recentActivity = recentActivityRaw.map(act => {
      let attrs = {};
      try { attrs = JSON.parse(act.additional_attributes || '{}'); } catch {}

      const vehKey = Object.keys(attrs).find(k => /vehicle.*num|vehicle|veh_no|reg_no/i.test(k));
      const vehNo = vehKey && attrs[vehKey] ? String(attrs[vehKey]).trim() : '-';

      let custName = attrs['CUSTOMER NAME'] || attrs['CERTIFICATE ISSUED TO'] || attrs['PARTY NAME'] || attrs['Customer Name'] || '';
      if (!custName && attrs['CUSTOMER'] && !/fuelview/i.test(String(attrs['CUSTOMER']))) {
        custName = String(attrs['CUSTOMER']).trim();
      }
      if (!custName || custName === '-') custName = attrs['CUSTOMER'] || 'Valued Customer';

      const phone = attrs['CUSTOMER PHONE NUMBER'] || attrs['CUSTOMER PHONE'] || attrs['CUSTOMER CONTACT'] || attrs['MOBILE'] || attrs['PHONE'] || attrs['customer_phone'] || '';

      const rto = attrs['RTO LOCATION'] || attrs['RTO Location'] || attrs['STOCK PLACE'] || attrs['LOCATION'] || '';
      const chasis = attrs['CHASIS NUMBER'] || attrs['CHASSIS NUMBER'] || attrs['chasis_number'] || '-';
      const engine = attrs['ENGINE NUMBER'] || attrs['engine_number'] || '-';
      const dateVal = attrs['CERTIFICATE ISSUED DATE'] || attrs['INSTALLATION DATE'] || attrs['DATE'] || act.event_date || '';

      const costVal = extractCostValue(attrs, act.purchase_price) || 5000;
      const isPaid = isPaymentReceived(attrs, act.current_status);
      const username = attrs['USERNAME'] || attrs['Username'] || attrs['USER ID'] || attrs['Software User ID'] || '';
      const password = attrs['PASSWORD'] || attrs['Password'] || '123456';
      const placeKey = Object.keys(attrs).find(k => /stock.*place|place/i.test(k));

      return {
        ...act,
        id: act.device_id || act.id,
        device_id: act.device_id || act.id,
        additional_attributes: attrs,
        vehicle_number: vehNo,
        customer_name: custName,
        customer_phone: phone && phone !== '-' ? String(phone).replace(/[^0-9]/g, '') : '',
        rto_location: rto,
        chasis_number: chasis,
        engine_number: engine,
        installation_date: dateVal,
        cost: costVal,
        tax: attrs['TAX'] || Math.round(costVal * 0.18),
        payment_status: isPaid ? 'PAID' : 'PENDING',
        username: username || 'User',
        password: password,
        stock_place: (placeKey && attrs[placeKey]) || act.to_holder || 'Central Warehouse'
      };
    });

    // 9. Aggregate Totals & Enterprise Telemetry Alerts
    const totalDevices = db.prepare(`SELECT COUNT(*) as c FROM devices d ${whereClause}`).get(...queryParams).c;
    const totalInstallations = db.prepare(`SELECT COUNT(*) as c FROM devices d ${whereClause ? `${whereClause} AND d.current_status = 'INSTALLED'` : "WHERE d.current_status = 'INSTALLED'"}`).get(...queryParams).c;
    const totalCustomers = db.prepare(`SELECT COUNT(*) as c FROM customers`).get().c;
    const totalDispatched = db.prepare(`SELECT COUNT(*) as c FROM devices d ${whereClause ? `${whereClause} AND d.current_status = 'WITH_DEALER'` : "WHERE d.current_status = 'WITH_DEALER'"}`).get(...queryParams).c;

    // Stale stock count (> 45 days idle)
    let staleStockCount = 0;
    const idleDevices = db.prepare("SELECT purchase_date, created_at, additional_attributes FROM devices WHERE current_status != 'INSTALLED'").all();
    const nowTs = new Date().getTime();
    idleDevices.forEach(dev => {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
      const pDate = dev.purchase_date || attrs['STOCK PLACE DATE'] || dev.created_at;
      const d = new Date(pDate);
      if (!isNaN(d.getTime())) {
        const days = (nowTs - d.getTime()) / (1000 * 86400);
        if (days > 45) staleStockCount++;
      }
    });

    // Active RMA Count
    const activeRmaRow = db.prepare("SELECT COUNT(*) as c FROM devices WHERE rma_status != 'NONE' AND rma_status != 'REPLACED'").get();
    const activeRmaCount = activeRmaRow ? activeRmaRow.c : 0;

    // SIM Expiring in 30 days
    let simExpiringCount = 0;
    const sims = db.prepare("SELECT sim_expiry_date, purchase_date, created_at FROM devices WHERE sim_number IS NOT NULL AND sim_number != ''").all();
    sims.forEach(s => {
      let exp = s.sim_expiry_date;
      if (!exp) {
        const b = new Date(s.purchase_date || s.created_at);
        if (!isNaN(b.getTime())) {
          b.setFullYear(b.getFullYear() + 1);
          exp = b.toISOString().split('T')[0];
        }
      }
      if (exp) {
        const days = (new Date(exp).getTime() - nowTs) / (1000 * 86400);
        if (days <= 30) simExpiringCount++;
      }
    });

    // AMC Due in next 30 days
    const amcDueCount = upcomingExpiries.filter(e => e.days_remaining <= 30).length;

    res.json({
      success: true,
      data: {
        statusCounts,
        monthly_target: dealerTarget,
        device_targets: dealerDeviceTargets,
        available_months: availableMonths,
        selected_month: activeMonthFilter || 'ALL',
        financials: {
          total_billed: totalBilled,
          payment_received_amount: paymentReceivedAmount,
          payment_pending_amount: paymentPendingAmount,
          payment_received_count: paymentReceivedCount,
          payment_pending_count: paymentPendingCount
        },
        typeCounts,
        dealerAllocations,
        upcomingExpiries,
        recentActivity,
        totals: {
          devices: totalDevices,
          installations: totalInstallations,
          customers: totalCustomers,
          dispatched_to_dealers: totalDispatched,
          stale_stock_count: staleStockCount,
          sim_expiring_count: simExpiringCount,
          active_rma_count: activeRmaCount,
          amc_due_count: amcDueCount
        },
        alerts: {
          stale_stock: staleStockCount,
          sim_expiring: simExpiringCount,
          active_rma: activeRmaCount,
          amc_due: amcDueCount
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/dashboard/dealer-summary - Full drill-down dossier for a specific dealer
router.get('/dealer-summary', (req, res) => {
  const { dealer_name } = req.query;
  if (!dealer_name) {
    return res.status(400).json({ success: false, error: 'dealer_name query param is required' });
  }

  try {
    const cleanName = dealer_name.trim();

    // 1. Get Dealer user profile if registered
    const user = db.prepare(`
      SELECT id, name, phone, email, role, region, created_at
      FROM users
      WHERE role = 'DEALER' AND (name LIKE ? OR region LIKE ?)
      LIMIT 1
    `).get(`%${cleanName}%`, `%${cleanName}%`);

    // 2. Get All devices assigned to or with this dealer
    const devicesRaw = db.prepare(`
      SELECT d.*, dt.name as device_type_name, dt.category as device_type_category
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE (d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)
      ORDER BY d.updated_at DESC
    `).all(`%${cleanName}%`, `%${cleanName}%`);

    let totalSent = 0;
    let installedCount = 0;
    let inStockCount = 0;
    let faultyCount = 0;
    let paymentReceivedAmount = 0;
    let paymentPendingAmount = 0;
    let paymentReceivedCount = 0;
    let paymentPendingCount = 0;

    const modelMap = {};

    const getAttrVal = (obj, ...names) => {
      for (const n of names) {
        if (obj[n] !== undefined && obj[n] !== null && String(obj[n]).trim() !== '') {
          return String(obj[n]).trim();
        }
      }
      const cleanNames = names.map(n => n.toLowerCase().replace(/[^a-z0-9]/g, ''));
      for (const [k, v] of Object.entries(obj)) {
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanNames.includes(cleanK) && v !== undefined && v !== null && String(v).trim() !== '') {
          return String(v).trim();
        }
      }
      return '-';
    };

    const formattedDevices = devicesRaw.map(dev => {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

      const vehNo = getAttrVal(attrs, 'VEHICLE NUMBER', 'Vehicle Number', 'VEHICLE NO', 'Vehicle No', 'REG NO', 'Reg No', 'vehicle_number', 'Vehicle', 'VEHICLE');
      const custName = getAttrVal(attrs, 'CUSTOMER NAME', 'Customer Name', 'CERTIFICATE ISSUED TO', 'Certificate Issued To', 'Customer', 'customer_name');
      const custPhone = getAttrVal(attrs, 'CUSTOMER PHONE NUMBER', 'Customer Phone Number', 'Primary Mobile', 'PRIMARY MOBILE', 'Phone', 'phone_number', 'Mobile', 'Contact');
      const instDate = getAttrVal(attrs, 'INSTALLATION DATE', 'Installation Date', 'CERTIFICATE ISSUED DATE', 'Certificate Issued Date', 'DATE', 'Date');
      
      const isInstalled = vehNo !== '-' || dev.current_status === 'INSTALLED';
      const isPaid = isPaymentReceived(attrs, dev.current_status);
      const salePrice = extractCostValue(attrs, dev.purchase_price);

      totalSent++;
      if (dev.current_status === 'FAULTY') {
        faultyCount++;
      } else if (isInstalled) {
        installedCount++;
        if (isPaid) {
          paymentReceivedAmount += salePrice;
          paymentReceivedCount++;
        } else {
          paymentPendingAmount += salePrice;
          paymentPendingCount++;
        }
      } else {
        inStockCount++;
      }

      // Group by model
      const mName = dev.device_type_name || 'Other';
      if (!modelMap[mName]) {
        modelMap[mName] = {
          model: mName,
          category: dev.device_type_category || 'GPS',
          total: 0,
          installed: 0,
          in_stock: 0
        };
      }
      modelMap[mName].total++;
      if (isInstalled) {
        modelMap[mName].installed++;
      } else {
        modelMap[mName].in_stock++;
      }

      return {
        id: dev.id,
        imei_number: dev.imei_number,
        device_type_name: dev.device_type_name,
        device_type_category: dev.device_type_category,
        current_status: isInstalled ? 'INSTALLED' : (dev.current_status === 'FAULTY' ? 'FAULTY' : 'WITH_DEALER'),
        current_holder_name: dev.current_holder_name,
        vehicle_number: vehNo,
        customer_name: custName,
        customer_phone: custPhone,
        cost: salePrice,
        payment_status: isPaid ? 'RECEIVED' : (isInstalled ? 'PENDING' : '-'),
        installation_date: instDate,
        additional_attributes: attrs
      };
    });

    // 3. Get Dispatches to this dealer
    const dispatches = db.prepare(`
      SELECT * FROM dispatches
      WHERE dealer_name LIKE ? OR location LIKE ?
      ORDER BY id DESC
    `).all(`%${cleanName}%`, `%${cleanName}%`);

    res.json({
      success: true,
      data: {
        dealer: {
          name: user ? user.name : cleanName,
          phone: user ? user.phone : (dispatches[0]?.dealer_contact || '-'),
          email: user ? user.email : '-',
          region: user ? user.region : (dispatches[0]?.location || cleanName)
        },
        kpis: {
          total_sent: totalSent,
          with_dealer: inStockCount,
          installed: installedCount,
          faulty: faultyCount,
          install_rate: totalSent > 0 ? Math.round((installedCount / totalSent) * 100) : 0,
          payment_received_amount: paymentReceivedAmount,
          payment_pending_amount: paymentPendingAmount,
          payment_received_count: paymentReceivedCount,
          payment_pending_count: paymentPendingCount
        },
        models: Object.values(modelMap).sort((a, b) => b.total - a.total),
        devices: formattedDevices,
        dispatches
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/dashboard/payments-telemetry - Daily & Custom Date Range Payments Analytics
router.get('/payments-telemetry', (req, res) => {
  try {
    const {
      range = 'today', // 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all' | 'custom'
      start_date,
      end_date,
      dealer_name,
      device_type_id,
      vendor_name
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
      activeStartDate = start_date ? normalizeDateToISO(start_date) || start_date : todayISO;
      activeEndDate = end_date ? normalizeDateToISO(end_date) || end_date : todayISO;
    }

    let whereClauses = [];
    let params = [];

    if (device_type_id) {
      whereClauses.push('d.device_type_id = ?');
      params.push(device_type_id);
    }
    if (vendor_name) {
      whereClauses.push('d.vendor_name = ?');
      params.push(vendor_name);
    }
    if (dealer_name) {
      whereClauses.push('(d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)');
      params.push(`%${dealer_name}%`, `%${dealer_name}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const devices = db.prepare(`
      SELECT 
        d.*,
        dt.name as device_type_name,
        dt.category as device_type_category,
        pb.notes as batch_notes
      FROM devices d
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      LEFT JOIN purchase_batches pb ON d.purchase_batch_id = pb.id
      ${whereSql}
      ORDER BY d.id DESC
    `).all(...params);

    let todayCollectedAmount = 0;
    let todayCollectedCount = 0;

    let periodCollectedAmount = 0;
    let periodCollectedCount = 0;
    let periodPendingAmount = 0;
    let periodPendingCount = 0;

    const dateTimelineMap = {};
    const dealerBreakdownMap = {};
    const transactions = [];

    for (const dev of devices) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

      const costVal = extractCostValue(attrs, dev.purchase_price);
      const isPaid = isPaymentReceived(attrs, dev.current_status);
      const paymentDateInfo = extractPaymentDate(attrs, dev);
      const devDateISO = paymentDateInfo.isoDate;

      const custName = attrs['CUSTOMER NAME'] || attrs['Customer Name'] || attrs['Customer'] || attrs['CERTIFICATE ISSUED TO'] || '—';
      const custPhone = attrs['CUSTOMER PHONE NUMBER'] || attrs['Customer Phone'] || attrs['Phone'] || '—';
      const vehNo = attrs['VEHICLE NUMBER'] || attrs['Vehicle Number'] || attrs['Vehicle No'] || attrs['Reg No'] || (dev.current_status === 'INSTALLED' ? 'Installed Unit' : '—');
      const stockPlace = attrs['STOCK PLACE'] || attrs['Stock Place'] || dev.current_holder_name || 'Central Warehouse';
      const receivedBy = attrs['AMOUNT RECEIVED BY'] || attrs['Received By'] || attrs['PAYMENT RECEIVED BY'] || attrs['SALES PERSON NAME'] || '—';

      // 1. All-time Today's metric
      if (devDateISO === todayISO && isPaid) {
        todayCollectedAmount += costVal;
        todayCollectedCount++;
      }

      // 2. Check if device falls into active selected date range
      const inRange = devDateISO >= activeStartDate && devDateISO <= activeEndDate;

      if (inRange) {
        if (isPaid) {
          periodCollectedAmount += costVal;
          periodCollectedCount++;
        } else {
          periodPendingAmount += costVal;
          periodPendingCount++;
        }

        // Timeline aggregation
        if (!dateTimelineMap[devDateISO]) {
          dateTimelineMap[devDateISO] = { date: devDateISO, collected: 0, paid_count: 0, pending: 0, pending_count: 0 };
        }
        if (isPaid) {
          dateTimelineMap[devDateISO].collected += costVal;
          dateTimelineMap[devDateISO].paid_count++;
        } else {
          dateTimelineMap[devDateISO].pending += costVal;
          dateTimelineMap[devDateISO].pending_count++;
        }

        // Dealer aggregation
        if (!dealerBreakdownMap[stockPlace]) {
          dealerBreakdownMap[stockPlace] = { name: stockPlace, collected: 0, paid_count: 0, pending: 0, pending_count: 0 };
        }
        if (isPaid) {
          dealerBreakdownMap[stockPlace].collected += costVal;
          dealerBreakdownMap[stockPlace].paid_count++;
        } else {
          dealerBreakdownMap[stockPlace].pending += costVal;
          dealerBreakdownMap[stockPlace].pending_count++;
        }

        // Add to itemized transactions list
        transactions.push({
          id: dev.id,
          imei_number: dev.imei_number,
          sim_number: dev.sim_number,
          device_type_name: dev.device_type_name || 'GPS Tracker',
          customer_name: custName,
          customer_phone: custPhone,
          vehicle_number: vehNo,
          stock_place: stockPlace,
          amount: costVal,
          amount_formatted: `₹${costVal.toLocaleString('en-IN')}`,
          payment_status: isPaid ? 'PAID' : 'PENDING',
          payment_date: paymentDateInfo.rawValue || devDateISO,
          payment_date_iso: devDateISO,
          payment_received_by: receivedBy
        });
      }
    }

    const totalBilledPeriod = periodCollectedAmount + periodPendingAmount;
    const collectionRate = totalBilledPeriod > 0 ? Math.round((periodCollectedAmount / totalBilledPeriod) * 100) : (periodCollectedCount > 0 ? 100 : 0);

    const timeline = Object.values(dateTimelineMap).sort((a, b) => b.date.localeCompare(a.date));
    const dealerBreakdown = Object.values(dealerBreakdownMap).sort((a, b) => b.collected - a.collected);

    res.json({
      success: true,
      data: {
        filter: {
          range,
          start_date: activeStartDate,
          end_date: activeEndDate,
          today: todayISO,
          yesterday: yesterdayISO
        },
        kpis: {
          today_collected_amount: todayCollectedAmount,
          today_collected_count: todayCollectedCount,
          period_collected_amount: periodCollectedAmount,
          period_collected_count: periodCollectedCount,
          period_pending_amount: periodPendingAmount,
          period_pending_count: periodPendingCount,
          total_period_billed: totalBilledPeriod,
          collection_rate: collectionRate
        },
        timeline,
        dealer_breakdown: dealerBreakdown,
        transactions
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

