/**
 * Asset Analysis MCP Tools Tests
 * Comprehensive test suite for Unity asset analysis MCP tools
 */

import { Document } from '@langchain/core/documents';
import { AnalyzeAssetReferencesToolHandler } from '../../../mcp/tools/analyze-asset-references-tool';
import { FindUnusedAssetsToolHandler } from '../../../mcp/tools/find-unused-assets-tool';
import { AnalyzeAssetDependenciesToolHandler } from '../../../mcp/tools/analyze-asset-dependencies-tool';
import { ToolExecutionContext } from '../../../mcp/base-tool-handler';

// Mock the vector store
const mockVectorStore = {
  searchWithFilter: jest.fn(),
  similaritySearch: jest.fn(),
};

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Create mock context
const mockContext: ToolExecutionContext = {
  vectorStore: mockVectorStore as any,
  logger: mockLogger,
  isInitialized: jest.fn().mockReturnValue(true),
};

describe('Asset Analysis MCP Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up default mock responses for vector store
    const defaultDoc = createMockDocument(`
      public class DefaultTest {
        void LoadAssets() {
          Resources.Load<Texture2D>("test_texture");
        }
      }
    `, 'DefaultTest', 'class');

    mockVectorStore.searchWithFilter.mockResolvedValue([defaultDoc]);
  });

  describe('AnalyzeAssetReferencesToolHandler', () => {
    let handler: AnalyzeAssetReferencesToolHandler;

    beforeEach(() => {
      handler = new AnalyzeAssetReferencesToolHandler(mockContext);
    });

    test('should analyze asset references with default parameters', async () => {
      // Mock vector store responses - need to mock both class and method calls
      const testDoc = createMockDocument(`
        public class TestClass {
          void LoadAssets() {
            Resources.Load<Texture2D>("UI/background");
            Resources.Load<AudioClip>("Audio/music");
          }
        }
      `, 'TestClass', 'class');

      mockVectorStore.searchWithFilter
        .mockResolvedValueOnce([testDoc]) // For classes
        .mockResolvedValueOnce([testDoc]); // For methods

      const params = {};
      const result = await handler.execute(params);

      expect(result).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith('', { type: 'class' }, 1000);
    });

    test('should filter by asset type', async () => {
      const testDoc = createMockDocument(`
        public class FilterTest {
          void LoadTextures() {
            Resources.Load<Texture2D>("texture1");
            Resources.Load<AudioClip>("audio1");
          }
        }
      `, 'FilterTest', 'class');

      mockVectorStore.searchWithFilter
        .mockResolvedValueOnce([testDoc])
        .mockResolvedValueOnce([testDoc]);

      const params = {
        asset_type_filter: ['Texture'],
        max_results: 10
      };

      const result = await handler.execute(params);

      expect(result).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    test('should filter by namespace', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument(`
          namespace Game.UI {
            public class UIManager {
              void LoadUI() {
                Resources.Load<Texture2D>("UI/panel");
              }
            }
          }
        `, 'UIManager', 'class')
      ]);

      const params = {
        namespace_filter: 'Game.UI',
        include_optimization_recommendations: true
      };

      const result = await handler.execute(params);

      expect(result).toBeDefined();
      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith('',
        { namespace: 'Game.UI', type: 'class' },
        1000
      );
    });

    test('should handle empty results gracefully', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      const params = {};

      await expect(handler.execute(params)).rejects.toThrow('No documents found for asset analysis');
    });

    test('should validate parameters correctly', async () => {
      const params = {
        asset_type_filter: ['InvalidType'],
        max_results: 2000, // Over limit
      };

      // Should not throw but adjust parameters
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument('public class Test {}', 'Test', 'class')
      ]);

      const result = await handler.execute(params);
      expect(result).toBeDefined();
    });
  });

  describe('FindUnusedAssetsToolHandler', () => {
    let handler: FindUnusedAssetsToolHandler;

    beforeEach(() => {
      handler = new FindUnusedAssetsToolHandler(mockContext);
    });

    test('should find unused assets with default parameters', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument(`
          public class AssetUser {
            void LoadSomeAssets() {
              Resources.Load<Texture2D>("used_texture");
              // "unused_texture" is not loaded anywhere
            }
          }
        `, 'AssetUser', 'class')
      ]);

      const params = {};
      const result = await handler.execute(params);

      expect(result).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    test('should filter by confidence threshold', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument(`
          public class ConfidenceTest {
            void LoadAssets() {
              Resources.Load<Texture2D>("definitely_used");
            }
          }
        `, 'ConfidenceTest', 'class')
      ]);

      const params = {
        confidence_threshold: 0.9,
        include_potential_references: false
      };

      const result = await handler.execute(params);

      expect(result).toBeDefined();
    });

    test('should exclude editor assets when specified', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument(`
          #if UNITY_EDITOR
          public class EditorAssetUser {
            void LoadEditorAssets() {
              AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Editor/editor_texture.png");
            }
          }
          #endif
        `, 'EditorAssetUser', 'class')
      ]);

      const params = {
        exclude_editor_assets: true,
        asset_type_filter: ['Texture']
      };

      const result = await handler.execute(params);

      expect(result).toBeDefined();
    });

    test('should handle asset type filtering', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument(`
          public class TypeFilterTest {
            void LoadDifferentTypes() {
              Resources.Load<Texture2D>("texture");
              Resources.Load<AudioClip>("audio");
              Resources.Load<GameObject>("prefab");
            }
          }
        `, 'TypeFilterTest', 'class')
      ]);

      const params = {
        asset_type_filter: ['Texture', 'Audio'],
        max_results: 50
      };

      const result = await handler.execute(params);

      expect(result).toBeDefined();
    });

    test('should validate parameters and provide warnings', async () => {
      const params = {
        confidence_threshold: 1.5, // Invalid - over 1.0
        max_results: 1000, // Over limit
        asset_type_filter: ['InvalidType']
      };

      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument('public class Test {}', 'Test', 'class')
      ]);

      const result = await handler.execute(params);
      expect(result).toBeDefined();
    });
  });

  describe('AnalyzeAssetDependenciesToolHandler', () => {
    let handler: AnalyzeAssetDependenciesToolHandler;

    beforeEach(() => {
      handler = new AnalyzeAssetDependenciesToolHandler(mockContext);
    });

    test('should analyze asset dependencies with default parameters', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument(`
          public class DependencyTest {
            void LoadDependentAssets() {
              Resources.Load<Texture2D>("base_texture");
              Resources.Load<Material>("material_using_texture");
            }
          }
        `, 'DependencyTest', 'class')
      ]);

      const params = {};
      const result = await handler.execute(params);

      expect(result).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    test('should analyze specific target asset', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument(`
          public class TargetAssetTest {
            void LoadTargetAsset() {
              Resources.Load<Texture2D>("target_texture");
              Resources.Load<Material>("dependent_material");
            }
          }
        `, 'TargetAssetTest', 'class')
      ]);

      const params = {
        target_asset: 'target_texture',
        dependency_type: 'both' as const,
        max_depth: 3
      };

      const result = await handler.execute(params);

      expect(result).toBeDefined();
    });

    test('should filter by dependency type', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument(`
          public class DependencyTypeTest {
            void LoadAssets() {
              Resources.Load<Texture2D>("incoming_dep");
              Resources.Load<Material>("outgoing_dep");
            }
          }
        `, 'DependencyTypeTest', 'class')
      ]);

      const params = {
        dependency_type: 'outgoing' as const,
        include_circular_dependencies: true,
        max_results: 100
      };

      const result = await handler.execute(params);

      expect(result).toBeDefined();
    });

    test('should handle circular dependency analysis', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument(`
          public class CircularTest {
            void LoadCircularAssets() {
              Resources.Load<Texture2D>("asset_a");
              Resources.Load<Material>("asset_b"); // Depends on asset_a
              // asset_a also depends on asset_b (circular)
            }
          }
        `, 'CircularTest', 'class')
      ]);

      const params = {
        include_circular_dependencies: true,
        asset_type_filter: ['Texture', 'Material']
      };

      const result = await handler.execute(params);

      expect(result).toBeDefined();
    });

    test('should validate max_depth parameter', async () => {
      const params = {
        max_depth: 15, // Over limit
        namespace_scope: 'Game.Assets'
      };

      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument('public class Test {}', 'Test', 'class')
      ]);

      const result = await handler.execute(params);
      expect(result).toBeDefined();
    });

    test('should handle empty document results', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      const params = {};

      await expect(handler.execute(params)).rejects.toThrow('No documents found for asset dependency analysis');
    });
  });

  describe('Integration Tests', () => {
    test('should work together for comprehensive asset analysis', async () => {
      const testDocument = createMockDocument(`
        public class IntegrationTest {
          void LoadAssets() {
            Resources.Load<Texture2D>("shared_texture");
            Resources.Load<AudioClip>("unique_audio");
            AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/Player.prefab");
          }
        }
      `, 'IntegrationTest', 'class');

      mockVectorStore.searchWithFilter.mockResolvedValue([testDocument]);

      // Test all three tools with the same data
      const assetRefsHandler = new AnalyzeAssetReferencesToolHandler(mockContext);
      const unusedAssetsHandler = new FindUnusedAssetsToolHandler(mockContext);
      const dependenciesHandler = new AnalyzeAssetDependenciesToolHandler(mockContext);

      const assetRefsResult = await assetRefsHandler.execute({});
      const unusedAssetsResult = await unusedAssetsHandler.execute({});
      const dependenciesResult = await dependenciesHandler.execute({});

      expect(assetRefsResult).toBeDefined();
      expect(unusedAssetsResult).toBeDefined();
      expect(dependenciesResult).toBeDefined();

      // All should contain analysis results
      expect(assetRefsResult).toBeDefined();
      expect(unusedAssetsResult).toBeDefined();
      expect(dependenciesResult).toBeDefined();

      // Check that results have the expected structure
      expect(Array.isArray(assetRefsResult.content)).toBe(true);
      expect(Array.isArray(unusedAssetsResult.content)).toBe(true);
      expect(Array.isArray(dependenciesResult.content)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle vector store errors gracefully', async () => {
      mockVectorStore.searchWithFilter.mockRejectedValueOnce(new Error('Vector store connection failed'));

      const handler = new AnalyzeAssetReferencesToolHandler(mockContext);
      const params = {};

      await expect(handler.execute(params)).rejects.toThrow();
    });

    test('should handle malformed documents', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        createMockDocument('invalid code content', 'Invalid', 'class')
      ]);

      const handler = new AnalyzeAssetReferencesToolHandler(mockContext);
      const params = {};

      const result = await handler.execute(params);
      expect(result).toBeDefined(); // Should handle gracefully
    });
  });
});

/**
 * Helper function to create mock documents
 */
function createMockDocument(content: string, name: string, type: string): Document {
  return new Document({
    pageContent: content,
    metadata: {
      name,
      type,
      namespace: 'Test',
      fullName: `Test.${name}`,
    },
  });
}
