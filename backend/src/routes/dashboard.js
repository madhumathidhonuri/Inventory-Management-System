const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/dashboard/stats - Executive Dashboard statistics & metrics
router.get('/stats', (req, res) => {
  const { purchase_batch_id, stock_place } = req.query;

  try {
    // 1. Scan devices to detect the dynamic placeKey
    const allFilteredDevices = db.prepare(`
      SELECT id, device_type_id, current_status, current_holder_name, current_holder_type, additional_attributes, updated_at
      FROM devices
      ${purchase_batch_id ? 'WHERE purchase_batch_id = ?' : ''}
    `).all(...(purchase_batch_id ? [purchase_batch_id] : []));

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

    // 2. Build dynamic filtering SQL whereClause
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

    // 3. Overall status counts accurately computed from dynamic attributes & device status
    let installedCount = 0;
    let withDealerCount = 0;
    let inWarehouseCount = 0;
    let faultyCount = 0;

    for (const dev of allFilteredDevices) {
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
      TOTAL: allFilteredDevices.length
    };

    // 4. Financial & Payment Collection Metrics
    let totalBilled = 0;
    let paymentReceivedAmount = 0;
    let paymentPendingAmount = 0;
    let paymentReceivedCount = 0;
    let paymentPendingCount = 0;

    for (const dev of allFilteredDevices) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}

      const vehKey = Object.keys(attrs).find(k => /vehicle.*num|vehicle/i.test(k));
      const hasVehicle = Boolean((vehKey && String(attrs[vehKey]).trim()) || dev.current_status === 'INSTALLED');

      const payKey = Object.keys(attrs).find(k => /amount.*rec|payment|received/i.test(k));
      const payVal = payKey ? String(attrs[payKey] || '').toUpperCase().trim() : '';

      const costVal = parseFloat(attrs['TOTAL COST'] || attrs['Total Cost'] || attrs['COST'] || attrs['Cost'] || attrs['Amount'] || 0) || 0;

      if (hasVehicle) {
        totalBilled += costVal;
        const isPaid = (payVal.includes('REC') || payVal.includes('PAID')) && !payVal.includes('NOT') && !payVal.includes('UNPAID');

        if (isPaid) {
          paymentReceivedCount++;
          paymentReceivedAmount += costVal;
        } else {
          // If amount status is empty, null, NOT RECEIVED, or PENDING -> count as Payment Pending
          paymentPendingCount++;
          paymentPendingAmount += costVal;
        }
      }
    }

    // Also factor in installations table billing if present
    const instBilling = db.prepare(`
      SELECT 
        COUNT(*) as total_inst,
        COALESCE(SUM(sale_price), 0) as total_price,
        COALESCE(SUM(CASE WHEN payment_status = 'RECEIVED' THEN sale_price ELSE 0 END), 0) as paid_price,
        COALESCE(SUM(CASE WHEN payment_status != 'RECEIVED' THEN sale_price ELSE 0 END), 0) as pending_price,
        COUNT(CASE WHEN payment_status = 'RECEIVED' THEN 1 END) as paid_count,
        COUNT(CASE WHEN payment_status != 'RECEIVED' THEN 1 END) as pending_count
      FROM installations
    `).get();

    if (instBilling && instBilling.total_price > totalBilled) {
      totalBilled = instBilling.total_price;
      paymentReceivedAmount = instBilling.paid_price;
      paymentPendingAmount = instBilling.pending_price;
      paymentReceivedCount = instBilling.paid_count;
      paymentPendingCount = instBilling.pending_count;
    }

    // 5. Vendor / Device Type Breakdown computed dynamically
    const allDeviceTypes = db.prepare(`SELECT * FROM device_types ORDER BY id ASC`).all();
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

    for (const dev of allFilteredDevices) {
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

    const typeCounts = Object.values(typeMap).map(t => ({
      ...t,
      installed_percent: t.total_count > 0 ? Math.round((t.installed_count / t.total_count) * 100) : 0
    }));

    // 6. Dealer / Branch Allocation Matrix
    const dealerMap = {};
    for (const dev of allFilteredDevices) {
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

    const dealerAllocations = Object.values(dealerMap).sort((a, b) => b.total - a.total);

    // 7. Upcoming 30-Day SIM & Warranty & Certificate Expiries Alert Center
    const todayDate = new Date();
    const expiryThresholdMs = 45 * 24 * 60 * 60 * 1000; // 45 days

    const allDevicesForExpiry = db.prepare(`
      SELECT d.id, d.imei_number, d.sim_number, d.additional_attributes, dt.name as device_type_name
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
    `).all();

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

    // 8. Live Operations Activity Feed with Full Record Details
    const recentActivityRaw = db.prepare(`
      SELECT dh.*, dt.name as device_type_name, d.current_status, d.vendor_name, d.sim_number, d.additional_attributes
      FROM device_history dh
      JOIN devices d ON dh.device_id = d.id
      JOIN device_types dt ON d.device_type_id = dt.id
      ORDER BY dh.id DESC, dh.event_date DESC
      LIMIT 50
    `).all();

    const recentActivity = recentActivityRaw.map(act => {
      let attrs = {};
      try { attrs = JSON.parse(act.additional_attributes || '{}'); } catch {}

      const vehKey = Object.keys(attrs).find(k => /vehicle.*num|vehicle/i.test(k));
      const custKey = Object.keys(attrs).find(k => /customer.*name|customer/i.test(k));
      const phoneKey = Object.keys(attrs).find(k => /phone|contact|mobile/i.test(k));
      const costKey = Object.keys(attrs).find(k => /^cost$/i.test(k) || /purchase_price/i.test(k));
      const taxKey = Object.keys(attrs).find(k => /tax/i.test(k));
      const payKey = Object.keys(attrs).find(k => /amount.*rec|payment/i.test(k));
      const placeKey = Object.keys(attrs).find(k => /stock.*place|place/i.test(k));

      return {
        ...act,
        additional_attributes: attrs,
        vehicle_number: (vehKey && attrs[vehKey]) || '-',
        customer_name: (custKey && attrs[custKey]) || '-',
        customer_phone: (phoneKey && attrs[phoneKey]) || '-',
        cost: (costKey && attrs[costKey]) || '-',
        tax: (taxKey && attrs[taxKey]) || '-',
        payment_status: (payKey && attrs[payKey]) || 'PENDING',
        stock_place: (placeKey && attrs[placeKey]) || act.to_holder || 'Central Warehouse'
      };
    });

    // 9. Aggregate Totals
    const totalDevices = db.prepare(`SELECT COUNT(*) as c FROM devices d ${whereClause}`).get(...queryParams).c;
    const totalInstallations = db.prepare(`SELECT COUNT(*) as c FROM devices WHERE current_status = 'INSTALLED'`).get().c;
    const totalCustomers = db.prepare(`SELECT COUNT(*) as c FROM customers`).get().c;
    const totalDispatched = db.prepare(`SELECT COUNT(*) as c FROM devices WHERE current_status = 'WITH_DEALER'`).get().c;

    res.json({
      success: true,
      data: {
        statusCounts,
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
          dispatched_to_dealers: totalDispatched
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
