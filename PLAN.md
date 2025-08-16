# Dashboard Web para Gerenciamento de Credenciais Qwen

## 🎯 Objetivo

Criar um dashboard web integrado ao proxy para permitir o gerenciamento de credenciais Qwen de forma visual e interativa, especialmente útil para deployments em VPS onde não há acesso direto ao sistema de arquivos.

## 🌐 Cenário de Uso Principal

### VPS Deployment
- Aplicação roda em VPS remoto
- Sem credenciais iniciais em `~/.qwen/`
- Configuração 100% via interface web
- Acesso via `http://vps-ip:8080/dashboard`

## 🏗️ Arquitetura Escolhida: Dashboard Integrado

```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Proxy Server  │
│   (Vanilla JS)  │◄──►│   + Dashboard   │
│   Dashboard     │    │   API Routes    │
└─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  ~/.qwen/       │
                       │  Credentials    │
                       └─────────────────┘
```

## 🔧 Funcionalidades Principais

### 1. **Setup Inicial (First Run)**
- Detectar se é primeira execução (sem credenciais)
- Wizard de configuração inicial
- Redirecionar automaticamente para dashboard se não configurado

### 2. **Gerenciamento de Contas Qwen**
- ✅ Visualizar contas existentes com status
- ✅ Adicionar novas contas via OAuth link (NÃO QR Code)
- ✅ Remover contas existentes
- ✅ Monitorar uso diário (requests/day)

### 3. **Sistema de API Keys**
- ✅ Gerar chaves API no padrão OpenAI (sk-xxxx)
- ✅ Gerenciar chaves: criar, visualizar, editar, excluir
- ✅ Validação de requisições usando Authorization: Bearer
- ✅ Armazenamento persistente das chaves
- ✅ Metadados: nome, data criação, último uso, status
- ✅ Dashboard para administração das chaves

### 4. **Método de Autenticação Qwen: OAuth Link Direto**
**Escolhido:** Link direto ao invés de QR Code

#### Fluxo de Autenticação:
1. Usuário clica "Adicionar Conta"
2. Sistema gera `device_code` + `verification_uri`
3. Exibe link clicável: `https://chat.qwen.ai/activate?user_code=ABCD`
4. Usuário clica no link (abre nova aba)
5. Autoriza na página da Qwen
6. Dashboard faz polling para verificar autorização
7. Credenciais são salvas automaticamente

#### Vantagens vs QR Code:
- ✅ Mais user-friendly
- ✅ Funciona em qualquer dispositivo
- ✅ Fluxo OAuth padrão
- ✅ Mais confiável
- ✅ Não precisa de câmera

## 📁 Estrutura de Arquivos Proposta

```
src/
├── dashboard/           # Nova pasta para dashboard
│   ├── public/         # Arquivos estáticos
│   │   ├── login.html  # Tela de login
│   │   ├── index.html  # Dashboard principal
│   │   ├── setup.html  # Wizard primeira vez
│   │   ├── app.js      # JavaScript principal
│   │   └── style.css   # Estilos
│   ├── routes/         # Rotas da API do dashboard
│   │   ├── auth.js     # Autenticação do dashboard
│   │   ├── accounts.js # CRUD de contas Qwen
│   │   ├── apikeys.js  # CRUD de API keys
│   │   ├── oauth.js    # Fluxo OAuth Qwen
│   │   └── stats.js    # Estatísticas
│   └── middleware/     # Middlewares específicos
│       ├── auth.js     # Verificação de login dashboard
│       ├── apikey.js   # Validação de API keys
│       └── dashboard.js
├── utils/              # Utilitários
│   ├── apiKeyManager.js # Geração e validação de chaves
│   └── storage.js      # Persistência de dados
├── index.js            # Servidor principal (modificar)
└── ...                 # Arquivos existentes
```

## 🛣️ Rotas da API Novas

### Autenticação do Dashboard
- `GET /login` → Tela de login do dashboard
- `POST /api/auth/login` → Autenticação (login/senha)
- `POST /api/auth/logout` → Logout da sessão
- `GET /api/auth/verify` → Verificar se está logado

### Dashboard e Setup
- `GET /` → Redireciona para dashboard se não configurado
- `GET /dashboard` → Serve interface do dashboard (requer login)
- `GET /api/setup/status` → Verifica se precisa configuração inicial

### Gerenciamento de Contas Qwen
- `GET /api/accounts` → Lista todas as contas
- `POST /api/accounts/initiate` → Inicia processo OAuth para nova conta
- `GET /api/accounts/status/:deviceCode` → Polling do status OAuth
- `DELETE /api/accounts/:accountId` → Remove conta
- `GET /api/accounts/stats` → Estatísticas de uso

