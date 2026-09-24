const db = require('../db/database');

/**
 * Google Sheets Auto-Sync Service
 * Syncs device additions, stock place movements, fitments, and payments live to Google Sheets.
 */

const WEBHOOK_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL || null;

/**
 * Check if Google Sheets webhook is configured
 */
function isConfigured() {
  return Boolean(process.env.GOOGLE_SHEET_WEBHOOK_URL && process.env.GOOGLE_SHEET_WEBHOOK_URL.startsWith('http'));
}

/**
 * Format a device object into clean standard row payload for Google Sheets
 */
function formatDevicePayload(dev) {
  let attrs = {};
  try {
    attrs = typeof dev.additional_attributes === 'object' ? dev.additional_attributes : JSON.parse(dev.additional_attributes || '{}');
  } catch {
    attrs = {};
  }

  const deviceTypeName = dev.device_type_name || (dev.device_type_id ? getDeviceTypeName(dev.device_type_id) : 'GENERAL');

  return {
    id: dev.id,
    imei: dev.imei_number,
    sim: dev.sim_number || attrs['SIM NUMBER'] || attrs['SIM 1'] || attrs['airtel'] || attrs['bsnl'] || '',
    device_type: deviceTypeName,
    stock_place: dev.current_holder_name || attrs['STOCK PLACE'] || 'Central Warehouse',
    stock_place_date: attrs['STOCK PLACE DATE'] || attrs['Stock Place Date'] || dev.purchase_date || '',
    status: dev.current_status || 'IN_WAREHOUSE',
    customer_name: attrs['CUSTOMER NAME'] || attrs['Customer Name'] || '',
    customer_phone: attrs['CUSTOMER PHONE NUMBER'] || attrs['Customer Phone'] || '',
    vehicle_number: attrs['VEHICLE NUMBER'] || attrs['Vehicle Number'] || '',
    chasis_number: attrs['CHASIS NUMBER'] || attrs['Chasis Number'] || '',
    engine_number: attrs['ENGINE NUMBER'] || attrs['Engine Number'] || '',
    category: attrs['CATEGORY'] || attrs['Category'] || 'GENERAL',
    installation_date: attrs['INSTALLATION DATE'] || attrs['Installation Date'] || '',
    payment_status: attrs['AMOUNT RECEIVED'] || attrs['Amount Received'] || 'PENDING',
    payment_date: attrs['PAYMENT DATE'] || attrs['Payment Date'] || '',
    amount: attrs['TOTAL COST'] || attrs['COST'] || attrs['SALE PRICE'] || '',
    received_by: attrs['AMOUNT RECEIVED BY'] || attrs['Amount Received By'] || '',
    technician: attrs['TECHNICIAN'] || attrs['Technician'] || attrs['SALES PERSON NAME'] || '',
    last_updated: new Date().toISOString()
  };
}

function getDeviceTypeName(typeId) {
  try {
    const row = db.prepare('SELECT name FROM device_types WHERE id = ?').get(typeId);
    return row ? row.name.toUpperCase().trim() : 'GENERAL';
  } catch {
    return 'GENERAL';
  }
}

/**
 * Send an event payload to Google Sheets Webhook (Non-blocking)
 */
async function sendToGoogleSheet(action, data) {
  const url = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!url || !url.startsWith('http')) {
    return { success: false, reason: 'GOOGLE_SHEET_WEBHOOK_URL not configured' };
  }

  try {
    // Fire and forget or quick fetch with 10s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[GoogleSheetSync] Webhook response warning:', res.status, errText);
      return { success: false, error: `HTTP ${res.status}: ${errText}` };
    }

    const result = await res.json().catch(() => ({ success: true }));
    console.log(`[GoogleSheetSync] Successfully synced ${action} event to Google Sheets.`);
    return { success: true, result };
  } catch (err) {
    console.warn('[GoogleSheetSync] Sync notice:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Sync a single device mutation (Add or Update)
 */
function syncDeviceUpdate(deviceIdOrImei) {
  if (!isConfigured()) return;

  setImmediate(async () => {
    try {
      let dev;
      if (typeof deviceIdOrImei === 'number' || /^\d+$/.test(String(deviceIdOrImei)) && String(deviceIdOrImei).length < 10) {
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
        const payload = formatDevicePayload(dev);
        await sendToGoogleSheet('UPSERT_DEVICE', { device: payload });
      }
    } catch (e) {
      console.warn('[GoogleSheetSync] Error syncing device:', e.message);
    }
  });
}

/**
 * Sync multiple devices (e.g. Bulk Transfer or Excel Import)
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
      const payloadList = devices.map(formatDevicePayload);

      await sendToGoogleSheet('BULK_UPSERT', { devices: payloadList });
    } catch (e) {
      console.warn('[GoogleSheetSync] Error syncing bulk devices:', e.message);
    }
  });
}

/**
 * Full master sync of all inventory to Google Sheets
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

  const formattedDevices = allDevices.map(formatDevicePayload);

  // Group by brand tab (VAMOSYS, VOLTY, TRACKNOW, etc.)
  const grouped = {};
  for (const d of formattedDevices) {
    const tabName = (d.device_type || 'GENERAL').toUpperCase().trim();
    if (!grouped[tabName]) grouped[tabName] = [];
    grouped[tabName].push(d);
  }

  const result = await sendToGoogleSheet('FULL_SYNC', {
    total_count: formattedDevices.length,
    grouped_by_tab: grouped
  });

  return {
    success: result.success,
    total_synced: formattedDevices.length,
    tabs: Object.keys(grouped),
    result
  };
}

module.exports = {
  isConfigured,
  syncDeviceUpdate,
  syncBulkDevices,
  syncFullMasterInventory,
  formatDevicePayload
};
