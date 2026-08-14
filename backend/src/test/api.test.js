const http = require('http');

function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method,
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

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('--- RUNNING BACKEND INTEGRATION TESTS ---');

  try {
    // 1. Health Check
    const health = await makeRequest('/api/health');
    console.log('✓ Health Check:', health.status === 200 ? 'PASSED' : 'FAILED', health.body.status);

    // 2. Dashboard Stats
    const stats = await makeRequest('/api/dashboard/stats');
    console.log('✓ Dashboard Stats API:', stats.body.success ? 'PASSED' : 'FAILED', `Total Devices: ${stats.body.data.totals.devices}`);

    // 3. IMEI Journey Trace Audit Log
    const testImei = '864920050019115';
    const trace = await makeRequest(`/api/devices/${testImei}`);
    const historyLength = trace.body?.data?.history?.length ?? 0;
    console.log('✓ IMEI Journey Trace Audit Log:', trace.body?.success ? 'PASSED' : 'FAILED', `Events count: ${historyLength}`);

    // 4. Installation Auto Customer Match
    const instPayload = {
      imei_number: '864920050019102',
      customer_phone: '9811223344', // Existing customer Anand Kumar
      customer_name: 'Anand Kumar',
      vehicle_number: 'KA-05-EV-9900',
      vehicle_type: 'SUV',
      sale_price: 5800,
      installed_by: 'Test Installer'
    };
    const instResult = await makeRequest('/api/installations', 'POST', instPayload);
    console.log('✓ Installation Single Action & Customer Auto-Match:', instResult.body.success ? 'PASSED' : 'FAILED', `Installation ID: ${instResult.body.data?.installationId}`);

    console.log('--- ALL BACKEND INTEGRATION TESTS COMPLETED ---');
  } catch (err) {
    console.error('Test Execution Error:', err);
  }
}

runTests();
