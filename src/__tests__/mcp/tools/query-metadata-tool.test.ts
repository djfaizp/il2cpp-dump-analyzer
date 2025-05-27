/**
 * @fileoverview Unit tests for Query Metadata MCP Tool
 *
 * Tests the query_metadata MCP tool functionality including:
 * - Advanced metadata querying with complex filters
 * - SQL-like query syntax and structured filters
 * - Aggregations (count, group by, statistics)
 * - Cross-reference queries between different metadata types
 * - Complex boolean logic (AND, OR, NOT)
 * - Error handling and edge cases
 *
 * Follows TFD methodology with comprehensive test coverage.
 */

import { createQueryMetadataTool } from '../../../mcp/tools/query-metadata-tool';
import { ToolExecutionContext } from '../../../mcp/base-tool-handler';
import { IL2CPPVectorStore } from '../../../embeddings/vector-store';
import { Document } from '@langchain/core/documents';
import { MCPServerError } from '../../../mcp/error-types';

// Mock MCP server
const mockServer = {
  tool: jest.fn()
};

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock vector store
const mockVectorStore = {
  searchWithFilter: jest.fn(),
  similaritySearch: jest.fn()
} as unknown as IL2CPPVectorStore;

// Mock context
const mockContext: ToolExecutionContext = {
  vectorStore: mockVectorStore,
  logger: mockLogger,
  isInitialized: () => true
};

// Sample metadata documents for testing
const sampleMetadataDocuments: Document[] = [
  new Document({
    pageContent: `// Assembly: Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null
// Unity: 2022.3.15f1
// Platform: StandaloneWindows64`,
    metadata: {
      type: 'assembly',
      name: 'Assembly-CSharp',
      version: '0.0.0.0',
      culture: 'neutral',
      unityVersion: '2022.3.15f1',
      platform: 'StandaloneWindows64',
      typeCount: 150
    }
  }),
  new Document({
    pageContent: `namespace Game.Player {
    public class PlayerController : MonoBehaviour {
        public int health = 100;
        public float speed = 5.0f;
    }
}`,
    metadata: {
      type: 'class',
      name: 'PlayerController',
      namespace: 'Game.Player',
      baseClass: 'MonoBehaviour',
      isMonoBehaviour: true,
      assembly: 'Assembly-CSharp',
      fieldCount: 2,
      methodCount: 5
    }
  }),
  new Document({
    pageContent: `namespace Game.Enemies {
    public class EnemyController : MonoBehaviour {
        public int health = 50;
        public float speed = 3.0f;
    }
}`,
    metadata: {
      type: 'class',
      name: 'EnemyController',
      namespace: 'Game.Enemies',
      baseClass: 'MonoBehaviour',
      isMonoBehaviour: true,
      assembly: 'Assembly-CSharp',
      fieldCount: 2,
      methodCount: 4
    }
  }),
  new Document({
    pageContent: `namespace Game.Utilities {
    public class GameManager<T> where T : class {
        private List<T> items;
    }
}`,
    metadata: {
      type: 'class',
      name: 'GameManager',
      namespace: 'Game.Utilities',
      genericParameters: ['T'],
      constraints: ['where T : class'],
      assembly: 'Assembly-CSharp',
      fieldCount: 1,
      methodCount: 8
    }
  })
];

