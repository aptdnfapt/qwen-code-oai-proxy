// production.config.js
// Production-specific configuration and utilities

const fs = require('fs');
const path = require('path');
const cluster = require('cluster');
const os = require('os');

class ProductionConfig {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.isTest = process.env.NODE_ENV === 'test';
  }

  // Server configuration
  getServerConfig() {
    return {
      port: parseInt(process.env.PORT) || 3000,
      host: process.env.HOST || '0.0.0.0',
      environment: process.env.NODE_ENV || 'production',
      
      // SSL/TLS configuration
      ssl: {
        enabled: process.env.HTTPS_ENABLED === 'true',
        cert: process.env.SSL_CERT_PATH,
        key: process.env.SSL_KEY_PATH,
        forceHttps: process.env.FORCE_HTTPS === 'true'
      },

      // Proxy configuration
      proxy: {
        trust: process.env.TRUST_PROXY === 'true',
        layers: parseInt(process.env.PROXY_LAYERS) || 1
      },

      // Graceful shutdown
      gracefulShutdown: {
        timeout: parseInt(process.env.SHUTDOWN_TIMEOUT) || 30000,
        signals: ['SIGTERM', 'SIGINT', 'SIGQUIT']
      }
    };
  }

  // Cluster configuration
  getClusterConfig() {
    const numCPUs = os.cpus().length;
    const workers = parseInt(process.env.WORKER_PROCESSES) || 0;
    
    return {
      enabled: this.isProduction && workers !== 1,
      workers: workers === 0 ? numCPUs : workers,
      restartDelay: 1000,
      maxRestarts: 5,
      forkOptions: {
        silent: false
      }
    };
  }

  // Logging configuration
  getLoggingConfig() {
    return {
      level: this.isProduction ? 'info' : 'debug',
      format: this.isProduction ? 'json' : 'dev',
      file: {
        enabled: process.env.FILE_LOGGING !== 'false',
        path: process.env.LOG_PATH || './logs',
        maxSize: process.env.LOG_MAX_SIZE || '10m',
        maxFiles: process.env.LOG_MAX_FILES || '5d',
        datePattern: 'YYYY-MM-DD'
      },
      console: {
        enabled: !this.isProduction || process.env.CONSOLE_LOGGING === 'true',
        colorize: !this.isProduction
      },
      audit: {
        enabled: this.isProduction,
        path: process.env.AUDIT_LOG_PATH || './logs/audit.log'
      }
    };
  }

  // Monitoring configuration
  getMonitoringConfig() {
    return {
      enabled: process.env.PERFORMANCE_MONITORING !== 'false',
      healthCheck: {
        enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
        endpoint: '/health',
        interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000
      },
      metrics: {
        enabled: true,
        endpoint: '/metrics',
        prefix: 'qwen_proxy_',
        collectDefault: true
      },
      alerts: {
        memory: {
          threshold: parseInt(process.env.MEMORY_ALERT_THRESHOLD) || 80,
          enabled: true
        },
        cpu: {
          threshold: parseInt(process.env.CPU_ALERT_THRESHOLD) || 80,
          enabled: true
        },
        errorRate: {
          threshold: parseInt(process.env.ERROR_RATE_ALERT_THRESHOLD) || 5,
          window: 300000 // 5 minutes
        }
      },
      webhook: process.env.MONITORING_WEBHOOK
    };
  }

  // Security configuration for production
  getSecurityConfig() {
    return {
      helmet: {
        enabled: true,
        hsts: this.isProduction,
        noCache: false
      },
      rateLimit: {
        enabled: true,
        strict: this.isProduction,
        skipSuccessfulRequests: this.isProduction
      },
      cors: {
        origin: this.isProduction ? 
          (process.env.ALLOWED_ORIGINS?.split(',') || false) : 
          true,
        credentials: true
      },
      ipFilter: {
        enabled: process.env.IP_FILTERING === 'true',
        whitelist: process.env.ALLOWED_IPS?.split(',') || [],
        blacklist: process.env.BLOCKED_IPS?.split(',') || []
      }
    };
  }

  // Database and storage configuration
  getStorageConfig() {
    return {
      path: process.env.STORAGE_PATH || '~/.qwen',
      backup: {
        enabled: process.env.BACKUP_ENABLED !== 'false',
        interval: parseInt(process.env.BACKUP_INTERVAL) || 86400000, // 24 hours
        retention: parseInt(process.env.BACKUP_RETENTION) || 7, // 7 days
        path: process.env.BACKUP_PATH || '~/.qwen/backups'
      },
      encryption: {
        enabled: this.isProduction,
        key: process.env.STORAGE_ENCRYPTION_KEY || 'default-key-change-in-production'
      }
    };
  }

  // Performance tuning
  getPerformanceConfig() {
    return {
      compression: {
        enabled: true,
        level: this.isProduction ? 6 : 1,
        threshold: 1024
      },
      caching: {
        enabled: this.isProduction,
        ttl: parseInt(process.env.CACHE_TTL) || 300000, // 5 minutes
        maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 100
      },
      keepAlive: {
        enabled: true,
        timeout: 5000,
        maxSockets: Infinity
      },
      bodyParser: {
        limit: process.env.BODY_LIMIT || '10mb',
        parameterLimit: 1000
      }
    };
  }

  // Environment validation
  validateEnvironment() {
    const required = [
      'DASHBOARD_USER',
      'DASHBOARD_PASSWORD',
      'DASHBOARD_SESSION_SECRET'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Production-specific validations
    if (this.isProduction) {
      if (process.env.DASHBOARD_SESSION_SECRET === 'qwen-dashboard-secret-change-in-production') {
        console.warn('⚠️ WARNING: Using default session secret in production. Please change DASHBOARD_SESSION_SECRET.');
      }
      
      if (process.env.DASHBOARD_PASSWORD === 'admin') {
        console.warn('⚠️ WARNING: Using default password in production. Please change DASHBOARD_PASSWORD.');
      }

      if (!process.env.ALLOWED_ORIGINS) {
        console.warn('⚠️ WARNING: ALLOWED_ORIGINS not set in production. CORS will accept all origins.');
      }
    }
  }

  // Process management utilities
  setupGracefulShutdown(server, cleanup = []) {
    const config = this.getServerConfig();
    
    const shutdown = (signal) => {
      console.log(`\n📡 ${signal} received. Starting graceful shutdown...`);
      
      const shutdownTimeout = setTimeout(() => {
        console.error('💥 Graceful shutdown timeout exceeded. Forcing exit.');
        process.exit(1);
      }, config.gracefulShutdown.timeout);

      // Close server
      server.close(async () => {
        console.log('🔒 HTTP server closed.');
        
        // Run cleanup functions
        for (const cleanupFn of cleanup) {
          try {
            await cleanupFn();
          } catch (error) {
            console.error('Cleanup error:', error);
          }
        }
        
        clearTimeout(shutdownTimeout);
        console.log('✅ Graceful shutdown completed.');
        process.exit(0);
      });
    };

    // Register signal handlers
    config.gracefulShutdown.signals.forEach(signal => {
      process.on(signal, () => shutdown(signal));
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  }

  // Cluster management
  setupCluster(startServer) {
    const config = this.getClusterConfig();
    
    if (!config.enabled) {
      console.log('🚀 Starting single process server...');
      return startServer();
    }

    if (cluster.isMaster) {
      console.log(`🏭 Master process ${process.pid} is running`);
      console.log(`📦 Starting ${config.workers} worker processes...`);

      // Fork workers
      for (let i = 0; i < config.workers; i++) {
        cluster.fork();
      }

      // Handle worker events
      cluster.on('exit', (worker, code, signal) => {
        console.log(`💀 Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
        setTimeout(() => {
          cluster.fork();
        }, config.restartDelay);
      });

      cluster.on('online', (worker) => {
        console.log(`✅ Worker ${worker.process.pid} is online`);
      });

    } else {
      // Worker process
      console.log(`👷 Worker ${process.pid} starting...`);
      startServer();
    }
  }

  // Health check endpoint
  createHealthCheck(statsCollector) {
    return (req, res) => {
      const systemMetrics = statsCollector.recordSystemMetrics();
      const memoryUsage = (systemMetrics.memory.heapUsed / systemMetrics.memory.heapTotal) * 100;
      
      const health = {
        status: 'ok',
        timestamp: Date.now(),
        uptime: systemMetrics.uptime,
        memory: {
          usage: Math.round(memoryUsage),
          heap: systemMetrics.heap
        },
        system: statsCollector.getSystemHealth(),
        version: process.env.npm_package_version || '1.0.0',
        node: process.version,
        environment: process.env.NODE_ENV || 'development'
      };

      // Determine overall status
      if (memoryUsage > 90 || health.system === 'critical') {
        health.status = 'critical';
        res.status(503);
      } else if (memoryUsage > 75 || health.system === 'warning') {
        health.status = 'warning';
      }

      res.json(health);
    };
  }

  // Performance monitoring middleware
  createPerformanceMonitor() {
    const startTimes = new Map();
    
    return (req, res, next) => {
      const start = Date.now();
      startTimes.set(req, start);
      
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - start;
        
        // Log slow requests
        if (duration > 5000) { // 5 seconds
          console.warn(`🐌 Slow request: ${req.method} ${req.path} took ${duration}ms`);
        }
        
        startTimes.delete(req);
        originalEnd.apply(this, args);
      };
      
      next();
    };
  }

  // Configuration summary for startup
  getStartupSummary() {
    const server = this.getServerConfig();
    const cluster = this.getClusterConfig();
    
    return {
      environment: server.environment,
      port: server.port,
      host: server.host,
      ssl: server.ssl.enabled,
      cluster: cluster.enabled ? `${cluster.workers} workers` : 'single process',
      monitoring: this.getMonitoringConfig().enabled ? 'enabled' : 'disabled',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { ProductionConfig };