# Changelog

All notable changes to the Qwen OpenAI-Compatible Proxy Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-08-13

### Added
- Multi-account support with automatic rotation to overcome 2,000 requests per day limit per account
- Persistent request counting that survives server restarts
- Account management commands:
  - `npm run auth:list` - List all configured accounts
  - `npm run auth:add <account-id>` - Add a new account
  - `npm run auth:remove <account-id>` - Remove an existing account
  - `npm run auth:counts` - Check request counts for all accounts
- Sticky account selection instead of round-robin for better consistency
- Built-in QR code authentication using OAuth 2.0 Device Authorization Flow with PKCE
- Automatic browser opening during authentication flow
- Streaming responses support with configurable toggle via `STREAM` environment variable
- Enhanced debugging with detailed logs and token counting
- Real-time terminal feedback showing:
  - Token counts for each request
  - Account usage information
  - Quota limit notifications
  - Account rotation status
- Support for `/v1/chat/completions` endpoint
- Health check endpoint at `/health`
- Comprehensive documentation for all features

### Changed
- Improved token refresh mechanism with better error handling
- Enhanced error messages with specific quota exceeded notifications
- Updated authentication flow to support both built-in and official `qwen-code` CLI methods
- Server startup now shows available accounts and their status

### Fixed
- Token validation and refresh timing issues
- Account rotation logic to use sticky selection instead of round-robin per request
- Various authentication edge cases in the OAuth 2.0 Device Authorization Flow
- Streaming block issues where some chunks were not appearing in client-side applications

## [0.1.0] - 2025-08-07

### Added
- Initial release of Qwen OpenAI-Compatible Proxy Server
- Basic proxy functionality for Qwen models through OpenAI-compatible API endpoint
- Support for `/v1/chat/completions` endpoint
- Environment variable configuration
- Basic authentication with Qwen via `qwen-code` CLI tool

[1.0.0]: https://github.com/your-repo/qwen-openai-proxy/releases/tag/v1.0.0
[0.1.0]: https://github.com/your-repo/qwen-openai-proxy/releases/tag/v0.1.0