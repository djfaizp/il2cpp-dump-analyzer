import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { IL2CPPVectorStore } from '../embeddings/vector-store';
import { Document } from '@langchain/core/documents';
import express from 'express';
import { randomUUID } from 'crypto';

// Global vector store instance
let vectorStore: IL2CPPVectorStore | null = null;

/**
 * Initialize the MCP server with a vector store
 * @param store Vector store instance
 */
export function initializeVectorStore(store: IL2CPPVectorStore): void {
  vectorStore = store;
}

/**
 * Create and configure the MCP server
 * @returns Configured MCP server
 */
function createMcpServer(): McpServer {
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
        "Enum value retrieval"
      ],
      supportedGameEngines: ["Unity"],
      supportedLanguages: ["C#"],
      author: "IL2CPP Dump Analyzer Team"
    }
  });

  // Add IL2CPP code search resource
  server.resource(
    "il2cpp-code",
    new ResourceTemplate("il2cpp://{query}", { list: undefined }),
    async (uri, { query }) => {
      if (!vectorStore) {
        throw new Error("Vector store not initialized");
      }

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

      // Perform search
      let results: Document[];
      if (Object.keys(filter).length > 0) {
        results = await vectorStore.searchWithFilter(queryString, filter, topK);
      } else {
        results = await vectorStore.similaritySearch(queryString, topK);
      }

      // Format response
      return {
        contents: results.map(doc => ({
          uri: `il2cpp://${encodeURIComponent(doc.metadata.fullName || doc.metadata.name)}`,
          text: doc.pageContent,
          metadata: doc.metadata
        }))
      };
    }
  );

  // Add search_code tool
  server.tool(
    "search_code",
    {
      query: z.string().describe("The search query"),
      filter_type: z.string().optional().describe("Filter by entity type (class, method, enum, interface)"),
      top_k: z.number().optional().describe("Number of results to return")
    },
    async ({ query, filter_type, top_k = 5 }) => {
      if (!vectorStore) {
        throw new Error("Vector store not initialized");
      }

      const filter: Record<string, any> = {};
      if (filter_type) {
        filter.type = filter_type;
      }

      // Ensure query is a string (not an array)
      const queryString = Array.isArray(query) ? query[0] : query;

      let results: Document[];
      if (Object.keys(filter).length > 0) {
        results = await vectorStore.searchWithFilter(queryString, filter, top_k);
      } else {
        results = await vectorStore.similaritySearch(queryString, top_k);
      }

      // Format the results
      const formattedResults = results.map(doc => ({
        content: doc.pageContent,
        name: doc.metadata.name,
        namespace: doc.metadata.namespace,
        fullName: doc.metadata.fullName,
        type: doc.metadata.type
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedResults, null, 2)
          }
        ]
      };
    }
  );

  // Add find_monobehaviours tool
  server.tool(
    "find_monobehaviours",
    {
      query: z.string().optional().describe("Optional search query to filter MonoBehaviours"),
      top_k: z.number().optional().describe("Number of results to return")
    },
    async ({ query = "", top_k = 10 }) => {
      if (!vectorStore) {
        throw new Error("Vector store not initialized");
      }

      const filter = {
        type: 'class',
        isMonoBehaviour: true
      };

      // Ensure query is a string (not an array)
      const queryString = Array.isArray(query) ? query[0] : query;

      const results = await vectorStore.searchWithFilter(queryString, filter, top_k);

      // Format the results
      const formattedResults = results.map(doc => ({
        content: doc.pageContent,
        name: doc.metadata.name,
        namespace: doc.metadata.namespace,
        fullName: doc.metadata.fullName
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedResults, null, 2)
          }
        ]
      };
    }
  );

  // Add find_class_hierarchy tool
  server.tool(
    "find_class_hierarchy",
    {
      class_name: z.string().describe("The name of the class to find hierarchy for"),
      include_methods: z.boolean().optional().describe("Whether to include methods in the output")
    },
    async ({ class_name, include_methods = true }) => {
      if (!vectorStore) {
        throw new Error("Vector store not initialized");
      }

      // First find the class
      const classResults = await vectorStore.searchWithFilter(class_name, { type: 'class' }, 1);

      if (classResults.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Class '${class_name}' not found in the IL2CPP dump.`
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
      }

      const hierarchyInfo: HierarchyInfo = {
        name: className,
        namespace: classDoc.metadata.namespace,
        fullName: classDoc.metadata.fullName,
        baseClass: baseClass,
        interfaces: classDoc.metadata.interfaces || [],
        isMonoBehaviour: classDoc.metadata.isMonoBehaviour || false
      };

      // If methods are requested, find them
      if (include_methods) {
        const methodResults = await vectorStore.searchWithFilter("", {
          type: 'method',
          parentClass: className
        }, 50);

        hierarchyInfo.methods = methodResults.map(doc => ({
          name: doc.metadata.name,
          returnType: doc.metadata.returnType,
          parameters: doc.metadata.parameters || '',
          isStatic: !!doc.metadata.isStatic,
          isVirtual: !!doc.metadata.isVirtual,
          isOverride: !!doc.metadata.isOverride
        }));
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(hierarchyInfo, null, 2)
          }
        ]
      };
    }
  );

  // Add find_enum_values tool
  server.tool(
    "find_enum_values",
    {
      enum_name: z.string().describe("The name of the enum to find values for")
    },
    async ({ enum_name }) => {
      if (!vectorStore) {
        throw new Error("Vector store not initialized");
      }

      // Find the enum
      const enumResults = await vectorStore.searchWithFilter(enum_name, { type: 'enum' }, 1);

      if (enumResults.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Enum '${enum_name}' not found in the IL2CPP dump.`
            }
          ]
        };
      }

      const enumDoc = enumResults[0];

      // Extract enum values from the content
      const content = enumDoc.pageContent;
      const lines = content.split('\n');
      const valueLines = lines.filter(line => line.includes('='));

      const enumValues = valueLines.map(line => {
        const trimmed = line.trim();
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const name = parts[0].trim();
          const value = parts[1].replace(',', '').trim();
          return { name, value };
        }
        return null;
      }).filter(Boolean);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: enumDoc.metadata.name,
              namespace: enumDoc.metadata.namespace,
              fullName: enumDoc.metadata.fullName,
              values: enumValues
            }, null, 2)
          }
        ]
      };
    }
  );

  return server;
}

/**
 * Start the MCP server with stdio transport (for command-line tools)
 */
export async function startMcpStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("MCP server started with stdio transport");
}

/**
 * Start the MCP server with HTTP transport
 * @param port Port to listen on
 * @param host Host to bind to
 */
export async function startMcpHttpServer(port: number, host: string): Promise<void> {
  const app = express();
  app.use(express.json());

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  // Handle POST requests for client-to-server communication
  app.post('/mcp', async (req, res) => {
    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else {
        // New session
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID
            transports[sessionId] = transport;
          }
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        const server = createMcpServer();
        await server.connect(transport);
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Reusable handler for GET and DELETE requests
  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', handleSessionRequest);

  // Handle DELETE requests for session termination
  app.delete('/mcp', handleSessionRequest);

  // Start the server
  app.listen(port, host, () => {
    console.log(`MCP server listening at http://${host}:${port}/mcp`);
  });
}
