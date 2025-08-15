// src/monitoring/statsCollector.js
// Statistics collection and aggregation system

const fs = require('fs').promises;
const path = require('path');
const { StorageManager } = require('../utils/storage.js');

class StatsCollector {
  constructor() {
    this.storage = new StorageManager();
    this.statsBuffer = new Map(); // In-memory buffer for real-time stats
    this.flushInterval = null;
    this.flushIntervalMs = 30000; // Flush every 30 seconds
    this.startTime = Date.now();
    
    this.init();
  }

  async init() {
    // Ensure stats directory exists
    const statsDir = path.join(this.storage.qwenDir, 'stats');
    await fs.mkdir(statsDir, { recursive: true });
    
    // Start automatic flushing
    this.startPeriodicFlush();
    
    // Load existing daily stats
    await this.loadTodayStats();
  }

  // API Request Tracking
  async recordApiRequest(data) {
    const timestamp = Date.now();
    const today = this.getDateKey();
    const hour = new Date().getHours();

    const requestData = {
      timestamp,
      method: data.method || 'GET',
      endpoint: data.endpoint || '/unknown',
      statusCode: data.statusCode || 200,
      responseTime: data.responseTime || 0,
      tokenUsage: data.tokenUsage || { prompt: 0, completion: 0, total: 0 },
      apiKeyId: data.apiKeyId || null,
      accountId: data.accountId || null,
      userAgent: data.userAgent || null,
      ip: data.ip || null,
      errorType: data.errorType || null
    };

    // Update real-time buffer
    this.updateBuffer('requests', {
      daily: { [today]: (this.getBufferValue('requests', `daily.${today}`) || 0) + 1 },
      hourly: { [hour]: (this.getBufferValue('requests', `hourly.${hour}`) || 0) + 1 },
      byEndpoint: { [requestData.endpoint]: (this.getBufferValue('requests', `byEndpoint.${requestData.endpoint}`) || 0) + 1 },
      byStatus: { [requestData.statusCode]: (this.getBufferValue('requests', `byStatus.${requestData.statusCode}`) || 0) + 1 }
    });

    // Update response time metrics
    this.updateResponseTimeMetrics(requestData.responseTime);

    // Update token usage
    if (requestData.tokenUsage.total > 0) {
      this.updateTokenMetrics(requestData.tokenUsage);
    }

    // Update API key stats
    if (requestData.apiKeyId) {
      this.updateApiKeyStats(requestData.apiKeyId, requestData);
    }

    // Record detailed request log
    await this.recordDetailedRequest(requestData);
  }

  updateResponseTimeMetrics(responseTime) {
    const current = this.getBufferValue('performance', 'responseTime') || {
      total: 0,
      count: 0,
      min: Infinity,
      max: 0,
      samples: []
    };

    current.total += responseTime;
    current.count += 1;
    current.min = Math.min(current.min, responseTime);
    current.max = Math.max(current.max, responseTime);
    
    // Keep last 100 samples for percentile calculations
    current.samples.push(responseTime);
    if (current.samples.length > 100) {
      current.samples.shift();
    }

    this.setBufferValue('performance', 'responseTime', current);
  }

  updateTokenMetrics(tokenUsage) {
    const today = this.getDateKey();
    const current = this.getBufferValue('tokens', today) || {
      prompt: 0,
      completion: 0,
      total: 0,
      requests: 0
    };

    current.prompt += tokenUsage.prompt || 0;
    current.completion += tokenUsage.completion || 0;
    current.total += tokenUsage.total || 0;
    current.requests += 1;

    this.setBufferValue('tokens', today, current);
  }

  updateApiKeyStats(apiKeyId, requestData) {
    const today = this.getDateKey();
    const current = this.getBufferValue('apiKeys', apiKeyId) || {
      requests: 0,
      tokensUsed: 0,
      lastUsed: null,
      dailyUsage: {}
    };

    current.requests += 1;
    current.tokensUsed += requestData.tokenUsage.total || 0;
    current.lastUsed = requestData.timestamp;
    
    if (!current.dailyUsage[today]) {
      current.dailyUsage[today] = 0;
    }
    current.dailyUsage[today] += 1;

    this.setBufferValue('apiKeys', apiKeyId, current);
  }

