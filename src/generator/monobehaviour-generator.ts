/**
 * Unity MonoBehaviour Template Generator for IL2CPP MonoBehaviour classes
 * Generates Unity-ready MonoBehaviour scripts with proper lifecycle methods and serialization
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
 * Parsed MonoBehaviour data for code generation
 */
interface ParsedMonoBehaviourData {
  name: string;
  namespace: string;
  fullName: string;
  baseClass: string;
  interfaces: string[];
  fields: IL2CPPField[];
  methods: IL2CPPMethod[];
  serializableFields: IL2CPPField[];
  lifecycleMethods: IL2CPPMethod[];
  customMethods: IL2CPPMethod[];
  typeDefIndex: number;
  usings: Set<string>;
  unityVersion?: string;
}

/**
 * Unity lifecycle method information
 */
interface UnityLifecycleMethod {
  name: string;
  description: string;
  returnType: string;
  parameters: string[];
  isRequired: boolean;
  executionOrder: number;
}

/**
 * Generator for Unity MonoBehaviour templates from IL2CPP MonoBehaviour classes
 */
export class MonoBehaviourGenerator extends BaseGenerator {

  /**
   * Unity lifecycle methods with their metadata
   */
  private readonly unityLifecycleMethods: UnityLifecycleMethod[] = [
    {
      name: 'Awake',
      description: 'Called when the script instance is being loaded',
      returnType: 'void',
      parameters: [],
      isRequired: false,
      executionOrder: 1
    },
    {
      name: 'Start',
      description: 'Called before the first frame update',
      returnType: 'void',
      parameters: [],
      isRequired: false,
      executionOrder: 2
    },
    {
      name: 'Update',
      description: 'Called once per frame',
      returnType: 'void',
      parameters: [],
      isRequired: false,
      executionOrder: 3
    },
    {
      name: 'FixedUpdate',
      description: 'Called at fixed intervals for physics updates',
      returnType: 'void',
      parameters: [],
      isRequired: false,
      executionOrder: 4
    },
    {
      name: 'LateUpdate',
      description: 'Called after all Update functions have been called',
      returnType: 'void',
      parameters: [],
      isRequired: false,
      executionOrder: 5
    },
    {
      name: 'OnDestroy',
      description: 'Called when the MonoBehaviour will be destroyed',
      returnType: 'void',
      parameters: [],
      isRequired: false,
      executionOrder: 6
    },
    {
      name: 'OnEnable',
      description: 'Called when the object becomes enabled and active',
      returnType: 'void',
      parameters: [],
      isRequired: false,
      executionOrder: 7
    },
    {
      name: 'OnDisable',
      description: 'Called when the behaviour becomes disabled',
      returnType: 'void',
      parameters: [],
      isRequired: false,
      executionOrder: 8
    }
  ];

