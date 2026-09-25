const db = require('../db/database');

/**
 * Google Sheets Auto-Sync Service
 * Syncs device additions, stock place movements, fitments, and payments live to Google Sheets
 * with EXACT per-brand columns (e.g. all 35+ columns for VAMO, 37+ for VOLTY, 35+ for TRACKNOW, etc.)
 */

/**
 * Check if Google Sheets webhook is configured
 */
function isConfigured() {
  return Boolean(process.env.GOOGLE_SHEET_WEBHOOK_URL && process.env.GOOGLE_SHEET_WEBHOOK_URL.startsWith('http'));
}

/**
 * Get ordered column headers for a specific brand / tab
 */
function getTabHeaders(brandName) {
  const targetBrand = (brandName || 'GENERAL').toUpperCase().trim();
  const headerList = [];
  const seen = new Set();

  function addHeader(h) {
    if (!h || typeof h !== 'string') return;
    const clean = h.trim();
    if (!clean || clean.startsWith('__empty') || clean === 'original_row' || clean === '_1' || clean === '_2') return;
    
    // Normalize initial IMEI column names
    const normalized = (clean.toLowerCase() === 'imeino' || clean.toLowerCase() === 'imei_number') ? 'IMEI' : clean;
    const key = normalized.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      headerList.push(normalized);
    }
  }

  try {
    const dt = db.prepare(`
      SELECT custom_fields, template_columns
      FROM device_types
      WHERE UPPER(TRIM(name)) = ?
    `).get(targetBrand);

    if (dt) {
      try {
        const tCols = JSON.parse(dt.template_columns || '[]');
        if (Array.isArray(tCols) && tCols.length > 0) {
          tCols.forEach(c => addHeader(c));
        }
      } catch {}

      try {
        const cFields = JSON.parse(dt.custom_fields || '[]');
        if (Array.isArray(cFields) && cFields.length > 0) {
          cFields.forEach(f => addHeader(f));
        }
      } catch {}
    }

    // Ensure IMEI exists as the first column if not already present
    if (!seen.has('IMEI')) {
      headerList.unshift('IMEI');
      seen.add('IMEI');
    }

    // Scan sample devices for any extra custom fields
    const rows = db.prepare(`
      SELECT d.additional_attributes
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE UPPER(TRIM(dt.name)) = ?
      ORDER BY d.id DESC
      LIMIT 100
    `).all(targetBrand);

    rows.forEach(r => {
      try {
        const attrs = typeof r.additional_attributes === 'object' 
          ? r.additional_attributes 
          : JSON.parse(r.additional_attributes || '{}');
        Object.keys(attrs).forEach(k => addHeader(k));
      } catch {}
    });
  } catch (e) {
    console.warn('[GoogleSheetSync] Error fetching tab headers:', e.message);
  }

  return headerList;
}

/**
 * Format a device into an exact array corresponding to the tab headers
 */
function formatRowForTab(dev, headers) {
  let attrs = {};
  try {
    attrs = typeof dev.additional_attributes === 'object' 
      ? dev.additional_attributes 
      : JSON.parse(dev.additional_attributes || '{}');
  } catch {
    attrs = {};
  }

  // Normalized key map for case-insensitive and variation lookups
  const normalizedAttrs = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k) normalizedAttrs[k.toUpperCase().trim()] = v;
  }

  return headers.map(h => {
    const hTrim = h.trim();
    const hUpper = hTrim.toUpperCase();

    // 1. Direct attribute match if non-empty
    if (attrs[hTrim] !== undefined && attrs[hTrim] !== null && String(attrs[hTrim]).trim() !== '') {
      const sVal = String(attrs[hTrim]).trim();
      if (/^\d{10,}$/.test(sVal)) return "'" + sVal;
      return sVal;
    }

    // 2. Normalized attribute match if non-empty
    if (normalizedAttrs[hUpper] !== undefined && normalizedAttrs[hUpper] !== null && String(normalizedAttrs[hUpper]).trim() !== '') {
      const sVal = String(normalizedAttrs[hUpper]).trim();
      if (/^\d{10,}$/.test(sVal)) return "'" + sVal;
      return sVal;
    }

    // 3. Fallbacks to top-level database columns
    if (hUpper === 'IMEI' || hUpper === 'IMEINO' || hUpper === 'IMEI NUMBER' || hUpper === 'DEVICE IMEI') {
      const imei = String(dev.imei_number || dev.imei || '').trim();
      return imei ? "'" + imei : '';
    }
    if (hUpper === 'STOCK PLACE' || hUpper === 'CURRENT HOLDER' || hUpper === 'HOLDER') {
      return dev.current_holder_name || dev.stock_place || attrs['STOCK PLACE'] || 'Central Warehouse';
    }
    if (hUpper === 'STOCK PLACE DATE') {
      return attrs['STOCK PLACE DATE'] || (dev.updated_at ? dev.updated_at.split(' ')[0] : '');
    }
    if (hUpper === 'STATUS' || hUpper === 'CURRENT STATUS') {
      return dev.current_status || 'IN_WAREHOUSE';
    }
    if (hUpper === 'SIM NUMBER' || hUpper === 'SIM' || hUpper === 'SIM NO' || hUpper === 'SIMNO1' || hUpper === 'SIM 1') {
      return dev.sim_number ? "'" + dev.sim_number : '';
    }
    if (hUpper === 'SIM OPERATOR' || hUpper === 'OPERATOR' || hUpper === 'CARRIER') {
      return dev.sim_operator || '';
    }
    if (hUpper === 'SIM EXPIRY DATE' || hUpper === 'SIM EXPIRY') {
      return dev.sim_expiry_date || '';
    }
    if (hUpper === 'VENDOR' || hUpper === 'VENDOR NAME') {
      return dev.vendor_name || '';
    }
    if (hUpper === 'PURCHASE PRICE' || hUpper === 'BUYING PRICE' || hUpper === 'PRICE' || hUpper === 'COST') {
      return dev.purchase_price !== null && dev.purchase_price !== undefined ? dev.purchase_price : '';
    }
    if (hUpper === 'PURCHASE DATE') {
      return dev.purchase_date || '';
    }
    if (hUpper === 'RMA STATUS') {
      return dev.rma_status || 'NONE';
    }
    if (hUpper === 'LAST UPDATED') {
      return new Date().toISOString();
    }

    return '';
  });
}

