const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/dashboard/stats - Executive Dashboard statistics & metrics
router.get('/stats', (req, res) => {
  const { purchase_batch_id, stock_place } = req.query;

  try {
    // 1. Scan devices to detect the dynamic placeKey first
    const allFilteredDevices = db.prepare(`
      SELECT additional_attributes
      FROM devices
      ${purchase_batch_id ? 'WHERE purchase_batch_id = ?' : ''}
    `).all(...(purchase_batch_id ? [purchase_batch_id] : []));

    let placeKey = null;
    for (const dev of allFilteredDevices) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
      const key = Object.keys(attrs).find(k => /place|location|office|site|branch/i.test(k));
      if (key) {
        placeKey = key;
        break;
      }
    }

    // 2. Build dynamic filtering SQL whereClause based on batch and stock_place
    let filterClauses = [];
    let queryParams = [];

    if (purchase_batch_id) {
      filterClauses.push('d.purchase_batch_id = ?');
      queryParams.push(purchase_batch_id);
    }

    if (stock_place && placeKey) {
      filterClauses.push(`json_extract(d.additional_attributes, '$.' || ?) = ?`);
      queryParams.push(placeKey, stock_place);
    }

    const whereClause = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : '';

    // 3. Overall status counts
    const statusCountsRaw = db.prepare(`
      SELECT d.current_status, COUNT(*) as count
      FROM devices d
      ${whereClause}
      GROUP BY d.current_status
    `).all(...queryParams);

    const statusCounts = {
      IN_WAREHOUSE: 0,
      WITH_DEALER: 0,
      INSTALLED: 0,
      FAULTY: 0,
      RETURNED: 0,
      RMA: 0,
      TOTAL: 0
    };

    let total = 0;
    statusCountsRaw.forEach(row => {
      statusCounts[row.current_status] = row.count;
      total += row.count;
    });
    statusCounts.TOTAL = total;

    // 4. Count by Device Type (Left Join with filter parameters matched)
    let joinFilter = '';
    let typeQueryParams = [];
    if (purchase_batch_id) {
      joinFilter += ' AND d.purchase_batch_id = ?';
      typeQueryParams.push(purchase_batch_id);
    }
    if (stock_place && placeKey) {
      joinFilter += ` AND json_extract(d.additional_attributes, '$.' || ?) = ?`;
      typeQueryParams.push(placeKey, stock_place);
    }

    const typeCounts = db.prepare(`
      SELECT dt.name as device_type, dt.category, COUNT(d.id) as count
      FROM device_types dt
      LEFT JOIN devices d ON dt.id = d.device_type_id ${joinFilter}
      GROUP BY dt.id
    `).all(...typeQueryParams);

    // 5. Stock by Holder (Dealers & Warehouse)
    const holderCounts = db.prepare(`
      SELECT 
        d.current_holder_name as holder,
        d.current_holder_type as holder_type,
        COUNT(d.id) as device_count
      FROM devices d
      ${whereClause}
      GROUP BY d.current_holder_name, d.current_holder_type
      ORDER BY device_count DESC
    `).all(...queryParams);

    // 6. Recently Updated & Edited Records Feed (excluding initial batch PURCHASED imports)
    const recentActivity = db.prepare(`
      SELECT dh.*, dt.name as device_type_name, d.current_status as current_status, d.vendor_name, d.sim_number
      FROM device_history dh
      JOIN devices d ON dh.device_id = d.id
      JOIN device_types dt ON d.device_type_id = dt.id
      ${whereClause ? whereClause + ' AND' : 'WHERE'} dh.event_type != 'PURCHASED'
      ORDER BY dh.id DESC, dh.event_date DESC
      LIMIT 25
    `).all(...queryParams);

    // 7. Total Counts matching filters
    const totalDevices = db.prepare(`
      SELECT COUNT(*) as c 
      FROM devices d
      ${whereClause}
    `).get(...queryParams).c;

    const totalDispatches = db.prepare(`
      SELECT COUNT(DISTINCT di.dispatch_id) as c 
      FROM dispatch_items di 
      JOIN devices d ON di.device_id = d.id 
      ${whereClause}
    `).get(...queryParams).c;

    const totalInstallations = db.prepare(`
      SELECT COUNT(*) as c 
      FROM installations i 
      JOIN devices d ON i.device_id = d.id 
      ${whereClause}
    `).get(...queryParams).c;

    const totalCustomers = db.prepare(`
      SELECT COUNT(DISTINCT i.customer_id) as c 
      FROM installations i 
      JOIN devices d ON i.device_id = d.id 
      ${whereClause}
    `).get(...queryParams).c;

    // 8. Place counts (Should not filter itself by stock_place so all options remain listable)
    const placeMap = {};
    if (placeKey) {
      for (const dev of allFilteredDevices) {
        let attrs = {};
        try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
        const val = String(attrs[placeKey] || 'Unspecified').trim();
        placeMap[val] = (placeMap[val] || 0) + 1;
      }
    }

    const placeCounts = Object.keys(placeMap).map(name => ({
      name,
      value: placeMap[name]
    })).sort((a, b) => b.value - a.value);

    res.json({
      success: true,
      data: {
        statusCounts,
        typeCounts,
        holderCounts,
        recentActivity,
        placeCounts,
        totals: {
          devices: totalDevices,
          dispatches: totalDispatches,
          installations: totalInstallations,
          customers: totalCustomers
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
