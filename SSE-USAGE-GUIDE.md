# 🌊 Server-Sent Events (SSE) Usage Guide

This guide explains how to use Server-Sent Events (SSE) transport with the IL2CPP Dump Analyzer MCP server for real-time communication.

## 🎯 **What is SSE Transport?**

SSE (Server-Sent Events) provides **real-time, persistent connections** between the MCP server and clients:

- **Real-time streaming**: Server pushes messages to clients instantly
- **Persistent connection**: Single connection for ongoing communication  
- **Automatic reconnection**: Built-in reconnection if connection drops
- **Web-friendly**: Works in browsers without WebSocket complexity
- **HTTP-based**: Uses standard HTTP, works through firewalls/proxies

## 🔧 **How SSE Works with MCP**

The MCP SSE implementation uses a **hybrid approach**:

1. **GET request** → Establishes SSE stream (server → client messages)
2. **POST requests** → Send messages (client → server messages)  
3. **Session management** → Links GET and POST requests together

```
Client                    MCP Server
  |                           |
  |--- GET / (SSE stream) --->|  (1) Establish SSE connection
  |<-- SSE: session_id -------|  (2) Server sends session ID
  |                           |
  |--- POST / (initialize) -->|  (3) Send MCP initialize
  |<-- SSE: init_response ----|  (4) Response via SSE stream
  |                           |
  |--- POST / (tools/list) -->|  (5) Call MCP tools
  |<-- SSE: tools_response ---|  (6) Response via SSE stream
  |                           |
  |<-- SSE: notifications ----|  (7) Real-time notifications
```

## 🚀 **Starting SSE Transport**

### 1. **Environment Configuration**

```bash
# Set SSE transport
export MCP_TRANSPORT=sse
export MCP_HOST=localhost
export MCP_PORT=3000
export MCP_ENABLE_CORS=true
export MCP_ENABLE_LOGGING=true

# Optional authentication
export MCP_API_KEY=your_secure_api_key
```

### 2. **Start the Server**

```bash
# Using npm script
npm run start:network

# Or directly
node dist/network-server.js

# Or with custom settings
MCP_TRANSPORT=sse MCP_PORT=8080 npm run start:network
```

### 3. **Verify SSE Endpoint**

```bash
# Test SSE stream (should stay connected)
curl -N -H "Accept: text/event-stream" http://localhost:3000

# You should see SSE events like:
# data: {"jsonrpc":"2.0","id":null,"method":"session/created","params":{"sessionId":"abc123"}}
```

## 💻 **Client Implementation**

### **Node.js Client Example**

```bash
# Install dependencies
npm install eventsource node-fetch

# Run the example
node examples/sse-client-example.js
```

Key features of the Node.js client:
- Automatic session management
- Promise-based API for MCP calls
- Error handling and reconnection
- Real-time message handling

### **Web Browser Client**

Open `examples/sse-web-client.html` in your browser:

```bash
# Serve the HTML file (optional)
python -m http.server 8080
# Then open: http://localhost:8080/examples/sse-web-client.html
```

Features of the web client:
- Real-time connection status
- Interactive tool testing
- Live results display
- Connection logging

### **Custom Client Implementation**

```javascript
// Basic SSE MCP client pattern
class SSEMCPClient {
  constructor(url, apiKey) {
    this.url = url;
    this.apiKey = apiKey;
    this.eventSource = null;
    this.sessionId = null;
    this.pendingRequests = new Map();
  }

  async connect() {
    // 1. Establish SSE stream
    const headers = { 'Accept': 'text/event-stream' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;
    
    this.eventSource = new EventSource(this.url, { headers });
    
    // 2. Handle incoming messages
    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };
    
    // 3. Send initialization
    await this.sendMessage('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'SSE Client', version: '1.0.0' }
    });
  }

  async sendMessage(method, params) {
    // Send via POST, response comes via SSE
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Session-ID': this.sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });
    
    // Response will arrive via SSE stream
  }
}
```

## 🔐 **Authentication with SSE**

### **API Key Authentication**

```javascript
// Include API key in SSE connection
const eventSource = new EventSource('http://localhost:3000', {
  headers: {
    'X-API-Key': 'your_api_key_here'
  }
});

// Include API key in POST requests
fetch('http://localhost:3000', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_api_key_here',
    'X-Session-ID': sessionId
  },
  body: JSON.stringify(message)
});
```

### **Session Management**

```javascript
// 1. Server sends session ID via SSE
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.result && data.result.sessionId) {
    sessionId = data.result.sessionId;
  }
};

// 2. Include session ID in subsequent requests
headers['X-Session-ID'] = sessionId;
```

## 🌐 **CORS Configuration**

For web clients, ensure CORS is properly configured:

```bash
# Enable CORS (default: true)
export MCP_ENABLE_CORS=true
```

The server automatically sets these CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key
```

## 🔍 **Testing SSE Transport**

### **1. Manual Testing with curl**

```bash
# Test SSE stream
curl -N -H "Accept: text/event-stream" \
     -H "X-API-Key: your_key" \
     http://localhost:3000

# Send MCP message
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_key" \
  -H "X-Session-ID: session_id_from_sse" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### **2. Browser Developer Tools**

1. Open browser developer tools (F12)
2. Go to Network tab
3. Open `examples/sse-web-client.html`
4. Connect to server
5. Watch SSE events in Network tab (EventStream type)

### **3. Node.js Testing**

```bash
# Run the example client
node examples/sse-client-example.js

# Expected output:
# 🔌 Connecting to MCP server via SSE...
# ✅ SSE connection established
# 🔑 Session ID: abc123-def456
# 📋 Listing available tools...
# Available tools: ['search_code', 'find_class_hierarchy', ...]
```

## 🚨 **Troubleshooting**

### **Common Issues**

1. **Connection Refused**
   ```bash
   # Check if server is running
   curl http://localhost:3000
   ```

2. **CORS Errors in Browser**
   ```bash
   # Ensure CORS is enabled
   export MCP_ENABLE_CORS=true
   ```

3. **Authentication Failures**
   ```bash
   # Verify API key
   curl -H "X-API-Key: wrong_key" http://localhost:3000
   # Should return 401 Unauthorized
   ```

4. **SSE Connection Drops**
   ```javascript
   // Handle reconnection
   eventSource.onerror = () => {
     setTimeout(() => {
       eventSource = new EventSource(url);
     }, 5000);
   };
   ```

### **Debug Logging**

Enable detailed logging:

```bash
export MCP_ENABLE_LOGGING=true
npm run start:network
```

## 🎯 **When to Use SSE vs HTTP**

**Use SSE when:**
- ✅ Need real-time updates
- ✅ Long-running analysis tasks
- ✅ Multiple concurrent requests
- ✅ Web browser clients
- ✅ Want persistent connections

**Use HTTP when:**
- ✅ Simple request/response
- ✅ Batch processing
- ✅ One-off queries
- ✅ Mobile/low-bandwidth clients
- ✅ Stateless interactions

## 🔗 **Integration Examples**

### **Claude Desktop with SSE**

```json
{
  "mcpServers": {
    "il2cpp-analyzer-sse": {
      "url": "http://your-server:3000",
      "transport": "sse",
      "headers": {
        "X-API-Key": "your_api_key"
      }
    }
  }
}
```

### **Custom Dashboard**

Use the web client as a starting point for building custom dashboards with real-time IL2CPP analysis capabilities.

---

SSE transport provides the best of both worlds: the simplicity of HTTP with the real-time capabilities of WebSockets, making it perfect for interactive IL2CPP analysis applications! 🚀
