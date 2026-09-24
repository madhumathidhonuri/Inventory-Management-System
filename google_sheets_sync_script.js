/**
 * FuelTracks Inventory Management System — Live Google Sheets Auto-Sync Webhook
 * 
 * INSTRUCTIONS (30 Seconds Setup):
 * 1. Open Google Sheets (https://sheets.new)
 * 2. Create tabs named: VAMOSYS, VOLTY, TRACKNOW (and any others like GENERAL)
 * 3. Go to Extensions -> Apps Script
 * 4. Paste this entire code and click Save (Floppy disk icon)
 * 5. Click "Deploy" (top right) -> "New deployment"
 * 6. Select type: "Web app"
 * 7. Set "Execute as": "Me"
 * 8. Set "Who has access": "Anyone"
 * 9. Click Deploy -> Authorize Access -> Copy the Web App URL!
 * 10. Add to your .env: GOOGLE_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
 */

const HEADERS = [
  'IMEI', 'SIM NUMBER', 'DEVICE TYPE', 'STOCK PLACE', 'STOCK PLACE DATE',
  'STATUS', 'CUSTOMER NAME', 'CUSTOMER PHONE', 'VEHICLE NUMBER',
  'CHASIS NUMBER', 'ENGINE NUMBER', 'CATEGORY', 'INSTALLATION DATE',
  'PAYMENT STATUS', 'AMOUNT', 'AMOUNT RECEIVED BY', 'TECHNICIAN', 'LAST UPDATED'
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === 'UPSERT_DEVICE') {
      upsertSingleDevice(ss, data.device);
    } else if (data.action === 'BULK_UPSERT') {
      if (Array.isArray(data.devices)) {
        data.devices.forEach(dev => upsertSingleDevice(ss, dev));
      }
    } else if (data.action === 'FULL_SYNC') {
      const grouped = data.grouped_by_tab || {};
      Object.keys(grouped).forEach(tabName => {
        fullSyncTab(ss, tabName, grouped[tabName]);
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Sync complete' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet(ss, tabName) {
  const cleanName = (tabName || 'GENERAL').toUpperCase().trim();
  let sheet = ss.getSheetByName(cleanName);
  if (!sheet) {
    sheet = ss.insertSheet(cleanName);
    sheet.appendRow(HEADERS);
    // Format header row (Dark Blue background, White bold text)
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#1e3a8a').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function formatRowArray(d) {
  return [
    "'" + (d.imei || ''),
    "'" + (d.sim || ''),
    d.device_type || '',
    d.stock_place || '',
    d.stock_place_date || '',
    d.status || '',
    d.customer_name || '',
    "'" + (d.customer_phone || ''),
    d.vehicle_number || '',
    d.chasis_number || '',
    d.engine_number || '',
    d.category || '',
    d.installation_date || '',
    d.payment_status || '',
    d.amount || '',
    d.received_by || '',
    d.technician || '',
    d.last_updated || new Date().toISOString()
  ];
}

function upsertSingleDevice(ss, dev) {
  if (!dev || !dev.imei) return;
  const sheet = getOrCreateSheet(ss, dev.device_type);
  const data = sheet.getDataRange().getValues();
  const imeiStr = String(dev.imei).trim();
  
  let targetRow = -1;
  for (let r = 1; r < data.length; r++) {
    const rowImei = String(data[r][0] || '').replace(/^'/, '').trim();
    if (rowImei === imeiStr) {
      targetRow = r + 1;
      break;
    }
  }

  const rowValues = formatRowArray(dev);
  if (targetRow !== -1) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function fullSyncTab(ss, tabName, devicesList) {
  if (!Array.isArray(devicesList) || devicesList.length === 0) return;
  const sheet = getOrCreateSheet(ss, tabName);
  
  // Clear existing data except header
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clearContent();
  }

  const rows = devicesList.map(formatRowArray);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }
}
