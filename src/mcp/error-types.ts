/**
 * Error types and classes for MCP server operations
 * Separated from main server file to avoid circular dependencies
 */

/**
 * Error types for comprehensive error handling
 */
export enum ErrorType {
  INITIALIZATION_ERROR = 'initialization_error',
  VECTOR_STORE_ERROR = 'vector_store_error',
  TOOL_EXECUTION_ERROR = 'tool_execution_error',
  TRANSPORT_ERROR = 'transport_error',
  VALIDATION_ERROR = 'validation_error',
  RESOURCE_ERROR = 'resource_error'
}

/**
 * Custom error class for MCP server errors
 */
export class MCPServerError extends Error {
  constructor(
    message: string,
    public type: ErrorType,
    public code?: string,
    public param?: string
  ) {
    super(message);
    this.name = 'MCPServerError';
  }
}
