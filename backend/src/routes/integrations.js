const express = require('express');
const router = express.Router();
const db = require('../db/database');
const https = require('https');
const http = require('http');

// Ensure integration logs table exists
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS integration_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT DEFAULT 'GOOGLE_FORM',
      imei_number TEXT,
      vehicle_number TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      technician_name TEXT,
      stock_place TEXT,
      payload_json TEXT,
      status TEXT DEFAULT 'SUCCESS',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
} catch (err) {
  console.error('Error creating integration_logs table:', err);
}

// Helper: Normalize incoming field keys from Google Form
function extractValueByPatterns(obj, patterns) {
  for (const [k, v] of Object.entries(obj)) {
    const cleanKey = k.trim().toLowerCase().replace(/[\s_\-]+/g, '');
    for (const pat of patterns) {
      if (cleanKey.includes(pat)) {
        if (Array.isArray(v)) return v[0] !== undefined ? String(v[0]).trim() : '';
        return v !== undefined && v !== null ? String(v).trim() : '';
      }
    }
  }
  return '';
}

// Helper: Parse Google Form payload (supports raw JSON, Apps Script namedValues, or standard body)
function parseGoogleFormPayload(body) {
  let data = { ...body };

  // If payload contains 'namedValues' (Google Apps Script Form Submit Trigger format)
  if (body.namedValues && typeof body.namedValues === 'object') {
    data = {};
    for (const [k, arr] of Object.entries(body.namedValues)) {
      data[k] = Array.isArray(arr) ? arr[0] : arr;
    }
  }

  // Also extract from standard parameters
  const imei = extractValueByPatterns(data, ['imei', 'deviceimei', 'serialnumber', 'deviceid', 'devicesn']) || data.imei_number || data.imei || '';
  const vehicleNumber = extractValueByPatterns(data, ['vehiclenumber', 'vehicleno', 'regno', 'registrationnumber', 'vehicle']) || data.vehicle_number || '';
  const customerName = extractValueByPatterns(data, ['customername', 'customer', 'partyname', 'clientname', 'name', 'certissuedto']) || data.customer_name || 'Customer';
  const customerPhone = extractValueByPatterns(data, ['customerphone', 'phone', 'mobile', 'customermobile', 'contactnumber', 'contact']) || data.customer_phone || '';
  const stockPlace = extractValueByPatterns(data, ['stockplace', 'dealername', 'dealer', 'branch', 'hub', 'location', 'place']) || data.stock_place || 'Field Installed';
  const technicianName = extractValueByPatterns(data, ['technicianname', 'technician', 'installer', 'engineer', 'installedby', 'submittedby', 'salesperson']) || data.technician_name || 'Field Technician';
  const paymentStatus = extractValueByPatterns(data, ['paymentstatus', 'amountreceived', 'payment', 'paidstatus', 'status']) || data.payment_status || 'PENDING';
  const cost = extractValueByPatterns(data, ['basecost', 'cost', 'equipmentcost', 'price', 'charge']) || data.cost || '4200';
  const gst = extractValueByPatterns(data, ['gst', 'tax', 'gstamount']) || data.gst || '756';
  const totalCost = extractValueByPatterns(data, ['totalcost', 'totalsaleprice', 'totalamount', 'grandtotal']) || data.total_cost || '4956';
  const dateVal = extractValueByPatterns(data, ['installationdate', 'date', 'stockplacedate', 'certificatedate', 'timestamp']) || data.date || new Date().toISOString().split('T')[0];
  const simNumber = extractValueByPatterns(data, ['simnumber', 'simno', 'sim', 'mobilenumber1', 'sim1']) || data.sim_number || '';
  const remarks = extractValueByPatterns(data, ['remarks', 'notes', 'comments', 'comment', 'description']) || data.remarks || '';
  const deviceTypeName = extractValueByPatterns(data, ['devicetype', 'brand', 'model', 'devicename']) || data.device_type_name || '';

  return {
    raw: data,
    imei: imei.replace(/[^0-9a-zA-Z]/g, '').trim(),
    vehicleNumber: vehicleNumber.toUpperCase().trim(),
    customerName: customerName.trim(),
    customerPhone: customerPhone.replace(/[^0-9]/g, '').trim(),
    stockPlace: stockPlace.toUpperCase().trim(),
    technicianName: technicianName.trim(),
    paymentStatus: paymentStatus.toUpperCase().includes('REC') || paymentStatus.toUpperCase().includes('PAID') ? 'RECEIVED' : 'PENDING',
    cost: parseFloat(cost.replace(/[^0-9.]/g, '')) || 4200,
    gst: parseFloat(gst.replace(/[^0-9.]/g, '')) || 756,
    totalCost: parseFloat(totalCost.replace(/[^0-9.]/g, '')) || 4956,
    date: dateVal,
    simNumber: simNumber.trim(),
    remarks: remarks.trim(),
    deviceTypeName: deviceTypeName.toUpperCase().trim()
  };
}

