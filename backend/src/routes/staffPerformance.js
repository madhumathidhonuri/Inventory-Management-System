const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * Standardize date to YYYY-MM-DD
 * Supports ISO strings, YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, Excel serial integers
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

// Helper: Check if device belongs to TG MINING category
function isTgMiningDevice(dev = {}, attrs = {}) {
  const cat = String(attrs['CATEGORY'] || attrs['DEVICE CATEGORY'] || attrs['PROJECT CATEGORY'] || attrs['PROJECT'] || attrs['Category'] || '').toUpperCase().trim();
  const typeName = String(dev.device_name || dev.device_type_name || '').toUpperCase().trim();
  return cat.includes('TG MINING') || cat.includes('TG_MINING') || (cat.includes('MINING') && !cat.includes('AP MINING')) || typeName.includes('TG MINING') || typeName.includes('TG_MINING');
}

// Helper: Extract effective installation/action date from device and attributes
function extractEffectiveDate(dev = {}, attrs = {}) {
  const isMining = isTgMiningDevice(dev, attrs);
  
  const priorityMiningKeys = [
    'TG MINING DATE', 'TG_MINING_DATE', 'Tg Mining Date', 'tg_mining_date',
    'MINING DATE', 'Mining Date', 'mining_date',
    'ACTIVATION DATE', 'Activation Date', 'activation_date',
    'SIM ACTIVATION DATE', 'SIM ACTIVATED DATE', 'Sim Activated Date', 'sim_activated_date'
  ];

  const standardKeys = [
    'CERTIFICATE ISSUED DATE', 'Certificate Issued Date', 'certificate_issued_date', 'CERTIFICATE ISSUED',
    'INSTALLATION DATE', 'Installation Date', 'installation_date',
    'PAYMENT RECEIVED DATE', 'Payment Received Date',
    'PAYMENT DATE', 'Payment Date',
    'ISSUE DATE', 'Issue Date',
    'STOCK PLACE DATE', 'Stock Place Date',
    'DATE', 'Date', 'date'
  ];

  const allKeys = isMining ? [...priorityMiningKeys, ...standardKeys] : [...standardKeys, ...priorityMiningKeys];

  for (const k of allKeys) {
    if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
      const val = attrs[k];
      const parsed = standardizeDate(val);
      if (parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
        return parsed;
      }
    }
  }

  // Check any remaining attribute key containing 'date'
  for (const [k, val] of Object.entries(attrs)) {
    if (/date/i.test(k) && val !== undefined && val !== null && String(val).trim() !== '') {
      const parsed = standardizeDate(val);
      if (parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
        return parsed;
      }
    }
  }

  if (dev.current_status === 'INSTALLED' && dev.updated_at) {
    const parsed = standardizeDate(dev.updated_at);
    if (parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
  }

  if (dev.purchase_date) {
    const parsed = standardizeDate(dev.purchase_date);
    if (parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
  }

  return '';
}

/**
 * Fetch unified staff activity records from both installations table and devices with attributes
 */
function getUnifiedStaffRecords(startDate, endDate) {
  const stdStart = startDate ? standardizeDate(startDate) : null;
  const stdEnd = endDate ? standardizeDate(endDate) : null;

  // 1. Fetch from installations table
  const insts = db.prepare(`
    SELECT 
      i.id,
      i.device_id,
      i.imei_number,
      i.customer_id,
      i.installation_date,
      i.installed_by,
      i.sales_manager,
      i.sales_person,
      i.customer_name,
      i.customer_contact,
      i.vehicle_number,
      i.vehicle_type,
      i.sale_price,
      i.installation_location,
      i.remarks,
      i.created_at,
      dt.name as device_type_name
    FROM installations i
    LEFT JOIN devices d ON i.device_id = d.id
    LEFT JOIN device_types dt ON d.device_type_id = dt.id
  `).all();

  const instImeis = new Set();
  const records = [];

  insts.forEach(item => {
    instImeis.add(item.imei_number);
    const date = standardizeDate(item.installation_date || item.created_at);

    if (stdStart && date && date < stdStart) return;
    if (stdEnd && date && date > stdEnd) return;

    const rawInstaller = (item.installed_by || '').trim();
    const tech = (rawInstaller && rawInstaller.toLowerCase() !== 'technician' && rawInstaller !== '-' && rawInstaller !== '—' && rawInstaller !== 'NULL') ? rawInstaller : (rawInstaller || 'Technician');

    records.push({
      id: item.id,
      device_id: item.device_id,
      imei_number: item.imei_number,
      customer_id: item.customer_id,
      installation_date: date,
      installed_by: tech,
      sales_manager: (item.sales_manager || '').trim() || 'Direct / Unassigned',
      sales_person: (item.sales_person || '').trim() || 'Unassigned',
      customer_name: item.customer_name || 'Customer',
      customer_contact: item.customer_contact || '',
      vehicle_number: item.vehicle_number || '—',
      vehicle_type: item.vehicle_type || 'Vehicle',
      sale_price: parseFloat(item.sale_price) || 0,
      installation_location: item.installation_location || 'Field',
      remarks: item.remarks || '',
      created_at: item.created_at,
      device_type_name: item.device_type_name || 'GPS Tracker'
    });
  });

  // 2. Fetch from devices table for records not in installations table
  const devs = db.prepare(`
    SELECT d.*, dt.name as device_type_name 
    FROM devices d 
    LEFT JOIN device_types dt ON d.device_type_id = dt.id
  `).all();

  devs.forEach(d => {
    if (instImeis.has(d.imei_number)) return;

    let attrs = {};
    try { attrs = JSON.parse(d.additional_attributes || '{}'); } catch {}

    const sp = (
      attrs['SALES PERSON NAME'] || attrs['Sales Person Name'] ||
      attrs['SALES PERSON'] || attrs['Sales Person'] ||
      attrs['sales_person'] || attrs['sales_person_name'] ||
      attrs['SALES REP'] || attrs['Sales Rep'] || ''
    ).trim();

    const sm = (
      attrs['SALES MANAGER'] || attrs['Sales Manager'] ||
      attrs['sales_manager'] || attrs['SALES HEAD'] || attrs['Sales Head'] || ''
    ).trim();

    const rawTech = (
      attrs['TECHNICIAN'] || attrs['Technician'] ||
      attrs['INSTALLED BY'] || attrs['Installed By'] ||
      attrs['FITTER'] || attrs['Fitter'] ||
      attrs['INSTALLER'] || attrs['Installer'] ||
      attrs['TECHNICIAN NAME'] || attrs['Technician Name'] ||
      attrs['FITTER NAME'] || attrs['Fitter Name'] ||
      attrs['installed_by'] || attrs['technician'] || ''
    ).trim();

    const vehNo = String(
      attrs['VEHICLE NUMBER'] || attrs['Vehicle Number'] ||
      attrs['VEHICLE NO'] || attrs['Vehicle No'] ||
      attrs['vehicle_number'] || attrs['vehicle_no'] ||
      attrs['MACHINERY NUMBER'] || attrs['EQUIPMENT NUMBER'] || ''
    ).trim();

    const hasVehicle = Boolean(vehNo && vehNo !== '-' && vehNo !== '—' && vehNo !== 'NULL');
    const isMining = isTgMiningDevice(d, attrs);
    const hasCert = Boolean(attrs['CERTIFICATE ISSUED DATE'] || attrs['Certificate Issued Date']);
    const isInstalled = d.current_status === 'INSTALLED' || hasVehicle || isMining || hasCert;

    let tech = '';
    if (rawTech && rawTech.toLowerCase() !== 'technician' && rawTech !== '-' && rawTech !== '—' && rawTech !== 'NULL') {
      tech = rawTech;
    }

    if (sp || sm || tech || isInstalled) {
      const date = extractEffectiveDate(d, attrs);

      if (stdStart && date && date < stdStart) return;
      if (stdEnd && date && date > stdEnd) return;

      const cost = parseFloat(
        attrs['TOTAL COST'] || attrs['Total Cost'] ||
        attrs['COST'] || attrs['Cost'] ||
        attrs['SALE PRICE'] || attrs['Sale Price'] ||
        d.purchase_price || 0
      ) || 0;

      const locName = attrs['RTO LOCATION'] || attrs['RTO Location'] || attrs['rto_location'] ||
        attrs['STOCK PLACE'] || attrs['Stock Place'] || attrs['LOCATION'] || attrs['Location'] ||
        d.current_holder_name || 'Field';

      let finalTech = tech;
      if (!finalTech && isInstalled) {
        finalTech = 'Technician';
      }

      records.push({
        id: `dev_${d.id}`,
        device_id: d.id,
        imei_number: d.imei_number,
        customer_id: null,
        installation_date: date,
        installed_by: finalTech || 'Technician',
        sales_manager: sm || 'Direct / Unassigned',
        sales_person: sp || 'Unassigned',
        customer_name: attrs['CUSTOMER NAME'] || attrs['Customer Name'] || attrs['CERTIFICATE ISSUED TO'] || attrs['MINING SITE'] || attrs['SITE NAME'] || 'Customer',
        customer_contact: attrs['CUSTOMER PHONE NUMBER'] || attrs['Customer Phone Number'] || attrs['CUSTOMER PHONE'] || attrs['Customer Phone'] || attrs['CUSTOMER CONTACT'] || attrs['Customer Contact'] || attrs['MOBILE'] || attrs['PHONE'] || '',
        vehicle_number: (vehNo && vehNo !== '-' && vehNo !== '—') ? vehNo : '—',
        vehicle_type: attrs['CATEGORY'] || attrs['DEVICE CATEGORY'] || attrs['Category'] || 'Vehicle',
        sale_price: cost,
        installation_location: locName,
        remarks: attrs['REMARKS'] || attrs['Remarks'] || '',
        created_at: d.created_at,
        device_type_name: d.device_type_name || 'GPS Tracker'
      });
    }
  });

  return records;
}

// GET /api/staff-performance/summary
router.get('/summary', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const records = getUnifiedStaffRecords(startDate, endDate);

    let totalInstallations = records.length;
    let totalRevenue = 0;
    const techCountMap = {};
    const salesCountMap = {};
    const salesRevenueMap = {};
    const managerSet = new Set();
    const vehicleTypeMap = {};

    records.forEach(r => {
      totalRevenue += r.sale_price;

      if (r.installed_by && r.installed_by !== 'Technician') {
        techCountMap[r.installed_by] = (techCountMap[r.installed_by] || 0) + 1;
      }
      if (r.sales_person && r.sales_person !== 'Unassigned') {
        salesCountMap[r.sales_person] = (salesCountMap[r.sales_person] || 0) + 1;
        salesRevenueMap[r.sales_person] = (salesRevenueMap[r.sales_person] || 0) + r.sale_price;
      }
      if (r.sales_manager && r.sales_manager !== 'Direct / Unassigned') {
        managerSet.add(r.sales_manager);
      }
      const vtype = r.vehicle_type || 'Other';
      vehicleTypeMap[vtype] = (vehicleTypeMap[vtype] || 0) + 1;
    });

    // Top Tech
    let topTech = null;
    let maxTechCount = 0;
    for (const [name, count] of Object.entries(techCountMap)) {
      if (count > maxTechCount) {
        maxTechCount = count;
        topTech = { name, count };
      }
    }

    // Top Sales
    let topSales = null;
    let maxSalesCount = 0;
    for (const [name, count] of Object.entries(salesCountMap)) {
      if (count > maxSalesCount) {
        maxSalesCount = count;
        topSales = { name, count, revenue: salesRevenueMap[name] || 0 };
      }
    }

    const vehicleTypes = Object.entries(vehicleTypeMap).map(([vehicle_type, count]) => ({ vehicle_type, count })).sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      summary: {
        total_installations: totalInstallations,
        total_technicians: Object.keys(techCountMap).length,
        total_sales_persons: Object.keys(salesCountMap).length,
        total_sales_managers: managerSet.size,
        total_revenue: totalRevenue,
        top_technician: topTech,
        top_sales_person: topSales,
        vehicle_types: vehicleTypes
      }
    });
  } catch (error) {
    console.error('Error fetching staff summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/staff-performance/technicians
router.get('/technicians', (req, res) => {
  try {
    const { startDate, endDate, search, payoutRate = 300 } = req.query;
    const defaultRate = Math.max(0, parseFloat(payoutRate) || 300);

    let records = getUnifiedStaffRecords(startDate, endDate);

    // Only include records that have technician info
    records = records.filter(r => r.installed_by && r.installed_by !== 'Technician');

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      records = records.filter(r => 
        r.installed_by.toLowerCase().includes(q) ||
        r.installation_location.toLowerCase().includes(q)
      );
    }

    // Fetch all technician expenses for reconciliation
    let techExpenses = [];
    try {
      techExpenses = db.prepare(`
        SELECT * FROM expenses 
        WHERE category IN ('TECHNICIAN_TRAVEL', 'TECHNICIAN_PAYOUT')
      `).all();
    } catch (e) {
      techExpenses = [];
    }

    // Fetch all active devices to compute floating stock in technician possession
    let floatingDevices = [];
    try {
      floatingDevices = db.prepare(`
        SELECT id, imei_number, current_status, current_holder_name, additional_attributes, updated_at
        FROM devices
        WHERE current_status IN ('WITH_DEALER', 'IN_WAREHOUSE')
      `).all();
    } catch (e) {
      floatingDevices = [];
    }

    const techMap = {};
    records.forEach(r => {
      const name = r.installed_by;
      if (!techMap[name]) {
        techMap[name] = {
          technician_name: name,
          total_installations: 0,
          unique_customers: new Set(),
          first_install_date: r.installation_date,
          last_install_date: r.installation_date,
          total_volume_amount: 0,
          vehicle_types_map: {},
          locations_map: {},
          travel_expenses: 0,
          payouts_settled: 0,
          floating_stock_count: 0
        };
      }
      const t = techMap[name];
      t.total_installations += 1;
      if (r.customer_name) t.unique_customers.add(r.customer_name);
      t.total_volume_amount += r.sale_price;

      if (r.installation_date) {
        if (!t.first_install_date || r.installation_date < t.first_install_date) t.first_install_date = r.installation_date;
        if (!t.last_install_date || r.installation_date > t.last_install_date) t.last_install_date = r.installation_date;
      }

      const vtype = r.vehicle_type || 'Standard';
      t.vehicle_types_map[vtype] = (t.vehicle_types_map[vtype] || 0) + 1;

      const loc = r.installation_location || 'Field';
      t.locations_map[loc] = (t.locations_map[loc] || 0) + 1;
    });

    // Attribute expenses and floating stock to technicians
    Object.keys(techMap).forEach(techName => {
      const clean = techName.toLowerCase().trim();
      const t = techMap[techName];

      // Expenses attribution
      techExpenses.forEach(exp => {
        const inc = (exp.incurred_by || '').toLowerCase().trim();
        const paid = (exp.paid_to || '').toLowerCase().trim();
        if (inc === clean || paid === clean || inc.includes(clean) || paid.includes(clean)) {
          if (exp.category === 'TECHNICIAN_TRAVEL') {
            t.travel_expenses += (parseFloat(exp.amount) || 0);
          } else if (exp.category === 'TECHNICIAN_PAYOUT') {
            t.payouts_settled += (parseFloat(exp.amount) || 0);
          }
        }
      });

      // Floating stock attribution
      floatingDevices.forEach(dev => {
        const holder = (dev.current_holder_name || '').toLowerCase().trim();
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
        const fitter = (attrs['FITTER'] || attrs['Fitter'] || attrs['TECHNICIAN'] || attrs['Technician'] || '').toLowerCase().trim();

        if (holder === clean || fitter === clean || holder.includes(clean) || fitter.includes(clean)) {
          t.floating_stock_count += 1;
        }
      });
    });

    const results = Object.values(techMap).map(t => {
      const vehicle_types = Object.entries(t.vehicle_types_map).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
      const topLocEntry = Object.entries(t.locations_map).sort((a, b) => b[1] - a[1])[0];
      const fitment_payout = t.total_installations * defaultRate;
      const net_payout_due = (fitment_payout + t.travel_expenses) - t.payouts_settled;

      return {
        technician_name: t.technician_name,
        total_installations: t.total_installations,
        unique_customers: t.unique_customers.size,
        first_install_date: t.first_install_date || '',
        last_install_date: t.last_install_date || '',
        total_volume_amount: t.total_volume_amount,
        vehicle_types,
        primary_location: topLocEntry ? topLocEntry[0] : 'Field',
        fitment_rate: defaultRate,
        fitment_payout,
        travel_expenses: t.travel_expenses,
        payouts_settled: t.payouts_settled,
        net_payout_due,
        floating_stock_count: t.floating_stock_count
      };
    }).sort((a, b) => b.total_installations - a.total_installations);

    res.json({
      success: true,
      default_fitment_rate: defaultRate,
      technicians: results
    });
  } catch (error) {
    console.error('Error fetching technician performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/staff-performance/sales
router.get('/sales', (req, res) => {
  try {
    const { startDate, endDate, search } = req.query;
    let records = getUnifiedStaffRecords(startDate, endDate);

    // Only include records that have sales person info
    records = records.filter(r => r.sales_person && r.sales_person !== 'Unassigned');

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      records = records.filter(r => 
        r.sales_person.toLowerCase().includes(q) ||
        r.sales_manager.toLowerCase().includes(q)
      );
    }

    const salesMap = {};
    const managerSummary = {};

    records.forEach(r => {
      const key = `${r.sales_person}___${r.sales_manager}`;
      if (!salesMap[key]) {
        salesMap[key] = {
          sales_person: r.sales_person,
          sales_manager: r.sales_manager,
          total_sales: 0,
          total_revenue: 0,
          unique_customers: new Set(),
          first_sale_date: r.installation_date,
          last_sale_date: r.installation_date
        };
      }
      const s = salesMap[key];
      s.total_sales += 1;
      s.total_revenue += r.sale_price;
      if (r.customer_name) s.unique_customers.add(r.customer_name);

      if (r.installation_date) {
        if (!s.first_sale_date || r.installation_date < s.first_sale_date) s.first_sale_date = r.installation_date;
        if (!s.last_sale_date || r.installation_date > s.last_sale_date) s.last_sale_date = r.installation_date;
      }

      // Manager summary
      const mgr = r.sales_manager || 'Direct / Unassigned';
      if (!managerSummary[mgr]) {
        managerSummary[mgr] = {
          manager_name: mgr,
          total_team_sales: 0,
          total_team_revenue: 0,
          team_members_set: new Set()
        };
      }
      managerSummary[mgr].total_team_sales += 1;
      managerSummary[mgr].total_team_revenue += r.sale_price;
      managerSummary[mgr].team_members_set.add(r.sales_person);
    });

    const salesReps = Object.values(salesMap).map(s => ({
      sales_person: s.sales_person,
      sales_manager: s.sales_manager,
      total_sales: s.total_sales,
      total_revenue: s.total_revenue,
      unique_customers: s.unique_customers.size,
      first_sale_date: s.first_sale_date || '',
      last_sale_date: s.last_sale_date || ''
    })).sort((a, b) => b.total_sales - a.total_sales);

    const managers = Object.values(managerSummary).map(m => ({
      manager_name: m.manager_name,
      total_team_sales: m.total_team_sales,
      total_team_revenue: m.total_team_revenue,
      team_members_count: m.team_members_set.size,
      members: Array.from(m.team_members_set)
    })).sort((a, b) => b.total_team_sales - a.total_team_sales);

    res.json({
      success: true,
      sales_reps: salesReps,
      managers
    });
  } catch (error) {
    console.error('Error fetching sales performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/staff-performance/drilldown
router.get('/drilldown', (req, res) => {
  try {
    const { type, name, startDate, endDate, limit = 500, payoutRate = 300 } = req.query;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Staff name is required for drilldown' });
    }

    let records = getUnifiedStaffRecords(startDate, endDate);
    const cleanName = String(name).trim().toLowerCase();

    if (type === 'technician') {
      records = records.filter(r => r.installed_by && (r.installed_by.toLowerCase().trim() === cleanName || r.installed_by.toLowerCase().includes(cleanName)));
    } else if (type === 'sales_manager') {
      records = records.filter(r => r.sales_manager && (r.sales_manager.toLowerCase().trim() === cleanName || r.sales_manager.toLowerCase().includes(cleanName)));
    } else {
      records = records.filter(r => r.sales_person && (r.sales_person.toLowerCase().trim() === cleanName || r.sales_person.toLowerCase().includes(cleanName)));
    }

    // Sort by date descending
    records.sort((a, b) => {
      const da = a.installation_date || '';
      const db = b.installation_date || '';
      return db.localeCompare(da);
    });

    let expenses = [];
    let floatingStock = [];
    let payoutSummary = null;

    if (type === 'technician') {
      const rate = Math.max(0, parseFloat(payoutRate) || 300);
      try {
        const allExp = db.prepare(`SELECT * FROM expenses WHERE category IN ('TECHNICIAN_TRAVEL', 'TECHNICIAN_PAYOUT') ORDER BY expense_date DESC`).all();
        expenses = allExp.filter(e => {
          const inc = (e.incurred_by || '').toLowerCase().trim();
          const paid = (e.paid_to || '').toLowerCase().trim();
          return inc === cleanName || paid === cleanName || inc.includes(cleanName) || paid.includes(cleanName);
        });
      } catch (e) {}

      try {
        const devs = db.prepare(`SELECT id, imei_number, sim_number, current_status, current_holder_name, additional_attributes, updated_at FROM devices WHERE current_status IN ('WITH_DEALER', 'IN_WAREHOUSE')`).all();
        floatingStock = devs.filter(d => {
          const holder = (d.current_holder_name || '').toLowerCase().trim();
          let attrs = {};
          try { attrs = JSON.parse(d.additional_attributes || '{}'); } catch {}
          const fitter = (attrs['FITTER'] || attrs['Fitter'] || attrs['TECHNICIAN'] || attrs['Technician'] || '').toLowerCase().trim();
          return holder === cleanName || fitter === cleanName || holder.includes(cleanName) || fitter.includes(cleanName);
        });
      } catch (e) {}

      const totalInstalls = records.length;
      const fitmentPayout = totalInstalls * rate;
      const travelExp = expenses.filter(e => e.category === 'TECHNICIAN_TRAVEL').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const settled = expenses.filter(e => e.category === 'TECHNICIAN_PAYOUT').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const netDue = (fitmentPayout + travelExp) - settled;

      payoutSummary = {
        total_installations: totalInstalls,
        fitment_rate: rate,
        fitment_payout: fitmentPayout,
        travel_expenses: travelExp,
        payouts_settled: settled,
        net_payout_due: netDue,
        floating_stock_count: floatingStock.length
      };
    }

    res.json({
      success: true,
      staff_name: String(name).trim(),
      staff_type: type || 'sales_person',
      total_records: records.length,
      installations: records.slice(0, Number(limit)),
      expenses,
      floating_stock: floatingStock,
      payout_summary: payoutSummary
    });
  } catch (error) {
    console.error('Error fetching staff drilldown:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
