/**
 * Transport types and interfaces for IL2CPP MCP Server
 * Supports stdio, HTTP, and WebSocket transports for local and remote access
 */

import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * Available transport types
 */
export enum TransportType {
  STDIO = 'stdio',
  HTTP = 'http',
  WEBSOCKET = 'websocket',
  SSE = 'sse'
}

/**
 * Transport configuration interface
 */
export interface TransportConfig {
  /** Transport type to use */
  type: TransportType;
  
  /** Host for network transports (default: 'localhost') */
  host?: string;
  
  /** Port for network transports (default: 3000) */
  port?: number;
  
  /** Enable CORS for network transports (default: true) */
  enableCors?: boolean;
  
  /** API key for authentication (optional) */
  apiKey?: string;
  
  /** Session timeout in milliseconds (default: 30 minutes) */
  sessionTimeout?: number;
  
  /** Enable request logging (default: false) */
  enableLogging?: boolean;
  
  /** Maximum request size in bytes (default: 10MB) */
  maxRequestSize?: number;
  
  /** Rate limiting: requests per minute (default: 100) */
  rateLimitRpm?: number;
  
  /** Enable SSL/TLS for HTTPS (default: false) */
  enableSsl?: boolean;
  
  /** SSL certificate path (required if enableSsl is true) */
  sslCertPath?: string;
  
  /** SSL private key path (required if enableSsl is true) */
  sslKeyPath?: string;
}

/**
 * Default transport configuration
 */
export const DEFAULT_TRANSPORT_CONFIG: Required<TransportConfig> = {
  type: TransportType.STDIO,
  host: 'localhost',
  port: 3000,
  enableCors: true,
  apiKey: '',
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  enableLogging: false,
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  rateLimitRpm: 100,
  enableSsl: false,
  sslCertPath: '',
  sslKeyPath: ''
};

/**
 * Transport factory interface
 */
export interface ITransportFactory {
  /**
   * Create a transport instance based on configuration
   */
  createTransport(config: TransportConfig): Promise<Transport>;
  
  /**
   * Validate transport configuration
   */
  validateConfig(config: TransportConfig): boolean;
  
  /**
   * Get supported transport types
   */
  getSupportedTypes(): TransportType[];
}

/**
 * Network transport options for HTTP/WebSocket
 */
export interface NetworkTransportOptions {
  /** Server host */
  host: string;
  
  /** Server port */
  port: number;
  
  /** Enable CORS */
  enableCors: boolean;
  
  /** API key for authentication */
  apiKey?: string;
  
  /** Session timeout */
  sessionTimeout: number;
  
  /** Enable request logging */
  enableLogging: boolean;
  
  /** Maximum request size */
  maxRequestSize: number;
  
  /** Rate limiting */
  rateLimitRpm: number;
  
  /** SSL configuration */
  ssl?: {
    enabled: boolean;
    certPath: string;
    keyPath: string;
  };
}

/**
 * Transport status information
 */
export interface TransportStatus {
  /** Transport type */
  type: TransportType;
  
  /** Is transport active */
  active: boolean;
  
  /** Connection count (for network transports) */
  connections?: number;
  
  /** Server address (for network transports) */
  address?: string;
  
  /** Last activity timestamp */
  lastActivity?: Date;
  
  /** Error information if transport failed */
  error?: string;
}

/**
 * Transport metrics for monitoring
 */
export interface TransportMetrics {
  /** Total requests processed */
  totalRequests: number;
  
  /** Active connections */
  activeConnections: number;
  
  /** Requests per minute */
  requestsPerMinute: number;
  
  /** Average response time in milliseconds */
  averageResponseTime: number;
  
  /** Error count */
  errorCount: number;
  
  /** Last error timestamp */
  lastError?: Date;
  
  /** Bytes sent */
  bytesSent: number;
  
  /** Bytes received */
  bytesReceived: number;
}

/**
 * Authentication information for network requests
 */
export interface AuthInfo {
  /** API key */
  apiKey?: string;
  
  /** Client IP address */
  clientIp?: string;
  
  /** User agent */
  userAgent?: string;
  
  /** Session ID */
  sessionId?: string;
  
  /** Request timestamp */
  timestamp: Date;
}

/**
 * Rate limiting information
 */
export interface RateLimitInfo {
  /** Requests remaining in current window */
  remaining: number;
  
  /** Total requests allowed per window */
  limit: number;
  
  /** Window reset time */
  resetTime: Date;
  
  /** Current window start time */
  windowStart: Date;
}

/**
 * Transport event types
 */
export enum TransportEvent {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_SENT = 'message_sent',
  ERROR = 'error',
  RATE_LIMITED = 'rate_limited',
  AUTH_FAILED = 'auth_failed'
}

/**
 * Transport event data
 */
export interface TransportEventData {
  /** Event type */
  type: TransportEvent;
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Transport type */
  transportType: TransportType;
  
  /** Client information */
  client?: {
    id: string;
    ip?: string;
    userAgent?: string;
  };
  
  /** Error information */
  error?: Error;
  
  /** Additional event data */
  data?: any;
}
