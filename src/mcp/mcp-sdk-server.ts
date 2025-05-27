#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import path from 'path';

// Import transport infrastructure
import {
  TransportType,
  TransportConfig,
  loadTransportConfig,
  validateTransportConfig,
  printTransportConfigSummary,
  createValidatedTransport,
  transportFactory
} from '../transport';

// Import IL2CPP components
import { IL2CPPIndexer } from '../indexer/indexer';
import { IL2CPPVectorStore } from '../embeddings/vector-store';
import { Document } from '@langchain/core/documents';

// Import error types
import { MCPServerError, ErrorType } from './error-types';

// ============================================================================
// CONFIGURATION & TYPES
// ============================================================================

/**
 * Configuration options for server initialization
 */
export interface InitializationOptions {
  dumpFilePath?: string;
  model?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  progressCallback?: (progress: number, message: string) => void;
  environment?: 'development' | 'production' | 'test';
  enableCaching?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  hashFilePath?: string;
  forceReprocess?: boolean;
}





// ============================================================================
// GLOBAL STATE MANAGEMENT
// ============================================================================

// Global vector store instance
let vectorStore: IL2CPPVectorStore | null = null;

// Server configuration
let serverConfig: InitializationOptions = {};

// Initialization state
let isInitialized = false;

// Logging configuration
let logLevel: string = process.env.LOG_LEVEL || 'info';

// Add global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Safely stringify JSON with error handling
 */
function safeJsonStringify(obj: any, space?: number): string {
  try {
    return JSON.stringify(obj, null, space);
  } catch (error) {
    Logger.error('JSON stringify error:', error);
    return JSON.stringify({
      error: 'Failed to serialize response',
      message: error instanceof Error ? error.message : 'Unknown serialization error'
    }, null, space);
  }
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Enhanced logging utility
 */
class Logger {
  private static shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  static debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  static info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  static warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  static error(message: string, error?: any): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
    }
  }
}

// ============================================================================
// INITIALIZATION FUNCTIONS
// ============================================================================

/**
 * Initialize the MCP server with comprehensive setup
 * @param options Configuration options
 */
export async function initializeServer(options: InitializationOptions = {}): Promise<void> {
  try {
    Logger.info('Starting MCP server initialization...');

    // Store configuration
    const nodeEnv = process.env.NODE_ENV;
    const environment: 'development' | 'production' | 'test' =
      nodeEnv === 'development' || nodeEnv === 'test' ? nodeEnv : 'production';

    serverConfig = {
      environment,
      enableCaching: true,
      logLevel: 'info',
      chunkSize: 1000,
      chunkOverlap: 200,
      ...options
    };

    // Set log level
    if (serverConfig.logLevel) {
      logLevel = serverConfig.logLevel;
    }

    Logger.debug('Server configuration:', serverConfig);

    // Determine dump file path
    let dumpFilePath = serverConfig.dumpFilePath;
    if (!dumpFilePath) {
      const currentDir = __dirname;
      const projectRoot = path.resolve(currentDir, '..', '..');
      dumpFilePath = path.join(projectRoot, 'dump.cs');
    }

    Logger.info(`Loading dump file from: ${dumpFilePath}`);

    // Progress callback wrapper
    const progressCallback = serverConfig.progressCallback || ((progress: number, message: string) => {
      Logger.info(`Progress: ${progress}% - ${message}`);
    });

    progressCallback(10, 'Initializing IL2CPP indexer...');

    // Create and initialize the indexer with enhanced parser
    const indexer = new IL2CPPIndexer(
      serverConfig.chunkSize,
      serverConfig.chunkOverlap,
      serverConfig.model,
      serverConfig.hashFilePath
    );

    progressCallback(20, 'Loading and parsing dump file...');

    // Index the dump file
    Logger.info('Indexing dump file...');
    vectorStore = await indexer.indexFile(dumpFilePath, progressCallback, serverConfig.forceReprocess);

    progressCallback(100, 'Initialization complete');
    Logger.info('Indexing complete');

    // Mark as initialized
    isInitialized = true;

    Logger.info('MCP server initialization completed successfully');

  } catch (error) {
    const errorMessage = `Failed to initialize MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`;
    Logger.error(errorMessage, error);
    throw new MCPServerError(errorMessage, ErrorType.INITIALIZATION_ERROR);
  }
}

/**
 * Initialize the MCP server with a pre-existing vector store (backward compatibility)
 * @param store Vector store instance
 */
export function initializeVectorStore(store: IL2CPPVectorStore): void {
  Logger.info('Initializing MCP server with existing vector store');
  vectorStore = store;
  isInitialized = true;
  Logger.info('Vector store initialization completed');
}

/**
 * Check if the server is properly initialized
 */
