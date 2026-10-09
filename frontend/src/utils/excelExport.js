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
export async function exportDevicesToExcel(filename, sheetName, devices = [], customColumns = [], headerColor = '1E3A8A', options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.lastModifiedBy = 'Admin';
  workbook.created = new Date();

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

  // Helper to build and populate a worksheet
  const populateWorksheet = (title, items, color) => {
    const cleanTitle = (title || 'Stock').replace(/[:\\/?*[\]]/g, '_').substring(0, 31);
    const worksheet = workbook.addWorksheet(cleanTitle, {
      views: [{ showGridLines: true }]
    });

    // Calculate dynamic column widths based on headers and data length
    const colWidths = {};
    exportCols.forEach(col => {
      colWidths[col] = Math.max(String(col).length + 4, 14);
    });

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
        fgColor: { argb: `FF${color.replace('#', '')}` }
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
    items.forEach((dev, index) => {
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

    return worksheet;
  };

  // 1. Populate Sheet 1: All Stock / Master Devices
  const baseName = (sheetName || 'Inventory_Stock').replace(/[^a-zA-Z0-9_\s-]/g, '_').trim();
  const sheet1Title = options.sheet1Name || (options.newDevices && options.newDevices.length > 0 ? `${baseName} - All Stock` : baseName);
  populateWorksheet(sheet1Title, devices, headerColor);

  // 2. Populate Sheet 2: New Devices / Latest Batch (if available or specified)
  let newDevicesList = options.newDevices;
  if (!newDevicesList && devices.length > 0) {
    const batchIds = devices.map(d => d.purchase_batch_id).filter(Boolean);
    if (batchIds.length > 0) {
      const maxBatchId = Math.max(...batchIds);
      const candidates = devices.filter(d => d.purchase_batch_id === maxBatchId);
      if (candidates.length > 0 && candidates.length < devices.length) {
        newDevicesList = candidates;
      }
    }
  }

  if (newDevicesList && Array.isArray(newDevicesList) && newDevicesList.length > 0) {
    const sheet2Title = options.sheet2Name || `${baseName} - New Devices`;
    populateWorksheet(sheet2Title, newDevicesList, '047857'); // Emerald Green header for New Devices
  }

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

/**
 * Exports Installation Records to a beautifully styled, executive Excel report (.xlsx)
 * categorized and formatted for management reviews and department audits.
 */
export async function exportInstallationsToExcel(filename, sheetName, installations = [], categoryFilter = 'ALL', options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.lastModifiedBy = 'Admin';
  workbook.created = new Date();

  const safeCategory = (categoryFilter || 'ALL').toUpperCase();
  const safeSheet = (sheetName || (safeCategory === 'ALL' ? 'All Installations' : `${safeCategory} Installs`)).substring(0, 31);
  const worksheet = workbook.addWorksheet(safeSheet, {
    views: [{ showGridLines: true }]
  });

  // Color Theme based on Category
  let themeColor = '1E293B'; // Slate/Navy for ALL
  let accentColor = '0EA5E9';
  if (safeCategory.includes('TG MINING')) {
    themeColor = 'B45309'; // Amber-700
    accentColor = 'F59E0B';
  } else if (safeCategory.includes('AP MINING')) {
    themeColor = '7E22CE'; // Purple-700
    accentColor = 'A855F7';
  } else if (safeCategory.includes('VLTD')) {
    themeColor = '1D4ED8'; // Blue-700
    accentColor = '3B82F6';
  } else if (safeCategory.includes('GENERAL')) {
    themeColor = '047857'; // Emerald-700
    accentColor = '10B981';
  }

  // Setup Column Definitions
  worksheet.columns = [
    { key: 'sl_no', width: 8 },
    { key: 'installation_date', width: 16 },
    { key: 'category', width: 16 },
    { key: 'vehicle_number', width: 18 },
    { key: 'vehicle_type', width: 18 },
    { key: 'imei_number', width: 20 },
    { key: 'sim_number', width: 18 },
    { key: 'customer_name', width: 24 },
    { key: 'customer_contact', width: 16 },
    { key: 'software_user_id', width: 20 },
    { key: 'software_password', width: 16 },
    { key: 'installed_by', width: 18 },
    { key: 'installation_location', width: 20 },
    { key: 'sale_price', width: 14 },
    { key: 'payment_status', width: 16 },
    { key: 'remarks', width: 26 }
  ];

  // Title Banner (Row 1)
  worksheet.mergeCells('A1:P1');
  const titleRow = worksheet.getRow(1);
  titleRow.height = 36;
  const titleCell = worksheet.getCell('A1');
  const titleText = safeCategory === 'ALL'
    ? 'FUELTRACKS TECHNOLOGIES — MASTER VEHICLE INSTALLATIONS REPORT'
    : `FUELTRACKS TECHNOLOGIES — ${safeCategory} PROJECT INSTALLATION REPORT`;
  titleCell.value = titleText;
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${themeColor}` }
  };

  // Subtitle / Meta Information Bar (Row 2)
  worksheet.mergeCells('A2:P2');
  const metaRow = worksheet.getRow(2);
  metaRow.height = 22;
  const metaCell = worksheet.getCell('A2');
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const totalRev = installations.reduce((sum, item) => sum + (parseFloat(item.sale_price) || 0), 0);
  metaCell.value = `Category Filter: ${safeCategory}    |    Total Installed Records: ${installations.length}    |    Total Revenue: ₹${totalRev.toLocaleString('en-IN')}    |    Report Date: ${dateStr}`;
  metaCell.font = { name: 'Segoe UI', size: 9.5, italic: true, bold: true, color: { argb: 'FF1E293B' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  metaCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' }
  };
  metaCell.border = {
    bottom: { style: 'medium', color: { argb: `FF${themeColor}` } }
  };

  // Spacer (Row 3)
  worksheet.addRow([]);
  worksheet.getRow(3).height = 8;

  // Table Headers (Row 4)
  const headers = [
    'Sl No',
    'Date',
    'Category',
    'Vehicle Number',
    'Vehicle Type',
    'Device IMEI',
    'SIM Number',
    'Customer Name',
    'Phone Number',
    'GPS Software ID',
    'GPS Password',
    'Technician',
    'City / Location',
    'Price (₹)',
    'Payment Status',
    'Remarks'
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${themeColor}` }
    };
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };
  });

  // Populate Data Rows
  installations.forEach((inst, index) => {
    let devAttrs = {};
    try {
      devAttrs = typeof inst.device_additional_attributes === 'string'
        ? JSON.parse(inst.device_additional_attributes || '{}')
        : (inst.device_additional_attributes || {});
    } catch {}

    const itemCat = (devAttrs['CATEGORY'] || devAttrs['DEVICE CATEGORY'] || inst.vehicle_type || 'VLTD').toUpperCase();
    const softwareUser = inst.software_user_id || devAttrs['SOFTWARE USER ID'] || devAttrs['GPS USER ID'] || '—';
    const softwarePass = inst.software_password || devAttrs['SOFTWARE PASSWORD'] || devAttrs['GPS PASSWORD'] || '—';
    const priceNum = parseFloat(inst.sale_price) || 0;
    const payStatus = (inst.payment_status || 'RECEIVED').toUpperCase();
    const isPaid = payStatus.includes('REC') || payStatus.includes('PAID');

    const rowData = [
      index + 1,
      inst.installation_date || '—',
      itemCat,
      inst.vehicle_number || '—',
      inst.vehicle_type || 'Commercial',
      String(inst.imei_number || '—'),
      inst.sim_number || devAttrs['SIM NUMBER'] || devAttrs['SIM'] || '—',
      inst.customer_name || '—',
      inst.customer_contact || '—',
      softwareUser,
      softwarePass,
      inst.installed_by || '—',
      inst.installation_location || '—',
      priceNum,
      isPaid ? 'PAID' : 'PENDING',
      inst.remarks || '—'
    ];

    const row = worksheet.addRow(rowData);
    row.height = 22;

    const isEven = index % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (!isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }

      // Column-specific alignments & styling
      if (colNumber === 1) { // Sl No
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 2) { // Date
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 3) { // Category
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
      } else if (colNumber === 4) { // Vehicle Number
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB45309' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (colNumber === 6) { // IMEI
        cell.font = { name: 'Consolas', size: 9.5, bold: true };
      } else if (colNumber === 14) { // Sale Price
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNumber === 15) { // Payment Status
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
        if (isPaid) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF166534' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF991B1B' } };
        }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  // Summary Row at Bottom
  if (installations.length > 0) {
    const summaryRowIndex = worksheet.rowCount + 1;
    const summaryRowData = [
      '',
      '',
      '',
      'TOTAL RECORDS',
      `${installations.length} Devices`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'TOTAL REVENUE',
      totalRev,
      '',
      ''
    ];
    const summaryRow = worksheet.addRow(summaryRowData);
    summaryRow.height = 26;
    summaryRow.eachCell((cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.border = {
        top: { style: 'medium', color: { argb: `FF${themeColor}` } },
        bottom: { style: 'medium', color: { argb: `FF${themeColor}` } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
      if (colNumber === 14) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNumber === 4 || colNumber === 5 || colNumber === 13) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  }

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
 * Exports complete vehicle installations done by a specific technician (e.g. Srikanth's 20 vehicles)
 * to a beautifully styled, multi-tab executive Excel workbook (.xlsx).
 */
export async function exportTechnicianInstallationsToExcel(technicianName = 'Technician', installations = [], options = {}) {
  const {
    payoutRate = 0,
    dateRange = 'All Time',
    expenses = [],
    floatingStock = [],
    payoutSummary = null
  } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.lastModifiedBy = 'Admin';
  workbook.created = new Date();

  const safeTechName = (technicianName || 'Technician').trim();
  const safeSheet = `Fitments - ${safeTechName}`.substring(0, 31);
  const worksheet = workbook.addWorksheet(safeSheet, {
    views: [{ showGridLines: true }]
  });

  const themeColor = '1E1B4B'; // Indigo-950
  const headerColor = '312E81'; // Indigo-900
  const accentColor = '4F46E5'; // Indigo-600

  // 1. Column Definitions
  worksheet.columns = [
    { key: 'sl_no', width: 8 },
    { key: 'installation_date', width: 16 },
    { key: 'vehicle_number', width: 18 },
    { key: 'category', width: 18 },
    { key: 'imei_number', width: 22 },
    { key: 'sim_number', width: 20 },
    { key: 'customer_name', width: 26 },
    { key: 'customer_contact', width: 16 },
    { key: 'installation_location', width: 20 },
    { key: 'fitment_rate', width: 16 },
    { key: 'sale_price', width: 16 },
    { key: 'sales_person', width: 18 },
    { key: 'sales_manager', width: 18 },
    { key: 'remarks', width: 26 }
  ];

  // Title Banner (Row 1)
  worksheet.mergeCells('A1:N1');
  const titleRow = worksheet.getRow(1);
  titleRow.height = 36;
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `FUELTRACKS — TECHNICIAN VEHICLE INSTALLATIONS & FITMENT REPORT`;
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${themeColor}` }
  };

  // Subtitle / Profile Info Bar (Row 2)
  worksheet.mergeCells('A2:N2');
  const metaRow = worksheet.getRow(2);
  metaRow.height = 24;
  const metaCell = worksheet.getCell('A2');
  const totalFitments = installations.length;
  const rateVal = Math.max(0, parseFloat(payoutRate) || 0);
  const totalFitmentPayout = totalFitments * rateVal;
  const totalSaleRev = installations.reduce((sum, item) => sum + (parseFloat(item.sale_price) || 0), 0);
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  metaCell.value = `Technician: ${safeTechName.toUpperCase()}    |    Total Completed Fitments: ${totalFitments} Vehicles    |    Incentive Rate: ₹${rateVal}/install    |    Total Payout: ₹${totalFitmentPayout.toLocaleString('en-IN')}    |    Period: ${dateRange}    |    Exported: ${dateStr}`;
  metaCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  metaCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEEF2FF' } // Indigo-50
  };
  metaCell.border = {
    bottom: { style: 'medium', color: { argb: `FF${accentColor}` } }
  };

  // Spacer (Row 3)
  worksheet.addRow([]);
  worksheet.getRow(3).height = 8;

  // Table Headers (Row 4)
  const headers = [
    'Sl No',
    'Date',
    'Vehicle Number',
    'Category / Type',
    'Device IMEI Number',
    'SIM Card Number',
    'Customer / Fleet Name',
    'Customer Phone',
    'Location / RTO',
    'Fitment Rate (₹)',
    'Device Price (₹)',
    'Sales Person',
    'Sales Manager',
    'Remarks / Notes'
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${headerColor}` }
    };
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF818CF8' } },
      left: { style: 'thin', color: { argb: 'FF818CF8' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FF818CF8' } }
    };
  });

  // Populate Data Rows
  installations.forEach((inst, index) => {
    let devAttrs = {};
    try {
      devAttrs = typeof inst.device_additional_attributes === 'string'
        ? JSON.parse(inst.device_additional_attributes || '{}')
        : (inst.device_additional_attributes || {});
    } catch {}

    const itemCat = (devAttrs['CATEGORY'] || devAttrs['DEVICE CATEGORY'] || inst.vehicle_type || 'VLTD').toUpperCase();
    const simNum = inst.sim_number || devAttrs['SIM NUMBER'] || devAttrs['SIM'] || devAttrs['Sim Number'] || '—';
    const saleCost = parseFloat(inst.sale_price) || 0;

    const rowData = [
      index + 1,
      inst.installation_date || '—',
      inst.vehicle_number || '—',
      itemCat,
      String(inst.imei_number || '—'),
      String(simNum),
      inst.customer_name || '—',
      inst.customer_contact || '—',
      inst.installation_location || 'Field',
      rateVal,
      saleCost,
      inst.sales_person || 'Unassigned',
      inst.sales_manager || 'Direct',
      inst.remarks || '—'
    ];

    const row = worksheet.addRow(rowData);
    row.height = 22;

    const isEven = index % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (!isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }

      // Column-specific formatting
      if (colNumber === 1) { // Sl No
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 2) { // Date
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 3) { // Vehicle Number
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB45309' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (colNumber === 4) { // Category
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
      } else if (colNumber === 5) { // IMEI
        cell.font = { name: 'Consolas', size: 9.5, bold: true, color: { argb: 'FF1E40AF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 6) { // SIM
        cell.font = { name: 'Consolas', size: 9.5 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 8) { // Phone
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 10) { // Fitment Rate
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF166534' } };
      } else if (colNumber === 11) { // Sale Price
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  // Summary Row at Bottom
  if (installations.length > 0) {
    const summaryRowData = [
      '',
      '',
      'TOTAL FITMENTS',
      `${installations.length} Vehicles`,
      '',
      '',
      '',
      '',
      'TOTALS:',
      totalFitmentPayout,
      totalSaleRev,
      '',
      '',
      ''
    ];
    const summaryRow = worksheet.addRow(summaryRowData);
    summaryRow.height = 26;
    summaryRow.eachCell((cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }; // Indigo-100
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E1B4B' } };
      cell.border = {
        top: { style: 'medium', color: { argb: `FF${headerColor}` } },
        bottom: { style: 'medium', color: { argb: `FF${headerColor}` } },
        left: { style: 'thin', color: { argb: 'FFC7D2FE' } },
        right: { style: 'thin', color: { argb: 'FFC7D2FE' } }
      };
      if (colNumber === 10 || colNumber === 11) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNumber === 3 || colNumber === 4 || colNumber === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  }

  // 2. Sheet 2: In-Hand Floating Stock (if available)
  if (floatingStock && floatingStock.length > 0) {
    const stockSheet = workbook.addWorksheet(`Stock In-Hand (${floatingStock.length})`, {
      views: [{ showGridLines: true }]
    });

    stockSheet.columns = [
      { key: 'sl_no', width: 8 },
      { key: 'imei_number', width: 22 },
      { key: 'sim_number', width: 20 },
      { key: 'status', width: 18 },
      { key: 'holder', width: 24 },
      { key: 'updated_at', width: 18 }
    ];

    stockSheet.mergeCells('A1:F1');
    const sTitle = stockSheet.getCell('A1');
    sTitle.value = `TECHNICIAN IN-HAND / CUSTODY STOCK — ${safeTechName.toUpperCase()}`;
    sTitle.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    sTitle.alignment = { vertical: 'middle', horizontal: 'center' };
    sTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
    stockSheet.getRow(1).height = 30;

    const sHeaders = ['Sl No', 'Device IMEI Number', 'SIM Card Number', 'Current Status', 'Custody Holder', 'Last Updated'];
    const sHeaderRow = stockSheet.addRow(sHeaders);
    sHeaderRow.height = 24;
    sHeaderRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
      c.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    floatingStock.forEach((dev, idx) => {
      const sRow = stockSheet.addRow([
        idx + 1,
        dev.imei_number || '—',
        dev.sim_number || '—',
        dev.current_status || 'WITH_DEALER',
        dev.current_holder_name || safeTechName,
        dev.updated_at ? String(dev.updated_at).split(' ')[0] : '—'
      ]);
      sRow.height = 20;
      sRow.eachCell((cell, colIdx) => {
        cell.font = { name: 'Segoe UI', size: 9.5 };
        if (colIdx === 2) cell.font = { name: 'Consolas', size: 9.5, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 || colIdx === 4 || colIdx === 6 ? 'center' : 'left' };
      });
    });
  }

  // 3. Sheet 3: Expenses & Advances (if available)
  if (expenses && expenses.length > 0) {
    const expSheet = workbook.addWorksheet(`Expenses & Advances`, {
      views: [{ showGridLines: true }]
    });

    expSheet.columns = [
      { key: 'sl_no', width: 8 },
      { key: 'date', width: 14 },
      { key: 'category', width: 22 },
      { key: 'amount', width: 16 },
      { key: 'mode', width: 16 },
      { key: 'paid_to', width: 22 },
      { key: 'utr', width: 18 },
      { key: 'remarks', width: 26 }
    ];

    expSheet.mergeCells('A1:H1');
    const eTitle = expSheet.getCell('A1');
    eTitle.value = `TECHNICIAN TRAVEL CLAIMS & SETTLED ADVANCES — ${safeTechName.toUpperCase()}`;
    eTitle.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    eTitle.alignment = { vertical: 'middle', horizontal: 'center' };
    eTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B21A8' } };
    expSheet.getRow(1).height = 30;

    const eHeaders = ['Sl No', 'Date', 'Expense Category', 'Amount (₹)', 'Payment Mode', 'Paid To / Claimed By', 'UTR / Ref No', 'Remarks'];
    const eHeaderRow = expSheet.addRow(eHeaders);
    eHeaderRow.height = 24;
    eHeaderRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9333EA' } };
      c.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    let totalExpAmount = 0;
    expenses.forEach((e, idx) => {
      const amt = parseFloat(e.amount) || 0;
      totalExpAmount += amt;
      const eRow = expSheet.addRow([
        idx + 1,
        e.expense_date || '—',
        e.category || 'EXPENSE',
        amt,
        e.payment_mode || '—',
        e.paid_to || e.incurred_by || safeTechName,
        e.utr_number || '—',
        e.remarks || '—'
      ]);
      eRow.height = 20;
      eRow.eachCell((cell, colIdx) => {
        cell.font = { name: 'Segoe UI', size: 9.5 };
        if (colIdx === 4) {
          cell.numFmt = '₹#,##0.00';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 || colIdx === 2 || colIdx === 5 ? 'center' : 'left' };
        }
      });
    });

    const eSummary = expSheet.addRow(['', '', 'TOTAL CLAIMS & ADVANCES', totalExpAmount, '', '', '', '']);
    eSummary.height = 24;
    eSummary.eachCell((cell, colIdx) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } };
      cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF6B21A8' } };
      if (colIdx === 4) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    });
  }

  // Trigger Download
  const cleanFilename = `${safeTechName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Installations_${new Date().toISOString().split('T')[0]}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Exports All Technicians Summary Leaderboard and aggregates to Excel (.xlsx)
 */
export async function exportAllTechniciansSummaryToExcel(technicians = [], options = {}) {
  const { dateRange = 'All Time', payoutRate = 0 } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.lastModifiedBy = 'Admin';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Technicians Leaderboard', {
    views: [{ showGridLines: true }]
  });

  const themeColor = '1E3A8A'; // Blue-900

  worksheet.columns = [
    { key: 'rank', width: 8 },
    { key: 'name', width: 24 },
    { key: 'fitments', width: 18 },
    { key: 'rate', width: 16 },
    { key: 'payout', width: 20 },
    { key: 'travel', width: 18 },
    { key: 'settled', width: 18 },
    { key: 'net_due', width: 20 },
    { key: 'stock', width: 16 },
    { key: 'location', width: 22 },
    { key: 'activity', width: 26 }
  ];

  // Title Banner
  worksheet.mergeCells('A1:K1');
  const titleRow = worksheet.getRow(1);
  titleRow.height = 36;
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `FUELTRACKS — TECHNICIANS & FITTERS PERFORMANCE LEADERBOARD`;
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${themeColor}` } };

  // Subtitle
  worksheet.mergeCells('A2:K2');
  const metaRow = worksheet.getRow(2);
  metaRow.height = 22;
  const metaCell = worksheet.getCell('A2');
  const totalFitments = technicians.reduce((sum, t) => sum + (t.total_installations || 0), 0);
  const totalNetDue = technicians.reduce((sum, t) => sum + (t.net_payout_due || 0), 0);
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  metaCell.value = `Total Technicians: ${technicians.length}    |    Total Completed Fitments: ${totalFitments}    |    Total Net Due: ₹${totalNetDue.toLocaleString('en-IN')}    |    Period: ${dateRange}    |    Exported: ${dateStr}`;
  metaCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };

  worksheet.addRow([]);
  worksheet.getRow(3).height = 8;

  // Header
  const headers = [
    'Rank',
    'Technician / Fitter Name',
    'Completed Fitments',
    'Rate (₹/Unit)',
    'Fitment Earnings (₹)',
    'Travel Claims (₹)',
    'Settled Advances (₹)',
    'Net Payable (₹)',
    'Stock In-Hand',
    'Primary Location',
    'Activity Period'
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF93C5FD' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } }
    };
  });

  // Rows
  let sumFitments = 0;
  let sumFitmentPayout = 0;
  let sumTravel = 0;
  let sumSettled = 0;
  let sumNetDue = 0;
  let sumStock = 0;

  technicians.forEach((t, idx) => {
    sumFitments += (t.total_installations || 0);
    const fitPayout = t.fitment_payout !== undefined ? t.fitment_payout : (t.total_installations * (parseFloat(payoutRate) || 0));
    sumFitmentPayout += fitPayout;
    sumTravel += (t.travel_expenses || 0);
    sumSettled += (t.payouts_settled || 0);
    sumNetDue += (t.net_payout_due !== undefined ? t.net_payout_due : fitPayout);
    sumStock += (t.floating_stock_count || 0);

    const actRange = t.first_install_date ? `${t.first_install_date} to ${t.last_install_date}` : 'Active';

    const row = worksheet.addRow([
      idx + 1,
      t.technician_name,
      t.total_installations,
      t.fitment_rate !== undefined ? t.fitment_rate : (parseFloat(payoutRate) || 0),
      fitPayout,
      t.travel_expenses || 0,
      t.payouts_settled || 0,
      t.net_payout_due !== undefined ? t.net_payout_due : fitPayout,
      t.floating_stock_count || 0,
      t.primary_location || 'Field',
      actRange
    ]);
    row.height = 22;

    const isEven = idx % 2 === 0;
    row.eachCell((cell, colIdx) => {
      cell.font = { name: 'Segoe UI', size: 9.5 };
      if (!isEven) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (colIdx === 1 || colIdx === 3 || colIdx === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colIdx === 4 || colIdx === 5 || colIdx === 6 || colIdx === 7 || colIdx === 8) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        if (colIdx === 8) {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF166534' } };
        }
      } else if (colIdx === 2) {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
      }
    });
  });

  // Summary Row
  if (technicians.length > 0) {
    const sumRow = worksheet.addRow([
      '',
      'TOTALS',
      sumFitments,
      '',
      sumFitmentPayout,
      sumTravel,
      sumSettled,
      sumNetDue,
      sumStock,
      '',
      ''
    ]);
    sumRow.height = 26;
    sumRow.eachCell((cell, colIdx) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
      if (colIdx === 5 || colIdx === 6 || colIdx === 7 || colIdx === 8) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colIdx === 2 || colIdx === 3 || colIdx === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  }

  const filename = `All_Technicians_Summary_${new Date().toISOString().split('T')[0]}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Downloads a pre-formatted Daily Installation Report Excel Template
 */
export async function downloadDailyInstallationTemplate() {
  const columns = [
    'IMEI Number',
    'Vehicle Number',
    'Customer Name',
    'Customer Phone',
    'Technician Name',
    'Installation Date',
    'Category',
    'Location / RTO',
    'Chassis Number',
    'Engine Number',
    'Aadhaar Number',
    'PAN Number',
    'Sale Price',
    'Payment Status',
    'Software User ID',
    'Software Password',
    'Remarks'
  ];

  await downloadStyledTemplate(
    `Daily_Installation_Report_Template_${new Date().toISOString().split('T')[0]}`,
    'Daily Installations',
    columns,
    '059669' // Emerald green header
  );
}

/**
 * Exports failed installation records to Excel for rapid correction and re-upload
 */
export async function downloadFailedInstallationsExcel(failedRows = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Failed Installations', {
    views: [{ showGridLines: true }]
  });

  const columns = [
    { header: 'Excel Row #', key: 'row_number', width: 14 },
    { header: 'Error / Issue Reason', key: 'reason', width: 36 },
    { header: 'IMEI Number', key: 'imei', width: 22 },
    { header: 'Vehicle Number', key: 'vehicle_number', width: 20 },
    { header: 'Customer Name', key: 'customer_name', width: 24 },
    { header: 'Customer Phone', key: 'phone', width: 18 }
  ];

  worksheet.columns = columns;

  // Style Header Row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE11D48' } // Crimson / Rose
    };
    cell.font = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Populate data
  failedRows.forEach((item, idx) => {
    const row = worksheet.addRow({
      row_number: item.row_number || idx + 2,
      reason: item.reason || 'Validation error',
      imei: item.imei || '',
      vehicle_number: item.vehicle_number || '',
      customer_name: item.customer_name || '',
      phone: item.phone || ''
    });

    row.height = 22;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (colNumber === 2) {
        // Reason column: highlight in light red text
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFBE123C' } };
      }
    });
  });

  const filename = `Failed_Installations_${new Date().toISOString().split('T')[0]}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Exports complete Dealer Partner Statement with custom date range, KPIs and detailed records
 */
export async function exportDealerStatementExcel(dealer = {}, devices = [], filters = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.created = new Date();

  const safeDealerName = (dealer.name || 'Dealer').replace(/[^a-zA-Z0-9_\s]/g, '_').substring(0, 25);
  const worksheet = workbook.addWorksheet(`${safeDealerName}_Statement`, {
    views: [{ showGridLines: true }]
  });

  const periodLabel = filters.dateRangeMode === 'CUSTOM'
    ? `${filters.startDate || 'Start'} to ${filters.endDate || 'End'}`
    : filters.dateRangeMode === 'TODAY'
    ? 'Today'
    : filters.dateRangeMode === 'YESTERDAY'
    ? 'Yesterday'
    : filters.dateRangeMode === 'THIS_MONTH'
    ? 'This Month'
    : 'All Time';

  // Calculate Metrics
  const totalUnits = devices.length;
  const installedCount = devices.filter(d => d.current_status === 'INSTALLED' || (d.vehicle_number && d.vehicle_number !== '-')).length;
  const inStockCount = totalUnits - installedCount;
  const paidCount = devices.filter(d => String(d.payment_status || '').toUpperCase().includes('REC') || String(d.payment_status || '').toUpperCase().includes('PAID')).length;
  const pendingCount = installedCount - paidCount;
  const totalValue = devices.reduce((sum, d) => sum + (Number(d.cost) || 0), 0);
  const paidAmount = devices.filter(d => String(d.payment_status || '').toUpperCase().includes('REC') || String(d.payment_status || '').toUpperCase().includes('PAID')).reduce((sum, d) => sum + (Number(d.cost) || 0), 0);
  const pendingAmount = totalValue - paidAmount;

  // Title Block
  worksheet.mergeCells('A1:K1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `DEALER PARTNER DOSSIER & STATEMENT — ${String(dealer.name || 'DEALER').toUpperCase()}`;
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 32;

  // Metadata Row 2
  worksheet.mergeCells('A2:K2');
  const metaCell = worksheet.getCell('A2');
  metaCell.value = `Region: ${dealer.region || 'Regional Hub'} | Phone: ${dealer.phone || '-'} | Filter Period: ${periodLabel} | Generated: ${new Date().toLocaleString('en-IN')}`;
  metaCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF334155' } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 22;

  // KPI Summary Row 3 & 4
  worksheet.mergeCells('A3:B3');
  worksheet.getCell('A3').value = 'Total Units';
  worksheet.getCell('A3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF475569' } };

  worksheet.mergeCells('C3:D3');
  worksheet.getCell('C3').value = 'Installed / Fitment';
  worksheet.getCell('C3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF166534' } };

  worksheet.mergeCells('E3:F3');
  worksheet.getCell('E3').value = 'In Dealer Stock';
  worksheet.getCell('E3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1E40AF' } };

  worksheet.mergeCells('G3:H3');
  worksheet.getCell('G3').value = 'Total Sales Value';
  worksheet.getCell('G3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF6B21A8' } };

  worksheet.mergeCells('I3:K3');
  worksheet.getCell('I3').value = 'Collection Status';
  worksheet.getCell('I3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF854D0E' } };

  worksheet.mergeCells('A4:B4');
  worksheet.getCell('A4').value = totalUnits;
  worksheet.getCell('A4').font = { name: 'Segoe UI', size: 14, bold: true };

  worksheet.mergeCells('C4:D4');
  worksheet.getCell('C4').value = `${installedCount} (${totalUnits > 0 ? Math.round((installedCount / totalUnits) * 100) : 0}%)`;
  worksheet.getCell('C4').font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF166534' } };

  worksheet.mergeCells('E4:F4');
  worksheet.getCell('E4').value = inStockCount;
  worksheet.getCell('E4').font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF1E40AF' } };

  worksheet.mergeCells('G4:H4');
  worksheet.getCell('G4').value = totalValue;
  worksheet.getCell('G4').numFmt = '₹#,##0.00';
  worksheet.getCell('G4').font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FF6B21A8' } };

  worksheet.mergeCells('I4:K4');
  worksheet.getCell('I4').value = `Paid: ₹${paidAmount.toLocaleString('en-IN')} | Pending: ₹${pendingAmount.toLocaleString('en-IN')}`;
  worksheet.getCell('I4').font = { name: 'Segoe UI', size: 9.5, bold: true };

  [3, 4].forEach(r => {
    const row = worksheet.getRow(r);
    row.height = 24;
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  // Empty spacer row 5
  worksheet.getRow(5).height = 10;

  // Table Headers Row 6
  const headers = [
    'Sl No',
    'IMEI Number',
    'Device Model',
    'Category',
    'Current Status',
    'Installation Date',
    'Vehicle Number',
    'Customer Name',
    'Customer Phone',
    'Sale Price / Amount',
    'Payment Status'
  ];

  const headerRow = worksheet.getRow(6);
  headerRow.values = headers;
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }; // Indigo header
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'medium', color: { argb: 'FF1E1B4B' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
  });

  // Populate data
  devices.forEach((d, idx) => {
    const isPaid = String(d.payment_status || '').toUpperCase().includes('REC') || String(d.payment_status || '').toUpperCase().includes('PAID');
    const cost = Number(d.cost) || 0;

    const row = worksheet.addRow([
      idx + 1,
      d.imei_number || '',
      d.device_type_name || '',
      d.device_type_category || 'GPS',
      d.current_status || 'WITH_DEALER',
      d.installation_date || '-',
      d.vehicle_number || '-',
      d.customer_name || '-',
      d.customer_phone || '-',
      cost,
      d.payment_status || (d.current_status === 'INSTALLED' ? 'PENDING' : '-')
    ]);

    row.height = 22;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        right: { style: 'thin', color: { argb: 'FFF1F5F9' } }
      };

      if (colNumber === 1 || colNumber === 5 || colNumber === 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 10) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
      } else if (colNumber === 11) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (isPaid) {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF166534' } };
        } else if (d.current_status === 'INSTALLED') {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB45309' } };
        }
      }
    });
  });

  // Auto-fit column widths
  worksheet.columns.forEach((column, i) => {
    let maxLength = headers[i] ? headers[i].length : 12;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const cellVal = cell.value ? String(cell.value) : '';
      if (cellVal.length > maxLength && cellVal.length < 50) {
        maxLength = cellVal.length;
      }
    });
    column.width = Math.max(maxLength + 4, 14);
  });

  const cleanPeriod = periodLabel.replace(/[^a-zA-Z0-9_\s]/g, '_');
  const filename = `${safeDealerName}_Sales_Statement_${cleanPeriod}_${new Date().toISOString().split('T')[0]}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a standardized Payment Excel Template formatted exactly for bulk payment reconciliation.
 */
export async function downloadPaymentExcelTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Payment_Upload_Template', {
    views: [{ showGridLines: true }]
  });

  const columns = [
    { header: 'PAYMENT DATE', key: 'payment_date', width: 16 },
    { header: 'CATEGORY', key: 'category', width: 16 },
    { header: 'VEHICLE NUM', key: 'vehicle_no', width: 18 },
    { header: 'CUSTOMER NAME', key: 'customer_name', width: 22 },
    { header: 'CUSTOMER PHONE NUMBER', key: 'customer_phone', width: 22 },
    { header: 'AMOUNT RECEIVED', key: 'amount_received', width: 18 },
    { header: 'PENDING AMT', key: 'pending_amt', width: 16 },
    { header: 'PAYMENT MODE', key: 'payment_mode', width: 16 },
    { header: 'RECEIVED BY', key: 'received_by', width: 18 },
    { header: 'DEALER/LOCATION', key: 'dealer_location', width: 22 }
  ];

  worksheet.columns = columns;

  // Header styling - Emerald/Teal Theme
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF059669' }
    };
    cell.font = {
      name: 'Segoe UI',
      size: 10.5,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center'
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF047857' } },
      left: { style: 'thin', color: { argb: 'FF047857' } },
      bottom: { style: 'medium', color: { argb: 'FF064E3B' } },
      right: { style: 'thin', color: { argb: 'FF047857' } }
    };
  });

  // Add 2 Sample Rows for guidance
  const todayStr = new Date().toISOString().split('T')[0];
  const sampleRows = [
    {
      payment_date: todayStr,
      category: 'DEVICE',
      vehicle_no: 'TS 09 UA 1234',
      customer_name: 'Ramesh Kumar',
      customer_phone: '9876543210',
      amount_received: 3500,
      pending_amt: 0,
      payment_mode: 'UPI / PhonePe',
      received_by: 'Madhu',
      dealer_location: 'Hyderabad Main'
    },
    {
      payment_date: todayStr,
      category: 'DEVICE',
      vehicle_no: 'AP 28 BC 5678',
      customer_name: 'Suresh Reddy',
      customer_phone: '9123456780',
      amount_received: 2000,
      pending_amt: 1500,
      payment_mode: 'Cash',
      received_by: 'Madhu',
      dealer_location: 'Zaheerabad Dealer'
    }
  ];

  sampleRows.forEach((sRow) => {
    const row = worksheet.addRow(sRow);
    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if (colNumber === 1 || colNumber === 3 || colNumber === 5 || colNumber === 8) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 6 || colNumber === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '₹#,##0.00';
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Payment_Upload_Template_${todayStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a consolidated Multi-Dealer Installation & Stock Matrix Excel Report
 * containing a Dealer Performance Summary sheet and a Detailed Installations Log sheet.
 */
export async function exportAllDealersMatrixExcel({ periodLabel = 'All Time', summary = {}, dealers = [], allRecords = [] }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FuelTracks IMS';
  workbook.lastModifiedBy = 'Admin';
  workbook.created = new Date();

  // -------------------------------------------------------------
  // SHEET 1: DEALER PERFORMANCE SUMMARY
  // -------------------------------------------------------------
  const summarySheet = workbook.addWorksheet('Dealer_Performance_Summary', {
    views: [{ showGridLines: true }]
  });

  // Title Block
  summarySheet.mergeCells('A1:L1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = `DEALER PARTNER PERFORMANCE & INSTALLATION MATRIX`;
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Slate-900
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  summarySheet.getRow(1).height = 34;

  // Subtitle / Filter Metadata
  summarySheet.mergeCells('A2:L2');
  const subCell = summarySheet.getCell('A2');
  subCell.value = `Filter Period: ${periodLabel} | Total Active Dealers: ${dealers.length} | Generated: ${new Date().toLocaleString('en-IN')}`;
  subCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF334155' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  summarySheet.getRow(2).height = 22;

  // KPI Block (Row 3 & 4)
  summarySheet.mergeCells('A3:B3');
  summarySheet.getCell('A3').value = 'Total Dealers';
  summarySheet.getCell('A3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF475569' } };

  summarySheet.mergeCells('C3:D3');
  summarySheet.getCell('C3').value = 'Installed in Selected Period';
  summarySheet.getCell('C3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF166534' } };

  summarySheet.mergeCells('E3:F3');
  summarySheet.getCell('E3').value = 'Total Stock Dispatched';
  summarySheet.getCell('E3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1E40AF' } };

  summarySheet.mergeCells('G3:H3');
  summarySheet.getCell('G3').value = 'Currently in Stock (Holding)';
  summarySheet.getCell('G3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFD97706' } };

  summarySheet.mergeCells('I3:J3');
  summarySheet.getCell('I3').value = 'Period Sales Value';
  summarySheet.getCell('I3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF6B21A8' } };

  summarySheet.mergeCells('K3:L3');
  summarySheet.getCell('K3').value = 'Period Collections';
  summarySheet.getCell('K3').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF0D9488' } };

  // KPI Values (Row 4)
  summarySheet.mergeCells('A4:B4');
  summarySheet.getCell('A4').value = dealers.length;
  summarySheet.getCell('A4').font = { name: 'Segoe UI', size: 14, bold: true };

  summarySheet.mergeCells('C4:D4');
  summarySheet.getCell('C4').value = `${summary.total_installed_in_period || 0} Units`;
  summarySheet.getCell('C4').font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF166534' } };

  summarySheet.mergeCells('E4:F4');
  summarySheet.getCell('E4').value = `${summary.total_assigned_stock || 0} Units`;
  summarySheet.getCell('E4').font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF1E40AF' } };

  summarySheet.mergeCells('G4:H4');
  summarySheet.getCell('G4').value = `${summary.total_in_stock || 0} Units`;
  summarySheet.getCell('G4').font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFD97706' } };

  summarySheet.mergeCells('I4:J4');
  summarySheet.getCell('I4').value = summary.total_revenue_in_period || 0;
  summarySheet.getCell('I4').numFmt = '₹#,##0.00';
  summarySheet.getCell('I4').font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FF6B21A8' } };

  summarySheet.mergeCells('K4:L4');
  summarySheet.getCell('K4').value = `Paid: ₹${(summary.total_paid_in_period || 0).toLocaleString('en-IN')} | Due: ₹${(summary.total_pending_in_period || 0).toLocaleString('en-IN')}`;
  summarySheet.getCell('K4').font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0D9488' } };

  [3, 4].forEach(r => {
    const row = summarySheet.getRow(r);
    row.height = 24;
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  // Spacer Row 5
  summarySheet.getRow(5).height = 10;

  // Table Headers (Row 6)
  const headers = [
    'Sl No',
    'Dealer Partner Name',
    'Region / Location',
    'Contact Phone',
    'Dispatched Stock',
    'Installed in Period',
    'Lifetime Installed',
    'Current In-Stock',
    'Install Rate %',
    'Period Revenue',
    'Period Collected (Paid)',
    'Period Pending (Due)'
  ];

  const headerRow = summarySheet.getRow(6);
  headerRow.values = headers;
  headerRow.height = 28;
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Navy Blue
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  // Data Rows
  let totalAssignedSum = 0;
  let installedInPeriodSum = 0;
  let installedAllTimeSum = 0;
  let inStockSum = 0;
  let revenueSum = 0;
  let paidSum = 0;
  let pendingSum = 0;

  dealers.forEach((d, idx) => {
    totalAssignedSum += (d.total_assigned || 0);
    installedInPeriodSum += (d.installed_in_period || 0);
    installedAllTimeSum += (d.installed_all_time || 0);
    inStockSum += (d.in_stock || 0);
    revenueSum += (d.revenue_in_period || 0);
    paidSum += (d.paid_in_period || 0);
    pendingSum += (d.pending_in_period || 0);

    const rate = d.total_assigned > 0 ? `${Math.round(((d.installed_in_period || 0) / d.total_assigned) * 100)}%` : '0%';

    const row = summarySheet.addRow([
      idx + 1,
      d.dealer_name || '',
      d.region || 'Regional Hub',
      d.phone || '-',
      d.total_assigned || 0,
      d.installed_in_period || 0,
      d.installed_all_time || 0,
      d.in_stock || 0,
      rate,
      d.revenue_in_period || 0,
      d.paid_in_period || 0,
      d.pending_in_period || 0
    ]);

    row.height = 22;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        right: { style: 'thin', color: { argb: 'FFF1F5F9' } }
      };

      if (colNumber === 1 || colNumber === 4 || colNumber === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 5 || colNumber === 6 || colNumber === 7 || colNumber === 8) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (colNumber === 6 && (d.installed_in_period || 0) > 0) {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF166534' } };
        }
      } else if (colNumber >= 10) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        if (colNumber === 10) cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
        if (colNumber === 11) cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF166534' } };
        if (colNumber === 12 && (d.pending_in_period || 0) > 0) cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FFB45309' } };
      }
    });
  });

  // Total Summary Row
  const totalRow = summarySheet.addRow([
    'TOTAL',
    `All ${dealers.length} Dealers`,
    '—',
    '—',
    totalAssignedSum,
    installedInPeriodSum,
    installedAllTimeSum,
    inStockSum,
    totalAssignedSum > 0 ? `${Math.round((installedInPeriodSum / totalAssignedSum) * 100)}%` : '0%',
    revenueSum,
    paidSum,
    pendingSum
  ]);

  totalRow.height = 26;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
    if (colNumber >= 5 && colNumber <= 9) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else if (colNumber >= 10) {
      cell.numFmt = '₹#,##0.00';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    }
  });

  // Auto-fit column widths
  summarySheet.columns.forEach((column, i) => {
    let maxLength = headers[i] ? headers[i].length : 12;
    column.eachCell({ includeEmpty: false }, cell => {
      const val = cell.value ? String(cell.value) : '';
      if (val.length > maxLength && val.length < 40) maxLength = val.length;
    });
    column.width = Math.max(maxLength + 4, 15);
  });

  // -------------------------------------------------------------
  // SHEET 2: DETAILED PERIOD INSTALLATIONS LOG
  // -------------------------------------------------------------
  const logSheet = workbook.addWorksheet('Period_Installations_Log', {
    views: [{ showGridLines: true }]
  });

  // Log Sheet Title
  logSheet.mergeCells('A1:L1');
  const logTitleCell = logSheet.getCell('A1');
  logTitleCell.value = `PERIOD INSTALLATIONS BREAKDOWN — ${periodLabel.toUpperCase()}`;
  logTitleCell.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  logTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } }; // Emerald-800
  logTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  logSheet.getRow(1).height = 30;

  const logHeaders = [
    'Sl No',
    'Dealer Partner',
    'Region',
    'IMEI / Device ID',
    'Device Model',
    'Category',
    'Installation Date',
    'Vehicle Number',
    'Customer Name',
    'Customer Phone',
    'Amount / Price',
    'Payment Status'
  ];

  const logHeaderRow = logSheet.getRow(2);
  logHeaderRow.values = logHeaders;
  logHeaderRow.height = 26;
  logHeaderRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }; // Emerald-600
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF064E3B' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  allRecords.forEach((rec, idx) => {
    const isPaid = String(rec.payment_status || '').toUpperCase() === 'PAID';
    const row = logSheet.addRow([
      idx + 1,
      rec.dealer_name || '',
      rec.dealer_region || 'Regional Hub',
      rec.imei_number || '',
      rec.device_type_name || '',
      rec.device_type_category || 'GPS Tracker',
      rec.installation_date || '-',
      rec.vehicle_number || '-',
      rec.customer_name || '-',
      rec.customer_phone || '-',
      rec.cost || 0,
      rec.payment_status || 'PENDING'
    ]);

    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        right: { style: 'thin', color: { argb: 'FFF1F5F9' } }
      };

      if (colNumber === 1 || colNumber === 4 || colNumber === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 11) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
      } else if (colNumber === 12) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: isPaid ? { argb: 'FF166534' } : { argb: 'FFB45309' } };
      }
    });
  });

  // Auto-fit column widths for Sheet 2
  logSheet.columns.forEach((column, i) => {
    let maxLength = logHeaders[i] ? logHeaders[i].length : 12;
    column.eachCell({ includeEmpty: false }, cell => {
      const val = cell.value ? String(cell.value) : '';
      if (val.length > maxLength && val.length < 40) maxLength = val.length;
    });
    logSheet.getColumn(i + 1).width = Math.max(maxLength + 4, 15);
  });

  // Write and Trigger Download
  const cleanPeriod = periodLabel.replace(/[^a-zA-Z0-9_\s-]/g, '_');
  const filename = `All_Dealers_Installation_Report_${cleanPeriod}_${new Date().toISOString().split('T')[0]}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}




