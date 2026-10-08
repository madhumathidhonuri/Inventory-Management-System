const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../../data/inventory.db'));

const allRows = db.prepare(`
  SELECT i.*, d.additional_attributes as device_attrs, d.created_at as dev_created, d.purchase_date
  FROM installations i
  LEFT JOIN devices d ON i.device_id = d.id
  ORDER BY i.id DESC
`).all();

const { extractInstallationDate } = require('../db/syncFitments');

let undatedCount = 0;
const sampleUndated = [];

for (const row of allRows) {
  let attrs = {};
  try { attrs = JSON.parse(row.device_attrs || '{}'); } catch {}
  const d = extractInstallationDate(row, attrs) || row.installation_date;
  if (!d || !String(d).trim()) {
    undatedCount++;
    if (sampleUndated.length < 5) {
      sampleUndated.push({
        id: row.id,
        imei: row.imei_number,
        customer_name: row.customer_name,
        vehicle_number: row.vehicle_number,
        created_at: row.created_at,
        dev_created: row.dev_created,
        purchase_date: row.purchase_date,
        keys: Object.keys(attrs)
      });
    }
  }
}

console.log('Undated installation count:', undatedCount);
console.log('Sample undated installations:', JSON.stringify(sampleUndated, null, 2));
