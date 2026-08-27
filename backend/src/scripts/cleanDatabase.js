const db = require('../db/database');

async function cleanDb() {
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_RESET_DATABASE !== 'true') {
    console.error('❌ FATAL: Cannot run cleanDatabase in PRODUCTION mode! Operation aborted.');
    process.exit(1);
  }

  const devCount = db.prepare('SELECT count(*) as c FROM devices').get()?.c || 0;
  if (devCount > 0 && process.env.FORCE_RESET_DATABASE !== 'true') {
    console.warn('========================================================================');
    console.warn(`⚠️  DATA PROTECTION WARNING: Your database contains ${devCount} devices.`);
    console.warn('   Running cleanDatabase will reset all device states and dispatches.');
    console.warn('   If you are sure, run:');
    console.warn('   $env:FORCE_RESET_DATABASE="true"; node src/scripts/cleanDatabase.js');
    console.warn('========================================================================');
    return;
  }

  if (db.createBackup) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await db.createBackup(`inventory_pre_clean_backup_${timestamp}.db`);
  }

  const transaction = db.transaction(() => {
    // 1. Delete reminders & installations first (they reference customers)
    db.prepare('DELETE FROM reminders').run();
    db.prepare('DELETE FROM installations').run();
    db.prepare('DELETE FROM customers').run();

    // 2. Delete dispatches & dispatch items
    db.prepare('DELETE FROM dispatch_items').run();
    db.prepare('DELETE FROM dispatches').run();

    // 3. Delete dummy users (keep only Super Admin)
    db.prepare("DELETE FROM users WHERE role != 'SUPER_ADMIN'").run();

    // 4. Reset devices to clean IN_WAREHOUSE status
    const allDevices = db.prepare('SELECT id, additional_attributes FROM devices').all();
    const updateDevice = db.prepare(`
      UPDATE devices
      SET current_status = 'IN_WAREHOUSE',
          current_holder_type = 'WAREHOUSE',
          current_holder_id = 1,
          current_holder_name = 'Central Warehouse',
          additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    for (const dev of allDevices) {
      let attrs = {};
      try { attrs = JSON.parse(dev.additional_attributes || '{}'); } catch {}
      attrs['STOCK PLACE'] = 'Central Warehouse';
      delete attrs['DEALER'];
      delete attrs['dispatched_dealer'];
      updateDevice.run(JSON.stringify(attrs), dev.id);
    }

    // 5. Clean test history
    db.prepare("DELETE FROM device_history WHERE event_type != 'PURCHASED'").run();
  });

  transaction();
  console.log('✅ Database cleaned successfully! All default/test data removed.');
}

if (require.main === module) {
  cleanDb();
}

module.exports = cleanDb;

