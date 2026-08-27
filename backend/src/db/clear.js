const db = require('./database');

async function clearDummyData() {
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_RESET_DATABASE !== 'true') {
    console.error('❌ FATAL: Cannot run clear script in PRODUCTION mode! Operation aborted to prevent data loss.');
    process.exit(1);
  }

  const devCount = db.prepare('SELECT count(*) as c FROM devices').get()?.c || 0;
  if (devCount > 0 && process.env.FORCE_RESET_DATABASE !== 'true') {
    console.warn('========================================================================');
    console.warn(`⚠️  DATA PROTECTION WARNING: Your database contains ${devCount} devices.`);
    console.warn('   Running clear will DELETE all devices and transactions.');
    console.warn('   If you are sure, run:');
    console.warn('   $env:FORCE_RESET_DATABASE="true"; npm run clear  (PowerShell)');
    console.warn('========================================================================');
    return;
  }

  if (db.createBackup) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await db.createBackup(`inventory_pre_clear_backup_${timestamp}.db`);
  }

  console.log('Clearing inventory, dispatches, installations, and customer data...');

  db.exec(`
    DELETE FROM reminders;
    DELETE FROM device_history;
    DELETE FROM installations;
    DELETE FROM customers;
    DELETE FROM dispatch_items;
    DELETE FROM dispatches;
    DELETE FROM devices;
    DELETE FROM purchase_batches;
  `);

  console.log('Cleared transactional data! Inventory stock is now at 0.');
}

if (require.main === module) {
  clearDummyData();
}

module.exports = clearDummyData;

