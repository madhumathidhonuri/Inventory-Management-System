const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/users - List users with roles, column permissions, and fitment targets
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
      let targets = {};
      try {
        targets = JSON.parse(u.device_targets || '{}');
      } catch {
        targets = {};
      }
      return {
        ...u,
        monthly_target: u.monthly_target || 50,
        device_targets: targets,
        allowed_columns: allowed
      };
    });
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users - Create new user with custom column edit permissions & monthly targets
router.post('/', (req, res) => {
  const { name, phone, email, password, role, region, allowed_columns, monthly_target, device_targets } = req.body;
  if (!name || !role) {
    return res.status(400).json({ success: false, error: 'Name and role are required' });
  }
  try {
    const colsJson = Array.isArray(allowed_columns) ? JSON.stringify(allowed_columns) : (allowed_columns || '[]');
    const devTargetsJson = typeof device_targets === 'object' && device_targets !== null ? JSON.stringify(device_targets) : (device_targets || '{}');
    const userPhone = phone || `USR-${Date.now()}`;
    const userEmail = email || `${name.toLowerCase().replace(/\s+/g, '')}@fueltracks.in`;
    const userPass = password || '123456';
    const targetNum = Number(monthly_target) || 50;

    const stmt = db.prepare(`
      INSERT INTO users (name, phone, email, password, role, region, allowed_columns, monthly_target, device_targets)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, userPhone, userEmail, userPass, role, region || 'All India', colsJson, targetNum, devTargetsJson);
    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    let allowed = [];
    try { allowed = JSON.parse(created.allowed_columns || '[]'); } catch { }
    let targets = {};
    try { targets = JSON.parse(created.device_targets || '{}'); } catch { }
    res.json({ success: true, data: { ...created, allowed_columns: allowed, device_targets: targets } });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/users/:id - Update user, password, role, column permissions, and fitment targets
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone, email, password, role, region, active, allowed_columns, monthly_target, device_targets } = req.body;
  try {
    const colsJson = allowed_columns !== undefined
      ? (Array.isArray(allowed_columns) ? JSON.stringify(allowed_columns) : String(allowed_columns))
      : undefined;
    const devTargetsJson = device_targets !== undefined
      ? (typeof device_targets === 'object' && device_targets !== null ? JSON.stringify(device_targets) : String(device_targets))
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
          allowed_columns = COALESCE(?, allowed_columns),
          monthly_target = COALESCE(?, monthly_target),
          device_targets = COALESCE(?, device_targets)
      WHERE id = ?
    `);
    stmt.run(name, phone, email, password, role, region, active, colsJson, monthly_target, devTargetsJson, id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    let allowed = [];
    try { allowed = JSON.parse(updated.allowed_columns || '[]'); } catch { }
    let targets = {};
    try { targets = JSON.parse(updated.device_targets || '{}'); } catch { }
    res.json({ success: true, data: { ...updated, allowed_columns: allowed, device_targets: targets } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/users/target - Super Admin updates monthly fitment target for a dealer (by ID or Name)
router.patch('/target', (req, res) => {
  const { id, dealer_name, monthly_target, device_targets } = req.body;
  const targetNum = Number(monthly_target);
  if (isNaN(targetNum) || targetNum < 1) {
    return res.status(400).json({ success: false, error: 'Valid monthly_target is required' });
  }
  const devTargetsJson = typeof device_targets === 'object' && device_targets !== null ? JSON.stringify(device_targets) : undefined;
  try {
    let userRecord = null;
    if (id) {
      if (devTargetsJson !== undefined) {
        db.prepare('UPDATE users SET monthly_target = ?, device_targets = ? WHERE id = ?').run(targetNum, devTargetsJson, id);
      } else {
        db.prepare('UPDATE users SET monthly_target = ? WHERE id = ?').run(targetNum, id);
      }
      userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    } else if (dealer_name) {
      // Find matching user by name or partial name
      const cleanName = dealer_name.replace(/\s*\(.*?\)/, '').trim().toLowerCase();
      const allUsers = db.prepare('SELECT * FROM users').all();
      const existing = allUsers.find(u =>
        (u.name && u.name.toLowerCase().includes(cleanName)) ||
        dealer_name.toLowerCase().includes((u.name || '').toLowerCase())
      );

      if (existing) {
        if (devTargetsJson !== undefined) {
          db.prepare('UPDATE users SET monthly_target = ?, device_targets = ? WHERE id = ?').run(targetNum, devTargetsJson, existing.id);
        } else {
          db.prepare('UPDATE users SET monthly_target = ? WHERE id = ?').run(targetNum, existing.id);
        }
        userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
      } else {
        // If dealer doesn't exist as user yet, create user record with role DEALER
        const insertStmt = db.prepare(`
          INSERT INTO users (name, phone, role, monthly_target, device_targets)
          VALUES (?, ?, 'DEALER', ?, ?)
        `);
        const info = insertStmt.run(dealer_name, `DLR-${Date.now()}`, targetNum, devTargetsJson || '{}');
        userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      }
    } else {
      return res.status(400).json({ success: false, error: 'User ID or dealer_name is required' });
    }

    let parsedTargets = {};
    try { parsedTargets = JSON.parse(userRecord.device_targets || '{}'); } catch { }

    res.json({
      success: true,
      message: `Monthly fitment target updated to ${targetNum}`,
      data: { ...userRecord, device_targets: parsedTargets }
    });
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
