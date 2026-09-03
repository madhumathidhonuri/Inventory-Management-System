const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    system: 'FuelTracks Technologies - Inventory Management System API',
    timestamp: new Date().toISOString()
  });
});

async function startServer() {
  const cloudSync = require('./db/cloudSync');
  if (cloudSync.isConfigured()) {
    console.log('[Startup] Restoring latest database snapshot from Cloud Storage...');
    try {
      await cloudSync.restoreFromCloud();
    } catch (e) {
      console.warn('[Startup] Warning during cloud restore:', e.message);
    }
  }

  // Initialize DB after restore completes
  const db = require('./db/database');

  // Register API Routes dynamically after database is restored
  app.use('/api/device-types', require('./routes/deviceTypes'));
  app.use('/api/devices', require('./routes/devices'));
  app.use('/api/purchase-batches', require('./routes/purchaseBatches'));
  app.use('/api/dispatches', require('./routes/dispatches'));
  app.use('/api/installations', require('./routes/installations'));
  app.use('/api/customers', require('./routes/customers'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/backup', require('./routes/backup'));
  app.use('/api/expenses', require('./routes/expenses'));
  app.use('/api/device-pricing', require('./routes/devicePricing'));
  app.use('/api/device-payments', require('./routes/devicePayments'));

  // Serve static React frontend bundle in production
  const frontendDistPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDistPath));

  // Fallback to index.html for React Router SPA routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    const indexPath = path.join(frontendDistPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) next();
    });
  });

  // 404 Route handler for API endpoints
  app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('API Error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  });

  const server = app.listen(PORT, () => {
    const status = cloudSync.getSyncStatus();
    console.log(`=======================================================`);
    console.log(` FuelTracks IMS API Server running on port ${PORT}`);
    console.log(` Health check: http://localhost:${PORT}/api/health`);
    console.log(` Cloud Persistence: ${status.configured ? 'ENABLED (' + status.provider + ')' : 'LOCAL ONLY (Configure S3/R2 to persist)'}`);
    console.log(`=======================================================`);
  });


  // Graceful shutdown handling for server
  async function gracefulShutdown(signal) {
    console.log(`\n[Server] Received ${signal}. Stopping HTTP server...`);
    server.close(async () => {
      console.log('[Server] HTTP connections closed.');
      if (db.gracefulClose) {
        await db.gracefulClose(signal);
      }
      process.exit(0);
    });

    // Force close if connections remain open after 10 seconds
    setTimeout(() => {
      console.warn('[Server] Forcefully closing pending connections.');
      process.exit(0);
    }, 10000).unref();
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error('[Startup] Fatal server error:', err);
  process.exit(1);
});

