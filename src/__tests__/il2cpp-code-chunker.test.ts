/**
 * Comprehensive tests for IL2CPPCodeChunker
 * Tests semantic-aware chunking functionality for IL2CPP code entities
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { IL2CPPCodeChunker, CodeChunk } from '../embeddings/chunker';
import { IL2CPPClass, IL2CPPEnum, IL2CPPInterface, IL2CPPMethod, IL2CPPField, IL2CPPParameter } from '../parser/enhanced-types';

describe('IL2CPPCodeChunker', () => {
  let chunker: IL2CPPCodeChunker;

  beforeEach(() => {
    chunker = new IL2CPPCodeChunker();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default chunk sizes', () => {
      const defaultChunker = new IL2CPPCodeChunker();
      expect(defaultChunker).toBeDefined();
    });

    it('should initialize with custom chunk sizes', () => {
      const customChunker = new IL2CPPCodeChunker(2000, 400, 800, 150);
      expect(customChunker).toBeDefined();
    });
  });

  describe('Class Chunking', () => {
    it('should chunk a simple class correctly', async () => {
      // Arrange
      const mockClass: IL2CPPClass = {
        name: 'PlayerController',
        namespace: 'Game.Controllers',
        fullName: 'Game.Controllers.PlayerController',
        baseClass: 'MonoBehaviour',
        interfaces: [],
        fields: [
          {
            name: 'speed',
            type: 'float',
            isPublic: true,
            isStatic: false,
            isReadOnly: false,
            attributes: ['SerializeField'],
            offset: '0x10'
          }
        ],
        methods: [
          {
            name: 'Start',
            returnType: 'void',
            parameters: [],
            isPublic: false,
            isStatic: false,
            isVirtual: false,
            isAbstract: false,
            isOverride: false,
            attributes: [],
            rva: '0x1234',
            offset: '0x5678'
          }
        ],
        isMonoBehaviour: true,
        typeDefIndex: 123
      };

      // Act
      const chunks = await chunker.chunkClass(mockClass);

      // Assert
      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);

      // Check class chunk
      const classChunk = chunks.find(chunk => chunk.metadata.type === 'class');
      expect(classChunk).toBeDefined();
      expect(classChunk!.metadata.name).toBe('PlayerController');
      expect(classChunk!.metadata.namespace).toBe('Game.Controllers');
      expect(classChunk!.metadata.isMonoBehaviour).toBe(true);
      expect(classChunk!.metadata.typeDefIndex).toBe(123);
      expect(classChunk!.text).toContain('PlayerController');
      expect(classChunk!.text).toContain('MonoBehaviour');

      // Check method chunk
      const methodChunk = chunks.find(chunk => chunk.metadata.type === 'method');
      expect(methodChunk).toBeDefined();
      expect(methodChunk!.metadata.name).toBe('Start');
      expect(methodChunk!.metadata.parentClass).toBe('PlayerController');
    });

    it('should handle class with multiple interfaces', async () => {
      // Arrange
      const mockClass: IL2CPPClass = {
        name: 'GameManager',
        namespace: 'Game.Core',
        fullName: 'Game.Core.GameManager',
        baseClass: 'MonoBehaviour',
        interfaces: ['IGameManager', 'IDisposable'],
        fields: [],
        methods: [],
        isMonoBehaviour: true,
        typeDefIndex: 456
      };

      // Act
      const chunks = await chunker.chunkClass(mockClass);

      // Assert
      expect(chunks).toBeDefined();
      const classChunk = chunks.find(chunk => chunk.metadata.type === 'class');
      expect(classChunk!.text).toContain('IGameManager');
      expect(classChunk!.text).toContain('IDisposable');
    });

    it('should handle class without namespace', async () => {
      // Arrange
      const mockClass: IL2CPPClass = {
        name: 'SimpleClass',
        namespace: '',
        fullName: 'SimpleClass',
        interfaces: [],
        fields: [],
        methods: [],
        isMonoBehaviour: false,
        typeDefIndex: 789
      };

      // Act
      const chunks = await chunker.chunkClass(mockClass);

      // Assert
      expect(chunks).toBeDefined();
      const classChunk = chunks.find(chunk => chunk.metadata.type === 'class');
      expect(classChunk!.metadata.namespace).toBe('');
      expect(classChunk!.text).toContain('SimpleClass');
    });
  });

  describe('Method Chunking', () => {
    it('should chunk a method with parameters correctly', async () => {
      // Arrange
      const mockMethod: IL2CPPMethod = {
        name: 'MovePlayer',
        returnType: 'void',
        parameters: [
          { name: 'direction', type: 'Vector3' },
          { name: 'speed', type: 'float' }
        ],
        isPublic: true,
        isStatic: false,
        isVirtual: false,
        isAbstract: false,
        isOverride: false,
        attributes: [],
        rva: '0xABCD',
        offset: '0xEF01'
      };

      const mockParentClass: IL2CPPClass = {
        name: 'PlayerController',
        namespace: 'Game.Controllers',
        fullName: 'Game.Controllers.PlayerController',
        interfaces: [],
        fields: [],
        methods: [mockMethod],
        isMonoBehaviour: true,
        typeDefIndex: 123
      };

      // Act
      const chunks = await chunker.chunkMethod(mockMethod, mockParentClass);

      // Assert
      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);

      const methodChunk = chunks[0];
      expect(methodChunk.metadata.type).toBe('method');
      expect(methodChunk.metadata.name).toBe('MovePlayer');
      expect(methodChunk.metadata.returnType).toBe('void');
      expect(methodChunk.metadata.parentClass).toBe('PlayerController');
      expect(methodChunk.metadata.parentNamespace).toBe('Game.Controllers');
      expect(methodChunk.metadata.fullName).toBe('Game.Controllers.PlayerController.MovePlayer');
      expect(methodChunk.metadata.parameters).toBe('Vector3 direction, float speed');
      expect(methodChunk.metadata.rva).toBe('0xABCD');
      expect(methodChunk.metadata.offset).toBe('0xEF01');
      expect(methodChunk.text).toContain('MovePlayer');
      expect(methodChunk.text).toContain('PlayerController');
    });

    it('should handle static and virtual methods', async () => {
      // Arrange
      const mockMethod: IL2CPPMethod = {
        name: 'GetInstance',
        returnType: 'GameManager',
        parameters: [],
        isPublic: true,
        isStatic: true,
        isVirtual: true,
        isAbstract: false,
        isOverride: true,
        attributes: ['Obsolete'],
        rva: '0x1111',
        offset: '0x2222'
      };

      const mockParentClass: IL2CPPClass = {
        name: 'GameManager',
        namespace: 'Game.Core',
        fullName: 'Game.Core.GameManager',
        interfaces: [],
        fields: [],
        methods: [mockMethod],
        isMonoBehaviour: false,
        typeDefIndex: 456
      };

      // Act
      const chunks = await chunker.chunkMethod(mockMethod, mockParentClass);

      // Assert
      expect(chunks).toBeDefined();
      const methodChunk = chunks[0];
      expect(methodChunk.metadata.isStatic).toBe(true);
      expect(methodChunk.metadata.isVirtual).toBe(true);
      expect(methodChunk.metadata.isOverride).toBe(true);
      expect(methodChunk.metadata.isMonoBehaviour).toBe(false);
    });
  });

  describe('Enum Chunking', () => {
    it('should chunk an enum correctly', async () => {
      // Arrange
      const mockEnum: IL2CPPEnum = {
        name: 'GameState',
        namespace: 'Game.Core',
        fullName: 'Game.Core.GameState',
        values: [
          { name: 'Menu', value: '0' },
          { name: 'Playing', value: '1' },
          { name: 'Paused', value: '2' },
          { name: 'GameOver', value: '3' }
        ],
        typeDefIndex: 789
      };

      // Act
      const chunks = await chunker.chunkEnum(mockEnum);

      // Assert
      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);

      const enumChunk = chunks[0];
      expect(enumChunk.metadata.type).toBe('enum');
      expect(enumChunk.metadata.name).toBe('GameState');
      expect(enumChunk.metadata.namespace).toBe('Game.Core');
      expect(enumChunk.metadata.fullName).toBe('Game.Core.GameState');
      expect(enumChunk.metadata.typeDefIndex).toBe(789);
      expect(enumChunk.text).toContain('GameState');
      expect(enumChunk.text).toContain('Menu = 0');
      expect(enumChunk.text).toContain('Playing = 1');
    });

    it('should handle enum without namespace', async () => {
      // Arrange
      const mockEnum: IL2CPPEnum = {
        name: 'Direction',
        namespace: '',
        fullName: 'Direction',
        values: [
          { name: 'North', value: '0' },
          { name: 'South', value: '1' }
        ],
        typeDefIndex: 101
      };

      // Act
      const chunks = await chunker.chunkEnum(mockEnum);

      // Assert
      expect(chunks).toBeDefined();
      const enumChunk = chunks[0];
      expect(enumChunk.metadata.namespace).toBe('');
      expect(enumChunk.text).toContain('Direction');
      expect(enumChunk.text).not.toContain('namespace');
    });
  });

  describe('Interface Chunking', () => {
    it('should chunk an interface correctly', async () => {
      // Arrange
      const mockInterface: IL2CPPInterface = {
        name: 'IGameManager',
        namespace: 'Game.Core',
        fullName: 'Game.Core.IGameManager',
        methods: [
          {
            name: 'StartGame',
            returnType: 'void',
            parameters: [],
            isPublic: true,
            isStatic: false,
            isVirtual: false,
            isAbstract: true,
            isOverride: false,
            attributes: [],
            rva: '',
            offset: ''
          },
          {
            name: 'EndGame',
            returnType: 'void',
            parameters: [{ name: 'reason', type: 'string' }],
            isPublic: true,
            isStatic: false,
            isVirtual: false,
            isAbstract: true,
            isOverride: false,
            attributes: [],
            rva: '',
            offset: ''
          }
        ],
        typeDefIndex: 555
      };

      // Act
      const chunks = await chunker.chunkInterface(mockInterface);

      // Assert
      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);

      const interfaceChunk = chunks[0];
      expect(interfaceChunk.metadata.type).toBe('interface');
      expect(interfaceChunk.metadata.name).toBe('IGameManager');
      expect(interfaceChunk.metadata.namespace).toBe('Game.Core');
      expect(interfaceChunk.metadata.fullName).toBe('Game.Core.IGameManager');
      expect(interfaceChunk.metadata.typeDefIndex).toBe(555);
      expect(interfaceChunk.text).toContain('IGameManager');
      expect(interfaceChunk.text).toContain('StartGame');
      expect(interfaceChunk.text).toContain('EndGame');
      expect(interfaceChunk.text).toContain('string reason');
    });

    it('should handle interface without methods', async () => {
      // Arrange
      const mockInterface: IL2CPPInterface = {
        name: 'IMarker',
        namespace: 'Game.Interfaces',
        fullName: 'Game.Interfaces.IMarker',
        methods: [],
        typeDefIndex: 666
      };

      // Act
      const chunks = await chunker.chunkInterface(mockInterface);

      // Assert
      expect(chunks).toBeDefined();
      const interfaceChunk = chunks[0];
      expect(interfaceChunk.metadata.name).toBe('IMarker');
      expect(interfaceChunk.text).toContain('IMarker');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle class with empty fields and methods arrays', async () => {
      // Arrange
      const mockClass: IL2CPPClass = {
        name: 'EmptyClass',
        namespace: 'Test',
        fullName: 'Test.EmptyClass',
        interfaces: [],
        fields: [],
        methods: [],
        isMonoBehaviour: false,
        typeDefIndex: 999
      };

      // Act
      const chunks = await chunker.chunkClass(mockClass);

      // Assert
      expect(chunks).toBeDefined();
      expect(chunks.length).toBe(1); // Only class chunk, no method chunks
      expect(chunks[0].metadata.type).toBe('class');
    });

    it('should handle method with no parameters', async () => {
      // Arrange
      const mockMethod: IL2CPPMethod = {
        name: 'Initialize',
        returnType: 'void',
        parameters: [],
        isPublic: true,
        isStatic: false,
        isVirtual: false,
        isAbstract: false,
        isOverride: false,
        attributes: [],
        rva: '0x0000',
        offset: '0x0000'
      };

      const mockParentClass: IL2CPPClass = {
        name: 'TestClass',
        namespace: 'Test',
        fullName: 'Test.TestClass',
        interfaces: [],
        fields: [],
        methods: [mockMethod],
        isMonoBehaviour: false,
        typeDefIndex: 111
      };

      // Act
      const chunks = await chunker.chunkMethod(mockMethod, mockParentClass);

      // Assert
      expect(chunks).toBeDefined();
      expect(chunks[0].metadata.parameters).toBe('');
    });

    it('should handle enum with no values', async () => {
      // Arrange
      const mockEnum: IL2CPPEnum = {
        name: 'EmptyEnum',
        namespace: 'Test',
        fullName: 'Test.EmptyEnum',
        values: [],
        typeDefIndex: 222
      };

      // Act
      const chunks = await chunker.chunkEnum(mockEnum);

      // Assert
      expect(chunks).toBeDefined();
      expect(chunks[0].metadata.name).toBe('EmptyEnum');
      expect(chunks[0].text).toContain('EmptyEnum');
    });
  });

  describe('Metadata Preservation', () => {
    it('should preserve all class metadata in chunks', async () => {
      // Arrange
      const mockClass: IL2CPPClass = {
        name: 'TestClass',
        namespace: 'Test.Namespace',
        fullName: 'Test.Namespace.TestClass',
        baseClass: 'BaseClass',
        interfaces: ['IInterface1', 'IInterface2'],
        fields: [],
        methods: [],
        isMonoBehaviour: true,
        isStruct: false,
        typeDefIndex: 12345,
        isNested: true,
        parentType: 'ParentClass',
        isCompilerGenerated: false,
        accessModifier: 'public',
        attributes: ['Serializable', 'Obsolete']
      };

      // Act
      const chunks = await chunker.chunkClass(mockClass);

      // Assert
      const classChunk = chunks.find(chunk => chunk.metadata.type === 'class');
      expect(classChunk!.metadata.name).toBe('TestClass');
      expect(classChunk!.metadata.namespace).toBe('Test.Namespace');
      expect(classChunk!.metadata.fullName).toBe('Test.Namespace.TestClass');
      expect(classChunk!.metadata.isMonoBehaviour).toBe(true);
      expect(classChunk!.metadata.typeDefIndex).toBe(12345);
    });

    it('should preserve all method metadata in chunks', async () => {
      // Arrange
      const mockMethod: IL2CPPMethod = {
        name: 'TestMethod',
        returnType: 'bool',
        parameters: [{ name: 'param1', type: 'int' }],
        isPublic: false,
        isPrivate: true,
        isStatic: true,
        isVirtual: true,
        isAbstract: false,
        isOverride: true,
        attributes: ['TestAttribute'],
        rva: '0xDEAD',
        offset: '0xBEEF'
      };

      const mockParentClass: IL2CPPClass = {
        name: 'ParentClass',
        namespace: 'Test',
        fullName: 'Test.ParentClass',
        interfaces: [],
        fields: [],
        methods: [mockMethod],
        isMonoBehaviour: true,
        typeDefIndex: 54321
      };

      // Act
      const chunks = await chunker.chunkMethod(mockMethod, mockParentClass);

      // Assert
      const methodChunk = chunks[0];
      expect(methodChunk.metadata.name).toBe('TestMethod');
      expect(methodChunk.metadata.returnType).toBe('bool');
      expect(methodChunk.metadata.isStatic).toBe(true);
      expect(methodChunk.metadata.isVirtual).toBe(true);
      expect(methodChunk.metadata.isOverride).toBe(true);
      expect(methodChunk.metadata.isAbstract).toBe(false);
      expect(methodChunk.metadata.rva).toBe('0xDEAD');
      expect(methodChunk.metadata.offset).toBe('0xBEEF');
      expect(methodChunk.metadata.parameters).toBe('int param1');
      expect(methodChunk.metadata.typeDefIndex).toBe(54321);
      expect(methodChunk.metadata.isMonoBehaviour).toBe(true);
    });
  });

  describe('Performance and Large Data Handling', () => {
    it('should handle class with many methods efficiently', async () => {
      // Arrange
      const largeMethods: IL2CPPMethod[] = Array(100).fill(null).map((_, i) => ({
        name: `Method${i}`,
        returnType: 'void',
        parameters: [],
        isPublic: true,
        isStatic: false,
        isVirtual: false,
        isAbstract: false,
        isOverride: false,
        attributes: [],
        rva: `0x${i.toString(16)}`,
        offset: `0x${(i * 4).toString(16)}`
      }));

      const mockClass: IL2CPPClass = {
        name: 'LargeClass',
        namespace: 'Test',
        fullName: 'Test.LargeClass',
        interfaces: [],
        fields: [],
        methods: largeMethods,
        isMonoBehaviour: false,
        typeDefIndex: 99999
      };

      // Act
      const startTime = Date.now();
      const chunks = await chunker.chunkClass(mockClass);
      const endTime = Date.now();

      // Assert
      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThanOrEqual(101); // At least 1 class chunk + 100 method chunks
      expect(chunks.length).toBeLessThanOrEqual(110); // Allow for text splitter creating additional chunks
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second

      // Verify we have the expected types of chunks
      const classChunks = chunks.filter(chunk => chunk.metadata.type === 'class');
      const methodChunks = chunks.filter(chunk => chunk.metadata.type === 'method');
      expect(classChunks.length).toBeGreaterThanOrEqual(1);
      expect(methodChunks.length).toBeGreaterThanOrEqual(100);
    });

    it('should handle enum with many values efficiently', async () => {
      // Arrange
      const largeValues = Array(1000).fill(null).map((_, i) => ({
        name: `Value${i}`,
        value: i.toString()
      }));

      const mockEnum: IL2CPPEnum = {
        name: 'LargeEnum',
        namespace: 'Test',
        fullName: 'Test.LargeEnum',
        values: largeValues,
        typeDefIndex: 88888
      };

      // Act
      const startTime = Date.now();
      const chunks = await chunker.chunkEnum(mockEnum);
      const endTime = Date.now();

      // Assert
      expect(chunks).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
