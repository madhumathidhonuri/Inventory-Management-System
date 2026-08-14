const db = require('./database');

function clearDummyData() {
  console.log('Clearing all dummy inventory, dispatches, installations, and customer data...');

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

  console.log('Successfully cleared all dummy transactional data! Inventory stock is now at 0.');
}

if (require.main === module) {
  clearDummyData();
}

module.exports = clearDummyData;
