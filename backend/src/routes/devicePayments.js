const express = require('express');
const router = express.Router();
const db = require('../db/database');
const ExcelJS = require('exceljs');

// GET /api/device-payments - List installed device payments with filters
router.get('/', (req, res) => {
  try {
    const {
      search = '',
      payment_status = '',
      payment_mode = '',
      startDate = '',
      endDate = '',
      limit = 100,
      offset = 0
    } = req.query;

    let query = `
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
        COALESCE(i.sale_price, 0) as sale_price,
        CASE 
          WHEN i.amount_paid IS NOT NULL THEN i.amount_paid
          WHEN UPPER(i.payment_status) = 'PAID' OR UPPER(i.payment_status) = 'RECEIVED' THEN COALESCE(i.sale_price, 0)
          ELSE 0
        END as amount_paid,
        CASE
          WHEN i.amount_paid IS NOT NULL THEN MAX(0, COALESCE(i.sale_price, 0) - i.amount_paid)
          WHEN UPPER(i.payment_status) = 'PAID' OR UPPER(i.payment_status) = 'RECEIVED' THEN 0
          ELSE COALESCE(i.sale_price, 0)
        END as balance_amount,
        CASE
          WHEN i.amount_paid IS NOT NULL AND i.amount_paid >= COALESCE(i.sale_price, 0) AND COALESCE(i.sale_price, 0) > 0 THEN 'PAID'
          WHEN i.amount_paid IS NOT NULL AND i.amount_paid > 0 AND i.amount_paid < COALESCE(i.sale_price, 0) THEN 'PARTIAL'
          WHEN UPPER(i.payment_status) = 'PAID' OR UPPER(i.payment_status) = 'RECEIVED' THEN 'PAID'
          ELSE 'PENDING'
        END as calculated_status,
        i.payment_status,
        COALESCE(i.payment_date, i.installation_date) as payment_date,
        COALESCE(i.payment_mode, 'UPI') as payment_mode,
        COALESCE(i.utr_number, '') as utr_number,
        COALESCE(i.payment_remarks, '') as payment_remarks,
        dt.name as device_type_name
      FROM installations i
      LEFT JOIN devices d ON i.device_id = d.id
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND (i.installation_date >= ? OR i.payment_date >= ?)';
      params.push(startDate, startDate);
    }
    if (endDate) {
      query += ' AND (i.installation_date <= ? OR i.payment_date <= ?)';
      params.push(endDate, endDate);
    }
    if (payment_mode) {
      query += ' AND i.payment_mode = ?';
      params.push(payment_mode);
    }
    if (search) {
      const s = `%${search}%`;
      query += ' AND (i.vehicle_number LIKE ? OR i.customer_name LIKE ? OR i.customer_contact LIKE ? OR i.imei_number LIKE ? OR i.utr_number LIKE ? OR i.installed_by LIKE ?)';
      params.push(s, s, s, s, s, s);
    }

    // Filter by calculated status if specified
    if (payment_status && payment_status !== 'ALL') {
      if (payment_status === 'PAID') {
        query += " AND (UPPER(i.payment_status) = 'PAID' OR UPPER(i.payment_status) = 'RECEIVED' OR (i.amount_paid IS NOT NULL AND i.amount_paid >= i.sale_price AND i.sale_price > 0))";
      } else if (payment_status === 'PARTIAL') {
        query += " AND (i.amount_paid IS NOT NULL AND i.amount_paid > 0 AND i.amount_paid < i.sale_price)";
      } else if (payment_status === 'PENDING') {
        query += " AND (UPPER(i.payment_status) != 'PAID' AND UPPER(i.payment_status) != 'RECEIVED' AND (i.amount_paid IS NULL OR i.amount_paid = 0))";
      }
    }

    // Count
    const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
    const totalCount = db.prepare(countQuery).get(...params)?.total || 0;

    query += ' ORDER BY i.installation_date DESC, i.id DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const rows = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: rows,
      total: totalCount,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (err) {
    console.error('[DevicePayments] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/device-payments/summary - Aggregated stats for KPI cards
router.get('/summary', (req, res) => {
  try {
    const { startDate = '', endDate = '' } = req.query;

    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = ' WHERE (installation_date >= ? AND installation_date <= ?) OR (payment_date >= ? AND payment_date <= ?)';
      params.push(startDate, endDate, startDate, endDate);
    } else if (startDate) {
      dateFilter = ' WHERE installation_date >= ? OR payment_date >= ?';
      params.push(startDate, startDate);
    } else if (endDate) {
      dateFilter = ' WHERE installation_date <= ? OR payment_date <= ?';
      params.push(endDate, endDate);
    }

    const rows = db.prepare(`
      SELECT 
        COALESCE(sale_price, 0) as sale_price,
        CASE 
          WHEN amount_paid IS NOT NULL THEN amount_paid
          WHEN UPPER(payment_status) = 'PAID' OR UPPER(payment_status) = 'RECEIVED' THEN COALESCE(sale_price, 0)
          ELSE 0
        END as amount_paid,
        payment_status,
        payment_mode
      FROM installations
      ${dateFilter}
    `).all(...params);

    let totalBilled = 0;
    let totalCollected = 0;
    let paidCount = 0;
    let partialCount = 0;
    let pendingCount = 0;

    rows.forEach(r => {
      totalBilled += r.sale_price;
      totalCollected += r.amount_paid;

      if (r.amount_paid >= r.sale_price && r.sale_price > 0) {
        paidCount++;
      } else if (r.amount_paid > 0 && r.amount_paid < r.sale_price) {
        partialCount++;
      } else {
        pendingCount++;
      }
    });

    const pendingBalance = Math.max(0, totalBilled - totalCollected);
    const collectionRate = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(1) : 0;

    // Today's collection
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCollected = db.prepare(`
      SELECT SUM(
        CASE 
          WHEN amount_paid IS NOT NULL THEN amount_paid
          WHEN UPPER(payment_status) = 'PAID' OR UPPER(payment_status) = 'RECEIVED' THEN COALESCE(sale_price, 0)
          ELSE 0
        END
      ) as today_total
      FROM installations
      WHERE payment_date = ? OR installation_date = ?
    `).get(todayStr, todayStr)?.today_total || 0;

    res.json({
      success: true,
      summary: {
        total_installations: rows.length,
        total_billed: totalBilled,
        total_collected: totalCollected,
        pending_balance: pendingBalance,
        today_collected: todayCollected,
        paid_count: paidCount,
        partial_count: partialCount,
        pending_count: pendingCount,
        collection_rate_pct: Number(collectionRate)
      }
    });
  } catch (err) {
    console.error('[DevicePayments] Summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/device-payments/:id - Record or update payment received for an installed device
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      amount_paid,
      payment_mode = 'UPI',
      payment_date = new Date().toISOString().split('T')[0],
      utr_number = '',
      payment_remarks = ''
    } = req.body;

    const existing = db.prepare('SELECT * FROM installations WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Installation record not found' });
    }

    const salePrice = existing.sale_price || 0;
    const numPaid = parseFloat(amount_paid);

    if (isNaN(numPaid) || numPaid < 0) {
      return res.status(400).json({ success: false, error: 'Amount paid must be a non-negative number' });
    }

    let calculatedStatus = 'PENDING';
    if (numPaid >= salePrice && salePrice > 0) {
      calculatedStatus = 'PAID';
    } else if (numPaid > 0 && numPaid < salePrice) {
      calculatedStatus = 'PARTIAL';
    } else if (numPaid === 0) {
      calculatedStatus = 'PENDING';
    }

    const stmt = db.prepare(`
      UPDATE installations SET
        amount_paid = ?,
        payment_status = ?,
        payment_mode = ?,
        payment_date = ?,
        utr_number = ?,
        payment_remarks = ?
      WHERE id = ?
    `);

    stmt.run(
      numPaid,
      calculatedStatus,
      payment_mode,
      payment_date,
      utr_number ? utr_number.trim() : '',
      payment_remarks ? payment_remarks.trim() : '',
      id
    );

    // Also update device holder name or attributes if needed
    const updated = db.prepare('SELECT * FROM installations WHERE id = ?').get(id);

    if (db.triggerCloudSync) db.triggerCloudSync(3000);

    res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: updated
    });
  } catch (err) {
    console.error('[DevicePayments] Update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/device-payments/export - Excel Export
router.get('/export', async (req, res) => {
  try {
    const { search, payment_status, payment_mode, startDate, endDate } = req.query;

    let query = `
      SELECT 
        i.id,
        i.installation_date,
        i.vehicle_number,
        i.customer_name,
        i.customer_contact,
        i.imei_number,
        COALESCE(i.sale_price, 0) as sale_price,
        CASE 
          WHEN i.amount_paid IS NOT NULL THEN i.amount_paid
          WHEN UPPER(i.payment_status) = 'PAID' OR UPPER(i.payment_status) = 'RECEIVED' THEN COALESCE(i.sale_price, 0)
          ELSE 0
        END as amount_paid,
        CASE
          WHEN i.amount_paid IS NOT NULL THEN MAX(0, COALESCE(i.sale_price, 0) - i.amount_paid)
          WHEN UPPER(i.payment_status) = 'PAID' OR UPPER(i.payment_status) = 'RECEIVED' THEN 0
          ELSE COALESCE(i.sale_price, 0)
        END as balance_amount,
        CASE
          WHEN i.amount_paid IS NOT NULL AND i.amount_paid >= COALESCE(i.sale_price, 0) AND COALESCE(i.sale_price, 0) > 0 THEN 'PAID'
          WHEN i.amount_paid IS NOT NULL AND i.amount_paid > 0 AND i.amount_paid < COALESCE(i.sale_price, 0) THEN 'PARTIAL'
          WHEN UPPER(i.payment_status) = 'PAID' OR UPPER(i.payment_status) = 'RECEIVED' THEN 'PAID'
          ELSE 'PENDING'
        END as calculated_status,
        COALESCE(i.payment_date, i.installation_date) as payment_date,
        COALESCE(i.payment_mode, 'UPI') as payment_mode,
        COALESCE(i.utr_number, '') as utr_number,
        COALESCE(i.installed_by, '') as installed_by,
        COALESCE(i.payment_remarks, '') as payment_remarks
      FROM installations i
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND (i.installation_date >= ? OR i.payment_date >= ?)';
      params.push(startDate, startDate);
    }
    if (endDate) {
      query += ' AND (i.installation_date <= ? OR i.payment_date <= ?)';
      params.push(endDate, endDate);
    }
    if (payment_mode) {
      query += ' AND i.payment_mode = ?';
      params.push(payment_mode);
    }
    if (search) {
      const s = `%${search}%`;
      query += ' AND (i.vehicle_number LIKE ? OR i.customer_name LIKE ? OR i.customer_contact LIKE ? OR i.imei_number LIKE ? OR i.utr_number LIKE ?)';
      params.push(s, s, s, s, s);
    }

    if (payment_status && payment_status !== 'ALL') {
      if (payment_status === 'PAID') {
        query += " AND (UPPER(i.payment_status) = 'PAID' OR UPPER(i.payment_status) = 'RECEIVED' OR (i.amount_paid IS NOT NULL AND i.amount_paid >= i.sale_price AND i.sale_price > 0))";
      } else if (payment_status === 'PARTIAL') {
        query += " AND (i.amount_paid IS NOT NULL AND i.amount_paid > 0 AND i.amount_paid < i.sale_price)";
      } else if (payment_status === 'PENDING') {
        query += " AND (UPPER(i.payment_status) != 'PAID' AND UPPER(i.payment_status) != 'RECEIVED' AND (i.amount_paid IS NULL OR i.amount_paid = 0))";
      }
    }

    query += ' ORDER BY i.installation_date DESC, i.id DESC';
    const rows = db.prepare(query).all(...params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Device Payments Statement');

    // Title Row
    worksheet.mergeCells('A1:L1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'FuelTracks Technologies — Device Payments Received (Collections Statement)';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 30;

    // Header Row
    const headerRow = worksheet.getRow(2);
    headerRow.values = [
      '#',
      'Vehicle Number',
      'Customer Name',
      'Phone Number',
      'IMEI Number',
      'Billed Price (₹)',
      'Amount Received (₹)',
      'Balance Due (₹)',
      'Status',
      'Payment Mode',
      'UTR / Ref No.',
      'Payment Date'
    ];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    headerRow.height = 24;

    let sumBilled = 0;
    let sumReceived = 0;
    let sumBalance = 0;

    rows.forEach((r, idx) => {
      sumBilled += r.sale_price;
      sumReceived += r.amount_paid;
      sumBalance += r.balance_amount;

      const row = worksheet.addRow([
        idx + 1,
        r.vehicle_number,
        r.customer_name,
        r.customer_contact,
        r.imei_number,
        r.sale_price,
        r.amount_paid,
        r.balance_amount,
        r.calculated_status,
        r.payment_mode,
        r.utr_number || '-',
        r.payment_date
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
      sumBilled,
      sumReceived,
      sumBalance,
      '',
      '',
      '',
      ''
    ]);
    summaryRow.font = { bold: true };
    summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    // Format currency columns
    worksheet.getColumn(6).numFmt = '₹#,##0.00';
    worksheet.getColumn(7).numFmt = '₹#,##0.00';
    worksheet.getColumn(8).numFmt = '₹#,##0.00';

    worksheet.columns.forEach((column) => {
      let maxLen = 12;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const val = cell.value ? cell.value.toString() : '';
        if (val.length > maxLen) maxLen = Math.min(val.length + 3, 35);
      });
      column.width = maxLen;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Device_Payments_Statement_${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[DevicePayments] Export error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
