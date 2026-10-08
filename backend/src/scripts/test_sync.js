const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../../data/inventory.db'));
const { syncFitmentsToInstallations } = require('../db/syncFitments');

const syncRes = syncFitmentsToInstallations(db);
console.log('Sync Result:', syncRes);

const dates = db.prepare(`
  SELECT installation_date, count(*) as count 
  FROM installations 
  GROUP BY installation_date 
  ORDER BY count DESC 
  LIMIT 20
`).all();
console.log('\nUpdated Installation date breakdown:');
console.table(dates);

const today = new Date().toISOString().split('T')[0];
const todayInsts = db.prepare('SELECT count(*) as c FROM installations WHERE installation_date = ?').get(today);
console.log(`\nToday (${today}) count:`, todayInsts.c);
