// ecosystem.config.js
// PM2 Process Management Configuration

module.exports = {
  apps: [
    {
      // Application configuration
      name: 'qwen-proxy',
      script: './src/index.js',
      
      // Process management
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      
      // Auto-restart configuration
      autorestart: true,
      watch: false, // Set to true for development
      max_memory_restart: '1G',
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 8951,
        HOST: 'localhost'
      },
      
      env_production: {
        NODE_ENV: 'production',
        PORT: 8951,
        HOST: '0.0.0.0',
        DASHBOARD_ENABLED: 'true'
      },
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Advanced options
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Monitoring
      pmx: true,
      
      // Source map support
      source_map_support: true,
      
      // Process versioning
      increment_var: 'PORT',
      
      // Graceful reload
      shutdown_with_message: true,
      
      // Health check
      health_check_grace_period: 3000,
      
      // Resource limits
      max_restarts: 10,
      min_uptime: '5s',
      
      // Development specific
      ignore_watch: [
        'node_modules',
        'logs',
        '.git',
        '*.log'
      ],
      
      // Cron restart (optional - restart daily at 2 AM)
      // cron_restart: '0 2 * * *',
      
      // Post deploy hooks
      post_update: ['npm install', 'echo "Deployment complete"']
    },
    
    // Optional: Separate process for monitoring/cleanup tasks
    {
      name: 'qwen-proxy-monitor',
      script: './scripts/monitor.js',
      instances: 1,
      exec_mode: 'fork',
      cron_restart: '0 */6 * * *', // Restart every 6 hours
      autorestart: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/qwen-code-oai-proxy.git',
      path: '/var/www/qwen-proxy',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production && pm2 save',
      'pre-setup': 'apt update && apt install nodejs npm git -y'
    },
    
    staging: {
      user: 'deploy',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:yourusername/qwen-code-oai-proxy.git',
      path: '/var/www/qwen-proxy-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging'
    }
  }
};