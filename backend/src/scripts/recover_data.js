const Database = require('better-sqlite3');
const path = require('path');

const curDb = new Database(path.join(__dirname, '../../data/inventory.db'));
const snapDb = new Database(path.join(__dirname, '../../data/inventory_snapshot_1790258318341.db'), { readonly: true });

const curCusts = new Set(curDb.prepare('SELECT phone_number FROM customers WHERE phone_number IS NOT NULL').all().map(c => c.phone_number));
const snapCusts = snapDb.prepare('SELECT * FROM customers WHERE phone_number IS NOT NULL').all();

const missingCusts = snapCusts.filter(c => !curCusts.has(c.phone_number));
console.log(`Missing customers in active DB compared to snapshot: ${missingCusts.length}`);

const curInstImeis = new Set(curDb.prepare('SELECT imei_number FROM installations').all().map(i => i.imei_number));
const snapInsts = snapDb.prepare('SELECT * FROM installations').all();
const missingInsts = snapInsts.filter(i => !curInstImeis.has(i.imei_number));
console.log(`Missing installations in active DB compared to snapshot: ${missingInsts.length}`);

if (missingCusts.length > 0) {
  console.log('Sample missing customer:', missingCusts[0]);
  const insertCust = curDb.prepare(`
    INSERT OR IGNORE INTO customers (name, phone_number, email, address, aadhar_number, pan_number, software_user_id, software_password, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of missingCusts) {
    insertCust.run(c.name, c.phone_number, c.email, c.address, c.aadhar_number, c.pan_number, c.software_user_id, c.software_password, c.created_at);
  }
  console.log(`Restored ${missingCusts.length} missing customers into active database.`);
}
