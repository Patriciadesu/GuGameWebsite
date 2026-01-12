module.exports = {
  apps: [
    {
      name: 'gugame-backend',
      cwd: '/root/GuGame/backend',
      script: 'dist/server.js',
      watch: ['src'],
      ignore_watch: ['node_modules', 'dist', 'logs'],
      watch_options: {
        followSymlinks: false
      },
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      // Rebuild on file change
      watch_delay: 1000,
      restart_delay: 1000,
      pre_hook: 'npm run build',
      error_file: '/root/.pm2/logs/gugame-backend-error.log',
      out_file: '/root/.pm2/logs/gugame-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'gugame-frontend',
      cwd: '/root/GuGame/frontend',
      script: 'serve',
      args: '-s dist -l 5173',
      watch: false, // Disabled watch for static file server
      instances: 1,
      exec_mode: 'fork',
      error_file: '/root/.pm2/logs/gugame-frontend-error.log',
      out_file: '/root/.pm2/logs/gugame-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
