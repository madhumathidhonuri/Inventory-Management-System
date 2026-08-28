import ExcelJS from 'exceljs';

/**
 * Generates and downloads a clean, styled Excel template with colored headers and NO sample dummy rows.
 */
export async function downloadStyledTemplate(filename, sheetName, columns = [], headerColor = '1E3A8A') {
  if (!columns || columns.length === 0) {
    columns = ['IMEI Number', 'SIM Number', 'Purchase Price', 'Vendor Name'];
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.lastModifiedBy = 'Admin';
  workbook.created = new Date();

  const safeSheetName = (sheetName || 'Stock_Template').replace(/[^a-zA-Z0-9_\s]/g, '_').substring(0, 30);
  const worksheet = workbook.addWorksheet(safeSheetName, {
    views: [{ showGridLines: true }]
  });

  // Setup columns with width
  worksheet.columns = columns.map(col => ({
    header: col,
    key: col,
    width: Math.max(String(col).length + 6, 18)
  }));

  // Style Header Row (Row 1)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${headerColor.replace('#', '')}` }
    };
    cell.font = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: false
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };
  });

  // Write and trigger download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Helper to extract value safely from device or additional_attributes case-insensitively
 */
function getAttrValue(attrs = {}, patterns = []) {
  const keys = Object.keys(attrs);
  for (const p of patterns) {
    const matchedKey = keys.find(k => {
      const clean = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const target = p.toLowerCase().replace(/[^a-z0-9]/g, '');
      return clean === target || clean.includes(target);
    });
    if (matchedKey && attrs[matchedKey] !== undefined && attrs[matchedKey] !== null && String(attrs[matchedKey]).trim() !== '') {
      return String(attrs[matchedKey]).trim();
    }
  }
  return '';
}

/**
 * Exports complete live inventory dataset (e.g. In-Stock, Installed, Uninstalled, or Device Type List)
 * in the 100% exact column order of the uploaded Excel sheet based on the device.
 */
