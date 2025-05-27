/**
 * Transport configuration management for IL2CPP MCP Server
 * Handles environment variables and validation for different transport types
 */

import { z } from 'zod';
import { TransportType, TransportConfig, DEFAULT_TRANSPORT_CONFIG } from './transport-types';

// Re-export TransportType and DEFAULT_TRANSPORT_CONFIG for convenience
export { TransportType, DEFAULT_TRANSPORT_CONFIG } from './transport-types';

/**
 * Zod schema for transport configuration validation
 */
const TransportConfigSchema = z.object({
  type: z.nativeEnum(TransportType),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  enableCors: z.boolean().optional(),
  apiKey: z.string().optional(),
  sessionTimeout: z.number().int().min(1000).optional(), // Minimum 1 second
  enableLogging: z.boolean().optional(),
  maxRequestSize: z.number().int().min(1024).optional(), // Minimum 1KB
  rateLimitRpm: z.number().int().min(1).optional(),
  enableSsl: z.boolean().optional(),
  sslCertPath: z.string().optional(),
  sslKeyPath: z.string().optional()
}).refine((config) => {
  // SSL validation: if SSL is enabled, cert and key paths are required
  if (config.enableSsl) {
    return config.sslCertPath && config.sslKeyPath;
  }
  return true;
}, {
  message: "SSL certificate and key paths are required when SSL is enabled"
});

/**
 * Environment variable names for transport configuration
 */
export const TRANSPORT_ENV_VARS = {
  TYPE: 'MCP_TRANSPORT',
  HOST: 'MCP_HOST',
  PORT: 'MCP_PORT',
  ENABLE_CORS: 'MCP_ENABLE_CORS',
  API_KEY: 'MCP_API_KEY',
  SESSION_TIMEOUT: 'MCP_SESSION_TIMEOUT',
  ENABLE_LOGGING: 'MCP_ENABLE_LOGGING',
  MAX_REQUEST_SIZE: 'MCP_MAX_REQUEST_SIZE',
  RATE_LIMIT_RPM: 'MCP_RATE_LIMIT_RPM',
  ENABLE_SSL: 'MCP_ENABLE_SSL',
  SSL_CERT_PATH: 'MCP_SSL_CERT_PATH',
  SSL_KEY_PATH: 'MCP_SSL_KEY_PATH'
} as const;

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse integer from environment variable
 */
