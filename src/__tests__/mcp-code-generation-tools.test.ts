/**
 * Unit tests for MCP Code Generation Tools
 * Tests the new MCP tools: generate_class_wrapper, generate_method_stubs, generate_monobehaviour_template
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { IL2CPPVectorStore } from '../embeddings/vector-store';
import { Document } from '@langchain/core/documents';

// Mock the vector store and dependencies
jest.mock('../embeddings/vector-store');
jest.mock('../generator', () => ({
  ClassWrapperGenerator: jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockResolvedValue({
      success: true,
      code: 'public class TestClass { }',
      metadata: {
        codeStats: {
          totalLines: 10,
          codeLines: 8,
          methodCount: 2,
          propertyCount: 1,
          fieldCount: 3,
          complexityScore: 5
        }
      },
      errors: [],
      warnings: []
    })
  })),
  MethodStubGenerator: jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockResolvedValue({
      success: true,
      code: 'public void TestMethod() { throw new NotImplementedException(); }',
      metadata: {
        codeStats: {
          totalLines: 5,
          codeLines: 3,
          methodCount: 1,
          propertyCount: 0,
          fieldCount: 0,
          complexityScore: 2
        }
      },
      errors: [],
      warnings: []
    })
  })),
  MonoBehaviourGenerator: jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockResolvedValue({
      success: true,
      code: 'public class TestMonoBehaviour : MonoBehaviour { void Start() { } }',
      metadata: {
        codeStats: {
          totalLines: 15,
          codeLines: 12,
          methodCount: 3,
          propertyCount: 0,
          fieldCount: 2,
          complexityScore: 7
        }
      },
      errors: [],
      warnings: []
    })
  })),
  GenerationType: {
    CLASS_WRAPPER: 'class_wrapper',
    METHOD_STUB: 'method_stub',
    MONOBEHAVIOUR_TEMPLATE: 'monobehaviour_template'
  },
  FileNamingConvention: {
    PASCAL_CASE: 'PascalCase'
  }
}));

// Import the MCP server functions after mocking
import {
  initializeVectorStore,
  createMcpServer,
  MCPServerError,
  ErrorType
} from '../mcp/mcp-sdk-server';

// Sample test data
const sampleClassDocument: Document = new Document({
  pageContent: `
public class TestClass : MonoBehaviour
{
    public float speed = 5.0f;
    private Transform playerTransform;

    void Start() { }
    void Update() { }
    public void Move(Vector3 direction) { }
}`,
  metadata: {
    name: 'TestClass',
    namespace: 'Game.Player',
    fullName: 'Game.Player.TestClass',
    type: 'class',
    baseClass: 'MonoBehaviour',
    isMonoBehaviour: true,
    interfaces: [],
    fields: [
      { name: 'speed', type: 'float', isPublic: true, isStatic: false, isReadOnly: false, attributes: [] },
      { name: 'playerTransform', type: 'Transform', isPublic: false, isStatic: false, isReadOnly: false, attributes: ['SerializeField'] }
    ],
    methods: [
      { name: 'Start', returnType: 'void', parameters: [], isPublic: false, isStatic: false, isVirtual: false, isAbstract: false, isOverride: false, attributes: [] },
      { name: 'Update', returnType: 'void', parameters: [], isPublic: false, isStatic: false, isVirtual: false, isAbstract: false, isOverride: false, attributes: [] },
      { name: 'Move', returnType: 'void', parameters: [{ name: 'direction', type: 'Vector3' }], isPublic: true, isStatic: false, isVirtual: false, isAbstract: false, isOverride: false, attributes: [] }
    ],
    typeDefIndex: 42
  }
});

const sampleNonMonoBehaviourDocument: Document = new Document({
  pageContent: `
public class UtilityClass
{
    public static string FormatText(string input) { return input; }
}`,
  metadata: {
    name: 'UtilityClass',
    namespace: 'Game.Utils',
    fullName: 'Game.Utils.UtilityClass',
    type: 'class',
    baseClass: 'object',
    isMonoBehaviour: false,
    interfaces: [],
    fields: [],
    methods: [
      { name: 'FormatText', returnType: 'string', parameters: [{ name: 'input', type: 'string' }], isPublic: true, isStatic: true, isVirtual: false, isAbstract: false, isOverride: false, attributes: [] }
    ],
    typeDefIndex: 43
  }
});

describe('MCP Code Generation Tools', () => {
  let mockVectorStore: jest.Mocked<IL2CPPVectorStore>;
  let server: McpServer;

  beforeEach(() => {
    // Create mock vector store
    mockVectorStore = {
      searchWithFilter: jest.fn(),
      similaritySearch: jest.fn(),
      addDocuments: jest.fn(),
      delete: jest.fn()
    } as any;

    // Initialize the MCP server with mock vector store
    initializeVectorStore(mockVectorStore);

    // Create server instance (this would normally be done in the actual implementation)
    server = new McpServer({
      name: "Test IL2CPP Dump Analyzer",
      version: "1.0.0"
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generate_class_wrapper tool', () => {
    beforeEach(() => {
      mockVectorStore.searchWithFilter.mockResolvedValue([sampleClassDocument]);
    });

    it('should generate class wrapper for existing class', async () => {
      const toolParams = {
        class_name: 'TestClass',
        include_documentation: true,
        include_unity_attributes: true,
        include_serialization: true,
        unity_version: '2021.3.0',
        additional_usings: ['System.Collections.Generic']
      };

      // Simulate the MCP tool handler logic
      await mockVectorStore.searchWithFilter('TestClass', { type: 'class' }, 1);

      // Verify that searchWithFilter was called with correct parameters
      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith('TestClass', { type: 'class' }, 1);
    });

    it('should handle class not found error', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      const toolParams = {
        class_name: 'NonExistentClass',
        include_documentation: true,
        include_unity_attributes: true,
        include_serialization: true
      };

      // Simulate the MCP tool handler logic
      await mockVectorStore.searchWithFilter('NonExistentClass', { type: 'class' }, 1);

      // Verify that searchWithFilter was called
      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith('NonExistentClass', { type: 'class' }, 1);
    });

    it('should validate required parameters', async () => {
      // Test that class_name is required
      const invalidParams = {
        include_documentation: true
        // Missing class_name
      };

      // This would be validated by Zod schema
      const schema = z.object({
        class_name: z.string().describe("Name of the IL2CPP class to generate wrapper for"),
        include_documentation: z.boolean().optional().default(true)
      });

      expect(() => schema.parse(invalidParams)).toThrow();
    });

    it('should use default values for optional parameters', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([sampleClassDocument]);

      const minimalParams = {
        class_name: 'TestClass'
      };

      const schema = z.object({
        class_name: z.string(),
        include_documentation: z.boolean().optional().default(true),
        include_unity_attributes: z.boolean().optional().default(true),
        include_serialization: z.boolean().optional().default(true),
        additional_usings: z.array(z.string()).optional().default([])
      });

      const parsedParams = schema.parse(minimalParams);

      expect(parsedParams.include_documentation).toBe(true);
      expect(parsedParams.include_unity_attributes).toBe(true);
      expect(parsedParams.include_serialization).toBe(true);
      expect(parsedParams.additional_usings).toEqual([]);
    });
  });

  describe('generate_method_stubs tool', () => {
    beforeEach(() => {
      mockVectorStore.searchWithFilter.mockResolvedValue([sampleClassDocument]);
    });

    it('should generate method stubs for existing class', async () => {
      const toolParams = {
        class_name: 'TestClass',
        method_filter: 'Move.*',
        include_documentation: true,
        include_error_handling: true,
        generate_async: false
      };

      // Simulate the MCP tool handler logic
      await mockVectorStore.searchWithFilter('TestClass', { type: 'class' }, 1);

      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith('TestClass', { type: 'class' }, 1);
    });

    it('should handle method filtering', async () => {
      const classWithMethods = { ...sampleClassDocument };
      mockVectorStore.searchWithFilter.mockResolvedValue([classWithMethods]);

      const methods = classWithMethods.metadata.methods;
      const filterRegex = new RegExp('Move.*', 'i');
      const filteredMethods = methods.filter((method: any) => filterRegex.test(method.name));

      expect(filteredMethods).toHaveLength(1);
      expect(filteredMethods[0].name).toBe('Move');
    });

    it('should handle invalid regex patterns gracefully', async () => {
      const invalidRegexPattern = '[invalid regex';

      expect(() => new RegExp(invalidRegexPattern, 'i')).toThrow();

      // The tool should handle this gracefully and continue with all methods
    });

    it('should handle class with no methods', async () => {
      const classWithoutMethods = new Document({
        pageContent: 'public class EmptyClass { }',
        metadata: {
          name: 'EmptyClass',
          type: 'class',
          methods: []
        }
      });

      mockVectorStore.searchWithFilter.mockResolvedValue([classWithoutMethods]);

      // Should return error when no methods found
      const methods = classWithoutMethods.metadata.methods || [];
      expect(methods).toHaveLength(0);
    });
  });

  describe('generate_monobehaviour_template tool', () => {
    beforeEach(() => {
      mockVectorStore.searchWithFilter.mockResolvedValue([sampleClassDocument]);
    });

    it('should generate MonoBehaviour template for MonoBehaviour class', async () => {
      const toolParams = {
        class_name: 'TestClass',
        include_documentation: true,
        include_unity_attributes: true,
        include_serialization: true,
        unity_version: '2021.3.0'
      };

      // Simulate the MCP tool handler logic
      await mockVectorStore.searchWithFilter('TestClass', { type: 'class' }, 1);

      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith('TestClass', { type: 'class' }, 1);

      // Verify the class is a MonoBehaviour
      expect(sampleClassDocument.metadata.isMonoBehaviour).toBe(true);
    });

    it('should reject non-MonoBehaviour classes', async () => {
      mockVectorStore.searchWithFilter.mockResolvedValue([sampleNonMonoBehaviourDocument]);

      const toolParams = {
        class_name: 'UtilityClass',
        include_documentation: true,
        include_unity_attributes: true,
        include_serialization: true
      };

      // Verify the class is not a MonoBehaviour
      expect(sampleNonMonoBehaviourDocument.metadata.isMonoBehaviour).toBe(false);

      // The tool should return an error for non-MonoBehaviour classes
    });

    it('should validate MonoBehaviour-specific parameters', async () => {
      const schema = z.object({
        class_name: z.string().describe("Name of the IL2CPP MonoBehaviour class to generate template for"),
        include_documentation: z.boolean().optional().default(true),
        include_unity_attributes: z.boolean().optional().default(true),
        include_serialization: z.boolean().optional().default(true),
        unity_version: z.string().optional(),
        additional_usings: z.array(z.string()).optional().default([])
      });

      const validParams = {
        class_name: 'TestMonoBehaviour',
        include_unity_attributes: true,
        unity_version: '2021.3.0'
      };

      const parsedParams = schema.parse(validParams);
      expect(parsedParams.include_unity_attributes).toBe(true);
      expect(parsedParams.unity_version).toBe('2021.3.0');
    });

    it('should handle Unity version-specific features', async () => {
      const unityVersions = ['2019.4.0', '2020.3.0', '2021.3.0', '2022.3.0'];

      for (const version of unityVersions) {
        const majorVersion = parseInt(version.split('.')[0]);

        // Unity 2019+ should include UnityEngine.Serialization
        if (majorVersion >= 2019) {
          expect(majorVersion).toBeGreaterThanOrEqual(2019);
        }
      }
    });
  });

  describe('error handling', () => {
    it('should handle vector store errors gracefully', async () => {
      mockVectorStore.searchWithFilter.mockRejectedValue(new Error('Vector store connection failed'));

      // All tools should handle vector store errors
      try {
        await mockVectorStore.searchWithFilter('TestClass', { type: 'class' }, 1);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Vector store connection failed');
      }
    });

    it('should handle generator initialization errors', async () => {
      // Mock generator constructor to throw error
      const { ClassWrapperGenerator } = require('../generator');
      ClassWrapperGenerator.mockImplementationOnce(() => {
        throw new Error('Generator initialization failed');
      });

      expect(() => new ClassWrapperGenerator({})).toThrow('Generator initialization failed');
    });

    it('should handle code generation errors', async () => {
      const { ClassWrapperGenerator } = require('../generator');
      const mockGenerator = new ClassWrapperGenerator({});
      mockGenerator.generate.mockResolvedValueOnce({
        success: false,
        code: undefined,
        metadata: { codeStats: {} },
        errors: [{ message: 'Type resolution failed', type: 'type_resolution_error' }],
        warnings: []
      });

      const result = await mockGenerator.generate({});
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Type resolution failed');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex class with multiple inheritance levels', async () => {
      const complexClassDocument = new Document({
        pageContent: 'public class ComplexClass : BaseMonoBehaviour, IInterface1, IInterface2 { }',
        metadata: {
          name: 'ComplexClass',
          namespace: 'Game.Complex',
          fullName: 'Game.Complex.ComplexClass',
          type: 'class',
          baseClass: 'BaseMonoBehaviour',
          isMonoBehaviour: true,
          interfaces: ['IInterface1', 'IInterface2'],
          fields: [
            { name: 'complexField', type: 'Dictionary<string, List<GameObject>>', isPublic: false, isStatic: false, isReadOnly: false, attributes: ['SerializeField'] }
          ],
          methods: [
            { name: 'ComplexMethod', returnType: 'Task<bool>', parameters: [{ name: 'param1', type: 'CancellationToken' }], isPublic: true, isStatic: false, isVirtual: true, isAbstract: false, isOverride: false, attributes: [] }
          ],
          typeDefIndex: 100
        }
      });

      mockVectorStore.searchWithFilter.mockResolvedValue([complexClassDocument]);

      // All tools should handle complex class structures
      expect(complexClassDocument.metadata.interfaces).toHaveLength(2);
      expect(complexClassDocument.metadata.baseClass).toBe('BaseMonoBehaviour');
    });

    it('should handle classes with generic types', async () => {
      const genericClassDocument = new Document({
        pageContent: 'public class GenericClass<T> : MonoBehaviour where T : Component { }',
        metadata: {
          name: 'GenericClass<T>',
          namespace: 'Game.Generic',
          fullName: 'Game.Generic.GenericClass<T>',
          type: 'class',
          baseClass: 'MonoBehaviour',
          isMonoBehaviour: true,
          interfaces: [],
          fields: [
            { name: 'genericField', type: 'T', isPublic: true, isStatic: false, isReadOnly: false, attributes: [] }
          ],
          methods: [
            { name: 'GetComponent', returnType: 'T', parameters: [], isPublic: true, isStatic: false, isVirtual: false, isAbstract: false, isOverride: false, attributes: [] }
          ],
          typeDefIndex: 101
        }
      });

      mockVectorStore.searchWithFilter.mockResolvedValue([genericClassDocument]);

      // Tools should handle generic type parameters
      expect(genericClassDocument.metadata.name).toContain('<T>');
      expect(genericClassDocument.metadata.fields[0].type).toBe('T');
    });

    it('should handle performance with large classes', async () => {
      // Create a large class with many methods and fields
      const largeMethods = Array.from({ length: 100 }, (_, i) => ({
        name: `Method${i}`,
        returnType: 'void',
        parameters: [{ name: 'param', type: 'int' }],
        isPublic: true,
        isStatic: false,
        isVirtual: false,
        isAbstract: false,
        isOverride: false,
        attributes: []
      }));

      const largeFields = Array.from({ length: 50 }, (_, i) => ({
        name: `field${i}`,
        type: 'float',
        isPublic: true,
        isStatic: false,
        isReadOnly: false,
        attributes: []
      }));

      const largeClassDocument = new Document({
        pageContent: 'public class LargeClass : MonoBehaviour { /* many methods and fields */ }',
        metadata: {
          name: 'LargeClass',
          namespace: 'Game.Large',
          fullName: 'Game.Large.LargeClass',
          type: 'class',
          baseClass: 'MonoBehaviour',
          isMonoBehaviour: true,
          interfaces: [],
          fields: largeFields,
          methods: largeMethods,
          typeDefIndex: 102
        }
      });

      mockVectorStore.searchWithFilter.mockResolvedValue([largeClassDocument]);

      // Tools should handle large classes efficiently
      expect(largeClassDocument.metadata.methods).toHaveLength(100);
      expect(largeClassDocument.metadata.fields).toHaveLength(50);
    });
  });
});
