module.exports = {
  apps: [
    {
      name: 'gugame-backend',
      cwd: '/home/pat/projects/GuGame/backend',
      script: 'dist/server.js',
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      restart_delay: 1000,
      error_file: '/home/pat/.pm2/logs/gugame-backend-error.log',
      out_file: '/home/pat/.pm2/logs/gugame-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'gugame-frontend',
      cwd: '/home/pat/projects/GuGame/frontend',
      script: '/usr/bin/serve',
      args: '-s dist -l 5173',
      watch: false, // Disabled watch for static file server
      instances: 1,
      exec_mode: 'fork',
      error_file: '/home/pat/.pm2/logs/gugame-frontend-error.log',
      out_file: '/home/pat/.pm2/logs/gugame-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
