/**
 * Unit tests for MonoBehaviour Generator
 * Tests Unity MonoBehaviour template generation from IL2CPP MonoBehaviour classes
 */

import { MonoBehaviourGenerator } from '../generator/monobehaviour-generator';
import {
  CodeGenerationRequest,
  GenerationType,
  GenerationOptions,
  GenerationContext,
  FileNamingConvention,
  CodeStyleOptions,
  TemplateEngine
} from '../generator/types';
import { IL2CPPClass, IL2CPPField, IL2CPPMethod } from '../parser/enhanced-types';

// Mock generation context
const mockContext: GenerationContext = {
  request: {} as CodeGenerationRequest,
  templates: new Map(),
  typeResolver: {
    resolveType: (type: string) => type.replace(/System\./, ''),
    isUnityType: (type: string) => type.includes('Unity') || type.includes('GameObject'),
    getUsingsForType: (type: string) => {
      if (type.includes('Unity') || type.includes('GameObject')) {
        return ['using UnityEngine;'];
      }
      if (type.includes('System')) {
        return ['using System;'];
      }
      return [];
    },
    resolveGenericType: (type: string, genericArgs: string[]) => `${type}<${genericArgs.join(', ')}>`
  },
  utils: {
    toNamingConvention: (str: string, convention: FileNamingConvention) => str,
    generateXmlDoc: (description: string) => `/// <summary>\n/// ${description}\n/// </summary>`,
    formatCode: (code: string) => code,
    validateCSharpSyntax: () => ({ isValid: true, errors: [], warnings: [] })
  }
};

// Default generation options
const defaultOptions: GenerationOptions = {
  includeDocumentation: true,
  includeUnityAttributes: true,
  includeSerialization: true,
  generateAsync: false,
  includeErrorHandling: false,
  additionalUsings: [],
  codeStyle: {
    indentation: 'spaces',
    indentSize: 4,
    lineEnding: '\n',
    braceStyle: 'new_line',
    maxLineLength: 120
  } as CodeStyleOptions
};

// Sample MonoBehaviour class data
const sampleMonoBehaviour: IL2CPPClass = {
  name: 'PlayerController',
  namespace: 'Game.Player',
  fullName: 'Game.Player.PlayerController',
  baseClass: 'MonoBehaviour',
  interfaces: [],
  fields: [
    {
      name: 'speed',
      type: 'float',
      isPublic: true,
      isStatic: false,
      isReadOnly: false,
      attributes: [],
      offset: '0x10'
    },
    {
      name: 'playerTransform',
      type: 'Transform',
      isPublic: false,
      isStatic: false,
      isReadOnly: false,
      attributes: ['SerializeField'],
      offset: '0x18'
    },
    {
      name: 'isGrounded',
      type: 'bool',
      isPublic: false,
      isStatic: false,
      isReadOnly: false,
      attributes: [],
      offset: '0x20'
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
    },
    {
      name: 'Update',
      returnType: 'void',
      parameters: [],
      isPublic: false,
      isStatic: false,
      isVirtual: false,
      isAbstract: false,
      isOverride: false,
      attributes: [],
      rva: '0x2345',
      offset: '0x6789'
    },
    {
      name: 'Move',
      returnType: 'void',
      parameters: [
        { name: 'direction', type: 'Vector3' },
        { name: 'deltaTime', type: 'float' }
      ],
      isPublic: true,
      isStatic: false,
      isVirtual: false,
      isAbstract: false,
      isOverride: false,
      attributes: [],
      rva: '0x3456',
      offset: '0x789A'
    }
  ],
  isMonoBehaviour: true,
  typeDefIndex: 42
};