### Gerenciamento de API Keys
- `GET /api/keys` → Lista todas as chaves API
- `POST /api/keys` → Cria nova chave API
- `PUT /api/keys/:keyId` → Edita chave (nome, status)
- `DELETE /api/keys/:keyId` → Exclui chave API
- `GET /api/keys/:keyId/stats` → Estatísticas de uso da chave

### Interceptação e Validação de Requisições API
- `ALL /v1/*` → Middleware de validação de API key obrigatório
- Verificar `Authorization: Bearer sk-xxxxx`
- Se chave inválida → HTTP 401 Unauthorized
- Se sem credenciais Qwen → HTTP 503 com link para dashboard

## 🔄 Fluxo de Setup Inicial (VPS)

```
1. Deploy → docker-compose up -d (com DASHBOARD_USER/DASHBOARD_PASSWORD)
2. Primeiro acesso → http://vps-ip:8080 → Redireciona para /login
3. Login → Usuário insere credenciais definidas em .env
4. Dashboard → Se sem credenciais Qwen, mostra wizard de setup
5. Setup Wizard → Interface para adicionar primeira conta
6. OAuth Flow → Link direto para autorização Qwen
7. Polling → Verifica autorização automaticamente
8. Gerar API Keys → Administrador cria chaves para usuários
9. Configuração completa → API /v1/* fica disponível (com validação de chaves)
10. Gerenciamento → Dashboard para contas Qwen + API Keys
```

## 📊 Interface Mockup

### Tela de Login
```
┌─────────────────────────────────────────────────────────┐
│ 🔐 Qwen Proxy Dashboard - Login                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    Welcome Back!                        │
│              Please login to continue                   │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │  Username: [________________]                       │ │
│ │                                                     │ │
│ │  Password: [________________]                       │ │
│ │                                                     │ │
│ │                    [🔐 Login]                       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ 💡 Credentials are configured via environment variables │
└─────────────────────────────────────────────────────────┘
```

### Wizard de Setup Inicial
```
┌─────────────────────────────────────────────────────────┐
│ 🚀 Welcome to Qwen Proxy Dashboard                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ No Qwen accounts configured yet.                        │
│ Let's set up your first account to get started!        │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │  🔗 Add Your First Account                          │ │
│ │                                                     │ │
│ │  Account ID: [account1        ] (optional)          │ │
│ │                                                     │ │
│ │              [🚀 Start Authorization]               │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Processo de Autorização
```
┌─────────────────────────────────────────────────────────┐
│ Add Account: account1                          [Cancel] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🔗 Authorize This Proxy                                 │
│                                                         │
│ Click to authorize this proxy in your Qwen account:    │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │  🚀 Open Qwen Authorization Page                    │ │
│ │     https://chat.qwen.ai/activate?user_code=ABCD    │ │
│ │                                                     │ │
│ │  Code to enter: ABCD-EFGH                           │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ⏳ Waiting for authorization... 847s remaining          │
└─────────────────────────────────────────────────────────┘
```

### Dashboard Principal
```
┌─────────────────────────────────────────────────────────┐
│ Qwen Proxy Dashboard        [Qwen Accounts] [API Keys] │
├─────────────────────────────────────────────────────────┤
│ 📊 Overview                                             │
│ ┌─────────────────┬─────────────────┬─────────────────┐ │
│ │ Qwen Accounts   │ API Keys        │ Requests Today  │ │
│ │ 3 Active        │ 5 Active        │ 2,847 Total     │ │
│ └─────────────────┴─────────────────┴─────────────────┘ │
│                                                         │
│ 🔑 API Keys Management                    [+ New API Key] │
│ ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│ │ Key Name    │ Key (Last 4)│ Last Used   │ Actions     │ │
│ ├─────────────┼─────────────┼─────────────┼─────────────┤ │
│ │ 🟢 Frontend │ sk-...abc123│ 2 mins ago  │ [Edit][Del] │ │
│ │ 🟢 Mobile   │ sk-...def456│ 1 hour ago  │ [Edit][Del] │ │
│ │ 🔴 TestKey  │ sk-...xyz789│ Never       │ [Edit][Del] │ │
│ └─────────────┴─────────────┴─────────────┴─────────────┘ │
│                                                         │
│ 🏢 Qwen Accounts                        [+ Add Account] │
│ ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│ │ Account     │ Status      │ Requests    │ Actions     │ │
│ ├─────────────┼─────────────┼─────────────┼─────────────┤ │
│ │ 🟢 account1 │ Active      │ 157/2000   │ [Remove]    │ │
│ │ 🟢 account2 │ Active      │ 1,892/2000 │ [Remove]    │ │
│ │ 🔴 team     │ Quota Full  │ 2,000/2000 │ [Remove]    │ │
│ └─────────────┴─────────────┴─────────────┴─────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Modal de Criação de API Key
```
┌─────────────────────────────────────────────────────────┐
│ 🔑 Create New API Key                          [X Close] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Key Name: [Frontend Application    ]                    │
│                                                         │
│ Description (optional):                                 │
│ [Key for main frontend app authentication]              │
│                                                         │
│ Permissions: [✓] Chat Completions                       │
│              [✓] List Models                            │
│              [✓] Full Access                            │
│                                                         │
│ Rate Limit: [No Limit ▼] [Custom: ___ req/min]          │
│                                                         │
│                           [Cancel] [🔑 Generate Key]    │
└─────────────────────────────────────────────────────────┘
```

