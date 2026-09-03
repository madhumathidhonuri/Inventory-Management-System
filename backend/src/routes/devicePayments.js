const express = require('express');
const router = express.Router();
const db = require('../db/database');
const ExcelJS = require('exceljs');

// Helper function to extract payment and amount details from a device record
function parseDevicePaymentInfo(d) {
  let attrs = {};
  try {
    attrs = JSON.parse(d.additional_attributes || '{}');
  } catch {}

  // 1. Extract Device Amount / Cost / Price
  let amount = 0;
  for (const k of Object.keys(attrs)) {
    if (/^cost$|^total.*cost$|^price$|^device.*cost$|^sale.*price$|^amount$/i.test(k.trim())) {
      const val = parseFloat(String(attrs[k]).replace(/[^0-9.]/g, ''));
      if (!isNaN(val) && val > 0) {
        amount = val;
        break;
      }
    }
  }
  if (amount === 0 && d.purchase_price && !isNaN(Number(d.purchase_price))) {
    amount = Number(d.purchase_price);
  }

  // 2. Extract Payment Status
  let paymentStatus = 'PENDING';
  for (const k of Object.keys(attrs)) {
    if (/^amount.*received$|^payment.*status$|^payment$/i.test(k.trim())) {
      const val = String(attrs[k] || '').trim().toUpperCase();
      if (val === 'RECEIVED' || val === 'PAID' || val === 'YES' || val === 'DONE') {
        paymentStatus = 'RECEIVED';
        break;
      }
    }
  }

  // 3. Extract Payment Mode
  let paymentMode = '';
  for (const k of Object.keys(attrs)) {
    if (/^amount.*received.*by$|^payment.*mode$|^received.*by$|^payment.*type$/i.test(k.trim())) {
      if (attrs[k]) {
        paymentMode = String(attrs[k]).trim();
        break;
      }
    }
  }
  if (!paymentMode && paymentStatus === 'RECEIVED') {
    paymentMode = 'UPI';
  }

  // 4. Extract UTR / Reference Number
  let utrNumber = '';
  for (const k of Object.keys(attrs)) {
    if (/^utr.*number$|^utr$|^ref.*number$|^transaction.*id$|^upi.*ref$/i.test(k.trim())) {
      if (attrs[k]) {
        utrNumber = String(attrs[k]).trim();
        break;
      }
    }
  }

  // 5. Extract Vehicle Number
  let vehicleNumber = '';
  for (const k of Object.keys(attrs)) {
    if (/^vehicle.*number$|^veh.*no$|^reg.*no$|^vehicle$/i.test(k.trim())) {
      if (attrs[k]) {
        vehicleNumber = String(attrs[k]).trim().toUpperCase();
        break;
      }
    }
  }

  // 6. Extract Customer Name
  let customerName = '';
  for (const k of Object.keys(attrs)) {
    if (/^customer.*name$|^client.*name$|^owner.*name$/i.test(k.trim())) {
      if (attrs[k]) {
        customerName = String(attrs[k]).trim();
        break;
      }
    }
  }
  if (!customerName) {
    customerName = d.current_holder_name || 'Central Warehouse';
  }

  // 7. Extract Customer Phone
  let customerPhone = '';
  for (const k of Object.keys(attrs)) {
    if (/^customer.*phone.*number$|^phone.*number$|^contact.*number$|^phone$|^mobile$/i.test(k.trim())) {
      if (attrs[k]) {
        customerPhone = String(attrs[k]).trim();
        break;
      }
    }
  }

  // 8. Extract Stock Place / Dealer
  let stockPlace = '';
  for (const k of Object.keys(attrs)) {
    if (/^stock.*place$|^dealer$|^branch$|^location$/i.test(k.trim())) {
      if (attrs[k]) {
        stockPlace = String(attrs[k]).trim();
        break;
      }
    }
  }
  if (!stockPlace) {
    stockPlace = d.current_holder_name || 'Central Warehouse';
  }

  // 9. Extract Payment / Installation Date
  let paymentDate = '';
  for (const k of Object.keys(attrs)) {
    if (/^payment.*date$|^received.*date$|^installation.*date$|^date$/i.test(k.trim())) {
      if (attrs[k]) {
        paymentDate = String(attrs[k]).trim();
        break;
      }
    }
  }
  if (!paymentDate) {
    paymentDate = d.purchase_date || new Date().toISOString().split('T')[0];
  }

  // 10. Extract Remarks
  let paymentRemarks = '';
  for (const k of Object.keys(attrs)) {
    if (/^payment.*remarks$|^remarks$|^notes$/i.test(k.trim())) {
      if (attrs[k]) {
        paymentRemarks = String(attrs[k]).trim();
        break;
      }
    }
  }

  return {
    id: d.id,
    imei_number: d.imei_number,
    sim_number: d.sim_number || '',
    device_type_id: d.device_type_id,
    device_type_name: d.device_type_name || 'GPS Unit',
    device_type_category: d.device_type_category || 'GPS Tracker',
    current_status: d.current_status,
    current_holder_name: d.current_holder_name,
    stock_place: stockPlace,
    vehicle_number: vehicleNumber,
    customer_name: customerName,
    customer_phone: customerPhone,
    device_amount: amount,
    payment_status: paymentStatus, // 'RECEIVED' or 'PENDING'
    payment_mode: paymentMode,
    utr_number: utrNumber,
    payment_date: paymentDate,
    payment_remarks: paymentRemarks,
    updated_at: d.updated_at
  };
}

