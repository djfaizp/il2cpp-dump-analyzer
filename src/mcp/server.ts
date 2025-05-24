import express, { Request, Response } from 'express';
import { 
  MCPMetadata, 
  MCPRetrievalRequest, 
  MCPRetrievalResponse, 
  MCPErrorResponse,
  MCPToolsResponse,
  MCPToolCallRequest,
  MCPToolCallResponse
} from './types';
import { IL2CPPVectorStore } from '../embeddings/vector-store';
import { Document } from '@langchain/core/documents';

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
 * Start the MCP server
 * @param port Port to listen on
 * @param host Host to bind to
 */
export function startMcpServer(port: number, host: string): void {
  const app = express();
  
  // Middleware for parsing JSON
  app.use(express.json());
  
  // Metadata endpoint
  app.get('/metadata', (req: Request, res: Response) => {
    const metadata: MCPMetadata = {
      name: 'IL2CPP Dump Analyzer',
      description: 'A specialized RAG system for analyzing IL2CPP dump.cs files from Unity games',
      schema_version: '1.0',
      human_can_retrieve: true,
      retrieval_options: {
        top_k: {
          type: 'integer',
          description: 'Number of results to return',
          required: false,
          default: 5
        },
        filter_type: {
          type: 'string',
          description: 'Filter results by entity type (class, method, enum, interface)',
          required: false
        },
        filter_namespace: {
          type: 'string',
          description: 'Filter results by namespace',
          required: false
        },
        filter_monobehaviour: {
          type: 'boolean',
          description: 'Filter results to only include MonoBehaviour classes',
          required: false,
          default: false
        }
      }
    };
    
    res.json(metadata);
  });
  
  // Retrieval endpoint
  app.post('/retrieve', async (req: Request, res: Response) => {
    try {
      if (!vectorStore) {
        const error: MCPErrorResponse = {
          error: {
            message: 'Vector store not initialized',
            type: 'server_error'
          }
        };
        return res.status(500).json(error);
      }
      
      const retrievalRequest = req.body as MCPRetrievalRequest;
      
      if (!retrievalRequest.query) {
        const error: MCPErrorResponse = {
          error: {
            message: 'Query is required',
            type: 'invalid_request_error',
            param: 'query'
          }
        };
        return res.status(400).json(error);
      }
      
      // Extract options
      const options = retrievalRequest.options || {};
      const topK = options.top_k || 5;
      
      // Build filter
      const filter: Record<string, any> = {};
      
      if (options.filter_type) {
        filter.type = options.filter_type;
      }
      
      if (options.filter_namespace) {
        filter.namespace = options.filter_namespace;
      }
      
      if (options.filter_monobehaviour) {
        filter.isMonoBehaviour = true;
      }
      
      // Perform search
      let results: Document[] = [];
      
      if (Object.keys(filter).length > 0) {
        results = await vectorStore.searchWithFilter(retrievalRequest.query, filter, topK);
      } else {
        results = await vectorStore.similaritySearch(retrievalRequest.query, topK);
      }
      
      // Format response
      const response: MCPRetrievalResponse = {
        documents: results.map(doc => ({
          content: doc.pageContent,
          metadata: doc.metadata
        }))
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error in /retrieve:', error);
      
      const errorResponse: MCPErrorResponse = {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'server_error'
        }
      };
      
      res.status(500).json(errorResponse);
    }
  });
  
  // Tools endpoint
  app.get('/tools', (req: Request, res: Response) => {
    const toolsResponse: MCPToolsResponse = {
      tools: [
        {
          name: 'search_code',
          description: 'Search for code in the IL2CPP dump',
          input_schema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query'
              },
              filter_type: {
                type: 'string',
                description: 'Filter by entity type (class, method, enum, interface)'
              },
              top_k: {
                type: 'integer',
                description: 'Number of results to return'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'find_monobehaviours',
          description: 'Find MonoBehaviour classes in the IL2CPP dump',
          input_schema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Optional search query to filter MonoBehaviours'
              },
              top_k: {
                type: 'integer',
                description: 'Number of results to return'
              }
            },
            required: []
          }
        }
      ]
    };
    
    res.json(toolsResponse);
  });
  
  // Tool call endpoint
  app.post('/tools/:tool_name', async (req: Request, res: Response) => {
    try {
      if (!vectorStore) {
        const error: MCPErrorResponse = {
          error: {
            message: 'Vector store not initialized',
            type: 'server_error'
          }
        };
        return res.status(500).json(error);
      }
      
      const toolName = req.params.tool_name;
      const toolCallRequest = req.body as MCPToolCallRequest;
      
      let response: MCPToolCallResponse;
      
      switch (toolName) {
        case 'search_code':
          response = await handleSearchCodeTool(toolCallRequest, vectorStore);
          break;
        case 'find_monobehaviours':
          response = await handleFindMonoBehavioursTool(toolCallRequest, vectorStore);
          break;
        default:
          const error: MCPErrorResponse = {
            error: {
              message: `Unknown tool: ${toolName}`,
              type: 'invalid_request_error',
              param: 'tool_name'
            }
          };
          return res.status(400).json(error);
      }
      
      res.json(response);
    } catch (error) {
      console.error(`Error in /tools/${req.params.tool_name}:`, error);
      
      const errorResponse: MCPErrorResponse = {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'server_error'
        }
      };
      
      res.status(500).json(errorResponse);
    }
  });
  
  // Start the server
  app.listen(port, host, () => {
    console.log(`MCP server listening at http://${host}:${port}`);
  });
}

/**
 * Handle the search_code tool call
 * @param request Tool call request
 * @param store Vector store instance
 * @returns Tool call response
 */
async function handleSearchCodeTool(
  request: MCPToolCallRequest,
  store: IL2CPPVectorStore
): Promise<MCPToolCallResponse> {
  const query = request.arguments.query as string;
  const filterType = request.arguments.filter_type as string | undefined;
  const topK = request.arguments.top_k as number || 5;
  
  const filter: Record<string, any> = {};
  if (filterType) {
    filter.type = filterType;
  }
  
  let results: Document[];
  if (Object.keys(filter).length > 0) {
    results = await store.searchWithFilter(query, filter, topK);
  } else {
    results = await store.similaritySearch(query, topK);
  }
  
  // Format the results
  const formattedResults = results.map(doc => ({
    content: doc.pageContent,
    type: doc.metadata.type,
    name: doc.metadata.name,
    namespace: doc.metadata.namespace,
    fullName: doc.metadata.fullName
  }));
  
  return {
    content: JSON.stringify(formattedResults, null, 2),
    metadata: {
      result_count: results.length,
      query: query,
      filter_type: filterType
    }
  };
}

/**
 * Handle the find_monobehaviours tool call
 * @param request Tool call request
 * @param store Vector store instance
 * @returns Tool call response
 */
async function handleFindMonoBehavioursTool(
  request: MCPToolCallRequest,
  store: IL2CPPVectorStore
): Promise<MCPToolCallResponse> {
  const query = request.arguments.query as string || '';
  const topK = request.arguments.top_k as number || 10;
  
  const filter = {
    type: 'class',
    isMonoBehaviour: true
  };
  
  const results = await store.searchWithFilter(query, filter, topK);
  
  // Format the results
  const formattedResults = results.map(doc => ({
    content: doc.pageContent,
    name: doc.metadata.name,
    namespace: doc.metadata.namespace,
    fullName: doc.metadata.fullName
  }));
  
  return {
    content: JSON.stringify(formattedResults, null, 2),
    metadata: {
      result_count: results.length,
      query: query || 'All MonoBehaviours'
    }
  };
}