/**
 * POST /api/integrations/google-form
 * Webhook endpoint called when a Google Form is submitted by a dealer, technician, or admin
 */
router.post('/google-form', (req, res) => {
  try {
    const parsed = parseGoogleFormPayload(req.body);

    if (!parsed.imei) {
      return res.status(400).json({
        success: false,
        error: 'IMEI number is required to register or update inventory device.'
      });
    }

    // 1. Check if device exists in database
    const existingDevice = db.prepare('SELECT * FROM devices WHERE imei_number = ?').get(parsed.imei);

    let deviceId = null;
    let actionType = 'UPDATED';

    // Prepare updated attributes
    let existingAttrs = {};
    if (existingDevice && existingDevice.additional_attributes) {
      try { existingAttrs = JSON.parse(existingDevice.additional_attributes); } catch {}
    }

    // Merge Google Form fields into additional_attributes with clean standard keys
    const updatedAttrs = {
      ...existingAttrs,
      ...parsed.raw,
      'VEHICLE NUMBER': parsed.vehicleNumber || existingAttrs['VEHICLE NUMBER'] || '',
      'CUSTOMER NAME': parsed.customerName !== 'Customer' ? parsed.customerName : (existingAttrs['CUSTOMER NAME'] || parsed.customerName),
      'CUSTOMER PHONE NUMBER': parsed.customerPhone || existingAttrs['CUSTOMER PHONE NUMBER'] || '',
      'STOCK PLACE': parsed.stockPlace || existingAttrs['STOCK PLACE'] || 'Field Installed',
      'STOCK PLACE DATE': parsed.date || existingAttrs['STOCK PLACE DATE'] || new Date().toISOString().split('T')[0],
      'AMOUNT RECEIVED': parsed.paymentStatus,
      'COST': parsed.cost,
      'GST': parsed.gst,
      'TOTAL COST': parsed.totalCost,
      'TECHNICIAN NAME': parsed.technicianName,
      'LAST UPDATED VIA': 'GOOGLE_FORM',
      'FORM SUBMITTED AT': new Date().toISOString()
    };

    if (parsed.simNumber) {
      updatedAttrs['SIM NUMBER'] = parsed.simNumber;
    }
    if (parsed.remarks) {
      updatedAttrs['REMARKS'] = parsed.remarks;
    }

    const attrsJson = JSON.stringify(updatedAttrs);

    if (existingDevice) {
      // Update existing device
      deviceId = existingDevice.id;
      db.prepare(`
        UPDATE devices SET
          current_status = 'INSTALLED',
          current_holder_name = ?,
          current_holder_type = 'CUSTOMER',
          sim_number = COALESCE(NULLIF(?, ''), sim_number),
          additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        parsed.stockPlace || existingDevice.current_holder_name || 'Field Installed',
        parsed.simNumber || '',
        attrsJson,
        deviceId
      );

      actionType = 'INSTALLED_VIA_GOOGLE_FORM';
    } else {
      // Find matching device type or fallback to first available
      let typeId = 1;
      if (parsed.deviceTypeName) {
        const matchedType = db.prepare('SELECT id FROM device_types WHERE UPPER(name) LIKE ?').get(`%${parsed.deviceTypeName}%`);
        if (matchedType) typeId = matchedType.id;
      }
      if (!typeId) {
        const firstType = db.prepare('SELECT id FROM device_types LIMIT 1').get();
        if (firstType) typeId = firstType.id;
      }

      // Insert new device
      const insertRes = db.prepare(`
        INSERT INTO devices (
          imei_number, device_type_id, sim_number, purchase_date,
          vendor_name, current_status, current_holder_name,
          current_holder_type, purchase_price, additional_attributes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'INSTALLED', ?, 'CUSTOMER', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        parsed.imei,
        typeId,
        parsed.simNumber || null,
        parsed.date || new Date().toISOString().split('T')[0],
        parsed.deviceTypeName || 'Field Installation',
        parsed.stockPlace || 'Field Installed',
        parsed.totalCost,
        attrsJson
      );

      deviceId = insertRes.lastInsertRowid;
      actionType = 'CREATED_VIA_GOOGLE_FORM';
    }

    // 2. Link or create Customer in customers table
    if (parsed.customerPhone || (parsed.customerName && parsed.customerName !== 'Customer')) {
      try {
        const cleanPhone = parsed.customerPhone || '0000000000';
        const existingCust = db.prepare('SELECT id FROM customers WHERE phone = ? OR name = ?').get(cleanPhone, parsed.customerName);
        let custId = existingCust ? existingCust.id : null;

        if (!custId && parsed.customerName && parsed.customerName !== 'Customer') {
          const custRes = db.prepare(`
            INSERT INTO customers (name, phone, address, created_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          `).run(parsed.customerName, cleanPhone, parsed.stockPlace || '');
          custId = custRes.lastInsertRowid;
        }

        if (custId && deviceId) {
          // Record installation
          db.prepare(`
            INSERT INTO installations (
              device_id, customer_id, vehicle_number, installation_date,
              installed_by, certificate_number, status, remarks, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, CURRENT_TIMESTAMP)
          `).run(
            deviceId,
            custId,
            parsed.vehicleNumber || 'VEHICLE',
            parsed.date,
            parsed.technicianName,
            `AIS140-GF-${parsed.imei.slice(-6)}`,
            `Registered via Google Form submission by ${parsed.technicianName}`
          );
        }
      } catch (custErr) {
        console.warn('Customer auto-link warning:', custErr.message);
      }
    }

    // 3. Log into Audit / Device History
    try {
      db.prepare(`
        INSERT INTO device_history (
          device_id, event_type, from_holder, to_holder,
          remarks, performed_by, event_date
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        deviceId,
        actionType,
        existingDevice ? existingDevice.current_holder_name : 'New Form Entry',
        parsed.stockPlace || 'Field Installed',
        `Vehicle: ${parsed.vehicleNumber || 'N/A'} | Customer: ${parsed.customerName} | Tech: ${parsed.technicianName} | Payment: ${parsed.paymentStatus}`,
        parsed.technicianName || 'Google Form Webhook'
      );
    } catch (histErr) {
      console.warn('History log warning:', histErr.message);
    }

    // 4. Record in Integration Logs
    try {
      db.prepare(`
        INSERT INTO integration_logs (
          source, imei_number, vehicle_number, customer_name,
          customer_phone, technician_name, stock_place, payload_json, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS')
      `).run(
        'GOOGLE_FORM',
        parsed.imei,
        parsed.vehicleNumber,
        parsed.customerName,
        parsed.customerPhone,
        parsed.technicianName,
        parsed.stockPlace,
        JSON.stringify(req.body)
      );
    } catch (logErr) {
      console.warn('Integration log warning:', logErr.message);
    }

    return res.json({
      success: true,
      message: `Device ${parsed.imei} (${parsed.vehicleNumber || 'Installed'}) synchronized into FuelTracks inventory successfully!`,
      data: {
        device_id: deviceId,
        imei: parsed.imei,
        vehicle_number: parsed.vehicleNumber,
        customer_name: parsed.customerName,
        customer_phone: parsed.customerPhone,
        payment_status: parsed.paymentStatus,
        stock_place: parsed.stockPlace,
        action: actionType
      }
    });

  } catch (err) {
    console.error('Google Form Webhook Error:', err);

    // Log failure
    try {
      db.prepare(`
        INSERT INTO integration_logs (source, payload_json, status, error_message)
        VALUES ('GOOGLE_FORM', ?, 'ERROR', ?)
      `).run(JSON.stringify(req.body || {}), err.message);
    } catch {}

    return res.status(500).json({
      success: false,
      error: 'Failed to process Google Form submission: ' + err.message
    });
  }
});

/**
 * GET /api/integrations/logs
 * Retrieve recent Google Form / Sheet webhook activity logs
 */
router.get('/logs', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM integration_logs
      ORDER BY id DESC
      LIMIT 50
    `).all();

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_received,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) as error_count
      FROM integration_logs
    `).get();

    res.json({
      success: true,
      data: {
        stats: stats || { total_received: 0, success_count: 0, error_count: 0 },
        logs
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/integrations/sync-google-sheet
 * Pull and synchronize a live public/published Google Sheet CSV URL
 */
router.post('/sync-google-sheet', async (req, res) => {
  const { sheet_url } = req.body;

  if (!sheet_url) {
    return res.status(400).json({ success: false, error: 'Google Sheet URL or Published CSV URL is required.' });
  }

  try {
    // Transform standard Google Sheet link into CSV export link if needed
    let csvUrl = sheet_url.trim();
    if (csvUrl.includes('/edit') || csvUrl.includes('/view')) {
      const match = csvUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
      }
    }

    // Fetch CSV content via HTTP/HTTPS with redirect follow
    const fetchCsv = (url) => {
      return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            return resolve(fetchCsv(response.headers.location));
          }
          if (response.statusCode !== 200) {
            return reject(new Error(`Failed to fetch Google Sheet: HTTP ${response.statusCode}`));
          }
          let data = '';
          response.on('data', chunk => { data += chunk; });
          response.on('end', () => resolve(data));
        }).on('error', reject);
      });
    };

    const csvContent = await fetchCsv(csvUrl);

    // Parse CSV rows
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      return res.status(400).json({ success: false, error: 'Google Sheet appears empty or has no data rows.' });
    }

    // Split CSV line respecting quotes
    const parseCsvLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result.map(c => c.replace(/^"|"$/g, '').trim());
    };

    const headers = parseCsvLine(lines[0]);
    let syncedCount = 0;
    let updatedCount = 0;
    let insertedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const rowVals = parseCsvLine(lines[i]);
      if (rowVals.length === 0 || rowVals.every(v => !v)) continue;

      const rowObj = {};
      headers.forEach((h, idx) => {
        if (h) rowObj[h] = rowVals[idx] || '';
      });

      const parsed = parseGoogleFormPayload(rowObj);
      if (!parsed.imei) continue;

      const existingDevice = db.prepare('SELECT id, additional_attributes FROM devices WHERE imei_number = ?').get(parsed.imei);

      let existingAttrs = {};
      if (existingDevice && existingDevice.additional_attributes) {
        try { existingAttrs = JSON.parse(existingDevice.additional_attributes); } catch {}
      }

      const mergedAttrs = {
        ...existingAttrs,
        ...rowObj,
        'VEHICLE NUMBER': parsed.vehicleNumber || existingAttrs['VEHICLE NUMBER'] || '',
        'CUSTOMER NAME': parsed.customerName !== 'Customer' ? parsed.customerName : (existingAttrs['CUSTOMER NAME'] || parsed.customerName),
        'CUSTOMER PHONE NUMBER': parsed.customerPhone || existingAttrs['CUSTOMER PHONE NUMBER'] || '',
        'STOCK PLACE': parsed.stockPlace || existingAttrs['STOCK PLACE'] || 'Google Sheet Sync',
        'AMOUNT RECEIVED': parsed.paymentStatus,
        'LAST SYNCED FROM': 'GOOGLE_SHEET',
        'SYNCED AT': new Date().toISOString()
      };

      const attrsJson = JSON.stringify(mergedAttrs);

      if (existingDevice) {
        db.prepare(`
          UPDATE devices SET
            current_status = 'INSTALLED',
            current_holder_name = ?,
            sim_number = COALESCE(NULLIF(?, ''), sim_number),
            additional_attributes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(parsed.stockPlace || 'Google Sheet Sync', parsed.simNumber || '', attrsJson, existingDevice.id);
        updatedCount++;
      } else {
        const firstType = db.prepare('SELECT id FROM device_types LIMIT 1').get();
        db.prepare(`
          INSERT INTO devices (
            imei_number, device_type_id, sim_number, purchase_date,
            vendor_name, current_status, current_holder_name,
            current_holder_type, purchase_price, additional_attributes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'INSTALLED', ?, 'CUSTOMER', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          parsed.imei,
          firstType ? firstType.id : 1,
          parsed.simNumber || null,
          parsed.date || new Date().toISOString().split('T')[0],
          parsed.deviceTypeName || 'Google Sheet Sync',
          parsed.stockPlace || 'Google Sheet Sync',
          parsed.totalCost,
          attrsJson
        );
        insertedCount++;
      }
      syncedCount++;
    }

    // Log the sync
    db.prepare(`
      INSERT INTO integration_logs (source, payload_json, status, error_message)
      VALUES ('GOOGLE_SHEET_SYNC', ?, 'SUCCESS', ?)
    `).run(sheet_url, `Synced ${syncedCount} rows (${insertedCount} new, ${updatedCount} updated)`);

    return res.json({
      success: true,
      message: `Successfully synchronized ${syncedCount} records from Google Sheet!`,
      data: {
        total_synced: syncedCount,
        inserted_count: insertedCount,
        updated_count: updatedCount
      }
    });

  } catch (err) {
    console.error('Google Sheet Sync Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to sync Google Sheet: ' + err.message });
  }
});

/**
 * GET /api/integrations/google-script-code
 * Returns ready-to-copy Google Apps Script code for Google Forms
 */
router.get('/google-script-code', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol || 'http';
  const webhookUrl = `${protocol}://${host}/api/integrations/google-form`;

  const scriptCode = `/**
 * Google Apps Script for FuelTracks Live Google Form & Inventory Sync
 * Attach this to your Google Form or Google Sheet:
 * 1. Open Google Form -> Click 3 dots (top right) -> Script editor
 * 2. Paste this code and save.
 * 3. Click Triggers (clock icon on left) -> Add Trigger -> Choose function: onFormSubmit -> Event type: On form submit -> Save!
 */

const FUELTRACKS_WEBHOOK_URL = "${webhookUrl}";

function onFormSubmit(e) {
  try {
    var payload = {};
    
    // If triggered from Google Form
    if (e.response) {
      var itemResponses = e.response.getItemResponses();
      for (var i = 0; i < itemResponses.length; i++) {
        var itemResponse = itemResponses[i];
        var title = itemResponse.getItem().getTitle();
        var answer = itemResponse.getResponse();
        payload[title] = answer;
      }
    } 
    // If triggered from linked Google Sheet
    else if (e.namedValues) {
      payload = e.namedValues;
    } else if (e.values) {
      payload = { values: e.values };
    }

    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(FUELTRACKS_WEBHOOK_URL, options);
    Logger.log("FuelTracks Response: " + response.getContentText());
  } catch (err) {
    Logger.log("Error posting to FuelTracks: " + err.toString());
  }
}`;

  res.json({
    success: true,
    webhook_url: webhookUrl,
    script_code: scriptCode
  });
});

module.exports = router;