describe('QueryMetadataTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVectorStore.searchWithFilter = jest.fn().mockResolvedValue(sampleMetadataDocuments);
    mockVectorStore.similaritySearch = jest.fn().mockResolvedValue(sampleMetadataDocuments);
  });

  // Helper function to parse MCP response
  const parseMCPResponse = (mcpResult: any) => {
    return JSON.parse(mcpResult.content[0].text);
  };

  describe('Tool Registration', () => {
    it('should register the query_metadata tool correctly', () => {
      createQueryMetadataTool(mockServer, mockContext);

      expect(mockServer.tool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'query_metadata',
          description: expect.stringContaining('Advanced metadata querying')
        }),
        expect.any(Function)
      );
    });
  });

  describe('Basic Querying', () => {
    let toolHandler: any;

    beforeEach(() => {
      createQueryMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should execute basic metadata query', async () => {
      const params = {
        query: 'SELECT * FROM metadata WHERE type = "class"'
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
      expect(parsedResult).toHaveProperty('queryMetadata');
      expect(parsedResult.queryMetadata.originalQuery).toBe(params.query);
    });

    it('should support structured filter queries', async () => {
      const params = {
        filters: {
          type: 'class',
          isMonoBehaviour: true
        }
      };

      // Mock filtered results to only include MonoBehaviour classes
      const filteredResults = sampleMetadataDocuments.filter(doc =>
        doc.metadata.type === 'class' && doc.metadata.isMonoBehaviour === true
      );
      mockVectorStore.searchWithFilter = jest.fn().mockResolvedValue(filteredResults);

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
      expect(parsedResult.results.every((r: any) => r.metadata.isMonoBehaviour)).toBe(true);
    });
  });

  describe('Aggregation Queries', () => {
    let toolHandler: any;

    beforeEach(() => {
      createQueryMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should support COUNT aggregation', async () => {
      const params = {
        query: 'SELECT COUNT(*) FROM metadata WHERE type = "class"',
        aggregations: ['count']
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('aggregations');
      expect(parsedResult.aggregations).toHaveProperty('count');
    });

    it('should support GROUP BY aggregation', async () => {
      const params = {
        filters: { type: 'class' }, // Add required filters
        aggregations: ['group_by'],
        group_by_field: 'namespace'
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('aggregations');
      expect(parsedResult.aggregations).toHaveProperty('groupBy');
    });

    it('should support statistical aggregations', async () => {
      const params = {
        filters: { type: 'class' }, // Add required filters
        aggregations: ['statistics'],
        statistics_field: 'fieldCount'
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('aggregations');
      expect(parsedResult.aggregations).toHaveProperty('statistics');
      expect(parsedResult.aggregations.statistics).toHaveProperty('average');
      expect(parsedResult.aggregations.statistics).toHaveProperty('min');
      expect(parsedResult.aggregations.statistics).toHaveProperty('max');
    });
  });

  describe('Complex Boolean Logic', () => {
    let toolHandler: any;

    beforeEach(() => {
      createQueryMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should support AND logic', async () => {
      const params = {
        filters: {
          AND: [
            { type: 'class' },
            { isMonoBehaviour: true }
          ]
        }
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult.results.every((r: any) =>
        r.metadata.type === 'class' && r.metadata.isMonoBehaviour
      )).toBe(true);
    });

    it('should support OR logic', async () => {
      const params = {
        filters: {
          OR: [
            { namespace: 'Game.Player' },
            { namespace: 'Game.Enemies' }
          ]
        }
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult.results.every((r: any) =>
        r.metadata.namespace === 'Game.Player' || r.metadata.namespace === 'Game.Enemies'
      )).toBe(true);
    });

    it('should support NOT logic', async () => {
      const params = {
        filters: {
          NOT: { type: 'assembly' }
        }
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult.results.every((r: any) => r.metadata.type !== 'assembly')).toBe(true);
    });
  });

  describe('Cross-Reference Queries', () => {
    let toolHandler: any;

    beforeEach(() => {
      createQueryMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should support cross-reference between assemblies and types', async () => {
      const params = {
        filters: {}, // Add empty filters to satisfy validation
        cross_reference: {
          from: 'assembly',
          to: 'class',
          relationship: 'contains'
        }
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('crossReferences');
      expect(parsedResult.crossReferences).toHaveProperty('relationships');
    });
  });

  describe('Error Handling', () => {
    let toolHandler: any;

    beforeEach(() => {
      createQueryMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should handle invalid SQL syntax', async () => {
      const params = {
        query: 'INVALID SQL SYNTAX'
      };

      await expect(toolHandler(params)).rejects.toThrow(MCPServerError);
    });

    it('should handle vector store errors gracefully', async () => {
      mockVectorStore.searchWithFilter = jest.fn().mockRejectedValue(new Error('Vector store error'));

      const params = {
        filters: { type: 'class' }
      };

      await expect(toolHandler(params)).rejects.toThrow(MCPServerError);
    });
  });

  describe('Performance and Edge Cases', () => {
    let toolHandler: any;

    beforeEach(() => {
      createQueryMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should handle empty query results', async () => {
      mockVectorStore.searchWithFilter = jest.fn().mockResolvedValue([]);

      const params = {
        filters: { type: 'nonexistent' }
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult.results).toHaveLength(0);
    });

    it('should handle complex nested queries', async () => {
      const params = {
        filters: {
          AND: [
            { type: 'class' },
            {
              OR: [
                { namespace: 'Game.Player' },
                {
                  AND: [
                    { namespace: 'Game.Utilities' },
                    { genericParameters: { $exists: true } }
                  ]
                }
              ]
            }
          ]
        }
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
    });
  });
});
