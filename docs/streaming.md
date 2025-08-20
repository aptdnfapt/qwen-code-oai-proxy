# Streaming in Qwen OpenAI-Compatible Proxy

This document explains how the proxy server implements streaming responses from the Qwen API.

## Overview

Streaming is a critical feature for large language models as it allows the user to see the response as it's being generated, rather than waiting for the entire response to complete. The proxy server has a robust implementation of streaming that can be enabled or disabled through configuration.

By default, streaming is disabled. To enable streaming and allow streaming responses, set the `STREAM=true` environment variable.

When streaming is disabled, even client requests that specify `stream: true` will receive a complete response in a single payload rather than a stream of chunks.

## How It Works

1.  **Client Request**: When a client makes a request to the `/v1/chat/completions` endpoint, the server checks if streaming is both requested by the client (`stream: true`) and enabled in the configuration.

2.  **Configuration Check**: The server checks the `STREAM` environment variable. If it's set to `false`, all responses will be non-streaming regardless of the client's request.

3.  **Streaming Path**: If streaming is enabled and requested, the server makes a streaming request to the Qwen API and forwards the chunks to the client as Server-Sent Events.

4.  **Non-Streaming Path**: If streaming is disabled or not requested, the server makes a regular request to the Qwen API and returns the complete response to the client.

## Key Code Snippets

### Configuration Check

The server checks both the client request and environment configuration:

```javascript
// In src/index.js

// Check if streaming is requested and enabled
const isStreaming = req.body.stream === true && config.stream;

if (isStreaming) {
  // Handle streaming response
  await this.handleStreamingChatCompletion(req, res);
} else {
  // Handle regular response
  await this.handleRegularChatCompletion(req, res);
}
```

### Environment Configuration

The streaming behavior is controlled by the `STREAM` environment variable:

```javascript
// In src/config.js

stream: process.env.STREAM === 'true', // Disable streaming by default, enable only if STREAM=true
```

This approach allows users to easily toggle streaming behavior without modifying code.

## Recent Improvements

### Streaming Block Issues Fix

A recent fix was implemented to resolve issues with missing streaming blocks. The solution involved:

1. **Custom Chunk Handler**: Implementation of an `SSEChunkHandler` Transform stream to properly handle SSE chunks and prevent data loss.

2. **Enhanced Error Handling**: Improved error handling and recovery mechanisms for chunk-level errors.

3. **Buffer Management**: Better buffer management to prevent incomplete chunks from being lost.

4. **Client-Side Compatibility**: Enhanced compatibility with various SSE client implementations.

For detailed information about the fix, see [Streaming Fix Documentation](./streaming-fix.md).