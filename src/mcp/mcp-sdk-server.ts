#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from 'path';

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
        "Advanced filtering and search",
        "Dependency mapping and analysis",
        "Cross-reference analysis",
        "Design pattern detection and analysis"
      ],
      supportedGameEngines: ["Unity"],
      supportedLanguages: ["C#"],
      author: "IL2CPP Dump Analyzer Team",
      version: "1.0.0",
      protocol: "MCP",
      features: {
        stdio_transport: true,
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

  // Enhanced analyze_dependencies tool - Dependency Mapping & Analysis
  server.tool(
    "analyze_dependencies",
    {
      class_name: z.string().describe("Target class to analyze dependencies for"),
      analysis_type: z.enum(["incoming", "outgoing", "bidirectional", "circular"]).optional().default("bidirectional").describe("Type of dependency analysis to perform"),
      depth: z.number().optional().default(3).describe("How deep to traverse dependency chains (1-5)"),
      include_system_types: z.boolean().optional().default(false).describe("Include Unity/System dependencies in analysis")
    },
    async ({ class_name, analysis_type = "bidirectional", depth = 3, include_system_types = false }) => {
      try {
        ensureInitialized();
        Logger.debug(`Tool call: analyze_dependencies for class: "${class_name}", type: ${analysis_type}, depth: ${depth}`);

        // Validate depth parameter
        const maxDepth = Math.min(Math.max(depth, 1), 5);
        if (maxDepth !== depth) {
          Logger.debug(`Depth adjusted from ${depth} to ${maxDepth} (valid range: 1-5)`);
        }

        // Find the target class
        const classResults = await vectorStore!.searchWithFilter(class_name, { type: 'class' }, 1);

        if (classResults.length === 0) {
          Logger.debug(`Class '${class_name}' not found`);
          return {
            content: [
              {
                type: "text",
                text: safeJsonStringify({
                  error: `Class '${class_name}' not found in the IL2CPP dump.`,
                  suggestions: "Try searching with a partial name or check the spelling.",
                  availableClasses: "Use search_code tool to find available classes."
                }, 2)
              }
            ]
          };
        }

        const targetClass = classResults[0];
        const targetClassName = targetClass.metadata.name;
        const targetFullName = targetClass.metadata.fullName;

        Logger.debug(`Analyzing dependencies for class: ${targetClassName} (${targetFullName})`);

        // Initialize dependency analysis result
        interface DependencyNode {
          name: string;
          fullName: string;
          namespace: string;
          type: 'class' | 'interface' | 'enum';
          relationship: 'inheritance' | 'interface' | 'field' | 'method_parameter' | 'method_return' | 'generic_parameter';
          depth: number;
          isSystemType: boolean;
        }

        interface DependencyAnalysisResult {
          targetClass: {
            name: string;
            fullName: string;
            namespace: string;
          };
          incomingDependencies: DependencyNode[];
          outgoingDependencies: DependencyNode[];
          circularDependencies: Array<{
            path: string[];
            description: string;
          }>;
          metrics: {
            totalIncoming: number;
            totalOutgoing: number;
            systemTypeCount: number;
            userTypeCount: number;
            couplingScore: number;
            maxDepthReached: number;
          };
          analysisMetadata: {
            analysisType: string;
            requestedDepth: number;
            actualDepth: number;
            includeSystemTypes: boolean;
            timestamp: string;
          };
        }

        const result: DependencyAnalysisResult = {
          targetClass: {
            name: targetClassName,
            fullName: targetFullName,
            namespace: targetClass.metadata.namespace || ''
          },
          incomingDependencies: [],
          outgoingDependencies: [],
          circularDependencies: [],
          metrics: {
            totalIncoming: 0,
            totalOutgoing: 0,
            systemTypeCount: 0,
            userTypeCount: 0,
            couplingScore: 0,
            maxDepthReached: 0
          },
          analysisMetadata: {
            analysisType: analysis_type,
            requestedDepth: depth,
            actualDepth: maxDepth,
            includeSystemTypes: include_system_types,
            timestamp: new Date().toISOString()
          }
        };

        // Helper function to check if a type is a system type
        const isSystemType = (typeName: string): boolean => {
          if (!typeName) return false;
          const systemPrefixes = ['System.', 'UnityEngine.', 'Unity.', 'Microsoft.', 'Mono.'];
          return systemPrefixes.some(prefix => typeName.startsWith(prefix));
        };

        // Helper function to extract type name from complex type strings
        const extractTypeName = (typeStr: string): string => {
          if (!typeStr) return '';
          // Remove generic parameters, arrays, etc.
          return typeStr.replace(/[<>\[\]]/g, '').split(',')[0].trim();
        };

        // Analyze outgoing dependencies (what this class depends on)
        if (analysis_type === 'outgoing' || analysis_type === 'bidirectional') {
          const outgoingDeps = new Set<string>();

          // Inheritance dependencies
          if (targetClass.metadata.baseClass) {
            const baseClassName = extractTypeName(targetClass.metadata.baseClass);
            if (!isSystemType(baseClassName) || include_system_types) {
              outgoingDeps.add(`${baseClassName}|inheritance`);
            }
          }

          // Interface dependencies
          if (targetClass.metadata.interfaces) {
            targetClass.metadata.interfaces.forEach((iface: string) => {
              const ifaceName = extractTypeName(iface);
              if (!isSystemType(ifaceName) || include_system_types) {
                outgoingDeps.add(`${ifaceName}|interface`);
              }
            });
          }

          // Field type dependencies
          if (targetClass.metadata.fields) {
            targetClass.metadata.fields.forEach((field: any) => {
              const fieldTypeName = extractTypeName(field.type);
              if (!isSystemType(fieldTypeName) || include_system_types) {
                outgoingDeps.add(`${fieldTypeName}|field`);
              }
            });
          }

          // Method parameter and return type dependencies
          if (targetClass.metadata.methods) {
            targetClass.metadata.methods.forEach((method: any) => {
              // Return type
              if (method.returnType) {
                const returnTypeName = extractTypeName(method.returnType);
                if (!isSystemType(returnTypeName) || include_system_types) {
                  outgoingDeps.add(`${returnTypeName}|method_return`);
                }
              }

              // Parameter types
              if (method.parameters) {
                method.parameters.forEach((param: any) => {
                  const paramTypeName = extractTypeName(param.type);
                  if (!isSystemType(paramTypeName) || include_system_types) {
                    outgoingDeps.add(`${paramTypeName}|method_parameter`);
                  }
                });
              }
            });
          }

          // Convert to dependency nodes
          for (const depStr of outgoingDeps) {
            const [typeName, relationship] = depStr.split('|');
            if (typeName && typeName !== targetClassName) {
              const isSystem = isSystemType(typeName);
              result.outgoingDependencies.push({
                name: typeName.split('.').pop() || typeName,
                fullName: typeName,
                namespace: typeName.includes('.') ? typeName.substring(0, typeName.lastIndexOf('.')) : '',
                type: 'class', // We'll assume class for now, could be enhanced
                relationship: relationship as any,
                depth: 1,
                isSystemType: isSystem
              });
            }
          }
        }

        // Analyze incoming dependencies (what depends on this class)
        if (analysis_type === 'incoming' || analysis_type === 'bidirectional') {
          // Search for classes that reference this class
          const searchQueries = [
            targetClassName,
            targetFullName,
            `: ${targetClassName}`,
            `<${targetClassName}>`,
            `${targetClassName}[]`
          ];

          const incomingDeps = new Set<string>();

          for (const query of searchQueries) {
            try {
              const searchResults = await vectorStore!.similaritySearch(query, 20);

              for (const doc of searchResults) {
                if (doc.metadata.type === 'class' && doc.metadata.name !== targetClassName) {
                  const className = doc.metadata.name;
                  const content = doc.pageContent.toLowerCase();
                  const targetLower = targetClassName.toLowerCase();

                  // Check various dependency patterns
                  let relationship = '';
                  if (doc.metadata.baseClass && doc.metadata.baseClass.includes(targetClassName)) {
                    relationship = 'inheritance';
                  } else if (doc.metadata.interfaces && doc.metadata.interfaces.some((iface: string) => iface.includes(targetClassName))) {
                    relationship = 'interface';
                  } else if (content.includes(targetLower)) {
                    // More detailed analysis would be needed here
                    relationship = 'field';
                  }

                  if (relationship) {
                    const isSystem = isSystemType(className);
                    if (!isSystem || include_system_types) {
                      incomingDeps.add(`${className}|${relationship}`);
                    }
                  }
                }
              }
            } catch (searchError) {
              Logger.debug(`Search error for query "${query}":`, searchError);
            }
          }

          // Convert to dependency nodes
          for (const depStr of incomingDeps) {
            const [typeName, relationship] = depStr.split('|');
            if (typeName && typeName !== targetClassName) {
              const isSystem = isSystemType(typeName);
              result.incomingDependencies.push({
                name: typeName.split('.').pop() || typeName,
                fullName: typeName,
                namespace: typeName.includes('.') ? typeName.substring(0, typeName.lastIndexOf('.')) : '',
                type: 'class',
                relationship: relationship as any,
                depth: 1,
                isSystemType: isSystem
              });
            }
          }
        }

        // Analyze circular dependencies
        if (analysis_type === 'circular' || analysis_type === 'bidirectional') {
          // Simple circular dependency detection
          const outgoingNames = new Set(result.outgoingDependencies.map(dep => dep.name));
          const incomingNames = new Set(result.incomingDependencies.map(dep => dep.name));

          for (const outgoingDep of result.outgoingDependencies) {
            if (incomingNames.has(outgoingDep.name)) {
              result.circularDependencies.push({
                path: [targetClassName, outgoingDep.name, targetClassName],
                description: `Circular dependency detected between ${targetClassName} and ${outgoingDep.name}`
              });
            }
          }
        }

        // Calculate metrics
        result.metrics.totalIncoming = result.incomingDependencies.length;
        result.metrics.totalOutgoing = result.outgoingDependencies.length;

        const allDeps = [...result.incomingDependencies, ...result.outgoingDependencies];
        result.metrics.systemTypeCount = allDeps.filter(dep => dep.isSystemType).length;
        result.metrics.userTypeCount = allDeps.filter(dep => !dep.isSystemType).length;

        // Simple coupling score (0-100, higher = more coupled)
        const totalDeps = result.metrics.totalIncoming + result.metrics.totalOutgoing;
        result.metrics.couplingScore = Math.min(100, totalDeps * 5);
        result.metrics.maxDepthReached = Math.max(...allDeps.map(dep => dep.depth), 0);

        Logger.debug(`analyze_dependencies completed for ${targetClassName}: ${totalDeps} total dependencies, ${result.circularDependencies.length} circular`);

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(result, 2)
            }
          ]
        };

      } catch (error) {
        Logger.error('Error in analyze_dependencies tool:', error);
        throw new MCPServerError(
          `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorType.TOOL_EXECUTION_ERROR
        );
      }
    }
  );

  // Enhanced find_cross_references tool - Cross-Reference Analysis
  server.tool(
    "find_cross_references",
    {
      target_name: z.string().describe("Exact or partial name of the target entity to find references for"),
      target_type: z.enum(["class", "method", "field", "property", "event", "enum", "interface"]).describe("Type of entity to find references for"),
      reference_type: z.enum(["usage", "inheritance", "implementation", "declaration", "all"]).optional().default("all").describe("Type of references to find"),
      include_nested: z.boolean().optional().default(true).describe("Include references within nested types and inner classes"),
      include_system_types: z.boolean().optional().default(false).describe("Include references from Unity/System types"),
      max_results: z.number().optional().default(50).describe("Maximum number of references to return (1-200)")
    },
    async ({ target_name, target_type, reference_type = "all", include_nested = true, include_system_types = false, max_results = 50 }) => {
      try {
        ensureInitialized();
        Logger.debug(`Tool call: find_cross_references for "${target_name}" (${target_type}), reference_type: ${reference_type}, max_results: ${max_results}`);

        // Validate max_results parameter
        const validMaxResults = Math.min(Math.max(max_results, 1), 200);
        if (validMaxResults !== max_results) {
          Logger.debug(`max_results adjusted from ${max_results} to ${validMaxResults} (valid range: 1-200)`);
        }

        // Helper function to check if a type is a system type
        const isSystemType = (typeName: string): boolean => {
          if (!typeName) return false;
          const systemPrefixes = ['System.', 'UnityEngine.', 'Unity.', 'Microsoft.', 'Mono.'];
          return systemPrefixes.some(prefix => typeName.startsWith(prefix));
        };

        // Helper function to extract clean type name
        const extractTypeName = (typeStr: string): string => {
          if (!typeStr) return '';
          return typeStr.replace(/[<>\[\]]/g, '').split(',')[0].trim();
        };

        // Define the result structure
        interface CrossReferenceResult {
          target: {
            name: string;
            type: string;
            fullName: string;
            namespace: string;
            found: boolean;
          };
          references: Array<{
            referencingEntity: {
              name: string;
              type: string;
              fullName: string;
              namespace: string;
            };
            referenceContext: {
              location: string;
              lineContent: string;
              relationship: string;
            };
            isSystemType: boolean;
            isNested: boolean;
          }>;
          usagePatterns: {
            inheritanceCount: number;
            implementationCount: number;
            fieldUsageCount: number;
            methodUsageCount: number;
            parameterUsageCount: number;
            returnTypeUsageCount: number;
          };
          metadata: {
            searchTarget: string;
            targetType: string;
            referenceType: string;
            totalReferences: number;
            includeNested: boolean;
            includeSystemTypes: boolean;
            timestamp: string;
          };
        }

        // Initialize result structure
        const result: CrossReferenceResult = {
          target: {
            name: target_name,
            type: target_type,
            fullName: '',
            namespace: '',
            found: false
          },
          references: [],
          usagePatterns: {
            inheritanceCount: 0,
            implementationCount: 0,
            fieldUsageCount: 0,
            methodUsageCount: 0,
            parameterUsageCount: 0,
            returnTypeUsageCount: 0
          },
          metadata: {
            searchTarget: target_name,
            targetType: target_type,
            referenceType: reference_type,
            totalReferences: 0,
            includeNested: include_nested,
            includeSystemTypes: include_system_types,
            timestamp: new Date().toISOString()
          }
        };

        // Step 1: Find the target entity to verify it exists
        Logger.debug(`Searching for target entity: ${target_name} of type ${target_type}`);

        let targetEntity = null;
        try {
          const targetResults = await vectorStore!.searchWithFilter(target_name, { type: target_type }, 1);
          if (targetResults.length > 0) {
            targetEntity = targetResults[0];
            result.target.found = true;
            result.target.name = targetEntity.metadata.name || target_name;
            result.target.fullName = targetEntity.metadata.fullName || target_name;
            result.target.namespace = targetEntity.metadata.namespace || '';
            Logger.debug(`Target entity found: ${result.target.fullName}`);
          } else {
            // Try partial matching
            const partialResults = await vectorStore!.similaritySearch(target_name, 5);
            const matchingResults = partialResults.filter(doc =>
              doc.metadata.type === target_type &&
              (doc.metadata.name?.toLowerCase().includes(target_name.toLowerCase()) ||
               doc.metadata.fullName?.toLowerCase().includes(target_name.toLowerCase()))
            );

            if (matchingResults.length > 0) {
              targetEntity = matchingResults[0];
              result.target.found = true;
              result.target.name = targetEntity.metadata.name || target_name;
              result.target.fullName = targetEntity.metadata.fullName || target_name;
              result.target.namespace = targetEntity.metadata.namespace || '';
              Logger.debug(`Target entity found via partial match: ${result.target.fullName}`);
            }
          }
        } catch (searchError) {
          Logger.debug(`Error searching for target entity:`, searchError);
        }

        if (!result.target.found) {
          Logger.debug(`Target entity '${target_name}' of type '${target_type}' not found`);
          return {
            content: [
              {
                type: "text",
                text: safeJsonStringify({
                  error: `${target_type} '${target_name}' not found in the IL2CPP dump.`,
                  suggestions: [
                    "Try searching with a partial name",
                    "Check the spelling and case sensitivity",
                    "Use search_code tool to find available entities",
                    "Verify the target_type is correct"
                  ],
                  availableTypes: ["class", "method", "field", "property", "event", "enum", "interface"]
                }, 2)
              }
            ]
          };
        }

        // Step 2: Search for references to the target entity
        Logger.debug(`Searching for references to: ${result.target.fullName}`);

        const searchQueries = [
          result.target.name,
          result.target.fullName,
          `: ${result.target.name}`,
          `<${result.target.name}>`,
          `${result.target.name}[]`,
          `${result.target.name}(`,
          `.${result.target.name}`,
          `new ${result.target.name}`,
          `typeof(${result.target.name})`
        ];

        const foundReferences = new Map<string, any>(); // Use Map to avoid duplicates

        for (const query of searchQueries) {
          try {
            const searchResults = await vectorStore!.similaritySearch(query, Math.min(validMaxResults * 2, 100));

            for (const doc of searchResults) {
              // Skip the target entity itself
              if (doc.metadata.name === result.target.name && doc.metadata.type === target_type) {
                continue;
              }

              // Skip system types if not included
              const docIsSystemType = isSystemType(doc.metadata.fullName || doc.metadata.name || '');
              if (docIsSystemType && !include_system_types) {
                continue;
              }

              // Skip nested types if not included
              const docIsNested = !!(doc.metadata.isNested || doc.metadata.parentType);
              if (docIsNested && !include_nested) {
                continue;
              }

              const referenceKey = `${doc.metadata.fullName || doc.metadata.name}_${doc.metadata.type}`;

              if (!foundReferences.has(referenceKey)) {
                // Analyze the reference context
                const content = doc.pageContent.toLowerCase();
                const targetLower = result.target.name.toLowerCase();
                const targetFullLower = result.target.fullName.toLowerCase();

                let relationship = 'uses';
                let location = 'unknown';
                let lineContent = '';

                // Find the specific line containing the reference
                const lines = doc.pageContent.split('\n');
                const referenceLine = lines.find(line =>
                  line.toLowerCase().includes(targetLower) ||
                  line.toLowerCase().includes(targetFullLower)
                );
                lineContent = referenceLine?.trim() || '';

                // Determine relationship type based on context
                if (reference_type === 'all' || reference_type === 'inheritance') {
                  if (doc.metadata.baseClass && doc.metadata.baseClass.includes(result.target.name)) {
                    relationship = 'inherits';
                    location = 'inheritance declaration';
                    result.usagePatterns.inheritanceCount++;
                  }
                }

                if (reference_type === 'all' || reference_type === 'implementation') {
                  if (doc.metadata.interfaces && doc.metadata.interfaces.some((iface: string) => iface.includes(result.target.name))) {
                    relationship = 'implements';
                    location = 'interface implementation';
                    result.usagePatterns.implementationCount++;
                  }
                }

                if (reference_type === 'all' || reference_type === 'usage') {
                  // Check field usage
                  if (doc.metadata.fields && doc.metadata.fields.some((field: any) =>
                    extractTypeName(field.type).includes(result.target.name))) {
                    relationship = 'field_type';
                    location = 'field declaration';
                    result.usagePatterns.fieldUsageCount++;
                  }

                  // Check method usage
                  if (doc.metadata.methods) {
                    for (const method of doc.metadata.methods) {
                      // Return type usage
                      if (method.returnType && extractTypeName(method.returnType).includes(result.target.name)) {
                        relationship = 'return_type';
                        location = 'method return type';
                        result.usagePatterns.returnTypeUsageCount++;
                        break;
                      }

                      // Parameter usage
                      if (method.parameters && method.parameters.some((param: any) =>
                        extractTypeName(param.type).includes(result.target.name))) {
                        relationship = 'parameter_type';
                        location = 'method parameter';
                        result.usagePatterns.parameterUsageCount++;
                        break;
                      }
                    }
                  }

                  // General method usage (method calls, etc.)
                  if (target_type === 'method' && content.includes(targetLower)) {
                    relationship = 'method_call';
                    location = 'method invocation';
                    result.usagePatterns.methodUsageCount++;
                  }
                }

                foundReferences.set(referenceKey, {
                  referencingEntity: {
                    name: doc.metadata.name || 'Unknown',
                    type: doc.metadata.type || 'unknown',
                    fullName: doc.metadata.fullName || doc.metadata.name || 'Unknown',
                    namespace: doc.metadata.namespace || ''
                  },
                  referenceContext: {
                    location,
                    lineContent,
                    relationship
                  },
                  isSystemType: docIsSystemType,
                  isNested: docIsNested
                });
              }
            }
          } catch (searchError) {
            Logger.debug(`Search error for query "${query}":`, searchError);
          }
        }

        // Convert Map to Array and limit results
        result.references = Array.from(foundReferences.values()).slice(0, validMaxResults);
        result.metadata.totalReferences = result.references.length;

        Logger.debug(`find_cross_references completed for ${result.target.fullName}: found ${result.metadata.totalReferences} references`);

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(result, 2)
            }
          ]
        };

      } catch (error) {
        Logger.error('Error in find_cross_references tool:', error);
        throw new MCPServerError(
          `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorType.TOOL_EXECUTION_ERROR
        );
      }
    }
  );

  // Enhanced find_design_patterns tool - Design Pattern Detection
  server.tool(
    "find_design_patterns",
    {
      pattern_types: z.array(z.enum(["singleton", "observer", "factory", "strategy", "command", "state", "decorator", "adapter", "facade", "proxy", "builder", "template_method", "chain_of_responsibility", "mediator", "memento", "visitor", "flyweight", "composite", "bridge", "abstract_factory", "prototype", "iterator"])).describe("Array of design patterns to detect"),
      confidence_threshold: z.number().optional().default(0.7).describe("Minimum confidence level (0.1-1.0)"),
      include_partial_matches: z.boolean().optional().default(true).describe("Include partial pattern implementations"),
      namespace_scope: z.string().optional().describe("Limit search to specific namespace pattern"),
      exclude_unity_patterns: z.boolean().optional().default(false).describe("Exclude Unity-specific pattern implementations"),
      max_results_per_pattern: z.number().optional().default(10).describe("Maximum results per pattern type (1-50)")
    },
    async ({ pattern_types, confidence_threshold = 0.7, include_partial_matches = true, namespace_scope, exclude_unity_patterns = false, max_results_per_pattern = 10 }) => {
      try {
        ensureInitialized();
        Logger.debug(`Tool call: find_design_patterns for patterns: [${pattern_types.join(', ')}], confidence: ${confidence_threshold}`);

        // Validate parameters
        const validConfidence = Math.min(Math.max(confidence_threshold, 0.1), 1.0);
        const validMaxResults = Math.min(Math.max(max_results_per_pattern, 1), 50);

        if (validConfidence !== confidence_threshold) {
          Logger.debug(`Confidence threshold adjusted from ${confidence_threshold} to ${validConfidence} (valid range: 0.1-1.0)`);
        }
        if (validMaxResults !== max_results_per_pattern) {
          Logger.debug(`Max results adjusted from ${max_results_per_pattern} to ${validMaxResults} (valid range: 1-50)`);
        }

        // Helper function to check if a type is a Unity system type
        const isUnitySystemType = (typeName: string): boolean => {
          if (!typeName) return false;
          const unityPrefixes = ['UnityEngine.', 'Unity.', 'UnityEditor.'];
          return unityPrefixes.some(prefix => typeName.startsWith(prefix));
        };

        // Helper function to extract clean type name
        const extractTypeName = (typeStr: string): string => {
          if (!typeStr) return '';
          return typeStr.replace(/[<>\[\]]/g, '').split(',')[0].trim();
        };

        // Define the result structure
        interface DesignPatternMatch {
          patternType: string;
          className: string;
          fullName: string;
          namespace: string;
          confidence: number;
          isPartialMatch: boolean;
          evidence: {
            structuralMatches: string[];
            behavioralMatches: string[];
            namingMatches: string[];
            relationshipMatches: string[];
          };
          implementation: {
            keyMethods: string[];
            keyFields: string[];
            interfaces: string[];
            baseClass?: string;
          };
          suggestions: string[];
          isUnitySpecific: boolean;
        }

        interface DesignPatternAnalysisResult {
          detectedPatterns: {
            [patternType: string]: DesignPatternMatch[];
          };
          summary: {
            totalPatternsFound: number;
            patternTypeCount: number;
            averageConfidence: number;
            mostCommonPattern: string;
            architecturalInsights: string[];
          };
          metadata: {
            searchedPatterns: string[];
            confidenceThreshold: number;
            includePartialMatches: boolean;
            namespaceScope?: string;
            excludeUnityPatterns: boolean;
            timestamp: string;
          };
        }

        // Initialize result structure
        const result: DesignPatternAnalysisResult = {
          detectedPatterns: {},
          summary: {
            totalPatternsFound: 0,
            patternTypeCount: 0,
            averageConfidence: 0,
            mostCommonPattern: '',
            architecturalInsights: []
          },
          metadata: {
            searchedPatterns: pattern_types,
            confidenceThreshold: validConfidence,
            includePartialMatches: include_partial_matches,
            namespaceScope: namespace_scope,
            excludeUnityPatterns: exclude_unity_patterns,
            timestamp: new Date().toISOString()
          }
        };

        // Initialize pattern result arrays
        pattern_types.forEach(pattern => {
          result.detectedPatterns[pattern] = [];
        });

        Logger.debug(`Starting design pattern analysis for ${pattern_types.length} pattern types`);

        // Get all classes for analysis
        const allClassesResults = await vectorStore!.searchWithFilter("", { type: 'class' }, 500);
        Logger.debug(`Analyzing ${allClassesResults.length} classes for design patterns`);

        // Pattern detection functions
        const detectSingleton = async (classes: any[]): Promise<DesignPatternMatch[]> => {
          const matches: DesignPatternMatch[] = [];

          for (const classDoc of classes) {
            const className = classDoc.metadata.name;
            const content = classDoc.pageContent.toLowerCase();
            const methods = classDoc.metadata.methods || [];
            const fields = classDoc.metadata.fields || [];

            let confidence = 0;
            const evidence = {
              structuralMatches: [] as string[],
              behavioralMatches: [] as string[],
              namingMatches: [] as string[],
              relationshipMatches: [] as string[]
            };

            // Check for singleton naming patterns
            if (className.toLowerCase().includes('singleton') ||
                className.toLowerCase().includes('manager') ||
                className.toLowerCase().includes('instance')) {
              confidence += 0.2;
              evidence.namingMatches.push('Singleton naming pattern detected');
            }

            // Check for static instance field
            const hasStaticInstance = fields.some((field: any) =>
              field.isStatic &&
              (field.name.toLowerCase().includes('instance') ||
               field.name.toLowerCase().includes('_instance') ||
               field.type === className)
            );
            if (hasStaticInstance) {
              confidence += 0.3;
              evidence.structuralMatches.push('Static instance field found');
            }

            // Check for private constructor
            const hasPrivateConstructor = methods.some((method: any) =>
              method.name === '.ctor' && !method.isPublic
            );
            if (hasPrivateConstructor) {
              confidence += 0.2;
              evidence.structuralMatches.push('Private constructor detected');
            }

            // Check for getInstance method
            const hasGetInstanceMethod = methods.some((method: any) =>
              method.isStatic && method.isPublic &&
              (method.name.toLowerCase().includes('getinstance') ||
               method.name.toLowerCase().includes('get_instance') ||
               method.name.toLowerCase().includes('instance'))
            );
            if (hasGetInstanceMethod) {
              confidence += 0.3;
              evidence.behavioralMatches.push('GetInstance method pattern found');
            }

            // Check for lazy initialization patterns
            if (content.includes('lazy') || content.includes('null') && hasStaticInstance) {
              confidence += 0.1;
              evidence.behavioralMatches.push('Lazy initialization pattern detected');
            }

            if (confidence >= validConfidence) {
              const isUnity = isUnitySystemType(classDoc.metadata.fullName || className);
              if (!exclude_unity_patterns || !isUnity) {
                matches.push({
                  patternType: 'singleton',
                  className,
                  fullName: classDoc.metadata.fullName || className,
                  namespace: classDoc.metadata.namespace || '',
                  confidence: Math.min(confidence, 1.0),
                  isPartialMatch: confidence < 0.8,
                  evidence,
                  implementation: {
                    keyMethods: methods.filter((m: any) =>
                      m.isStatic || m.name === '.ctor'
                    ).map((m: any) => m.name),
                    keyFields: fields.filter((f: any) =>
                      f.isStatic && f.name.toLowerCase().includes('instance')
                    ).map((f: any) => f.name),
                    interfaces: classDoc.metadata.interfaces || [],
                    baseClass: classDoc.metadata.baseClass
                  },
                  suggestions: [
                    confidence < 0.8 ? 'Consider making constructor private' : '',
                    !hasGetInstanceMethod ? 'Add public static GetInstance() method' : '',
                    'Ensure thread safety for multi-threaded environments'
                  ].filter(Boolean),
                  isUnitySpecific: isUnity
                });
              }
            }
          }

          return matches.slice(0, validMaxResults);
        };

        const detectObserver = async (classes: any[]): Promise<DesignPatternMatch[]> => {
          const matches: DesignPatternMatch[] = [];

          for (const classDoc of classes) {
            const className = classDoc.metadata.name;
            const content = classDoc.pageContent.toLowerCase();
            const methods = classDoc.metadata.methods || [];
            const fields = classDoc.metadata.fields || [];
            const interfaces = classDoc.metadata.interfaces || [];

            let confidence = 0;
            const evidence = {
              structuralMatches: [] as string[],
              behavioralMatches: [] as string[],
              namingMatches: [] as string[],
              relationshipMatches: [] as string[]
            };

            // Check for observer naming patterns
            if (className.toLowerCase().includes('observer') ||
                className.toLowerCase().includes('listener') ||
                className.toLowerCase().includes('subscriber') ||
                className.toLowerCase().includes('watcher')) {
              confidence += 0.2;
              evidence.namingMatches.push('Observer naming pattern detected');
            }

            // Check for event/delegate fields
            const hasEventFields = fields.some((field: any) =>
              field.type.toLowerCase().includes('event') ||
              field.type.toLowerCase().includes('action') ||
              field.type.toLowerCase().includes('func') ||
              field.type.toLowerCase().includes('delegate')
            );
            if (hasEventFields) {
              confidence += 0.3;
              evidence.structuralMatches.push('Event/delegate fields found');
            }

            // Check for notification methods
            const hasNotifyMethods = methods.some((method: any) =>
              method.name.toLowerCase().includes('notify') ||
              method.name.toLowerCase().includes('update') ||
              method.name.toLowerCase().includes('onchange') ||
              method.name.toLowerCase().includes('trigger')
            );
            if (hasNotifyMethods) {
              confidence += 0.2;
              evidence.behavioralMatches.push('Notification methods found');
            }

            // Check for subscribe/unsubscribe methods
            const hasSubscriptionMethods = methods.some((method: any) =>
              method.name.toLowerCase().includes('subscribe') ||
              method.name.toLowerCase().includes('unsubscribe') ||
              method.name.toLowerCase().includes('addlistener') ||
              method.name.toLowerCase().includes('removelistener')
            );
            if (hasSubscriptionMethods) {
              confidence += 0.3;
              evidence.behavioralMatches.push('Subscription management methods found');
            }

            // Check for observer interface implementation
            const implementsObserverInterface = interfaces.some((iface: string) =>
              iface.toLowerCase().includes('observer') ||
              iface.toLowerCase().includes('listener') ||
              iface.toLowerCase().includes('inotify')
            );
            if (implementsObserverInterface) {
              confidence += 0.2;
              evidence.relationshipMatches.push('Observer interface implementation detected');
            }

            if (confidence >= validConfidence) {
              const isUnity = isUnitySystemType(classDoc.metadata.fullName || className);
              if (!exclude_unity_patterns || !isUnity) {
                matches.push({
                  patternType: 'observer',
                  className,
                  fullName: classDoc.metadata.fullName || className,
                  namespace: classDoc.metadata.namespace || '',
                  confidence: Math.min(confidence, 1.0),
                  isPartialMatch: confidence < 0.8,
                  evidence,
                  implementation: {
                    keyMethods: methods.filter((m: any) =>
                      m.name.toLowerCase().includes('notify') ||
                      m.name.toLowerCase().includes('subscribe') ||
                      m.name.toLowerCase().includes('update')
                    ).map((m: any) => m.name),
                    keyFields: fields.filter((f: any) =>
                      f.type.toLowerCase().includes('event') ||
                      f.type.toLowerCase().includes('action')
                    ).map((f: any) => f.name),
                    interfaces: interfaces,
                    baseClass: classDoc.metadata.baseClass
                  },
                  suggestions: [
                    !hasSubscriptionMethods ? 'Add Subscribe/Unsubscribe methods' : '',
                    !hasNotifyMethods ? 'Add notification methods for state changes' : '',
                    'Consider using weak references to prevent memory leaks'
                  ].filter(Boolean),
                  isUnitySpecific: isUnity
                });
              }
            }
          }

          return matches.slice(0, validMaxResults);
        };

        // Execute pattern detection based on requested patterns
        for (const patternType of pattern_types) {
          try {
            let matches: DesignPatternMatch[] = [];

            switch (patternType) {
              case 'singleton':
                matches = await detectSingleton(allClassesResults);
                break;
              case 'observer':
                matches = await detectObserver(allClassesResults);
                break;
              // Add more pattern detection cases here
              default:
                Logger.debug(`Pattern detection for '${patternType}' not yet implemented`);
                continue;
            }

            // Apply namespace filtering if specified
            if (namespace_scope) {
              matches = matches.filter(match =>
                match.namespace.toLowerCase().includes(namespace_scope.toLowerCase()) ||
                match.fullName.toLowerCase().includes(namespace_scope.toLowerCase())
              );
            }

            // Filter partial matches if not included
            if (!include_partial_matches) {
              matches = matches.filter(match => !match.isPartialMatch);
            }

            result.detectedPatterns[patternType] = matches;
            Logger.debug(`Found ${matches.length} ${patternType} pattern matches`);

          } catch (patternError) {
            Logger.error(`Error detecting ${patternType} pattern:`, patternError);
            result.detectedPatterns[patternType] = [];
          }
        }

        // Calculate summary statistics
        const allMatches = Object.values(result.detectedPatterns).flat();
        result.summary.totalPatternsFound = allMatches.length;
        result.summary.patternTypeCount = Object.keys(result.detectedPatterns).filter(
          pattern => result.detectedPatterns[pattern].length > 0
        ).length;

        if (allMatches.length > 0) {
          result.summary.averageConfidence = allMatches.reduce((sum, match) => sum + match.confidence, 0) / allMatches.length;

          // Find most common pattern
          const patternCounts = Object.entries(result.detectedPatterns).map(([pattern, matches]) => ({
            pattern,
            count: matches.length
          }));
          patternCounts.sort((a, b) => b.count - a.count);
          result.summary.mostCommonPattern = patternCounts[0]?.pattern || 'none';

          // Generate architectural insights
          result.summary.architecturalInsights = [
            `Found ${result.summary.totalPatternsFound} design pattern implementations across ${result.summary.patternTypeCount} pattern types`,
            `Average confidence score: ${result.summary.averageConfidence.toFixed(2)}`,
            result.summary.mostCommonPattern !== 'none' ? `Most common pattern: ${result.summary.mostCommonPattern}` : 'No dominant pattern detected',
            allMatches.some(m => m.isUnitySpecific) ? 'Unity-specific pattern implementations detected' : 'No Unity-specific patterns found'
          ];
        } else {
          result.summary.architecturalInsights = [
            'No design patterns detected with the specified criteria',
            'Consider lowering the confidence threshold or enabling partial matches',
            'The codebase may use different architectural patterns not covered by this analysis'
          ];
        }

        Logger.debug(`find_design_patterns completed: found ${result.summary.totalPatternsFound} patterns across ${result.summary.patternTypeCount} types`);

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(result, 2)
            }
          ]
        };

      } catch (error) {
        Logger.error('Error in find_design_patterns tool:', error);
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
