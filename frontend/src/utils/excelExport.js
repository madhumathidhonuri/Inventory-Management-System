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
 * Exports complete live inventory dataset (e.g. Vamo list or filtered stock)
 * with all real IMEI numbers, VLTD SNo, SIM 1, SIM 2, Customer, and custom columns intact.
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

  // Determine all column keys: Core guaranteed fields first, then dynamic custom attributes
  const coreCols = [
    { header: 'IMEI Number', key: 'imei_number', width: 20 },
    { header: 'VLTD SNo', key: 'vltd_sno', width: 18 },
    { header: 'Sim 1', key: 'sim_1', width: 22 },
    { header: 'Sim 2', key: 'sim_2', width: 22 },
    { header: 'Customer', key: 'customer', width: 25 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Current Location', key: 'current_holder', width: 22 },
    { header: 'Vendor', key: 'vendor_name', width: 20 },
    { header: 'Purchase Price', key: 'purchase_price', width: 16 }
  ];

  // Add any extra custom columns from the list schema that are not already covered
  const extraCols = [];
  (customColumns || []).forEach(col => {
    const colLower = col.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isCore = ['imei', 'imeinumber', 'vltdsno', 'serial', 'sim1', 'sim2', 'simnumber', 'customer', 'customername', 'status', 'price', 'vendor'].some(c => colLower === c || colLower.includes(c));
    if (!isCore) {
      extraCols.push({
        header: col,
        key: `custom_${col}`,
        width: Math.max(col.length + 6, 18)
      });
    }
  });

  const allColumns = [...coreCols, ...extraCols];
  worksheet.columns = allColumns;

  // Style Header Row
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

  // Populate All Real Device Records
  devices.forEach((dev, index) => {
    const attrs = dev.additional_attributes || {};

    const imei = String(dev.imei_number || getAttrValue(attrs, ['imei', 'imeinumber', 'deviceid']) || '').trim();
    const vltdSno = getAttrValue(attrs, ['vltdsno', 'vltd serial', 'serialno', 'serial', 'device serial']) || '—';
    const sim1 = getAttrValue(attrs, ['sim 1', 'simno1', 'sim1', 'sim number']) || dev.sim_number || '—';
    const sim2 = getAttrValue(attrs, ['sim 2', 'simno2', 'sim2']) || '—';
    const customer = getAttrValue(attrs, ['customer name', 'customer', 'certificate issued to', 'name']) || dev.customer_name || '—';
    const status = dev.current_status || 'IN_WAREHOUSE';
    const currentHolder = dev.current_holder_name || 'Central Warehouse';
    const vendor = dev.vendor_name || getAttrValue(attrs, ['vendor', 'vendor name']) || 'Vamosys';
    const price = dev.purchase_price !== null && dev.purchase_price !== undefined ? dev.purchase_price : (getAttrValue(attrs, ['price', 'rate', 'cost']) || '—');

    const rowData = {
      imei_number: imei,
      vltd_sno: vltdSno,
      sim_1: sim1,
      sim_2: sim2,
      customer: customer,
      status: status,
      current_holder: currentHolder,
      vendor_name: vendor,
      purchase_price: price
    };

    // Populate extra custom column values
    extraCols.forEach(ec => {
      const val = attrs[ec.header] !== undefined ? attrs[ec.header] : (getAttrValue(attrs, [ec.header]) || '—');
      rowData[ec.key] = val;
    });

    const row = worksheet.addRow(rowData);
    row.height = 22;

    // Alternating zebra striping
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
