const express = require('express');
const router = express.Router();
const db = require('../db/database');
const ExcelJS = require('exceljs');

const CATEGORY_META = {
  FUEL_TRAVEL: { label: 'Fuel & Travel', group: 'FIELD_OPS' },
  FOOD_ALLOWANCE: { label: 'Food & Daily Allowance (DA)', group: 'FIELD_OPS' },
  TECHNICIAN_PAYOUT: { label: 'Technician Payout / Incentive', group: 'FIELD_OPS' },
  TECHNICIAN_TRAVEL: { label: 'Technician Travel / Fuel', group: 'FIELD_OPS' },
  OFFICE_RENT: { label: 'Office Rent & Maintenance', group: 'FIXED_OVERHEADS' },
  ELECTRICITY_BILL: { label: 'Electricity & Utility Bills', group: 'FIXED_OVERHEADS' },
  SALARIES: { label: 'Staff Salaries & Advances', group: 'PAYROLL' },
  STOCK_PURCHASE: { label: 'Stock & Hardware Purchases (COGS)', group: 'INVENTORY_STOCK' },
  COURIER_FREIGHT: { label: 'Courier & Logistics', group: 'LOGISTICS' },
  INTERNET_CLOUD: { label: 'Internet, Software & Servers', group: 'FIXED_OVERHEADS' },
  OFFICE_MISC: { label: 'Office Tea/Snacks & Misc', group: 'GENERAL_ADMIN' },
  OTHER: { label: 'Other Expenses', group: 'GENERAL_ADMIN' }
};