### Resultado da Geração
```
┌─────────────────────────────────────────────────────────┐
│ ✅ API Key Created Successfully!                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🔐 Your new API key:                                    │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ sk-1234567890abcdef1234567890abcdef1234567890abcd   │ │
│ │                                         [📋 Copy]   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ⚠️ IMPORTANT: Save this key now! You won't be able to  │
│    see it again for security reasons.                   │
│                                                         │
│ 💡 Usage:                                               │
│    Authorization: Bearer sk-1234567890abcdef...         │
│                                                         │
│                                             [Got it!]   │
└─────────────────────────────────────────────────────────┘
```

## 🐳 Considerações de Deploy

### Docker/VPS
- Volume persistente para `~/.qwen/` (credenciais Qwen)
- Volume persistente para `~/.qwen/api_keys.json` (chaves API)
- Variável `DASHBOARD_ENABLED=true`
- Porta 8080 exposta
- Suporte a configuração via env vars

### Armazenamento Persistente
```
~/.qwen/
├── oauth_creds_*.json      # Credenciais Qwen (existente)
├── api_keys.json           # Banco de chaves API
├── key_usage_stats.json    # Estatísticas de uso por chave
└── request_counts.json     # Contadores de requisições (existente)
```

#### Estrutura do api_keys.json:
```json
{
  "keys": {
    "key_001": {
      "id": "key_001",
      "name": "Frontend App",
      "description": "Main frontend application key",
      "key_hash": "pbkdf2_sha256$260000$salt$hash",
      "key_prefix": "sk-proj",
      "key_suffix": "...abcd",
      "masked_key": "sk-proj...abcd",
      "status": "active",
      "created_at": "2024-01-15T10:30:00Z",
      "last_used": "2024-01-15T14:25:30Z",
      "permissions": ["chat.completions", "models.list"],
      "rate_limit": null,
      "usage_count": 1547
    }
  },
  "version": "1.0"
}
```

### Segurança
- **Dashboard com autenticação obrigatória**
- Login/senha definidos em variáveis de ambiente
- Sessão com cookies/JWT
- Tela de login antes de acessar dashboard

## 🔧 Detalhes Técnicos do Sistema de API Keys

### Geração de Chaves
```javascript
// Formato: sk-proj-{48 caracteres hexadecimais aleatórios}
// Exemplo: sk-proj-1234567890abcdef1234567890abcdef1234567890abcd
function generateApiKey() {
  const prefix = 'sk-proj-';  // Prefixo identificador
  const randomBytes = crypto.randomBytes(24); // 24 bytes = 48 chars hex
  const randomPart = randomBytes.toString('hex');
  return prefix + randomPart;
}

// Armazenamento seguro (nunca salvar chave em texto plano)
async function hashApiKey(apiKey) {
  const salt = crypto.randomBytes(32).toString('hex');
  const iterations = 260000;
  const keylen = 64;
  const digest = 'sha256';
  
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(apiKey, salt, iterations, keylen, digest, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`pbkdf2_sha256$${iterations}$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}
```

### Validação e Middleware
```javascript
// Middleware para todas as rotas /v1/*
async function validateApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer sk-')) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key format',
        type: 'invalid_request_error'
      }
    });
  }
  
  const apiKey = authHeader.replace('Bearer ', '');
  const keyData = await apiKeyManager.validateKey(apiKey);
  
  if (!keyData) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'invalid_request_error'
      }
    });
  }
  
  // Atualizar último uso e contadores
  await apiKeyManager.updateLastUsed(apiKey);
  req.apiKey = keyData;
  next();
}
```

### Compatibilidade com OpenAI
- **Headers idênticos**: `Authorization: Bearer sk-xxxxx`
- **Formato de erro igual**: Mesma estrutura de resposta de erro
- **Códigos HTTP padrão**: 401 para chave inválida, 403 para sem permissão
- **Interceptação transparente**: Cliente não sabe que é proxy

## 🔒 Considerações de Segurança e Boas Práticas

### Segurança das API Keys
- **Nunca armazenar chaves em texto plano** - usar PBKDF2 ou Argon2
- **Mostrar chave completa apenas uma vez** durante criação
- **Usar comparação de tempo constante** para prevenir timing attacks
- **Rate limiting por chave** para prevenir abuso
- **Logs de auditoria** para todas as operações com chaves

### Segurança do Dashboard
- **HTTPS obrigatório em produção** - nunca transmitir credenciais em HTTP
- **CSRF tokens** em todos os formulários
- **Session timeout** após período de inatividade
- **Rate limiting no login** para prevenir brute force
- **2FA opcional** para administradores (futuro)

### Rate Limiting e Throttling
```javascript
// Configuração de rate limiting por API key
const rateLimits = {
  'default': { requests: 100, window: 60000 }, // 100 req/min
  'premium': { requests: 1000, window: 60000 }, // 1000 req/min
  'custom': { requests: null, window: null } // Configurável
};

