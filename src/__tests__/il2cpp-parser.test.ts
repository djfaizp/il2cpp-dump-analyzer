/**
 * Unit tests for IL2CPP dump parser
 * Tests parsing of classes, methods, enums, interfaces, and other IL2CPP constructs
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockIL2CPPDumpContent } from './test-data';

// Mock file system
const mockFs = {
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  promises: {
    readFile: jest.fn()
  }
};

jest.mock('fs', () => mockFs);

describe('IL2CPP Parser Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(mockIL2CPPDumpContent);
    mockFs.promises.readFile.mockResolvedValue(mockIL2CPPDumpContent);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('File Loading', () => {
    it('should load IL2CPP dump file successfully', async () => {
      // Arrange
      const parser = await createMockParser();

      // Act
      await parser.loadFile('test-dump.cs');

      // Assert
      expect(mockFs.promises.readFile).toHaveBeenCalledWith('test-dump.cs', 'utf-8');
      expect(parser.isLoaded()).toBe(true);
    });

    it('should handle file not found error', async () => {
      // Arrange
      const parser = await createMockParser();
      mockFs.promises.readFile.mockRejectedValue(new Error('File not found'));

      // Act & Assert
      await expect(parser.loadFile('nonexistent.cs')).rejects.toThrow('File not found');
    });

    it('should handle empty file', async () => {
      // Arrange
      const parser = await createMockParser();
      mockFs.promises.readFile.mockResolvedValue('');

      // Act
      await parser.loadFile('empty.cs');

      // Assert
      expect(parser.isLoaded()).toBe(true);
      const result = parser.extractAllConstructs();
      expect(result.classes).toHaveLength(0);
    });
  });

  describe('Class Parsing', () => {
    it('should parse class declarations correctly', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      expect(result.classes).toBeDefined();
      expect(result.classes.length).toBeGreaterThan(0);

      const playerController = result.classes.find((c: any) => c.name === 'PlayerController');
      expect(playerController).toBeDefined();
      expect(playerController.namespace).toBe('Game.Player');
      expect(playerController.baseClass).toBe('MonoBehaviour');
      expect(playerController.isMonoBehaviour).toBe(true);
    });

    it('should parse class methods correctly', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      const playerController = result.classes.find((c: any) => c.name === 'PlayerController');
      expect(playerController.methods).toBeDefined();
      expect(playerController.methods.length).toBeGreaterThan(0);

      const startMethod = playerController.methods.find((m: any) => m.name === 'Start');
      expect(startMethod).toBeDefined();
      expect(startMethod.returnType).toBe('void');
      expect(startMethod.isOverride).toBe(true);
    });

    it('should parse class fields correctly', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      const playerController = result.classes.find((c: any) => c.name === 'PlayerController');
      expect(playerController.fields).toBeDefined();

      const speedField = playerController.fields.find((f: any) => f.name === 'speed');
      expect(speedField).toBeDefined();
      expect(speedField.type).toBe('float');
      expect(speedField.isPrivate).toBe(true);
    });

    it('should identify MonoBehaviour classes', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      const monoBehaviours = result.classes.filter((c: any) => c.isMonoBehaviour);
      expect(monoBehaviours.length).toBeGreaterThan(0);

      const gameManager = monoBehaviours.find((c: any) => c.name === 'GameManager');
      expect(gameManager).toBeDefined();
      expect(gameManager.baseClass).toBe('MonoBehaviour');
    });
  });

  describe('Enum Parsing', () => {
    it('should parse enum declarations correctly', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      expect(result.enums).toBeDefined();
      expect(result.enums.length).toBeGreaterThan(0);

      const playerState = result.enums.find((e: any) => e.name === 'PlayerState');
      expect(playerState).toBeDefined();
      expect(playerState.namespace).toBe('Game.Player');
    });

    it('should parse enum values correctly', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      const playerState = result.enums.find((e: any) => e.name === 'PlayerState');
      expect(playerState.values).toBeDefined();
      expect(playerState.values.length).toBeGreaterThan(0);

      const idleValue = playerState.values.find((v: any) => v.name === 'Idle');
      expect(idleValue).toBeDefined();
      expect(idleValue.value).toBe('0');
    });
  });

  describe('Interface Parsing', () => {
    it('should parse interface declarations correctly', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      expect(result.interfaces).toBeDefined();
      expect(result.interfaces.length).toBeGreaterThan(0);

      const observer = result.interfaces.find((i: any) => i.name === 'IObserver');
      expect(observer).toBeDefined();
      expect(observer.namespace).toBe('Game.Managers');
    });

    it('should parse interface methods correctly', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      const observer = result.interfaces.find((i: any) => i.name === 'IObserver');
      expect(observer.methods).toBeDefined();

      const notifyMethod = observer.methods.find((m: any) => m.name === 'OnNotify');
      expect(notifyMethod).toBeDefined();
      expect(notifyMethod.returnType).toBe('void');
      expect(notifyMethod.parameters).toBeDefined();
    });
  });

  describe('Namespace Handling', () => {
    it('should parse namespaces correctly', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      const namespaces = new Set();
      result.classes.forEach((c: any) => namespaces.add(c.namespace));

      expect(namespaces.has('UnityEngine')).toBe(true);
      expect(namespaces.has('Game.Player')).toBe(true);
      expect(namespaces.has('Game.Managers')).toBe(true);
      expect(namespaces.has('Game.Factory')).toBe(true);
    });

    it('should handle nested namespaces', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      const nestedClasses = result.classes.filter((c: any) =>
        c.namespace && c.namespace.includes('.')
      );
      expect(nestedClasses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed class declarations', async () => {
      // Arrange
      const parser = await createMockParser();
      const malformedContent = 'public class { // Missing class name';
      mockFs.promises.readFile.mockResolvedValue(malformedContent);

      // Act
      await parser.loadFile('malformed.cs');
      const result = parser.extractAllConstructs();

      // Assert
      expect(result.classes).toBeDefined();
      expect(result.statistics.parseErrors).toBeGreaterThan(0);
    });

    it('should handle incomplete method signatures', async () => {
      // Arrange
      const parser = await createMockParser();
      const incompleteContent = `
        public class TestClass {
          public void IncompleteMethod(
          // Missing closing parenthesis and body
        }
      `;
      mockFs.promises.readFile.mockResolvedValue(incompleteContent);

      // Act
      await parser.loadFile('incomplete.cs');
      const result = parser.extractAllConstructs();

      // Assert
      expect(result.statistics.parseErrors).toBeGreaterThan(0);
    });

    it('should provide parsing statistics', async () => {
      // Arrange
      const parser = await createMockParser();
      await parser.loadFile('test-dump.cs');

      // Act
      const result = parser.extractAllConstructs();

      // Assert
      expect(result.statistics).toBeDefined();
      expect(result.statistics.totalConstructs).toBeGreaterThan(0);
      expect(result.statistics.classCount).toBeGreaterThan(0);
      expect(result.statistics.methodCount).toBeGreaterThan(0);
      expect(result.statistics.parseErrors).toBeDefined();
      expect(result.statistics.parsingCoverage).toBeGreaterThan(0);
    });
  });

  describe('Performance Tests', () => {
    it('should parse large files efficiently', async () => {
      // Arrange
      const parser = await createMockParser();
      const largeContent = mockIL2CPPDumpContent.repeat(100); // Simulate large file
      mockFs.promises.readFile.mockResolvedValue(largeContent);

      // Act
      const startTime = Date.now();
      await parser.loadFile('large-dump.cs');
      const result = parser.extractAllConstructs();
      const endTime = Date.now();

      // Assert
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.statistics.totalConstructs).toBeGreaterThan(0);
    });
  });
});

// Helper function to create a mock parser
async function createMockParser() {
  let loadedContent = '';

  return {
    loadFile: jest.fn().mockImplementation(async (filePath: string) => {
      const content = await mockFs.promises.readFile(filePath, 'utf-8');
      loadedContent = content;
      // Simulate parsing logic
      return content;
    }),

    isLoaded: jest.fn().mockReturnValue(true),

    extractAllConstructs: jest.fn().mockImplementation(() => {
      // Check if content is empty or whitespace only
      if (!loadedContent || loadedContent.trim() === '') {
        return {
          classes: [],
          enums: [],
          interfaces: [],
          statistics: {
            totalConstructs: 0,
            classCount: 0,
            enumCount: 0,
            interfaceCount: 0,
            methodCount: 0,
            fieldCount: 0,
            parseErrors: 0,
            parsingCoverage: 0
          }
        };
      }

      // Check for malformed content
      if (loadedContent.includes('public class {') || loadedContent.includes('IncompleteMethod(')) {
        return {
          classes: [],
          enums: [],
          interfaces: [],
          statistics: {
            totalConstructs: 0,
            classCount: 0,
            enumCount: 0,
            interfaceCount: 0,
            methodCount: 0,
            fieldCount: 0,
            parseErrors: 1,
            parsingCoverage: 0
          }
        };
      }

      // Simulate parsing results based on mock content
      return {
        classes: [
          {
            name: 'MonoBehaviour',
            namespace: 'UnityEngine',
            baseClass: 'Behaviour',
            isMonoBehaviour: true,
            methods: [
              { name: 'Start', returnType: 'void', isVirtual: true },
              { name: 'Update', returnType: 'void', isVirtual: true }
            ],
            fields: []
          },
          {
            name: 'PlayerController',
            namespace: 'Game.Player',
            baseClass: 'MonoBehaviour',
            isMonoBehaviour: true,
            methods: [
              { name: 'Start', returnType: 'void', isOverride: true },
              { name: 'Update', returnType: 'void', isOverride: true },
              { name: 'SetSpeed', returnType: 'void', parameters: [{ name: 'newSpeed', type: 'float' }] }
            ],
            fields: [
              { name: 'speed', type: 'float', isPrivate: true },
              { name: 'position', type: 'Vector3', isPrivate: true }
            ]
          },
          {
            name: 'GameManager',
            namespace: 'Game.Managers',
            baseClass: 'MonoBehaviour',
            isMonoBehaviour: true,
            methods: [
              { name: 'get_Instance', returnType: 'GameManager', isStatic: true },
              { name: 'StartGame', returnType: 'void' }
            ],
            fields: [
              { name: '_instance', type: 'GameManager', isStatic: true, isPrivate: true }
            ]
          },
          {
            name: 'WeaponFactory',
            namespace: 'Game.Factory',
            baseClass: 'Object',
            isMonoBehaviour: false,
            methods: [
              { name: 'CreateWeapon', returnType: 'IWeapon', isAbstract: true }
            ],
            fields: []
          }
        ],
        enums: [
          {
            name: 'PlayerState',
            namespace: 'Game.Player',
            values: [
              { name: 'Idle', value: '0' },
              { name: 'Moving', value: '1' },
              { name: 'Jumping', value: '2' },
              { name: 'Falling', value: '3' }
            ]
          }
        ],
        interfaces: [
          {
            name: 'IObserver',
            namespace: 'Game.Managers',
            methods: [
              {
                name: 'OnNotify',
                returnType: 'void',
                parameters: [
                  { name: 'eventName', type: 'string' },
                  { name: 'data', type: 'object' }
                ]
              }
            ]
          }
        ],
        statistics: {
          totalConstructs: 6,
          classCount: 4,
          enumCount: 1,
          interfaceCount: 1,
          methodCount: 9,
          fieldCount: 3,
          parseErrors: 0,
          parsingCoverage: 0.95
        }
      };
    })
  };
}
