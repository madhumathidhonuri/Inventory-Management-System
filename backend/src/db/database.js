const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure backups directory exists
const backupDir = path.join(dataDir, 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'inventory.db');

// Automated backup copy on startup if database exists
try {
  if (fs.existsSync(dbPath)) {
    const todayStr = new Date().toISOString().split('T')[0];
    const autoBackupPath = path.join(backupDir, `inventory_autobackup_${todayStr}.db`);
    if (!fs.existsSync(autoBackupPath)) {
      fs.copyFileSync(dbPath, autoBackupPath);
    }
  }
} catch (e) {
  console.warn('Auto-backup notice:', e.message);
}

const db = new Database(dbPath);

// Enable Foreign Keys & WAL mode for performance & data integrity
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Periodically run WAL checkpoint to ensure all transactions are flushed to disk
setInterval(() => {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (e) {}
}, 10 * 60 * 1000); // Every 10 minutes

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
  try { db.exec("ALTER TABLE customers ADD COLUMN aadhar_number TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE customers ADD COLUMN pan_number TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE customers ADD COLUMN notes TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN software_user_id TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN software_password TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN payment_status TEXT DEFAULT 'PENDING';"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN aadhar_number TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN pan_number TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN chasis_number TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN engine_number TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN amc_due_date TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE installations ADD COLUMN sim_expiry_date TEXT;"); } catch (e) {}

  // Enterprise SIM & RMA Tracking Columns
  try { db.exec("ALTER TABLE devices ADD COLUMN sim_operator TEXT DEFAULT 'Airtel';"); } catch (e) {}
  try { db.exec("ALTER TABLE devices ADD COLUMN sim_expiry_date TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE devices ADD COLUMN sim_status TEXT DEFAULT 'ACTIVE';"); } catch (e) {}
  try { db.exec("ALTER TABLE devices ADD COLUMN rma_status TEXT DEFAULT 'NONE';"); } catch (e) {}
  try { db.exec("ALTER TABLE devices ADD COLUMN rma_notes TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE devices ADD COLUMN rma_vendor_name TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE devices ADD COLUMN rma_replacement_imei TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE devices ADD COLUMN rma_date TEXT;"); } catch (e) {}

  // Excel Template Columns per Device Type
  try { db.exec("ALTER TABLE device_types ADD COLUMN template_columns TEXT DEFAULT '[]';"); } catch (e) {}

  // Digital Delivery Challan (DCN) Columns
  try { db.exec("ALTER TABLE dispatches ADD COLUMN challan_number TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE dispatches ADD COLUMN accepted_at DATETIME;"); } catch (e) {}
  try { db.exec("ALTER TABLE dispatches ADD COLUMN receiver_phone TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE dispatches ADD COLUMN transport_details TEXT;"); } catch (e) {}

  try { db.exec("ALTER TABLE users ADD COLUMN password TEXT DEFAULT '123456';"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN allowed_columns TEXT DEFAULT '[]';"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_devices_holder_name ON devices(current_holder_name);"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(current_status);"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_dispatches_dealer ON dispatches(dealer_name);"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_devices_rma_status ON devices(rma_status);"); } catch (e) {}

  // Automatically remove legacy mock dummy dealer numbers
  try {
    db.prepare("DELETE FROM users WHERE phone = '8096985742' OR email = 'allabakshu@gmail.com'").run();
  } catch (e) {}
}

initDatabase();

module.exports = db;
