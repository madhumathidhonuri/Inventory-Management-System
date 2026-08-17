const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'inventory.db');
const db = new Database(dbPath);

// Enable Foreign Keys & WAL mode for performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      password TEXT DEFAULT '123456',
      role TEXT NOT NULL,
      region TEXT DEFAULT 'All India',
      allowed_columns TEXT DEFAULT '[]',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS device_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK(category IN ('GPS Tracker', 'Fuel Sensor', 'Accessory', 'OBD Device')),
      custom_fields TEXT DEFAULT '{}',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      uploaded_by TEXT NOT NULL,
      vendor_name TEXT NOT NULL,
      device_type_id INTEGER NOT NULL,
      total_devices_count INTEGER DEFAULT 0,
      source_file TEXT,
      notes TEXT,
      FOREIGN KEY (device_type_id) REFERENCES device_types(id)
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imei_number TEXT UNIQUE NOT NULL,
      sim_number TEXT,
      device_type_id INTEGER NOT NULL,
      purchase_batch_id INTEGER,
      purchase_date TEXT NOT NULL,
      purchase_price REAL,
      vendor_name TEXT NOT NULL,
      current_status TEXT NOT NULL CHECK(current_status IN ('IN_WAREHOUSE', 'WITH_DEALER', 'INSTALLED', 'RETURNED', 'FAULTY', 'RMA')),
      current_holder_type TEXT DEFAULT 'WAREHOUSE',
      current_holder_id INTEGER,
      current_holder_name TEXT DEFAULT 'Central Warehouse',
      additional_attributes TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_type_id) REFERENCES device_types(id),
      FOREIGN KEY (purchase_batch_id) REFERENCES purchase_batches(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS dispatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatch_date TEXT NOT NULL,
      dispatched_by TEXT NOT NULL,
      dealer_name TEXT NOT NULL,
      dealer_contact TEXT,
      location TEXT NOT NULL,
      dispatch_type TEXT NOT NULL CHECK(dispatch_type IN ('DEALER', 'SALES_PERSON', 'OTHER')),
      device_count INTEGER NOT NULL DEFAULT 0,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'DISPATCHED' CHECK(status IN ('DISPATCHED', 'PARTIALLY_RETURNED', 'RETURNED', 'FULLY_INSTALLED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dispatch_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatch_id INTEGER NOT NULL,
      device_id INTEGER NOT NULL,
      imei_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DISPATCHED' CHECK(status IN ('DISPATCHED', 'INSTALLED', 'RETURNED')),
      FOREIGN KEY (dispatch_id) REFERENCES dispatches(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone_number TEXT UNIQUE NOT NULL,
      alternate_phone TEXT,
      email TEXT,
      address TEXT,
      customer_type TEXT DEFAULT 'Individual' CHECK(customer_type IN ('Individual', 'Fleet Owner', 'Business')),
      source TEXT DEFAULT 'Direct Entry',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      imei_number TEXT NOT NULL,
      customer_id INTEGER NOT NULL,
      installation_date TEXT NOT NULL,
      installed_by TEXT NOT NULL,
      sales_manager TEXT,
      sales_person TEXT,
      customer_name TEXT NOT NULL,
      customer_contact TEXT NOT NULL,
      vehicle_number TEXT NOT NULL,
      vehicle_type TEXT DEFAULT 'Car',
      sale_price REAL DEFAULT 0,
      installation_location TEXT NOT NULL,
      remarks TEXT,
      warranty_end_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS device_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      imei_number TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('PURCHASED', 'DISPATCHED', 'RETURNED', 'INSTALLED', 'STATUS_CHANGED')),
      event_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      from_holder TEXT,
      to_holder TEXT,
      performed_by TEXT NOT NULL,
      remarks TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      device_id INTEGER,
      imei_number TEXT,
      type TEXT NOT NULL CHECK(type IN ('PAYMENT_DUE', 'WARRANTY_EXPIRY', 'SERVICE_FOLLOWUP', 'AMC_RENEWAL')),
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'RESOLVED', 'DISMISSED')),
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );
  `);

  // Safe schema migrations for software credentials & payments
  try { db.exec("ALTER TABLE customers ADD COLUMN software_user_id TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE customers ADD COLUMN software_password TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE customers ADD COLUMN notes TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN software_user_id TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN software_password TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN payment_status TEXT DEFAULT 'PENDING';"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN password TEXT DEFAULT '123456';"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN allowed_columns TEXT DEFAULT '[]';"); } catch (e) {}
}

initDatabase();

module.exports = db;
