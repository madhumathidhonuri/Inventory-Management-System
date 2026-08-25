const db = require('./database');

function seedDatabase() {
  console.log('Seeding database with Jaya Surya Kurnool Dealer stock...');

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
    INSERT INTO users (name, phone, email, password, role, region)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertUser.run('Super Admin', '9876543210', 'admin@fueltracks.in', 'admin', 'SUPER_ADMIN', 'All India');
  insertUser.run('Operations Admin', '9876543211', 'operations@fueltracks.in', 'admin', 'ADMIN_TEAM', 'South Zone');
  insertUser.run('Sales Commercial', '9876543212', 'sales@fueltracks.in', 'sales', 'SALES_TEAM', 'South Zone');
  insertUser.run('Rajesh Technician', '9876543213', 'rajesh.tech@fueltracks.in', 'tech', 'INSTALLER', 'South Zone');
  
  // Specific Dealer Login: Jaya Surya in Kurnool
  insertUser.run('Jaya Surya', '9848012345', 'jayasurya@fueltracks.in', 'dealer', 'DEALER', 'Kurnool');
  insertUser.run('Apex Telematics', '9876543214', 'contact@apextelematics.com', 'dealer', 'DEALER', 'Bangalore Region');
  insertUser.run('Metro GPS Solutions', '9876543215', 'info@metrogps.com', 'dealer', 'DEALER', 'Mumbai Region');

  // Insert Device Types
  const insertType = db.prepare(`
    INSERT INTO device_types (name, category, custom_fields)
    VALUES (?, ?, ?)
  `);

  const t1 = insertType.run('VAMOSYS', 'GPS Tracker', JSON.stringify({})).lastInsertRowid;
  const t2 = insertType.run('TRACKNOW', 'GPS Tracker', JSON.stringify({})).lastInsertRowid;
  const t3 = insertType.run('VOLTY', 'GPS Tracker', JSON.stringify({})).lastInsertRowid;

  // Insert Purchase Batches
  const insertBatch = db.prepare(`
    INSERT INTO purchase_batches (upload_date, uploaded_by, vendor_name, device_type_id, total_devices_count, source_file, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const b1 = insertBatch.run('2026-07-01', 'Super Admin', 'Vamosys Technologies Ltd', t1, 80, 'vamosys_july_master.xlsx', 'Master shipment of Vamosys GPS devices').lastInsertRowid;
  const b2 = insertBatch.run('2026-07-15', 'Super Admin', 'Volty Electronics Corp', t3, 40, 'volty_sensors_batch2.xlsx', 'High precision capacitive fuel probes').lastInsertRowid;
  const b3 = insertBatch.run('2026-08-01', 'Super Admin', 'Tracknow India Pvt Ltd', t2, 25, 'tracknow_aug_obd.xlsx', 'OBD II trackers for commercial fleet').lastInsertRowid;

  // Insert Devices
  const insertDevice = db.prepare(`
    INSERT INTO devices (imei_number, sim_number, device_type_id, purchase_batch_id, purchase_date, purchase_price, vendor_name, current_status, current_holder_type, current_holder_id, current_holder_name, additional_attributes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertHistory = db.prepare(`
    INSERT INTO device_history (device_id, imei_number, event_type, event_date, from_holder, to_holder, performed_by, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDispatch = db.prepare(`
    INSERT INTO dispatches (dispatch_date, dispatched_by, dealer_name, dealer_contact, location, dispatch_type, device_count, remarks, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDispatchItem = db.prepare(`
    INSERT INTO dispatch_items (dispatch_id, device_id, imei_number, status)
    VALUES (?, ?, ?, ?)
  `);

  // =========================================================================
  // 1. SEED STOCK FOR JAYA SURYA (KURNOOL DEALER): 50 Vamo, 20 Volty, 5 Tracknow
  // =========================================================================
  const jayaDispatchId = insertDispatch.run(
    '2026-08-10 11:30:00',
    'Super Admin',
    'Jaya Surya',
    '9848012345',
    'Kurnool',
    'DEALER',
    75,
    'Stock allotment for Kurnool Region: 50 Vamo, 20 Volty, 5 Tracknow',
    'DISPATCHED'
  ).lastInsertRowid;

  // 1.A. 50 Vamo devices for Jaya Surya
  for (let i = 1; i <= 50; i++) {
    const imei = `8650100${String(10000 + i).slice(1)}`;
    const sim = `899140009823000${String(100 + i)}`;
    const id = insertDevice.run(
      imei,
      sim,
      t1,
      b1,
      '2026-07-01',
      3450,
      'Vamosys Technologies Ltd',
      'WITH_DEALER',
      'DEALER',
      5,
      'Jaya Surya',
      JSON.stringify({
        'STOCK PLACE': 'Jaya Surya (Kurnool)',
        'STOCK PLACE DATE': '2026-08-10',
        'RTO Location': 'Kurnool AP-21',
        'Firmware': 'v2.4.2'
      })
    ).lastInsertRowid;

    insertHistory.run(id, imei, 'PURCHASED', '2026-07-01 10:00:00', null, 'Central Warehouse', 'Super Admin', 'Master Purchase Batch #1');
    insertHistory.run(id, imei, 'DISPATCHED', '2026-08-10 11:30:00', 'Central Warehouse', 'Jaya Surya', 'Super Admin', `Dispatched under Dispatch #${jayaDispatchId} for Kurnool`);
    insertDispatchItem.run(jayaDispatchId, id, imei, 'DISPATCHED');
  }

  // 1.B. 20 Volty devices for Jaya Surya
  for (let i = 1; i <= 20; i++) {
    const imei = `8650200${String(10000 + i).slice(1)}`;
    const sim = `899140009824000${String(100 + i)}`;
    const id = insertDevice.run(
      imei,
      sim,
      t3,
      b2,
      '2026-07-15',
      4200,
      'Volty Electronics Corp',
      'WITH_DEALER',
      'DEALER',
      5,
      'Jaya Surya',
      JSON.stringify({
        'STOCK PLACE': 'Jaya Surya (Kurnool)',
        'STOCK PLACE DATE': '2026-08-10',
        'RTO Location': 'Kurnool AP-21',
        'Sensor Length': '700mm'
      })
    ).lastInsertRowid;

    insertHistory.run(id, imei, 'PURCHASED', '2026-07-15 10:00:00', null, 'Central Warehouse', 'Super Admin', 'Master Purchase Batch #2');
    insertHistory.run(id, imei, 'DISPATCHED', '2026-08-10 11:30:00', 'Central Warehouse', 'Jaya Surya', 'Super Admin', `Dispatched under Dispatch #${jayaDispatchId} for Kurnool`);
    insertDispatchItem.run(jayaDispatchId, id, imei, 'DISPATCHED');
  }

  // 1.C. 5 Tracknow devices for Jaya Surya
  for (let i = 1; i <= 5; i++) {
    const imei = `8650300${String(10000 + i).slice(1)}`;
    const sim = `899140009825000${String(100 + i)}`;
    const id = insertDevice.run(
      imei,
      sim,
      t2,
      b3,
      '2026-08-01',
      2900,
      'Tracknow India Pvt Ltd',
      'WITH_DEALER',
      'DEALER',
      5,
      'Jaya Surya',
      JSON.stringify({
        'STOCK PLACE': 'Jaya Surya (Kurnool)',
        'STOCK PLACE DATE': '2026-08-10',
        'RTO Location': 'Kurnool AP-21',
        'OBD Protocol': 'CAN-BUS ISO15765'
      })
    ).lastInsertRowid;

    insertHistory.run(id, imei, 'PURCHASED', '2026-08-01 10:00:00', null, 'Central Warehouse', 'Super Admin', 'Master Purchase Batch #3');
    insertHistory.run(id, imei, 'DISPATCHED', '2026-08-10 11:30:00', 'Central Warehouse', 'Jaya Surya', 'Super Admin', `Dispatched under Dispatch #${jayaDispatchId} for Kurnool`);
    insertDispatchItem.run(jayaDispatchId, id, imei, 'DISPATCHED');
  }

  // =========================================================================
  // 2. CENTRAL WAREHOUSE STOCK (15 Vamo, 10 Volty, 10 Tracknow)
  // =========================================================================
  for (let i = 51; i <= 65; i++) {
    const imei = `8650100${String(10000 + i).slice(1)}`;
    const sim = `899140009823000${String(100 + i)}`;
    const id = insertDevice.run(
      imei,
      sim,
      t1,
      b1,
      '2026-07-01',
      3450,
      'Vamosys Technologies Ltd',
      'IN_WAREHOUSE',
      'WAREHOUSE',
      1,
      'Central Warehouse',
      JSON.stringify({ 'STOCK PLACE': 'Central Warehouse Bangalore' })
    ).lastInsertRowid;
    insertHistory.run(id, imei, 'PURCHASED', '2026-07-01 10:00:00', null, 'Central Warehouse', 'Super Admin', 'Stocked in central warehouse');
  }

  for (let i = 21; i <= 30; i++) {
    const imei = `8650200${String(10000 + i).slice(1)}`;
    const sim = `899140009824000${String(100 + i)}`;
    const id = insertDevice.run(
      imei,
      sim,
      t3,
      b2,
      '2026-07-15',
      4200,
      'Volty Electronics Corp',
      'IN_WAREHOUSE',
      'WAREHOUSE',
      1,
      'Central Warehouse',
      JSON.stringify({ 'STOCK PLACE': 'Central Warehouse Bangalore' })
    ).lastInsertRowid;
    insertHistory.run(id, imei, 'PURCHASED', '2026-07-15 10:00:00', null, 'Central Warehouse', 'Super Admin', 'Stocked in central warehouse');
  }

  // =========================================================================
  // 3. OTHER DEALERS (Apex Telematics Bangalore: 10 Vamo)
  // =========================================================================
  const apexDispatchId = insertDispatch.run(
    '2026-07-20 14:00:00',
    'Super Admin',
    'Apex Telematics',
    '9876543214',
    'Bangalore Region',
    'DEALER',
    10,
    'Stock dispatch for South Bangalore',
    'DISPATCHED'
  ).lastInsertRowid;

  for (let i = 66; i <= 75; i++) {
    const imei = `8650100${String(10000 + i).slice(1)}`;
    const sim = `899140009823000${String(100 + i)}`;
    const id = insertDevice.run(
      imei,
      sim,
      t1,
      b1,
      '2026-07-01',
      3450,
      'Vamosys Technologies Ltd',
      'WITH_DEALER',
      'DEALER',
      6,
      'Apex Telematics',
      JSON.stringify({ 'STOCK PLACE': 'Apex Telematics Bangalore' })
    ).lastInsertRowid;
    insertHistory.run(id, imei, 'PURCHASED', '2026-07-01 10:00:00', null, 'Central Warehouse', 'Super Admin', 'Stock upload');
    insertHistory.run(id, imei, 'DISPATCHED', '2026-07-20 14:00:00', 'Central Warehouse', 'Apex Telematics', 'Super Admin', `Dispatched under Dispatch #${apexDispatchId}`);
    insertDispatchItem.run(apexDispatchId, id, imei, 'DISPATCHED');
  }

  // =========================================================================
  // 4. INSTALLED UNITS WITH VEHICLES & CUSTOMERS
  // =========================================================================
  const insertCustomer = db.prepare(`
    INSERT INTO customers (name, phone_number, alternate_phone, email, address, customer_type, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertInstallation = db.prepare(`
    INSERT INTO installations (device_id, imei_number, customer_id, installation_date, installed_by, sales_manager, sales_person, customer_name, customer_contact, vehicle_number, vehicle_type, sale_price, installation_location, remarks, warranty_end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const c1 = insertCustomer.run('Sharma Logistics Ltd', '9123456789', '080-2345678', 'fleet@sharmalogistics.com', 'Peenya Industrial Area, Bangalore', 'Fleet Owner', 'Installer WhatsApp Report').lastInsertRowid;
  const c2 = insertCustomer.run('Rayalaseema Transport', '9848099887', null, 'transport@rayalaseema.com', 'Old Bus Stand Road, Kurnool', 'Fleet Owner', 'Dealer Referral').lastInsertRowid;

  // Let's create an installation in Kurnool under Jaya Surya
  const kurnoolInstImei = '86501000001';
  const kurnoolDev = db.prepare('SELECT * FROM devices WHERE imei_number = ?').get(kurnoolInstImei);
  if (kurnoolDev) {
    db.prepare(`
      UPDATE devices
      SET current_status = 'INSTALLED',
          additional_attributes = json_set(additional_attributes, '$.\"Vehicle Number\"', 'AP-21-TX-9901', '$.\"Customer Name\"', 'Rayalaseema Transport', '$.\"Amount Received\"', 'RECEIVED')
      WHERE id = ?
    `).run(kurnoolDev.id);

    insertInstallation.run(
      kurnoolDev.id,
      kurnoolInstImei,
      c2,
      '2026-08-15',
      'Jaya Surya',
      'Sales Team',
      'Jaya Surya',
      'Rayalaseema Transport',
      '9848099887',
      'AP-21-TX-9901',
      'Ashok Leyland Truck (10 Wheeler)',
      7500,
      'Kurnool Auto Nagar',
      'Installed by Jaya Surya Kurnool team with 1-year live GPS tracking',
      '2027-08-15'
    );

    insertHistory.run(kurnoolDev.id, kurnoolInstImei, 'INSTALLED', '2026-08-15 15:00:00', 'Jaya Surya', 'Customer: Rayalaseema Transport (AP-21-TX-9901)', 'Jaya Surya', 'Installed in vehicle AP-21-TX-9901');
  }

  console.log('Database successfully seeded with Jaya Surya Kurnool stock:');
  console.log(' - Jaya Surya (Kurnool): 50 Vamo, 20 Volty, 5 Tracknow (Total: 75 devices)');
  console.log(' - Central Warehouse: 15 Vamo, 10 Volty');
  console.log(' - Apex Telematics: 10 Vamo');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
