const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/users - List users with roles and column permissions
router.get('/', (req, res) => {
  try {
    const users = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
    const formatted = users.map(u => {
      let allowed = [];
      try {
        allowed = JSON.parse(u.allowed_columns || '[]');
      } catch {
        allowed = [];
      }
      return {
        ...u,
        allowed_columns: allowed
      };
    });
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users - Create new user with custom column edit permissions
router.post('/', (req, res) => {
  const { name, phone, email, password, role, region, allowed_columns } = req.body;
  if (!name || !role) {
    return res.status(400).json({ success: false, error: 'Name and role are required' });
  }
  try {
    const colsJson = Array.isArray(allowed_columns) ? JSON.stringify(allowed_columns) : (allowed_columns || '[]');
    const userPhone = phone || `USR-${Date.now()}`;
    const userEmail = email || `${name.toLowerCase().replace(/\s+/g, '')}@fueltracks.in`;
    const userPass = password || '123456';

    const stmt = db.prepare(`
      INSERT INTO users (name, phone, email, password, role, region, allowed_columns)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, userPhone, userEmail, userPass, role, region || 'All India', colsJson);
    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    let allowed = [];
    try { allowed = JSON.parse(created.allowed_columns || '[]'); } catch {}
    res.json({ success: true, data: { ...created, allowed_columns: allowed } });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/users/:id - Update user, password, role, or column permissions
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone, email, password, role, region, active, allowed_columns } = req.body;
  try {
    const colsJson = allowed_columns !== undefined
      ? (Array.isArray(allowed_columns) ? JSON.stringify(allowed_columns) : String(allowed_columns))
      : undefined;

    const stmt = db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          password = COALESCE(?, password),
          role = COALESCE(?, role),
          region = COALESCE(?, region),
          active = COALESCE(?, active),
          allowed_columns = COALESCE(?, allowed_columns)
      WHERE id = ?
    `);
    stmt.run(name, phone, email, password, role, region, active, colsJson, id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    let allowed = [];
    try { allowed = JSON.parse(updated.allowed_columns || '[]'); } catch {}
    res.json({ success: true, data: { ...updated, allowed_columns: allowed } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/users/:id - Remove or revoke user access
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