function parseInteger(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Load transport configuration from environment variables
 */
export function loadTransportConfig(): TransportConfig {
  const config: TransportConfig = {
    type: (process.env[TRANSPORT_ENV_VARS.TYPE] as TransportType) || DEFAULT_TRANSPORT_CONFIG.type,
    host: process.env[TRANSPORT_ENV_VARS.HOST] || DEFAULT_TRANSPORT_CONFIG.host,
    port: parseInteger(process.env[TRANSPORT_ENV_VARS.PORT], DEFAULT_TRANSPORT_CONFIG.port),
    enableCors: parseBoolean(process.env[TRANSPORT_ENV_VARS.ENABLE_CORS], DEFAULT_TRANSPORT_CONFIG.enableCors),
    apiKey: process.env[TRANSPORT_ENV_VARS.API_KEY] || DEFAULT_TRANSPORT_CONFIG.apiKey,
    sessionTimeout: parseInteger(process.env[TRANSPORT_ENV_VARS.SESSION_TIMEOUT], DEFAULT_TRANSPORT_CONFIG.sessionTimeout),
    enableLogging: parseBoolean(process.env[TRANSPORT_ENV_VARS.ENABLE_LOGGING], DEFAULT_TRANSPORT_CONFIG.enableLogging),
    maxRequestSize: parseInteger(process.env[TRANSPORT_ENV_VARS.MAX_REQUEST_SIZE], DEFAULT_TRANSPORT_CONFIG.maxRequestSize),
    rateLimitRpm: parseInteger(process.env[TRANSPORT_ENV_VARS.RATE_LIMIT_RPM], DEFAULT_TRANSPORT_CONFIG.rateLimitRpm),
    enableSsl: parseBoolean(process.env[TRANSPORT_ENV_VARS.ENABLE_SSL], DEFAULT_TRANSPORT_CONFIG.enableSsl),
    sslCertPath: process.env[TRANSPORT_ENV_VARS.SSL_CERT_PATH] || DEFAULT_TRANSPORT_CONFIG.sslCertPath,
    sslKeyPath: process.env[TRANSPORT_ENV_VARS.SSL_KEY_PATH] || DEFAULT_TRANSPORT_CONFIG.sslKeyPath
  };

  return config;
}

/**
 * Validate transport configuration
 */
export function validateTransportConfig(config: TransportConfig): { valid: boolean; errors: string[] } {
  try {
    TransportConfigSchema.parse(config);

    // Additional validation
    const errors: string[] = [];

    // Validate transport type
    if (!Object.values(TransportType).includes(config.type)) {
      errors.push(`Invalid transport type: ${config.type}. Supported types: ${Object.values(TransportType).join(', ')}`);
    }

    // Validate network transport requirements
    if (config.type !== TransportType.STDIO) {
      if (!config.host) {
        errors.push('Host is required for network transports');
      }
      if (!config.port || config.port < 1 || config.port > 65535) {
        errors.push('Valid port (1-65535) is required for network transports');
      }
    }

    // Validate SSL configuration
    if (config.enableSsl) {
      if (!config.sslCertPath) {
        errors.push('SSL certificate path is required when SSL is enabled');
      }
      if (!config.sslKeyPath) {
        errors.push('SSL private key path is required when SSL is enabled');
      }
    }

    // Validate rate limiting
    if (config.rateLimitRpm && config.rateLimitRpm < 1) {
      errors.push('Rate limit must be at least 1 request per minute');
    }

    // Validate session timeout
    if (config.sessionTimeout && config.sessionTimeout < 1000) {
      errors.push('Session timeout must be at least 1000ms (1 second)');
    }

    return {
      valid: errors.length === 0,
      errors
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }

    return {
      valid: false,
      errors: [`Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Get transport configuration with validation
 */
export function getValidatedTransportConfig(): TransportConfig {
  const config = loadTransportConfig();
  const validation = validateTransportConfig(config);

  if (!validation.valid) {
    throw new Error(`Invalid transport configuration:\n${validation.errors.join('\n')}`);
  }

  return config;
}

/**
 * Create transport configuration for specific type
 */
export function createTransportConfig(type: TransportType, overrides: Partial<TransportConfig> = {}): TransportConfig {
  const baseConfig = { ...DEFAULT_TRANSPORT_CONFIG };

  // Apply type-specific defaults
  switch (type) {
    case TransportType.STDIO:
      // No additional configuration needed for stdio
      break;

    case TransportType.HTTP:
    case TransportType.SSE:
      baseConfig.port = 3000;
      baseConfig.enableCors = true;
      break;

    case TransportType.WEBSOCKET:
      baseConfig.port = 3001;
      baseConfig.enableCors = true;
      break;
  }

  return {
    ...baseConfig,
    type,
    ...overrides
  };
}

/**
 * Get environment variable documentation
 */
export function getEnvironmentVariableDocumentation(): Record<string, string> {
  return {
    [TRANSPORT_ENV_VARS.TYPE]: `Transport type (${Object.values(TransportType).join('|')}) - default: ${DEFAULT_TRANSPORT_CONFIG.type}`,
    [TRANSPORT_ENV_VARS.HOST]: `Server host for network transports - default: ${DEFAULT_TRANSPORT_CONFIG.host}`,
    [TRANSPORT_ENV_VARS.PORT]: `Server port for network transports - default: ${DEFAULT_TRANSPORT_CONFIG.port}`,
    [TRANSPORT_ENV_VARS.ENABLE_CORS]: `Enable CORS for network transports - default: ${DEFAULT_TRANSPORT_CONFIG.enableCors}`,
    [TRANSPORT_ENV_VARS.API_KEY]: `API key for authentication (optional) - default: none`,
    [TRANSPORT_ENV_VARS.SESSION_TIMEOUT]: `Session timeout in milliseconds - default: ${DEFAULT_TRANSPORT_CONFIG.sessionTimeout}`,
    [TRANSPORT_ENV_VARS.ENABLE_LOGGING]: `Enable request logging - default: ${DEFAULT_TRANSPORT_CONFIG.enableLogging}`,
    [TRANSPORT_ENV_VARS.MAX_REQUEST_SIZE]: `Maximum request size in bytes - default: ${DEFAULT_TRANSPORT_CONFIG.maxRequestSize}`,
    [TRANSPORT_ENV_VARS.RATE_LIMIT_RPM]: `Rate limit in requests per minute - default: ${DEFAULT_TRANSPORT_CONFIG.rateLimitRpm}`,
    [TRANSPORT_ENV_VARS.ENABLE_SSL]: `Enable SSL/TLS for HTTPS - default: ${DEFAULT_TRANSPORT_CONFIG.enableSsl}`,
    [TRANSPORT_ENV_VARS.SSL_CERT_PATH]: `SSL certificate file path (required if SSL enabled) - default: none`,
    [TRANSPORT_ENV_VARS.SSL_KEY_PATH]: `SSL private key file path (required if SSL enabled) - default: none`
  };
}

/**
 * Print transport configuration summary
 */
export function printTransportConfigSummary(config: TransportConfig): void {
  console.log('\n🚀 Transport Configuration:');
  console.log(`   Type: ${config.type}`);

  if (config.type !== TransportType.STDIO) {
    console.log(`   Host: ${config.host}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   CORS: ${config.enableCors ? 'enabled' : 'disabled'}`);
    console.log(`   SSL: ${config.enableSsl ? 'enabled' : 'disabled'}`);
    console.log(`   Auth: ${config.apiKey ? 'API key configured' : 'no authentication'}`);
    console.log(`   Rate Limit: ${config.rateLimitRpm} requests/minute`);
    console.log(`   Logging: ${config.enableLogging ? 'enabled' : 'disabled'}`);
  }

  console.log('');
}
