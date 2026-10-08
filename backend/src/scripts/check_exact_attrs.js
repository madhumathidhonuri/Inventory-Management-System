const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../../data/inventory.db'));

const row = db.prepare(`
  SELECT i.*, d.additional_attributes as device_attrs
  FROM installations i
  LEFT JOIN devices d ON i.device_id = d.id
  WHERE i.imei_number = '861329080309769'
`).get();

const attrs = JSON.parse(row.device_attrs || '{}');
console.log('Attributes for DHANEKULAVANI:', {
  'INSTALLATION DATE': attrs['INSTALLATION DATE'],
  'CERTIFICATE ISSUED DATE': attrs['CERTIFICATE ISSUED DATE'],
  'STOCK PLACE DATE': attrs['STOCK PLACE DATE'],
  'PAYMENT DATE': attrs['PAYMENT DATE'],
  'DATE': attrs['DATE'],
  'raw_installation_date_in_table': row.installation_date,
  all_attrs: attrs
});
