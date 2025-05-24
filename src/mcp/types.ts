/**
 * Types for the Model Context Protocol (MCP) server
 * Based on the MCP specification
 */

/**
 * MCP server metadata
 */
export interface MCPMetadata {
  name: string;
  description: string;
  schema_version: string;
  human_can_retrieve: boolean;
  retrieval_options?: {
    [key: string]: {
      type: string;
      description: string;
      required?: boolean;
      default?: any;
    };
  };
}

/**
 * MCP retrieval request
 */
export interface MCPRetrievalRequest {
  query: string;
  options?: {
    [key: string]: any;
  };
}

/**
 * MCP retrieval response
 */
export interface MCPRetrievalResponse {
  documents: MCPDocument[];
}

/**
 * MCP document
 */
export interface MCPDocument {
  content: string;
  metadata: {
    [key: string]: any;
  };
  score?: number;
}

/**
 * MCP error response
 */
export interface MCPErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: {
      [key: string]: {
        type: string;
        description: string;
      };
    };
    required: string[];
  };
}

/**
 * MCP tools response
 */
export interface MCPToolsResponse {
  tools: MCPTool[];
}

/**
 * MCP tool call request
 */
export interface MCPToolCallRequest {
  name: string;
  arguments: {
    [key: string]: any;
  };
}

/**
 * MCP tool call response
 */
export interface MCPToolCallResponse {
  content: string;
  metadata?: {
    [key: string]: any;
  };
}
