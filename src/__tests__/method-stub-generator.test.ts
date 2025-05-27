/**
 * Unit tests for MethodStubGenerator
 * Tests C# method stub generation from IL2CPP method definitions
 */

import {
  CodeGenerationRequest,
  GenerationType,
  GenerationOptions,
  GenerationTarget,
  FileNamingConvention,
  GenerationContext
} from '../generator/types';
import { MethodStubGenerator } from '../generator/method-stub-generator';
import { CodeGenerationUtils, IL2CPPTypeResolver } from '../generator/utils';
import { TemplateManager } from '../generator/template-engine';
import { IL2CPPMethod } from '../parser/enhanced-types';

/**
 * Create mock IL2CPP method for testing
 */
function createMockMethod(): IL2CPPMethod {
  return {
    name: 'CalculateDamage',
    returnType: 'System.Single',
    parameters: [
      { type: 'System.Single', name: 'baseDamage' },
      { type: 'System.Single', name: 'multiplier' },
      { type: 'System.Boolean', name: 'isCritical' }
    ],
    isPublic: true,
    isStatic: false,
    isVirtual: false,
    isAbstract: false,
    isOverride: false,
    attributes: ['System.ObsoleteAttribute'],
    rva: '0x1234',
    offset: '0x5678'
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
 * Create mock generation request for method stub
 */
function createMethodStubRequest(customOptions?: Partial<GenerationOptions>): CodeGenerationRequest {
  return {
    id: 'method-stub-test-1',
    type: GenerationType.METHOD_STUB,
    source: createMockMethod(),
    options: {
      includeDocumentation: true,
      includeUnityAttributes: true,
      includeSerialization: false,
      generateAsync: false,
      includeErrorHandling: true,
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

describe('MethodStubGenerator', () => {
  let generator: MethodStubGenerator;
  let context: GenerationContext;

  beforeEach(() => {
    context = createMockContext();
    generator = new MethodStubGenerator(context);
  });

  describe('generate', () => {
    it('should generate basic method stub successfully', async () => {
      const request = createMethodStubRequest();
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toContain('public float CalculateDamage');
      expect(result.code).toContain('float baseDamage');
      expect(result.code).toContain('float multiplier');
      expect(result.code).toContain('bool isCritical');
      expect(result.errors).toHaveLength(0);
    });

    it('should include method signature with correct access modifiers', async () => {
      const request = createMethodStubRequest();
      const result = await generator.generate(request);

      expect(result.code).toContain('public float CalculateDamage(');
    });

    it('should include parameters with correct types', async () => {
      const request = createMethodStubRequest();
      const result = await generator.generate(request);

      expect(result.code).toContain('float baseDamage, float multiplier, bool isCritical');
    });

    it('should include method body with NotImplementedException', async () => {
      const request = createMethodStubRequest();
      const result = await generator.generate(request);

      expect(result.code).toContain('throw new System.NotImplementedException();');
    });

    it('should include XML documentation when requested', async () => {
      const request = createMethodStubRequest({ includeDocumentation: true });
      const result = await generator.generate(request);

      expect(result.code).toContain('/// <summary>');
      expect(result.code).toContain('/// CalculateDamage method stub');
      expect(result.code).toContain('/// <param name="baseDamage">');
      expect(result.code).toContain('/// <param name="multiplier">');
      expect(result.code).toContain('/// <param name="isCritical">');
      expect(result.code).toContain('/// <returns>');
    });

    it('should exclude documentation when not requested', async () => {
      const request = createMethodStubRequest({ includeDocumentation: false });
      const result = await generator.generate(request);

      expect(result.code).not.toContain('/// <summary>');
    });

    it('should handle void return type correctly', async () => {
      const voidMethod: IL2CPPMethod = {
        name: 'DoSomething',
        returnType: 'System.Void',
        parameters: [],
        isPublic: true,
        isStatic: false,
        isVirtual: false,
        isAbstract: false,
        isOverride: false,
        attributes: [],
        rva: '0x1234',
        offset: '0x5678'
      };

      const request = createMethodStubRequest();
      request.source = voidMethod;
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toContain('public void DoSomething()');
      expect(result.code).not.toContain('throw new System.NotImplementedException();');
      expect(result.code).toContain('// TODO: Implement method');
    });

    it('should handle static methods correctly', async () => {
      const staticMethod: IL2CPPMethod = {
        name: 'GetInstance',
        returnType: 'MyClass',
        parameters: [],
        isPublic: true,
        isStatic: true,
        isVirtual: false,
        isAbstract: false,
        isOverride: false,
        attributes: [],
        rva: '0x1234',
        offset: '0x5678'
      };

      const request = createMethodStubRequest();
      request.source = staticMethod;
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toContain('public static MyClass GetInstance()');
    });

    it('should handle virtual methods correctly', async () => {
      const virtualMethod: IL2CPPMethod = {
        name: 'Process',
        returnType: 'System.Void',
        parameters: [],
        isPublic: true,
        isStatic: false,
        isVirtual: true,
        isAbstract: false,
        isOverride: false,
        attributes: [],
        rva: '0x1234',
        offset: '0x5678'
      };

      const request = createMethodStubRequest();
      request.source = virtualMethod;
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toContain('public virtual void Process()');
    });

    it('should handle override methods correctly', async () => {
      const overrideMethod: IL2CPPMethod = {
        name: 'ToString',
        returnType: 'System.String',
        parameters: [],
        isPublic: true,
        isStatic: false,
        isVirtual: false,
        isAbstract: false,
        isOverride: true,
        attributes: [],
        rva: '0x1234',
        offset: '0x5678'
      };

      const request = createMethodStubRequest();
      request.source = overrideMethod;
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toContain('public override string ToString()');
    });

    it('should handle abstract methods correctly', async () => {
      const abstractMethod: IL2CPPMethod = {
        name: 'Execute',
        returnType: 'System.Void',
        parameters: [],
        isPublic: true,
        isStatic: false,
        isVirtual: false,
        isAbstract: true,
        isOverride: false,
        attributes: [],
        rva: '0x1234',
        offset: '0x5678'
      };

      const request = createMethodStubRequest();
      request.source = abstractMethod;
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toContain('public abstract void Execute();');
      expect(result.code).not.toContain('{');
    });

    it('should handle private methods correctly', async () => {
      const privateMethod: IL2CPPMethod = {
        name: 'InternalProcess',
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
      };

      const request = createMethodStubRequest();
      request.source = privateMethod;
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toContain('private void InternalProcess()');
    });

    it('should include attributes when requested', async () => {
      const request = createMethodStubRequest({ includeUnityAttributes: true });
      const result = await generator.generate(request);

      expect(result.code).toContain('[System.ObsoleteAttribute]');
    });

    it('should exclude attributes when not requested', async () => {
      const request = createMethodStubRequest({ includeUnityAttributes: false });
      const result = await generator.generate(request);

      expect(result.code).not.toContain('[System.ObsoleteAttribute]');
    });

    it('should handle generic return types correctly', async () => {
      const genericMethod: IL2CPPMethod = {
        name: 'GetList',
        returnType: 'System.Collections.Generic.List<System.String>',
        parameters: [],
        isPublic: true,
        isStatic: false,
        isVirtual: false,
        isAbstract: false,
        isOverride: false,
        attributes: [],
        rva: '0x1234',
        offset: '0x5678'
      };

      const request = createMethodStubRequest();
      request.source = genericMethod;
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toContain('System.Collections.Generic.List<System.String> GetList()');
    });

    it('should include error handling when requested', async () => {
      const request = createMethodStubRequest({ includeErrorHandling: true });
      const result = await generator.generate(request);

      expect(result.code).toContain('try');
      expect(result.code).toContain('catch');
    });

    it('should exclude error handling when not requested', async () => {
      const request = createMethodStubRequest({ includeErrorHandling: false });
      const result = await generator.generate(request);

      expect(result.code).not.toContain('try');
      expect(result.code).not.toContain('catch');
    });
  });

  describe('validateRequest', () => {
    it('should validate correct method stub request', async () => {
      const request = createMethodStubRequest();
      const result = await generator['validateRequest'](request);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-method source entities', async () => {
      const request = createMethodStubRequest();
      request.type = GenerationType.CLASS_WRAPPER; // Wrong type
      const result = await generator['validateRequest'](request);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('parseSourceEntity', () => {
    it('should parse IL2CPP method correctly', async () => {
      const request = createMethodStubRequest();
      const parsed = await generator['parseSourceEntity'](request);

      expect(parsed.name).toBe('CalculateDamage');
      expect(parsed.returnType).toBe('System.Single');
      expect(parsed.parameters).toHaveLength(3);
      expect(parsed.isPublic).toBe(true);
      expect(parsed.isStatic).toBe(false);
    });
  });

  describe('generateCode', () => {
    it('should generate properly formatted C# method code', async () => {
      const request = createMethodStubRequest();
      const parsed = await generator['parseSourceEntity'](request);
      const code = await generator['generateCode'](parsed, request.options);

      // Check basic structure
      expect(code).toContain('public float CalculateDamage(');
      expect(code).toMatch(/{\s*$/m); // Opening brace
      expect(code).toMatch(/^\s*}/m); // Closing brace

      // Check proper indentation
      const lines = code.split('\n');
      const methodLine = lines.find(line => line.includes('public float CalculateDamage'));
      const bodyLine = lines.find(line => line.includes('throw new System.NotImplementedException'));
      
      if (methodLine && bodyLine) {
        const methodIndent = methodLine.match(/^\s*/)?.[0].length || 0;
        const bodyIndent = bodyLine.match(/^\s*/)?.[0].length || 0;
        expect(bodyIndent).toBeGreaterThan(methodIndent);
      }
    });
  });
});