  // Error Tracking
  async recordError(errorData) {
    const timestamp = Date.now();
    const today = this.getDateKey();
    const hour = new Date().getHours();

    const error = {
      timestamp,
      type: errorData.type || 'unknown',
      message: errorData.message || '',
      endpoint: errorData.endpoint || '/unknown',
      apiKeyId: errorData.apiKeyId || null,
      accountId: errorData.accountId || null,
      stack: errorData.stack || null,
      statusCode: errorData.statusCode || 500
    };

    // Update error counters
    this.updateBuffer('errors', {
      daily: { [today]: (this.getBufferValue('errors', `daily.${today}`) || 0) + 1 },
      hourly: { [hour]: (this.getBufferValue('errors', `hourly.${hour}`) || 0) + 1 },
      byType: { [error.type]: (this.getBufferValue('errors', `byType.${error.type}`) || 0) + 1 },
      byEndpoint: { [error.endpoint]: (this.getBufferValue('errors', `byEndpoint.${error.endpoint}`) || 0) + 1 }
    });

    // Record detailed error log
    await this.recordDetailedError(error);
  }

  // System Health Metrics
  recordSystemMetrics() {
    const metrics = {
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      heap: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal
      },
      activeConnections: this.getActiveConnectionCount(),
      bufferSizes: this.getBufferSizes()
    };

