const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/users - List users with roles
router.get('/', (req, res) => {
  try {
    const users = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users - Create new user
router.post('/', (req, res) => {
  const { name, phone, email, role, region } = req.body;
  if (!name || !phone || !role) {
    return res.status(400).json({ success: false, error: 'Name, phone, and role are required' });
  }
  try {
    const stmt = db.prepare(`
      INSERT INTO users (name, phone, email, role, region)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, phone, email || null, role, region || 'All India');
    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/users/:id - Update user or reassign role
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone, email, role, region, active } = req.body;
  try {
    const stmt = db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          role = COALESCE(?, role),
          region = COALESCE(?, region),
          active = COALESCE(?, active)
      WHERE id = ?
    `);
    stmt.run(name, phone, email, role, region, active, id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
