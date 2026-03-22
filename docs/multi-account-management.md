# Multi-Account Management System

This document outlines the planned features for implementing multi-account management in the Qwen OpenAI Proxy.

## Feature 1: Multi-Account Authentication

### Goal
Enable users to authenticate and manage multiple Qwen accounts to overcome the 2K request limit per account.

### Requirements
- Support authentication of multiple Qwen accounts
- Store credentials for each account separately
- Provide a mechanism to add/remove accounts
- Display account information (name, status, etc.)

### Implementation Plan
- Extend `QwenAuthManager` to handle multiple credential files
- Modify `npm run auth` to support multiple accounts
- Create separate credential files for each account (e.g., `oauth_creds_1.json`, `oauth_creds_2.json`)
- Add account management commands

## Feature 2: Request Counting and Quota Management

### Goal
Track the number of requests made per account and manage quota limits.

### Requirements
- Count requests made per account
- Reset counters daily based on UTC time
- Display remaining quota per account
- Detect when an account has reached its limit

### Implementation Plan
- Implement a client-side request counter
- Store request counts in a persistent file
- Reset counters at UTC midnight
- Integrate with account management system

## Feature 3: Automatic Account Rotation

### Goal
Automatically switch between accounts when retryable upstream failures occur.

### Requirements
- Detect retryable upstream errors such as `429`, `5xx`, and timeouts
- Automatically switch to the next available account
- Maintain a stable round-robin order for account selection
- Handle concurrent requests safely

### Implementation Plan
- Refresh tokens ahead of expiry with per-account deduplication
- Create account rotation logic with round-robin selection
- Retry clear auth failures once on the same account before switching
- Ensure thread-safe account switching

## Future Considerations

### Proxy Support for Accounts
- Support using different proxy IPs for each account to prevent flagging
- Configure proxy settings per account
- Rotate IPs when needed
- This is planned for future implementation, not part of the initial release

## UI/UX Options

### Option 1: Web-based Management Interface
- Temporary Flask server for account management
- Web GUI to view accounts and request counts
- Add accounts through web interface with QR code display
- Simple and accessible but requires additional dependencies

### Option 2: Terminal-based TUI Application
- Go-based TUI using libraries like Charm
- Display accounts and request information in terminal
- Add accounts through terminal interface
- Consistent with existing QR code terminal experience
- No additional server dependencies

### Option 3: Command-line Interface
- Extend existing npm commands
- `npm run auth:list` - List accounts and request counts
- `npm run auth:add` - Add new account
- `npm run auth:remove` - Remove account
- Simplest implementation but less user-friendly
