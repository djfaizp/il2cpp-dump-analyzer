/**
 * @fileoverview Unit tests for AnalyzeTypeHierarchies MCP Tool
 * Tests inheritance hierarchy analysis, interface implementations, and type relationships
 *
 * Following TFD (Test-First Development) methodology as required by project guidelines.
 */

import { AnalyzeTypeHierarchiesTool } from '../../../mcp/tools/analyze-type-hierarchies-tool';
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

describe('AnalyzeTypeHierarchiesTool', () => {
  let tool: AnalyzeTypeHierarchiesTool;

  beforeEach(() => {
    tool = new AnalyzeTypeHierarchiesTool();
    jest.clearAllMocks();
  });

  describe('Parameter Validation', () => {
    it('should validate valid parameters', async () => {
      const params = {
        target_type: 'GameObject',
        include_interfaces: true,
        max_depth: 5,
        namespace_filter: 'UnityEngine'
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

  describe('Type Hierarchy Analysis', () => {
    it('should analyze inheritance hierarchies for all types', async () => {
      const mockClasses = [
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
          pageContent: 'class Behaviour : Component',
          metadata: {
            type: 'class',
            name: 'Behaviour',
            namespace: 'UnityEngine',
            baseClass: 'Component',
            interfaces: [],
            typeDefIndex: 3
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockClasses);

      const params = {
        include_interfaces: true,
        max_depth: 5
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.hierarchies).toBeDefined();
      expect(result.data.hierarchies.length).toBeGreaterThan(0);
      expect(result.data.totalHierarchies).toBeGreaterThan(0);
      expect(result.data.maxDepth).toBeGreaterThan(0);
    });

    it('should analyze hierarchy for specific target type', async () => {
      const mockTargetClass = new Document({
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

      const mockBaseClass = new Document({
        pageContent: 'class MonoBehaviour : Behaviour',
        metadata: {
          type: 'class',
          name: 'MonoBehaviour',
          namespace: 'UnityEngine',
          baseClass: 'Behaviour',
          interfaces: [],
          typeDefIndex: 2
        }
      });

      mockVectorStore.searchWithFilter
        .mockResolvedValueOnce([mockTargetClass]) // First call for target type
        .mockResolvedValueOnce([mockTargetClass, mockBaseClass]); // Second call for all classes

      const params = {
        target_type: 'GameObject',
        include_interfaces: true,
        max_depth: 3
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.hierarchies).toBeDefined();
      expect(result.data.hierarchies.some((h: any) =>
        h.rootType.typeName === 'GameObject'
      )).toBe(true);
    });

    it('should handle namespace filtering', async () => {
      const mockClasses = [
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
          pageContent: 'class CustomClass : BaseClass',
          metadata: {
            type: 'class',
            name: 'CustomClass',
            namespace: 'Game.Logic',
            baseClass: 'BaseClass',
            interfaces: [],
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockClasses);

      const params = {
        namespace_filter: 'UnityEngine',
        max_depth: 3
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.hierarchies).toBeDefined();
      // Should only include UnityEngine types
      expect(result.data.hierarchies.every((h: any) =>
        h.rootType.namespace === 'UnityEngine'
      )).toBe(true);
    });

    it('should detect multiple inheritance patterns', async () => {
      const mockClasses = [
        new Document({
          pageContent: 'class MultipleInheritanceClass : BaseClass',
          metadata: {
            type: 'class',
            name: 'MultipleInheritanceClass',
            namespace: 'Game',
            baseClass: 'BaseClass',
            interfaces: ['IInterface1', 'IInterface2'],
            typeDefIndex: 1
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockClasses);

      const params = {
        include_interfaces: true,
        max_depth: 3
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.multipleInheritancePatterns).toBeDefined();
      expect(result.data.multipleInheritancePatterns.length).toBeGreaterThan(0);
    });

    it('should identify orphaned types', async () => {
      const mockClasses = [
        new Document({
          pageContent: 'class OrphanedClass',
          metadata: {
            type: 'class',
            name: 'OrphanedClass',
            namespace: 'Game',
            baseClass: undefined,
            interfaces: [],
            typeDefIndex: 1
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockClasses);

      const params = {
        max_depth: 3
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.orphanedTypes).toBeDefined();
      expect(result.data.orphanedTypes).toContain('Game.OrphanedClass');
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
      expect(result.error).toContain('No classes found');
    });
  });

  describe('Performance', () => {
    it('should complete analysis within reasonable time', async () => {
      const mockClasses = Array.from({ length: 100 }, (_, i) =>
        new Document({
          pageContent: `class Class${i} : BaseClass`,
          metadata: {
            type: 'class',
            name: `Class${i}`,
            namespace: 'Test',
            baseClass: 'BaseClass',
            interfaces: [],
            typeDefIndex: i
          }
        })
      );

      mockVectorStore.searchWithFilter.mockResolvedValue(mockClasses);

      const params = {
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
