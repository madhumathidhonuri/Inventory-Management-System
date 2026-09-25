/**
 * FuelTracks Live Google Sheets Auto-Sync Webhook
 * Option B: Top-Feed Mode (Updated / newly added devices jump to the top)
 */

const SPREADSHEET_ID = '1IKYZ-x0W4SI_W7NH-8ZqQ_-i_2NwNk9nnxKlRygJNpQ';

function testSync() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log('Connected to sheet: ' + ss.getName());
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doGet(e) {
  try {
    const ss = getSpreadsheet();
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      status: 'active',
      message: 'FuelTracks Live Google Sheets Webhook is running',
      sheet_url: ss.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Empty payload' })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const ss = getSpreadsheet();

    if (data.action === 'SYNC_TAB_DATA') {
      syncTabWithExactHeaders(ss, data.tab_name, data.headers, data.rows);
    } else if (data.action === 'UPSERT_DEVICE_ROW') {
      upsertDeviceRow(ss, data.tab_name, data.headers, data.row);
    } else if (data.action === 'BULK_UPSERT_ROWS') {
      if (Array.isArray(data.batches)) {
        data.batches.forEach(b => {
          bulkUpsertDeviceRows(ss, b.tab_name, b.headers, b.rows);
        });
      } else if (data.tab_name && Array.isArray(data.rows)) {
        bulkUpsertDeviceRows(ss, data.tab_name, data.headers, data.rows);
      }
    } else if (data.action === 'DELETE_DEVICE_ROW') {
      deleteDeviceRow(ss, data.tab_name, data.imei);
    } else if (data.action === 'BULK_DELETE_ROWS') {
      bulkDeleteDeviceRows(ss, data.tab_name, data.imeis);
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

function findImeiColIndex(headers) {
  if (!headers || !headers.length) return 0;
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').toUpperCase().trim();
    if (h === 'IMEI' || h === 'IMEI NUMBER' || h === 'DEVICE IMEI' || h === 'DEVICE_IMEI') {
      return i;
    }
  }
  return 0;
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
    for (let c = 1; c <= Math.min(headers.length, 50); c++) {
      sheet.autoResizeColumn(c);
    }
  } catch(e) {}
}

function alignRowToSheetHeaders(sheetHeaders, incomingHeaders, row) {
  if (!sheetHeaders || sheetHeaders.length === 0 || !incomingHeaders || incomingHeaders.length === 0) {
    return row;
  }
  
  const valMap = {};
  for (let i = 0; i < incomingHeaders.length; i++) {
    const key = String(incomingHeaders[i] || '').trim().toUpperCase();
    valMap[key] = row[i] !== undefined ? row[i] : '';
  }

  return sheetHeaders.map(sh => {
    const sKey = String(sh || '').trim().toUpperCase();
    if (valMap[sKey] !== undefined) return valMap[sKey];
    if (sKey === 'IMEI' && valMap['IMEINO']) return valMap['IMEINO'];
    if (sKey === 'IMEINO' && valMap['IMEI']) return valMap['IMEI'];
    return '';
  });
}

/**
 * Single Row Top-Feed Upsert
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

  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  const imeiColIdx = findImeiColIndex(currentHeaders);
  const alignedRow = alignRowToSheetHeaders(currentHeaders, headers, row);

  const data = sheet.getDataRange().getValues();
  const imeiStr = String(alignedRow[imeiColIdx] || alignedRow[0] || '').replace(/^'/, '').trim();

  let targetRow = -1;
  for (let r = 1; r < data.length; r++) {
    const rowImei = String(data[r][imeiColIdx] || data[r][0] || '').replace(/^'/, '').trim();
    if (rowImei === imeiStr) {
      targetRow = r + 1;
      break;
    }
  }

  // If already exists, delete old position so it moves to top
  if (targetRow !== -1) {
    sheet.deleteRow(targetRow);
  }

  // Insert fresh row at Row 2 (top of table right under header)
  sheet.insertRowBefore(2);
  sheet.getRange(2, 1, 1, alignedRow.length).setValues([alignedRow]);
}

/**
 * Bulk Upsert Device Rows without clearing entire sheet
 */
function bulkUpsertDeviceRows(ss, tabName, headers, rows) {
  if (!rows || rows.length === 0) return;
  const sheet = getOrCreateSheet(ss, tabName, headers);

  if (sheet.getLastRow() === 0 && headers && headers.length > 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1e3a8a').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  const imeiColIdx = findImeiColIndex(currentHeaders);

  const alignedRows = rows.map(r => alignRowToSheetHeaders(currentHeaders, headers, r));

  const data = sheet.getDataRange().getValues();
  const existingRows = [];
  const incomingImeis = new Set();

  for (let i = 0; i < alignedRows.length; i++) {
    const imei = String(alignedRows[i][imeiColIdx] || alignedRows[i][0] || '').replace(/^'/, '').trim();
    if (imei) incomingImeis.add(imei);
  }

  // Keep existing rows that are NOT in the incoming batch
  for (let r = 1; r < data.length; r++) {
    const rowImei = String(data[r][imeiColIdx] || data[r][0] || '').replace(/^'/, '').trim();
    if (!incomingImeis.has(rowImei)) {
      existingRows.push(data[r]);
    }
  }

  // New rows at the top, followed by existing rows
  const combinedRows = alignedRows.concat(existingRows);

  // Clear data area and write back
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  if (combinedRows.length > 0) {
    const numCols = currentHeaders.length;
    // Normalize rows length to match headers
    const normalizedRows = combinedRows.map(r => {
      const rowArr = Array.isArray(r) ? r.slice(0, numCols) : [];
      while (rowArr.length < numCols) rowArr.push('');
      return rowArr;
    });
    sheet.getRange(2, 1, normalizedRows.length, numCols).setValues(normalizedRows);
  }
}

/**
 * Delete a single row by IMEI
 */
function deleteDeviceRow(ss, tabName, imei) {
  if (!imei) return;
  const cleanImei = String(imei).replace(/^'/, '').trim();
  const sheets = tabName ? [getOrCreateSheet(ss, tabName)] : ss.getSheets();

  for (const sheet of sheets) {
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue;
    const imeiColIdx = findImeiColIndex(data[0]);

    for (let r = 1; r < data.length; r++) {
      const rowImei = String(data[r][imeiColIdx] || data[r][0] || '').replace(/^'/, '').trim();
      if (rowImei === cleanImei) {
        sheet.deleteRow(r + 1);
        return;
      }
    }
  }
}

/**
 * Bulk delete rows by IMEIs
 */
function bulkDeleteDeviceRows(ss, tabName, imeis) {
  if (!Array.isArray(imeis) || imeis.length === 0) return;
  const imeiSet = new Set(imeis.map(i => String(i).replace(/^'/, '').trim()));
  const sheets = tabName ? [getOrCreateSheet(ss, tabName)] : ss.getSheets();

  for (const sheet of sheets) {
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue;
    const imeiColIdx = findImeiColIndex(data[0]);

    const remainingRows = [];
    let hadDeletions = false;

    for (let r = 1; r < data.length; r++) {
      const rowImei = String(data[r][imeiColIdx] || data[r][0] || '').replace(/^'/, '').trim();
      if (imeiSet.has(rowImei)) {
        hadDeletions = true;
      } else {
        remainingRows.push(data[r]);
      }
    }

    if (hadDeletions) {
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
      }
      if (remainingRows.length > 0) {
        sheet.getRange(2, 1, remainingRows.length, remainingRows[0].length).setValues(remainingRows);
      }
    }
  }
}

