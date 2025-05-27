/**
 * Unit tests for ClassWrapperGenerator
 * Tests C# class wrapper generation from IL2CPP class definitions
 */

import {
  CodeGenerationRequest,
  GenerationType,
  GenerationOptions,
  GenerationTarget,
  FileNamingConvention,
  GenerationContext
} from '../generator/types';
import { ClassWrapperGenerator } from '../generator/class-wrapper-generator';
import { CodeGenerationUtils, IL2CPPTypeResolver } from '../generator/utils';
import { TemplateManager } from '../generator/template-engine';
import { IL2CPPClass, IL2CPPMethod, IL2CPPField } from '../parser/enhanced-types';

/**
 * Create mock IL2CPP class for testing
 */
function createMockClass(): IL2CPPClass {
  return {
    name: 'PlayerController',
    namespace: 'Game.Controllers',
    fullName: 'Game.Controllers.PlayerController',
    baseClass: 'MonoBehaviour',
    interfaces: ['IMovable', 'IControllable'],
    fields: [
      {
        name: 'speed',
        type: 'System.Single',
        isPublic: true,
        isStatic: false,
        isReadOnly: false,
        attributes: ['SerializeField'],
        offset: '0x10'
      },
      {
        name: 'health',
        type: 'System.Int32',
        isPublic: false,
        isStatic: false,
        isReadOnly: false,
        attributes: [],
        offset: '0x14'
      }
    ],
    methods: [
      {
        name: 'Start',
        returnType: 'System.Void',
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
        name: 'Move',
        returnType: 'System.Void',
        parameters: [
          { type: 'UnityEngine.Vector3', name: 'direction' }
        ],
        isPublic: true,
        isStatic: false,
        isVirtual: true,
        isAbstract: false,
        isOverride: false,
        attributes: [],
        rva: '0x2345',
        offset: '0x6789'
      }
    ],
    isMonoBehaviour: true,
    typeDefIndex: 456
  };
}

/**
 * Create mock generation context
 */
function createMockContext(): GenerationContext {
  const templateManager = new TemplateManager();
  const utils = new CodeGenerationUtils();
  const typeResolver = new IL2CPPTypeResolver();

  return {
    request: {} as CodeGenerationRequest,
    templates: templateManager['templates'],
    typeResolver,
    utils
  };
}

/**
 * Create mock generation request for class wrapper
 */
function createClassWrapperRequest(customOptions?: Partial<GenerationOptions>): CodeGenerationRequest {
  return {
    id: 'class-wrapper-test-1',
    type: GenerationType.CLASS_WRAPPER,
    source: createMockClass(),
    options: {
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
      },
      ...customOptions
    },
    target: {
      language: 'csharp',
      unityVersion: '2022.3',
      dotnetVersion: '4.8',
      fileNaming: FileNamingConvention.PASCAL_CASE
    }
  };
}

