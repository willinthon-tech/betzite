module.exports = {
  apps: [
    {
      name: 'betzite-api',
      script: './backend/src/server.js',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        PORT: 3045,
        HOST: '0.0.0.0',
        NODE_ENV: 'production'
      }
    }
  ]
};
