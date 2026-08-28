const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('../db/database');

const upload = multer({ storage: multer.memoryStorage() });

// POST /api/purchase-batches/preview - Upload & parse Excel/CSV file before confirming
router.post('/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    if (rawData.length === 0) {
      return res.status(400).json({ success: false, error: 'Uploaded sheet is empty' });
    }

    // Determine the exact range and full list of columns in positional order
    const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    const headers = [];
    let emptyIdx = 0;

    // Scan the first row cell-by-cell up to the maximum column index
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
      const cell = worksheet[cellAddress];
      const val = cell && cell.v !== undefined && cell.v !== null ? String(cell.v).trim() : '';
      if (val) {
        headers.push(val);
      } else {
        const emptyKey = emptyIdx === 0 ? '__EMPTY' : `__EMPTY_${emptyIdx}`;
        headers.push(emptyKey);
        emptyIdx++;
      }
    }

    const rowObjects = xlsx.utils.sheet_to_json(worksheet);


    // 1. Scan rows & headers to find IMEI, SIM, and Price columns intelligently
    let detectedImeiCol = '';
    let detectedSimCol = '';
    let detectedPriceCol = '';
    const numRowsToCheck = Math.min(rawData.length, 15);
    const imeiCounts = {};
    const simCounts = {};
    
    for (let r = 1; r < numRowsToCheck; r++) {
      const row = rawData[r];
      if (Array.isArray(row)) {
        row.forEach((cell, colIdx) => {
          const val = String(cell || '').trim();
          if (/^\d{14,16}$/.test(val)) {
            imeiCounts[colIdx] = (imeiCounts[colIdx] || 0) + 1;
          }
          if (/^\d{10,22}$/.test(val) && !/^\d{15}$/.test(val)) {
            simCounts[colIdx] = (simCounts[colIdx] || 0) + 1;
          }
        });
      }
    }
    
    let bestImeiColIdx = -1;
    let maxImeiCount = 0;
    Object.keys(imeiCounts).forEach(colIdx => {
      if (imeiCounts[colIdx] > maxImeiCount) {
        maxImeiCount = imeiCounts[colIdx];
        bestImeiColIdx = parseInt(colIdx);
      }
    });
    
    if (bestImeiColIdx !== -1 && headers[bestImeiColIdx]) {
      detectedImeiCol = headers[bestImeiColIdx];
    } else {
      detectedImeiCol = headers.find(h => /imei|device.*id|serial|vltd/i.test(h)) || headers[0] || '';
    }

    // Auto-detect SIM column
    let bestSimColIdx = -1;
    let maxSimCount = 0;
    Object.keys(simCounts).forEach(colIdx => {
      if (parseInt(colIdx) !== bestImeiColIdx && simCounts[colIdx] > maxSimCount) {
        maxSimCount = simCounts[colIdx];
        bestSimColIdx = parseInt(colIdx);
      }
    });

    if (bestSimColIdx !== -1 && headers[bestSimColIdx]) {
      detectedSimCol = headers[bestSimColIdx];
    } else {
      detectedSimCol = headers.find(h => /sim|iccid|mobile|contact/i.test(h) && !/imei/i.test(h)) || '';
    }

    // Auto-detect Price column
    detectedPriceCol = headers.find(h => /^cost$|price|rate|amount|purchase.*price/i.test(h)) || '';

    let autoMapping = {
      imei: detectedImeiCol,
      sim: detectedSimCol,
      price: detectedPriceCol
    };

    // Pre-check for duplicate IMEIs in current DB
    const existingImeis = new Set(
      db.prepare('SELECT imei_number FROM devices').all().map(d => d.imei_number)
    );

    const rowsWithValidation = rowObjects.map((row, index) => {
      const imeiVal = String(row[autoMapping.imei] || '').trim();
      const simVal = autoMapping.sim ? String(row[autoMapping.sim] || '').trim() : '';

      const errors = [];
      const isExisting = Boolean(imeiVal && existingImeis.has(imeiVal));

      if (!imeiVal) {
        errors.push('Missing IMEI');
      }

      return {
        row_number: index + 2, // 1-indexed header is line 1
        raw: row,
        detected_imei: imeiVal,
        detected_sim: simVal,
        detected_price: autoMapping.price ? row[autoMapping.price] : null,
        is_existing: isExisting,
        valid: errors.length === 0,
        errors
      };
    });

    const totalRows = rowsWithValidation.length;
    const validRows = rowsWithValidation.filter(r => r.valid).length;
    const existingRows = rowsWithValidation.filter(r => r.valid && r.is_existing).length;
    const newRows = rowsWithValidation.filter(r => r.valid && !r.is_existing).length;
    const invalidRows = totalRows - validRows;

    res.json({
      success: true,
      filename: req.file.originalname,
      headers,
      autoMapping,
      totalRows,
      validRows,
      newRows,
      existingRows,
      invalidRows,
      previewRows: rowsWithValidation
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/purchase-batches/confirm - Execute bulk insertion & updates of purchase batch & devices
router.post('/confirm', (req, res) => {
  const {
    uploaded_by,
    vendor_name,
    device_type_id,
    new_device_type_name,
    purchase_date,
    source_file,
    notes,
    headers, // Array of column headers in exact uploaded Excel order
    update_existing = true, // Default to true (Upsert Mode)
    items // Array of { imei, sim, price, additional_attributes }
  } = req.body;

  const vendor = (vendor_name && vendor_name.trim()) ? vendor_name.trim() : 'FuelTracks Vendor';

  if ((!device_type_id && !new_device_type_name) || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Device type (ID or Name) and at least 1 device item are required' });
  }

  try {
    const transaction = db.transaction(() => {
      let targetDeviceTypeId = device_type_id;

      // Check or create device type if new_device_type_name is provided
      if (new_device_type_name && new_device_type_name.trim()) {
        const typeName = new_device_type_name.trim();
        const existingType = db.prepare('SELECT id FROM device_types WHERE LOWER(name) = LOWER(?)').get(typeName);
        if (existingType) {
          targetDeviceTypeId = existingType.id;
        } else {
          const insertTypeStmt = db.prepare('INSERT INTO device_types (name, category, custom_fields, template_columns) VALUES (?, ?, ?, ?)');
          const typeRes = insertTypeStmt.run(typeName, 'GPS Tracker', '[]', '[]');
          targetDeviceTypeId = typeRes.lastInsertRowid;
        }
      }

      // Preserve exact uploaded Excel columns in their exact sequence
      let orderedHeaders = [];
      const seen = new Set();
      if (Array.isArray(headers) && headers.length > 0) {
        headers.forEach(h => {
          const trimmed = String(h || '').trim();
          if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            orderedHeaders.push(trimmed);
          }
        });
      } else {
        for (const item of items) {
          if (item.additional_attributes) {
            Object.keys(item.additional_attributes).forEach(k => {
              if (k && k !== 'original_row' && !seen.has(k)) {
                seen.add(k);
                orderedHeaders.push(k);
              }
            });
          }
        }
      }

      // Update device_types custom_fields and template_columns with exact ordered column list
      db.prepare('UPDATE device_types SET custom_fields = ?, template_columns = ? WHERE id = ?').run(
        JSON.stringify(orderedHeaders),
        JSON.stringify(orderedHeaders),
        targetDeviceTypeId
      );

      // 1. Create Purchase Batch
      const batchResult = db.prepare(`
        INSERT INTO purchase_batches (upload_date, uploaded_by, vendor_name, device_type_id, total_devices_count, source_file, notes)
        VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)
      `).run(uploaded_by || 'Warehouse Admin', vendor, targetDeviceTypeId, items.length, source_file || 'manual_upload.xlsx', notes || '');

      const batchId = batchResult.lastInsertRowid;

      const getExistingDeviceStmt = db.prepare('SELECT id, additional_attributes, current_status, current_holder_name FROM devices WHERE imei_number = ?');

      const insertDeviceStmt = db.prepare(`
        INSERT INTO devices (imei_number, sim_number, device_type_id, purchase_batch_id, purchase_date, purchase_price, vendor_name, current_status, current_holder_type, current_holder_id, current_holder_name, additional_attributes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'IN_WAREHOUSE', 'WAREHOUSE', 1, 'Central Warehouse', ?)
      `);

      const updateDeviceStmt = db.prepare(`
        UPDATE devices
        SET sim_number = COALESCE(?, sim_number),
            purchase_price = COALESCE(?, purchase_price),
            additional_attributes = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `);

      const insertHistoryStmt = db.prepare(`
        INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
        VALUES (?, ?, ?, datetime('now'), NULL, ?, ?, ?)
      `);

      const createdDevices = [];
      const updatedDevices = [];
      const skippedItems = [];

      for (const item of items) {
        const imei = String(item.imei || '').trim();
        if (!imei) continue;

        try {
          const extraAttrs = { ...(item.additional_attributes || {}) };
          // Auto-normalize any Excel serial date numbers to readable DD-MM-YYYY format
          Object.keys(extraAttrs).forEach(k => {
            if (/date|month|validity/i.test(k) && extraAttrs[k] !== undefined && extraAttrs[k] !== null) {
              const val = extraAttrs[k];
              const num = Number(val);
              if (!isNaN(num) && num > 30000 && num < 65000) {
                try {
                  const d = new Date(Math.round((num - 25569) * 86400 * 1000));
                  let day = d.getUTCDate();
                  let month = d.getUTCMonth() + 1;
                  const year = d.getUTCFullYear();
                  extraAttrs[k] = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
                } catch {}
              }
            }
          });

          const existingDev = getExistingDeviceStmt.get(imei);

          if (existingDev) {
            if (update_existing) {
              // Merge existing attributes with newly uploaded spreadsheet attributes
              let oldAttrs = {};
              try { oldAttrs = JSON.parse(existingDev.additional_attributes || '{}'); } catch {}
              const mergedAttrs = { ...oldAttrs, ...extraAttrs };

              updateDeviceStmt.run(
                item.sim || null,
                item.price ? parseFloat(item.price) : null,
                JSON.stringify(mergedAttrs),
                existingDev.id
              );

              insertHistoryStmt.run(
                existingDev.id,
                imei,
                'STATUS_CHANGED',
                existingDev.current_holder_name || 'Central Warehouse',
                uploaded_by || 'Warehouse Admin',
                `Updated attributes via Excel Upload (Batch #${batchId})`
              );

              updatedDevices.push({ id: existingDev.id, imei });
            } else {
              skippedItems.push({ imei, reason: 'Already exists in database' });
            }
          } else {
            // New Device Insert
            const result = insertDeviceStmt.run(
              imei,
              item.sim || null,
              targetDeviceTypeId,
              batchId,
              purchase_date || new Date().toISOString().split('T')[0],
              item.price ? parseFloat(item.price) : null,
              vendor,
              JSON.stringify(extraAttrs)
            );

            const devId = result.lastInsertRowid;
            insertHistoryStmt.run(
              devId,
              imei,
              'PURCHASED',
              'Central Warehouse',
              uploaded_by || 'Warehouse Admin',
              `Purchased from ${vendor} (Batch #${batchId})`
            );

            createdDevices.push({ id: devId, imei });
          }
        } catch (err) {
          skippedItems.push({ imei, reason: err.message });
        }
      }

      return {
        batchId,
        deviceTypeId: targetDeviceTypeId,
        totalCount: createdDevices.length + updatedDevices.length,
        createdCount: createdDevices.length,
        updatedCount: updatedDevices.length,
        skippedCount: skippedItems.length,
        skippedItems
      };
    });

    const result = transaction();

    // Auto-sync instantly to Supabase Cloud Storage (No manual click needed)
    try {
      const cloudSync = require('../db/cloudSync');
      cloudSync.triggerDebouncedSync(1000);
    } catch (e) {}

    res.json({
      success: true,
      data: result
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/purchase-batches - List past upload batches
router.get('/', (req, res) => {
  try {
    const batches = db.prepare(`
      SELECT pb.*, dt.name as device_type_name, dt.category as device_type_category,
             (SELECT COUNT(*) FROM devices d WHERE d.purchase_batch_id = pb.id) as live_devices_count
      FROM purchase_batches pb
      JOIN device_types dt ON pb.device_type_id = dt.id
      WHERE (SELECT COUNT(*) FROM devices d WHERE d.purchase_batch_id = pb.id) > 0
      ORDER BY pb.upload_date DESC
    `).all();

    res.json({ success: true, data: batches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/purchase-batches/:id - Delete an entire purchase batch/upload list and all its devices
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const batch = db.prepare('SELECT * FROM purchase_batches WHERE id = ?').get(id);
    if (!batch) {
      return res.status(404).json({ success: false, error: 'Upload list / purchase batch not found' });
    }

    const transaction = db.transaction(() => {
      const devs = db.prepare('SELECT id, imei_number FROM devices WHERE purchase_batch_id = ?').all(id);
      for (const dev of devs) {
        db.prepare('DELETE FROM device_history WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
        db.prepare('DELETE FROM dispatch_items WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
        db.prepare('DELETE FROM installations WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
        db.prepare('DELETE FROM reminders WHERE device_id = ? OR imei_number = ?').run(dev.id, dev.imei_number);
      }
      db.prepare('DELETE FROM devices WHERE purchase_batch_id = ?').run(id);
      db.prepare('DELETE FROM purchase_batches WHERE id = ?').run(id);
      return devs.length;
    });

    const deletedCount = transaction();
    res.json({
      success: true,
      count: deletedCount,
      message: `Successfully deleted upload list '${batch.source_file || batch.notes || id}' and ${deletedCount} device(s)`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
