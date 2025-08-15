// src/utils/apiKeyManager.js
// API key generation, validation, and management system

const crypto = require('crypto');
const { StorageManager } = require('./storage.js');

class ApiKeyManager {
  constructor() {
    this.storage = new StorageManager();
    this.apiKeysFile = 'api_keys.json';
    this.usageStatsFile = 'key_usage_stats.json';
    
    // PBKDF2 configuration
    this.hashConfig = {
      iterations: 260000,
      keyLength: 64,
      digest: 'sha256'
    };
    
    this.initializeStorage();
  }

  // Initialize storage files with default structure
  async initializeStorage() {
    try {
      // Initialize API keys storage
      const keysExists = await this.storage.exists(this.apiKeysFile);
      if (!keysExists) {
        const defaultKeysStructure = {
          keys: {},
          version: '1.0',
          created: new Date().toISOString()
        };
        await this.storage.writeJson(this.apiKeysFile, defaultKeysStructure);
      }

      // Initialize usage stats storage
      const statsExists = await this.storage.exists(this.usageStatsFile);
      if (!statsExists) {
        const defaultStatsStructure = {
          daily: {},
          keyStats: {},
          version: '1.0',
          created: new Date().toISOString()
        };
        await this.storage.writeJson(this.usageStatsFile, defaultStatsStructure);
      }
    } catch (error) {
      console.error('Error initializing API key storage:', error);
      throw error;
    }
  }

  // Generate a new API key in OpenAI format
  generateApiKey() {
    const prefix = 'sk-proj-';
    const randomBytes = crypto.randomBytes(24); // 24 bytes = 48 chars hex
    const randomPart = randomBytes.toString('hex');
    return prefix + randomPart;
  }

  // Generate a unique key ID
  generateKeyId() {
    return 'key_' + crypto.randomBytes(8).toString('hex');
  }

