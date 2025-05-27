/**
 * Tests for transport functionality
 */

import {
  TransportType,
  DEFAULT_TRANSPORT_CONFIG,
  loadTransportConfig,
  validateTransportConfig,
  createTransportConfig,
  TRANSPORT_ENV_VARS
} from '../transport/transport-config';
import type { TransportConfig } from '../transport/transport-config';
import { TransportFactory } from '../transport/transport-factory';

describe('Transport Configuration', () => {
  // Store original environment variables
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('loadTransportConfig', () => {
    it('should load default configuration when no env vars are set', () => {
      const config = loadTransportConfig();
      expect(config.type).toBe(TransportType.STDIO);
      expect(config.host).toBe(DEFAULT_TRANSPORT_CONFIG.host);
      expect(config.port).toBe(DEFAULT_TRANSPORT_CONFIG.port);
    });

    it('should load configuration from environment variables', () => {
      process.env[TRANSPORT_ENV_VARS.TYPE] = TransportType.HTTP;
      process.env[TRANSPORT_ENV_VARS.HOST] = 'example.com';
      process.env[TRANSPORT_ENV_VARS.PORT] = '8080';
      process.env[TRANSPORT_ENV_VARS.ENABLE_CORS] = 'false';
      process.env[TRANSPORT_ENV_VARS.API_KEY] = 'test-key';

      const config = loadTransportConfig();
      expect(config.type).toBe(TransportType.HTTP);
      expect(config.host).toBe('example.com');
      expect(config.port).toBe(8080);
      expect(config.enableCors).toBe(false);
      expect(config.apiKey).toBe('test-key');
    });

    it('should handle boolean environment variables correctly', () => {
      process.env[TRANSPORT_ENV_VARS.ENABLE_CORS] = 'true';
      process.env[TRANSPORT_ENV_VARS.ENABLE_LOGGING] = '1';
      process.env[TRANSPORT_ENV_VARS.ENABLE_SSL] = 'false';

      const config = loadTransportConfig();
      expect(config.enableCors).toBe(true);
      expect(config.enableLogging).toBe(true);
      expect(config.enableSsl).toBe(false);
    });

    it('should handle integer environment variables correctly', () => {
      process.env[TRANSPORT_ENV_VARS.PORT] = '9000';
      process.env[TRANSPORT_ENV_VARS.SESSION_TIMEOUT] = '60000';
      process.env[TRANSPORT_ENV_VARS.RATE_LIMIT_RPM] = '200';

      const config = loadTransportConfig();
      expect(config.port).toBe(9000);
      expect(config.sessionTimeout).toBe(60000);
      expect(config.rateLimitRpm).toBe(200);
    });
  });

  describe('validateTransportConfig', () => {
    it('should validate stdio transport configuration', () => {
      const config: TransportConfig = {
        type: TransportType.STDIO
      };

      const result = validateTransportConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate HTTP transport configuration', () => {
      const config: TransportConfig = {
        type: TransportType.HTTP,
        host: 'localhost',
        port: 3000
      };

      const result = validateTransportConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid transport type', () => {
      const config: TransportConfig = {
        type: 'invalid' as TransportType
      };

      const result = validateTransportConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid enum value'))).toBe(true);
    });

    it('should reject network transport without host', () => {
      const config: TransportConfig = {
        type: TransportType.HTTP,
        port: 3000
      };

      const result = validateTransportConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Host is required'))).toBe(true);
    });

    it('should reject network transport without valid port', () => {
      const config: TransportConfig = {
        type: TransportType.HTTP,
        host: 'localhost',
        port: 0
      };

      const result = validateTransportConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('port') || e.includes('minimum'))).toBe(true);
    });

    it('should reject SSL configuration without certificate paths', () => {
      const config: TransportConfig = {
        type: TransportType.HTTP,
        host: 'localhost',
        port: 3000,
        enableSsl: true
      };

      const result = validateTransportConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('SSL') || e.includes('certificate') || e.includes('key'))).toBe(true);
    });

    it('should validate SSL configuration with certificate paths', () => {
      const config: TransportConfig = {
        type: TransportType.HTTP,
        host: 'localhost',
        port: 3000,
        enableSsl: true,
        sslCertPath: '/path/to/cert.pem',
        sslKeyPath: '/path/to/key.pem'
      };

      const result = validateTransportConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('createTransportConfig', () => {
    it('should create stdio transport configuration', () => {
      const config = createTransportConfig(TransportType.STDIO);
      expect(config.type).toBe(TransportType.STDIO);
    });

    it('should create HTTP transport configuration with defaults', () => {
      const config = createTransportConfig(TransportType.HTTP);
      expect(config.type).toBe(TransportType.HTTP);
      expect(config.port).toBe(3000);
      expect(config.enableCors).toBe(true);
    });

    it('should create WebSocket transport configuration with defaults', () => {
      const config = createTransportConfig(TransportType.WEBSOCKET);
      expect(config.type).toBe(TransportType.WEBSOCKET);
      expect(config.port).toBe(3001);
      expect(config.enableCors).toBe(true);
    });

    it('should apply overrides to configuration', () => {
      const config = createTransportConfig(TransportType.HTTP, {
        host: 'example.com',
        port: 8080,
        apiKey: 'test-key'
      });

      expect(config.type).toBe(TransportType.HTTP);
      expect(config.host).toBe('example.com');
      expect(config.port).toBe(8080);
      expect(config.apiKey).toBe('test-key');
    });
  });
});

