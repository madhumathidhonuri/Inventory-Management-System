const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

// Also try loading from root .env or backend .env
dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const cloudSync = require('../db/cloudSync');

async function main() {
  console.log('=======================================================');
  console.log(' FuelTracks IMS — Cloud Database Downloader / Sync');
  console.log('=======================================================');

  if (!cloudSync.isConfigured()) {
    console.error('\n❌ Cloud storage is not configured.');
    console.error('Please ensure S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are in your .env file.\n');
    process.exit(1);
  }

  console.log(`\nConnecting to ${cloudSync.getSyncStatus().provider}...`);
  try {
    const success = await cloudSync.restoreFromCloud();
    if (success) {
      console.log('\n✅ Successfully downloaded latest cloud database to your local PC!');
      console.log('Local Database Path: backend/data/inventory.db\n');
    } else {
      console.log('\n⚠️ No cloud database was restored. Ensure bucket has inventory.db uploaded.\n');
    }
  } catch (err) {
    console.error('\n❌ Download error:', err.message);
  }

  process.exit(0);
}

main();