describe('ClassWrapperGenerator', () => {
  let generator: ClassWrapperGenerator;
  let context: GenerationContext;

  beforeEach(() => {
    context = createMockContext();
    generator = new ClassWrapperGenerator(context);
  });

  describe('generate', () => {
    it('should generate basic class wrapper successfully', async () => {
      const request = createClassWrapperRequest();
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toContain('class PlayerController');
      expect(result.code).toContain('MonoBehaviour');
      expect(result.errors).toHaveLength(0);
    });

    it('should include namespace declaration', async () => {
      const request = createClassWrapperRequest();
      const result = await generator.generate(request);

      expect(result.code).toContain('namespace Game.Controllers');
    });

    it('should include inheritance and interfaces', async () => {
      const request = createClassWrapperRequest();
      const result = await generator.generate(request);

      expect(result.code).toContain(': MonoBehaviour, IMovable, IControllable');
    });

    it('should include fields with correct types and attributes', async () => {
      const request = createClassWrapperRequest();
      const result = await generator.generate(request);

      expect(result.code).toContain('[SerializeField]');
      expect(result.code).toContain('public float speed');
      expect(result.code).toContain('private int health');
    });

    it('should include method signatures', async () => {
      const request = createClassWrapperRequest();
      const result = await generator.generate(request);

      expect(result.code).toContain('private void Start()');
      expect(result.code).toContain('public virtual void Move(UnityEngine.Vector3 direction)');
    });

    it('should include Unity using statements', async () => {
      const request = createClassWrapperRequest();
      const result = await generator.generate(request);

      expect(result.code).toContain('using UnityEngine;');
    });

    it('should include XML documentation when requested', async () => {
      const request = createClassWrapperRequest({ includeDocumentation: true });
      const result = await generator.generate(request);

      expect(result.code).toContain('/// <summary>');
      expect(result.code).toContain('/// Generated wrapper for PlayerController');
    });

    it('should exclude documentation when not requested', async () => {
      const request = createClassWrapperRequest({ includeDocumentation: false });
      const result = await generator.generate(request);

      expect(result.code).not.toContain('/// <summary>');
    });

    it('should handle classes without inheritance', async () => {
      const simpleClass: IL2CPPClass = {
        name: 'SimpleClass',
        namespace: 'Test',
        fullName: 'Test.SimpleClass',
        baseClass: undefined,
        interfaces: [],
        fields: [],
        methods: [],
        isMonoBehaviour: false,
        typeDefIndex: 123
      };

      const request = createClassWrapperRequest();
      request.source = simpleClass;
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toContain('class SimpleClass');
      expect(result.code).not.toContain(' : ');
    });

    it('should handle generic types correctly', async () => {
      const genericClass: IL2CPPClass = {
        name: 'GenericClass',
        namespace: 'Test',
        fullName: 'Test.GenericClass',
        baseClass: 'System.Object',
        interfaces: [],
        fields: [
          {
            name: 'items',
            type: 'System.Collections.Generic.List<System.String>',
            isPublic: true,
            isStatic: false,
            isReadOnly: false,
            attributes: [],
            offset: '0x10'
          }
        ],
        methods: [],
        isMonoBehaviour: false,
        typeDefIndex: 789
      };

      const request = createClassWrapperRequest();
      request.source = genericClass;
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toContain('System.Collections.Generic.List<System.String>');
    });
  });

  describe('validateRequest', () => {
    it('should validate correct class wrapper request', async () => {
      const request = createClassWrapperRequest();
      const result = await generator['validateRequest'](request);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-class source entities', async () => {
      const request = createClassWrapperRequest();
      request.type = GenerationType.METHOD_STUB; // Wrong type
      const result = await generator['validateRequest'](request);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('parseSourceEntity', () => {
    it('should parse IL2CPP class correctly', async () => {
      const request = createClassWrapperRequest();
      const parsed = await generator['parseSourceEntity'](request);

      expect(parsed.name).toBe('PlayerController');
      expect(parsed.namespace).toBe('Game.Controllers');
      expect(parsed.baseClass).toBe('MonoBehaviour');
      expect(parsed.interfaces).toContain('IMovable');
      expect(parsed.fields).toHaveLength(2);
      expect(parsed.methods).toHaveLength(2);
    });
  });

  describe('generateCode', () => {
    it('should generate properly formatted C# code', async () => {
      const request = createClassWrapperRequest();
      const parsed = await generator['parseSourceEntity'](request);
      const code = await generator['generateCode'](parsed, request.options);

      // Check basic structure
      expect(code).toContain('namespace Game.Controllers');
      expect(code).toContain('public class PlayerController');
      expect(code).toMatch(/{\s*$/m); // Opening brace on new line
      expect(code).toMatch(/^\s*}/m); // Closing brace properly indented

      // Check proper indentation
      const lines = code.split('\n');
      const classLine = lines.find(line => line.includes('public class'));
      const fieldLine = lines.find(line => line.includes('public float speed'));

      if (classLine && fieldLine) {
        const classIndent = classLine.match(/^\s*/)?.[0].length || 0;
        const fieldIndent = fieldLine.match(/^\s*/)?.[0].length || 0;
        expect(fieldIndent).toBeGreaterThan(classIndent);
      }
    });
  });
});