/**
 * Send an event payload to Google Sheets Webhook
 */
async function sendToGoogleSheet(action, data, customTimeout = 60000) {
  const url = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!url || !url.startsWith('http')) {
    return { success: false, reason: 'GOOGLE_SHEET_WEBHOOK_URL not configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), customTimeout);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[GoogleSheetSync] Webhook warning:', res.status, errText.slice(0, 200));
      return { success: false, error: `HTTP ${res.status}: ${errText}` };
    }

    const result = await res.json().catch(() => ({ success: true }));
    return { success: true, result };
  } catch (err) {
    console.warn('[GoogleSheetSync] Sync notice:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Sync a single device mutation (Add, Update, Transfer, Fitment)
 */
function syncDeviceUpdate(deviceIdOrImei) {
  if (!isConfigured()) return;

  setImmediate(async () => {
    try {
      let dev;
      if (typeof deviceIdOrImei === 'number' || (/^\d+$/.test(String(deviceIdOrImei)) && String(deviceIdOrImei).length < 10)) {
        dev = db.prepare(`
          SELECT d.*, dt.name as device_type_name
          FROM devices d
          JOIN device_types dt ON d.device_type_id = dt.id
          WHERE d.id = ?
        `).get(Number(deviceIdOrImei));
      } else {
        dev = db.prepare(`
          SELECT d.*, dt.name as device_type_name
          FROM devices d
          JOIN device_types dt ON d.device_type_id = dt.id
          WHERE d.imei_number = ?
        `).get(String(deviceIdOrImei).trim());
      }

      if (dev) {
        const tabName = (dev.device_type_name || 'GENERAL').toUpperCase().trim();
        const headers = getTabHeaders(tabName);
        const row = formatRowForTab(dev, headers);

        await sendToGoogleSheet('UPSERT_DEVICE_ROW', {
          tab_name: tabName,
          headers,
          row
        });
      }
    } catch (e) {
      console.warn('[GoogleSheetSync] Error syncing single device:', e.message);
    }
  });
}

/**
 * Sync multiple devices in bulk with batched requests
 */
function syncBulkDevices(deviceIdsOrImeis) {
  if (!isConfigured() || !Array.isArray(deviceIdsOrImeis) || deviceIdsOrImeis.length === 0) return;

  setImmediate(async () => {
    try {
      const ids = [];
      const imeis = [];

      for (const item of deviceIdsOrImeis) {
        if (!item) continue;
        if (typeof item === 'number' || (/^\d+$/.test(String(item)) && String(item).length < 10)) {
          ids.push(Number(item));
        } else {
          imeis.push(String(item).trim());
        }
      }

      const devices = [];

      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const rows = db.prepare(`
          SELECT d.*, dt.name as device_type_name 
          FROM devices d 
          JOIN device_types dt ON d.device_type_id = dt.id 
          WHERE d.id IN (${placeholders})
        `).all(...ids);
        devices.push(...rows);
      }

      if (imeis.length > 0) {
        const placeholders = imeis.map(() => '?').join(',');
        const rows = db.prepare(`
          SELECT d.*, dt.name as device_type_name 
          FROM devices d 
          JOIN device_types dt ON d.device_type_id = dt.id 
          WHERE d.imei_number IN (${placeholders})
        `).all(...imeis);
        devices.push(...rows);
      }

      // Deduplicate by device id
      const uniqueDevicesMap = new Map();
      for (const dev of devices) {
        if (!uniqueDevicesMap.has(dev.id)) {
          uniqueDevicesMap.set(dev.id, dev);
        }
      }
      const uniqueDevices = Array.from(uniqueDevicesMap.values());
      if (uniqueDevices.length === 0) return;

      // Group by tab
      const grouped = {};
      for (const d of uniqueDevices) {
        const tabName = (d.device_type_name || 'GENERAL').toUpperCase().trim();
        if (!grouped[tabName]) grouped[tabName] = [];
        grouped[tabName].push(d);
      }

      // Send 1 batch request per tab instead of individual requests
      for (const [tabName, tabDevices] of Object.entries(grouped)) {
        const headers = getTabHeaders(tabName);
        const rows = tabDevices.map(dev => formatRowForTab(dev, headers));

        await sendToGoogleSheet('BULK_UPSERT_ROWS', {
          tab_name: tabName,
          headers,
          rows
        }, 60000);
      }
    } catch (e) {
      console.warn('[GoogleSheetSync] Error syncing bulk devices:', e.message);
    }
  });
}

/**
 * Delete a single device row from Google Sheets
 */
function syncDeviceDelete(imeiNumber, tabName) {
  if (!isConfigured() || !imeiNumber) return;

  setImmediate(async () => {
    try {
      await sendToGoogleSheet('DELETE_DEVICE_ROW', {
        tab_name: tabName ? tabName.toUpperCase().trim() : null,
        imei: String(imeiNumber).trim()
      });
    } catch (e) {
      console.warn('[GoogleSheetSync] Error deleting device row:', e.message);
    }
  });
}

/**
 * Bulk delete device rows from Google Sheets
 */
function syncBulkDelete(imeis, tabName) {
  if (!isConfigured() || !Array.isArray(imeis) || imeis.length === 0) return;

  setImmediate(async () => {
    try {
      const cleanImeis = imeis.map(i => String(i).trim()).filter(Boolean);
      await sendToGoogleSheet('BULK_DELETE_ROWS', {
        tab_name: tabName ? tabName.toUpperCase().trim() : null,
        imeis: cleanImeis
      });
    } catch (e) {
      console.warn('[GoogleSheetSync] Error bulk deleting device rows:', e.message);
    }
  });
}

/**
 * Full master sync of all inventory to Google Sheets with exact brand columns
 */
async function syncFullMasterInventory() {
  if (!isConfigured()) {
    throw new Error('Google Sheets Webhook URL is not configured. Please add GOOGLE_SHEET_WEBHOOK_URL in .env');
  }

  const allDevices = db.prepare(`
    SELECT d.*, dt.name as device_type_name
    FROM devices d
    JOIN device_types dt ON d.device_type_id = dt.id
    ORDER BY d.id ASC
  `).all();

  // Group by brand tab
  const grouped = {};
  for (const d of allDevices) {
    const tabName = (d.device_type_name || 'GENERAL').toUpperCase().trim();
    if (!grouped[tabName]) grouped[tabName] = [];
    grouped[tabName].push(d);
  }

  const tabNames = Object.keys(grouped);
  console.log(`[GoogleSheetSync] Starting full sync of ${allDevices.length} devices across ${tabNames.length} tabs with exact columns...`);

  const results = {};

  for (const tabName of tabNames) {
    const devices = grouped[tabName];
    const headers = getTabHeaders(tabName);
    const rows = devices.map(d => formatRowForTab(d, headers));

    console.log(`[GoogleSheetSync] Syncing tab ${tabName}: ${rows.length} rows, ${headers.length} exact columns...`);

    const res = await sendToGoogleSheet('SYNC_TAB_DATA', {
      tab_name: tabName,
      headers,
      rows
    }, 45000);

    results[tabName] = {
      device_count: rows.length,
      column_count: headers.length,
      headers,
      success: res.success
    };

    // Small delay between tab creation to let Google Sheets finalize
    await new Promise(r => setTimeout(r, 500));
  }

  return {
    success: true,
    total_devices: allDevices.length,
    tabs: results
  };
}

/**
 * Completely clear all data and tabs in Google Sheets
 */
async function clearAllGoogleSheets() {
  if (!isConfigured()) {
    throw new Error('Google Sheets Webhook URL is not configured.');
  }
  return await sendToGoogleSheet('CLEAR_ALL_SHEETS', {}, 30000);
}

module.exports = {
  isConfigured,
  sendToGoogleSheet,
  getTabHeaders,
  formatRowForTab,
  syncDeviceUpdate,
  syncBulkDevices,
  syncDeviceDelete,
  syncBulkDelete,
  syncFullMasterInventory,
  clearAllGoogleSheets
};


