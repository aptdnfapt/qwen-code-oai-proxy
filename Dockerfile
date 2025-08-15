# Dockerfile for Qwen OpenAI Proxy
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S qwen -u 1001 -G nodejs

# Copy application code
COPY --chown=qwen:nodejs . .

# Create necessary directories
RUN mkdir -p /app/.qwen /app/logs /app/stats && \
    chown -R qwen:nodejs /app

# Switch to non-root user
USER qwen

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "src/index.js"]