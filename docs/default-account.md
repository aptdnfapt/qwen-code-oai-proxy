# Default Account Configuration

## Overview

The Qwen OpenAI Proxy supports configuring a default account to be used when multiple accounts are available. This feature allows you to specify which account should be used first before rotating to others when retries need another account.

## Configuration

To configure a default account, set the `DEFAULT_ACCOUNT` environment variable in your `.env` file:

```bash
# Specify which account to use by default (when using multi-account setup)
# Should match the name used when adding an account with 'npm run auth add <name>'
DEFAULT_ACCOUNT=my-primary-account
```

## How It Works

1. When the proxy starts, it checks if a `DEFAULT_ACCOUNT` is configured
2. If a default account is set and it exists in the list of available accounts, it will be used first
3. If no default account is set or the specified account doesn't exist, the proxy will use the first available account
4. When the current account hits a retryable upstream failure, the proxy will rotate to the next account in the list
5. On subsequent server restarts, the default account will again be used first

## Benefits

- **Priority Usage**: Ensure your preferred account is used first
- **Consistent Behavior**: Predictable account selection across server restarts
- **Easy Management**: Simple configuration through environment variables
- **Backward Compatible**: Works with existing multi-account setups

## Example Usage

1. Add multiple accounts:
   ```bash
   npm run auth:add primary
   npm run auth:add secondary
   npm run auth:add backup
   ```

2. Configure your `.env` file:
   ```bash
   DEFAULT_ACCOUNT=primary
   ```

3. Start the proxy:
   ```bash
   npm start
   ```

4. The proxy will show which account is configured as default on startup:
   ```
   Default account configured: primary
   ```

5. In the account list, the default account will be marked:
   ```
   Available accounts:
     primary (default): ✅ Valid
     secondary: ✅ Valid
     backup: ✅ Valid
   ```

6. When making requests, the proxy will indicate which account is being used:
   ```
   Using account primary (Request #1 today)
   ```

## Logging

The proxy provides clear feedback about account usage:

- On server startup, it displays the configured default account
- In the account list, it marks which account is the default
- During request processing, it shows which account is being used
- When account rotation occurs, it indicates which account will be tried next
- Tokens are refreshed ahead of expiry using a per-account pre-expiry window before the proxy sends requests

## Notes

- The `DEFAULT_ACCOUNT` value must match exactly the name used when adding the account with `npm run auth add <name>`
- If the specified default account doesn't exist or is invalid, the proxy will fall back to using the first available account
- The default account feature only affects the initial account selection; rotation behavior remains the same when a retry needs another account