describe('MonoBehaviourGenerator', () => {
  let generator: MonoBehaviourGenerator;

  beforeEach(() => {
    generator = new MonoBehaviourGenerator(mockContext);
  });

  describe('validateRequest', () => {
    it('should validate correct MonoBehaviour generation request', async () => {
      const request: CodeGenerationRequest = {
        id: 'test-1',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: sampleMonoBehaviour,
        options: defaultOptions,
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const result = await generator['validateRequest'](request);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-MonoBehaviour classes', async () => {
      const nonMonoBehaviour = { ...sampleMonoBehaviour, isMonoBehaviour: false };
      const request: CodeGenerationRequest = {
        id: 'test-2',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: nonMonoBehaviour,
        options: defaultOptions,
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const result = await generator['validateRequest'](request);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.message.includes('must be a MonoBehaviour'))).toBe(true);
    });

    it('should reject wrong generation type', async () => {
      const request: CodeGenerationRequest = {
        id: 'test-3',
        type: GenerationType.CLASS_WRAPPER,
        source: sampleMonoBehaviour,
        options: defaultOptions,
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const result = await generator['validateRequest'](request);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(err => err.message.includes('Invalid generation type'))).toBe(true);
    });

    it('should warn about non-PascalCase class names', async () => {
      const badNameClass = { ...sampleMonoBehaviour, name: 'playerController' };
      const request: CodeGenerationRequest = {
        id: 'test-4',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: badNameClass,
        options: defaultOptions,
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const result = await generator['validateRequest'](request);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(warning => warning.includes('PascalCase'))).toBe(true);
    });
  });

  describe('parseSourceEntity', () => {
    it('should parse MonoBehaviour class correctly', async () => {
      const request: CodeGenerationRequest = {
        id: 'test-5',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: sampleMonoBehaviour,
        options: defaultOptions,
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const result = await generator['parseSourceEntity'](request);

      expect(result.name).toBe('PlayerController');
      expect(result.namespace).toBe('Game.Player');
      expect(result.baseClass).toBe('MonoBehaviour');
      expect(result.usings.has('using UnityEngine;')).toBe(true);
      expect(result.usings.has('using System;')).toBe(true);
    });

    it('should categorize fields correctly', async () => {
      const request: CodeGenerationRequest = {
        id: 'test-6',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: sampleMonoBehaviour,
        options: defaultOptions,
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const result = await generator['parseSourceEntity'](request);

      // speed (public float) should be serializable
      expect(result.serializableFields.some(f => f.name === 'speed')).toBe(true);
      // playerTransform (private with SerializeField) should be serializable
      expect(result.serializableFields.some(f => f.name === 'playerTransform')).toBe(true);
      // isGrounded (private bool without SerializeField) should not be serializable
      expect(result.serializableFields.some(f => f.name === 'isGrounded')).toBe(false);
    });

    it('should categorize methods correctly', async () => {
      const request: CodeGenerationRequest = {
        id: 'test-7',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: sampleMonoBehaviour,
        options: defaultOptions,
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const result = await generator['parseSourceEntity'](request);

      // Start and Update should be lifecycle methods
      expect(result.lifecycleMethods.some(m => m.name === 'Start')).toBe(true);
      expect(result.lifecycleMethods.some(m => m.name === 'Update')).toBe(true);
      // Move should be a custom method
      expect(result.customMethods.some(m => m.name === 'Move')).toBe(true);
    });
  });

  describe('generateCode', () => {
    it('should generate complete MonoBehaviour template', async () => {
      const request: CodeGenerationRequest = {
        id: 'test-8',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: sampleMonoBehaviour,
        options: defaultOptions,
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const parsedEntity = await generator['parseSourceEntity'](request);
      const result = await generator['generateCode'](parsedEntity, defaultOptions);

      // Check basic structure
      expect(result).toContain('using UnityEngine;');
      expect(result).toContain('namespace Game.Player');
      expect(result).toContain('public class PlayerController : MonoBehaviour');

      // Check serializable fields
      expect(result).toContain('public float speed;');
      expect(result).toContain('[SerializeField]');
      expect(result).toContain('private Transform playerTransform;');

      // Check lifecycle methods
      expect(result).toContain('private void Start()');
      expect(result).toContain('private void Update()');

      // Check custom methods
      expect(result).toContain('public void Move(Vector3 direction, float deltaTime)');
    });

    it('should include XML documentation when requested', async () => {
      const request: CodeGenerationRequest = {
        id: 'test-9',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: sampleMonoBehaviour,
        options: { ...defaultOptions, includeDocumentation: true },
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const parsedEntity = await generator['parseSourceEntity'](request);
      const result = await generator['generateCode'](parsedEntity, request.options);

      expect(result).toContain('/// <summary>');
      expect(result).toContain('/// Unity MonoBehaviour template generated from PlayerController');
      expect(result).toContain('/// IL2CPP TypeDefIndex: 42');
      expect(result).toContain('#region Serialized Fields');
      expect(result).toContain('#region Unity Lifecycle Methods');
      expect(result).toContain('#region Custom Methods');
    });

    it('should handle MonoBehaviour without namespace', async () => {
      const noNamespaceClass = { ...sampleMonoBehaviour, namespace: '', fullName: 'PlayerController' };
      const request: CodeGenerationRequest = {
        id: 'test-10',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: noNamespaceClass,
        options: defaultOptions,
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const parsedEntity = await generator['parseSourceEntity'](request);
      const result = await generator['generateCode'](parsedEntity, defaultOptions);

      expect(result).not.toContain('namespace');
      expect(result).toContain('public class PlayerController : MonoBehaviour');
    });

    it('should handle MonoBehaviour with Unity version-specific features', async () => {
      const request: CodeGenerationRequest = {
        id: 'test-11',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: sampleMonoBehaviour,
        options: defaultOptions,
        target: {
          language: 'csharp',
          unityVersion: '2020.3.0',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const parsedEntity = await generator['parseSourceEntity'](request);

      expect(parsedEntity.usings.has('using UnityEngine.Serialization;')).toBe(true);
      expect(parsedEntity.unityVersion).toBe('2020.3.0');
    });
  });

  describe('helper methods', () => {
    it('should correctly identify serializable fields', () => {
      const publicField: IL2CPPField = {
        name: 'publicField',
        type: 'float',
        isPublic: true,
        isStatic: false,
        isReadOnly: false,
        attributes: [],
        offset: '0x10'
      };

      const privateSerializedField: IL2CPPField = {
        name: 'privateField',
        type: 'int',
        isPublic: false,
        isStatic: false,
        isReadOnly: false,
        attributes: ['SerializeField'],
        offset: '0x14'
      };

      const staticField: IL2CPPField = {
        name: 'staticField',
        type: 'string',
        isPublic: true,
        isStatic: true,
        isReadOnly: false,
        attributes: [],
        offset: '0x18'
      };

      expect(generator['isSerializableField'](publicField)).toBe(true);
      expect(generator['isSerializableField'](privateSerializedField)).toBe(true);
      expect(generator['isSerializableField'](staticField)).toBe(false);
    });

    it('should correctly identify Unity serializable types', () => {
      expect(generator['isUnitySerializableType']('float')).toBe(true);
      expect(generator['isUnitySerializableType']('Vector3')).toBe(true);
      expect(generator['isUnitySerializableType']('GameObject')).toBe(true);
      expect(generator['isUnitySerializableType']('Transform')).toBe(true);
      expect(generator['isUnitySerializableType']('float[]')).toBe(true);
      expect(generator['isUnitySerializableType']('List<int>')).toBe(true);
      expect(generator['isUnitySerializableType']('Dictionary<string, int>')).toBe(false);
    });

    it('should correctly identify Unity lifecycle methods', () => {
      expect(generator['isUnityLifecycleMethod']('Start')).toBe(true);
      expect(generator['isUnityLifecycleMethod']('Update')).toBe(true);
      expect(generator['isUnityLifecycleMethod']('Awake')).toBe(true);
      expect(generator['isUnityLifecycleMethod']('OnDestroy')).toBe(true);
      expect(generator['isUnityLifecycleMethod']('CustomMethod')).toBe(false);
    });
  });

  describe('integration tests', () => {
    it('should generate complete MonoBehaviour from start to finish', async () => {
      const request: CodeGenerationRequest = {
        id: 'integration-test',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: sampleMonoBehaviour,
        options: defaultOptions,
        target: {
          language: 'csharp',
          unityVersion: '2021.3.0',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.sourceInfo.name).toBe('PlayerController');
      expect(result.metadata.codeStats.totalLines).toBeGreaterThan(0);

      // Verify the generated code contains expected elements
      expect(result.code!).toContain('using UnityEngine;');
      expect(result.code!).toContain('public class PlayerController : MonoBehaviour');
      expect(result.code!).toContain('[SerializeField]');
      expect(result.code!).toContain('private void Start()');
      expect(result.code!).toContain('public void Move(');
    });

    it('should handle errors gracefully', async () => {
      const invalidRequest: CodeGenerationRequest = {
        id: 'error-test',
        type: GenerationType.MONOBEHAVIOUR_TEMPLATE,
        source: { ...sampleMonoBehaviour, isMonoBehaviour: false },
        options: defaultOptions,
        target: {
          language: 'csharp',
          fileNaming: FileNamingConvention.PASCAL_CASE
        }
      };

      const result = await generator.generate(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(err => err.message.includes('must be a MonoBehaviour'))).toBe(true);
    });
  });
});
