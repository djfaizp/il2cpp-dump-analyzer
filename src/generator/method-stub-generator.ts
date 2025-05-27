/**
 * C# Method Stub Generator for IL2CPP methods
 * Generates C# method stubs from IL2CPP method definitions with proper signatures and documentation
 */

import {
  CodeGenerationRequest,
  GenerationType,
  GenerationOptions,
  ValidationResult,
  GenerationError,
  GenerationErrorType
} from './types';
import { BaseGenerator } from './base-generator';
import { IL2CPPMethod, IL2CPPParameter } from '../parser/enhanced-types';

/**
 * Parsed method data for code generation
 */
interface ParsedMethodData {
  name: string;
  returnType: string;
  parameters: IL2CPPParameter[];
  isPublic: boolean;
  isStatic: boolean;
  isVirtual: boolean;
  isAbstract: boolean;
  isOverride: boolean;
  attributes: string[];
  rva: string;
  offset: string;
  usings: Set<string>;
}

/**
 * Generator for C# method stubs from IL2CPP method definitions
 */
export class MethodStubGenerator extends BaseGenerator {

  /**
   * Validate the generation request for method stub generation
   * @param request Code generation request
   * @returns Validation result
   */
  protected async validateRequest(request: CodeGenerationRequest): Promise<ValidationResult> {
    const errors: GenerationError[] = [];
    const warnings: string[] = [];

    // Check if request type is correct
    if (request.type !== GenerationType.METHOD_STUB) {
      errors.push({
        type: GenerationErrorType.VALIDATION_ERROR,
        message: `Invalid generation type: expected ${GenerationType.METHOD_STUB}, got ${request.type}`,
        code: 'INVALID_GENERATION_TYPE',
        context: 'MethodStubGenerator.validateRequest'
      });
    }

    // Check if source is an IL2CPP method
    const source = request.source as any;
    if (!source || typeof source !== 'object') {
      errors.push({
        type: GenerationErrorType.VALIDATION_ERROR,
        message: 'Source entity is required and must be an object',
        code: 'INVALID_SOURCE_ENTITY',
        context: 'MethodStubGenerator.validateRequest'
      });
    } else {
      // Check for required method properties
      const requiredProps = ['name', 'returnType', 'parameters'];
      for (const prop of requiredProps) {
        if (!(prop in source)) {
          errors.push({
            type: GenerationErrorType.VALIDATION_ERROR,
            message: `Source entity missing required property: ${prop}`,
            code: 'MISSING_REQUIRED_PROPERTY',
            context: 'MethodStubGenerator.validateRequest'
          });
        }
      }

      // Check if parameters is an array
      if (source.parameters && !Array.isArray(source.parameters)) {
        errors.push({
          type: GenerationErrorType.VALIDATION_ERROR,
          message: 'Source entity parameters must be an array',
          code: 'INVALID_PARAMETERS_TYPE',
          context: 'MethodStubGenerator.validateRequest'
        });
      }

      // Check if attributes is an array
      if (source.attributes && !Array.isArray(source.attributes)) {
        errors.push({
          type: GenerationErrorType.VALIDATION_ERROR,
          message: 'Source entity attributes must be an array',
          code: 'INVALID_ATTRIBUTES_TYPE',
          context: 'MethodStubGenerator.validateRequest'
        });
      }
    }

    // Check target language
    if (request.target.language !== 'csharp') {
      errors.push({
        type: GenerationErrorType.VALIDATION_ERROR,
        message: `Unsupported target language: ${request.target.language}`,
        code: 'UNSUPPORTED_LANGUAGE',
        context: 'MethodStubGenerator.validateRequest'
      });
    }

    // Warnings for potential issues
    if (source && source.name && !/^[A-Z][a-zA-Z0-9]*$/.test(source.name)) {
      warnings.push('Method name should follow PascalCase convention');
    }

    return {
      isValid: errors.length === 0,
      errors: errors.map(err => ({
        message: err.message,
        line: 1,
        column: 1,
        severity: 'error' as const
      })),
      warnings
    };
  }

