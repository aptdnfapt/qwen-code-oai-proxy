# Qwen OpenAI-Compatible Proxy Server

A comprehensive enterprise-grade proxy server that exposes Qwen models through an OpenAI-compatible API endpoint with advanced dashboard, security, and monitoring features.

## ✨ Features

### 🔗 API Compatibility
- **OpenAI-compatible endpoints** for seamless integration
- **Tool calling support** for opencode, crush, and other AI tools
- **Streaming responses** with configurable settings
- **Multiple Qwen models** (qwen3-coder-plus, qwen3-turbo, etc.)

### 🎛️ Enterprise Dashboard
- **Web-based admin interface** with secure authentication
- **API key management** with usage tracking and permissions
- **OAuth account management** with device flow setup
- **Real-time statistics** and monitoring displays
- **Multi-account support** with automatic rotation

### 🔒 Security & Compliance
- **Helmet.js security headers** and CSRF protection
- **Rate limiting** with configurable thresholds
- **Input validation** and sanitization middleware
- **Session management** with secure configurations
- **SQL injection and XSS** detection/prevention

### 📊 Monitoring & Analytics
- **Real-time API metrics** and request tracking
- **Performance monitoring** with response time analytics
- **Error logging** with detailed context and stack traces
- **Resource usage tracking** (memory, CPU, connections)
- **Daily statistics** aggregation and retention

### 🚀 Production Ready
- **Docker containerization** with multi-stage builds
- **PM2 process management** with ecosystem configuration
- **Nginx reverse proxy** configuration included
- **Environment-based configuration** management
- **Comprehensive deployment** documentation

## 🚀 Quick Start

### Basic Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Authenticate with Qwen**:
   ```bash
   npm run auth:add <account-id>
   ```

4. **Start the Server**:
   ```bash
   npm start
   ```

5. **Access Dashboard**: 
   - Open http://localhost:8951/dashboard
   - Login with credentials from your .env file

### Dashboard Setup

The dashboard provides a user-friendly interface for:

- **Account Management**: Add/remove Qwen OAuth accounts
- **API Key Creation**: Generate and manage API keys with custom permissions
- **Usage Analytics**: Monitor request counts, response times, and error rates
- **System Health**: View real-time server metrics and performance

**Default Login**: Check your `.env` file for `DASHBOARD_USER` and `DASHBOARD_PASSWORD`

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

# Dashboard Settings
DASHBOARD_ENABLED=true
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=your-secure-password
DASHBOARD_SESSION_SECRET=your-session-secret

# Security Settings
RATE_LIMIT_WINDOW=900000          # 15 minutes
RATE_LIMIT_MAX_ATTEMPTS=5
ALLOWED_ORIGINS=https://yourdomain.com

# API Configuration
DEFAULT_MODEL=qwen3-coder-plus
STREAM_ENABLED=true
REQUEST_TIMEOUT=30000

# Monitoring
DEBUG_LOGGING=false
LOG_RETENTION_DAYS=30
PERFORMANCE_MONITORING=true
```

### Production Deployment

#### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t qwen-proxy .
docker run -p 8951:8951 --env-file .env qwen-proxy
```

#### PM2 Process Management
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js

# Monitor processes
pm2 monit
```

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:8951;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 🔑 Multi-Account Support

The proxy supports multiple Qwen accounts to overcome daily request limits:

### Managing Accounts

```bash
# List existing accounts
npm run auth:list

# Add a new account
npm run auth:add <account-id>

# Remove an account
npm run auth:remove <account-id>

# Check request counts
npm run auth:counts
```

### Account Rotation
- Automatic rotation when quota limits are reached
- Round-robin distribution for load balancing
- Real-time monitoring in dashboard
- Request counting with daily reset at UTC midnight

## 📡 API Usage

### Basic Example
```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'your-api-key', // Generated from dashboard
  baseURL: 'http://localhost:8951/v1'
});

const response = await openai.chat.completions.create({
  model: 'qwen3-coder-plus',
  messages: [
    { "role": "user", "content": "Hello!" }
  ],
  temperature: 0.7
});
```

### Supported Endpoints

- `POST /v1/chat/completions` - Chat completions with tool calling
- `GET /v1/models` - List available models
- `GET /health` - Health check endpoint

### API Key Authentication

All API requests require authentication via API key:

```bash
curl -H "Authorization: Bearer your-api-key" \
     -H "Content-Type: application/json" \
     -d '{"model":"qwen3-coder-plus","messages":[{"role":"user","content":"Hello"}]}' \
     http://localhost:8951/v1/chat/completions
```

## 🛠️ Tool Integration

### opencode Configuration
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "qwen-proxy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "proxy",
      "options": {
        "baseURL": "http://localhost:8951/v1",
        "apiKey": "your-api-key"
      },
      "models": {
        "qwen3-coder-plus": {
          "name": "qwen3"
        }
      }
    }
  }
}
```

### crush Configuration
```json
{
  "$schema": "https://charm.land/crush.json",
  "providers": {
    "qwen-proxy": {
      "type": "openai",
      "base_url": "http://localhost:8951/v1",
      "api_key": "your-api-key",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "context_window": 150000,
          "default_max_tokens": 64000
        }
      ]
    }
  }
}
```

## 📊 Monitoring & Analytics

### Dashboard Features
- **Real-time Metrics**: Request counts, response times, error rates
- **Account Usage**: Track quota usage across multiple accounts
- **API Key Analytics**: Monitor usage per API key
- **System Health**: CPU, memory, and connection monitoring
- **Error Tracking**: Detailed error logs with stack traces

### API Metrics
The proxy tracks comprehensive metrics including:
- Request/response times
- Token usage statistics
- Error rates and types
- Account rotation events
- Rate limiting events

## ⚠️ Important Notes

### Context Limits
Users might face errors or 504 Gateway Timeout issues when using contexts with 130,000 to 150,000 tokens or more. This appears to be a practical limit for Qwen models.

### Security Considerations
- Always use HTTPS in production
- Regularly rotate API keys and passwords
- Monitor access logs for suspicious activity
- Keep the system updated with security patches

### Performance Tips
- Enable clustering for high-traffic deployments
- Use Redis for session storage in multi-instance setups
- Configure appropriate rate limits based on your usage patterns
- Monitor resource usage and scale accordingly

## 📁 Project Structure

```
qwen-code-oai-proxy/
├── src/
│   ├── dashboard/          # Dashboard frontend and routes
│   ├── monitoring/         # Statistics and monitoring
│   ├── security/           # Security middleware and config
│   ├── qwen/              # Qwen API client and auth
│   └── utils/             # Utility functions
├── docker-compose.yml     # Docker Compose configuration
├── ecosystem.config.js    # PM2 configuration
├── nginx/                 # Nginx configuration
└── DEPLOYMENT.md         # Detailed deployment guide
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

Apache-2.0 License - see LICENSE file for details.

## 🔗 Links

- **Repository**: https://github.com/quantmind-br/qwen-code-oai-proxy
- **Issues**: https://github.com/quantmind-br/qwen-code-oai-proxy/issues
- **Documentation**: See `DEPLOYMENT.md` for detailed setup instructions