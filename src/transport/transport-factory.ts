/**
 * Transport Factory for IL2CPP MCP Server
 * Creates and manages different transport types (stdio, HTTP, WebSocket, SSE)
 */

import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  TransportType,
  TransportConfig,
  ITransportFactory,
  NetworkTransportOptions,
  TransportStatus,
  TransportMetrics
} from './transport-types';
import { HttpTransport } from './http-transport';

/**
 * Transport factory implementation
 */
export class TransportFactory implements ITransportFactory {
  private activeTransports: Map<string, { transport: Transport | HttpTransport; config: TransportConfig }> = new Map();

  /**
   * Create a transport instance based on configuration
   */
  async createTransport(config: TransportConfig): Promise<Transport> {
    const transportId = this.generateTransportId(config);

    // Check if transport already exists
    if (this.activeTransports.has(transportId)) {
      const existing = this.activeTransports.get(transportId)!;
      if (existing.transport instanceof HttpTransport) {
        return existing.transport.getTransport()!;
      }
      return existing.transport as Transport;
    }

    let transport: Transport | HttpTransport;

    switch (config.type) {
      case TransportType.STDIO:
        transport = await this.createStdioTransport(config);
        break;

      case TransportType.HTTP:
        transport = await this.createHttpTransport(config);
        break;

      case TransportType.SSE:
        transport = await this.createSseTransport(config);
        break;

      case TransportType.WEBSOCKET:
        throw new Error('WebSocket transport not yet implemented');

      default:
        throw new Error(`Unsupported transport type: ${config.type}`);
    }

    // Store the transport
    this.activeTransports.set(transportId, { transport, config });

    // Return the MCP transport interface
    if (transport instanceof HttpTransport) {
      return transport.getTransport()!;
    }
    return transport;
  }

  /**
   * Create stdio transport
   */
  private async createStdioTransport(config: TransportConfig): Promise<StdioServerTransport> {
    console.log('📡 Creating stdio transport...');
    return new StdioServerTransport();
  }

  /**
   * Create HTTP transport
   */
  private async createHttpTransport(config: TransportConfig): Promise<HttpTransport> {
    console.log(`🌐 Creating HTTP transport on ${config.host}:${config.port}...`);

    const options: NetworkTransportOptions = {
      host: config.host || 'localhost',
      port: config.port || 3000,
      enableCors: config.enableCors ?? true,
      apiKey: config.apiKey,
      sessionTimeout: config.sessionTimeout || 30 * 60 * 1000,
      enableLogging: config.enableLogging ?? false,
      maxRequestSize: config.maxRequestSize || 10 * 1024 * 1024,
      rateLimitRpm: config.rateLimitRpm || 100,
      ssl: config.enableSsl ? {
        enabled: true,
        certPath: config.sslCertPath!,
        keyPath: config.sslKeyPath!
      } : undefined
    };

    const httpTransport = new HttpTransport(options);
    await httpTransport.start();

    return httpTransport;
  }

  /**
   * Create SSE transport
   */
  private async createSseTransport(config: TransportConfig): Promise<HttpTransport> {
    console.log(`📡 Creating SSE transport on ${config.host}:${config.port}...`);

    // SSE transport is implemented as part of the HTTP transport
    // The StreamableHTTPServerTransport in the MCP SDK handles SSE automatically
    const options: NetworkTransportOptions = {
      host: config.host || 'localhost',
      port: config.port || 3000,
      enableCors: config.enableCors ?? true,
      apiKey: config.apiKey,
      sessionTimeout: config.sessionTimeout || 30 * 60 * 1000,
      enableLogging: config.enableLogging ?? false,
      maxRequestSize: config.maxRequestSize || 10 * 1024 * 1024,
      rateLimitRpm: config.rateLimitRpm || 100,
      ssl: config.enableSsl ? {
        enabled: true,
        certPath: config.sslCertPath!,
        keyPath: config.sslKeyPath!
      } : undefined
    };

    const httpTransport = new HttpTransport(options);
    await httpTransport.start();

    console.log('📡 SSE transport ready (via HTTP transport with SSE streaming)');
    return httpTransport;
  }