describe('TransportFactory', () => {
  let factory: TransportFactory;

  beforeEach(() => {
    factory = new TransportFactory();
  });

  describe('validateConfig', () => {
    it('should validate stdio transport', () => {
      const config: TransportConfig = {
        type: TransportType.STDIO
      };

      expect(factory.validateConfig(config)).toBe(true);
    });

    it('should validate HTTP transport with proper configuration', () => {
      const config: TransportConfig = {
        type: TransportType.HTTP,
        host: 'localhost',
        port: 3000
      };

      expect(factory.validateConfig(config)).toBe(true);
    });

    it('should reject HTTP transport without host', () => {
      const config: TransportConfig = {
        type: TransportType.HTTP,
        port: 3000
      };

      expect(factory.validateConfig(config)).toBe(false);
    });

    it('should reject invalid port numbers', () => {
      const config: TransportConfig = {
        type: TransportType.HTTP,
        host: 'localhost',
        port: 70000
      };

      expect(factory.validateConfig(config)).toBe(false);
    });
  });

  describe('getSupportedTypes', () => {
    it('should return supported transport types', () => {
      const types = factory.getSupportedTypes();
      expect(types).toContain(TransportType.STDIO);
      expect(types).toContain(TransportType.HTTP);
      expect(types).toContain(TransportType.SSE);
    });
  });

  describe('createTransport', () => {
    it('should create stdio transport', async () => {
      const config: TransportConfig = {
        type: TransportType.STDIO
      };

      const transport = await factory.createTransport(config);
      expect(transport).toBeDefined();
    });

    it('should throw error for unsupported transport type', async () => {
      const config: TransportConfig = {
        type: TransportType.WEBSOCKET,
        host: 'localhost',
        port: 3001
      };

      await expect(factory.createTransport(config)).rejects.toThrow('WebSocket transport not yet implemented');
    });
  });

  describe('transport management', () => {
    it('should track active transports', async () => {
      const config: TransportConfig = {
        type: TransportType.STDIO
      };

      await factory.createTransport(config);
      const statuses = factory.getTransportStatuses();
      expect(statuses).toHaveLength(1);
      expect(statuses[0].type).toBe(TransportType.STDIO);
    });

    it('should provide transport metrics', async () => {
      const config: TransportConfig = {
        type: TransportType.STDIO
      };

      await factory.createTransport(config);
      const metrics = factory.getTransportMetrics();
      expect(metrics.size).toBe(1);
    });
  });
});
