/**
 * Unit tests for BaseGenerator and code generation infrastructure
 * Tests the core functionality of the code generation system
 */

import {
  CodeGenerationRequest,
  CodeGenerationResult,
  GenerationType,
  GenerationOptions,
  GenerationTarget,
  FileNamingConvention,
  CodeStyleOptions,
  GenerationContext,
  ValidationResult,
  TemplateConfig,
  TemplateEngine
} from '../generator/types';
import { BaseGenerator } from '../generator/base-generator';
import { CodeGenerationUtils, IL2CPPTypeResolver } from '../generator/utils';
import { TemplateManager } from '../generator/template-engine';
import { IL2CPPClass } from '../parser/enhanced-types';

/**
 * Mock implementation of BaseGenerator for testing
 */
class MockGenerator extends BaseGenerator {
  protected async validateRequest(request: CodeGenerationRequest): Promise<ValidationResult> {
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  protected async parseSourceEntity(request: CodeGenerationRequest): Promise<any> {
    return request.source;
  }

  protected async generateCode(parsedEntity: any, options: GenerationOptions): Promise<string> {
    return `// Generated code for ${parsedEntity.name}\nclass ${parsedEntity.name} {\n}`;
  }
}

/**
 * Create mock IL2CPP class for testing
 */
function createMockClass(): IL2CPPClass {
  return {
    name: 'TestClass',
    namespace: 'TestNamespace',
    fullName: 'TestNamespace.TestClass',
    baseClass: 'MonoBehaviour',
    interfaces: [],
    fields: [],
    methods: [],
    isMonoBehaviour: true,
    typeDefIndex: 123
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
 * Create mock generation request
 */
function createMockRequest(): CodeGenerationRequest {
  return {
    id: 'test-request-1',
    type: GenerationType.CLASS_WRAPPER,
    source: createMockClass(),
    options: {
      includeDocumentation: true,
      includeUnityAttributes: true,
      includeSerialization: true,
      generateAsync: false,
      includeErrorHandling: true,
      additionalUsings: ['System.Collections.Generic'],
      codeStyle: {
        indentation: 'spaces',
        indentSize: 4,
        lineEnding: '\n',
        braceStyle: 'new_line',
        maxLineLength: 120
      }
    },
    target: {
      language: 'csharp',
      unityVersion: '2022.3',
      dotnetVersion: '4.8',
      fileNaming: FileNamingConvention.PASCAL_CASE
    }
  };
}

describe('BaseGenerator', () => {
  let generator: MockGenerator;
  let context: GenerationContext;

  beforeEach(() => {
    context = createMockContext();
    generator = new MockGenerator(context);
  });

  describe('generate', () => {
    it('should successfully generate code for valid request', async () => {
      const request = createMockRequest();
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toContain('TestClass');
      expect(result.errors).toHaveLength(0);
      expect(result.metadata).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should include proper metadata in result', async () => {
      const request = createMockRequest();
      const result = await generator.generate(request);

      expect(result.metadata.requestId).toBe(request.id);
      expect(result.metadata.sourceInfo.name).toBe('TestClass');
      expect(result.metadata.sourceInfo.namespace).toBe('TestNamespace');
      expect(result.metadata.sourceInfo.type).toBe('class');
      expect(result.metadata.codeStats).toBeDefined();
      expect(result.metadata.dependencies).toBeDefined();
    });

    it('should calculate code statistics correctly', async () => {
      const request = createMockRequest();
      const result = await generator.generate(request);

      expect(result.metadata.codeStats.totalLines).toBeGreaterThan(0);
      expect(result.metadata.codeStats.codeLines).toBeGreaterThan(0);
      expect(result.metadata.codeStats.complexityScore).toBeGreaterThanOrEqual(1);
      expect(result.metadata.codeStats.complexityScore).toBeLessThanOrEqual(10);
    });

    it('should include performance metrics', async () => {
      const request = createMockRequest();

      // Add a small delay to ensure timing is captured
      const slowGenerator = new (class extends MockGenerator {
        protected async parseSourceEntity(request: CodeGenerationRequest): Promise<any> {
          await new Promise(resolve => setTimeout(resolve, 1));
          return super.parseSourceEntity(request);
        }

        protected async generateCode(parsedEntity: any, options: GenerationOptions): Promise<string> {
          await new Promise(resolve => setTimeout(resolve, 1));
          return super.generateCode(parsedEntity, options);
        }
      })(context);

      const result = await slowGenerator.generate(request);

      expect(result.metrics.totalTime).toBeGreaterThan(0);
      expect(result.metrics.parseTime).toBeGreaterThanOrEqual(0);
      expect(result.metrics.generationTime).toBeGreaterThanOrEqual(0);
      expect(result.metrics.validationTime).toBeGreaterThanOrEqual(0);
      expect(result.metrics.memoryUsage).toBeGreaterThan(0);
    });

    it('should handle generation errors gracefully', async () => {
      // Create a generator that throws an error
      class ErrorGenerator extends BaseGenerator {
        protected async validateRequest(): Promise<ValidationResult> {
          return { isValid: true, errors: [], warnings: [] };
        }

        protected async parseSourceEntity(): Promise<any> {
          throw new Error('Test error');
        }

        protected async generateCode(): Promise<string> {
          return '';
        }
      }

      const errorGenerator = new ErrorGenerator(context);
      const request = createMockRequest();
      const result = await errorGenerator.generate(request);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Test error');
      expect(result.code).toBeUndefined();
    });
  });

  describe('extractSourceInfo', () => {
    it('should extract correct source information from IL2CPP class', () => {
      const request = createMockRequest();
      const sourceInfo = generator['extractSourceInfo'](request);

      expect(sourceInfo.type).toBe('class');
      expect(sourceInfo.name).toBe('TestClass');
      expect(sourceInfo.fullName).toBe('TestNamespace.TestClass');
      expect(sourceInfo.namespace).toBe('TestNamespace');
      expect(sourceInfo.typeDefIndex).toBe(123);
    });
  });

  describe('calculateCodeStatistics', () => {
    it('should calculate statistics for simple code', () => {
      const code = `// Comment
class TestClass {
    public int field;
    public void Method() {
        // Another comment
    }
}`;
      const stats = generator['calculateCodeStatistics'](code);

      expect(stats.totalLines).toBe(7);
      expect(stats.codeLines).toBe(5); // Excluding comment lines
      expect(stats.methodCount).toBeGreaterThan(0);
      expect(stats.fieldCount).toBeGreaterThan(0);
    });

    it('should calculate complexity score correctly', () => {
      const simpleCode = 'class Simple { }';
      const complexCode = `
class Complex {
    public void Method() {
        if (condition) {
            for (int i = 0; i < 10; i++) {
                try {
                    DoSomething<T>();
                } catch (Exception ex) {
                    // Handle error
                }
            }
        }
    }
}`;

      const simpleStats = generator['calculateCodeStatistics'](simpleCode);
      const complexStats = generator['calculateCodeStatistics'](complexCode);

      expect(complexStats.complexityScore).toBeGreaterThan(simpleStats.complexityScore);
    });
  });

  describe('generateFileName', () => {
    it('should generate correct file names for different conventions', () => {
      const request = createMockRequest();

      request.target.fileNaming = FileNamingConvention.PASCAL_CASE;
      expect(generator['generateFileName'](request)).toBe('TestClass.cs');

      request.target.fileNaming = FileNamingConvention.CAMEL_CASE;
      expect(generator['generateFileName'](request)).toBe('testClass.cs');

      request.target.fileNaming = FileNamingConvention.SNAKE_CASE;
      expect(generator['generateFileName'](request)).toBe('test_class.cs');

      request.target.fileNaming = FileNamingConvention.KEBAB_CASE;
      expect(generator['generateFileName'](request)).toBe('test-class.cs');
    });
  });

  describe('extractDependencies', () => {
    it('should extract using statements from code', () => {
      const code = `using System;
using UnityEngine;
using System.Collections.Generic;

class TestClass {
}`;
      const dependencies = generator['extractDependencies'](code);

      expect(dependencies).toContain('System');
      expect(dependencies).toContain('UnityEngine');
      expect(dependencies).toContain('System.Collections.Generic');
      expect(dependencies).toHaveLength(3);
    });
  });
});

describe('CodeGenerationUtils', () => {
  let utils: CodeGenerationUtils;

  beforeEach(() => {
    utils = new CodeGenerationUtils();
  });

  describe('toNamingConvention', () => {
    it('should convert to PascalCase correctly', () => {
      expect(utils.toNamingConvention('test class', FileNamingConvention.PASCAL_CASE)).toBe('TestClass');
      expect(utils.toNamingConvention('my_variable_name', FileNamingConvention.PASCAL_CASE)).toBe('MyVariableName');
    });

    it('should convert to camelCase correctly', () => {
      expect(utils.toNamingConvention('test class', FileNamingConvention.CAMEL_CASE)).toBe('testClass');
      expect(utils.toNamingConvention('MY_VARIABLE', FileNamingConvention.CAMEL_CASE)).toBe('myVariable');
    });

    it('should convert to snake_case correctly', () => {
      expect(utils.toNamingConvention('TestClass', FileNamingConvention.SNAKE_CASE)).toBe('test_class');
      expect(utils.toNamingConvention('myVariable', FileNamingConvention.SNAKE_CASE)).toBe('my_variable');
    });

    it('should convert to kebab-case correctly', () => {
      expect(utils.toNamingConvention('TestClass', FileNamingConvention.KEBAB_CASE)).toBe('test-class');
      expect(utils.toNamingConvention('myVariable', FileNamingConvention.KEBAB_CASE)).toBe('my-variable');
    });
  });

  describe('generateXmlDoc', () => {
    it('should generate basic XML documentation', () => {
      const xmlDoc = utils.generateXmlDoc('Test method description');

      expect(xmlDoc).toContain('/// <summary>');
      expect(xmlDoc).toContain('/// Test method description');
      expect(xmlDoc).toContain('/// </summary>');
    });

    it('should include parameters in XML documentation', () => {
      const xmlDoc = utils.generateXmlDoc('Test method', ['param1', 'param2'], 'return value');

      expect(xmlDoc).toContain('<param name="param1">');
      expect(xmlDoc).toContain('<param name="param2">');
      expect(xmlDoc).toContain('<returns>return value</returns>');
    });
  });

  describe('validateCSharpSyntax', () => {
    it('should validate correct C# syntax', () => {
      const validCode = `
class TestClass {
    public int field;
    public void Method() {
        Console.WriteLine("Hello");
    }
}`;
      const result = utils.validateCSharpSyntax(validCode);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect unbalanced braces', () => {
      const invalidCode = `
class TestClass {
    public void Method() {
        Console.WriteLine("Hello");
    }
// Missing closing brace`;
      const result = utils.validateCSharpSyntax(invalidCode);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('IL2CPPTypeResolver', () => {
  let resolver: IL2CPPTypeResolver;

  beforeEach(() => {
    resolver = new IL2CPPTypeResolver();
  });

  describe('resolveType', () => {
    it('should resolve basic IL2CPP types to C# types', () => {
      expect(resolver.resolveType('System.Int32')).toBe('int');
      expect(resolver.resolveType('System.String')).toBe('string');
      expect(resolver.resolveType('System.Boolean')).toBe('bool');
      expect(resolver.resolveType('System.Void')).toBe('void');
    });

    it('should handle array types', () => {
      expect(resolver.resolveType('System.Int32[]')).toBe('int[]');
      expect(resolver.resolveType('System.String[]')).toBe('string[]');
    });

    it('should preserve unknown types', () => {
      expect(resolver.resolveType('CustomType')).toBe('CustomType');
      expect(resolver.resolveType('MyNamespace.MyClass')).toBe('MyNamespace.MyClass');
    });
  });

  describe('isUnityType', () => {
    it('should identify Unity types correctly', () => {
      expect(resolver.isUnityType('GameObject')).toBe(true);
      expect(resolver.isUnityType('MonoBehaviour')).toBe(true);
      expect(resolver.isUnityType('Transform')).toBe(true);
      expect(resolver.isUnityType('Unity.Something')).toBe(true);
      expect(resolver.isUnityType('System.String')).toBe(false);
    });
  });

  describe('getUsingsForType', () => {
    it('should return correct using statements', () => {
      const unityUsings = resolver.getUsingsForType('GameObject');
      expect(unityUsings).toContain('using UnityEngine;');

      const systemUsings = resolver.getUsingsForType('System.Collections.Generic.List');
      expect(systemUsings).toContain('using System;');
      expect(systemUsings).toContain('using System.Collections.Generic;');
    });
  });
});
