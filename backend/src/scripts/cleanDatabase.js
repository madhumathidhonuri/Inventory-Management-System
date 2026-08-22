const db = require('../db/database');

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