  /**
   * Validate the generation request for MonoBehaviour template generation
   * @param request Code generation request
   * @returns Validation result
   */
  protected async validateRequest(request: CodeGenerationRequest): Promise<ValidationResult> {
    const errors: GenerationError[] = [];
    const warnings: string[] = [];

    // Check if request type is correct
    if (request.type !== GenerationType.MONOBEHAVIOUR_TEMPLATE) {
      errors.push({
        type: GenerationErrorType.VALIDATION_ERROR,
        message: `Invalid generation type: expected ${GenerationType.MONOBEHAVIOUR_TEMPLATE}, got ${request.type}`,
        code: 'INVALID_GENERATION_TYPE',
        context: 'MonoBehaviourGenerator.validateRequest'
      });
    }

    // Check if source is an IL2CPP class
    const source = request.source as any;
    if (!source || typeof source !== 'object') {
      errors.push({
        type: GenerationErrorType.VALIDATION_ERROR,
        message: 'Source entity is required and must be an object',
        code: 'INVALID_SOURCE_ENTITY',
        context: 'MonoBehaviourGenerator.validateRequest'
      });
    } else {
      // Check for required class properties
      const requiredProps = ['name', 'namespace', 'fullName', 'fields', 'methods', 'isMonoBehaviour'];
      for (const prop of requiredProps) {
        if (!(prop in source)) {
          errors.push({
            type: GenerationErrorType.VALIDATION_ERROR,
            message: `Source entity missing required property: ${prop}`,
            code: 'MISSING_REQUIRED_PROPERTY',
            context: 'MonoBehaviourGenerator.validateRequest'
          });
        }
      }

      // Check if this is actually a MonoBehaviour
      if (!source.isMonoBehaviour) {
        errors.push({
          type: GenerationErrorType.VALIDATION_ERROR,
          message: 'Source entity must be a MonoBehaviour class',
          code: 'NOT_MONOBEHAVIOUR',
          context: 'MonoBehaviourGenerator.validateRequest',
          suggestion: 'Use ClassWrapperGenerator for non-MonoBehaviour classes'
        });
      }

      // Check if fields and methods are arrays
      if (source.fields && !Array.isArray(source.fields)) {
        errors.push({
          type: GenerationErrorType.VALIDATION_ERROR,
          message: 'Source entity fields must be an array',
          code: 'INVALID_FIELDS_TYPE',
          context: 'MonoBehaviourGenerator.validateRequest'
        });
      }

      if (source.methods && !Array.isArray(source.methods)) {
        errors.push({
          type: GenerationErrorType.VALIDATION_ERROR,
          message: 'Source entity methods must be an array',
          code: 'INVALID_METHODS_TYPE',
          context: 'MonoBehaviourGenerator.validateRequest'
        });
      }
    }

    // Check target language
    if (request.target.language !== 'csharp') {
      errors.push({
        type: GenerationErrorType.VALIDATION_ERROR,
        message: `Unsupported target language: ${request.target.language}`,
        code: 'UNSUPPORTED_LANGUAGE',
        context: 'MonoBehaviourGenerator.validateRequest'
      });
    }

    // Warnings for potential issues
    if (source && source.name && !/^[A-Z][a-zA-Z0-9]*$/.test(source.name)) {
      warnings.push('MonoBehaviour class name should follow PascalCase convention');
    }

    if (source && source.baseClass && source.baseClass !== 'MonoBehaviour') {
      warnings.push(`MonoBehaviour inherits from ${source.baseClass} instead of MonoBehaviour directly`);
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
   * Parse the IL2CPP MonoBehaviour source entity
   * @param request Code generation request
   * @returns Parsed MonoBehaviour data
   */
  protected async parseSourceEntity(request: CodeGenerationRequest): Promise<ParsedMonoBehaviourData> {
    const source = request.source as IL2CPPClass;
    const usings = new Set<string>();

    // Add essential Unity using statements
    usings.add('using System;');
    usings.add('using UnityEngine;');

    // Add Unity-specific using statements based on target Unity version
    if (request.target.unityVersion) {
      const majorVersion = parseInt(request.target.unityVersion.split('.')[0]);
      if (majorVersion >= 2019) {
        usings.add('using UnityEngine.Serialization;');
      }
    }

    // Add using statements based on base class and interfaces
    if (source.baseClass && source.baseClass !== 'MonoBehaviour') {
      const baseUsings = this.context.typeResolver.getUsingsForType(source.baseClass);
      baseUsings.forEach(using => usings.add(using));
    }

    if (source.interfaces) {
      for (const interfaceType of source.interfaces) {
        const interfaceUsings = this.context.typeResolver.getUsingsForType(interfaceType);
        interfaceUsings.forEach(using => usings.add(using));
      }
    }

    // Categorize fields into serializable and non-serializable
    const serializableFields: IL2CPPField[] = [];
    const allFields = source.fields || [];

    for (const field of allFields) {
      // Add using statements for field types
      const fieldUsings = this.context.typeResolver.getUsingsForType(field.type);
      fieldUsings.forEach(using => usings.add(using));

      // Determine if field should be serializable
      if (this.isSerializableField(field)) {
        serializableFields.push(field);
      }
    }

    // Categorize methods into lifecycle and custom methods
    const lifecycleMethods: IL2CPPMethod[] = [];
    const customMethods: IL2CPPMethod[] = [];
    const allMethods = source.methods || [];

    for (const method of allMethods) {
      // Add using statements for method types
      const returnUsings = this.context.typeResolver.getUsingsForType(method.returnType);
      returnUsings.forEach(using => usings.add(using));

      for (const param of method.parameters || []) {
        const paramUsings = this.context.typeResolver.getUsingsForType(param.type);
        paramUsings.forEach(using => usings.add(using));
      }

      // Check if this is a Unity lifecycle method
      if (this.isUnityLifecycleMethod(method.name)) {
        lifecycleMethods.push(method);
      } else {
        customMethods.push(method);
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
      baseClass: source.baseClass || 'MonoBehaviour',
      interfaces: source.interfaces || [],
      fields: allFields,
      methods: allMethods,
      serializableFields,
      lifecycleMethods,
      customMethods,
      typeDefIndex: source.typeDefIndex,
      usings,
      unityVersion: request.target.unityVersion
    };
  }

  /**
   * Generate Unity MonoBehaviour template code from parsed data
   * @param parsedEntity Parsed MonoBehaviour data
   * @param options Generation options
   * @returns Generated C# MonoBehaviour code
   */
  protected async generateCode(parsedEntity: ParsedMonoBehaviourData, options: GenerationOptions): Promise<string> {
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
      code += `${indent}/// Unity MonoBehaviour template generated from ${parsedEntity.name}\n`;
      code += `${indent}/// IL2CPP TypeDefIndex: ${parsedEntity.typeDefIndex}\n`;
      if (parsedEntity.unityVersion) {
        code += `${indent}/// Target Unity Version: ${parsedEntity.unityVersion}\n`;
      }
      code += `${indent}/// </summary>\n`;
    }

    // Add class declaration
    const indent = parsedEntity.namespace ? '    ' : '';
    code += `${indent}public class ${parsedEntity.name} : MonoBehaviour\n`;
    code += indent + '{\n';

    // Add serializable fields with SerializeField attributes
    if (parsedEntity.serializableFields.length > 0) {
      code += this.generateSerializableFields(parsedEntity.serializableFields, options, indent + '    ');
      code += '\n';
    }

    // Add non-serializable fields
    const nonSerializableFields = parsedEntity.fields.filter(field => !this.isSerializableField(field));
    if (nonSerializableFields.length > 0) {
      code += this.generateNonSerializableFields(nonSerializableFields, options, indent + '    ');
      code += '\n';
    }

    // Add Unity lifecycle methods
    code += this.generateUnityLifecycleMethods(parsedEntity, options, indent + '    ');

    // Add custom methods
    if (parsedEntity.customMethods.length > 0) {
      code += '\n';
      code += this.generateCustomMethods(parsedEntity.customMethods, options, indent + '    ');
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
   * Check if a field should be serializable in Unity
   * @param field IL2CPP field to check
   * @returns True if field should be serializable
   */
  private isSerializableField(field: IL2CPPField): boolean {
    // Unity serializes public fields by default
    if (field.isPublic && !field.isStatic && !field.isReadOnly) {
      return this.isUnitySerializableType(field.type);
    }

    // Check for SerializeField attribute on private fields
    if (!field.isPublic && field.attributes.some(attr => attr.includes('SerializeField'))) {
      return this.isUnitySerializableType(field.type);
    }

    return false;
  }

  /**
   * Check if a type is serializable by Unity
   * @param type Type string to check
   * @returns True if type is Unity serializable
   */
  private isUnitySerializableType(type: string): boolean {
    // Unity built-in serializable types
    const unitySerializableTypes = [
      'bool', 'byte', 'sbyte', 'char', 'decimal', 'double', 'float',
      'int', 'uint', 'long', 'ulong', 'short', 'ushort', 'string',
      'Vector2', 'Vector3', 'Vector4', 'Rect', 'Quaternion', 'Matrix4x4',
      'Color', 'Color32', 'LayerMask', 'AnimationCurve', 'Gradient',
      'RectOffset', 'GUIStyle'
    ];

    // Remove generic type parameters and array brackets for checking
    const baseType = type.replace(/[\[\]<>]/g, '').split(',')[0].trim();

    // Check if it's a Unity serializable type
    if (unitySerializableTypes.includes(baseType)) {
      return true;
    }

    // Check if it's a Unity Object type
    if (baseType.includes('GameObject') || baseType.includes('Transform') ||
        baseType.includes('Component') || baseType.includes('MonoBehaviour') ||
        baseType.includes('ScriptableObject')) {
      return true;
    }

    // Arrays and Lists of serializable types are serializable
    if (type.includes('[]') || type.includes('List<')) {
      return true;
    }

    return false;
  }

  /**
   * Check if a method name is a Unity lifecycle method
   * @param methodName Method name to check
   * @returns True if it's a Unity lifecycle method
   */
  private isUnityLifecycleMethod(methodName: string): boolean {
    return this.unityLifecycleMethods.some(lifecycle => lifecycle.name === methodName);
  }

  /**
   * Generate serializable fields with SerializeField attributes
   * @param fields Array of serializable fields
   * @param options Generation options
   * @param indent Indentation string
   * @returns Generated field code
   */
  private generateSerializableFields(fields: IL2CPPField[], options: GenerationOptions, indent: string): string {
    let code = '';

    if (options.includeDocumentation) {
      code += `${indent}#region Serialized Fields\n\n`;
    }

    for (const field of fields) {
      // Add XML documentation if requested
      if (options.includeDocumentation) {
        code += `${indent}/// <summary>\n`;
        code += `${indent}/// ${field.name} field (Unity serialized)\n`;
        code += `${indent}/// Type: ${field.type}\n`;
        code += `${indent}/// </summary>\n`;
      }

      // Add SerializeField attribute for private fields
      if (!field.isPublic && options.includeUnityAttributes) {
        code += `${indent}[SerializeField]\n`;
      }

      // Add field declaration
      const accessModifier = field.isPublic ? 'public' : 'private';
      const resolvedType = this.context.typeResolver.resolveType(field.type);

      code += `${indent}${accessModifier} ${resolvedType} ${field.name};\n\n`;
    }

    if (options.includeDocumentation) {
      code += `${indent}#endregion\n\n`;
    }

    return code;
  }

  /**
   * Generate non-serializable fields
   * @param fields Array of non-serializable fields
   * @param options Generation options
   * @param indent Indentation string
   * @returns Generated field code
   */
  private generateNonSerializableFields(fields: IL2CPPField[], options: GenerationOptions, indent: string): string {
    let code = '';

    if (fields.length === 0) return code;

    if (options.includeDocumentation) {
      code += `${indent}#region Non-Serialized Fields\n\n`;
    }

    for (const field of fields) {
      // Add XML documentation if requested
      if (options.includeDocumentation) {
        code += `${indent}/// <summary>\n`;
        code += `${indent}/// ${field.name} field (not serialized)\n`;
        code += `${indent}/// Type: ${field.type}\n`;
        code += `${indent}/// </summary>\n`;
      }

      // Add field declaration
      const accessModifier = field.isPublic ? 'public' : 'private';
      const staticModifier = field.isStatic ? 'static ' : '';
      const readonlyModifier = field.isReadOnly ? 'readonly ' : '';
      const resolvedType = this.context.typeResolver.resolveType(field.type);

      code += `${indent}${accessModifier} ${staticModifier}${readonlyModifier}${resolvedType} ${field.name};\n\n`;
    }

    if (options.includeDocumentation) {
      code += `${indent}#endregion\n\n`;
    }

    return code;
  }

  /**
   * Generate Unity lifecycle methods
   * @param parsedEntity Parsed MonoBehaviour data
   * @param options Generation options
   * @param indent Indentation string
   * @returns Generated lifecycle method code
   */
  private generateUnityLifecycleMethods(parsedEntity: ParsedMonoBehaviourData, options: GenerationOptions, indent: string): string {
    let code = '';

    if (options.includeDocumentation) {
      code += `${indent}#region Unity Lifecycle Methods\n\n`;
    }

    // Sort lifecycle methods by execution order
    const sortedLifecycleMethods = this.unityLifecycleMethods
      .filter(lifecycle => {
        // Include method if it exists in the original IL2CPP class or if it's commonly used
        const existsInOriginal = parsedEntity.lifecycleMethods.some(method => method.name === lifecycle.name);
        const isCommonlyUsed = ['Awake', 'Start', 'Update', 'OnDestroy'].includes(lifecycle.name);
        return existsInOriginal || isCommonlyUsed;
      })
      .sort((a, b) => a.executionOrder - b.executionOrder);

    for (const lifecycle of sortedLifecycleMethods) {
      // Check if method exists in original IL2CPP class
      const originalMethod = parsedEntity.lifecycleMethods.find(method => method.name === lifecycle.name);

      // Add XML documentation if requested
      if (options.includeDocumentation) {
        code += `${indent}/// <summary>\n`;
        code += `${indent}/// ${lifecycle.description}\n`;
        if (originalMethod) {
          code += `${indent}/// Original IL2CPP method: RVA ${originalMethod.rva}, Offset ${originalMethod.offset}\n`;
        }
        code += `${indent}/// </summary>\n`;
      }

      // Generate method signature
      code += `${indent}private void ${lifecycle.name}()\n`;
      code += `${indent}{\n`;

      if (originalMethod) {
        code += `${indent}    // TODO: Implement original ${lifecycle.name} logic\n`;
        code += `${indent}    // Original method had ${originalMethod.parameters.length} parameters\n`;
      } else {
        code += `${indent}    // TODO: Implement ${lifecycle.name} logic\n`;
      }

      code += `${indent}}\n\n`;
    }

    if (options.includeDocumentation) {
      code += `${indent}#endregion\n`;
    }

    return code;
  }

  /**
   * Generate custom methods from the original IL2CPP class
   * @param methods Array of custom methods
   * @param options Generation options
   * @param indent Indentation string
   * @returns Generated custom method code
   */
  private generateCustomMethods(methods: IL2CPPMethod[], options: GenerationOptions, indent: string): string {
    let code = '';

    if (methods.length === 0) return code;

    if (options.includeDocumentation) {
      code += `${indent}#region Custom Methods\n\n`;
    }

    for (let i = 0; i < methods.length; i++) {
      const method = methods[i];

      // Add XML documentation if requested
      if (options.includeDocumentation) {
        code += `${indent}/// <summary>\n`;
        code += `${indent}/// ${method.name} method from original IL2CPP class\n`;
        code += `${indent}/// RVA: ${method.rva}, Offset: ${method.offset}\n`;
        code += `${indent}/// </summary>\n`;

        // Add parameter documentation
        for (const param of method.parameters) {
          code += `${indent}/// <param name="${param.name}">Parameter of type ${param.type}</param>\n`;
        }

        if (method.returnType !== 'void') {
          code += `${indent}/// <returns>Returns ${method.returnType}</returns>\n`;
        }
      }

      // Generate method signature
      const accessModifier = method.isPublic ? 'public' : 'private';
      const staticModifier = method.isStatic ? 'static ' : '';
      const virtualModifier = method.isVirtual ? 'virtual ' : '';
      const overrideModifier = method.isOverride ? 'override ' : '';
      const resolvedReturnType = this.context.typeResolver.resolveType(method.returnType);

      code += `${indent}${accessModifier} ${staticModifier}${virtualModifier}${overrideModifier}${resolvedReturnType} ${method.name}(`;

      // Add parameters
      const parameters = method.parameters.map(param => {
        const resolvedParamType = this.context.typeResolver.resolveType(param.type);
        return `${resolvedParamType} ${param.name}`;
      });
      code += parameters.join(', ');

      code += ')\n';
      code += `${indent}{\n`;
      code += `${indent}    // TODO: Implement ${method.name} logic\n`;

      if (resolvedReturnType !== 'void') {
        code += `${indent}    throw new System.NotImplementedException();\n`;
      }

      code += `${indent}}\n`;

      // Add spacing between methods (except for the last one)
      if (i < methods.length - 1) {
        code += '\n';
      }
    }

    if (options.includeDocumentation) {
      code += `\n${indent}#endregion\n`;
    }

    return code;
  }
}