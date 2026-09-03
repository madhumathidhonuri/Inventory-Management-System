const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/device-pricing - List all pricing rules with device type details
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        dp.*,
        dt.name as device_type_name,
        dt.category as device_type_category
      FROM device_pricing dp
      JOIN device_types dt ON dp.device_type_id = dt.id
      ORDER BY dt.name ASC, dp.project_category ASC
    `).all();

    // Also get all device types that don't have pricing yet
    const deviceTypes = db.prepare('SELECT id, name, category FROM device_types WHERE active = 1 ORDER BY name ASC').all();

    res.json({
      success: true,
      data: rows,
      deviceTypes
    });
  } catch (err) {
    console.error('[DevicePricing] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/device-pricing/upsert - Create or update pricing entry
router.post('/upsert', (req, res) => {
  try {
    const {
      device_type_id,
      project_category = 'GENERAL',
      purchase_cost = 0,
      dealer_price = 0,
      retail_price = 0,
      min_price = 0
    } = req.body;

    if (!device_type_id) {
      return res.status(400).json({ success: false, error: 'device_type_id is required' });
    }

    const pCost = parseFloat(purchase_cost) || 0;
    const dPrice = parseFloat(dealer_price) || 0;
    const rPrice = parseFloat(retail_price) || 0;
    const mPrice = parseFloat(min_price) || 0;

    const stmt = db.prepare(`
      INSERT INTO device_pricing (
        device_type_id, project_category, purchase_cost, dealer_price, retail_price, min_price, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(device_type_id, project_category) DO UPDATE SET
        purchase_cost = excluded.purchase_cost,
        dealer_price = excluded.dealer_price,
        retail_price = excluded.retail_price,
        min_price = excluded.min_price,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(device_type_id, project_category, pCost, dPrice, rPrice, mPrice);

    const record = db.prepare(`
      SELECT 
        dp.*,
        dt.name as device_type_name,
        dt.category as device_type_category
      FROM device_pricing dp
      JOIN device_types dt ON dp.device_type_id = dt.id
      WHERE dp.device_type_id = ? AND dp.project_category = ?
    `).get(device_type_id, project_category);

    if (db.triggerCloudSync) db.triggerCloudSync(3000);

    res.json({
      success: true,
      message: 'Rate card updated successfully',
      data: record
    });
  } catch (err) {
    console.error('[DevicePricing] Upsert error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/device-pricing/lookup - Lookup suggested prices for a given device type & project category
router.get('/lookup', (req, res) => {
  try {
    const { device_type_id, project_category = 'GENERAL' } = req.query;

    if (!device_type_id) {
      return res.status(400).json({ success: false, error: 'device_type_id is required' });
    }

    // First try exact category match
    let price = db.prepare(`
      SELECT * FROM device_pricing 
      WHERE device_type_id = ? AND project_category = ?
    `).get(device_type_id, project_category);

    // Fallback to 'GENERAL' category if specific category not set
    if (!price && project_category !== 'GENERAL') {
      price = db.prepare(`
        SELECT * FROM device_pricing 
        WHERE device_type_id = ? AND project_category = 'GENERAL'
      `).get(device_type_id);
    }

    res.json({
      success: true,
      data: price || {
        purchase_cost: 0,
        dealer_price: 0,
        retail_price: 0,
        min_price: 0
      }
    });
  } catch (err) {
    console.error('[DevicePricing] Lookup error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/device-pricing/:id - Delete a rate card entry
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM device_pricing WHERE id = ?').run(id);

    if (db.triggerCloudSync) db.triggerCloudSync(3000);

    res.json({ success: true, message: 'Pricing record deleted' });
  } catch (err) {
    console.error('[DevicePricing] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
