const db = require('../db/database');

console.log('=== FULL INVENTORY & DATABASE AUDIT REPORT ===');

try {
  // 1. Overview counts
  const totalDevices = db.prepare('SELECT count(*) as c FROM devices').get().c;
  const totalTypes = db.prepare('SELECT count(*) as c FROM device_types').get().c;
  const totalBatches = db.prepare('SELECT count(*) as c FROM purchase_batches').get().c;
  const totalInstallations = db.prepare('SELECT count(*) as c FROM installations').get().c;
  const totalHistory = db.prepare('SELECT count(*) as c FROM device_history').get().c;
  const totalExpenses = db.prepare('SELECT count(*) as c FROM expenses').get().c;
  const totalUsers = db.prepare('SELECT count(*) as c FROM users').get().c;

  console.log(`\n1. SYSTEM RECORD TOTALS:
   - Devices: ${totalDevices}
   - Device Types: ${totalTypes}
   - Purchase Batches: ${totalBatches}
   - Installations: ${totalInstallations}
   - History Events: ${totalHistory}
   - Expenses: ${totalExpenses}
   - Users: ${totalUsers}`);

  // 2. Duplicate IMEIs
  const dupImeis = db.prepare('SELECT imei_number, count(*) as c FROM devices GROUP BY imei_number HAVING c > 1').all();
  console.log(`\n2. DUPLICATE IMEIS: ${dupImeis.length === 0 ? '✅ NONE (All IMEIs Unique)' : `⚠️ FOUND ${dupImeis.length}`}`);
  if (dupImeis.length > 0) console.log(dupImeis);

  // 3. Corrupted JSON additional_attributes
  const allDevs = db.prepare('SELECT id, imei_number, additional_attributes FROM devices').all();
  let corruptJson = [];
  let nullAttrs = 0;
  for (const d of allDevs) {
    if (!d.additional_attributes) {
      nullAttrs++;
      continue;
    }
    try {
      JSON.parse(d.additional_attributes);
    } catch (e) {
      corruptJson.push({ id: d.id, imei: d.imei_number, err: e.message, raw: d.additional_attributes });
    }
  }
  console.log(`\n3. JSON ATTRIBUTES HEALTH:
   - Corrupted JSON records: ${corruptJson.length === 0 ? '✅ ZERO (All Valid JSON)' : `❌ ${corruptJson.length} CORRUPT RECORDS`}`);
  if (corruptJson.length > 0) console.log(corruptJson);

  // 4. Invalid device_type_id references
  const orphanTypes = db.prepare('SELECT d.id, d.imei_number, d.device_type_id FROM devices d LEFT JOIN device_types dt ON d.device_type_id = dt.id WHERE dt.id IS NULL').all();
  console.log(`\n4. ORPHANED DEVICE TYPES: ${orphanTypes.length === 0 ? '✅ NONE (All types exist)' : `⚠️ ${orphanTypes.length} ORPHANS`}`);
  if (orphanTypes.length > 0) console.log(orphanTypes);

  // 5. Status vs Installation table consistency
  const installedWithoutRecord = db.prepare(`
    SELECT d.id, d.imei_number, d.current_status, d.current_holder_name
    FROM devices d 
    LEFT JOIN installations i ON d.id = i.device_id 
    WHERE d.current_status = 'INSTALLED' AND i.id IS NULL
  `).all();
  console.log(`\n5. INSTALLED STATUS AUDIT:
   - Devices marked 'INSTALLED' without installation record: ${installedWithoutRecord.length === 0 ? '✅ ZERO' : `⚠️ ${installedWithoutRecord.length} DEVICES`}`);
  if (installedWithoutRecord.length > 0) console.log(installedWithoutRecord.slice(0, 10));

  // 6. Installation records with missing device
  const orphanInstallations = db.prepare(`
    SELECT i.id, i.imei_number, i.device_id, i.vehicle_number, i.customer_name
    FROM installations i 
    LEFT JOIN devices d ON i.device_id = d.id 
    WHERE d.id IS NULL
  `).all();
  console.log(`\n6. ORPHANED INSTALLATIONS: ${orphanInstallations.length === 0 ? '✅ ZERO (All linked to devices)' : `⚠️ ${orphanInstallations.length}`}`);
  if (orphanInstallations.length > 0) console.log(orphanInstallations);

  // 7. Payment Status & Price Integrity
  const badPrices = db.prepare(`
    SELECT id, imei_number, vehicle_number, sale_price, payment_status 
    FROM installations 
    WHERE sale_price IS NULL OR sale_price < 0 OR typeof(sale_price) != 'real' AND typeof(sale_price) != 'integer'
  `).all();
  console.log(`\n7. FINANCIAL / PRICING INTEGRITY:
   - Invalid / Negative / Non-numeric sale prices: ${badPrices.length === 0 ? '✅ ZERO (All numeric and valid)' : `⚠️ ${badPrices.length} ANOMALIES`}`);
  if (badPrices.length > 0) console.log(badPrices);

  // 8. Stock Place vs Holder consistency
  const unassignedWithDealer = db.prepare(`
    SELECT id, imei_number, current_status, current_holder_type, current_holder_name 
    FROM devices 
    WHERE current_status = 'AVAILABLE' AND current_holder_type = 'DEALER'
  `).all();
  console.log(`\n8. STOCK PLACE / DEALER HOLDER:
   - Available devices allocated with Dealer: ${unassignedWithDealer.length} devices`);

  // 9. SQLite PRAGMAs
  const integrity = db.pragma('integrity_check');
  const fkCheck = db.pragma('foreign_key_check');
  console.log(`\n9. SQLITE ENGINE INTEGRITY:
   - SQLite PRAGMA integrity_check: ${JSON.stringify(integrity)}
   - SQLite PRAGMA foreign_key_check: ${fkCheck.length === 0 ? '✅ ALL FOREIGN KEYS VALID' : JSON.stringify(fkCheck)}`);

  console.log('\n=== AUDIT COMPLETE ===');
} catch (err) {
  console.error('Audit execution error:', err);
}
process.exit(0);
