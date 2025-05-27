/**
 * HTTP Transport implementation for IL2CPP MCP Server
 * Provides HTTP-based MCP communication for remote access
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { NetworkTransportOptions, TransportMetrics, AuthInfo, RateLimitInfo } from './transport-types';

/**
 * Rate limiter for request throttling
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs = 60 * 1000; // 1 minute window

  constructor(private readonly requestsPerMinute: number) {}

  /**
   * Check if request is allowed for the given client
   */
  isAllowed(clientId: string): { allowed: boolean; info: RateLimitInfo } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing requests for this client
    const clientRequests = this.requests.get(clientId) || [];

    // Remove old requests outside the window
    const validRequests = clientRequests.filter(timestamp => timestamp > windowStart);

    // Check if limit exceeded
    const allowed = validRequests.length < this.requestsPerMinute;

    if (allowed) {
      // Add current request
      validRequests.push(now);
      this.requests.set(clientId, validRequests);
    }

    return {
      allowed,
      info: {
        remaining: Math.max(0, this.requestsPerMinute - validRequests.length),
        limit: this.requestsPerMinute,
        resetTime: new Date(now + this.windowMs),
        windowStart: new Date(windowStart)
      }
    };
  }

  /**
   * Clean up old entries
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [clientId, requests] of this.requests.entries()) {
      const validRequests = requests.filter(timestamp => timestamp > windowStart);
      if (validRequests.length === 0) {
        this.requests.delete(clientId);
      } else {
        this.requests.set(clientId, validRequests);
      }
    }
  }
}

/**
 * HTTP Transport for MCP Server
 */
export class HttpTransport {
  private server: Server | null = null;
  private transport: StreamableHTTPServerTransport | null = null;
  private rateLimiter: RateLimiter;
  private metrics: TransportMetrics;
  private startTime: Date;

  constructor(private readonly options: NetworkTransportOptions) {
    this.rateLimiter = new RateLimiter(options.rateLimitRpm);
    this.startTime = new Date();
    this.metrics = {
      totalRequests: 0,
      activeConnections: 0,
      requestsPerMinute: 0,
      averageResponseTime: 0,
      errorCount: 0,
      bytesSent: 0,
      bytesReceived: 0
    };

    // Start cleanup interval for rate limiter
    setInterval(() => this.rateLimiter.cleanup(), 60000); // Clean up every minute
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    try {
      // Create MCP transport
      this.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: false, // Use SSE streaming
        onsessioninitialized: (sessionId) => {
          if (this.options.enableLogging) {
            console.log(`New MCP session initialized: ${sessionId}`);
          }
        }
      });

      // Create HTTP/HTTPS server
      if (this.options.ssl?.enabled) {
        const cert = readFileSync(this.options.ssl.certPath);
        const key = readFileSync(this.options.ssl.keyPath);
        this.server = createHttpsServer({ cert, key }, this.handleRequest.bind(this));
      } else {
        this.server = createServer(this.handleRequest.bind(this));
      }

      // Note: Do not start the transport here - the MCP server will handle this
      // when server.connect(transport) is called to avoid "Transport already started" error

      // Start the server
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.options.port, this.options.host, () => {
          const protocol = this.options.ssl?.enabled ? 'https' : 'http';
          console.log(`🌐 HTTP MCP Server listening on ${protocol}://${this.options.host}:${this.options.port}`);
          resolve();
        });

        this.server!.on('error', reject);
      });

      // Set up connection tracking
      this.server.on('connection', () => {
        this.metrics.activeConnections++;
      });

      this.server.on('close', () => {
        this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
      });

    } catch (error) {
      throw new Error(`Failed to start HTTP transport: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();

    try {
      // Update metrics
      this.metrics.totalRequests++;

      // Get client information
      const clientIp = req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      const clientId = `${clientIp}:${userAgent}`;

      // Log request if enabled
      if (this.options.enableLogging) {
        console.log(`${new Date().toISOString()} ${req.method} ${req.url} - ${clientIp}`);
      }

      // Set CORS headers if enabled
      if (this.options.enableCors) {
        this.setCorsHeaders(res);
      }

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Rate limiting
      const rateLimitResult = this.rateLimiter.isAllowed(clientId);
      if (!rateLimitResult.allowed) {
        res.setHeader('X-RateLimit-Limit', rateLimitResult.info.limit);
        res.setHeader('X-RateLimit-Remaining', rateLimitResult.info.remaining);
        res.setHeader('X-RateLimit-Reset', rateLimitResult.info.resetTime.toISOString());
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
        return;
      }

      // Authentication if API key is configured
      if (this.options.apiKey) {
        const authResult = this.authenticateRequest(req);
        if (!authResult.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Authentication failed' }));
          return;
        }

        // Add auth info to request
        (req as any).auth = authResult.authInfo;
      }

      // Check request size
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      if (contentLength > this.options.maxRequestSize) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request too large' }));
        return;
      }

      // Parse request body for POST requests
      let parsedBody: any = undefined;
      if (req.method === 'POST') {
        parsedBody = await this.parseRequestBody(req);
        this.metrics.bytesReceived += contentLength;
      }

      // Handle the request with MCP transport
      if (this.transport) {
        await this.transport.handleRequest(req as any, res, parsedBody);
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Transport not initialized' }));
      }

    } catch (error) {
      this.metrics.errorCount++;
      this.metrics.lastError = new Date();

      console.error('HTTP request error:', error);

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    } finally {
      // Update response time metrics
      const responseTime = Date.now() - startTime;
      this.metrics.averageResponseTime =
        (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime) / this.metrics.totalRequests;
    }
  }

  /**
   * Set CORS headers
   */
  private setCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }

  /**
   * Authenticate request using API key
   */
  private authenticateRequest(req: IncomingMessage): { valid: boolean; authInfo?: AuthInfo } {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey || apiKey !== this.options.apiKey) {
      return { valid: false };
    }

    return {
      valid: true,
      authInfo: {
        apiKey: apiKey as string,
        clientIp: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        timestamp: new Date()
      }
    };
  }

  /**
   * Parse request body
   */
  private async parseRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve(parsed);
        } catch (error) {
          reject(new Error('Invalid JSON in request body'));
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * Get transport metrics
   */
  getMetrics(): TransportMetrics {
    // Calculate requests per minute
    const uptimeMinutes = (Date.now() - this.startTime.getTime()) / (1000 * 60);
    this.metrics.requestsPerMinute = uptimeMinutes > 0 ? this.metrics.totalRequests / uptimeMinutes : 0;

    return { ...this.metrics };
  }

  /**
   * Get MCP transport instance
   */
  getTransport(): StreamableHTTPServerTransport | null {
    return this.transport;
  }
}