    this.setBufferValue('system', 'current', metrics);
    return metrics;
  }

  getActiveConnectionCount() {
    // This would typically track active HTTP connections
    // For now, return a placeholder
    return 0;
  }

  getBufferSizes() {
    return {
      requests: this.getBufferSize('requests'),
      errors: this.getBufferSize('errors'),
      tokens: this.getBufferSize('tokens'),
      apiKeys: this.getBufferSize('apiKeys')
    };
  }

  getBufferSize(category) {
    const data = this.statsBuffer.get(category);
    return data ? JSON.stringify(data).length : 0;
  }

  // Statistics Retrieval
  async getOverviewStats() {
    const today = this.getDateKey();
    const yesterday = this.getDateKey(-1);

    const overview = {
      today: {
        requests: this.getBufferValue('requests', `daily.${today}`) || 0,
        errors: this.getBufferValue('errors', `daily.${today}`) || 0,
        tokens: this.getBufferValue('tokens', today) || { total: 0 }
      },
      yesterday: await this.loadDayStats(yesterday),
      performance: {
        averageResponseTime: this.getAverageResponseTime(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        systemHealth: this.getSystemHealth()
      },
      totals: await this.getTotalStats()
    };

    return overview;
  }

  async getDetailedStats(options = {}) {
    const {
      startDate = this.getDateKey(-7), // Last 7 days
      endDate = this.getDateKey(),
      groupBy = 'day' // day, hour, endpoint, apiKey
    } = options;

    const stats = {
      period: { startDate, endDate },
      requests: await this.getRequestStats(startDate, endDate, groupBy),
      errors: await this.getErrorStats(startDate, endDate, groupBy),
      tokens: await this.getTokenStats(startDate, endDate, groupBy),
      performance: await this.getPerformanceStats(startDate, endDate),
      apiKeys: await this.getApiKeyStats(startDate, endDate)
    };

    return stats;
  }

  async getRequestStats(startDate, endDate, groupBy) {
    // Implementation would aggregate request data based on groupBy parameter
    return {
      total: 0,
      byDay: {},
      byEndpoint: {},
      byStatus: {}
    };
  }

  async getErrorStats(startDate, endDate, groupBy) {
    return {
      total: 0,
      byDay: {},
      byType: {},
      byEndpoint: {}
    };
  }

  async getTokenStats(startDate, endDate, groupBy) {
    return {
      total: 0,
      prompt: 0,
      completion: 0,
      byDay: {},
      average: 0
    };
  }

  async getPerformanceStats(startDate, endDate) {
    const responseTime = this.getBufferValue('performance', 'responseTime');
    if (!responseTime || responseTime.count === 0) {
      return {
        averageResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0
      };
    }

    const samples = [...responseTime.samples].sort((a, b) => a - b);
    return {
      averageResponseTime: responseTime.total / responseTime.count,
      minResponseTime: responseTime.min,
      maxResponseTime: responseTime.max,
      p95ResponseTime: this.getPercentile(samples, 0.95),
      p99ResponseTime: this.getPercentile(samples, 0.99)
    };
  }

  async getApiKeyStats(startDate, endDate) {
    const apiKeyStats = this.getBufferValue('apiKeys') || {};
    const results = {};

    for (const [keyId, stats] of Object.entries(apiKeyStats)) {
      results[keyId] = {
        totalRequests: stats.requests || 0,
        totalTokens: stats.tokensUsed || 0,
        lastUsed: stats.lastUsed,
        dailyUsage: stats.dailyUsage || {}
      };
    }

    return results;
  }

  // Utility Methods
  getDateKey(daysOffset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  getBufferValue(category, key = null) {
    const categoryData = this.statsBuffer.get(category) || {};
    if (key === null) return categoryData;
    
    const keys = key.split('.');
    let value = categoryData;
    for (const k of keys) {
      value = value?.[k];
    }
    return value;
  }

  setBufferValue(category, key, value) {
    if (!this.statsBuffer.has(category)) {
      this.statsBuffer.set(category, {});
    }
    
    const categoryData = this.statsBuffer.get(category);
    if (typeof key === 'string') {
      const keys = key.split('.');
      let current = categoryData;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
    } else {
      this.statsBuffer.set(category, value);
    }
  }

  updateBuffer(category, updates) {
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'object') {
        for (const [subKey, subValue] of Object.entries(value)) {
          this.setBufferValue(category, `${key}.${subKey}`, subValue);
        }
      } else {
        this.setBufferValue(category, key, value);
      }
    }
  }

  getAverageResponseTime() {
    const responseTime = this.getBufferValue('performance', 'responseTime');
    if (!responseTime || responseTime.count === 0) return 0;
    return Math.round(responseTime.total / responseTime.count);
  }

  getSystemHealth() {
    const system = this.getBufferValue('system', 'current');
    if (!system) return 'unknown';

    const memoryUsage = (system.memory.heapUsed / system.memory.heapTotal) * 100;
    
    if (memoryUsage > 90) return 'critical';
    if (memoryUsage > 75) return 'warning';
    return 'healthy';
  }

  getPercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  async getTotalStats() {
    // Load and aggregate total statistics from stored data
    return {
      totalRequests: 0,
      totalErrors: 0,
      totalTokens: 0,
      totalUptime: Math.floor((Date.now() - this.startTime) / 1000)
    };
  }

  // Persistence Methods
  async recordDetailedRequest(requestData) {
    const today = this.getDateKey();
    const filename = `requests-${today}.jsonl`;
    const filepath = path.join(this.storage.qwenDir, 'stats', filename);
    
    try {
      const logLine = JSON.stringify(requestData) + '\n';
      await fs.appendFile(filepath, logLine);
    } catch (error) {
      console.error('Failed to record detailed request:', error);
    }
  }

  async recordDetailedError(errorData) {
    const today = this.getDateKey();
    const filename = `errors-${today}.jsonl`;
    const filepath = path.join(this.storage.qwenDir, 'stats', filename);
    
    try {
      const logLine = JSON.stringify(errorData) + '\n';
      await fs.appendFile(filepath, logLine);
    } catch (error) {
      console.error('Failed to record detailed error:', error);
    }
  }

  async flushToDisk() {
    const today = this.getDateKey();
    const filename = `daily-${today}.json`;
    const filepath = path.join(this.storage.qwenDir, 'stats', filename);
    
    try {
      const statsSnapshot = Object.fromEntries(this.statsBuffer);
      await fs.writeFile(filepath, JSON.stringify(statsSnapshot, null, 2));
    } catch (error) {
      console.error('Failed to flush stats to disk:', error);
    }
  }

  async loadTodayStats() {
    const today = this.getDateKey();
    const filename = `daily-${today}.json`;
    const filepath = path.join(this.storage.qwenDir, 'stats', filename);
    
    try {
      const data = await fs.readFile(filepath, 'utf8');
      const stats = JSON.parse(data);
      if (stats) {
        for (const [category, data] of Object.entries(stats)) {
          this.statsBuffer.set(category, data);
        }
      }
    } catch (error) {
      // File doesn't exist yet, that's fine
    }
  }

  async loadDayStats(dateKey) {
    const filename = `daily-${dateKey}.json`;
    const filepath = path.join(this.storage.qwenDir, 'stats', filename);
    
    try {
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data) || {};
    } catch (error) {
      return {};
    }
  }

  startPeriodicFlush() {
    this.flushInterval = setInterval(() => {
      this.flushToDisk();
      this.recordSystemMetrics();
    }, this.flushIntervalMs);
  }

  stopPeriodicFlush() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  // Cleanup method
  async shutdown() {
    this.stopPeriodicFlush();
    await this.flushToDisk();
  }
}

module.exports = { StatsCollector };