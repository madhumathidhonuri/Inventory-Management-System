const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '../../data');
const backupDir = path.join(dataDir, 'backups');

const allDbs = [
  ...fs.readdirSync(dataDir).filter(f => f.endsWith('.db')).map(f => path.join(dataDir, f)),
  ...fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).map(f => path.join(backupDir, f))
];

console.log('--- Scanning DB Snapshots ---');
for (const dbFile of allDbs) {
  try {
    const db = new Database(dbFile, { readonly: true });
    let instCount = 0, custCount = 0, devCount = 0, installedDevs = 0, batchesCount = 0;
    try { instCount = db.prepare('SELECT count(*) as c FROM installations').get().c; } catch {}
    try { custCount = db.prepare('SELECT count(*) as c FROM customers').get().c; } catch {}
    try { devCount = db.prepare('SELECT count(*) as c FROM devices').get().c; } catch {}
    try { installedDevs = db.prepare("SELECT count(*) as c FROM devices WHERE current_status = 'INSTALLED'").get().c; } catch {}
    try { batchesCount = db.prepare('SELECT count(*) as c FROM purchase_batches').get().c; } catch {}
    
    console.log(`${path.basename(dbFile)} -> Installs: ${instCount} | Custs: ${custCount} | Devs: ${devCount} | InstalledDevs: ${installedDevs} | Batches: ${batchesCount}`);
    db.close();
  } catch(e) {
    console.log(`${path.basename(dbFile)} -> Error: ${e.message}`);
  }
}
