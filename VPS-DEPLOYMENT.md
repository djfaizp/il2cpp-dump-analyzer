# VPS Deployment Guide for IL2CPP Dump Analyzer MCP

This guide explains how to deploy the IL2CPP Dump Analyzer MCP server on a VPS (Virtual Private Server) for remote access.

## 🚀 Quick Start

### 1. Local Testing with HTTP Transport

First, test the HTTP transport locally:

```bash
# Set environment variables for HTTP transport
export MCP_TRANSPORT=http
export MCP_HOST=localhost
export MCP_PORT=3000
export MCP_ENABLE_CORS=true
export MCP_ENABLE_LOGGING=true

# Start the server with HTTP transport
npm run start:http
```

The server will be accessible at `http://localhost:3000`

### 2. Test with curl

```bash
# List available tools
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Search for code
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_code","arguments":{"query":"MonoBehaviour","top_k":5}}}'
```

## 🌐 Network Transport Configuration

### Environment Variables

The following environment variables control network transport:

```bash
# Transport type (stdio, http, sse, websocket)
MCP_TRANSPORT=http

# Network settings
MCP_HOST=0.0.0.0          # Use 0.0.0.0 for VPS to accept external connections
MCP_PORT=3000             # Server port

# Security settings
MCP_ENABLE_CORS=true      # Enable CORS for web clients
MCP_API_KEY=your_secret_key  # Optional API key for authentication

# Performance settings
MCP_SESSION_TIMEOUT=1800000    # 30 minutes
MCP_RATE_LIMIT_RPM=100         # 100 requests per minute
MCP_MAX_REQUEST_SIZE=10485760  # 10MB max request size

# Logging
MCP_ENABLE_LOGGING=true   # Enable request logging

# SSL/TLS (for HTTPS)
MCP_ENABLE_SSL=false      # Set to true for HTTPS
MCP_SSL_CERT_PATH=/path/to/cert.pem
MCP_SSL_KEY_PATH=/path/to/key.pem
```

### Configuration File

Create a `.env` file with your VPS configuration:

```bash
# VPS Configuration
NODE_ENV=production
MCP_TRANSPORT=http
MCP_HOST=0.0.0.0
MCP_PORT=3000
MCP_ENABLE_CORS=true
MCP_API_KEY=your_secure_api_key_here
MCP_ENABLE_LOGGING=true
MCP_RATE_LIMIT_RPM=200

# IL2CPP Configuration
DUMP_FILE_PATH=/app/data/dump.cs
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
SUPABASE_TABLE=il2cpp_documents
```

## 🔐 Security Features

### API Key Authentication

When `MCP_API_KEY` is set, all requests must include the API key:

```bash
# Using X-API-Key header
curl -X POST http://your-vps:3000 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secure_api_key_here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Using Authorization header
curl -X POST http://your-vps:3000 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_secure_api_key_here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Rate Limiting

The server automatically limits requests per client:
- Default: 100 requests per minute per IP
- Configurable via `MCP_RATE_LIMIT_RPM`
- Returns HTTP 429 when limit exceeded

### CORS Support

CORS is enabled by default for network transports:
- Allows all origins (`*`)
- Supports GET, POST, OPTIONS, DELETE methods
- Allows Content-Type, Authorization, X-API-Key headers

## 🖥️ VPS Deployment

### Manual Deployment

1. **Install Node.js 18+ on your VPS**
2. **Clone and setup the project:**

```bash
git clone https://github.com/your-repo/il2cpp-dump-analyzer-mcp.git
cd il2cpp-dump-analyzer-mcp
npm install
npm run build
```

3. **Configure environment:**

```bash
cp .env.example .env
# Edit .env with your VPS settings
```

4. **Start the server:**

```bash
# Using npm
npm run start:network

# Or directly with Node.js
node dist/network-server.js
```

### Using PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/network-server.js --name "il2cpp-mcp"

# Save PM2 configuration
pm2 save
pm2 startup
```

### Systemd Service (Linux)

Create `/etc/systemd/system/il2cpp-mcp.service`:

```ini
[Unit]
Description=IL2CPP MCP Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/il2cpp-dump-analyzer-mcp
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/network-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable il2cpp-mcp
sudo systemctl start il2cpp-mcp
sudo systemctl status il2cpp-mcp
```

## 🔌 MCP Client Configuration

### Claude Desktop

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "il2cpp-analyzer-remote": {
      "url": "http://your-vps-ip:3000",
      "description": "Remote IL2CPP Dump Analyzer",
      "headers": {
        "X-API-Key": "your_secure_api_key_here"
      }
    }
  }
}
```

### Custom MCP Client

```javascript
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { HttpClientTransport } = require('@modelcontextprotocol/sdk/client/http.js');

const client = new Client({
  name: 'il2cpp-client',
  version: '1.0.0'
}, { capabilities: {} });

const transport = new HttpClientTransport({
  url: 'http://your-vps-ip:3000',
  headers: {
    'X-API-Key': 'your_secure_api_key_here'
  }
});

await client.connect(transport);
const tools = await client.listTools();
```

## 📊 Monitoring

### Health Check

```bash
curl http://your-vps:3000/health
```

### Metrics

The server provides metrics for monitoring:
- Total requests processed
- Active connections
- Requests per minute
- Average response time
- Error count

## 🔧 Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check if server is running: `ps aux | grep node`
   - Verify port is open: `netstat -tlnp | grep 3000`
   - Check firewall settings

2. **Authentication Failed**
   - Verify API key is correct
   - Check header format: `X-API-Key` or `Authorization: Bearer`

3. **Rate Limited**
   - Reduce request frequency
   - Increase `MCP_RATE_LIMIT_RPM` if needed

4. **CORS Errors**
   - Ensure `MCP_ENABLE_CORS=true`
   - Check browser console for specific CORS errors

### Logs

Enable logging for debugging:

```bash
export MCP_ENABLE_LOGGING=true
npm run start:network
```

## 🚀 Next Steps

This completes Sub-Task 1: Network Transport Implementation. The next sub-tasks will add:

- **Sub-Task 2**: Enhanced authentication and security
- **Sub-Task 3**: VPS installation packages and scripts
- **Sub-Task 4**: Docker-based VPS deployment
- **Sub-Task 5**: Remote MCP client configuration tools
- **Sub-Task 6**: Comprehensive documentation and examples
