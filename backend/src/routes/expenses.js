const express = require('express');
const router = express.Router();
const db = require('../db/database');
const ExcelJS = require('exceljs');

// GET /api/expenses - List expenses with filters
router.get('/', (req, res) => {
  try {
    const {
      search = '',
      category = '',
      payment_mode = '',
      startDate = '',
      endDate = '',
      limit = 100,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (payment_mode) {
      query += ' AND payment_mode = ?';
      params.push(payment_mode);
    }

    if (startDate) {
      query += ' AND expense_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND expense_date <= ?';
      params.push(endDate);
    }

    if (search) {
      query += ' AND (incurred_by LIKE ? OR paid_to LIKE ? OR utr_number LIKE ? OR remarks LIKE ? OR linked_entity_id LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    // Count query
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const totalCount = db.prepare(countQuery).get(...params).total;

    // Ordered & paginated
    query += ' ORDER BY expense_date DESC, id DESC LIMIT ? OFFSET ?';
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
    console.error('[Expenses] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/expenses/summary - Aggregated stats for metrics cards & charts
router.get('/summary', (req, res) => {
  try {
    const { startDate = '', endDate = '' } = req.query;

    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = ' WHERE expense_date >= ? AND expense_date <= ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      dateFilter = ' WHERE expense_date >= ?';
      params.push(startDate);
    } else if (endDate) {
      dateFilter = ' WHERE expense_date <= ?';
      params.push(endDate);
    }

    // Total expense amount
    const totalRow = db.prepare(`SELECT SUM(amount) as total_amount, COUNT(*) as total_count FROM expenses ${dateFilter}`).get(...params);

    // Breakdown by category
    const categoryRows = db.prepare(`
      SELECT category, SUM(amount) as total_amount, COUNT(*) as count 
      FROM expenses ${dateFilter} 
      GROUP BY category 
      ORDER BY total_amount DESC
    `).all(...params);

    // Breakdown by payment mode
    const paymentModeRows = db.prepare(`
      SELECT payment_mode, SUM(amount) as total_amount, COUNT(*) as count 
      FROM expenses ${dateFilter} 
      GROUP BY payment_mode 
      ORDER BY total_amount DESC
    `).all(...params);

    // This month vs previous month
    const now = new Date();
    const currentMonthPrefix = now.toISOString().slice(0, 7); // e.g. "2026-09"
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthPrefix = prevDate.toISOString().slice(0, 7);

    const thisMonth = db.prepare(`SELECT SUM(amount) as total FROM expenses WHERE expense_date LIKE ?`).get(`${currentMonthPrefix}%`)?.total || 0;
    const prevMonth = db.prepare(`SELECT SUM(amount) as total FROM expenses WHERE expense_date LIKE ?`).get(`${prevMonthPrefix}%`)?.total || 0;

    res.json({
      success: true,
      summary: {
        total_amount: totalRow?.total_amount || 0,
        total_count: totalRow?.total_count || 0,
        this_month: thisMonth,
        prev_month: prevMonth,
        categories: categoryRows,
        payment_modes: paymentModeRows
      }
    });
  } catch (err) {
    console.error('[Expenses] Summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/expenses - Add new expense
router.post('/', (req, res) => {
  try {
    const {
      expense_date,
      category,
      amount,
      payment_mode = 'UPI',
      incurred_by,
      paid_to = '',
      utr_number = '',
      linked_entity_type = 'GENERAL',
      linked_entity_id = '',
      remarks = ''
    } = req.body;

    if (!expense_date || !category || amount === undefined || amount === null || !incurred_by) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: expense_date, category, amount, and incurred_by are required.'
      });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number.'
      });
    }

    const stmt = db.prepare(`
      INSERT INTO expenses (
        expense_date, category, amount, payment_mode,
        incurred_by, paid_to, utr_number, linked_entity_type,
        linked_entity_id, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      expense_date,
      category,
      numAmount,
      payment_mode,
      incurred_by.trim(),
      paid_to ? paid_to.trim() : '',
      utr_number ? utr_number.trim() : '',
      linked_entity_type || 'GENERAL',
      linked_entity_id ? linked_entity_id.trim() : '',
      remarks ? remarks.trim() : ''
    );

    const created = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);

    if (db.triggerCloudSync) db.triggerCloudSync(3000);

    res.status(201).json({
      success: true,
      message: 'Expense recorded successfully',
      data: created
    });
  } catch (err) {
    console.error('[Expenses] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/expenses/:id - Update expense
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      expense_date,
      category,
      amount,
      payment_mode,
      incurred_by,
      paid_to,
      utr_number,
      linked_entity_type,
      linked_entity_id,
      remarks
    } = req.body;

    const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Expense record not found' });
    }

    const numAmount = amount !== undefined ? parseFloat(amount) : existing.amount;
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a positive number.' });
    }

    const stmt = db.prepare(`
      UPDATE expenses SET
        expense_date = ?,
        category = ?,
        amount = ?,
        payment_mode = ?,
        incurred_by = ?,
        paid_to = ?,
        utr_number = ?,
        linked_entity_type = ?,
        linked_entity_id = ?,
        remarks = ?
      WHERE id = ?
    `);

    stmt.run(
      expense_date || existing.expense_date,
      category || existing.category,
      numAmount,
      payment_mode || existing.payment_mode,
      incurred_by ? incurred_by.trim() : existing.incurred_by,
      paid_to !== undefined ? (paid_to ? paid_to.trim() : '') : existing.paid_to,
      utr_number !== undefined ? (utr_number ? utr_number.trim() : '') : existing.utr_number,
      linked_entity_type || existing.linked_entity_type,
      linked_entity_id !== undefined ? (linked_entity_id ? linked_entity_id.trim() : '') : existing.linked_entity_id,
      remarks !== undefined ? (remarks ? remarks.trim() : '') : existing.remarks,
      id
    );

    const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);

    if (db.triggerCloudSync) db.triggerCloudSync(3000);

    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: updated
    });
  } catch (err) {
    console.error('[Expenses] Update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/expenses/:id - Delete expense
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Expense record not found' });
    }

    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);

    if (db.triggerCloudSync) db.triggerCloudSync(3000);

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (err) {
    console.error('[Expenses] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/expenses/export - Excel export
router.get('/export', async (req, res) => {
  try {
    const { category, payment_mode, startDate, endDate, search } = req.query;

    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (payment_mode) {
      query += ' AND payment_mode = ?';
      params.push(payment_mode);
    }
    if (startDate) {
      query += ' AND expense_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND expense_date <= ?';
      params.push(endDate);
    }
    if (search) {
      query += ' AND (incurred_by LIKE ? OR paid_to LIKE ? OR utr_number LIKE ? OR remarks LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY expense_date DESC, id DESC';
    const rows = db.prepare(query).all(...params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Expenses Statement');

    // Title Row
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'FuelTracks Technologies — Operational Expenses Statement';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 30;

    // Header Row
    const headerRow = worksheet.getRow(2);
    headerRow.values = [
      '#',
      'Date',
      'Category',
      'Amount (₹)',
      'Payment Mode',
      'Incurred By / Staff',
      'Paid To',
      'UTR / Reference No.',
      'Remarks'
    ];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.height = 24;

    const categoryLabels = {
      'TECHNICIAN_TRAVEL': 'Technician Travel / Fuel',
      'COURIER_FREIGHT': 'Courier & Freight',
      'TECHNICIAN_PAYOUT': 'Technician Payout / Incentive',
      'OFFICE_MISC': 'Office & Operations',
      'OTHER': 'Other'
    };

    let totalAmount = 0;
    rows.forEach((r, idx) => {
      totalAmount += r.amount || 0;
      const row = worksheet.addRow([
        idx + 1,
        r.expense_date,
        categoryLabels[r.category] || r.category,
        r.amount,
        r.payment_mode,
        r.incurred_by,
        r.paid_to || '-',
        r.utr_number || '-',
        r.remarks || '-'
      ]);

      if (idx % 2 === 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });

    // Total Row
    const summaryRow = worksheet.addRow([
      'TOTAL',
      '',
      '',
      totalAmount,
      '',
      '',
      '',
      '',
      ''
    ]);
    summaryRow.font = { bold: true };
    summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    // Format Amount columns as Currency
    worksheet.getColumn(4).numFmt = '₹#,##0.00';

    // Auto-fit column widths
    worksheet.columns.forEach((column, i) => {
      let maxLen = 12;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const val = cell.value ? cell.value.toString() : '';
        if (val.length > maxLen) maxLen = Math.min(val.length + 3, 35);
      });
      column.width = maxLen;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Expenses_Statement_${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Expenses] Export error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