function ensureInitialized(): void {
  if (!isInitialized || !vectorStore) {
    throw new MCPServerError(
      'MCP server not initialized. Call initializeServer() first.',
      ErrorType.INITIALIZATION_ERROR
    );
  }
}

// ============================================================================
// MCP SERVER FACTORY
// ============================================================================

/**
 * Create and configure the MCP server with all tools and resources
 * @returns Configured MCP server
 */
function createMcpServer(): McpServer {
  Logger.debug('Creating MCP server instance');

  // Create an MCP server with enhanced metadata
  const server = new McpServer({
    name: "IL2CPP Dump Analyzer",
    version: "1.0.0",
    description: "A specialized RAG system for analyzing IL2CPP dump.cs files from Unity games",
    metadata: {
      capabilities: [
        "Unity IL2CPP dump analysis",
        "MonoBehaviour discovery",
        "Class hierarchy analysis",
        "Method signature lookup",
        "Enum value retrieval",
        "Advanced filtering and search",
        "Dependency mapping and analysis",
        "Cross-reference analysis",
        "Design pattern detection and analysis",
        "C# class wrapper generation",
        "Method stub generation",
        "Unity MonoBehaviour template generation",
        "IL2CPP metadata extraction and analysis"
      ],
      supportedGameEngines: ["Unity"],
      supportedLanguages: ["C#"],
      author: "IL2CPP Dump Analyzer Team",
      version: "1.0.0",
      protocol: "MCP",
      features: {
        stdio_transport: true,
        http_transport: true,
        sse_transport: true,
        network_transport: true,
        resource_templates: true,
        advanced_tools: true,
        remote_access: true,
        authentication: true,
        rate_limiting: true
      }
    }
  });

  // Register resources
  registerResources(server);

  // Register tools
  registerTools(server);

  Logger.debug('MCP server created successfully');
  return server;
}

// ============================================================================
// RESOURCE HANDLERS
// ============================================================================

/**
 * Register all resource handlers
 */
