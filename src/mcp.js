const config = require('./config.js');
const { DebugLogger } = require('./utils/logger.js');
const axios = require('axios');

const debugLogger = new DebugLogger();

// MCP sessions for SSE
const mcpSessions = new Map();

// GET handler for MCP SSE endpoint
const mcpGetHandler = (req, res) => {
  // SSE endpoint for MCP transport
  const sessionId = req.query.sessionId || Math.random().toString(36).substring(2);
  mcpSessions.set(sessionId, res);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });
  res.write(`event: endpoint\ndata: /mcp?sessionId=${sessionId}\n\n`);

  // Keep connection open
  res.on('close', () => {
    mcpSessions.delete(sessionId);
  });
};

// POST handler for MCP JSON-RPC
const mcpPostHandler = async (req, res) => {
  try {
    // Verify API key first (only if API keys are configured)
    const apiKey = req.headers.authorization?.replace('Bearer ', '') ||
                   req.headers['x-api-key'];

    if (config.apiKey && !config.apiKey.includes(apiKey)) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Unauthorized - Invalid API key' },
        id: req.body.id || null
      });
    }

    const { jsonrpc, method, params, id } = req.body;

    // Validate JSON-RPC 2.0 format
    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid JSON-RPC version' },
        id: id || null
      });
    }

    const sessionId = req.query.sessionId;
    const sessionRes = mcpSessions.get(sessionId);

    const sendResponse = (response) => {
      if (sessionRes) {
        sessionRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
        res.status(200).end(); // Acknowledge the POST
      } else {
        res.json(response);
      }
    };

    const sendError = (error) => {
      if (sessionRes) {
        sessionRes.write(`event: message\ndata: ${JSON.stringify(error)}\n\n`);
        res.status(200).end();
      } else {
        res.status(error.error.code === -32600 ? 400 : 500).json(error);
      }
    };

    switch (method) {
      case 'initialize':
        // MCP initialization handshake
        sendResponse({
          jsonrpc: '2.0',
          id: id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {
                listChanged: false
              }
            },
            serverInfo: {
              name: 'qwen-proxy-mcp-server',
              version: '1.0.0'
            }
          }
        });
        break;

      case 'tools/list':
        sendResponse({
          jsonrpc: '2.0',
          id: id,
          result: {
            tools: [{
              name: 'web_search',
              description: 'Search the web using Qwen\'s search infrastructure with automatic account rotation',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'The search query to perform'
                  },
                  page: {
                    type: 'number',
                    description: 'Page number for pagination (default: 1, min: 1)',
                    minimum: 1
                  },
                  rows: {
                    type: 'number',
                    description: 'Number of results per page (default: 10, min: 1, max: 100)',
                    minimum: 1,
                    maximum: 100
                  }
                },
                required: ['query']
              }
            }]
          }
        });
        break;

      case 'tools/call':
        const { name, arguments: args } = params;

        if (name === 'web_search') {
          const { query, page, rows } = args;

          // Validate required parameters
          if (!query || typeof query !== 'string') {
            sendError({
              jsonrpc: '2.0',
              error: { code: -32602, message: 'Invalid or missing query parameter' },
              id: id
            });
            break;
          }

          try {
            // Use the /v1/web/search endpoint
            const response = await axios.post(`http://${config.host}:${config.port}/v1/web/search`, {
              query: query.trim(),
              page: page || 1,
              rows: rows || 10
            });

            sendResponse({
              jsonrpc: '2.0',
              id: id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2)
                }]
              }
            });
          } catch (searchError) {
            sendError({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Web search failed: ' + searchError.message },
              id: id
            });
          }
        } else {
          sendError({
            jsonrpc: '2.0',
            error: { code: -32601, message: `Tool '${name}' not found` },
            id: id
          });
        }
        break;

      default:
        sendError({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method '${method}' not found` },
          id: id
        });
    }
  } catch (error) {
    console.error('MCP endpoint error:', error.message);
    const debugFileName = await debugLogger.logApiCall('/mcp', req, null, error);
    await debugLogger.logError('/mcp', error, 'error');

    const sessionId = req.query.sessionId;
    const sessionRes = mcpSessions.get(sessionId);
    const errorResponse = {
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: req.body.id || null
    };

    if (sessionRes) {
      sessionRes.write(`event: message\ndata: ${JSON.stringify(errorResponse)}\n\n`);
      res.status(200).end();
    } else {
      res.status(500).json(errorResponse);
    }
  }
};

module.exports = {
  mcpGetHandler,
  mcpPostHandler
};