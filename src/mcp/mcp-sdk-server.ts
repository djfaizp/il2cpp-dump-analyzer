#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import path from 'path';
import express from 'express';
import { randomUUID } from 'crypto';

// Import IL2CPP components
import { IL2CPPIndexer } from '../indexer/indexer';
import { IL2CPPVectorStore } from '../embeddings/vector-store';
import { Document } from '@langchain/core/documents';

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

/**
 * HTTP server configuration options
 */
export interface HttpServerOptions {
  sessionTimeout?: number;
  maxSessions?: number;
  enableLogging?: boolean;
  enableCors?: boolean;
}

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
        "Advanced filtering and search"
      ],
      supportedGameEngines: ["Unity"],
      supportedLanguages: ["C#"],
      author: "IL2CPP Dump Analyzer Team",
      version: "1.0.0",
      protocol: "MCP",
      features: {
        stdio_transport: true,
        http_transport: true,
        resource_templates: true,
        advanced_tools: true
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

/**
 * Register all tool handlers
 */
function registerTools(server: McpServer): void {
  Logger.debug('Registering tool handlers');

  // Enhanced search_code tool with comprehensive filtering
  server.tool(
    "search_code",
    {
      query: z.string().describe("The search query"),
      filter_type: z.string().optional().describe("Filter by entity type (class, method, enum, interface)"),
      filter_namespace: z.string().optional().describe("Filter by namespace"),
      filter_monobehaviour: z.boolean().optional().describe("Filter to only MonoBehaviour classes"),
      top_k: z.number().optional().default(5).describe("Number of results to return")
    },
    async ({ query, filter_type, filter_namespace, filter_monobehaviour, top_k = 5 }) => {
      try {
        ensureInitialized();
        Logger.debug(`Tool call: search_code with query: "${query}"`);

        const filter: Record<string, any> = {};
        if (filter_type) filter.type = filter_type;
        if (filter_namespace) filter.namespace = filter_namespace;
        if (filter_monobehaviour) filter.isMonoBehaviour = true;

        // Ensure query is a string (not an array)
        const queryString = Array.isArray(query) ? query[0] : query;

        Logger.debug(`Search filter:`, filter, `top_k: ${top_k}`);

        let results: Document[];
        if (Object.keys(filter).length > 0) {
          results = await vectorStore!.searchWithFilter(queryString, filter, top_k);
        } else {
          results = await vectorStore!.similaritySearch(queryString, top_k);
        }

        // Format the results with enhanced metadata
        const formattedResults = results.map(doc => ({
          content: doc.pageContent,
          name: doc.metadata.name,
          namespace: doc.metadata.namespace,
          fullName: doc.metadata.fullName,
          type: doc.metadata.type,
          isMonoBehaviour: doc.metadata.isMonoBehaviour || false,
          baseClass: doc.metadata.baseClass,
          interfaces: doc.metadata.interfaces || []
        }));

        Logger.debug(`search_code returned ${results.length} results`);

        const responseData = {
          results: formattedResults,
          metadata: {
            query: queryString,
            appliedFilters: filter,
            resultCount: results.length,
            timestamp: new Date().toISOString()
          }
        };

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(responseData, 2)
            }
          ]
        };

      } catch (error) {
        Logger.error('Error in search_code tool:', error);
        throw new MCPServerError(
          `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorType.TOOL_EXECUTION_ERROR
        );
      }
    }
  );

  // Enhanced find_monobehaviours tool
  server.tool(
    "find_monobehaviours",
    {
      query: z.string().optional().describe("Optional search query to filter MonoBehaviours"),
      top_k: z.number().optional().default(10).describe("Number of results to return")
    },
    async ({ query = "", top_k = 10 }) => {
      try {
        ensureInitialized();
        Logger.debug(`Tool call: find_monobehaviours with query: "${query}"`);

        const filter = {
          type: 'class',
          isMonoBehaviour: true
        };

        // Ensure query is a string (not an array)
        const queryString = Array.isArray(query) ? query[0] : query;

        const results = await vectorStore!.searchWithFilter(queryString, filter, top_k);

        // Format the results with enhanced information
        const formattedResults = results.map(doc => ({
          content: doc.pageContent,
          name: doc.metadata.name,
          namespace: doc.metadata.namespace,
          fullName: doc.metadata.fullName,
          baseClass: doc.metadata.baseClass,
          interfaces: doc.metadata.interfaces || [],
          methods: doc.metadata.methods || []
        }));

        Logger.debug(`find_monobehaviours returned ${results.length} results`);

        const responseData = {
          monoBehaviours: formattedResults,
          metadata: {
            query: queryString || 'All MonoBehaviours',
            resultCount: results.length,
            timestamp: new Date().toISOString()
          }
        };

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(responseData, 2)
            }
          ]
        };

      } catch (error) {
        Logger.error('Error in find_monobehaviours tool:', error);
        throw new MCPServerError(
          `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorType.TOOL_EXECUTION_ERROR
        );
      }
    }
  );

  // Enhanced find_class_hierarchy tool
  server.tool(
    "find_class_hierarchy",
    {
      class_name: z.string().describe("The name of the class to find hierarchy for"),
      include_methods: z.boolean().optional().default(true).describe("Whether to include methods in the output")
    },
    async ({ class_name, include_methods = true }) => {
      try {
        ensureInitialized();
        Logger.debug(`Tool call: find_class_hierarchy for class: "${class_name}"`);

        // First find the class
        const classResults = await vectorStore!.searchWithFilter(class_name, { type: 'class' }, 1);

        if (classResults.length === 0) {
          Logger.debug(`Class '${class_name}' not found`);
          return {
            content: [
              {
                type: "text",
                text: safeJsonStringify({
                  error: `Class '${class_name}' not found in the IL2CPP dump.`,
                  suggestions: "Try searching with a partial name or check the spelling."
                }, 2)
              }
            ]
          };
        }

        const classDoc = classResults[0];
        const className = classDoc.metadata.name;
        const baseClass = classDoc.metadata.baseClass;

        // Build hierarchy information with proper typing
        interface HierarchyInfo {
          name: string;
          namespace: string;
          fullName: string;
          baseClass: string;
          interfaces: string[];
          isMonoBehaviour: boolean;
          methods?: Array<{
            name: string;
            returnType: string;
            parameters: string;
            isStatic: boolean;
            isVirtual: boolean;
            isOverride: boolean;
          }>;
          metadata: {
            searchedClass: string;
            includesMethods: boolean;
            timestamp: string;
          };
        }

        const hierarchyInfo: HierarchyInfo = {
          name: className,
          namespace: classDoc.metadata.namespace,
          fullName: classDoc.metadata.fullName,
          baseClass: baseClass,
          interfaces: classDoc.metadata.interfaces || [],
          isMonoBehaviour: classDoc.metadata.isMonoBehaviour || false,
          metadata: {
            searchedClass: class_name,
            includesMethods: include_methods,
            timestamp: new Date().toISOString()
          }
        };

        // If methods are requested, find them
        if (include_methods) {
          const methodResults = await vectorStore!.searchWithFilter("", {
            type: 'method',
            parentClass: className
          }, 50);

          hierarchyInfo.methods = methodResults.map(doc => ({
            name: doc.metadata.name,
            returnType: doc.metadata.returnType || 'void',
            parameters: doc.metadata.parameters || '',
            isStatic: !!doc.metadata.isStatic,
            isVirtual: !!doc.metadata.isVirtual,
            isOverride: !!doc.metadata.isOverride
          }));

          Logger.debug(`Found ${hierarchyInfo.methods.length} methods for class ${className}`);
        }

        Logger.debug(`find_class_hierarchy completed for class: ${className}`);

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(hierarchyInfo, 2)
            }
          ]
        };

      } catch (error) {
        Logger.error('Error in find_class_hierarchy tool:', error);
        throw new MCPServerError(
          `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorType.TOOL_EXECUTION_ERROR
        );
      }
    }
  );

  // Enhanced find_enum_values tool
  server.tool(
    "find_enum_values",
    {
      enum_name: z.string().describe("The name of the enum to find values for")
    },
    async ({ enum_name }) => {
      try {
        ensureInitialized();
        Logger.debug(`Tool call: find_enum_values for enum: "${enum_name}"`);

        // Find the enum
        const enumResults = await vectorStore!.searchWithFilter(enum_name, { type: 'enum' }, 1);

        if (enumResults.length === 0) {
          Logger.debug(`Enum '${enum_name}' not found`);
          return {
            content: [
              {
                type: "text",
                text: safeJsonStringify({
                  error: `Enum '${enum_name}' not found in the IL2CPP dump.`,
                  suggestions: "Try searching with a partial name or check the spelling."
                }, 2)
              }
            ]
          };
        }

        const enumDoc = enumResults[0];

        // Extract enum values from the content with enhanced parsing
        const content = enumDoc.pageContent;
        const lines = content.split('\n');
        const valueLines = lines.filter(line => line.includes('=') && !line.trim().startsWith('//'));

        const enumValues = valueLines.map(line => {
          const trimmed = line.trim();
          const parts = trimmed.split('=');
          if (parts.length >= 2) {
            const name = parts[0].trim().replace(/,\s*$/, '');
            const value = parts[1].replace(',', '').trim();
            return { name, value };
          }
          return null;
        }).filter(Boolean);

        const responseData = {
          name: enumDoc.metadata.name,
          namespace: enumDoc.metadata.namespace,
          fullName: enumDoc.metadata.fullName,
          values: enumValues,
          metadata: {
            searchedEnum: enum_name,
            valueCount: enumValues.length,
            timestamp: new Date().toISOString()
          }
        };

        Logger.debug(`find_enum_values found ${enumValues.length} values for enum: ${enumDoc.metadata.name}`);

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(responseData, 2)
            }
          ]
        };

      } catch (error) {
        Logger.error('Error in find_enum_values tool:', error);
        throw new MCPServerError(
          `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorType.TOOL_EXECUTION_ERROR
        );
      }
    }
  );

  Logger.debug('Tool handlers registered successfully');
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
 * Start the MCP server with HTTP transport
 * @param port Port to listen on
 * @param host Host to bind to
 * @param options HTTP server options
 */
