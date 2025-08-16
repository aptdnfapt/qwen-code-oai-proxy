// src/dashboard/routes/stats.js
// Statistics and monitoring routes

const express = require('express');
const { ValidationMiddleware } = require('../../security/validation.js');
const router = express.Router();

class StatsRoutes {
  constructor(statsCollector, dashboardAuthMiddleware) {
    this.statsCollector = statsCollector;
    this.dashboardAuth = dashboardAuthMiddleware;
    this.setupRoutes();
  }

  setupRoutes() {
    // All stats routes require authentication
    router.use(this.dashboardAuth.requireAuth.bind(this.dashboardAuth));

    // GET /api/stats/overview - Get overview statistics
    router.get('/overview', async (req, res) => {
      try {
        const overview = await this.statsCollector.getOverviewStats();
        
        res.json({
          success: true,
          data: overview,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error fetching overview stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch overview statistics',
          type: 'server_error'
        });
      }
    });

    // GET /api/stats/realtime - Get real-time metrics
    router.get('/realtime', async (req, res) => {
      try {
        const realtimeData = {
          requests: {
            current: this.getCurrentRequestRate(),
            total: this.getTotalRequestsToday()
          },
          errors: {
            current: this.getCurrentErrorRate(),
            total: this.getTotalErrorsToday()
          },
          performance: {
            averageResponseTime: this.statsCollector.getAverageResponseTime(),
            systemHealth: this.statsCollector.getSystemHealth()
          },
          system: this.statsCollector.recordSystemMetrics(),
          timestamp: Date.now()
        };

        res.json({
          success: true,
          data: realtimeData
        });
      } catch (error) {
        console.error('Error fetching realtime stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch realtime statistics',
          type: 'server_error'
        });
      }
    });

    // GET /api/stats/performance - Get performance metrics
    router.get('/performance', async (req, res) => {
      try {
        const {
          startDate,
          endDate
        } = req.query;

        const performanceStats = await this.statsCollector.getPerformanceStats(
          startDate || this.getDefaultStartDate(),
          endDate || this.getToday()
        );

        // Add real-time system metrics
        const systemMetrics = this.statsCollector.recordSystemMetrics();
        
        const response = {
          ...performanceStats,
          systemMetrics: {
            memory: systemMetrics.memory,
            cpu: systemMetrics.cpu,
            uptime: systemMetrics.uptime,
            timestamp: systemMetrics.timestamp
          }
        };

        res.json({
          success: true,
          data: response,
          filters: { startDate, endDate },
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error fetching performance stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch performance statistics',
          type: 'server_error'
        });
      }
    });
  }

  // Helper methods
  getToday() {
    return new Date().toISOString().split('T')[0];
  }

  getDefaultStartDate() {
    const date = new Date();
    date.setDate(date.getDate() - 7); // 7 days ago
    return date.toISOString().split('T')[0];
  }

  getCurrentRequestRate() {
    return 0; // Placeholder
  }

  getTotalRequestsToday() {
    const today = this.getToday();
    return this.statsCollector.getBufferValue('requests', `daily.${today}`) || 0;
  }

  getCurrentErrorRate() {
    return 0; // Placeholder
  }

  getTotalErrorsToday() {
    const today = this.getToday();
    return this.statsCollector.getBufferValue('errors', `daily.${today}`) || 0;
  }

  getRouter() {
    return router;
  }
}

module.exports = { StatsRoutes };