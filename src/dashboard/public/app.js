// src/dashboard/public/app.js
// Dashboard JavaScript Application Logic

class QwenDashboard {
  constructor() {
    this.currentTab = 'overview';
    this.apiKeys = [];
    this.accounts = [];
    this.activeOAuthFlow = null;
    this.pollInterval = null;
    this.refreshIntervals = new Map();
    
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.setupTabNavigation();
    await this.loadInitialData();
    this.startPeriodicRefresh();
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });

    // Logout button
    document.querySelector('.logout-btn')?.addEventListener('click', () => this.logout());

    // API Key management
    document.getElementById('newApiKeyBtn')?.addEventListener('click', () => this.openApiKeyModal());
    document.getElementById('apiKeyForm')?.addEventListener('submit', (e) => this.handleApiKeySubmission(e));

    // Account management
    document.getElementById('addAccountBtn')?.addEventListener('click', () => this.openAccountModal());
    document.getElementById('accountForm')?.addEventListener('submit', (e) => this.handleAccountSubmission(e));

    // Modal management
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.closeModal(e.target.id);
      }
    });

    // Rate limit toggle
    document.getElementById('enableRateLimit')?.addEventListener('change', (e) => {
      const settings = document.getElementById('rateLimitSettings');
      if (settings) {
        settings.style.display = e.target.checked ? 'block' : 'none';
      }
    });

    // Authentication check on page load
    this.checkAuthStatus();
  }

  setupTabNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        
        // Update nav buttons
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update tab content
        tabContents.forEach(content => {
          content.classList.remove('active');
          const tabId = content.id.replace('-tab', '');
          if (tabId === targetTab) {
            content.classList.add('active');
          }
        });
        
        this.currentTab = targetTab;
        this.onTabChange(targetTab);
      });
    });
  }

  async onTabChange(tab) {
    switch (tab) {
      case 'overview':
        await this.loadOverviewData();
        break;
      case 'apikeys':
        await this.loadApiKeys();
        break;
      case 'accounts':
        await this.loadAccounts();
        break;
      case 'stats':
        await this.loadStatistics();
        break;
    }
  }

  async checkAuthStatus() {
    try {
      const response = await fetch('/api/auth/verify');
      const result = await response.json();
      
      if (!result.authenticated) {
        window.location.href = '/dashboard/login';
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      window.location.href = '/dashboard/login';
    }
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/dashboard/login';
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.href = '/dashboard/login';
    }
  }

  async loadInitialData() {
    await this.loadOverviewData();
  }

  async loadOverviewData() {
    try {
      // Load overview statistics
      const [apiKeysResponse, accountsResponse] = await Promise.all([
        this.makeAuthenticatedRequest('/api/keys/stats'),
        this.makeAuthenticatedRequest('/api/accounts/stats')
      ]);

      if (apiKeysResponse.success) {
        document.getElementById('totalApiKeys').textContent = apiKeysResponse.stats.totalKeys || 0;
      }

      if (accountsResponse.success) {
        document.getElementById('totalAccounts').textContent = accountsResponse.stats.activeAccounts || 0;
        document.getElementById('requestsToday').textContent = accountsResponse.stats.totalRequests || 0;
      }
    } catch (error) {
      console.error('Error loading overview data:', error);
    }
  }

  async loadApiKeys() {
    const loadingElement = document.getElementById('apiKeysLoading');
    const tableBody = document.getElementById('apiKeysTableBody');
    const emptyState = document.getElementById('apiKeysEmpty');
    const container = document.getElementById('apiKeysContainer');

    try {
      this.showLoading(loadingElement);
      this.hideElement(emptyState);
      this.showElement(container);

      const response = await this.makeAuthenticatedRequest('/api/keys');
      
      if (response.success) {
        this.apiKeys = response.keys;
        this.renderApiKeysTable(this.apiKeys);
        
        if (this.apiKeys.length === 0) {
          this.hideElement(container);
          this.showElement(emptyState);
        }
      } else {
        const errorMessage = typeof response.error === 'string' ? response.error : 
                           (response.error?.message || 'Failed to load API keys');
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error loading API keys:', error);
      const displayMessage = error.message || 'Unknown error occurred';
      this.showError('Failed to load API keys: ' + displayMessage);
      tableBody.innerHTML = '<tr><td colspan="6" class="loading-row">Error loading API keys</td></tr>';
    } finally {
      this.hideLoading(loadingElement);
    }
  }

  renderApiKeysTable(keys) {
    const tableBody = document.getElementById('apiKeysTableBody');
    
    if (keys.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="loading-row">No API keys found</td></tr>';
      return;
    }

    tableBody.innerHTML = keys.map(key => `
      <tr>
        <td>${this.escapeHtml(key.name)}</td>
        <td><code>sk-proj-****${key.keySuffix || '****'}</code></td>
        <td>${key.lastUsed ? this.formatDate(key.lastUsed) : 'Never'}</td>
        <td>${key.usage?.requestsToday || 0}</td>
        <td><span class="status-badge status-${key.status}">${key.status}</span></td>
        <td class="actions">
          <button class="btn btn-small btn-danger" onclick="app.deleteApiKey('${key.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  async loadAccounts() {
    const loadingElement = document.getElementById('accountsLoading');
    const tableBody = document.getElementById('accountsTableBody');
    const emptyState = document.getElementById('accountsEmpty');
    const container = document.getElementById('accountsContainer');

    try {
      this.showLoading(loadingElement);
      this.hideElement(emptyState);
      this.showElement(container);

      const response = await this.makeAuthenticatedRequest('/api/accounts');
      
      if (response.success) {
        this.accounts = response.accounts;
        this.renderAccountsTable(this.accounts);
        
        if (this.accounts.length === 0) {
          this.hideElement(container);
          this.showElement(emptyState);
        }
      } else {
        throw new Error(response.error || 'Failed to load accounts');
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      this.showError('Failed to load accounts: ' + error.message);
      tableBody.innerHTML = '<tr><td colspan="5" class="loading-row">Error loading accounts</td></tr>';
    } finally {
      this.hideLoading(loadingElement);
    }
  }

  renderAccountsTable(accounts) {
    const tableBody = document.getElementById('accountsTableBody');
    
    if (accounts.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="loading-row">No accounts found</td></tr>';
      return;
    }

    tableBody.innerHTML = accounts.map(account => `
      <tr>
        <td>${this.escapeHtml(account.id)}</td>
        <td><span class="status-badge status-${account.status}">${account.status}</span></td>
        <td>${account.tokenInfo?.expiresAt ? this.formatDate(account.tokenInfo.expiresAt) : 'Unknown'}</td>
        <td>${account.usage?.requestsToday || 0}</td>
        <td class="actions">
          <button class="btn btn-small btn-danger" onclick="app.deleteAccount('${account.id}')">Remove</button>
        </td>
      </tr>
    `).join('');
  }

  async loadStatistics() {
    // TODO: Implement detailed statistics loading
    console.log('Loading statistics...');
  }

  // API Key Management
  openApiKeyModal() {
    this.showModal('apiKeyModal');
    document.getElementById('apiKeyForm').reset();
    document.getElementById('rateLimitSettings').style.display = 'none';
  }

  async handleApiKeySubmission(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const permissions = Array.from(formData.getAll('permissions'));
    const rateLimit = document.getElementById('enableRateLimit').checked ? 
      parseInt(document.getElementById('rateLimit').value) : null;

    const keyData = {
      name: formData.get('name'),
      description: formData.get('description') || undefined,
      permissions,
      rateLimit
    };

    try {
      const response = await this.makeAuthenticatedRequest('/api/keys', {
        method: 'POST',
        body: JSON.stringify(keyData)
      });

      if (response.success) {
        this.closeModal('apiKeyModal');
        this.showApiKeyResult(response.key, response.key?.apiKey);
        await this.loadApiKeys();
        await this.loadOverviewData();
      } else {
        throw new Error(response.error || 'Failed to create API key');
      }
    } catch (error) {
      console.error('Error creating API key:', error);
      this.showError('Failed to create API key: ' + error.message);
    }
  }

  showApiKeyResult(keyInfo, rawKey) {
    // Extract the actual API key from the response
    const apiKeyValue = rawKey || keyInfo?.apiKey || keyInfo;
    document.getElementById('generatedApiKey').value = apiKeyValue;
    this.showModal('apiKeyDisplayModal');
  }

  copyApiKey() {
    const keyInput = document.getElementById('generatedApiKey');
    keyInput.select();
    keyInput.setSelectionRange(0, 99999);
    
    navigator.clipboard.writeText(keyInput.value).then(() => {
      const button = document.querySelector('.btn-copy');
      const originalText = button.textContent;
      button.textContent = '✅ Copied!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    }).catch(() => {
      // Fallback for older browsers
      document.execCommand('copy');
    });
  }

  async deleteApiKey(keyId) {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await this.makeAuthenticatedRequest(`/api/keys/${keyId}`, {
        method: 'DELETE'
      });

      if (response.success) {
        await this.loadApiKeys();
        await this.loadOverviewData();
      } else {
        throw new Error(response.error || 'Failed to delete API key');
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
      this.showError('Failed to delete API key: ' + error.message);
    }
  }

  // Account Management
  openAccountModal() {
    this.showModal('accountModal');
    this.resetAccountModal();
  }

  resetAccountModal() {
    document.getElementById('accountStep1').style.display = 'block';
    document.getElementById('accountStep2').style.display = 'none';
    document.getElementById('accountStep3').style.display = 'none';
    document.getElementById('accountForm').reset();
    this.stopOAuthPolling();
    this.activeOAuthFlow = null;
  }

  async handleAccountSubmission(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const accountId = formData.get('accountId').trim();

    if (!accountId) {
      this.showError('Account ID is required');
      return;
    }

    try {
      const response = await this.makeAuthenticatedRequest('/api/accounts/initiate', {
        method: 'POST',
        body: JSON.stringify({ accountId })
      });

      if (response.success) {
        this.activeOAuthFlow = response.flow;
        this.showOAuthStep(response.flow);
        this.startOAuthPolling();
      } else {
        throw new Error(response.error || 'Failed to initiate OAuth flow');
      }
    } catch (error) {
      console.error('Error initiating OAuth:', error);
      this.showError('Failed to start authorization: ' + error.message);
    }
  }

  showOAuthStep(flow) {
    document.getElementById('accountStep1').style.display = 'none';
    document.getElementById('accountStep2').style.display = 'block';
    
    document.getElementById('authLink').href = flow.verificationUriComplete || flow.verificationUri;
    document.getElementById('userCode').textContent = flow.userCode;
  }

  startOAuthPolling() {
    if (!this.activeOAuthFlow || this.pollInterval) return;

    this.pollInterval = setInterval(async () => {
      try {
        const response = await this.makeAuthenticatedRequest(
          `/api/accounts/status/${this.activeOAuthFlow.deviceCode}`
        );

        if (response.success) {
          if (response.status === 'completed') {
            this.showOAuthSuccess();
            this.stopOAuthPolling();
            setTimeout(() => {
              this.loadAccounts();
              this.loadOverviewData();
            }, 1000);
          } else if (response.status === 'pending') {
            this.updateOAuthStatus(response);
          }
        } else if (response.status === 'failed' || response.type === 'expired') {
          this.showError('Authorization failed: ' + response.error);
          this.stopOAuthPolling();
        }
      } catch (error) {
        console.error('OAuth polling error:', error);
        this.updateOAuthStatus({ 
          message: 'Connection error during authorization check',
          remainingTime: 0 
        });
      }
    }, 3000); // Poll every 3 seconds
  }

  updateOAuthStatus(status) {
    const messageElement = document.getElementById('pollingMessage');
    const timeElement = document.getElementById('timeRemaining');
    
    if (messageElement) {
      messageElement.textContent = status.message || '⏳ Waiting for authorization...';
    }
    
    if (timeElement && status.remainingTime !== undefined) {
      const minutes = Math.floor(status.remainingTime / 60);
      const seconds = status.remainingTime % 60;
      timeElement.textContent = `Time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  showOAuthSuccess() {
    document.getElementById('accountStep2').style.display = 'none';
    document.getElementById('accountStep3').style.display = 'block';
  }

  stopOAuthPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  cancelOAuth() {
    this.stopOAuthPolling();
    this.closeModal('accountModal');
  }

  async deleteAccount(accountId) {
    if (!confirm(`Are you sure you want to remove the account "${accountId}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await this.makeAuthenticatedRequest(`/api/accounts/${accountId}`, {
        method: 'DELETE'
      });

      if (response.success) {
        await this.loadAccounts();
        await this.loadOverviewData();
      } else {
        throw new Error(response.error || 'Failed to remove account');
      }
    } catch (error) {
      console.error('Error removing account:', error);
      this.showError('Failed to remove account: ' + error.message);
    }
  }

  // Modal Management
  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
    }
    
    if (modalId === 'accountModal') {
      this.stopOAuthPolling();
      this.activeOAuthFlow = null;
    }
  }

  // Utility Methods
  async makeAuthenticatedRequest(url, options = {}) {
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (response.status === 401) {
      window.location.href = '/dashboard/login?message=session_expired';
      throw new Error('Session expired');
    }

    return await response.json();
  }

  showLoading(element) {
    if (element) element.style.display = 'flex';
  }

  hideLoading(element) {
    if (element) element.style.display = 'none';
  }

  showElement(element) {
    if (element) element.style.display = 'block';
  }

  hideElement(element) {
    if (element) element.style.display = 'none';
  }

  showError(message) {
    // Simple error display - could be enhanced with a toast system
    alert('Error: ' + message);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatDate(dateString) {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (error) {
      return 'Invalid Date';
    }
  }

  startPeriodicRefresh() {
    // Refresh overview data every 30 seconds
    this.refreshIntervals.set('overview', setInterval(() => {
      if (this.currentTab === 'overview') {
        this.loadOverviewData();
      }
    }, 30000));

    // Refresh current tab data every 60 seconds
    this.refreshIntervals.set('currentTab', setInterval(() => {
      this.onTabChange(this.currentTab);
    }, 60000));
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    this.onTabChange(tabName);
  }
}

// Global functions for onclick handlers
function closeModal(modalId) {
  if (window.app) {
    window.app.closeModal(modalId);
  }
}

function copyApiKey() {
  if (window.app) {
    window.app.copyApiKey();
  }
}

function cancelOAuth() {
  if (window.app) {
    window.app.cancelOAuth();
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new QwenDashboard();
});