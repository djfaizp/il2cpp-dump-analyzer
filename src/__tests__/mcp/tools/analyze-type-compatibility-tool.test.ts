/**
 * @fileoverview Unit tests for AnalyzeTypeCompatibility MCP Tool
 * Tests type compatibility analysis, conversion paths, and assignability rules
 *
 * Following TFD (Test-First Development) methodology as required by project guidelines.
 */

import { AnalyzeTypeCompatibilityTool } from '../../../mcp/tools/analyze-type-compatibility-tool';
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

describe('AnalyzeTypeCompatibilityTool', () => {
  let tool: AnalyzeTypeCompatibilityTool;

  beforeEach(() => {
    tool = new AnalyzeTypeCompatibilityTool();
    jest.clearAllMocks();
  });

  describe('Parameter Validation', () => {
    it('should validate valid parameters', async () => {
      const params = {
        from_type: 'string',
        to_type: 'object',
        include_conversion_paths: true,
        include_implicit_conversions: true
      };

      const result = await tool.execute(params, mockContext);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should require from_type and to_type parameters', async () => {
      const params = {
        from_type: 'string'
        // Missing to_type
      };

      const result = await tool.execute(params, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('to_type');
    });

    it('should handle missing optional parameters', async () => {
      const params = {
        from_type: 'string',
        to_type: 'object'
      };

      mockVectorStore.searchWithFilter.mockResolvedValue([
        new Document({
          pageContent: 'class string : object',
          metadata: {
            type: 'class',
            name: 'string',
            namespace: 'System',
            baseClass: 'object'
          }
        }),
        new Document({
          pageContent: 'class object',
          metadata: {
            type: 'class',
            name: 'object',
            namespace: 'System'
          }
        })
      ]);

      const result = await tool.execute(params, mockContext);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('Type Compatibility Analysis', () => {
    it('should analyze inheritance-based compatibility', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class string : object',
          metadata: {
            type: 'class',
            name: 'string',
            namespace: 'System',
            baseClass: 'object',
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class object',
          metadata: {
            type: 'class',
            name: 'object',
            namespace: 'System',
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        from_type: 'string',
        to_type: 'object',
        include_conversion_paths: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.compatibilityType).toBe('assignable');
      expect(result.data.isCompatible).toBe(true);
    });

    it('should analyze interface-based compatibility', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class List<T> : IEnumerable<T>',
          metadata: {
            type: 'class',
            name: 'List',
            namespace: 'System.Collections.Generic',
            interfaces: ['IEnumerable<T>'],
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'interface IEnumerable<T>',
          metadata: {
            type: 'interface',
            name: 'IEnumerable',
            namespace: 'System.Collections.Generic',
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        from_type: 'List<T>',
        to_type: 'IEnumerable<T>',
        include_conversion_paths: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.compatibilityType).toBe('assignable');
      expect(result.data.isCompatible).toBe(true);
      expect(result.data.assignabilityRule?.rule).toBe('interface_assignability');
    });

    it('should detect incompatible types', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class string : object',
          metadata: {
            type: 'class',
            name: 'string',
            namespace: 'System',
            baseClass: 'object',
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class int : ValueType',
          metadata: {
            type: 'class',
            name: 'int',
            namespace: 'System',
            baseClass: 'ValueType',
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        from_type: 'string',
        to_type: 'int',
        include_conversion_paths: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.compatibilityType).toBe('incompatible');
      expect(result.data.isCompatible).toBe(false);
    });

    it('should analyze generic type compatibility', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class List<T>',
          metadata: {
            type: 'class',
            name: 'List',
            namespace: 'System.Collections.Generic',
            genericParameters: ['T'],
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class List<string>',
          metadata: {
            type: 'class',
            name: 'List',
            namespace: 'System.Collections.Generic',
            genericInstantiation: {
              baseType: 'List',
              typeArguments: ['string']
            },
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        from_type: 'List<string>',
        to_type: 'List<T>',
        include_conversion_paths: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.isCompatible).toBe(true);
    });

    it('should find conversion paths', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class int : ValueType',
          metadata: {
            type: 'class',
            name: 'int',
            namespace: 'System',
            baseClass: 'ValueType',
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class long : ValueType',
          metadata: {
            type: 'class',
            name: 'long',
            namespace: 'System',
            baseClass: 'ValueType',
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        from_type: 'int',
        to_type: 'long',
        include_conversion_paths: true,
        include_implicit_conversions: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.compatibilityType).toBe('convertible');
      expect(result.data.conversionPath).toBeDefined();
    });

    it('should analyze multiple type compatibility', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class string : object',
          metadata: {
            type: 'class',
            name: 'string',
            namespace: 'System',
            baseClass: 'object',
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class object',
          metadata: {
            type: 'class',
            name: 'object',
            namespace: 'System',
            typeDefIndex: 2
          }
        }),
        new Document({
          pageContent: 'class int : ValueType',
          metadata: {
            type: 'class',
            name: 'int',
            namespace: 'System',
            baseClass: 'ValueType',
            typeDefIndex: 3
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        // No specific from_type/to_type - analyze all combinations
        include_conversion_paths: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.compatibilityMatrix).toBeDefined();
      expect(result.data.compatibilityMatrix.length).toBeGreaterThan(0);
    });

    it('should handle built-in type conversions', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'struct int',
          metadata: {
            type: 'struct',
            name: 'int',
            namespace: 'System',
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'struct double',
          metadata: {
            type: 'struct',
            name: 'double',
            namespace: 'System',
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        from_type: 'int',
        to_type: 'double',
        include_conversion_paths: true,
        include_implicit_conversions: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.compatibilityType).toBe('convertible');
      expect(result.data.conversionPath?.conversionType).toBe('implicit');
    });
  });

  describe('Error Handling', () => {
    it('should handle from_type not found', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      const params = {
        from_type: 'NonExistentType',
        to_type: 'object'
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle to_type not found', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([
        new Document({
          pageContent: 'class string',
          metadata: { type: 'class', name: 'string', namespace: 'System' }
        })
      ]).mockResolvedValueOnce([]); // Empty result for to_type

      const params = {
        from_type: 'string',
        to_type: 'NonExistentType'
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle vector store errors', async () => {
      mockVectorStore.searchWithFilter.mockRejectedValue(new Error('Database connection failed'));

      const params = {
        from_type: 'string',
        to_type: 'object'
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should handle empty IL2CPP dump', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      const params = {
        include_conversion_paths: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No types found');
    });
  });

  describe('Performance', () => {
    it('should complete analysis within reasonable time', async () => {
      const mockTypes = Array.from({ length: 50 }, (_, i) =>
        new Document({
          pageContent: `class Type${i}`,
          metadata: {
            type: 'class',
            name: `Type${i}`,
            namespace: 'Test',
            typeDefIndex: i
          }
        })
      );

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        from_type: 'Type0',
        to_type: 'Type1',
        include_conversion_paths: true
      };

      const startTime = Date.now();
      const result = await tool.execute(params, mockContext);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
