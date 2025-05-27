/**
 * @fileoverview Unit tests for AnalyzeGenericTypes MCP Tool
 * Tests generic type relationship mapping, constraint analysis, and type parameter relationships
 *
 * Following TFD (Test-First Development) methodology as required by project guidelines.
 */

import { AnalyzeGenericTypesTool } from '../../../mcp/tools/analyze-generic-types-tool';
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

describe('AnalyzeGenericTypesTool', () => {
  let tool: AnalyzeGenericTypesTool;

  beforeEach(() => {
    tool = new AnalyzeGenericTypesTool();
    jest.clearAllMocks();
  });

  describe('Parameter Validation', () => {
    it('should validate valid parameters', async () => {
      const params = {
        target_type: 'List<T>',
        include_constraints: true,
        include_instantiations: true,
        complexity_threshold: 3
      };

      const result = await tool.execute(params, mockContext);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle missing optional parameters', async () => {
      const params = {};

      mockVectorStore.searchWithFilter.mockResolvedValue([
        new Document({
          pageContent: 'class List<T> where T : class',
          metadata: {
            type: 'class',
            name: 'List',
            namespace: 'System.Collections.Generic',
            genericParameters: ['T'],
            constraints: ['T : class']
          }
        })
      ]);

      const result = await tool.execute(params, mockContext);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should reject invalid complexity_threshold values', async () => {
      const params = {
        complexity_threshold: -1
      };

      const result = await tool.execute(params, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('complexity_threshold');
    });

    it('should reject complexity_threshold values exceeding limit', async () => {
      const params = {
        complexity_threshold: 15
      };

      const result = await tool.execute(params, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('complexity_threshold');
    });
  });

  describe('Generic Type Analysis', () => {
    it('should analyze generic type relationships for all types', async () => {
      const mockGenericTypes = [
        new Document({
          pageContent: 'class List<T> where T : class',
          metadata: {
            type: 'class',
            name: 'List',
            namespace: 'System.Collections.Generic',
            genericParameters: ['T'],
            constraints: ['T : class'],
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class Dictionary<TKey, TValue> where TKey : notnull',
          metadata: {
            type: 'class',
            name: 'Dictionary',
            namespace: 'System.Collections.Generic',
            genericParameters: ['TKey', 'TValue'],
            constraints: ['TKey : notnull'],
            typeDefIndex: 2
          }
        }),
        new Document({
          pageContent: 'interface IEnumerable<T>',
          metadata: {
            type: 'interface',
            name: 'IEnumerable',
            namespace: 'System.Collections.Generic',
            genericParameters: ['T'],
            constraints: [],
            typeDefIndex: 3
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockGenericTypes);

      const params = {
        include_constraints: true,
        include_instantiations: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.genericTypeDefinitions).toBeDefined();
      expect(result.data.genericTypeDefinitions.length).toBe(3);
      expect(result.data.constraintRelationships).toBeDefined();
      expect(result.data.complexityMetrics).toBeDefined();
    });

    it('should analyze specific target generic type', async () => {
      const mockTargetType = new Document({
        pageContent: 'class List<T> where T : class, IComparable<T>',
        metadata: {
          type: 'class',
          name: 'List',
          namespace: 'System.Collections.Generic',
          genericParameters: ['T'],
          constraints: ['T : class', 'T : IComparable<T>'],
          typeDefIndex: 1
        }
      });

      mockVectorStore.searchWithFilter
        .mockResolvedValueOnce([mockTargetType]) // First call for target type
        .mockResolvedValueOnce([mockTargetType]); // Second call for all generic types

      const params = {
        target_type: 'List<T>',
        include_constraints: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.genericTypeDefinitions).toBeDefined();
      expect(result.data.genericTypeDefinitions.some((def: any) =>
        def.typeName === 'List' && def.genericParameters.includes('T')
      )).toBe(true);
    });

    it('should analyze constraint relationships', async () => {
      const mockConstrainedTypes = [
        new Document({
          pageContent: 'class Repository<T> where T : class, IEntity',
          metadata: {
            type: 'class',
            name: 'Repository',
            namespace: 'Data',
            genericParameters: ['T'],
            constraints: ['T : class', 'T : IEntity'],
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class Service<T, U> where T : class where U : struct',
          metadata: {
            type: 'class',
            name: 'Service',
            namespace: 'Business',
            genericParameters: ['T', 'U'],
            constraints: ['T : class', 'U : struct'],
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockConstrainedTypes);

      const params = {
        include_constraints: true,
        complexity_threshold: 2
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.constraintRelationships).toBeDefined();
      expect(result.data.constraintRelationships.length).toBeGreaterThan(0);
      expect(result.data.constraintRelationships.some((rel: any) =>
        rel.constraintType === 'class' || rel.constraintType === 'struct'
      )).toBe(true);
    });

    it('should detect complex generic patterns', async () => {
      const mockComplexTypes = [
        new Document({
          pageContent: 'class ComplexGeneric<T, U, V> where T : class, IComparable<T> where U : struct where V : T',
          metadata: {
            type: 'class',
            name: 'ComplexGeneric',
            namespace: 'Complex',
            genericParameters: ['T', 'U', 'V'],
            constraints: ['T : class', 'T : IComparable<T>', 'U : struct', 'V : T'],
            typeDefIndex: 1
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockComplexTypes);

      const params = {
        include_constraints: true,
        complexity_threshold: 2
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.complexityMetrics).toBeDefined();
      expect(result.data.complexityMetrics.maxTypeParameters).toBeGreaterThanOrEqual(3);
      expect(result.data.complexityMetrics.constraintComplexity).toBeGreaterThan(0);
    });

    it('should handle generic instantiations', async () => {
      const mockInstantiations = [
        new Document({
          pageContent: 'List<string> stringList = new List<string>();',
          metadata: {
            type: 'field',
            name: 'stringList',
            fieldType: 'List<string>',
            parentClass: 'TestClass',
            genericInstantiation: {
              baseType: 'List',
              typeArguments: ['string']
            }
          }
        }),
        new Document({
          pageContent: 'Dictionary<int, string> intStringDict;',
          metadata: {
            type: 'field',
            name: 'intStringDict',
            fieldType: 'Dictionary<int, string>',
            parentClass: 'TestClass',
            genericInstantiation: {
              baseType: 'Dictionary',
              typeArguments: ['int', 'string']
            }
          }
        })
      ];

      mockVectorStore.searchWithFilter
        .mockResolvedValueOnce([]) // No generic type definitions
        .mockResolvedValueOnce(mockInstantiations); // Generic instantiations

      const params = {
        include_instantiations: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.genericInstantiations).toBeDefined();
      expect(result.data.genericInstantiations.length).toBe(2);
    });

    it('should filter by complexity threshold', async () => {
      const mockTypes = [
        new Document({
          pageContent: 'class Simple<T>',
          metadata: {
            type: 'class',
            name: 'Simple',
            genericParameters: ['T'],
            constraints: [],
            typeDefIndex: 1
          }
        }),
        new Document({
          pageContent: 'class Complex<T, U, V> where T : class where U : struct',
          metadata: {
            type: 'class',
            name: 'Complex',
            genericParameters: ['T', 'U', 'V'],
            constraints: ['T : class', 'U : struct'],
            typeDefIndex: 2
          }
        })
      ];

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        complexity_threshold: 2,
        include_constraints: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.data.genericTypeDefinitions).toBeDefined();
      // Should include Complex type (3 parameters >= threshold 2) but may include Simple too
      expect(result.data.genericTypeDefinitions.some((def: any) =>
        def.typeName === 'Complex'
      )).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle target type not found', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      const params = {
        target_type: 'NonExistentGeneric<T>'
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle vector store errors', async () => {
      mockVectorStore.searchWithFilter.mockRejectedValue(new Error('Database connection failed'));

      const params = {
        include_constraints: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should handle empty IL2CPP dump', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      const params = {
        include_constraints: true
      };

      const result = await tool.execute(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No generic types found');
    });
  });

  describe('Performance', () => {
    it('should complete analysis within reasonable time', async () => {
      const mockTypes = Array.from({ length: 50 }, (_, i) =>
        new Document({
          pageContent: `class Generic${i}<T, U>`,
          metadata: {
            type: 'class',
            name: `Generic${i}`,
            genericParameters: ['T', 'U'],
            constraints: ['T : class'],
            typeDefIndex: i
          }
        })
      );

      mockVectorStore.searchWithFilter.mockResolvedValue(mockTypes);

      const params = {
        include_constraints: true,
        include_instantiations: true
      };

      const startTime = Date.now();
      const result = await tool.execute(params, mockContext);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
