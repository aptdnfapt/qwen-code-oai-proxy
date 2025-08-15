# Qwen OpenAI Proxy - Production Deployment Guide

This guide covers deploying the Qwen OpenAI Proxy to production environments with the web dashboard.

## 📋 Prerequisites

- **Node.js**: Version 16.x or higher
- **npm**: Version 8.x or higher
- **PM2**: Process manager for Node.js applications
- **Nginx**: Reverse proxy (recommended)
- **SSL Certificate**: For HTTPS (recommended)

## 🚀 Quick Deploy

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/qwen-code-oai-proxy.git
cd qwen-code-oai-proxy

# Install dependencies
npm install

# Install PM2 globally
npm install -g pm2
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit configuration (see Configuration section below)
nano .env
```

### 3. Start Production Server

```bash
# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

## ⚙️ Configuration

### Essential Environment Variables

```bash
# Server
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

# Dashboard Security
DASHBOARD_ENABLED=true
DASHBOARD_USER=your_admin_username
DASHBOARD_PASSWORD=your_secure_password
DASHBOARD_SESSION_SECRET=your_unique_session_secret

# Security
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX_ATTEMPTS=5
ALLOWED_ORIGINS=https://yourdomain.com

# SSL (if using HTTPS directly)
HTTPS_ENABLED=true
SSL_CERT_PATH=/path/to/ssl/cert.pem
SSL_KEY_PATH=/path/to/ssl/key.pem
```

### Generate Secure Values

```bash
# Generate session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate secure password
openssl rand -base64 32
```

## 🔒 Nginx Configuration

### Basic Reverse Proxy

Create `/etc/nginx/sites-available/qwen-proxy`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    
    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Proxy to Node.js application
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Static files caching
    location /dashboard/static/ {
        proxy_pass http://127.0.0.1:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }
}
```

### Enable the Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/qwen-proxy /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

## 🐳 Docker Deployment

### Dockerfile

```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S qwen -u 1001

# Set permissions
RUN chown -R qwen:nodejs /app
USER qwen

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start application
CMD ["node", "src/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  qwen-proxy:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DASHBOARD_ENABLED=true
    env_file:
      - .env
    volumes:
      - qwen_data:/app/.qwen
      - ./logs:/app/logs
    restart: unless-stopped
    networks:
      - qwen_network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl
    depends_on:
      - qwen-proxy
    restart: unless-stopped
    networks:
      - qwen_network

volumes:
  qwen_data:

networks:
  qwen_network:
    driver: bridge
```

## 📊 Monitoring

### PM2 Monitoring

```bash
# View running processes
pm2 list

# Monitor logs
pm2 logs qwen-proxy

# Monitor performance
pm2 monit

# View detailed info
pm2 show qwen-proxy
```

### Health Checks

The application provides several monitoring endpoints:

- `GET /health` - Basic health check
- `GET /api/stats/realtime` - Real-time statistics (requires authentication)
- `GET /api/stats/performance` - Performance metrics (requires authentication)

### Log Management

```bash
# Rotate logs
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

## 🔧 Maintenance

### Updates

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Restart with zero downtime
pm2 reload qwen-proxy
```

### Backup

```bash
# Backup configuration and data
tar -czf qwen-proxy-backup-$(date +%Y%m%d).tar.gz .env ~/.qwen/

# Automated backup script (add to crontab)
0 2 * * * /path/to/backup-script.sh
```

### Security Updates

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update
```

## 🚨 Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   sudo netstat -tlnp | grep :3000
   sudo kill -9 <PID>
   ```

2. **Permission errors**
   ```bash
   sudo chown -R $USER:$USER ~/.qwen
   ```

3. **Memory issues**
   ```bash
   # Increase memory limit
   pm2 restart qwen-proxy --max-memory-restart 2G
   ```

4. **SSL certificate issues**
   ```bash
   # Test SSL configuration
   sudo nginx -t
   sudo certbot renew --dry-run
   ```

### Log Analysis

```bash
# View application logs
pm2 logs qwen-proxy --lines 100

# View error logs only
pm2 logs qwen-proxy --err

# View access logs
tail -f /var/log/nginx/access.log
```

## 📈 Performance Tuning

### Node.js Optimization

```bash
# Set Node.js options
export NODE_OPTIONS="--max-old-space-size=2048"

# Enable production optimizations
export NODE_ENV=production
```

### PM2 Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'qwen-proxy',
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=2048'
  }]
};
```

### Database Optimization

```bash
# Clean up old statistics
node scripts/cleanup-stats.js

# Optimize storage
node scripts/optimize-storage.js
```

## 🛡️ Security Checklist

- [ ] Change default passwords
- [ ] Generate secure session secrets
- [ ] Configure CORS origins
- [ ] Enable HTTPS
- [ ] Set up rate limiting
- [ ] Configure firewall
- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity
- [ ] Backup encryption keys
- [ ] Implement monitoring alerts

## 📞 Support

For deployment issues:

1. Check the logs: `pm2 logs qwen-proxy`
2. Verify configuration: `pm2 show qwen-proxy`
3. Test health endpoint: `curl http://localhost:3000/health`
4. Review this guide and documentation

## 🔄 Rollback Procedure

If deployment fails:

```bash
# Stop current version
pm2 stop qwen-proxy

# Restore from backup
tar -xzf qwen-proxy-backup-<date>.tar.gz

# Start previous version
pm2 start ecosystem.config.js --env production
```