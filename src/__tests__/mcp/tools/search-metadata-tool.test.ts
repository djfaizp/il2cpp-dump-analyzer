/**
 * @fileoverview Unit tests for Search Metadata MCP Tool
 *
 * Tests the search_metadata MCP tool functionality including:
 * - Basic metadata search with various filter types
 * - Assembly metadata search by name, version, culture
 * - Type metadata search by namespace, generic parameters
 * - Build information search by Unity version, platform
 * - Regex pattern matching and fuzzy search
 * - Error handling and edge cases
 *
 * Follows TFD methodology with comprehensive test coverage.
 */

import { createSearchMetadataTool } from '../../../mcp/tools/search-metadata-tool';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../../../mcp/base-tool-handler';
import { IL2CPPVectorStore } from '../../../embeddings/vector-store';
import { Document } from '@langchain/core/documents';
import { MCPServerError, ErrorType } from '../../../mcp/error-types';

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
// Platform: StandaloneWindows64
// Configuration: Release`,
    metadata: {
      type: 'assembly',
      name: 'Assembly-CSharp',
      version: '0.0.0.0',
      culture: 'neutral',
      publicKeyToken: 'null',
      unityVersion: '2022.3.15f1',
      platform: 'StandaloneWindows64',
      configuration: 'Release'
    }
  }),
  new Document({
    pageContent: `// Assembly: UnityEngine.CoreModule, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null
// Unity: 2022.3.15f1
// Platform: StandaloneWindows64`,
    metadata: {
      type: 'assembly',
      name: 'UnityEngine.CoreModule',
      version: '0.0.0.0',
      culture: 'neutral',
      publicKeyToken: 'null',
      unityVersion: '2022.3.15f1',
      platform: 'StandaloneWindows64'
    }
  }),
  new Document({
    pageContent: `namespace Game.Player {
    public class PlayerController : MonoBehaviour {
        // Player controller implementation
    }
}`,
    metadata: {
      type: 'class',
      name: 'PlayerController',
      namespace: 'Game.Player',
      baseClass: 'MonoBehaviour',
      isMonoBehaviour: true,
      assembly: 'Assembly-CSharp'
    }
  }),
  new Document({
    pageContent: `namespace Game.Utilities {
    public class GameManager<T> where T : class {
        // Generic game manager
    }
}`,
    metadata: {
      type: 'class',
      name: 'GameManager',
      namespace: 'Game.Utilities',
      genericParameters: ['T'],
      constraints: ['where T : class'],
      assembly: 'Assembly-CSharp'
    }
  })
];

