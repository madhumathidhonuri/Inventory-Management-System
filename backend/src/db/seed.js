const db = require('./database');

function seedDatabase() {
  console.log('Seeding database...');

  // Clear existing data
  db.exec(`
    DELETE FROM reminders;
    DELETE FROM device_history;
    DELETE FROM installations;
    DELETE FROM customers;
    DELETE FROM dispatch_items;
    DELETE FROM dispatches;
    DELETE FROM devices;
    DELETE FROM purchase_batches;
    DELETE FROM device_types;
    DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN ('reminders', 'device_history', 'installations', 'customers', 'dispatch_items', 'dispatches', 'devices', 'purchase_batches', 'device_types', 'users');
  `);

  // Insert Users
  const insertUser = db.prepare(`
    INSERT INTO users (name, phone, email, role, region)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertUser.run('Super Admin', '9876543210', 'admin@fueltracks.in', 'SUPER_ADMIN', 'All India');
  insertUser.run('Suresh Warehouse', '9876543211', 'suresh.wh@fueltracks.in', 'WAREHOUSE_MANAGER', 'South Zone');
  insertUser.run('Vikram Sales Mgr', '9876543212', 'vikram.sm@fueltracks.in', 'SALES_MANAGER', 'West Zone');
  insertUser.run('Rajesh Technician', '9876543213', 'rajesh.tech@fueltracks.in', 'INSTALLER', 'South Zone');
  insertUser.run('Apex Telematics (Dealer)', '9876543214', 'contact@apextelematics.com', 'DEALER', 'Bangalore Region');
  insertUser.run('Metro GPS Solutions (Dealer)', '9876543215', 'info@metrogps.com', 'DEALER', 'Mumbai Region');

  // Insert Device Types
  const insertType = db.prepare(`
    INSERT INTO device_types (name, category, custom_fields)
    VALUES (?, ?, ?)
  `);

  const t1 = insertType.run('Vamosys Pro GPS', 'GPS Tracker', JSON.stringify({ require_sim: true, voltage_range: '9-36V', waterproof: 'IP67' })).lastInsertRowid;
  const t2 = insertType.run('Tracknow OBD II', 'OBD Device', JSON.stringify({ require_sim: true, protocol: 'CAN-BUS' })).lastInsertRowid;
  const t3 = insertType.run('Volty Ultra Sensor', 'Fuel Sensor', JSON.stringify({ require_sim: false, probe_length_cm: 70, sensor_type: 'Capacitive' })).lastInsertRowid;
  const t4 = insertType.run('Basic Fleet Tracker', 'GPS Tracker', JSON.stringify({ require_sim: true, internal_battery: '300mAh' })).lastInsertRowid;
  const t5 = insertType.run('Fuel Pro Digital Probe', 'Fuel Sensor', JSON.stringify({ require_sim: false, digital_output: 'RS485' })).lastInsertRowid;

  // Insert Purchase Batch
  const insertBatch = db.prepare(`
    INSERT INTO purchase_batches (upload_date, uploaded_by, vendor_name, device_type_id, total_devices_count, source_file, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const b1 = insertBatch.run('2026-07-01', 'Suresh Warehouse', 'Vamosys Technologies Ltd', t1, 20, 'vamosys_july_stock.xlsx', 'Initial July shipment of 20 units').lastInsertRowid;
  const b2 = insertBatch.run('2026-07-15', 'Suresh Warehouse', 'Volty Electronics Corp', t3, 15, 'volty_sensors_batch2.xlsx', 'High precision capacitive fuel probes').lastInsertRowid;
  const b3 = insertBatch.run('2026-08-01', 'Super Admin', 'Tracknow India Pvt Ltd', t2, 10, 'tracknow_aug_obd.xlsx', 'OBD II trackers for commercial fleet').lastInsertRowid;

  // Insert Devices
  const insertDevice = db.prepare(`
    INSERT INTO devices (imei_number, sim_number, device_type_id, purchase_batch_id, purchase_date, purchase_price, vendor_name, current_status, current_holder_type, current_holder_id, current_holder_name, additional_attributes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertHistory = db.prepare(`
    INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Helper to generate IMEIs
  const devicesList = [];
  
  // 1. Warehouse devices (8 devices)
  for (let i = 1; i <= 8; i++) {
    const imei = `864920050019${100 + i}`;
    const sim = `899140009823000${10 + i}`;
    const id = insertDevice.run(imei, sim, t1, b1, '2026-07-01', 3450, 'Vamosys Technologies Ltd', 'IN_WAREHOUSE', 'WAREHOUSE', 1, 'Central Warehouse', JSON.stringify({ firmware: 'v2.4.1' })).lastInsertRowid;
    insertHistory.run(id, imei, 'PURCHASED', '2026-07-01 10:00:00', null, 'Central Warehouse', 'Suresh Warehouse', 'Purchased & stocked in central warehouse');
    devicesList.push({ id, imei, type: t1, status: 'IN_WAREHOUSE' });
  }

  // 2. Dealer devices (10 devices dispatched to Apex Telematics & Metro GPS)
  const d1 = db.prepare(`
    INSERT INTO dispatches (dispatch_date, dispatched_by, dealer_name, dealer_contact, location, dispatch_type, device_count, remarks, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('2026-07-10', 'Suresh Warehouse', 'Apex Telematics (Dealer)', '9876543214', 'Bangalore Central', 'DEALER', 6, 'Regular stock dispatch for South Bangalore', 'DISPATCHED').lastInsertRowid;

  const insertDispatchItem = db.prepare(`
    INSERT INTO dispatch_items (dispatch_id, device_id, imei_number, status)
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 9; i <= 14; i++) {
    const imei = `864920050019${100 + i}`;
    const sim = `899140009823000${10 + i}`;
    const id = insertDevice.run(imei, sim, t1, b1, '2026-07-01', 3450, 'Vamosys Technologies Ltd', 'WITH_DEALER', 'DEALER', 5, 'Apex Telematics (Dealer)', JSON.stringify({ firmware: 'v2.4.1' })).lastInsertRowid;
    
    insertHistory.run(id, imei, 'PURCHASED', '2026-07-01 10:00:00', null, 'Central Warehouse', 'Suresh Warehouse', 'Initial purchase upload');
    insertHistory.run(id, imei, 'DISPATCHED', '2026-07-10 14:30:00', 'Central Warehouse', 'Apex Telematics (Dealer)', 'Suresh Warehouse', 'Dispatched under Batch #' + d1);
    
    insertDispatchItem.run(d1, id, imei, 'DISPATCHED');
    devicesList.push({ id, imei, type: t1, status: 'WITH_DEALER' });
  }

  // 3. Installed devices with Customers & Vehicles (12 devices)
  const insertCustomer = db.prepare(`
    INSERT INTO customers (name, phone_number, alternate_phone, email, address, customer_type, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertInstallation = db.prepare(`
    INSERT INTO installations (device_id, imei_number, customer_id, installation_date, installed_by, sales_manager, sales_person, customer_name, customer_contact, vehicle_number, vehicle_type, sale_price, installation_location, remarks, warranty_end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const c1 = insertCustomer.run('Sharma Logistics Ltd', '9123456789', '080-2345678', 'fleet@sharmalogistics.com', 'Peenya Industrial Area, Bangalore', 'Fleet Owner', 'Installer WhatsApp Report').lastInsertRowid;
  const c2 = insertCustomer.run('Anand Kumar', '9811223344', null, 'anand.k@gmail.com', 'Koramangala 4th Block, Bangalore', 'Individual', 'Direct Entry').lastInsertRowid;
  const c3 = insertCustomer.run('TransIndia Transport Services', '9776655443', '9776655444', 'admin@transindia.in', 'Bhiwandi Truck Terminal, Mumbai', 'Business', 'Sales Executive').lastInsertRowid;

  const installedSamples = [
    { imei: '864920050019115', sim: '89914000982300015', typeId: t1, custId: c1, custName: 'Sharma Logistics Ltd', custPhone: '9123456789', veh: 'KA-01-MJ-8821', vehType: 'Heavy Truck (12 Wheeler)', price: 7500, date: '2026-07-18', installer: 'Rajesh Technician', sm: 'Vikram Sales Mgr', sp: 'Rajesh Technician', loc: 'Peenya Hub' },
    { imei: '864920050019116', sim: '89914000982300016', typeId: t1, custId: c1, custName: 'Sharma Logistics Ltd', custPhone: '9123456789', veh: 'KA-01-MJ-8822', vehType: 'Heavy Truck (10 Wheeler)', price: 7500, date: '2026-07-19', installer: 'Rajesh Technician', sm: 'Vikram Sales Mgr', sp: 'Rajesh Technician', loc: 'Peenya Hub' },
    { imei: '864920050019117', sim: '89914000982300017', typeId: t1, custId: c2, custName: 'Anand Kumar', custPhone: '9811223344', veh: 'KA-05-EV-1008', vehType: 'SUV (Toyota Fortuner)', price: 5500, date: '2026-07-25', installer: 'Rajesh Technician', sm: 'Vikram Sales Mgr', sp: 'Apex Telematics', loc: 'Koramangala' },
    { imei: '864920050019118', sim: '89914000982300018', typeId: t2, custId: c3, custName: 'TransIndia Transport Services', custPhone: '9776655443', veh: 'MH-12-PQ-4410', vehType: 'Container Truck', price: 6800, date: '2026-08-05', installer: 'Rajesh Technician', sm: 'Vikram Sales Mgr', sp: 'Metro GPS Solutions', loc: 'Bhiwandi Depot' },
  ];

  const installedDeviceIds = {};
  for (const item of installedSamples) {
    const id = insertDevice.run(item.imei, item.sim, item.typeId, b1, '2026-07-01', 3450, 'Vamosys Technologies Ltd', 'INSTALLED', 'CUSTOMER', item.custId, item.custName, JSON.stringify({ vehicle: item.veh })).lastInsertRowid;
    
    insertHistory.run(id, item.imei, 'PURCHASED', '2026-07-01 10:00:00', null, 'Central Warehouse', 'Suresh Warehouse', 'Batch stock upload');
    insertHistory.run(id, item.imei, 'DISPATCHED', '2026-07-10 14:30:00', 'Central Warehouse', item.sp, 'Suresh Warehouse', 'Dispatched to dealer/installer');
    insertHistory.run(id, item.imei, 'INSTALLED', item.date + ' 11:00:00', item.sp, `Customer: ${item.custName} (${item.veh})`, item.installer, `Installed in vehicle ${item.veh}`);

    insertInstallation.run(id, item.imei, item.custId, item.date, item.installer, item.sm, item.sp, item.custName, item.custPhone, item.veh, item.vehType, item.price, item.loc, '1-Year warranty activated', '2027-07-18');
    installedDeviceIds[item.imei] = id;
  }

  // 4. Faulty / Returned devices (2 devices)
  const f1Imei = '864920050019119';
  const f1Id = insertDevice.run(f1Imei, '89914000982300019', t3, b2, '2026-07-15', 4200, 'Volty Electronics Corp', 'FAULTY', 'WAREHOUSE', 1, 'Central Warehouse', JSON.stringify({ issue: 'Calib probe defect' })).lastInsertRowid;
  insertHistory.run(f1Id, f1Imei, 'PURCHASED', '2026-07-15 09:00:00', null, 'Central Warehouse', 'Suresh Warehouse', 'Batch upload');
  insertHistory.run(f1Id, f1Imei, 'STATUS_CHANGED', '2026-07-20 16:00:00', 'Central Warehouse', 'Central Warehouse (Faulty Bay)', 'Suresh Warehouse', 'Marked Faulty during pre-dispatch calibration test');

  // Insert Reminders
  const insertReminder = db.prepare(`
    INSERT INTO reminders (customer_id, device_id, imei_number, type, due_date, status, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertReminder.run(c1, installedDeviceIds['864920050019115'], '864920050019115', 'SERVICE_DUE', '2026-08-18', 'PENDING', '6-month sensor calibration check');
  insertReminder.run(c2, installedDeviceIds['864920050019117'], '864920050019117', 'WARRANTY_EXPIRY', '2027-07-25', 'PENDING', 'Annual subscription renewal due');

  console.log('Database successfully seeded with realistic sample data!');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
