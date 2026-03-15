const path = require('path');
const { promises: fs } = require('fs');

/**
 * AccountHealthManager - Manages account health with progressive blocking
 * 
 * Strike system:
 * - Strikes accumulate on failure
 * - Strikes reset on success
 * - Progressive blocking after 3+ consecutive strikes
 * 
 * Block times: 1min, 5min, 15min, 30min, 60min, 12hr
 */
class AccountHealthManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.healthFile = path.join(dataDir, 'account_health.json');
    
    this.strikes = new Map();
    this.blockedUntil = new Map();
    this.lastStrikeTime = new Map();
    
    this.rateLimitWindow = 60000;
    this.rateLimitCount = new Map();
    this.rateLimitResetTime = new Map();
    this.rateLimitMax = 60;
    
    this.blockTimes = [
      0,
      0,
      60000,
      300000,
      900000,
      1800000,
      3600000,
      43200000
    ];
    
    this.maxAttempts = 5;
    this.ready = this.load();
  }

  async load() {
    try {
      const data = await fs.readFile(this.healthFile, 'utf8');
      const parsed = JSON.parse(data);
      
      if (parsed.strikes) {
        for (const [id, count] of Object.entries(parsed.strikes)) {
          this.strikes.set(id, count);
        }
      }
      
      if (parsed.blockedUntil) {
        const now = Date.now();
        for (const [id, timestamp] of Object.entries(parsed.blockedUntil)) {
          if (timestamp > now) {
            this.blockedUntil.set(id, timestamp);
          }
        }
      }
      
      if (parsed.lastStrikeTime) {
        for (const [id, time] of Object.entries(parsed.lastStrikeTime)) {
          this.lastStrikeTime.set(id, time);
        }
      }
      
      console.log(`\x1b[36mAccountHealthManager:\x1b[0m Loaded health data for ${this.strikes.size} accounts`);
    } catch (error) {
      // File doesn't exist, start fresh
    }
  }

  async save() {
    try {
      const data = {
        strikes: Object.fromEntries(this.strikes),
        blockedUntil: Object.fromEntries(this.blockedUntil),
        lastStrikeTime: Object.fromEntries(this.lastStrikeTime)
      };
      await fs.writeFile(this.healthFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save account health data:', error.message);
    }
  }

  addStrike(accountId) {
    const currentStrikes = this.strikes.get(accountId) || 0;
    const newStrikes = currentStrikes + 1;
    this.strikes.set(accountId, newStrikes);
    this.lastStrikeTime.set(accountId, Date.now());
    
    const blockTime = this.getBlockTime(newStrikes);
    if (blockTime > 0) {
      const blockUntil = Date.now() + blockTime;
      this.blockedUntil.set(accountId, blockUntil);
      const blockMinutes = Math.round(blockTime / 60000);
      console.log(`\x1b[33mAccount ${accountId} blocked for ${blockMinutes}min (strike #${newStrikes})\x1b[0m`);
    } else {
      console.log(`\x1b[33mAccount ${accountId} strike #${newStrikes}\x1b[0m`);
    }
    
    this.save();
    return newStrikes;
  }

  getBlockTime(strikes) {
    const index = Math.min(strikes - 1, this.blockTimes.length - 1);
    return this.blockTimes[index] || this.blockTimes[this.blockTimes.length - 1];
  }

  resetStrikes(accountId) {
    if (this.strikes.has(accountId)) {
      this.strikes.set(accountId, 0);
      this.blockedUntil.delete(accountId);
      this.save();
    }
  }

  isBlocked(accountId) {
    const blockedUntil = this.blockedUntil.get(accountId);
    if (!blockedUntil) return false;
    
    if (Date.now() >= blockedUntil) {
      this.blockedUntil.delete(accountId);
      this.save();
      return false;
    }
    return true;
  }

  getBlockedRemaining(accountId) {
    const blockedUntil = this.blockedUntil.get(accountId);
    if (!blockedUntil) return 0;
    return Math.max(0, blockedUntil - Date.now());
  }

  isRateLimited(accountId) {
    const now = Date.now();
    let count = this.rateLimitCount.get(accountId) || 0;
    let resetTime = this.rateLimitResetTime.get(accountId) || now + this.rateLimitWindow;
    
    if (now >= resetTime) {
      count = 0;
      resetTime = now + this.rateLimitWindow;
    }
    
    if (count >= this.rateLimitMax) {
      console.log(`\x1b[33mAccount ${accountId} rate limited (${count}/${this.rateLimitMax} requests per minute)\x1b[0m`);
      return true;
    }
    
    return false;
  }

  incrementRateLimit(accountId) {
    const now = Date.now();
    let count = this.rateLimitCount.get(accountId) || 0;
    let resetTime = this.rateLimitResetTime.get(accountId) || now + this.rateLimitWindow;
    
    if (now >= resetTime) {
      count = 0;
      resetTime = now + this.rateLimitWindow;
    }
    
    this.rateLimitCount.set(accountId, count + 1);
    this.rateLimitResetTime.set(accountId, resetTime);
  }

  getStrikes(accountId) {
    return this.strikes.get(accountId) || 0;
  }

  getAvailableAccounts(allAccountIds, exclude = new Set()) {
    const now = Date.now();
    const available = [];
    
    for (const accountId of allAccountIds) {
      if (exclude.has(accountId)) continue;
      if (this.isBlocked(accountId)) continue;
      if (this.isRateLimited(accountId)) continue;
      available.push(accountId);
    }
    
    return available;
  }

  getBlockedAccounts(allAccountIds) {
    const blocked = [];
    for (const accountId of allAccountIds) {
      if (this.isBlocked(accountId)) {
        blocked.push({
          accountId,
          remaining: this.getBlockedRemaining(accountId),
          strikes: this.getStrikes(accountId)
        });
      }
    }
    return blocked;
  }

  getMaxAttempts() {
    return this.maxAttempts;
  }

  getStatus() {
    const status = {
      strikes: Object.fromEntries(this.strikes),
      blocked: [],
      rateLimited: []
    };
    
    for (const [id, until] of this.blockedUntil) {
      if (until > Date.now()) {
        status.blocked.push({
          accountId: id,
          blockedUntil: new Date(until).toISOString(),
          remainingMs: until - Date.now()
        });
      }
    }
    
    for (const [id, count] of this.rateLimitCount) {
      if (count >= this.rateLimitMax) {
        status.rateLimited.push(id);
      }
    }
    
    return status;
  }
}

module.exports = { AccountHealthManager };
