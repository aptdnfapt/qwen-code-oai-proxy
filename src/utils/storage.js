// src/utils/storage.js
// Persistent JSON storage utility for dashboard data

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class StorageManager {
  constructor() {
    // Use /app/.qwen in Docker container, ~/.qwen locally
    this.qwenDir = process.env.NODE_ENV === 'production' && process.env.DOCKER_CONTAINER ? 
      path.join('/app', '.qwen') : 
      path.join(os.homedir(), '.qwen');
    this.ensureQwenDirectory();
  }

  // Ensure ~/.qwen directory exists
  async ensureQwenDirectory() {
    try {
      await fs.access(this.qwenDir);
    } catch (error) {
      // Directory doesn't exist, create it
      await fs.mkdir(this.qwenDir, { recursive: true });
    }
  }

  // Get full path for a storage file
  getStoragePath(filename) {
    return path.join(this.qwenDir, filename);
  }

  // Read JSON file with error handling
  async readJson(filename, defaultValue = {}) {
    try {
      const filePath = this.getStoragePath(filename);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return default value
        return defaultValue;
      }
      throw error;
    }
  }

  // Write JSON file with atomic operation
  async writeJson(filename, data) {
    try {
      const filePath = this.getStoragePath(filename);
      const tempPath = filePath + '.tmp';
      
      // Write to temporary file first
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
      
      // Atomic rename to final location
      await fs.rename(tempPath, filePath);
      
      return true;
    } catch (error) {
      console.error(`Error writing ${filename}:`, error);
      throw error;
    }
  }

  // Update JSON file with merge operation
  async updateJson(filename, updates, defaultValue = {}) {
    try {
      const currentData = await this.readJson(filename, defaultValue);
      const mergedData = { ...currentData, ...updates };
      await this.writeJson(filename, mergedData);
      return mergedData;
    } catch (error) {
      console.error(`Error updating ${filename}:`, error);
      throw error;
    }
  }

  // Delete a JSON file
  async deleteJson(filename) {
    try {
      const filePath = this.getStoragePath(filename);
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, consider it deleted
        return true;
      }
      throw error;
    }
  }

  // Check if file exists
  async exists(filename) {
    try {
      const filePath = this.getStoragePath(filename);
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Get file stats
  async getStats(filename) {
    try {
      const filePath = this.getStoragePath(filename);
      return await fs.stat(filePath);
    } catch (error) {
      return null;
    }
  }

  // List all files in .qwen directory
  async listFiles() {
    try {
      const files = await fs.readdir(this.qwenDir);
      return files;
    } catch (error) {
      console.error('Error listing .qwen directory:', error);
      return [];
    }
  }

  // Backup a file
  async backup(filename) {
    try {
      const filePath = this.getStoragePath(filename);
      const backupPath = this.getStoragePath(`${filename}.backup.${Date.now()}`);
      
      await fs.copyFile(filePath, backupPath);
      return backupPath;
    } catch (error) {
      console.error(`Error backing up ${filename}:`, error);
      throw error;
    }
  }
}

module.exports = { StorageManager };