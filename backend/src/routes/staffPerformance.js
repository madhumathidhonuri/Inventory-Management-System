const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * Standardize date to YYYY-MM-DD
 */
function standardizeDate(rawDate) {
  if (!rawDate) return '';
  const str = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split('-');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }
  return str;
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
    const date = standardizeDate(item.installation_date);

    if (stdStart && date && date < stdStart) return;
    if (stdEnd && date && date > stdEnd) return;

    records.push({
      id: item.id,
      device_id: item.device_id,
      imei_number: item.imei_number,
      customer_id: item.customer_id,
      installation_date: date,
      installed_by: (item.installed_by || '').trim(),
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

    const attrs = JSON.parse(d.additional_attributes || '{}');
    const sp = (attrs['SALES PERSON NAME'] || attrs['Sales Person'] || attrs['SALES PERSON'] || attrs['Sales Person Name'] || '').trim();
    const sm = (attrs['SALES MANAGER'] || attrs['Sales Manager'] || '').trim();
    const tech = (attrs['FITTER'] || attrs['Fitter'] || attrs['TECHNICIAN'] || attrs['Technician'] || attrs['INSTALLED BY'] || attrs['Installed By'] || '').trim();

    if (sp || sm || tech) {
      const rawDate = attrs['CERTIFICATE ISSUED DATE'] || attrs['Certificate Issued Date'] || attrs['STOCK PLACE DATE'] || attrs['Stock Place Date'] || attrs['PAYMENT DATE'] || d.purchase_date;
      const date = standardizeDate(rawDate);

      if (stdStart && date && date < stdStart) return;
      if (stdEnd && date && date > stdEnd) return;

      const cost = parseFloat(attrs['TOTAL COST'] || attrs['Total Cost'] || attrs['COST'] || attrs['Cost'] || attrs['SALE PRICE'] || attrs['Sale Price'] || d.purchase_price || 0) || 0;

      records.push({
        id: `dev_${d.id}`,
        device_id: d.id,
        imei_number: d.imei_number,
        customer_id: null,
        installation_date: date,
        installed_by: tech || 'Technician',
        sales_manager: sm || 'Direct / Unassigned',
        sales_person: sp || 'Unassigned',
        customer_name: attrs['CUSTOMER NAME'] || attrs['Customer Name'] || attrs['CERTIFICATE ISSUED TO'] || 'Customer',
        customer_contact: attrs['CUSTOMER PHONE NUMBER'] || attrs['Customer Contact'] || '',
        vehicle_number: attrs['VEHICLE NUMBER'] || attrs['Vehicle Number'] || '—',
        vehicle_type: attrs['CATEGORY'] || attrs['DEVICE CATEGORY'] || 'Vehicle',
        sale_price: cost,
        installation_location: attrs['RTO LOCATION'] || attrs['STOCK PLACE'] || attrs['Location'] || 'Field',
        remarks: attrs['REMARKS'] || '',
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
    const { startDate, endDate, search } = req.query;
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
          locations_map: {}
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

    const results = Object.values(techMap).map(t => {
      const vehicle_types = Object.entries(t.vehicle_types_map).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
      const topLocEntry = Object.entries(t.locations_map).sort((a, b) => b[1] - a[1])[0];

      return {
        technician_name: t.technician_name,
        total_installations: t.total_installations,
        unique_customers: t.unique_customers.size,
        first_install_date: t.first_install_date || '',
        last_install_date: t.last_install_date || '',
        total_volume_amount: t.total_volume_amount,
        vehicle_types,
        primary_location: topLocEntry ? topLocEntry[0] : 'Field'
      };
    }).sort((a, b) => b.total_installations - a.total_installations);

    res.json({
      success: true,
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
    const { type, name, startDate, endDate, limit = 500 } = req.query;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Staff name is required for drilldown' });
    }

    let records = getUnifiedStaffRecords(startDate, endDate);
    const cleanName = String(name).trim().toLowerCase();

    if (type === 'technician') {
      records = records.filter(r => r.installed_by && r.installed_by.toLowerCase() === cleanName);
    } else if (type === 'sales_manager') {
      records = records.filter(r => r.sales_manager && r.sales_manager.toLowerCase() === cleanName);
    } else {
      records = records.filter(r => r.sales_person && r.sales_person.toLowerCase() === cleanName);
    }

    // Sort by date descending
    records.sort((a, b) => {
      const da = a.installation_date || '';
      const db = b.installation_date || '';
      return db.localeCompare(da);
    });

    res.json({
      success: true,
      staff_name: String(name).trim(),
      staff_type: type || 'sales_person',
      total_records: records.length,
      installations: records.slice(0, Number(limit))
    });
  } catch (error) {
    console.error('Error fetching staff drilldown:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
