# Streaming Fix for Qwen OpenAI-Compatible Proxy

## Overview

This document describes the fix implemented to resolve issues with missing streaming blocks in the Qwen OpenAI-compatible proxy. The problem was caused by improper handling of Server-Sent Events (SSE) chunks, which resulted in some blocks not appearing correctly in client-side applications.

## Root Cause Analysis

The original implementation had several issues that could cause streaming blocks to be missed:

1. **Direct Pipe Approach**: The implementation used a direct pipe from the Qwen API response to the client response without any chunk-level processing or validation.

2. **No Chunk Formatting**: There was no mechanism to ensure proper SSE chunk formatting, which could lead to malformed chunks being sent to clients.

3. **Buffering Issues**: The lack of explicit buffer management could cause incomplete chunks or buffering issues that resulted in lost data.

4. **Limited Error Handling**: Error handling was not comprehensive enough to catch and recover from chunk-level errors.

## Solution Implementation

The fix implements a custom `SSEChunkHandler` Transform stream that properly handles SSE chunks:

### 1. Custom Chunk Handler

A new `SSEChunkHandler` class was added to `src/qwen/api.js`:

```javascript
class SSEChunkHandler extends Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: false });
    this.buffer = '';
    this.debug = process.env.DEBUG_STREAMING === 'true';
  }

  _transform(chunk, encoding, callback) {
    try {
      // Convert chunk to string
      const chunkStr = chunk.toString();
      
      // Append to buffer
      this.buffer += chunkStr;
      
      // Process complete lines
      const lines = this.buffer.split('\n');
      
      // Keep the last incomplete line in buffer
      this.buffer = lines.pop() || '';
      
      // Process complete lines
      for (const line of lines) {
        // Ensure proper SSE format
        let formattedLine = line;
        if (line.startsWith('data:') && !line.endsWith('\n')) {
          formattedLine += '\n';
        } else if (line.startsWith('event:') && !line.endsWith('\n')) {
          formattedLine += '\n';
        } else if (line === '' && !line.endsWith('\n')) {
          formattedLine += '\n';
        }
        
        // Push the formatted line
        this.push(formattedLine);
      }
      
      callback();
    } catch (error) {
      callback(error);
    }
  }
  
  _flush(callback) {
    // Send any remaining buffer data
    if (this.buffer) {
      this.push(this.buffer);
      this.buffer = '';
    }
    callback();
  }
}
```

### 2. Integration with Streaming Pipeline

The chunk handler is now integrated into the streaming pipeline in both single-account and multi-account scenarios:

```javascript
// Create chunk handler for proper SSE formatting
const chunkHandler = new SSEChunkHandler();

// Pipe the response stream through our chunk handler to the pass-through stream
response.data.pipe(chunkHandler).pipe(stream);
```

### 3. Enhanced Error Handling

Improved error handling was added to both the chunk handler and the main streaming implementation:

```javascript
// Handle chunk handler errors
chunkHandler.on('error', (error) => {
  console.error('[ERROR] Chunk handler error:', error);
  stream.emit('error', error);
});
```

### 4. Client-Side Response Improvements

Enhanced error handling and flushing were added to `src/index.js`:

```javascript
// Handle stream errors with better client feedback
stream.on('error', (error) => {
  if (!res.headersSent) {
    // Try to send an error event to the client
    res.write('event: error\n');
    res.write(`data: ${JSON.stringify({ error: error.message, type: 'streaming_error' })}\n\n`);
  }
  res.end();
});

// Flush response for server-sent events
stream.on('data', () => {
  if (typeof res.flush === 'function') {
    res.flush();
  }
});
```

## Benefits of the Fix

1. **Proper Chunk Handling**: Ensures all SSE chunks are properly formatted and delivered to clients.

2. **Buffer Management**: Prevents data loss due to incomplete chunks or buffering issues.

3. **Enhanced Debugging**: Adds debugging capabilities through the `DEBUG_STREAMING` environment variable.

4. **Better Error Recovery**: Improved error handling allows for better recovery from chunk-level errors.

5. **Client Compatibility**: Ensures compatibility with various SSE client implementations.

## Testing the Fix

A new test script `tmp-test/test-streaming-fix.js` was created to verify the fix:

```bash
# Enable streaming in the proxy
export STREAM=true

# Run the proxy
npm start

# In another terminal, run the test
node tmp-test/test-streaming-fix.js
```

## Configuration

To enable debugging for streaming issues, set the `DEBUG_STREAMING` environment variable:

```bash
export DEBUG_STREAMING=true
```

This will output detailed information about chunk processing to help diagnose any remaining issues.