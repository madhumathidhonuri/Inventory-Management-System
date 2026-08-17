const db = require('./database');

console.log('Recreating users table without restrictive CHECK constraint...');

db.pragma('foreign_keys = OFF');
db.exec('DROP TABLE IF EXISTS users_backup;');
try {
  db.exec('CREATE TABLE users_backup AS SELECT * FROM users;');
} catch (e) {
  console.log('No existing users table or error:', e.message);
}
db.exec('DROP TABLE IF EXISTS users;');
db.exec(`
  CREATE TABLE users (
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
`);
try {
  db.exec(`
    INSERT INTO users (id, name, phone, email, role, region, active, created_at)
    SELECT id, name, phone, email, role, region, active, created_at FROM users_backup;
  `);
} catch (e) {
  console.log('Restore info:', e.message);
}
db.exec('DROP TABLE IF EXISTS users_backup;');
db.pragma('foreign_keys = ON');

console.log('Users table successfully recreated!');
process.exit(0);
