module.exports = {
  apps: [
    {
      name: 'dli-dashboard',
      cwd: './server',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
    },
  ],
};