// GET /api/device-payments - List devices from stock inventory with their amounts & payment status
router.get('/', (req, res) => {
  try {
    const {
      search = '',
      payment_status = '', // 'ALL' | 'RECEIVED' | 'PENDING'
      stock_place = '',
      device_type_id = '',
      payment_mode = '',
      limit = 100,
      offset = 0
    } = req.query;

    let query = `
      SELECT d.*, dt.name as device_type_name, dt.category as device_type_category
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE 1=1
    `;
    const params = [];

    if (device_type_id) {
      query += ' AND d.device_type_id = ?';
      params.push(device_type_id);
    }
    if (stock_place) {
      query += ' AND (d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)';
      params.push(`%${stock_place}%`, `%${stock_place}%`);
    }
    if (search) {
      query += ' AND (d.imei_number LIKE ? OR d.sim_number LIKE ? OR d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY d.updated_at DESC';

    const rawDevices = db.prepare(query).all(...params);
    let parsedDevices = rawDevices.map(parseDevicePaymentInfo);

    // Apply in-memory payment filters
    if (payment_status && payment_status !== 'ALL') {
      parsedDevices = parsedDevices.filter(d => d.payment_status === payment_status);
    }
    if (payment_mode) {
      parsedDevices = parsedDevices.filter(d => (d.payment_mode || '').toUpperCase().includes(payment_mode.toUpperCase()));
    }

    const totalCount = parsedDevices.length;
    const paginated = parsedDevices.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      success: true,
      data: paginated,
      total: totalCount,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (err) {
    console.error('[DevicePayments] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/device-payments/summary - Aggregated stats directly from Stock Inventory
router.get('/summary', (req, res) => {
  try {
    const rawDevices = db.prepare(`
      SELECT d.*, dt.name as device_type_name, dt.category as device_type_category
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
    `).all();

    const parsed = rawDevices.map(parseDevicePaymentInfo);

    let totalStockAmount = 0;
    let totalReceivedAmount = 0;
    let receivedCount = 0;
    let pendingCount = 0;

    parsed.forEach(d => {
      const amt = Number(d.device_amount || 0);
      totalStockAmount += amt;
      if (d.payment_status === 'RECEIVED') {
        totalReceivedAmount += amt;
        receivedCount++;
      } else {
        pendingCount++;
      }
    });

    const pendingAmount = Math.max(0, totalStockAmount - totalReceivedAmount);
    const realizationRate = totalStockAmount > 0 ? ((totalReceivedAmount / totalStockAmount) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      summary: {
        total_devices: parsed.length,
        total_stock_amount: totalStockAmount,
        total_received_amount: totalReceivedAmount,
        total_pending_amount: pendingAmount,
        received_count: receivedCount,
        pending_count: pendingCount,
        realization_rate_pct: Number(realizationRate)
      }
    });
  } catch (err) {
    console.error('[DevicePayments] Summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/device-payments/:id - Quick update device amount & payment directly on inventory device
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const {
    device_amount,
    payment_status,
    payment_mode,
    utr_number,
    payment_date,
    payment_remarks,
    performed_by
  } = req.body;

  try {
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device record not found in Stock Inventory' });
    }

    let attrs = {};
    try {
      attrs = JSON.parse(device.additional_attributes || '{}');
    } catch {}

    const isPaid = String(payment_status || '').toUpperCase() === 'RECEIVED' || String(payment_status || '').toUpperCase() === 'PAID';

    // 1. Update Amount / Cost in attributes
    if (device_amount !== undefined && device_amount !== null && !isNaN(Number(device_amount))) {
      const numAmt = Number(device_amount);
      attrs['COST'] = numAmt;
      attrs['TOTAL COST'] = numAmt;
    }

    // 2. Update Payment Status
    attrs['AMOUNT RECEIVED'] = isPaid ? 'RECEIVED' : 'PENDING';
    attrs['PAYMENT STATUS'] = isPaid ? 'RECEIVED' : 'PENDING';

    // 3. Update Payment Mode
    if (isPaid && payment_mode) {
      attrs['AMOUNT RECEIVED BY'] = String(payment_mode).trim();
    } else if (!isPaid) {
      delete attrs['AMOUNT RECEIVED BY'];
    }

    // 4. Update UTR Number
    if (utrNumber !== undefined) {
      if (utr_number && utr_number.trim()) {
        attrs['UTR NUMBER'] = String(utr_number).trim();
      } else {
        delete attrs['UTR NUMBER'];
      }
    }

    // 5. Update Payment Date
    if (payment_date) {
      attrs['PAYMENT DATE'] = String(payment_date).trim();
    }

    // 6. Update Remarks
    if (payment_remarks !== undefined) {
      if (payment_remarks && payment_remarks.trim()) {
        attrs['PAYMENT REMARKS'] = String(payment_remarks).trim();
      } else {
        delete attrs['PAYMENT REMARKS'];
      }
    }

    const updatedAttrsStr = JSON.stringify(attrs);

    db.prepare(`
      UPDATE devices
      SET additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(updatedAttrsStr, id);

    // Record History Audit
    const staff = performed_by || 'Staff';
    const auditRemarks = isPaid
      ? `Payment marked RECEIVED (Amount: ₹${attrs['COST'] || 0}${payment_mode ? `, Mode: ${payment_mode}` : ''}${utr_number ? `, UTR: ${utr_number}` : ''})`
      : `Payment marked PENDING (Amount: ₹${attrs['COST'] || 0})`;

    try {
      db.prepare(`
        INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
        VALUES (?, ?, 'PAYMENT_UPDATED', datetime('now'), ?, ?, ?, ?)
      `).run(id, device.imei_number, device.current_holder_name || 'Stock', device.current_holder_name || 'Stock', staff, auditRemarks);
    } catch (e) {}

    if (db.triggerCloudSync) db.triggerCloudSync(3000);

    const updatedDevice = db.prepare(`
      SELECT d.*, dt.name as device_type_name, dt.category as device_type_category
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE d.id = ?
    `).get(id);

    res.json({
      success: true,
      message: 'Device amount & payment updated successfully in Stock Inventory',
      data: parseDevicePaymentInfo(updatedDevice)
    });
  } catch (err) {
    console.error('[DevicePayments] Update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/device-payments/export - Formatted Excel Export from Stock Inventory
router.get('/export', async (req, res) => {
  try {
    const { search, payment_status, stock_place, device_type_id, payment_mode } = req.query;

    let query = `
      SELECT d.*, dt.name as device_type_name, dt.category as device_type_category
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE 1=1
    `;
    const params = [];

    if (device_type_id) {
      query += ' AND d.device_type_id = ?';
      params.push(device_type_id);
    }
    if (stock_place) {
      query += ' AND (d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)';
      params.push(`%${stock_place}%`, `%${stock_place}%`);
    }
    if (search) {
      query += ' AND (d.imei_number LIKE ? OR d.sim_number LIKE ? OR d.current_holder_name LIKE ? OR d.additional_attributes LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY d.updated_at DESC';

    const rawDevices = db.prepare(query).all(...params);
    let parsedDevices = rawDevices.map(parseDevicePaymentInfo);

    if (payment_status && payment_status !== 'ALL') {
      parsedDevices = parsedDevices.filter(d => d.payment_status === payment_status);
    }
    if (payment_mode) {
      parsedDevices = parsedDevices.filter(d => (d.payment_mode || '').toUpperCase().includes(payment_mode.toUpperCase()));
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Device Amounts & Payments');

    // Title Row
    worksheet.mergeCells('A1:J1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'FuelTracks Technologies — Stock Inventory Device Amounts & Payments Ledger';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 30;

    // Header Row
    const headerRow = worksheet.getRow(2);
    headerRow.values = [
      '#',
      'IMEI Number',
      'Device Model',
      'Stock Place / Dealer',
      'Vehicle Number',
      'Customer Name',
      'Device Amount (₹)',
      'Payment Status',
      'Payment Mode / Received By',
      'UTR / Ref No.'
    ];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    headerRow.height = 24;

    let totalAmount = 0;
    let receivedTotal = 0;

    parsedDevices.forEach((r, idx) => {
      const amt = Number(r.device_amount || 0);
      totalAmount += amt;
      if (r.payment_status === 'RECEIVED') receivedTotal += amt;

      const row = worksheet.addRow([
        idx + 1,
        r.imei_number,
        r.device_type_name,
        r.stock_place,
        r.vehicle_number || '-',
        r.customer_name || '-',
        amt,
        r.payment_status,
        r.payment_mode || '-',
        r.utr_number || '-'
      ]);

      if (idx % 2 === 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
      }
    });

    // Summary Row
    const summaryRow = worksheet.addRow([
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      totalAmount,
      `Received: ₹${receivedTotal.toLocaleString('en-IN')}`,
      '',
      ''
    ]);
    summaryRow.font = { bold: true };
    summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    worksheet.getColumn(7).numFmt = '₹#,##0.00';

    worksheet.columns.forEach((column) => {
      let maxLen = 12;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const val = cell.value ? cell.value.toString() : '';
        if (val.length > maxLen) maxLen = Math.min(val.length + 3, 35);
      });
      column.width = maxLen;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Stock_Device_Amounts_${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[DevicePayments] Export error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