describe('SearchMetadataTool', () => {
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
    it('should register the search_metadata tool correctly', () => {
      createSearchMetadataTool(mockServer, mockContext);

      expect(mockServer.tool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'search_metadata',
          description: expect.stringContaining('Search through extracted metadata')
        }),
        expect.any(Function)
      );
    });
  });

  describe('Basic Metadata Search', () => {
    let toolHandler: any;

    beforeEach(() => {
      createSearchMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should search metadata with basic query', async () => {
      const params = {
        query: 'Assembly-CSharp'
      };

      // Mock the filtered results to match the query
      const filteredResults = sampleMetadataDocuments.filter(doc =>
        doc.pageContent.includes('Assembly-CSharp') ||
        doc.metadata.assembly === 'Assembly-CSharp'
      );
      mockVectorStore.searchWithFilter = jest.fn().mockResolvedValue(filteredResults);

      const result = await toolHandler(params);

      // Parse the JSON response from the MCP formatted result
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
      expect(parsedResult.results).toHaveLength(3); // Assembly-CSharp assembly, PlayerController class, and GameManager class
      expect(parsedResult).toHaveProperty('searchMetadata');
      expect(parsedResult.searchMetadata.query).toBe('Assembly-CSharp');
    });

    it('should search metadata with empty query (return all)', async () => {
      const params = {
        query: ''
      };

      const result = await toolHandler(params);

      // Parse the JSON response from the MCP formatted result
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
      expect(parsedResult.results).toHaveLength(4); // All sample documents
      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith('', {}, 50);
    });
  });

  describe('Assembly Metadata Search', () => {
    let toolHandler: any;

    beforeEach(() => {
      createSearchMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should search assemblies by name', async () => {
      const params = {
        query: 'UnityEngine',
        search_type: 'assembly',
        assembly_name: 'UnityEngine.CoreModule'
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith(
        'UnityEngine',
        expect.objectContaining({
          type: 'assembly',
          name: 'UnityEngine.CoreModule'
        }),
        50
      );
    });

    it('should search assemblies by version', async () => {
      const params = {
        query: 'version',
        search_type: 'assembly',
        assembly_version: '0.0.0.0'
      };

      const result = await toolHandler(params);

      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith(
        'version',
        expect.objectContaining({
          type: 'assembly',
          version: '0.0.0.0'
        }),
        50
      );
    });

    it('should search assemblies by Unity version', async () => {
      const params = {
        query: 'Unity',
        search_type: 'assembly',
        unity_version: '2022.3.15f1'
      };

      const result = await toolHandler(params);

      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith(
        'Unity',
        expect.objectContaining({
          type: 'assembly',
          unityVersion: '2022.3.15f1'
        }),
        50
      );
    });
  });

  describe('Type Metadata Search', () => {
    let toolHandler: any;

    beforeEach(() => {
      createSearchMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should search types by namespace', async () => {
      const params = {
        query: 'Player',
        search_type: 'type',
        namespace_filter: 'Game.Player'
      };

      const result = await toolHandler(params);

      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith(
        'Player',
        expect.objectContaining({
          namespace: 'Game.Player'
        }),
        50
      );
    });

    it('should search generic types', async () => {
      const params = {
        query: 'GameManager',
        search_type: 'type',
        include_generics: true
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
      expect(parsedResult.results.some((r: any) => r.metadata.genericParameters)).toBe(true);
    });

    it('should search MonoBehaviour types only', async () => {
      const params = {
        query: 'Controller',
        search_type: 'type',
        monobehaviour_only: true
      };

      const result = await toolHandler(params);

      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith(
        'Controller',
        expect.objectContaining({
          isMonoBehaviour: true
        }),
        50
      );
    });
  });

  describe('Advanced Search Features', () => {
    let toolHandler: any;

    beforeEach(() => {
      createSearchMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should support regex pattern matching', async () => {
      const params = {
        query: 'Game.*',
        use_regex: true
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
      expect(parsedResult.searchMetadata.useRegex).toBe(true);
    });

    it('should support case-insensitive search', async () => {
      const params = {
        query: 'ASSEMBLY-CSHARP',
        case_sensitive: false
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
      expect(parsedResult.searchMetadata.caseSensitive).toBe(false);
    });

    it('should limit results with max_results parameter', async () => {
      const params = {
        query: 'Assembly',
        max_results: 1
      };

      const result = await toolHandler(params);

      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith('Assembly', {}, 1);
    });

    it('should include metadata statistics', async () => {
      const params = {
        query: 'Assembly',
        include_statistics: true
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('statistics');
      expect(parsedResult.statistics).toHaveProperty('totalResults');
      expect(parsedResult.statistics).toHaveProperty('resultsByType');
    });
  });

  describe('Error Handling', () => {
    let toolHandler: any;

    beforeEach(() => {
      createSearchMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should handle vector store errors gracefully', async () => {
      mockVectorStore.searchWithFilter = jest.fn().mockRejectedValue(new Error('Vector store error'));

      const params = {
        query: 'test'
      };

      await expect(toolHandler(params)).rejects.toThrow(MCPServerError);
    });

    it('should handle invalid regex patterns', async () => {
      const params = {
        query: '[invalid regex',
        use_regex: true
      };

      await expect(toolHandler(params)).rejects.toThrow(MCPServerError);
    });

    it('should validate max_results parameter', async () => {
      const params = {
        query: 'test',
        max_results: -1
      };

      const result = await toolHandler(params);

      // The tool should adjust invalid max_results and include a warning
      expect(result.content[0].metadata.warnings).toContain('max_results adjusted to 1 (valid range: 1-1000)');
    });
  });

  describe('Performance and Edge Cases', () => {
    let toolHandler: any;

    beforeEach(() => {
      createSearchMetadataTool(mockServer, mockContext);
      const toolCall = mockServer.tool.mock.calls[0];
      toolHandler = toolCall[1];
    });

    it('should handle empty search results', async () => {
      mockVectorStore.searchWithFilter = jest.fn().mockResolvedValue([]);

      const params = {
        query: 'nonexistent',
        include_statistics: true
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult.results).toHaveLength(0);
      expect(parsedResult.statistics.totalResults).toBe(0);
    });

    it('should handle very long queries', async () => {
      const longQuery = 'a'.repeat(1000);
      const params = {
        query: longQuery
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
      expect(parsedResult.searchMetadata.query).toBe(longQuery);
    });

    it('should handle special characters in queries', async () => {
      const params = {
        query: 'Test@#$%^&*()_+{}|:"<>?'
      };

      const result = await toolHandler(params);
      const parsedResult = parseMCPResponse(result);

      expect(parsedResult).toHaveProperty('results');
    });
  });
});
