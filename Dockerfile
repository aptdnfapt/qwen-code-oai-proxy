FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build:core

RUN mkdir -p /root/.qwen /root/.local/share/qwen-proxy

EXPOSE ${PORT:-8080}

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENV HOST=0.0.0.0

CMD ["node", "dist/src/cli/qwen-proxy.js", "serve", "--headless"]
