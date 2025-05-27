/**
 * @fileoverview Unit tests for AnalyzeTypeDependencies MCP Tool
 * Tests type dependency graph creation, circular reference detection, and dependency analysis
 *
 * Following TFD (Test-First Development) methodology as required by project guidelines.
 */

import { AnalyzeTypeDependenciesTool } from '../../../mcp/tools/analyze-type-dependencies-tool';
import { ToolExecutionContext } from '../../../mcp/base-tool-handler';
import { Document } from '@langchain/core/documents';

// Mock vector store
const mockVectorStore = {
  searchWithFilter: jest.fn(),
  addDocuments: jest.fn(),
  similaritySearch: jest.fn()
};

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock context
const mockContext: ToolExecutionContext = {
  vectorStore: mockVectorStore as any,
  logger: mockLogger,
  requestId: 'test-request-123'
};

describe('AnalyzeTypeDependenciesTool', () => {
  let tool: AnalyzeTypeDependenciesTool;

  beforeEach(() => {
    tool = new AnalyzeTypeDependenciesTool();
    jest.clearAllMocks();
  });

  describe('Parameter Validation', () => {
    it('should validate valid parameters', async () => {
      const params = {
        target_type: 'GameObject',
        include_circular_detection: true,
        max_depth: 5,
        include_system_types: false
      };

      const result = await tool.execute(params, mockContext);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle missing optional parameters', async () => {
      const params = {};

      mockVectorStore.searchWithFilter.mockResolvedValue([
        new Document({
          pageContent: 'class GameObject : MonoBehaviour',
          metadata: {
            type: 'class',
            name: 'GameObject',
            namespace: 'UnityEngine',
            baseClass: 'MonoBehaviour',
            interfaces: ['IComponent']
          }
        })
      ]);

      const result = await tool.execute(params, mockContext);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should reject invalid max_depth values', async () => {
      const params = {
        max_depth: -1
      };

      const result = await tool.execute(params, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('max_depth');
    });

    it('should reject max_depth values exceeding limit', async () => {
      const params = {
        max_depth: 15
      };

      const result = await tool.execute(params, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('max_depth');
    });
  });

  describe('Type Dependency Analysis', () => {
    it('should analyze type dependencies for all types', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class GameObject : MonoBehaviour',
          metadata: {
            type: 'class',
            name: 'GameObject',
            namespace: 'UnityEngine',
            baseClass: 'MonoBehaviour',
            interfaces: ['IComponent'],
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class MonoBehaviour : Behaviour',
          metadata: {
            type: 'class',
            name: 'MonoBehaviour',
            namespace: 'UnityEngine',
            baseClass: 'Behaviour',
            interfaces: [],
            typeDefIndex: 2
          }
        }),
        new Document({
          pageContent: 'class Component : Object',
          metadata: {
            type: 'class',
            name: 'Component',
            namespace: 'UnityEngine',
            baseClass: 'Object',
            interfaces: [],
            typeDefIndex: 3
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        include_circular_detection: true,
        max_depth: 5
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.nodes).toBeDefined();
      expect(result.data.edges).toBeDefined();
      expect(result.data.nodes.length).toBeGreaterThan(0);
      expect(result.data.metrics).toBeDefined();
    });

    it('should analyze dependencies for specific target type', async () => {
      const mockTargetType = new Document({
        pageContent: 'class GameObject : MonoBehaviour',
        metadata: {
          type: 'class',
          name: 'GameObject',
          namespace: 'UnityEngine',
          baseClass: 'MonoBehaviour',
          interfaces: ['IComponent'],
          typeDefIndex: 1
        }
      });

      const mockAllTypes = [
        mockTargetType,
        new Document({
          pageContent: 'class MonoBehaviour : Behaviour',
          metadata: {
            type: 'class',
            name: 'MonoBehaviour',
            namespace: 'UnityEngine',
            baseClass: 'Behaviour',
            interfaces: [],
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter
        .mockResolvedValueOnce([mockTargetType]) // First call for target type
        .mockResolvedValueOnce(mockAllTypes); // Second call for all types

      const params = {
        target_type: 'GameObject',
        include_circular_detection: true,
        max_depth: 3
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.nodes).toBeDefined();
      expect(result.data.nodes.some((node: any) =>
        node.typeName === 'GameObject'
      )).toBe(true);
    });

    it('should detect circular dependencies', async () => {
      const mockCircularTypes = [
        new Document({
          pageContent: 'class TypeA : TypeB',
          metadata: {
            type: 'class',
            name: 'TypeA',
            namespace: 'Test',
            baseClass: 'TypeB',
            interfaces: [],
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class TypeB : TypeC',
          metadata: {
            type: 'class',
            name: 'TypeB',
            namespace: 'Test',
            baseClass: 'TypeC',
            interfaces: [],
            typeDefIndex: 2
          }
        }),
        new Document({
          pageContent: 'class TypeC : TypeA',
          metadata: {
            type: 'class',
            name: 'TypeC',
            namespace: 'Test',
            baseClass: 'TypeA',
            interfaces: [],
            typeDefIndex: 3
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockCircularTypes);

      const params = {
        include_circular_detection: true,
        max_depth: 5
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.clusters).toBeDefined();
      expect(result.data.clusters.some((cluster: any) =>
        cluster.isCircular === true
      )).toBe(true);
    });

    it('should handle system type filtering', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class GameObject : MonoBehaviour',
          metadata: {
            type: 'class',
            name: 'GameObject',
            namespace: 'UnityEngine',
            baseClass: 'MonoBehaviour',
            interfaces: [],
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class CustomClass : System.Object',
          metadata: {
            type: 'class',
            name: 'CustomClass',
            namespace: 'Game',
            baseClass: 'System.Object',
            interfaces: [],
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        include_system_types: false,
        max_depth: 3
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.nodes).toBeDefined();
      // Should filter out system types in dependencies
      expect(result.data.nodes.every((node: any) =>
        !node.typeName.startsWith('System.')
      )).toBe(true);
    });

    it('should calculate dependency metrics', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class HighCouplingClass : BaseClass',
          metadata: {
            type: 'class',
            name: 'HighCouplingClass',
            namespace: 'Test',
            baseClass: 'BaseClass',
            interfaces: ['IInterface1', 'IInterface2', 'IInterface3'],
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class LowCouplingClass',
          metadata: {
            type: 'class',
            name: 'LowCouplingClass',
            namespace: 'Test',
            baseClass: undefined,
            interfaces: [],
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        include_circular_detection: true,
        max_depth: 3
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.metrics).toBeDefined();
      expect(result.data.metrics.totalNodes).toBeGreaterThan(0);
      expect(result.data.metrics.averageDependencies).toBeGreaterThanOrEqual(0);
      expect(result.data.metrics.maxDependencies).toBeGreaterThanOrEqual(0);
    });

    it('should create type clusters', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class ClusterA1 : ClusterA2',
          metadata: {
            type: 'class',
            name: 'ClusterA1',
            namespace: 'ClusterA',
            baseClass: 'ClusterA2',
            interfaces: [],
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class ClusterA2',
          metadata: {
            type: 'class',
            name: 'ClusterA2',
            namespace: 'ClusterA',
            baseClass: undefined,
            interfaces: [],
            typeDefIndex: 2
          }
        }),
        new Document({
          pageContent: 'class ClusterB1',
          metadata: {
            type: 'class',
            name: 'ClusterB1',
            namespace: 'ClusterB',
            baseClass: undefined,
            interfaces: [],
            typeDefIndex: 3
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        include_circular_detection: true,
        max_depth: 3
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.clusters).toBeDefined();
      expect(result.data.clusters.length).toBeGreaterThan(0);
      expect(result.data.clusters.some((cluster: any) =>
        cluster.types.length > 1
      )).toBe(true);
    });

    it('should respect max depth limits', async () => {
      const mockDeepHierarchy = Array.from({ length: 10 }, (_, i) =>
        new Document({
          pageContent: `class Level${i} : Level${i + 1}`,
          metadata: {
            type: 'class',
            name: `Level${i}`,
            namespace: 'Deep',
            baseClass: i < 9 ? `Level${i + 1}` : undefined,
            interfaces: [],
            typeDefIndex: i
          }
        })
      );

      mockVectorStore.searchWithFilter.mockResolvedValue(mockDeepHierarchy);

      const params = {
        max_depth: 3,
        include_circular_detection: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.metrics.maxDepth).toBeLessThanOrEqual(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle target type not found', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      const params = {
        target_type: 'NonExistentClass'
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle vector store errors', async () => {
      mockVectorStore.searchWithFilter.mockRejectedValue(new Error('Database connection failed'));

      const params = {
        max_depth: 3
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should handle empty IL2CPP dump', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      const params = {
        max_depth: 3
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No types found');
    });
  });

  describe('Performance', () => {
    it('should complete analysis within reasonable time', async () => {
      const mockTypes = Array.from({ length: 100 }, (_, i) =>
        new Document({
          pageContent: `class Type${i} : BaseType`,
          metadata: {
            type: 'class',
            name: `Type${i}`,
            namespace: 'Test',
            baseClass: 'BaseType',
            interfaces: [],
            typeDefIndex: i
          }
        })
      );

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        include_circular_detection: true,
        max_depth: 5
      };

      const startTime = Date.now();
      const result = await tool.execute(params, mockContext);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
