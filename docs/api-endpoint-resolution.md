# API Endpoint Resolution

## Overview

The Qwen OpenAI Proxy uses a dynamic endpoint resolution system that allows it to adapt to different Qwen API endpoints based on the OAuth credentials. This ensures compatibility with various Qwen API deployments and authentication methods.

## Endpoint Resolution Logic

### Default Endpoint
The proxy has a default fallback endpoint:
```javascript
const DEFAULT_QWEN_API_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
```

### Dynamic Override via resource_url
When OAuth credentials contain a `resource_url` field, the proxy uses that endpoint instead of the default.

#### Implementation Details

The endpoint resolution happens in the `getApiEndpoint()` method in `src/qwen/api.js`:

```javascript
async getApiEndpoint(credentials) {
  // Check if credentials contain a custom endpoint
  if (credentials && credentials.resource_url) {
    let endpoint = credentials.resource_url;
    // Ensure it has a scheme
    if (!endpoint.startsWith('http')) {
      endpoint = `https://${endpoint}`;
    }
    // Ensure it has the /v1 suffix
    if (!endpoint.endsWith('/v1')) {
      if (endpoint.endsWith('/')) {
        endpoint += 'v1';
      } else {
        endpoint += '/v1';
      }
    }
    return endpoint;
  } else {
    // Use default endpoint
    return DEFAULT_QWEN_API_BASE_URL;
  }
}
```

## When resource_url is Set

### 1. During Initial OAuth Authentication
When users authenticate through the OAuth device flow, the Qwen OAuth server (`https://chat.qwen.ai/api/v1/oauth2/token`) returns a token response that includes:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "resource_url": "portal.qwen.ai"
}
```

The proxy saves this `resource_url` along with the access token in the credentials file.

### 2. During Token Refresh
When the access token expires and the proxy refreshes it, the OAuth server can update the `resource_url`:

```javascript
const newCredentials = {
  ...credentials,
  access_token: tokenData.access_token,
  token_type: tokenData.token_type,
  refresh_token: tokenData.refresh_token || credentials.refresh_token,
  resource_url: tokenData.resource_url || credentials.resource_url, // Preserve or update resource_url
  expiry_date: Date.now() + tokenData.expires_in * 1000,
}
```

## Endpoint Processing

The proxy applies consistent processing to ensure the endpoint is properly formatted:

1. **Scheme Addition**: If the `resource_url` doesn't start with `http://` or `https://`, it adds `https://`
2. **Version Suffix**: If the endpoint doesn't end with `/v1`, it appends it appropriately

### Examples:
- `"portal.qwen.ai"` → `"https://portal.qwen.ai/v1"`
- `"https://api.qwen.ai/"` → `"https://api.qwen.ai/v1"`
- `"https://custom.endpoint.com/v1"` → `"https://custom.endpoint.com/v1"` (unchanged)

## Why This System Exists

### 1. **Multi-Environment Support**
Different Qwen deployments may use different API endpoints:
- Development environments
- Regional deployments
- Custom enterprise installations

### 2. **OAuth Standard Compliance**
The OAuth 2.0 specification allows for resource server information to be included in token responses, enabling clients to know which API endpoint to use.

### 3. **Future-Proofing**
As Qwen evolves and new API endpoints are introduced, the OAuth server can direct clients to the appropriate endpoints without requiring code changes.

## Current Endpoints in Use

Based on the OAuth responses, the proxy currently uses:

### Primary Endpoint
- **Portal Qwen AI**: `https://portal.qwen.ai/v1`
  - Used when OAuth credentials include `resource_url: "portal.qwen.ai"`
  - This is the endpoint currently returned by the Qwen OAuth server

### Fallback Endpoint
- **DashScope Compatible**: `https://dashscope.aliyuncs.com/compatible-mode/v1`
  - Used when no `resource_url` is present in credentials
  - Maintains backward compatibility

## Debugging Endpoint Issues

### Check Which Endpoint is Being Used
You can verify which endpoint your proxy is using by checking the credentials:

```bash
# Check resource_url in credentials
cat ~/.qwen/oauth_creds_*.json | grep resource_url
```

### Test Direct API Calls
To test the endpoint directly:

```bash
# Using the portal endpoint (most common)
curl -X POST https://portal.qwen.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"model": "qwen3-coder-plus", "messages": [{"role": "user", "content": "hi"}]}'

# Using the DashScope endpoint (fallback)
curl -X POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"model": "qwen3-coder-plus", "messages": [{"role": "user", "content": "hi"}]}'
```

## Multi-Account Considerations

Each account can have different `resource_url` values:

```bash
# Different accounts might use different endpoints
~/.qwen/oauth_creds_account1.json  # resource_url: "portal.qwen.ai"
~/.qwen/oauth_creds_account2.json  # resource_url: "custom.endpoint.com"
```

The proxy will use the appropriate endpoint for each account during request rotation.

## Troubleshooting

### Common Issues

1. **"Incorrect API key provided" error**
   - Usually means you're using the wrong endpoint for your token
   - OAuth tokens from `portal.qwen.ai` won't work with `dashscope.aliyuncs.com`

2. **Endpoint not found**
   - Check if the `resource_url` in your credentials is correct
   - Verify the endpoint is accessible

### Solutions

1. **Re-authenticate**: Run the authentication process again to get fresh credentials with the correct `resource_url`
2. **Check credentials**: Verify the `resource_url` field in your OAuth credentials file
3. **Test manually**: Use curl to test the exact endpoint and token combination

## Files Involved

- **`src/qwen/api.js`**: Contains the `getApiEndpoint()` method
- **`src/qwen/auth.js`**: Handles OAuth token exchange and `resource_url` storage
- **`~/.qwen/oauth_creds_*.json`**: Stores credentials including `resource_url`

This dynamic endpoint system ensures the proxy can adapt to changes in Qwen's infrastructure and support multiple deployment scenarios.