// Implementação com sliding window
class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = new Map(); // keyId -> timestamps[]
  }
  
  async checkLimit(keyId) {
    const now = Date.now();
    const timestamps = this.requests.get(keyId) || [];
    
    // Remove timestamps fora da janela
    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);
    
    if (validTimestamps.length >= this.limit) {
      return { allowed: false, retryAfter: this.windowMs - (now - validTimestamps[0]) };
    }
    
    validTimestamps.push(now);
    this.requests.set(keyId, validTimestamps);
    return { allowed: true, remaining: this.limit - validTimestamps.length };
  }
}
```

### Sistema de Permissões Granular
```javascript
// Permissões disponíveis
const PERMISSIONS = {
  'chat.completions.create': 'Create chat completions',
  'chat.completions.stream': 'Stream chat completions',
  'models.list': 'List available models',
  'models.retrieve': 'Get model details',
  'usage.read': 'View usage statistics',
  'admin.keys.manage': 'Manage other API keys'
};

// Validação de permissões no middleware
function checkPermission(permission) {
  return (req, res, next) => {
    if (!req.apiKey.permissions.includes(permission)) {
      return res.status(403).json({
        error: {
          message: `Missing required permission: ${permission}`,
          type: 'insufficient_permissions'
        }
      });
    }
    next();
  };
}
```

## 📦 Configuração para Produção

### Variáveis de Ambiente
```bash
# .env.production
NODE_ENV=production
PORT=8080
HOST=0.0.0.0

# Dashboard Auth
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=<strong-password>
DASHBOARD_SESSION_SECRET=<random-32-chars>
DASHBOARD_SESSION_TIMEOUT=1800000  # 30 min

# Security
ENABLE_HTTPS=true
SSL_CERT_PATH=/etc/ssl/certs/proxy.crt
SSL_KEY_PATH=/etc/ssl/private/proxy.key
FORCE_HTTPS=true

# Rate Limiting
DEFAULT_RATE_LIMIT=100
DEFAULT_RATE_WINDOW=60000

# Storage
DATA_DIR=/var/lib/qwen-proxy
LOG_DIR=/var/log/qwen-proxy
```

### Docker Compose Completo
```yaml
version: '3.8'
services:
  qwen-proxy:
    build: .
    restart: unless-stopped
    ports:
      - "443:8080"
    volumes:
      - qwen-data:/var/lib/qwen-proxy
      - qwen-logs:/var/log/qwen-proxy
      - ./ssl:/etc/ssl/qwen:ro
    environment:
      - NODE_ENV=production
      - ENABLE_HTTPS=true
      - DATA_DIR=/var/lib/qwen-proxy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - proxy-network

  # Opcional: Redis para sessões e rate limiting
  redis:
    image: redis:alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data
    networks:
      - proxy-network

volumes:
  qwen-data:
  qwen-logs:
  redis-data:

networks:
  proxy-network:
```

## 📊 Monitoramento e Observabilidade

### Métricas Essenciais
```javascript
// Métricas a coletar
const metrics = {
  // API Keys
  apiKeysTotal: 0,
  apiKeysActive: 0,
  apiKeysRevoked: 0,
  
  // Requisições
  requestsTotal: 0,
  requestsSuccess: 0,
  requestsFailed: 0,
  requestsRateLimited: 0,
  
  // Performance
  responseTimeP50: 0,
  responseTimeP95: 0,
  responseTimeP99: 0,
  
  // Qwen Accounts
  qwenAccountsActive: 0,
  qwenAccountsQuotaExceeded: 0,
  qwenTokenRefreshes: 0
};

