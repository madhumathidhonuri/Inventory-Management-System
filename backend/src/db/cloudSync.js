const fs = require('fs');
const path = require('path');
const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'inventory.db');
const backupDir = path.join(dataDir, 'backups');

const config = {
  endpoint: process.env.S3_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT || process.env.SUPABASE_S3_ENDPOINT || null,
  bucket: process.env.S3_BUCKET || process.env.CLOUDFLARE_R2_BUCKET || process.env.SUPABASE_S3_BUCKET || 'ims-database-backup',
  accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || null,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || null,
  region: process.env.S3_REGION || process.env.AWS_REGION || 'auto',
  dbKey: process.env.S3_DB_KEY || 'inventory.db',
};

let s3Client = null;
let syncStatus = {
  configured: false,
  provider: 'None (Local Storage)',
  bucket: config.bucket,
  lastSyncTime: null,
  lastSyncStatus: 'IDLE',
  lastSyncSize: 0,
  lastError: null,
};

function getClient() {
  if (s3Client) return s3Client;
  if (!config.endpoint && !config.accessKeyId) {
    return null;
  }
  try {
    s3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
    syncStatus.configured = true;
    if (config.endpoint && config.endpoint.includes('r2.cloudflarestorage.com')) {
      syncStatus.provider = 'Cloudflare R2';
    } else if (config.endpoint && config.endpoint.includes('supabase.co')) {
      syncStatus.provider = 'Supabase S3 Storage';
    } else if (config.endpoint && config.endpoint.includes('backblazeb2.com')) {
      syncStatus.provider = 'Backblaze B2';
    } else {
      syncStatus.provider = 'S3 Compatible Cloud Storage';
    }
    return s3Client;
  } catch (err) {
    console.error('[CloudSync] Failed to initialize S3 client:', err.message);
    syncStatus.lastError = err.message;
    return null;
  }
}

function isConfigured() {
  return !!getClient();
}

/**
 * Downloads latest inventory.db from cloud storage on boot if available.
 */
async function restoreFromCloud() {
  const client = getClient();
  if (!client) {
    console.log('[CloudSync] No cloud storage credentials configured. Using local SQLite.');
    return false;
  }

  console.log(`[CloudSync] Checking cloud storage (${syncStatus.provider}) for ${config.dbKey}...`);

  try {
    // Check if remote file exists
    try {
      await client.send(new HeadObjectCommand({
        Bucket: config.bucket,
        Key: config.dbKey,
      }));
    } catch (headErr) {
      if (headErr.name === 'NotFound' || headErr.$metadata?.httpStatusCode === 404) {
        console.log('[CloudSync] No remote database found in cloud bucket. Local database will be used as master.');
        // If local database exists, upload it to seed the cloud bucket
        if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
          console.log('[CloudSync] Seeding initial cloud storage with local database...');
          await uploadToCloud();
        }
        return false;
      }
      throw headErr;
    }

    // Fetch the object stream
    const response = await client.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: config.dbKey,
    }));

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const tempDownloadPath = path.join(dataDir, 'inventory.db.download');
    const writeStream = fs.createWriteStream(tempDownloadPath);

    await new Promise((resolve, reject) => {
      response.Body.pipe(writeStream);
      response.Body.on('error', reject);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const downloadedSize = fs.statSync(tempDownloadPath).size;
    if (downloadedSize === 0) {
      fs.unlinkSync(tempDownloadPath);
      throw new Error('Downloaded file is 0 bytes.');
    }

    // Backup previous local database if present
    if (fs.existsSync(dbPath)) {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const prevBackup = path.join(backupDir, `inventory_pre_cloud_restore_${Date.now()}.db`);
      fs.copyFileSync(dbPath, prevBackup);
    }

    // Clean up SQLite auxiliary WAL/SHM files to prevent state mismatch
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    if (fs.existsSync(walPath)) try { fs.unlinkSync(walPath); } catch (e) {}
    if (fs.existsSync(shmPath)) try { fs.unlinkSync(shmPath); } catch (e) {}

    // Atomic replace
    fs.renameSync(tempDownloadPath, dbPath);

    syncStatus.lastSyncTime = new Date().toISOString();
    syncStatus.lastSyncStatus = 'RESTORED_ON_BOOT';
    syncStatus.lastSyncSize = downloadedSize;
    console.log(`[CloudSync] Database successfully restored from cloud storage (${(downloadedSize / 1024).toFixed(1)} KB).`);
    return true;
  } catch (err) {
    console.error('[CloudSync] Restore failed:', err.message);
    syncStatus.lastError = err.message;
    syncStatus.lastSyncStatus = 'RESTORE_ERROR';
    return false;
  }
}

