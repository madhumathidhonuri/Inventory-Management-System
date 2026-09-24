/**
 * FuelTracks Live Google Sheets Auto-Sync Webhook
 * Option B: Top-Feed Mode (Updated / newly added devices always jump to Row 2 at the top!)
 */

const SPREADSHEET_ID = '1IKYZ-x0W4SI_W7NH-8ZqQ_-i_2NwNk9nnxKlRygJNpQ';

function testSync() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log('Connected to sheet: ' + ss.getName());
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = getSpreadsheet();

    if (data.action === 'SYNC_TAB_DATA') {
      syncTabWithExactHeaders(ss, data.tab_name, data.headers, data.rows);
    } else if (data.action === 'UPSERT_DEVICE_ROW') {
      upsertDeviceRow(ss, data.tab_name, data.headers, data.row);
    } else if (data.action === 'BULK_UPSERT_ROWS') {
      if (Array.isArray(data.batches)) {
        data.batches.forEach(b => {
          syncTabWithExactHeaders(ss, b.tab_name, b.headers, b.rows);
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      message: 'Sync complete',
      sheet_url: ss.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet(ss, tabName, headers) {
  const target = (tabName || 'GENERAL').toUpperCase().trim();
  const sheets = ss.getSheets();
  let sheet = null;

  for (let s of sheets) {
    if (s.getName().toUpperCase().trim() === target) {
      sheet = s;
      break;
    }
  }

  if (!sheet) {
    sheet = ss.insertSheet(target);
  }

  return sheet;
}

function syncTabWithExactHeaders(ss, tabName, headers, rows) {
  if (!headers || headers.length === 0) return;
  const sheet = getOrCreateSheet(ss, tabName, headers);
  
  // Clear sheet completely
  sheet.clear();

  // 1. Write headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1e3a8a')
             .setFontColor('#ffffff')
             .setFontWeight('bold')
             .setFontFamily('Roboto')
             .setFontSize(10)
             .setHorizontalAlignment('center');
  
  sheet.setFrozenRows(1);

  // 2. Write rows in bulk
  if (rows && rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  // 3. Auto-resize columns
  try {
    for (let c = 1; c <= headers.length; c++) {
      sheet.autoResizeColumn(c);
    }
  } catch(e) {}
}

/**
 * Option B: Top-Feed Implementation
 * Deletes previous row if existing, then inserts at Row 2 (very top)
 */
function upsertDeviceRow(ss, tabName, headers, row) {
  if (!row || row.length === 0) return;
  const sheet = getOrCreateSheet(ss, tabName, headers);
  
  // Ensure headers exist
  if (sheet.getLastRow() === 0 && headers && headers.length > 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1e3a8a').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const data = sheet.getDataRange().getValues();
  const imeiStr = String(row[0] || '').replace(/^'/, '').trim();

  let targetRow = -1;
  for (let r = 1; r < data.length; r++) {
    const rowImei = String(data[r][0] || '').replace(/^'/, '').trim();
    if (rowImei === imeiStr) {
      targetRow = r + 1;
      break;
    }
  }

  // If already exists, delete old position so it moves to the top
  if (targetRow !== -1) {
    sheet.deleteRow(targetRow);
  }

  // Insert fresh row at Row 2 (top of table right under header)
  sheet.insertRowBefore(2);
  sheet.getRange(2, 1, 1, row.length).setValues([row]);
}