export async function exportDevicesToExcel(filename, sheetName, devices = [], customColumns = [], headerColor = '1E3A8A') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.lastModifiedBy = 'Admin';
  workbook.created = new Date();

  const safeSheetName = (sheetName || 'Inventory_Stock').replace(/[^a-zA-Z0-9_\s]/g, '_').substring(0, 30);
  const worksheet = workbook.addWorksheet(safeSheetName, {
    views: [{ showGridLines: true }]
  });

  // Determine export columns in exact order
  let exportCols = [];
  if (Array.isArray(customColumns) && customColumns.length > 0) {
    exportCols = [...customColumns];
  } else {
    // Auto-discover columns from devices in original sequence
    const seen = new Set();
    devices.forEach(dev => {
      const attrs = dev.additional_attributes || {};
      Object.keys(attrs).forEach(k => {
        if (k && k !== 'original_row' && !seen.has(k)) {
          seen.add(k);
          exportCols.push(k);
        }
      });
    });

    if (exportCols.length === 0) {
      exportCols = ['IMEI Number', 'Device Type', 'SIM Number', 'Status', 'Current Location', 'Vendor', 'Purchase Price'];
    }
  }

  // Calculate dynamic column widths based on headers and data length
  const colWidths = {};
  exportCols.forEach(col => {
    colWidths[col] = Math.max(String(col).length + 4, 14);
  });

  // Helper to format date numbers and values
  const formatCellValue = (headerName, rawVal) => {
    if (rawVal === undefined || rawVal === null) return '';
    const str = String(rawVal).trim();
    if (!str || str === '-') return '';

    // Date check
    if (/date|month|validity|timestamp|time/i.test(headerName)) {
      const num = Number(str);
      if (!isNaN(num) && num > 30000 && num < 65000) {
        try {
          const d = new Date(Math.round((num - 25569) * 86400 * 1000));
          let day = d.getUTCDate();
          let month = d.getUTCMonth() + 1;
          const year = d.getUTCFullYear();

          if (day === 8 && year === 2026 && d.getUTCMonth() < 12) {
            day = d.getUTCMonth() + 1;
            month = 8;
          } else if (day === 7 && year === 2026 && d.getUTCMonth() < 12) {
            day = d.getUTCMonth() + 1;
            month = 7;
          } else if (day === 6 && year === 2026 && d.getUTCMonth() < 12) {
            day = d.getUTCMonth() + 1;
            month = 6;
          }

          const dd = String(day).padStart(2, '0');
          const mm = String(month).padStart(2, '0');
          return `${dd}-${mm}-${year}`;
        } catch {
          return str;
        }
      }

      const parts = str.split(/[-/]/);
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
      }
    }
    return str;
  };

  // Helper to extract value for a specific column header from device or attributes
  const extractColumnValue = (dev, header) => {
    const attrs = dev.additional_attributes || {};

    if (header === 'Device IMEI') {
      return dev.imei_number || '';
    }
    if (header === 'Device Type') {
      return dev.device_type_name || '';
    }
    if (header === 'Current Status') {
      return dev.current_status || (attrs[header] !== undefined ? String(attrs[header]) : '');
    }

    // 1. Direct match in additional_attributes
    if (attrs[header] !== undefined && attrs[header] !== null && String(attrs[header]).trim() !== '') {
      return formatCellValue(header, attrs[header]);
    }

    // 2. Case-insensitive / normalized match in additional_attributes
    const cleanHeader = header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedKey = Object.keys(attrs).find(k => {
      const cleanKey = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanKey === cleanHeader;
    });

    if (matchedKey && attrs[matchedKey] !== undefined && attrs[matchedKey] !== null && String(attrs[matchedKey]).trim() !== '') {
      return formatCellValue(header, attrs[matchedKey]);
    }

    // 3. Smart fallbacks to core device attributes when column name matches standard terms
    if (/^imei|device\s*imei|^serial\s*number$|^vltd\s*sno$/i.test(header.trim())) {
      return dev.imei_number || '';
    }
    if (/^sim\s*1?$|^simno1?$|^sim\s*number$|^iccid$/i.test(header.trim())) {
      return dev.sim_number || '';
    }
    if (/^price$|^purchase\s*price$|^rate$/i.test(header.trim())) {
      return dev.purchase_price !== null && dev.purchase_price !== undefined ? dev.purchase_price : '';
    }
    if (/^vendor$|^vendor\s*name$/i.test(header.trim())) {
      return dev.vendor_name || '';
    }
    if (/^stock\s*place$|^current\s*location$|^current\s*holder$/i.test(header.trim())) {
      return dev.current_holder_name || '';
    }
    if (/^status$/i.test(header.trim())) {
      return dev.current_status || '';
    }

    return '';
  };

  // Configure Excel Columns in exact uploaded sequence
  worksheet.columns = exportCols.map((col, idx) => ({
    header: String(col).startsWith('__EMPTY') ? '' : col,
    key: `col_${idx}`,
    width: colWidths[col]
  }));


  // Style Header Row (Row 1)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${headerColor.replace('#', '')}` }
    };
    cell.font = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: false
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };
  });

  // Populate All Device Records in exact column order
  devices.forEach((dev, index) => {
    const rowData = {};

    exportCols.forEach((col, idx) => {
      const val = extractColumnValue(dev, col);
      rowData[`col_${idx}`] = val;

      const strLen = String(val).length;
      if (strLen + 4 > (colWidths[col] || 14)) {
        colWidths[col] = Math.min(strLen + 4, 45);
      }
    });

    const row = worksheet.addRow(rowData);
    row.height = 22;

    const isEven = index % 2 === 0;
    row.eachCell((cell) => {
      if (!isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  // Update column widths with evaluated max content lengths
  worksheet.columns.forEach((col, idx) => {
    const headerName = exportCols[idx];
    if (headerName && colWidths[headerName]) {
      col.width = Math.max(colWidths[headerName], 14);
    }
  });

  // Write and trigger download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Exports IMEI Verification & Audit Scan results to a formatted Excel workbook
 */
export async function exportImeiVerificationToExcel(filename, sheetName, items = [], summary = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.lastModifiedBy = 'Audit Team';
  workbook.created = new Date();

  const safeSheetName = (sheetName || 'IMEI_Verification_Audit').replace(/[^a-zA-Z0-9_\s]/g, '_').substring(0, 30);
  const worksheet = workbook.addWorksheet(safeSheetName, {
    views: [{ showGridLines: true }]
  });

  // Define Columns
  worksheet.columns = [
    { header: 'Sl No', key: 'sl_no', width: 8 },
    { header: 'Scanned IMEI', key: 'imei_number', width: 22 },
    { header: 'Verification Status', key: 'verification_status', width: 24 },
    { header: 'Device Model', key: 'device_type', width: 20 },
    { header: 'Stock Location / Holder', key: 'stock_place', width: 24 },
    { header: 'Assigned Customer', key: 'customer_name', width: 24 },
    { header: 'Vehicle Number', key: 'vehicle_number', width: 18 },
    { header: 'SIM Number', key: 'sim_number', width: 20 },
    { header: 'Duplicate Scan', key: 'is_duplicate', width: 16 },
    { header: 'Scan Timestamp', key: 'scan_time', width: 22 }
  ];

  // Style Header Row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' } // Sleek slate-900 header
    };
    cell.font = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center'
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF475569' } },
      bottom: { style: 'medium', color: { argb: 'FF3B82F6' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } }
    };
  });

  // Populate data rows
  items.forEach((item, index) => {
    const dev = item.device || {};
    let statusText = 'UNREGISTERED (NOT FOUND)';
    if (item.exists) {
      if (item.status === 'IN_STOCK' || item.status === 'IN_WAREHOUSE' || item.status === 'AVAILABLE') statusText = 'VERIFIED - IN STOCK';
      else if (item.status === 'WITH_DEALER' || item.status === 'DISPATCHED') statusText = `WITH DEALER (${dev.stock_place || 'Dispatched'})`;
      else if (item.status === 'INSTALLED' || Boolean(dev.vehicle_number)) statusText = `INSTALLED (${dev.vehicle_number || 'Fitted'})`;
      else if (item.status === 'FAULTY' || item.status?.includes('RMA')) statusText = `RMA / FAULTY (${item.status})`;
      else statusText = item.status || 'FOUND';
    }

    const rowData = {
      sl_no: index + 1,
      imei_number: item.imei_number,
      verification_status: statusText,
      device_type: dev.device_type_name || (item.exists ? 'Device' : '—'),
      stock_place: dev.stock_place || (item.exists ? 'Central Warehouse' : '—'),
      customer_name: dev.customer_name || '—',
      vehicle_number: dev.vehicle_number || '—',
      sim_number: dev.sim_number || '—',
      is_duplicate: item.is_duplicate_scan ? 'YES (DUPLICATE)' : 'NO',
      scan_time: item.scanned_at ? new Date(item.scanned_at).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')
    };

    const row = worksheet.addRow(rowData);
    row.height = 24;

    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 || colNumber === 9 ? 'center' : 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      // Status cell highlighting
      if (colNumber === 3) {
        if (!item.exists) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Light red
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF991B1B' } };
        } else if (item.status === 'IN_STOCK' || item.status === 'IN_WAREHOUSE' || item.status === 'AVAILABLE') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Light green
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF166534' } };
        } else if (item.status === 'INSTALLED' || Boolean(dev.vehicle_number)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; // Light blue
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E40AF' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Light amber
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF92400E' } };
        }
      }
    });
  });

  // Write and trigger download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

