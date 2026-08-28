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
      const isDealer = u.role === 'DEALER';
      return {
        ...u,
        monthly_target: isDealer ? (Number(u.monthly_target) || 0) : null,
        device_targets: isDealer ? targets : {},
        allowed_columns: allowed
      };
    });
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users - Create new user with custom column edit permissions & monthly targets (Dealers only)
router.post('/', (req, res) => {
  const { name, phone, email, password, role, region, allowed_columns, monthly_target, device_targets } = req.body;
  if (!name || !role) {
    return res.status(400).json({ success: false, error: 'Name and role are required' });
  }
  try {
    const isDealer = role === 'DEALER';
    const colsJson = Array.isArray(allowed_columns) ? JSON.stringify(allowed_columns) : (allowed_columns || '[]');
    const devTargetsJson = isDealer && typeof device_targets === 'object' && device_targets !== null ? JSON.stringify(device_targets) : '{}';
    const userPhone = phone || `USR-${Date.now()}`;
    const userEmail = email || `${name.toLowerCase().replace(/\s+/g, '')}@fueltracks.in`;
    const userPass = password || '123456';
    const targetNum = isDealer && monthly_target !== undefined && monthly_target !== '' && !isNaN(Number(monthly_target)) ? Number(monthly_target) : null;

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
    res.json({
      success: true,
      data: {
        ...created,
        monthly_target: isDealer ? (Number(created.monthly_target) || 0) : null,
        allowed_columns: allowed,
        device_targets: isDealer ? targets : {}
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/users/:id - Update user, password, role, column permissions, and fitment targets
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone, email, password, role, region, active, allowed_columns, monthly_target, device_targets } = req.body;
  try {
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!current) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const nextRole = role || current.role;
    const isDealer = nextRole === 'DEALER';

    const colsJson = allowed_columns !== undefined
      ? (Array.isArray(allowed_columns) ? JSON.stringify(allowed_columns) : String(allowed_columns))
      : undefined;
    
    let devTargetsJson = undefined;
    let targetNum = undefined;

    if (!isDealer) {
      targetNum = null;
      devTargetsJson = '{}';
    } else {
      if (monthly_target !== undefined) {
        targetNum = monthly_target !== '' && !isNaN(Number(monthly_target)) ? Number(monthly_target) : 0;
      }
      if (device_targets !== undefined) {
        devTargetsJson = typeof device_targets === 'object' && device_targets !== null ? JSON.stringify(device_targets) : String(device_targets);
      }
    }

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
          monthly_target = CASE WHEN ? = 'DEALER' THEN ? ELSE NULL END,
          device_targets = CASE WHEN ? = 'DEALER' THEN COALESCE(?, device_targets) ELSE '{}' END
      WHERE id = ?
    `);
    stmt.run(
      name, phone, email, password, role, region, active, colsJson,
      nextRole, targetNum !== undefined ? targetNum : current.monthly_target,
      nextRole, devTargetsJson,
      id
    );
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    let allowed = [];
    try { allowed = JSON.parse(updated.allowed_columns || '[]'); } catch { }
    let targets = {};
    try { targets = JSON.parse(updated.device_targets || '{}'); } catch { }
    res.json({
      success: true,
      data: {
        ...updated,
        monthly_target: isDealer ? (Number(updated.monthly_target) || 0) : null,
        allowed_columns: allowed,
        device_targets: isDealer ? targets : {}
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/users/target - Super Admin updates monthly fitment target for a dealer (by ID or Name)
router.patch('/target', (req, res) => {
  const { id, dealer_name, monthly_target, device_targets } = req.body;
  const targetNum = Number(monthly_target);
  if (isNaN(targetNum) || targetNum < 0) {
    return res.status(400).json({ success: false, error: 'Valid monthly_target is required' });
  }
  const devTargetsJson = typeof device_targets === 'object' && device_targets !== null ? JSON.stringify(device_targets) : undefined;
  try {
    let userRecord = null;
    if (id) {
      db.prepare('UPDATE users SET monthly_target = ?, device_targets = COALESCE(?, device_targets) WHERE id = ? AND role = "DEALER"').run(targetNum, devTargetsJson, id);
      userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    } else if (dealer_name) {
      const cleanName = dealer_name.replace(/\s*\(.*?\)/, '').trim().toLowerCase();
      const allUsers = db.prepare('SELECT * FROM users WHERE role = "DEALER"').all();
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
        const insertStmt = db.prepare(`
          INSERT INTO users (name, phone, role, monthly_target, device_targets)
          VALUES (?, ?, 'DEALER', ?, ?)
        `);
        const info = insertStmt.run(dealer_name, `DLR-${Date.now()}`, targetNum, devTargetsJson || '{}');
        userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      }
    }
 else {
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
