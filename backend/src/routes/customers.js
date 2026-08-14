const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/customers - List all customers with fleet vehicle count
router.get('/', (req, res) => {
  try {
    const { search, phone } = req.query;
    let query = `
      SELECT c.*, COUNT(i.id) as vehicle_count
      FROM customers c
      LEFT JOIN installations i ON c.id = i.customer_id
      WHERE 1=1
    `;
    const params = [];

    if (phone) {
      query += ` AND c.phone_number = ?`;
      params.push(phone);
    } else if (search) {
      query += ` AND (c.name LIKE ? OR c.phone_number LIKE ? OR c.email LIKE ? OR c.address LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
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
      SELECT i.*, d.sim_number, d.current_status, dt.name as device_type_name
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

module.exports = router;
