#!/usr/bin/env node

const { QwenAuthManager } = require('./src/qwen/auth.js');
const qrcode = require('qrcode-terminal');
const open = require('open');

async function listAccounts() {
  console.log('Listing all Qwen accounts...');
  
  try {
    const authManager = new QwenAuthManager();
    await authManager.loadAllAccounts();
    
    const accountIds = authManager.getAccountIds();

    const defaultCredentials = await authManager.loadCredentials();

    if (accountIds.length === 0 && !defaultCredentials) {
      console.log('No accounts found.');
      return;
    }

    const totalAccounts = accountIds.length + (defaultCredentials ? 1 : 0);
    console.log(`\nFound ${totalAccounts} account(s):\n`);

    if (defaultCredentials) {
      const isValid = authManager.isTokenValid(defaultCredentials);
      console.log(`\n\x1b[36mDefault account: ${isValid ? '✅ Valid' : '❌ Invalid/Expired'}\x1b[0m`);
      console.log('\n\x1b[33mNote: Try using the proxy to make sure the account is not invalid\x1b[0m');
    }
    
    for (const accountId of accountIds) {
      const credentials = authManager.getAccountCredentials(accountId);
      const isValid = authManager.isAccountValid(accountId);
      
      console.log(`Account ID: ${accountId}`);
      console.log(`  Status: ${isValid ? '✅ Valid' : '❌ Invalid/Expired'}`);
      if (credentials && credentials.expiry_date) {
        const expiry = new Date(credentials.expiry_date);
        console.log(`  Expires: ${expiry.toLocaleString()}`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('Failed to list accounts:', error.message);
    process.exit(1);
  }
}

async function addAccount(accountId) {
  console.log(`Adding new Qwen account with ID: ${accountId}...`);
  
  try {
    const authManager = new QwenAuthManager();
    
    // Initiate device flow
    console.log('\nInitiating device flow...');
    const deviceFlow = await authManager.initiateDeviceFlow();
    
    // Display verification URI and user code
    console.log('\n=== Qwen OAuth Device Authorization ===');
    console.log('Please visit the following URL to authenticate:');
    console.log(`\n${deviceFlow.verification_uri_complete}\n`);
    
    // Generate and display QR code
    console.log('Or scan the QR code below:');
    qrcode.generate(deviceFlow.verification_uri_complete, { small: true }, (qrCode) => {
      console.log(qrCode);
    });
    
    console.log('User code:', deviceFlow.user_code);
    console.log('(Press Ctrl+C to cancel)');
    
    // Try to open the URL in the browser
    try {
      await open(deviceFlow.verification_uri_complete);
      console.log('\nBrowser opened automatically. If not, please visit the URL above.');
    } catch (openError) {
      console.log('\nPlease visit the URL above in your browser to authenticate.');
    }
    
    // Poll for token and save to specific account
    console.log('\nWaiting for authentication...');
    const token = await authManager.pollForToken(deviceFlow.device_code, deviceFlow.code_verifier, accountId);
    
    console.log(`\n🎉 Authentication successful for account ${accountId}!`);
    console.log(`Access token saved to ~/.qwen/oauth_creds_${accountId}.json`);
  } catch (error) {
    console.error('Authentication failed:', error.message);
    process.exit(1);
  }
}

async function removeAccount(accountId) {
  console.log(`Removing Qwen account with ID: ${accountId}...`);
  
  try {
    const authManager = new QwenAuthManager();
    await authManager.removeAccount(accountId);
    console.log(`\n✅ Account ${accountId} removed successfully!`);
  } catch (error) {
    console.error('Failed to remove account:', error.message);
    process.exit(1);
  }
}

async function checkRequestCounts() {
  console.log('Checking request counts for all accounts...');
  
  try {
    const { QwenAuthManager } = require('./src/qwen/auth.js');
    const path = require('path');
    const { promises: fs } = require('fs');
    
    const authManager = new QwenAuthManager();
    
    // Load all accounts
    await authManager.loadAllAccounts();
    const accountIds = authManager.getAccountIds();

    // Also show default account if it exists
    const defaultCredentials = await authManager.loadCredentials();
    
    if (accountIds.length === 0 && !defaultCredentials) {
      console.log('No accounts found.');
      return;
    }

    const totalAccounts = accountIds.length + (defaultCredentials ? 1 : 0);

    console.log(`\nFound ${totalAccounts} account(s):\n`);

    // Load request counts from persisted file
    let requestCounts = new Map();
    const requestCountFile = path.join(authManager.qwenDir, 'request_counts.json');
    try {
      const data = await fs.readFile(requestCountFile, 'utf8');
      const counts = JSON.parse(data);
      
      // Load request counts
      if (counts.requests) {
        for (const [accountId, count] of Object.entries(counts.requests)) {
          requestCounts.set(accountId, count);
        }
      }
    } catch (error) {
      // File doesn't exist or is invalid, continue with empty counts
    }
    
    for (const accountId of accountIds) {
      const count = requestCounts.get(accountId) || 0;
      const credentials = authManager.getAccountCredentials(accountId);
      const isValid = credentials && authManager.isTokenValid(credentials);
      
      console.log(`Account ID: ${accountId}`);
      console.log(`  Status: ${isValid ? '✅ Valid' : '❌ Invalid/Expired'}`);
      console.log(`  Requests today: ${count}/2000`);
      
      if (credentials && credentials.expiry_date) {
        const expiry = new Date(credentials.expiry_date);
        console.log(`  Expires: ${expiry.toLocaleString()}`);
      }
      console.log('');
    }
    
    if (defaultCredentials) {
      console.log('Default account:');
      const isValid = authManager.isTokenValid(defaultCredentials);
      const defaultCount = requestCounts.get('default') || 0;
      console.log(`  Status: ${isValid ? '✅ Valid' : '❌ Invalid/Expired'}`);
      console.log(`  Requests today: ${defaultCount}/2000`);
      
      if (defaultCredentials.expiry_date) {
        const expiry = new Date(defaultCredentials.expiry_date);
        console.log(`  Expires: ${expiry.toLocaleString()}`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('Failed to check request counts:', error.message);
    process.exit(1);
  }
}

async function authenticate() {
  console.log('Starting Qwen authentication flow...');
  
  try {
    const authManager = new QwenAuthManager();
    
    // Check if credentials already exist and are valid
    console.log('Checking for existing credentials...');
    const existingCredentials = await authManager.loadCredentials();
    
    if (existingCredentials && authManager.isTokenValid(existingCredentials)) {
      console.log('\n✅ Valid credentials already exist!');
      console.log('Access token is still valid and will be used by the proxy server.');
      console.log('\nYou can start the proxy server with: npm start');
      return;
    }
    
    if (existingCredentials) {
      console.log('Existing credentials found but they are expired or invalid.');
      console.log('Attempting to refresh the access token...');
      
      try {
        const refreshedCredentials = await authManager.refreshAccessToken(existingCredentials);
        console.log('\n✅ Token refreshed successfully!');
        console.log('Access token has been updated and will be used by the proxy server.');
        console.log('\nYou can start the proxy server with: npm start');
        return;
      } catch (refreshError) {
        console.log('Failed to refresh token:', refreshError.message);
        console.log('Proceeding with new authentication flow...');
      }
    }
    
    // Initiate device flow
    console.log('\nInitiating device flow...');
    const deviceFlow = await authManager.initiateDeviceFlow();
    
    // Display verification URI and user code
    console.log('\n=== Qwen OAuth Device Authorization ===');
    console.log('Please visit the following URL to authenticate:');
    console.log(`\n${deviceFlow.verification_uri_complete}\n`);
    
    // Generate and display QR code
    console.log('Or scan the QR code below:');
    qrcode.generate(deviceFlow.verification_uri_complete, { small: true }, (qrCode) => {
      console.log(qrCode);
    });
    
    console.log('User code:', deviceFlow.user_code);
    console.log('(Press Ctrl+C to cancel)');
    
    // Try to open the URL in the browser
    try {
      await open(deviceFlow.verification_uri_complete);
      console.log('\nBrowser opened automatically. If not, please visit the URL above.');
    } catch (openError) {
      console.log('\nPlease visit the URL above in your browser to authenticate.');
    }
    
    // Poll for token
    console.log('\nWaiting for authentication...');
    const token = await authManager.pollForToken(deviceFlow.device_code, deviceFlow.code_verifier);
    
    console.log('\n🎉 Authentication successful!');
    console.log('Access token saved to ~/.qwen/oauth_creds.json');
    console.log('\nYou can now start the proxy server with: npm start');
  } catch (error) {
    console.error('Authentication failed:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'list':
    listAccounts();
    break;
  case 'add':
    if (!args[1]) {
      console.error('Please provide an account ID: npm run auth add <account-id>');
      process.exit(1);
    }
    addAccount(args[1]);
    break;
  case 'remove':
    if (!args[1]) {
      console.error('Please provide an account ID: npm run auth remove <account-id>');
      process.exit(1);
    }
    removeAccount(args[1]);
    break;
  case 'counts':
    checkRequestCounts();
    break;
  case undefined:
  case '':
    authenticate();
    break;
  default:
    console.log('Usage: npm run auth [list|add <account-id>|remove <account-id>]');
    console.log('  list                - List all accounts');
    console.log('  add <account-id>    - Add a new account with the specified ID');
    console.log('  remove <account-id> - Remove an existing account with the specified ID');
    console.log('  counts              - Check request counts for all accounts');
    console.log('  (no arguments)      - Authenticate default account');
    process.exit(1);
}