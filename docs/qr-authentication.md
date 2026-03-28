# QR Code Authentication

The proxy server now includes a built-in authentication system with QR code support, making it easier than ever to authenticate with Qwen.

## How It Works

The built-in authentication script implements the OAuth 2.0 Device Authorization Flow with the following features:

1. **Automatic Credential Management**: Checks for existing credentials and attempts to refresh them before initiating a new flow
2. **QR Code Generation**: Automatically generates and displays a QR code for quick mobile authentication
3. **Browser Integration**: Attempts to automatically open the authentication URL in your default browser
4. **Real-time Feedback**: Provides clear status updates during the authentication process

## Using QR Code Authentication

To authenticate using the built-in QR code system:

```bash
npm run auth
```

The authentication script will:

1. Check for existing credentials in `~/.qwen/oauth_creds.json`
2. If valid credentials are found, the script will exit with a success message
3. If expired credentials are found, it will attempt to refresh them automatically
4. If no credentials exist or refresh fails, it will initiate a new authentication flow

## TUI Add-Account Flow

If you start the operator UI with `qwen-proxy serve`, the Accounts screen now exposes the same device-flow auth path inside the TUI:

1. Open **Accounts**
2. Choose **Add account**
3. Enter an account ID
4. Start auth and complete the verification link / QR code flow shown in the modal

The TUI modal shows:

- verification link
- device code
- terminal QR code block
- live waiting / success / failure state

## Authentication Flow

When a new authentication flow is initiated, you'll see output similar to:

```
Starting Qwen authentication flow...
Initiating device flow...

=== Qwen OAuth Device Authorization ===
Please visit the following URL to authenticate:

https://chat.qwen.ai/device?user_code=XXXX-YYYY

Or scan the QR code below:
█████████████████████████████████████
█████████████████████████████████████
████ ▄▄▄▄▄ █▀█ █▄▄▄▄▄█ ▄ █ ▄▄▄▄▄ ████
████ █   █ █▀▀▀█ ▄▄▄ █▀ ▀▀▄█   █ ████
████ █▄▄▄█ █ ▄ █▄█▄█▄▀ ▀▄█▄█▄▄▄█ ████
████▄▄▄▄▄▄▄█▄█▄█▄█▄█▄█▄▄▄▄▄▄▄▄▄▄▄████
████ ▄▄▄▄▄ █▀▄▀▄ █ ▄██ ▄ ▀ ▀▄█▄▀█████
████ █   █ █ █ █▄█▀ ▀▀▀ ▀██ ▀██▄ ████
████ █▄▄▄█ █ ▄ ▀▄▀ ▄▀▄██▄▀ ▄ ▄██ ████
████▄▄▄▄▄▄▄█▄▄█▄▄▄▄██▄▄▄█▄██▄██▄▄████
█████████████████████████████████████
█████████████████████████████████████

User code: XXXX-YYYY
(Press Ctrl+C to cancel)

Browser opened automatically. If not, please visit the URL above.
```

## Authentication Options

You have three ways to complete the authentication:

1. **QR Code Scanning**: Use your mobile device to scan the QR code displayed in the terminal
2. **Manual URL Entry**: Visit the displayed URL in any browser and enter the user code
3. **Automatic Browser Opening**: If supported, the script will automatically open your default browser to the authentication page

## Credential Storage

Credentials are stored in the same location used by the official `qwen-code` CLI tool:

- **Location**: `~/.qwen/oauth_creds.json`
- **Format**: Standard OAuth 2.0 token format with access token, refresh token, and expiration information
- **Security**: Tokens are stored locally and never transmitted to any third-party servers

## Benefits

The built-in QR code authentication system provides several advantages:

- **No External Dependencies**: Authenticate without installing additional CLI tools
- **Mobile-Friendly**: QR codes make it easy to authenticate from your mobile device
- **Automatic Refresh**: Automatically refreshes expired tokens when possible
- **User-Friendly**: Clear instructions and real-time feedback throughout the process
- **Cross-Platform**: Works on all platforms that support terminal QR code display

## Troubleshooting

If you encounter issues with the authentication process:

1. **QR Code Not Displaying**: Ensure your terminal supports Unicode characters
2. **Browser Not Opening**: Manually visit the displayed URL in your browser
3. **Authentication Timeout**: Restart the authentication process with `npm run auth`
4. **Existing Credentials Issues**: Delete `~/.qwen/oauth_creds.json` and re-authenticate

For more detailed information about the OAuth 2.0 Device Authorization Flow, see the [Authentication documentation](./authentication.md).
