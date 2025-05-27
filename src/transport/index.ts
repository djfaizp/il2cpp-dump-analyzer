/**
 * Transport module exports for IL2CPP MCP Server
 * Provides unified access to all transport-related functionality
 */

// Types and interfaces
export * from './transport-types';

// Configuration management
export * from './transport-config';

// Transport implementations
export * from './http-transport';

// Transport factory
export * from './transport-factory';

// Re-export commonly used types and enums for convenience
export {
  TransportType  // Export as value (enum)
} from './transport-types';

export type {
  TransportConfig,
  NetworkTransportOptions,
  TransportStatus,
  TransportMetrics,
  AuthInfo,
  RateLimitInfo
} from './transport-types';

// Re-export main factory functions
export {
  transportFactory,
  createValidatedTransport
} from './transport-factory';

// Re-export configuration functions
export {
  loadTransportConfig,
  validateTransportConfig,
  getValidatedTransportConfig,
  createTransportConfig,
  printTransportConfigSummary
} from './transport-config';
