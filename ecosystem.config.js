module.exports = {
  apps: [
    {
      name: 'fueltracks-ims',
      script: 'backend/src/index.js',
      instances: 1, // Single instance required for SQLite WAL mode to avoid multi-process lock contention
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};