export async function startMcpHttpServer(
  port: number,
  host: string,
  options: HttpServerOptions = {}
): Promise<void> {
  try {
    Logger.info(`Starting MCP server with HTTP transport on ${host}:${port}...`);

    ensureInitialized();

    const {
      sessionTimeout = 300000, // 5 minutes
      maxSessions = 100,
      enableLogging = true,
      enableCors = true
    } = options;

    const app = express();

    // Middleware
    app.use(express.json({ limit: '10mb' }));

    if (enableCors) {
      app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
        if (req.method === 'OPTIONS') {
          res.sendStatus(200);
          return;
        }
        next();
      });
    }

    if (enableLogging) {
      app.use((req, res, next) => {
        Logger.debug(`${req.method} ${req.path} - Session: ${req.headers['mcp-session-id'] || 'none'}`);
        next();
      });
    }

    // Map to store transports by session ID with cleanup
    const transports: { [sessionId: string]: {
      transport: StreamableHTTPServerTransport;
      lastActivity: number;
    } } = {};

    // Session cleanup interval
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expiredSessions = Object.entries(transports)
        .filter(([_, session]) => now - session.lastActivity > sessionTimeout)
        .map(([sessionId]) => sessionId);

      expiredSessions.forEach(sessionId => {
        Logger.debug(`Cleaning up expired session: ${sessionId}`);
        delete transports[sessionId];
      });

      if (expiredSessions.length > 0) {
        Logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
      }
    }, sessionTimeout / 2);

    // Handle POST requests for client-to-server communication
    app.post('/mcp', async (req, res) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transportSession: { transport: StreamableHTTPServerTransport; lastActivity: number };

        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          transportSession = transports[sessionId];
          transportSession.lastActivity = Date.now();
        } else {
          // Check session limit
          if (Object.keys(transports).length >= maxSessions) {
            Logger.warn('Maximum number of sessions reached');
            return res.status(429).json({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Maximum number of sessions reached',
              },
              id: null,
            });
          }

          // New session
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              Logger.debug(`New session initialized: ${newSessionId}`);
              transports[newSessionId] = {
                transport,
                lastActivity: Date.now()
              };
            }
          });

          // Clean up transport when closed
          transport.onclose = () => {
            if (transport.sessionId) {
              Logger.debug(`Session closed: ${transport.sessionId}`);
              delete transports[transport.sessionId];
            }
          };

          const server = createMcpServer();
          await server.connect(transport);

          transportSession = {
            transport,
            lastActivity: Date.now()
          };
        }

        // Handle the request
        try {
          await transportSession.transport.handleRequest(req, res, req.body);
        } catch (transportError) {
          Logger.error('Transport error during request handling:', transportError);
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Transport error',
                data: transportError instanceof Error ? transportError.message : 'Unknown transport error'
              },
              id: null,
            });
          }
          return;
        }

      } catch (error) {
        Logger.error('Error handling MCP POST request:', error);
        if (!res.headersSent) {
          try {
            res.status(500).json({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal server error',
                data: error instanceof Error ? error.message : 'Unknown error'
              },
              id: null,
            });
          } catch (jsonError) {
            Logger.error('Failed to send JSON error response:', jsonError);
            res.status(500).send('Internal server error');
          }
        }
      }
    });

    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (req: express.Request, res: express.Response) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        if (!sessionId || !transports[sessionId]) {
          Logger.warn(`Invalid or missing session ID: ${sessionId}`);
          res.status(400).send('Invalid or missing session ID');
          return;
        }

        const transportSession = transports[sessionId];
        transportSession.lastActivity = Date.now();

        try {
          await transportSession.transport.handleRequest(req, res);
        } catch (transportError) {
          Logger.error('Transport error during session request:', transportError);
          if (!res.headersSent) {
            res.status(500).send('Transport error');
          }
          return;
        }

      } catch (error) {
        Logger.error('Error handling session request:', error);
        if (!res.headersSent) {
          res.status(500).send('Internal server error');
        }
      }
    };

    // Handle GET requests for server-to-client notifications via SSE
    app.get('/mcp', handleSessionRequest);

    // Handle DELETE requests for session termination
    app.delete('/mcp', handleSessionRequest);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        initialized: isInitialized,
        sessions: Object.keys(transports).length,
        maxSessions,
        timestamp: new Date().toISOString()
      });
    });

    // Start the server
    const httpServer = app.listen(port, host, () => {
      Logger.info(`MCP server listening at http://${host}:${port}/mcp`);
      Logger.info(`Health check available at http://${host}:${port}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      Logger.info('Received SIGTERM, shutting down gracefully...');
      clearInterval(cleanupInterval);
      httpServer.close(() => {
        Logger.info('HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      Logger.info('Received SIGINT, shutting down gracefully...');
      clearInterval(cleanupInterval);
      httpServer.close(() => {
        Logger.info('HTTP server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    Logger.error('Failed to start HTTP server:', error);
    throw new MCPServerError(
      `Failed to start HTTP server: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ErrorType.TRANSPORT_ERROR
    );
  }
}

// ============================================================================
// STARTUP FUNCTIONS (from stdio-server.ts)
// ============================================================================

/**
 * Complete server startup with initialization and stdio transport
 * This function combines the initialization and startup logic from stdio-server.ts
 */
export async function startMcpServer(options: InitializationOptions = {}): Promise<void> {
  try {
    // Set up the environment for the MCP server
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';

    Logger.info('Starting complete MCP server initialization and startup...');

    // Initialize the server with the provided options
    await initializeServer(options);

    // Start the MCP stdio server
    await startMcpStdioServer();

  } catch (error) {
    Logger.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

/**
 * Complete server startup with initialization and HTTP transport
 */
export async function startMcpHttpServerComplete(
  port: number,
  host: string,
  initOptions: InitializationOptions = {},
  httpOptions: HttpServerOptions = {}
): Promise<void> {
  try {
    Logger.info('Starting complete MCP HTTP server initialization and startup...');

    // Initialize the server with the provided options
    await initializeServer(initOptions);

    // Start the MCP HTTP server
    await startMcpHttpServer(port, host, httpOptions);

  } catch (error) {
    Logger.error('Failed to start MCP HTTP server:', error);
    throw error;
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
