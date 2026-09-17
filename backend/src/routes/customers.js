const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/customers - List all customers with fleet vehicle count and billing summary
router.get('/', (req, res) => {
  try {
    const { search, phone } = req.query;
    let query = `
      SELECT c.*,
             COUNT(i.id) as vehicle_count,
             COALESCE(SUM(i.sale_price), 0) as total_billed
      FROM customers c
      LEFT JOIN installations i ON c.id = i.customer_id
      WHERE 1=1
    `;
    const params = [];

    if (phone) {
      query += ` AND c.phone_number = ?`;
      params.push(phone);
    } else if (search) {
      query += ` AND (c.name LIKE ? OR c.phone_number LIKE ? OR c.email LIKE ? OR c.address LIKE ? OR c.software_user_id LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` GROUP BY c.id ORDER BY c.created_at DESC`;

    const customers = db.prepare(query).all(...params);
    res.json({ success: true, count: customers.length, data: customers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/customers/:id - Single customer details with all installations/vehicles & reminders
router.get('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const installations = db.prepare(`
      SELECT i.*, d.sim_number, d.current_status, d.additional_attributes, dt.name as device_type_name
      FROM installations i
      JOIN devices d ON i.device_id = d.id
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE i.customer_id = ?
      ORDER BY i.installation_date DESC
    `).all(id);

    const reminders = db.prepare(`
      SELECT * FROM reminders
      WHERE customer_id = ?
      ORDER BY due_date ASC
    `).all(id);

    res.json({
      success: true,
      data: {
        customer,
        installations,
        reminders
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/customers/:id - Update Customer profile and Software credentials
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone_number, alternate_phone, email, address, customer_type, software_user_id, software_password, notes } = req.body;

  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    db.prepare(`
      UPDATE customers
      SET name = COALESCE(?, name),
          phone_number = COALESCE(?, phone_number),
          alternate_phone = COALESCE(?, alternate_phone),
          email = COALESCE(?, email),
          address = COALESCE(?, address),
          customer_type = COALESCE(?, customer_type),
          software_user_id = COALESCE(?, software_user_id),
          software_password = COALESCE(?, software_password),
          notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(
      name ? name.trim() : null,
      phone_number ? phone_number.trim() : null,
      alternate_phone !== undefined ? alternate_phone : null,
      email !== undefined ? email : null,
      address !== undefined ? address : null,
      customer_type || null,
      software_user_id !== undefined ? software_user_id : null,
      software_password !== undefined ? software_password : null,
      notes !== undefined ? notes : null,
      id
    );

    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.json({ success: true, data: updated, message: 'Customer profile updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM reminders WHERE customer_id = ?').run(id);
      db.prepare('DELETE FROM installations WHERE customer_id = ?').run(id);
      db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    });
    deleteTx();
    res.json({ success: true, message: 'Customer record deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/customers/lookup/phone/:phone - Quick lookup for auto-fill in mobile/web forms
router.get('/lookup/phone/:phone', (req, res) => {
  const { phone } = req.params;
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE phone_number = ?').get(phone);
    if (!customer) {
      return res.json({ success: true, found: false });
    }
    const installations = db.prepare('SELECT vehicle_number, installation_date FROM installations WHERE customer_id = ?').all(customer.id);
    res.json({
      success: true,
      found: true,
      data: {
        ...customer,
        existing_vehicles: installations.map(i => i.vehicle_number)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/customers/aging-balances - Customer Credit & Overdue Aging Ledger
router.get('/aging-balances', (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parseDate = (rawDate) => {
      if (!rawDate) return null;
      const str = String(rawDate).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str);
      if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
        const [dd, mm, yyyy] = str.split('-');
        return new Date(`${yyyy}-${mm}-${dd}`);
      }
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
        const [dd, mm, yyyy] = str.split('/');
        return new Date(`${yyyy}-${mm}-${dd}`);
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    };

    // 1. Fetch pending installations from installations table
    const instRows = db.prepare(`
      SELECT 
        i.id, i.imei_number, i.installation_date, i.sale_price, i.vehicle_number,
        i.customer_name, i.customer_contact, i.remarks, i.installation_location,
        d.additional_attributes
      FROM installations i
      LEFT JOIN devices d ON i.device_id = d.id
    `).all();

    const instImeis = new Set();
    const pendingMap = {};

    instRows.forEach(inst => {
      instImeis.add(inst.imei_number);
      let attrs = {};
      try { attrs = JSON.parse(inst.additional_attributes || '{}'); } catch {}

      const amtRec = (attrs['AMOUNT RECEIVED'] || '').trim().toUpperCase();
      const isPaid = amtRec === 'RECEIVED' || amtRec === 'PAID';
      if (isPaid) return; // Skip settled

      const price = parseFloat(inst.sale_price || attrs['TOTAL COST'] || attrs['COST'] || 0) || 0;
      if (price <= 0) return;

      const custName = (inst.customer_name || attrs['CUSTOMER NAME'] || 'Valued Customer').trim();
      const custPhone = (inst.customer_contact || attrs['CUSTOMER PHONE NUMBER'] || '').trim();
      const key = custPhone || custName;

      const dateObj = parseDate(inst.installation_date || attrs['CERTIFICATE ISSUED DATE']);
      const days = dateObj ? Math.max(0, Math.floor((today - dateObj) / (1000 * 60 * 60 * 24))) : 0;

      if (!pendingMap[key]) {
        pendingMap[key] = {
          customer_name: custName,
          phone: custPhone,
          vehicles: [],
          total_pending_amount: 0,
          oldest_due_days: 0,
          latest_install_date: inst.installation_date,
          imeis: [],
          items_count: 0
        };
      }

      const p = pendingMap[key];
      p.total_pending_amount += price;
      p.items_count += 1;
      if (inst.vehicle_number && !p.vehicles.includes(inst.vehicle_number)) {
        p.vehicles.push(inst.vehicle_number);
      }
      if (inst.imei_number) p.imeis.push(inst.imei_number);
      if (days > p.oldest_due_days) p.oldest_due_days = days;
    });

    // 2. Fetch pending from devices table (uploaded master sheets not in installations table)
    const devRows = db.prepare(`SELECT id, imei_number, purchase_date, purchase_price, additional_attributes FROM devices`).all();
    devRows.forEach(d => {
      if (instImeis.has(d.imei_number)) return;
      let attrs = {};
      try { attrs = JSON.parse(d.additional_attributes || '{}'); } catch {}

      const amtRec = (attrs['AMOUNT RECEIVED'] || '').trim().toUpperCase();
      const hasCustomer = attrs['CUSTOMER NAME'] || attrs['CERTIFICATE ISSUED TO'] || attrs['VEHICLE NUMBER'];
      if (!hasCustomer) return;

      const isPaid = amtRec === 'RECEIVED' || amtRec === 'PAID';
      if (isPaid) return; // Skip settled

      const price = parseFloat(attrs['TOTAL COST'] || attrs['Total Cost'] || attrs['COST'] || attrs['Cost'] || 0) || 0;
      if (price <= 0) return;

      const custName = (attrs['CUSTOMER NAME'] || attrs['Customer Name'] || attrs['CERTIFICATE ISSUED TO'] || 'Valued Customer').trim();
      const custPhone = (attrs['CUSTOMER PHONE NUMBER'] || attrs['Customer Contact'] || '').trim();
      const key = custPhone || custName;

      const dateObj = parseDate(attrs['CERTIFICATE ISSUED DATE'] || attrs['STOCK PLACE DATE'] || d.purchase_date);
      const days = dateObj ? Math.max(0, Math.floor((today - dateObj) / (1000 * 60 * 60 * 24))) : 0;
      const vNum = attrs['VEHICLE NUMBER'] || attrs['Vehicle Number'] || '—';

      if (!pendingMap[key]) {
        pendingMap[key] = {
          customer_name: custName,
          phone: custPhone,
          vehicles: [],
          total_pending_amount: 0,
          oldest_due_days: 0,
          latest_install_date: attrs['CERTIFICATE ISSUED DATE'] || d.purchase_date,
          imeis: [],
          items_count: 0
        };
      }

      const p = pendingMap[key];
      p.total_pending_amount += price;
      p.items_count += 1;
      if (vNum && vNum !== '—' && !p.vehicles.includes(vNum)) {
        p.vehicles.push(vNum);
      }
      if (d.imei_number) p.imeis.push(d.imei_number);
      if (days > p.oldest_due_days) p.oldest_due_days = days;
    });

    let totalReceivable = 0;
    let totalBucket0_15 = 0;
    let totalBucket16_30 = 0;
    let totalBucket30Plus = 0;

    const debtors = Object.values(pendingMap).map(d => {
      totalReceivable += d.total_pending_amount;

      let bucket = '0_15';
      if (d.oldest_due_days > 30) {
        bucket = '30_PLUS';
        totalBucket30Plus += d.total_pending_amount;
      } else if (d.oldest_due_days >= 16) {
        bucket = '16_30';
        totalBucket16_30 += d.total_pending_amount;
      } else {
        totalBucket0_15 += d.total_pending_amount;
      }

      return {
        ...d,
        aging_bucket: bucket
      };
    }).sort((a, b) => b.total_pending_amount - a.total_pending_amount);

    res.json({
      success: true,
      summary: {
        total_receivable: totalReceivable,
        debtor_count: debtors.length,
        bucket_0_15: totalBucket0_15,
        bucket_16_30: totalBucket16_30,
        bucket_30_plus: totalBucket30Plus
      },
      debtors
    });
  } catch (err) {
    console.error('Error fetching aging balances:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