  // Hash API key using PBKDF2
  async hashApiKey(apiKey) {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(32).toString('hex');
      const { iterations, keyLength, digest } = this.hashConfig;
      
      crypto.pbkdf2(apiKey, salt, iterations, keyLength, digest, (err, derivedKey) => {
        if (err) {
          reject(err);
        } else {
          const hash = `pbkdf2_${digest}$${iterations}$${salt}$${derivedKey.toString('hex')}`;
          resolve(hash);
        }
      });
    });
  }

  // Verify API key against stored hash (constant-time comparison)
  async verifyApiKey(apiKey, storedHash) {
    return new Promise((resolve, reject) => {
      try {
        const parts = storedHash.split('$');
        if (parts.length !== 4 || parts[0] !== `pbkdf2_${this.hashConfig.digest}`) {
          return resolve(false);
        }

        const iterations = parseInt(parts[1]);
        const salt = parts[2];
        const storedDerivedKey = parts[3];
        
        crypto.pbkdf2(apiKey, salt, iterations, this.hashConfig.keyLength, this.hashConfig.digest, (err, derivedKey) => {
          if (err) {
            reject(err);
          } else {
            // Constant-time comparison to prevent timing attacks
            const providedKey = derivedKey.toString('hex');
            const isValid = crypto.timingSafeEqual(
              Buffer.from(storedDerivedKey, 'hex'),
              Buffer.from(providedKey, 'hex')
            );
            resolve(isValid);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Create a new API key
  async createKey(options = {}) {
    try {
      const {
        name = 'Untitled Key',
        description = '',
        permissions = ['chat.completions', 'models.list'],
        rateLimit = null
      } = options;

      const apiKey = this.generateApiKey();
      const keyId = this.generateKeyId();
      const keyHash = await this.hashApiKey(apiKey);
      
      // Create key metadata
      const keyData = {
        id: keyId,
        name,
        description,
        keyHash,
        keyPrefix: apiKey.substring(0, 8),
        keySuffix: apiKey.slice(-4),
        maskedKey: `${apiKey.substring(0, 8)}...${apiKey.slice(-4)}`,
        status: 'active',
        permissions,
        rateLimit,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        usageCount: 0
      };

      // Save to storage
      const keysData = await this.storage.readJson(this.apiKeysFile);
      keysData.keys[keyId] = keyData;
      await this.storage.writeJson(this.apiKeysFile, keysData);

      // Initialize usage stats
      await this.initializeKeyStats(keyId);

      // Return the complete API key (only shown once)
      return {
        ...keyData,
        apiKey, // Full key only returned at creation
        keyHash: undefined // Don't return hash
      };
    } catch (error) {
      console.error('Error creating API key:', error);
      throw error;
    }
  }

  // Validate an API key and return key data
  async validateKey(apiKey) {
    try {
      if (!apiKey || !apiKey.startsWith('sk-proj-')) {
        return null;
      }

      const keysData = await this.storage.readJson(this.apiKeysFile);
      
      // Find key by testing against all stored hashes
      for (const [keyId, keyData] of Object.entries(keysData.keys)) {
        if (keyData.status === 'active') {
          const isValid = await this.verifyApiKey(apiKey, keyData.keyHash);
          if (isValid) {
            return {
              id: keyId,
              name: keyData.name,
              permissions: keyData.permissions,
              rateLimit: keyData.rateLimit
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error validating API key:', error);
      return null;
    }
  }

  // Update last used timestamp
  async updateLastUsed(keyId) {
    try {
      const keysData = await this.storage.readJson(this.apiKeysFile);
      
      if (keysData.keys[keyId]) {
        keysData.keys[keyId].lastUsed = new Date().toISOString();
        keysData.keys[keyId].usageCount += 1;
        await this.storage.writeJson(this.apiKeysFile, keysData);
        
        // Update usage statistics
        await this.updateUsageStats(keyId);
      }
    } catch (error) {
      console.error('Error updating last used:', error);
    }
  }

  // List all API keys (without sensitive data)
  async listKeys() {
    try {
      const keysData = await this.storage.readJson(this.apiKeysFile);
      
      return Object.values(keysData.keys).map(key => ({
        id: key.id,
        name: key.name,
        description: key.description,
        maskedKey: key.maskedKey,
        status: key.status,
        permissions: key.permissions,
        rateLimit: key.rateLimit,
        createdAt: key.createdAt,
        lastUsed: key.lastUsed,
        usageCount: key.usageCount
      }));
    } catch (error) {
      console.error('Error listing API keys:', error);
      throw error;
    }
  }

  // Update API key metadata
  async updateKey(keyId, updates) {
    try {
      const keysData = await this.storage.readJson(this.apiKeysFile);
      
      if (!keysData.keys[keyId]) {
        throw new Error('API key not found');
      }

      // Allow updating specific fields only
      const allowedUpdates = ['name', 'description', 'permissions', 'rateLimit', 'status'];
      for (const field of allowedUpdates) {
        if (updates[field] !== undefined) {
          keysData.keys[keyId][field] = updates[field];
        }
      }

      keysData.keys[keyId].updatedAt = new Date().toISOString();
      await this.storage.writeJson(this.apiKeysFile, keysData);
      
      return keysData.keys[keyId];
    } catch (error) {
      console.error('Error updating API key:', error);
      throw error;
    }
  }

  // Delete an API key
  async deleteKey(keyId) {
    try {
      const keysData = await this.storage.readJson(this.apiKeysFile);
      
      if (!keysData.keys[keyId]) {
        throw new Error('API key not found');
      }

      delete keysData.keys[keyId];
      await this.storage.writeJson(this.apiKeysFile, keysData);
      
      // Clean up usage stats
      await this.cleanupKeyStats(keyId);
      
      return true;
    } catch (error) {
      console.error('Error deleting API key:', error);
      throw error;
    }
  }

  // Get API key statistics
  async getKeyStats(keyId) {
    try {
      const statsData = await this.storage.readJson(this.usageStatsFile);
      const keyStats = statsData.keyStats[keyId] || {};
      
      // Calculate daily usage for last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const dailyUsage = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date(thirtyDaysAgo);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split('T')[0];
        
        dailyUsage.push({
          date: dateKey,
          requests: statsData.daily[dateKey]?.[keyId] || 0
        });
      }

      return {
        totalRequests: keyStats.totalRequests || 0,
        totalErrors: keyStats.totalErrors || 0,
        averageResponseTime: keyStats.averageResponseTime || 0,
        firstUsed: keyStats.firstUsed,
        lastUsed: keyStats.lastUsed,
        dailyUsage
      };
    } catch (error) {
      console.error('Error getting key stats:', error);
      throw error;
    }
  }

  // Initialize statistics for a new key
  async initializeKeyStats(keyId) {
    try {
      const statsData = await this.storage.readJson(this.usageStatsFile);
      
      if (!statsData.keyStats[keyId]) {
        statsData.keyStats[keyId] = {
          totalRequests: 0,
          totalErrors: 0,
          totalResponseTime: 0,
          averageResponseTime: 0,
          firstUsed: null,
          lastUsed: null
        };
        
        await this.storage.writeJson(this.usageStatsFile, statsData);
      }
    } catch (error) {
      console.error('Error initializing key stats:', error);
    }
  }

  // Update usage statistics
  async updateUsageStats(keyId, responseTime = 0, isError = false) {
    try {
      const statsData = await this.storage.readJson(this.usageStatsFile);
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();

      // Initialize structures if needed
      if (!statsData.daily[today]) {
        statsData.daily[today] = {};
      }
      if (!statsData.daily[today][keyId]) {
        statsData.daily[today][keyId] = 0;
      }
      if (!statsData.keyStats[keyId]) {
        await this.initializeKeyStats(keyId);
        statsData.keyStats = await this.storage.readJson(this.usageStatsFile).keyStats;
      }

      // Update daily stats
      statsData.daily[today][keyId] += 1;

      // Update key stats
      const keyStats = statsData.keyStats[keyId];
      keyStats.totalRequests += 1;
      if (isError) keyStats.totalErrors += 1;
      
      if (responseTime > 0) {
        keyStats.totalResponseTime += responseTime;
        keyStats.averageResponseTime = keyStats.totalResponseTime / keyStats.totalRequests;
      }
      
      if (!keyStats.firstUsed) keyStats.firstUsed = now;
      keyStats.lastUsed = now;

      await this.storage.writeJson(this.usageStatsFile, statsData);
    } catch (error) {
      console.error('Error updating usage stats:', error);
    }
  }

  // Clean up statistics for deleted key
  async cleanupKeyStats(keyId) {
    try {
      const statsData = await this.storage.readJson(this.usageStatsFile);
      
      // Remove from key stats
      delete statsData.keyStats[keyId];
      
      // Remove from daily stats
      for (const dateKey of Object.keys(statsData.daily)) {
        delete statsData.daily[dateKey][keyId];
      }
      
      await this.storage.writeJson(this.usageStatsFile, statsData);
    } catch (error) {
      console.error('Error cleaning up key stats:', error);
    }
  }

  // Get overall API key system statistics
  async getSystemStats() {
    try {
      const keysData = await this.storage.readJson(this.apiKeysFile);
      const statsData = await this.storage.readJson(this.usageStatsFile);
      
      const totalKeys = Object.keys(keysData.keys).length;
      const activeKeys = Object.values(keysData.keys).filter(key => key.status === 'active').length;
      
      // Calculate today's usage
      const today = new Date().toISOString().split('T')[0];
      const todayStats = statsData.daily[today] || {};
      const requestsToday = Object.values(todayStats).reduce((sum, count) => sum + count, 0);
      
      return {
        totalKeys,
        activeKeys,
        requestsToday,
        totalRequests: Object.values(statsData.keyStats).reduce((sum, stats) => sum + stats.totalRequests, 0)
      };
    } catch (error) {
      console.error('Error getting system stats:', error);
      throw error;
    }
  }
}

module.exports = { ApiKeyManager };