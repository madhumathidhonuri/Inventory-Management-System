const fs = require('fs');
const path = require('path');
const db = require('../db/database');

console.log('--- Wiping all old device and transaction data ---');

db.exec('PRAGMA foreign_keys = OFF;');
db.exec('DELETE FROM reminders;');
db.exec('DELETE FROM device_history;');
db.exec('DELETE FROM inventory_audit_logs;');
db.exec('DELETE FROM installations;');
db.exec('DELETE FROM customers;');
db.exec('DELETE FROM dispatch_items;');
db.exec('DELETE FROM dispatches;');
db.exec('DELETE FROM devices;');
db.exec('DELETE FROM purchase_batches;');
try {
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('reminders', 'device_history', 'inventory_audit_logs', 'installations', 'customers', 'dispatch_items', 'dispatches', 'devices', 'purchase_batches');");
} catch (e) {}
db.exec('PRAGMA foreign_keys = ON;');
db.pragma('wal_checkpoint(TRUNCATE)');

console.log('--- Current Clean Database State ---');
console.log('Devices count:', db.prepare('SELECT count(*) as c FROM devices').get().c);
console.log('Purchase batches count:', db.prepare('SELECT count(*) as c FROM purchase_batches').get().c);
console.log('Dispatches count:', db.prepare('SELECT count(*) as c FROM dispatches').get().c);
console.log('Installations count:', db.prepare('SELECT count(*) as c FROM installations').get().c);
console.log('Customers count:', db.prepare('SELECT count(*) as c FROM customers').get().c);
console.log('Users count (Admin & Staff preserved):', db.prepare('SELECT count(*) as c FROM users').get().c);
console.log('Device types count (Preserved):', db.prepare('SELECT count(*) as c FROM device_types').get().c);

// Synchronize initial seed snapshot
const seedPath = path.join(__dirname, '../db/initial_seed.db');
const dbPath = path.join(__dirname, '../../data/inventory.db');
fs.copyFileSync(dbPath, seedPath);
console.log('--- initial_seed.db successfully updated to fresh clean state ---');

process.exit(0);
