const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db/database');

// Trigger on-demand backup snapshot
router.post('/create', async (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `inventory_backup_manual_${timestamp}.db`;
    if (db.createBackup) {
      await db.createBackup(filename);
      return res.json({ success: true, message: `Backup created successfully as ${filename}`, filename });
    }
    res.status(500).json({ success: false, error: 'Backup function not initialized' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List all available backups
router.get('/list', (req, res) => {
  try {
    const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../../data');
    const backupDir = path.join(dataDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      return res.json({ success: true, data: [] });
    }
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const stats = fs.statSync(path.join(backupDir, f));
        return {
          filename: f,
          sizeBytes: stats.size,
          sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
          createdAt: stats.birthtime || stats.mtime
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download live database snapshot directly (flushes WAL first)
router.get('/download-live', async (req, res) => {
  try {
    if (db.flushAndCheckpoint) {
      db.flushAndCheckpoint();
    }
    const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../../data');
    const dbPath = path.join(dataDir, 'inventory.db');
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ success: false, error: 'Database file not found' });
    }
    const downloadName = `inventory_live_backup_${new Date().toISOString().split('T')[0]}.db`;
    res.download(dbPath, downloadName);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