// GET /api/expenses - List expenses with filters
router.get('/', (req, res) => {
  try {
    const {
      search = '',
      category = '',
      category_group = '',
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
      query += ' AND (incurred_by LIKE ? OR paid_to LIKE ? OR utr_number LIKE ? OR bill_invoice_no LIKE ? OR sub_category LIKE ? OR remarks LIKE ? OR linked_entity_id LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s, s);
    }

    // Count query
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const totalCount = db.prepare(countQuery).get(...params).total;

    // Ordered & paginated
    query += ' ORDER BY expense_date DESC, id DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const rows = db.prepare(query).all(...params);

    // Filter by category_group in memory if requested
    let resultRows = rows;
    if (category_group && category_group !== 'ALL') {
      resultRows = rows.filter(r => {
        const meta = CATEGORY_META[r.category];
        return meta && meta.group === category_group;
      });
    }

    res.json({
      success: true,
      data: resultRows,
      total: totalCount,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (err) {
    console.error('[Expenses] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/expenses/financial-health - Comprehensive Cash Flow (Inflow vs Stock vs OPEX vs Savings)
router.get('/financial-health', (req, res) => {
  try {
    const { startDate = '', endDate = '' } = req.query;

    let dateCondInst = '';
    let dateCondDev = '';
    let dateCondExp = '';
    const paramsInst = [];
    const paramsDev = [];
    const paramsExp = [];

    if (startDate && endDate) {
      dateCondInst = ' WHERE COALESCE(payment_date, installation_date) >= ? AND COALESCE(payment_date, installation_date) <= ?';
      paramsInst.push(startDate, endDate);

      dateCondDev = ' WHERE purchase_date >= ? AND purchase_date <= ?';
      paramsDev.push(startDate, endDate);

      dateCondExp = ' WHERE expense_date >= ? AND expense_date <= ?';
      paramsExp.push(startDate, endDate);
    } else if (startDate) {
      dateCondInst = ' WHERE COALESCE(payment_date, installation_date) >= ?';
      paramsInst.push(startDate);

      dateCondDev = ' WHERE purchase_date >= ?';
      paramsDev.push(startDate);

      dateCondExp = ' WHERE expense_date >= ?';
      paramsExp.push(startDate);
    } else if (endDate) {
      dateCondInst = ' WHERE COALESCE(payment_date, installation_date) <= ?';
      paramsInst.push(endDate);

      dateCondDev = ' WHERE purchase_date <= ?';
      paramsDev.push(endDate);

      dateCondExp = ' WHERE expense_date <= ?';
      paramsExp.push(endDate);
    }

    // 1. Total Inflow (Amount Collected/Paid from installations)
    const inflowRow = db.prepare(`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN amount_paid IS NOT NULL AND amount_paid > 0 THEN amount_paid 
            WHEN UPPER(COALESCE(payment_status, '')) IN ('RECEIVED', 'PAID') THEN COALESCE(sale_price, 0)
            WHEN UPPER(COALESCE(payment_status, '')) NOT IN ('PENDING', 'NOT RECEIVED', 'UNPAID') AND sale_price > 0 THEN COALESCE(sale_price, 0)
            ELSE 0 
          END
        ), 0) as total_inflow,
        COUNT(*) as total_installations
      FROM installations
      ${dateCondInst}
    `).get(...paramsInst);

    // 2. Hardware / Stock Purchases from Device Master
    const stockDeviceRow = db.prepare(`
      SELECT 
        COALESCE(SUM(purchase_price), 0) as device_stock_cost,
        COUNT(*) as total_devices_bought
      FROM devices
      ${dateCondDev}
    `).get(...paramsDev);

    // 3. Direct Stock Purchase Expenses recorded in expenses table
    const directStockExpenseRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as direct_stock_amount
      FROM expenses
      ${dateCondExp ? `${dateCondExp} AND category = 'STOCK_PURCHASE'` : "WHERE category = 'STOCK_PURCHASE'"}
    `).get(...paramsExp);

    // Total Stock Purchases (COGS)
    const totalStockPurchases = (stockDeviceRow?.device_stock_cost || 0) + (directStockExpenseRow?.direct_stock_amount || 0);

    // 4. Operating Expenses (OPEX - excluding direct stock purchases to prevent double counting)
    const opexRow = db.prepare(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_opex,
        COUNT(*) as total_expense_count
      FROM expenses
      ${dateCondExp ? `${dateCondExp} AND category != 'STOCK_PURCHASE'` : "WHERE category != 'STOCK_PURCHASE'"}
    `).get(...paramsExp);

    const totalInflow = inflowRow?.total_inflow || 0;
    const totalOpex = opexRow?.total_opex || 0;
    const totalOutflow = totalStockPurchases + totalOpex;
    const netSavings = totalInflow - totalOutflow;
    const savingsRate = totalInflow > 0 ? ((netSavings / totalInflow) * 100) : 0;

    // 5. Category Breakdown with Labels & Groups
    const categoryRows = db.prepare(`
      SELECT category, SUM(amount) as total_amount, COUNT(*) as count 
      FROM expenses ${dateCondExp} 
      GROUP BY category 
      ORDER BY total_amount DESC
    `).all(...paramsExp);

    const categoryBreakdown = categoryRows.map(row => {
      const meta = CATEGORY_META[row.category] || { label: row.category, group: 'OTHER' };
      return {
        category: row.category,
        label: meta.label,
        group: meta.group,
        total_amount: row.total_amount,
        count: row.count,
        percentage: totalOutflow > 0 ? ((row.total_amount / totalOutflow) * 100).toFixed(1) : 0
      };
    });

    // 6. Group Breakdown
    const groupMap = {
      FIELD_OPS: { name: 'Field & Travel (Fuel, Food, Payouts)', total: 0, count: 0 },
      FIXED_OVERHEADS: { name: 'Office Overheads (Rent, EB, Internet)', total: 0, count: 0 },
      PAYROLL: { name: 'Staff Salaries & Advances', total: 0, count: 0 },
      INVENTORY_STOCK: { name: 'Stock & Hardware (COGS)', total: totalStockPurchases, count: stockDeviceRow?.total_devices_bought || 0 },
      LOGISTICS: { name: 'Logistics & Courier', total: 0, count: 0 },
      GENERAL_ADMIN: { name: 'Office Misc & Other', total: 0, count: 0 }
    };

    categoryBreakdown.forEach(item => {
      if (item.category === 'STOCK_PURCHASE') return; // already counted in groupMap.INVENTORY_STOCK
      const grp = item.group;
      if (groupMap[grp]) {
        groupMap[grp].total += item.total_amount;
        groupMap[grp].count += item.count;
      } else {
        groupMap.GENERAL_ADMIN.total += item.total_amount;
        groupMap.GENERAL_ADMIN.count += item.count;
      }
    });

    // 7. Monthly Historical Trend (Last 6 Months)
    const monthlyTrends = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const yearMonth = d.toISOString().slice(0, 7); // e.g. "2026-09"
      const monthLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });

      const mInflow = db.prepare(`
        SELECT COALESCE(SUM(
          CASE 
            WHEN amount_paid IS NOT NULL AND amount_paid > 0 THEN amount_paid 
            WHEN UPPER(COALESCE(payment_status, '')) IN ('RECEIVED', 'PAID') THEN COALESCE(sale_price, 0)
            WHEN UPPER(COALESCE(payment_status, '')) NOT IN ('PENDING', 'NOT RECEIVED', 'UNPAID') AND sale_price > 0 THEN COALESCE(sale_price, 0)
            ELSE 0 
          END
        ), 0) as val 
        FROM installations 
        WHERE COALESCE(payment_date, installation_date) LIKE ?
      `).get(`${yearMonth}%`)?.val || 0;

      const mStock = db.prepare(`
        SELECT COALESCE(SUM(purchase_price), 0) as val 
        FROM devices 
        WHERE purchase_date LIKE ?
      `).get(`${yearMonth}%`)?.val || 0;

      const mOpex = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as val 
        FROM expenses 
        WHERE expense_date LIKE ? AND category != 'STOCK_PURCHASE'
      `).get(`${yearMonth}%`)?.val || 0;

      const mDirectStockExp = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as val 
        FROM expenses 
        WHERE expense_date LIKE ? AND category = 'STOCK_PURCHASE'
      `).get(`${yearMonth}%`)?.val || 0;

      const mTotalStock = mStock + mDirectStockExp;
      const mTotalOutflow = mTotalStock + mOpex;
      const mSavings = mInflow - mTotalOutflow;

      monthlyTrends.push({
        month: monthLabel,
        yearMonth,
        inflow: mInflow,
        stock: mTotalStock,
        opex: mOpex,
        totalOutflow: mTotalOutflow,
        savings: mSavings
      });
    }

    res.json({
      success: true,
      data: {
        totalInflow,
        totalStockPurchases,
        totalOpex,
        totalOutflow,
        netSavings,
        savingsRate: parseFloat(savingsRate.toFixed(1)),
        isProfitable: netSavings >= 0,
        categoryBreakdown,
        groupBreakdown: groupMap,
        monthlyTrends
      }
    });
  } catch (err) {
    console.error('[Expenses] Financial Health Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/expenses/summary - Quick statistics for metrics cards
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
    const currentMonthPrefix = now.toISOString().slice(0, 7);
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
      sub_category = '',
      amount,
      payment_mode = 'UPI',
      incurred_by,
      paid_to = '',
      utr_number = '',
      bill_invoice_no = '',
      receipt_url = '',
      linked_entity_type = 'GENERAL',
      linked_entity_id = '',
      is_recurring = 0,
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
        expense_date, category, sub_category, amount, payment_mode,
        incurred_by, paid_to, utr_number, bill_invoice_no, receipt_url,
        linked_entity_type, linked_entity_id, is_recurring, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      expense_date,
      category,
      sub_category ? sub_category.trim() : '',
      numAmount,
      payment_mode,
      incurred_by.trim(),
      paid_to ? paid_to.trim() : '',
      utr_number ? utr_number.trim() : '',
      bill_invoice_no ? bill_invoice_no.trim() : '',
      receipt_url ? receipt_url.trim() : '',
      linked_entity_type || 'GENERAL',
      linked_entity_id ? linked_entity_id.trim() : '',
      is_recurring ? 1 : 0,
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
      sub_category,
      amount,
      payment_mode,
      incurred_by,
      paid_to,
      utr_number,
      bill_invoice_no,
      receipt_url,
      linked_entity_type,
      linked_entity_id,
      is_recurring,
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
        sub_category = ?,
        amount = ?,
        payment_mode = ?,
        incurred_by = ?,
        paid_to = ?,
        utr_number = ?,
        bill_invoice_no = ?,
        receipt_url = ?,
        linked_entity_type = ?,
        linked_entity_id = ?,
        is_recurring = ?,
        remarks = ?
      WHERE id = ?
    `);

    stmt.run(
      expense_date || existing.expense_date,
      category || existing.category,
      sub_category !== undefined ? (sub_category ? sub_category.trim() : '') : (existing.sub_category || ''),
      numAmount,
      payment_mode || existing.payment_mode,
      incurred_by ? incurred_by.trim() : existing.incurred_by,
      paid_to !== undefined ? (paid_to ? paid_to.trim() : '') : existing.paid_to,
      utr_number !== undefined ? (utr_number ? utr_number.trim() : '') : existing.utr_number,
      bill_invoice_no !== undefined ? (bill_invoice_no ? bill_invoice_no.trim() : '') : (existing.bill_invoice_no || ''),
      receipt_url !== undefined ? (receipt_url ? receipt_url.trim() : '') : (existing.receipt_url || ''),
      linked_entity_type || existing.linked_entity_type,
      linked_entity_id !== undefined ? (linked_entity_id ? linked_entity_id.trim() : '') : existing.linked_entity_id,
      is_recurring !== undefined ? (is_recurring ? 1 : 0) : (existing.is_recurring || 0),
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

// GET /api/expenses/export - Excel export with modern formatting & all categories
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
      query += ' AND (incurred_by LIKE ? OR paid_to LIKE ? OR utr_number LIKE ? OR bill_invoice_no LIKE ? OR remarks LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    query += ' ORDER BY expense_date DESC, id DESC';
    const rows = db.prepare(query).all(...params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Expenses Statement');

    // Title Row
    worksheet.mergeCells('A1:J1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'FuelTracks Technologies — Operational Expenses & Cash Flow Statement';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 32;

    // Header Row
    const headerRow = worksheet.getRow(2);
    headerRow.values = [
      '#',
      'Date',
      'Category',
      'Sub-Category / Type',
      'Amount (₹)',
      'Payment Mode',
      'Incurred By / Staff',
      'Paid To / Payee',
      'Bill / UTR Ref',
      'Remarks / Linked Entity'
    ];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.height = 25;

    let totalAmount = 0;
    rows.forEach((r, idx) => {
      totalAmount += r.amount || 0;
      const meta = CATEGORY_META[r.category] || { label: r.category };
      const row = worksheet.addRow([
        idx + 1,
        r.expense_date,
        meta.label,
        r.sub_category || '-',
        r.amount,
        r.payment_mode,
        r.incurred_by,
        r.paid_to || '-',
        r.bill_invoice_no ? `${r.bill_invoice_no} (${r.utr_number || 'No UTR'})` : (r.utr_number || '-'),
        r.linked_entity_id ? `[${r.linked_entity_type}: ${r.linked_entity_id}] ${r.remarks || ''}` : (r.remarks || '-')
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
    worksheet.getColumn(5).numFmt = '₹#,##0.00';

    // Auto-fit column widths
    worksheet.columns.forEach((column) => {
      let maxLen = 14;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const val = cell.value ? cell.value.toString() : '';
        if (val.length > maxLen) maxLen = Math.min(val.length + 3, 40);
      });
      column.width = maxLen;
    });

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const formattedDate = `${day}-${month}-${year}`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="EXPENSES_STATEMENT_${formattedDate}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Expenses] Export error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
