const http = require('http');
const express = require('express');
const cors = require('cors');
const db = require('../db/database');

function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', system: 'FuelTracks IMS Test Server', timestamp: new Date().toISOString() });
  });

  app.use('/api/device-types', require('../routes/deviceTypes'));
  app.use('/api/devices', require('../routes/devices'));
  app.use('/api/purchase-batches', require('../routes/purchaseBatches'));
  app.use('/api/dispatches', require('../routes/dispatches'));
  app.use('/api/installations', require('../routes/installations'));
  app.use('/api/customers', require('../routes/customers'));
  app.use('/api/dashboard', require('../routes/dashboard'));
  app.use('/api/users', require('../routes/users'));
  app.use('/api/reports', require('../routes/reports'));
  app.use('/api/backup', require('../routes/backup'));

  return app;
}

function makeRequest(port, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      timeout: 3000,
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING FUELTRACKS IMS INTEGRATION SUITE ---');

  const testApp = createTestApp();
  const server = testApp.listen(0, '127.0.0.1');
  await new Promise((res) => server.once('listening', res));
  const testPort = server.address().port;
  console.log(`[Test Runner] Live test server listening on ephemeral port ${testPort}`);

  let passed = 0;
  let failed = 0;

  async function assertTest(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}: PASSED`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}: FAILED - ${err.message}`);
      failed++;
    }
  }

  try {
    // 1. Health Check
    await assertTest('API Health Check', async () => {
      const res = await makeRequest(testPort, '/api/health');
      if (res.status !== 200 || res.body.status !== 'OK') throw new Error(`Status ${res.status}`);
    });

    // 2. Database Integrity Check
    await assertTest('SQLite Database Integrity', async () => {
      const integrity = db.pragma('integrity_check');
      if (!integrity || integrity[0]?.integrity_check !== 'ok') {
        throw new Error('Integrity check failed');
      }
    });

    // 3. Device Types API
    await assertTest('Device Types Catalog API', async () => {
      const res = await makeRequest(testPort, '/api/device-types');
      if (res.status !== 200 || !res.body.success || !Array.isArray(res.body.data)) {
        throw new Error('Invalid device types response');
      }
    });

    // 4. Devices List API
    let testImei = '86501000001';
    await assertTest('Devices List & Attributes API', async () => {
      const res = await makeRequest(testPort, '/api/devices');
      if (res.status !== 200 || !res.body.success) throw new Error('Failed to fetch devices');
      if (res.body.data?.length > 0) {
        testImei = res.body.data[0].imei_number;
      }
    });

    // 5. Global Universal Search
    await assertTest('Global Search (IMEI & Attributes)', async () => {
      const searchStr = testImei.slice(0, 6);
      const res = await makeRequest(testPort, `/api/devices/global-search?q=${searchStr}`);
      if (res.status !== 200 || !res.body.success) throw new Error('Search failed');
    });

    // 6. SIM Validity Watcher
    await assertTest('SIM Validity & Expiry API', async () => {
      const res = await makeRequest(testPort, '/api/devices/sim-validity');
      if (res.status !== 200 || !res.body.success) throw new Error('SIM validity check failed');
    });

    // 7. Aging Analysis
    await assertTest('Stock Aging Analysis API', async () => {
      const res = await makeRequest(testPort, '/api/devices/aging-analysis');
      if (res.status !== 200 || !res.body.success) throw new Error('Aging analysis failed');
    });

    // 8. Users & Target Configuration
    await assertTest('Users Management API', async () => {
      const res = await makeRequest(testPort, '/api/users');
      if (res.status !== 200 || !res.body.success) throw new Error('Failed to fetch users');
    });

    // 9. Backups List API
    await assertTest('Database Backups System API', async () => {
      const res = await makeRequest(testPort, '/api/backup/list');
      if (res.status !== 200 || !res.body.success) throw new Error('Failed to list backups');
    });

    // 10. Dashboard Stats
    await assertTest('Executive Dashboard Analytics API', async () => {
      const res = await makeRequest(testPort, '/api/dashboard/stats');
      if (res.status !== 200 || !res.body.success) throw new Error('Dashboard stats failed');
    });

    // 11. Cloud Persistence Status API
    await assertTest('Cloud Persistence Status API', async () => {
      const res = await makeRequest(testPort, '/api/backup/cloud-status');
      if (res.status !== 200 || !res.body.success || typeof res.body.configured !== 'boolean') {
        throw new Error('Cloud status API failed');
      }
    });


    console.log('====================================================');
    console.log(` RESULT: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');
  } finally {
    server.close(() => {
      process.exit(failed > 0 ? 1 : 0);
    });
  }
}

runTests();