// Estrutura de logs estruturados
const logFormat = {
  timestamp: new Date().toISOString(),
  level: 'info|warn|error',
  service: 'qwen-proxy',
  component: 'api|dashboard|auth',
  event: 'api_key_created|request_processed|auth_failed',
  metadata: {
    keyId: 'key_001',
    userId: 'admin',
    ip: '192.168.1.1',
    duration: 145,
    status: 200
  }
};
```

### Health Check Endpoint
```javascript
// GET /health
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: await checkDatabase(),
      qwenAuth: await checkQwenAuth(),
      diskSpace: await checkDiskSpace(),
      memory: process.memoryUsage()
    }
  };
  
  const statusCode = health.checks.database && health.checks.qwenAuth ? 200 : 503;
  res.status(statusCode).json(health);
});
```

### Dashboard de Métricas
```
┌─────────────────────────────────────────────────────────┐
│ 📊 System Metrics                              [Refresh] │
├─────────────────────────────────────────────────────────┤
│ Performance Metrics                                     │
│ ┌─────────────────┬─────────────────┬─────────────────┐ │
│ │ Requests/min    │ Avg Response    │ Error Rate      │ │
│ │ 247             │ 145ms           │ 0.2%            │ │
│ └─────────────────┴─────────────────┴─────────────────┘ │
│                                                         │
│ API Key Usage (Last 24h)                               │
│ ┌───────────────────────────────────────────────────┐   │
│ │     ▂▄█▇▅▃▂▁▂▄▆█▇▅▃▂▁▂▄▆▇█▅▃                   │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ Top API Keys by Usage                                   │
│ ┌─────────────┬─────────────┬─────────────────────────┐ │
│ │ Key Name    │ Requests    │ Last Error              │ │
│ ├─────────────┼─────────────┼─────────────────────────┤ │
│ │ Frontend    │ 12,847      │ None                    │ │
│ │ Mobile App  │ 8,923       │ Rate limited (2h ago)   │ │
│ │ Test Key    │ 234         │ Invalid model (5m ago)  │ │
│ └─────────────┴─────────────┴─────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## ✅ Próximos Passos

1. **Criar estrutura de arquivos** dashboard/
2. **Implementar sistema de API Keys** com segurança adequada
3. **Implementar rotas da API** com validação e rate limiting
4. **Desenvolver frontend** com CSRF e validação client-side
5. **Adicionar HTTPS** e configurações de segurança
6. **Implementar rate limiting** e sistema de permissões
7. **Testar segurança** (penetration testing básico)
8. **Deploy em VPS** com HTTPS e firewall configurado
9. **Documentar** processo completo de deploy seguro

---

## 📝 Evolução das Discussões

### ✅ Decisões Tomadas
- **Arquitetura:** Dashboard integrado ao proxy
- **Método de auth:** OAuth link direto (não QR Code)
- **Frontend:** Vanilla JS (simplicidade)
- **Objetivo:** Configuração 100% via web para VPS

### 🔄 Em Discussão
- Detalhes de implementação das rotas
- Layout específico das interfaces
- Tratamento de erros e edge cases

### ✅ Adicionado: Sistema de Autenticação
- **Tela de login obrigatória** antes de acessar dashboard
- **Credenciais via .env**: `DASHBOARD_USER` e `DASHBOARD_PASSWORD`
- **Sessão persistente** com cookies/JWT
- **Middleware de autenticação** protegendo rotas do dashboard

### ✅ Adicionado: Sistema de API Keys
- **Geração de chaves** no padrão OpenAI (sk-proj-xxxx)
- **Validação obrigatória** em todas as requisições /v1/*
- **Dashboard de gerenciamento** para administrar chaves
- **Armazenamento seguro** com PBKDF2 (nunca texto plano)
- **Metadados completos**: nome, descrição, data criação, último uso, status
- **Compatibilidade total** com clientes OpenAI existentes
- **Rate limiting** por chave com sliding window
- **Sistema de permissões** granular

### ✅ Melhorias de Segurança Adicionadas
- **HTTPS obrigatório** em produção
- **CSRF protection** em todos os formulários
- **Session timeout** configurável
- **Rate limiting** no login e API
- **Logs de auditoria** estruturados
- **Health checks** para monitoramento
- **Docker security** best practices