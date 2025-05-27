/**
 * C# Class Wrapper Generator for IL2CPP classes
 * Generates C# wrapper classes from IL2CPP class definitions with full type fidelity
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
import { IL2CPPClass, IL2CPPField, IL2CPPMethod } from '../parser/enhanced-types';

/**
 * Parsed class data for code generation
 */
interface ParsedClassData {
  name: string;
  namespace: string;
  fullName: string;
  baseClass?: string;
  interfaces: string[];
  fields: IL2CPPField[];
  methods: IL2CPPMethod[];
  isMonoBehaviour: boolean;
  typeDefIndex: number;
  usings: Set<string>;
}

/**
 * Generator for C# class wrappers from IL2CPP class definitions
 */
export class ClassWrapperGenerator extends BaseGenerator {

  /**
   * Validate the generation request for class wrapper generation
   * @param request Code generation request
   * @returns Validation result
   */
  protected async validateRequest(request: CodeGenerationRequest): Promise<ValidationResult> {
    const errors: GenerationError[] = [];
    const warnings: string[] = [];

    // Check if request type is correct
    if (request.type !== GenerationType.CLASS_WRAPPER) {
      errors.push({
        type: GenerationErrorType.VALIDATION_ERROR,
        message: `Invalid generation type: expected ${GenerationType.CLASS_WRAPPER}, got ${request.type}`,
        code: 'INVALID_GENERATION_TYPE',
        context: 'ClassWrapperGenerator.validateRequest'
      });
    }

    // Check if source is an IL2CPP class
    const source = request.source as any;
    if (!source || typeof source !== 'object') {
      errors.push({
        type: GenerationErrorType.VALIDATION_ERROR,
        message: 'Source entity is required and must be an object',
        code: 'INVALID_SOURCE_ENTITY',
        context: 'ClassWrapperGenerator.validateRequest'
      });
    } else {
      // Check for required class properties
      const requiredProps = ['name', 'namespace', 'fullName', 'fields', 'methods'];
      for (const prop of requiredProps) {
        if (!(prop in source)) {
          errors.push({
            type: GenerationErrorType.VALIDATION_ERROR,
            message: `Source entity missing required property: ${prop}`,
            code: 'MISSING_REQUIRED_PROPERTY',
            context: 'ClassWrapperGenerator.validateRequest'
          });
        }
      }

      // Check if fields and methods are arrays
      if (source.fields && !Array.isArray(source.fields)) {
        errors.push({
          type: GenerationErrorType.VALIDATION_ERROR,
          message: 'Source entity fields must be an array',
          code: 'INVALID_FIELDS_TYPE',
          context: 'ClassWrapperGenerator.validateRequest'
        });
      }

      if (source.methods && !Array.isArray(source.methods)) {
        errors.push({
          type: GenerationErrorType.VALIDATION_ERROR,
          message: 'Source entity methods must be an array',
          code: 'INVALID_METHODS_TYPE',
          context: 'ClassWrapperGenerator.validateRequest'
        });
      }
    }

    // Check target language
    if (request.target.language !== 'csharp') {
      errors.push({
        type: GenerationErrorType.VALIDATION_ERROR,
        message: `Unsupported target language: ${request.target.language}`,
        code: 'UNSUPPORTED_LANGUAGE',
        context: 'ClassWrapperGenerator.validateRequest'
      });
    }

    // Warnings for potential issues
    if (source && source.name && !/^[A-Z][a-zA-Z0-9]*$/.test(source.name)) {
      warnings.push('Class name should follow PascalCase convention');
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
   * Parse the IL2CPP class source entity
   * @param request Code generation request
   * @returns Parsed class data
   */
  protected async parseSourceEntity(request: CodeGenerationRequest): Promise<ParsedClassData> {
    const source = request.source as IL2CPPClass;
    const usings = new Set<string>();

    // Add basic using statements
    usings.add('using System;');

    // Add Unity using if it's a MonoBehaviour
    if (source.isMonoBehaviour || source.baseClass === 'MonoBehaviour') {
      usings.add('using UnityEngine;');
    }

    // Add using statements based on base class and interfaces
    if (source.baseClass) {
      const baseUsings = this.context.typeResolver.getUsingsForType(source.baseClass);
      baseUsings.forEach(using => usings.add(using));
    }

    if (source.interfaces) {
      for (const interfaceType of source.interfaces) {
        const interfaceUsings = this.context.typeResolver.getUsingsForType(interfaceType);
        interfaceUsings.forEach(using => usings.add(using));
      }
    }

    // Add using statements based on field and method types
    for (const field of source.fields || []) {
      const fieldUsings = this.context.typeResolver.getUsingsForType(field.type);
      fieldUsings.forEach(using => usings.add(using));
    }

    for (const method of source.methods || []) {
      const returnUsings = this.context.typeResolver.getUsingsForType(method.returnType);
      returnUsings.forEach(using => usings.add(using));

      for (const param of method.parameters || []) {
        const paramUsings = this.context.typeResolver.getUsingsForType(param.type);
        paramUsings.forEach(using => usings.add(using));
      }
    }

    // Add additional using statements from options
    for (const additionalUsing of request.options.additionalUsings) {
      usings.add(`using ${additionalUsing};`);
    }

    return {
      name: source.name,
      namespace: source.namespace,
      fullName: source.fullName,
      baseClass: source.baseClass,
      interfaces: source.interfaces || [],
      fields: source.fields || [],
      methods: source.methods || [],
      isMonoBehaviour: source.isMonoBehaviour || false,
      typeDefIndex: source.typeDefIndex,
      usings
    };
  }

  /**
   * Generate C# class wrapper code from parsed class data
   * @param parsedEntity Parsed class data
   * @param options Generation options
   * @returns Generated C# code
   */
  protected async generateCode(parsedEntity: ParsedClassData, options: GenerationOptions): Promise<string> {
    let code = '';

    // Add using statements
    const sortedUsings = Array.from(parsedEntity.usings).sort();
    for (const usingStatement of sortedUsings) {
      code += `${usingStatement}\n`;
    }

    if (sortedUsings.length > 0) {
      code += '\n';
    }

    // Add namespace declaration
    if (parsedEntity.namespace) {
      code += `namespace ${parsedEntity.namespace}\n{\n`;
    }

    // Add XML documentation if requested
    if (options.includeDocumentation) {
      const indent = parsedEntity.namespace ? '    ' : '';
      code += `${indent}/// <summary>\n`;
      code += `${indent}/// Generated wrapper for ${parsedEntity.name}\n`;
      code += `${indent}/// IL2CPP TypeDefIndex: ${parsedEntity.typeDefIndex}\n`;
      code += `${indent}/// </summary>\n`;
    }

    // Add class declaration
    const indent = parsedEntity.namespace ? '    ' : '';
    code += `${indent}public class ${parsedEntity.name}`;

    // Add inheritance
    const inheritance: string[] = [];
    if (parsedEntity.baseClass) {
      const resolvedBaseClass = this.context.typeResolver.resolveType(parsedEntity.baseClass);
      inheritance.push(resolvedBaseClass);
    }
    
    for (const interfaceType of parsedEntity.interfaces) {
      const resolvedInterface = this.context.typeResolver.resolveType(interfaceType);
      inheritance.push(resolvedInterface);
    }

    if (inheritance.length > 0) {
      code += ` : ${inheritance.join(', ')}`;
    }

    code += '\n' + indent + '{\n';

    // Add fields
    if (parsedEntity.fields.length > 0) {
      code += this.generateFields(parsedEntity.fields, options, indent + '    ');
      code += '\n';
    }

    // Add methods
    if (parsedEntity.methods.length > 0) {
      code += this.generateMethods(parsedEntity.methods, options, indent + '    ');
    }

    // Close class
    code += indent + '}\n';

    // Close namespace
    if (parsedEntity.namespace) {
      code += '}\n';
    }

    // Format the code according to style options
    return this.formatCode(code, options.codeStyle);
  }

  /**
   * Generate field declarations
   * @param fields Array of IL2CPP fields
   * @param options Generation options
   * @param indent Indentation string
   * @returns Generated field code
   */
  private generateFields(fields: IL2CPPField[], options: GenerationOptions, indent: string): string {
    let code = '';

    for (const field of fields) {
      // Add attributes if requested
      if (options.includeUnityAttributes && field.attributes.length > 0) {
        for (const attribute of field.attributes) {
          code += `${indent}[${attribute}]\n`;
        }
      }

      // Add field declaration
      const accessModifier = field.isPublic ? 'public' : 'private';
      const staticModifier = field.isStatic ? 'static ' : '';
      const readonlyModifier = field.isReadOnly ? 'readonly ' : '';
      const resolvedType = this.context.typeResolver.resolveType(field.type);

      code += `${indent}${accessModifier} ${staticModifier}${readonlyModifier}${resolvedType} ${field.name};\n`;
    }

    return code;
  }

  /**
   * Generate method declarations
   * @param methods Array of IL2CPP methods
   * @param options Generation options
   * @param indent Indentation string
   * @returns Generated method code
   */
  private generateMethods(methods: IL2CPPMethod[], options: GenerationOptions, indent: string): string {
    let code = '';

    for (let i = 0; i < methods.length; i++) {
      const method = methods[i];

      // Add XML documentation if requested
      if (options.includeDocumentation) {
        code += `${indent}/// <summary>\n`;
        code += `${indent}/// ${method.name} method\n`;
        code += `${indent}/// RVA: ${method.rva}, Offset: ${method.offset}\n`;
        code += `${indent}/// </summary>\n`;

        // Add parameter documentation
        for (const param of method.parameters) {
          code += `${indent}/// <param name="${param.name}">Parameter of type ${param.type}</param>\n`;
        }
      }

      // Add method signature
      const accessModifier = method.isPublic ? 'public' : 'private';
      const staticModifier = method.isStatic ? 'static ' : '';
      const virtualModifier = method.isVirtual ? 'virtual ' : '';
      const overrideModifier = method.isOverride ? 'override ' : '';
      const abstractModifier = method.isAbstract ? 'abstract ' : '';
      const resolvedReturnType = this.context.typeResolver.resolveType(method.returnType);

      code += `${indent}${accessModifier} ${staticModifier}${virtualModifier}${overrideModifier}${abstractModifier}${resolvedReturnType} ${method.name}(`;

      // Add parameters
      const parameters = method.parameters.map(param => {
        const resolvedParamType = this.context.typeResolver.resolveType(param.type);
        return `${resolvedParamType} ${param.name}`;
      });
      code += parameters.join(', ');

      code += ')';

      // Add method body or semicolon for abstract methods
      if (method.isAbstract) {
        code += ';\n';
      } else {
        code += '\n' + indent + '{\n';
        code += indent + '    // TODO: Implement method\n';
        if (resolvedReturnType !== 'void') {
          code += indent + '    throw new System.NotImplementedException();\n';
        }
        code += indent + '}\n';
      }

      // Add spacing between methods (except for the last one)
      if (i < methods.length - 1) {
        code += '\n';
      }
    }

    return code;
  }
}