  /**
   * Parse the IL2CPP method source entity
   * @param request Code generation request
   * @returns Parsed method data
   */
  protected async parseSourceEntity(request: CodeGenerationRequest): Promise<ParsedMethodData> {
    const source = request.source as IL2CPPMethod;
    const usings = new Set<string>();

    // Add basic using statements
    usings.add('using System;');

    // Add using statements based on return type
    const returnUsings = this.context.typeResolver.getUsingsForType(source.returnType);
    returnUsings.forEach(using => usings.add(using));

    // Add using statements based on parameter types
    for (const param of source.parameters || []) {
      const paramUsings = this.context.typeResolver.getUsingsForType(param.type);
      paramUsings.forEach(using => usings.add(using));
    }

    // Add additional using statements from options
    for (const additionalUsing of request.options.additionalUsings) {
      usings.add(`using ${additionalUsing};`);
    }

    return {
      name: source.name,
      returnType: source.returnType,
      parameters: source.parameters || [],
      isPublic: source.isPublic ?? true,
      isStatic: source.isStatic ?? false,
      isVirtual: source.isVirtual ?? false,
      isAbstract: source.isAbstract ?? false,
      isOverride: source.isOverride ?? false,
      attributes: source.attributes || [],
      rva: source.rva,
      offset: source.offset,
      usings
    };
  }

  /**
   * Generate C# method stub code from parsed method data
   * @param parsedEntity Parsed method data
   * @param options Generation options
   * @returns Generated C# code
   */
  protected async generateCode(parsedEntity: ParsedMethodData, options: GenerationOptions): Promise<string> {
    let code = '';

    // Add XML documentation if requested
    if (options.includeDocumentation) {
      code += '/// <summary>\n';
      code += `/// ${parsedEntity.name} method stub\n`;
      code += `/// RVA: ${parsedEntity.rva}, Offset: ${parsedEntity.offset}\n`;
      code += '/// </summary>\n';

      // Add parameter documentation
      for (const param of parsedEntity.parameters) {
        const resolvedParamType = this.context.typeResolver.resolveType(param.type);
        code += `/// <param name="${param.name}">Parameter of type ${resolvedParamType}</param>\n`;
      }

      // Add return documentation
      if (parsedEntity.returnType !== 'System.Void') {
        const resolvedReturnType = this.context.typeResolver.resolveType(parsedEntity.returnType);
        code += `/// <returns>Returns value of type ${resolvedReturnType}</returns>\n`;
      }
    }

    // Add attributes if requested
    if (options.includeUnityAttributes && parsedEntity.attributes.length > 0) {
      for (const attribute of parsedEntity.attributes) {
        code += `[${attribute}]\n`;
      }
    }

    // Add method signature
    const accessModifier = parsedEntity.isPublic ? 'public' : 'private';
    const staticModifier = parsedEntity.isStatic ? 'static ' : '';
    const virtualModifier = parsedEntity.isVirtual ? 'virtual ' : '';
    const overrideModifier = parsedEntity.isOverride ? 'override ' : '';
    const abstractModifier = parsedEntity.isAbstract ? 'abstract ' : '';
    const resolvedReturnType = this.context.typeResolver.resolveType(parsedEntity.returnType);

    code += `${accessModifier} ${staticModifier}${virtualModifier}${overrideModifier}${abstractModifier}${resolvedReturnType} ${parsedEntity.name}(`;

    // Add parameters
    const parameters = parsedEntity.parameters.map(param => {
      const resolvedParamType = this.context.typeResolver.resolveType(param.type);
      return `${resolvedParamType} ${param.name}`;
    });
    code += parameters.join(', ');

    code += ')';

    // Add method body or semicolon for abstract methods
    if (parsedEntity.isAbstract) {
      code += ';\n';
    } else {
      code += '\n{\n';

      if (options.includeErrorHandling && parsedEntity.returnType !== 'System.Void') {
        // Add try-catch block for error handling
        code += '    try\n';
        code += '    {\n';
        code += '        // TODO: Implement method\n';
        code += '        throw new System.NotImplementedException();\n';
        code += '    }\n';
        code += '    catch (System.Exception ex)\n';
        code += '    {\n';
        code += '        // Log error or handle as appropriate\n';
        code += '        throw;\n';
        code += '    }\n';
      } else if (parsedEntity.returnType === 'System.Void') {
        // Void method - just add TODO comment
        code += '    // TODO: Implement method\n';
      } else {
        // Non-void method without error handling
        code += '    // TODO: Implement method\n';
        code += '    throw new System.NotImplementedException();\n';
      }

      code += '}\n';
    }

    // Format the code according to style options
    return this.formatCode(code, options.codeStyle);
  }
}