function registerResources(server: McpServer): void {
  Logger.debug('Registering resource handlers');

  // Enhanced IL2CPP code search resource
  server.resource(
    "il2cpp-code",
    new ResourceTemplate("il2cpp://{query}", {
      list: async () => {
        // Return some example resources that clients can discover
        return {
          resources: [
            {
              uri: "il2cpp://MonoBehaviour",
              name: "MonoBehaviour Classes",
              description: "Search for MonoBehaviour classes"
            },
            {
              uri: "il2cpp://Player",
              name: "Player Classes",
              description: "Search for Player-related classes"
            },
            {
              uri: "il2cpp://GameObject",
              name: "GameObject Classes",
              description: "Search for GameObject-related classes"
            },
            {
              uri: "il2cpp://WildMapPokemon",
              name: "WildMapPokemon Classes",
              description: "Search for WildMapPokemon-related classes"
            }
          ]
        };
      }
    }),
    async (uri, { query }) => {
      try {
        ensureInitialized();
        Logger.debug(`Resource request for il2cpp-code: ${uri.href}`);

        // Extract options from query parameters
        const url = new URL(uri.href);
        const topK = parseInt(url.searchParams.get('top_k') || '5');
        const filterType = url.searchParams.get('filter_type');
        const filterNamespace = url.searchParams.get('filter_namespace');
        const filterMonoBehaviour = url.searchParams.get('filter_monobehaviour') === 'true';

        // Build filter
        const filter: Record<string, any> = {};
        if (filterType) filter.type = filterType;
        if (filterNamespace) filter.namespace = filterNamespace;
        if (filterMonoBehaviour) filter.isMonoBehaviour = true;

        // Ensure query is a string (not an array)
        const queryString = Array.isArray(query) ? query[0] : query;

        Logger.debug(`Searching with query: "${queryString}", filter:`, filter, `top_k: ${topK}`);

        // Perform search
        let results: Document[];
        if (Object.keys(filter).length > 0) {
          results = await vectorStore!.searchWithFilter(queryString, filter, topK);
        } else {
          results = await vectorStore!.similaritySearch(queryString, topK);
        }

        Logger.debug(`Found ${results.length} results for resource request`);

        // Format response
        return {
          contents: results.map(doc => ({
            uri: `il2cpp://${encodeURIComponent(doc.metadata.fullName || doc.metadata.name)}`,
            text: doc.pageContent,
            metadata: {
              ...doc.metadata,
              searchQuery: queryString,
              appliedFilters: filter,
              resultCount: results.length
            }
          }))
        };

      } catch (error) {
        Logger.error('Error in il2cpp-code resource handler:', error);
        throw new MCPServerError(
          `Resource error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorType.RESOURCE_ERROR
        );
      }
    }
  );

  Logger.debug('Resource handlers registered successfully');
}

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

// Import the new tool registry
import { registerAllTools, ToolExecutionContext } from './tools/tool-registry';

/**
 * Register all tool handlers using the new registry system
 */
function registerTools(server: McpServer): void {
  Logger.debug('Registering tool handlers using new registry system');

  // Create tool execution context
  const context: ToolExecutionContext = {
    vectorStore: vectorStore!,
    logger: Logger,
    isInitialized: () => isInitialized
  };

  // Register all tools using the new registry
  registerAllTools(server, context);

  Logger.debug('All tools registered successfully via registry');
}

// ============================================================================
// TRANSPORT FUNCTIONS
// ============================================================================

/**
 * Start the MCP server with stdio transport (for command-line tools)
 */
export async function startMcpStdioServer(): Promise<void> {
  try {
    Logger.info('Starting MCP server with stdio transport...');

    ensureInitialized();

    const server = createMcpServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);

    Logger.info("MCP server started successfully with stdio transport");

  } catch (error) {
    Logger.error('Failed to start stdio server:', error);
    throw new MCPServerError(
      `Failed to start stdio server: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ErrorType.TRANSPORT_ERROR
    );
  }
}

/**
 * Start the MCP server with configurable transport (stdio, HTTP, WebSocket, SSE)
 */
export async function startMcpServerWithTransport(transportConfig?: TransportConfig): Promise<void> {
  try {
    Logger.info('Starting MCP server with configurable transport...');

    ensureInitialized();

    // Load transport configuration
    const config = transportConfig || loadTransportConfig();

    // Validate configuration
    const validation = validateTransportConfig(config);
    if (!validation.valid) {
      throw new MCPServerError(
        `Invalid transport configuration: ${validation.errors.join(', ')}`,
        ErrorType.VALIDATION_ERROR
      );
    }

    // Print configuration summary
    printTransportConfigSummary(config);

    const server = createMcpServer();

    // Create transport based on configuration
    let transport: Transport;

    if (config.type === TransportType.STDIO) {
      // Use stdio transport directly for backward compatibility
      transport = new StdioServerTransport();
    } else {
      // Use transport factory for network transports
      transport = await createValidatedTransport(config);
    }

    await server.connect(transport);

    Logger.info(`MCP server started successfully with ${config.type} transport`);

    // Log connection information for network transports
    if (config.type !== TransportType.STDIO) {
      const protocol = config.enableSsl ? 'https' : 'http';
      const url = `${protocol}://${config.host}:${config.port}`;
      Logger.info(`Server accessible at: ${url}`);

      if (config.apiKey) {
        Logger.info('Authentication: API key required');
      } else {
        Logger.warn('Authentication: No API key configured (open access)');
      }
    }

  } catch (error) {
    Logger.error('Failed to start MCP server with transport:', error);
    throw new MCPServerError(
      `Failed to start MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ErrorType.TRANSPORT_ERROR
    );
  }
}



// ============================================================================
// STARTUP FUNCTIONS (from stdio-server.ts)
// ============================================================================

/**
 * Complete server startup with initialization and configurable transport
 * This function combines the initialization and startup logic with transport selection
 */
export async function startMcpServer(options: InitializationOptions & { transportConfig?: TransportConfig } = {}): Promise<void> {
  try {
    // Set up the environment for the MCP server
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';

    Logger.info('Starting complete MCP server initialization and startup...');

    // Initialize the server with the provided options
    await initializeServer(options);

    // Start the MCP server with configurable transport
    await startMcpServerWithTransport(options.transportConfig);

  } catch (error) {
    Logger.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

/**
 * Legacy function for backward compatibility - starts with stdio transport only
 */
export async function startMcpServerStdio(options: InitializationOptions = {}): Promise<void> {
  try {
    // Set up the environment for the MCP server
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';

    Logger.info('Starting MCP server with stdio transport (legacy mode)...');

    // Initialize the server with the provided options
    await initializeServer(options);

    // Start the MCP stdio server
    await startMcpStdioServer();

  } catch (error) {
    Logger.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}



// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get server status and statistics
 */
export function getServerStatus(): {
  initialized: boolean;
  vectorStoreReady: boolean;
  documentCount?: number;
  configuration: InitializationOptions;
} {
  return {
    initialized: isInitialized,
    vectorStoreReady: vectorStore !== null,
    configuration: serverConfig
  };
}

/**
 * Gracefully shutdown the server
 */
export async function shutdown(): Promise<void> {
  Logger.info('Shutting down MCP server...');

  // Reset state
  vectorStore = null;
  isInitialized = false;
  serverConfig = {};

  Logger.info('MCP server shutdown complete');
}

// ============================================================================
// EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

// Export the main startup function as default for stdio-server.ts compatibility
export default startMcpServer;

// Re-export key types and functions
export {
  IL2CPPVectorStore,
  Document,
  Logger
};