  /**
   * Validate transport configuration
   */
  validateConfig(config: TransportConfig): boolean {
    try {
      switch (config.type) {
        case TransportType.STDIO:
          // No additional validation needed for stdio
          return true;

        case TransportType.HTTP:
        case TransportType.SSE:
        case TransportType.WEBSOCKET:
          // Network transports require host and port
          if (!config.host || !config.port) {
            console.error('Network transports require host and port configuration');
            return false;
          }

          if (config.port < 1 || config.port > 65535) {
            console.error('Port must be between 1 and 65535');
            return false;
          }

          // SSL validation
          if (config.enableSsl) {
            if (!config.sslCertPath || !config.sslKeyPath) {
              console.error('SSL certificate and key paths are required when SSL is enabled');
              return false;
            }
          }

          return true;

        default:
          console.error(`Unsupported transport type: ${config.type}`);
          return false;
      }
    } catch (error) {
      console.error('Transport configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Get supported transport types
   */
  getSupportedTypes(): TransportType[] {
    return [
      TransportType.STDIO,
      TransportType.HTTP,
      TransportType.SSE
      // TransportType.WEBSOCKET - Not yet implemented
    ];
  }

  /**
   * Get status of all active transports
   */
  getTransportStatuses(): TransportStatus[] {
    const statuses: TransportStatus[] = [];

    for (const [transportId, { transport, config }] of this.activeTransports) {
      const status: TransportStatus = {
        type: config.type,
        active: true, // Assume active if in the map
        lastActivity: new Date()
      };

      if (transport instanceof HttpTransport) {
        const metrics = transport.getMetrics();
        status.connections = metrics.activeConnections;
        status.address = `${config.enableSsl ? 'https' : 'http'}://${config.host}:${config.port}`;
      }

      statuses.push(status);
    }

    return statuses;
  }

  /**
   * Get metrics for all active transports
   */
  getTransportMetrics(): Map<string, TransportMetrics> {
    const metrics = new Map<string, TransportMetrics>();

    for (const [transportId, { transport, config }] of this.activeTransports) {
      if (transport instanceof HttpTransport) {
        metrics.set(transportId, transport.getMetrics());
      } else {
        // Default metrics for other transport types
        metrics.set(transportId, {
          totalRequests: 0,
          activeConnections: 1,
          requestsPerMinute: 0,
          averageResponseTime: 0,
          errorCount: 0,
          bytesSent: 0,
          bytesReceived: 0
        });
      }
    }

    return metrics;
  }

  /**
   * Stop a specific transport
   */
  async stopTransport(transportId: string): Promise<void> {
    const transportInfo = this.activeTransports.get(transportId);
    if (!transportInfo) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const { transport } = transportInfo;

    if (transport instanceof HttpTransport) {
      await transport.stop();
    } else if ('close' in transport) {
      await transport.close();
    }

    this.activeTransports.delete(transportId);
    console.log(`🔌 Transport stopped: ${transportId}`);
  }

  /**
   * Stop all active transports
   */
  async stopAllTransports(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const transportId of this.activeTransports.keys()) {
      stopPromises.push(this.stopTransport(transportId));
    }

    await Promise.all(stopPromises);
    console.log('🔌 All transports stopped');
  }

  /**
   * Generate a unique transport ID
   */
  private generateTransportId(config: TransportConfig): string {
    switch (config.type) {
      case TransportType.STDIO:
        return 'stdio';

      case TransportType.HTTP:
      case TransportType.SSE:
      case TransportType.WEBSOCKET:
        return `${config.type}-${config.host}-${config.port}`;

      default:
        return `${config.type}-${Date.now()}`;
    }
  }

  /**
   * Get transport by ID
   */
  getTransport(transportId: string): Transport | HttpTransport | null {
    const transportInfo = this.activeTransports.get(transportId);
    return transportInfo ? transportInfo.transport : null;
  }

  /**
   * Check if a transport is active
   */
  isTransportActive(transportId: string): boolean {
    return this.activeTransports.has(transportId);
  }

  /**
   * Get transport configuration
   */
  getTransportConfig(transportId: string): TransportConfig | null {
    const transportInfo = this.activeTransports.get(transportId);
    return transportInfo ? transportInfo.config : null;
  }
}

/**
 * Global transport factory instance
 */
export const transportFactory = new TransportFactory();

/**
 * Helper function to create and validate transport
 */
export async function createValidatedTransport(config: TransportConfig): Promise<Transport> {
  if (!transportFactory.validateConfig(config)) {
    throw new Error('Invalid transport configuration');
  }

  return await transportFactory.createTransport(config);
}