let isUploading = false;
let pendingUpload = false;

/**
 * Flushes WAL and uploads the latest database snapshot to cloud storage.
 */
async function uploadToCloud(customFilePath) {
  const client = getClient();
  if (!client) {
    return { success: false, reason: 'NOT_CONFIGURED' };
  }

  if (isUploading) {
    pendingUpload = true;
    return { success: true, queued: true };
  }

  isUploading = true;
  pendingUpload = false;

  try {
    const fileToUpload = customFilePath || dbPath;
    if (!fs.existsSync(fileToUpload)) {
      isUploading = false;
      return { success: false, reason: 'FILE_NOT_FOUND' };
    }

    // Create a consistent SQLite snapshot if database is active
    let uploadTarget = fileToUpload;
    const tempSnapshotPath = path.join(dataDir, `inventory_snapshot_${Date.now()}.db`);

    try {
      const db = require('./database');
      if (db && typeof db.backup === 'function') {
        await db.backup(tempSnapshotPath);
        uploadTarget = tempSnapshotPath;
      }
    } catch (snapErr) {
      // Fallback to direct file read if database is closed or already a standalone snapshot
      uploadTarget = fileToUpload;
    }

    const fileBuffer = fs.readFileSync(uploadTarget);
    const fileSize = fileBuffer.length;

    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: config.dbKey,
      Body: fileBuffer,
      ContentType: 'application/x-sqlite3',
    }));

    // Cleanup temp snapshot
    if (uploadTarget === tempSnapshotPath && fs.existsSync(tempSnapshotPath)) {
      try { fs.unlinkSync(tempSnapshotPath); } catch (e) {}
    }

    syncStatus.lastSyncTime = new Date().toISOString();
    syncStatus.lastSyncStatus = 'SUCCESS';
    syncStatus.lastSyncSize = fileSize;
    syncStatus.lastError = null;

    console.log(`[CloudSync] Database successfully synced to ${syncStatus.provider} (${(fileSize / 1024).toFixed(1)} KB).`);

    isUploading = false;
    if (pendingUpload) {
      setImmediate(() => uploadToCloud());
    }

    return { success: true, size: fileSize, time: syncStatus.lastSyncTime };
  } catch (err) {
    console.error('[CloudSync] Upload error:', err.message);
    syncStatus.lastError = err.message;
    syncStatus.lastSyncStatus = 'UPLOAD_ERROR';
    isUploading = false;
    return { success: false, error: err.message };
  }
}

// Debounced sync for rapid writes
let debounceTimer = null;
function triggerDebouncedSync(delayMs = 5000) {
  if (!isConfigured()) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    uploadToCloud();
  }, delayMs);
}

// Background periodic sync
let periodicTimer = null;
function startPeriodicSync(intervalMinutes = 5) {
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = setInterval(() => {
    if (isConfigured()) {
      uploadToCloud();
    }
  }, intervalMinutes * 60 * 1000);
  if (periodicTimer.unref) periodicTimer.unref();
}

function getSyncStatus() {
  let localDbSize = 0;
  if (fs.existsSync(dbPath)) {
    try { localDbSize = fs.statSync(dbPath).size; } catch (e) {}
  }
  return {
    ...syncStatus,
    configured: isConfigured(),
    localDbSize,
    dbKey: config.dbKey,
    hasEndpoint: !!config.endpoint,
  };
}

module.exports = {
  isConfigured,
  restoreFromCloud,
  uploadToCloud,
  triggerDebouncedSync,
  startPeriodicSync,
  getSyncStatus,
  config,
};
