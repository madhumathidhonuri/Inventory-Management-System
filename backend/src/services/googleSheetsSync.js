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
  
  // Base columns for tracking
  const headerSet = new Set(['IMEI', 'STATUS', 'CURRENT HOLDER']);

  try {
    const rows = db.prepare(`
      SELECT d.additional_attributes
      FROM devices d
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE UPPER(TRIM(dt.name)) = ?
    `).all(targetBrand);

    rows.forEach(r => {
      try {
        const attrs = typeof r.additional_attributes === 'object' 
          ? r.additional_attributes 
          : JSON.parse(r.additional_attributes || '{}');
        Object.keys(attrs).forEach(k => {
          if (k && !k.startsWith('__empty') && k !== 'original_row' && k !== '_1' && k !== '_2') {
            headerSet.add(k);
          }
        });
      } catch {}
    });
  } catch (e) {
    console.warn('[GoogleSheetSync] Error fetching tab headers:', e.message);
  }

  headerSet.add('LAST UPDATED');
  return Array.from(headerSet);
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

  return headers.map(h => {
    if (h === 'IMEI') return "'" + (dev.imei_number || dev.imei || '');
    if (h === 'STATUS') return dev.current_status || dev.status || 'IN_WAREHOUSE';
    if (h === 'CURRENT HOLDER') return dev.current_holder_name || dev.stock_place || 'Central Warehouse';
    if (h === 'LAST UPDATED') return new Date().toISOString();

    const val = attrs[h];
    if (val === undefined || val === null) return '';

    // If it's a long number string (Phone, SIM, ICCID, Aadhaar), prefix with ' so Sheets keeps full precision
    const sVal = String(val).trim();
    if (/^\d{10,}$/.test(sVal)) {
      return "'" + sVal;
    }
    return sVal;
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
        `).get(String(deviceIdOrImei));
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
 * Sync multiple devices in bulk
 */
function syncBulkDevices(deviceIdsOrImeis) {
  if (!isConfigured() || !Array.isArray(deviceIdsOrImeis) || deviceIdsOrImeis.length === 0) return;

  setImmediate(async () => {
    try {
      const placeholders = deviceIdsOrImeis.map(() => '?').join(',');
      const isIds = typeof deviceIdsOrImeis[0] === 'number';
      const query = isIds
        ? `SELECT d.*, dt.name as device_type_name FROM devices d JOIN device_types dt ON d.device_type_id = dt.id WHERE d.id IN (${placeholders})`
        : `SELECT d.*, dt.name as device_type_name FROM devices d JOIN device_types dt ON d.device_type_id = dt.id WHERE d.imei_number IN (${placeholders})`;

      const devices = db.prepare(query).all(...deviceIdsOrImeis);

      // Group by tab
      const grouped = {};
      for (const d of devices) {
        const tabName = (d.device_type_name || 'GENERAL').toUpperCase().trim();
        if (!grouped[tabName]) grouped[tabName] = [];
        grouped[tabName].push(d);
      }

      for (const [tabName, tabDevices] of Object.entries(grouped)) {
        const headers = getTabHeaders(tabName);
        for (const dev of tabDevices) {
          const row = formatRowForTab(dev, headers);
          await sendToGoogleSheet('UPSERT_DEVICE_ROW', {
            tab_name: tabName,
            headers,
            row
          });
        }
      }
    } catch (e) {
      console.warn('[GoogleSheetSync] Error syncing bulk devices:', e.message);
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

module.exports = {
  isConfigured,
  sendToGoogleSheet,
  getTabHeaders,
  formatRowForTab,
  syncDeviceUpdate,
  syncBulkDevices,
  syncFullMasterInventory
};
