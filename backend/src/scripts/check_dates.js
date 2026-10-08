const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../../data/inventory.db'));

const res = db.prepare(`
  SELECT id, imei_number, customer_name, customer_contact, vehicle_number, installation_date, installed_by, created_at
  FROM installations
  WHERE installation_date LIKE '%2026-10-06%' OR installation_date LIKE '%06-10-2026%' OR installation_date LIKE '%06/10/2026%'
  LIMIT 10
`).all();

console.log('Sample 06-10-2026 installations:', res);

const allDates = db.prepare(`
  SELECT installation_date, count(*) as count 
  FROM installations 
  GROUP BY installation_date 
  ORDER BY count DESC 
  LIMIT 20
`).all();
console.log('Installation date breakdown:', allDates);
