/**
 * TypeScript interfaces and types for IL2CPP code generation
 * Provides comprehensive type definitions for generating C# code from IL2CPP dump analysis
 */

import { IL2CPPClass, IL2CPPMethod, IL2CPPField, IL2CPPEnum, IL2CPPInterface } from '../parser/enhanced-types';

/**
 * Base interface for all code generation requests
 */
export interface CodeGenerationRequest {
  /** Unique identifier for the generation request */
  id: string;
  /** Type of code generation to perform */
  type: GenerationType;
  /** Source IL2CPP entity to generate code from */
  source: IL2CPPSourceEntity;
  /** Generation options and configuration */
  options: GenerationOptions;
  /** Target output configuration */
  target: GenerationTarget;
}

/**
 * Types of code generation supported
 */
export enum GenerationType {
  CLASS_WRAPPER = 'class_wrapper',
  METHOD_STUB = 'method_stub',
  MONOBEHAVIOUR_TEMPLATE = 'monobehaviour_template',
  INTERFACE_IMPLEMENTATION = 'interface_implementation',
  ENUM_WRAPPER = 'enum_wrapper',
  SCRIPTABLE_OBJECT = 'scriptable_object'
}

/**
 * Source entity types for code generation
 */
export type IL2CPPSourceEntity = IL2CPPClass | IL2CPPMethod | IL2CPPField | IL2CPPEnum | IL2CPPInterface;

/**
 * Configuration options for code generation
 */
export interface GenerationOptions {
  /** Include XML documentation comments */
  includeDocumentation: boolean;
  /** Include Unity-specific attributes */
  includeUnityAttributes: boolean;
  /** Include serialization attributes */
  includeSerialization: boolean;
  /** Generate async/await patterns where applicable */
  generateAsync: boolean;
  /** Include error handling and validation */
  includeErrorHandling: boolean;
  /** Custom namespace for generated code */
  customNamespace?: string;
  /** Additional using statements to include */
  additionalUsings: string[];
  /** Code style preferences */
  codeStyle: CodeStyleOptions;
}

/**
 * Code style configuration
 */
export interface CodeStyleOptions {
  /** Indentation style (spaces or tabs) */
  indentation: 'spaces' | 'tabs';
  /** Number of spaces/tabs for indentation */
  indentSize: number;
  /** Line ending style */
  lineEnding: '\n' | '\r\n';
  /** Brace style (same line or new line) */
  braceStyle: 'same_line' | 'new_line';
  /** Maximum line length */
  maxLineLength: number;
}

/**
 * Target output configuration
 */
export interface GenerationTarget {
  /** Target language (currently only C#) */
  language: 'csharp';
  /** Target Unity version compatibility */
  unityVersion?: string;
  /** Target .NET framework version */
  dotnetVersion?: string;
  /** Output file path (optional) */
  outputPath?: string;
  /** File naming convention */
  fileNaming: FileNamingConvention;
}

/**
 * File naming conventions
 */
export enum FileNamingConvention {
  PASCAL_CASE = 'PascalCase',
  CAMEL_CASE = 'camelCase',
  SNAKE_CASE = 'snake_case',
  KEBAB_CASE = 'kebab-case'
}

/**
 * Result of code generation
 */
export interface CodeGenerationResult {
  /** Success status */
  success: boolean;
  /** Generated code content */
  code?: string;
  /** Generated file metadata */
  metadata: GenerationMetadata;
  /** Any errors that occurred during generation */
  errors: GenerationError[];
  /** Warnings or suggestions */
  warnings: string[];
  /** Performance metrics */
  metrics: GenerationMetrics;
}

/**
 * Metadata about generated code
 */
export interface GenerationMetadata {
  /** Original request ID */
  requestId: string;
  /** Generation timestamp */
  timestamp: Date;
  /** Source entity information */
  sourceInfo: SourceEntityInfo;
  /** Generated code statistics */
  codeStats: CodeStatistics;
  /** Dependencies and references */
  dependencies: string[];
  /** Generated file information */
  fileInfo?: GeneratedFileInfo;
}

/**
 * Information about the source entity
 */
export interface SourceEntityInfo {
  /** Entity type */
  type: string;
  /** Entity name */
  name: string;
  /** Full qualified name */
  fullName: string;
  /** Namespace */
  namespace: string;
  /** TypeDef index from IL2CPP */
  typeDefIndex?: number;
}

/**
 * Statistics about generated code
 */
export interface CodeStatistics {
  /** Total lines of code */
  totalLines: number;
  /** Lines of actual code (excluding comments/whitespace) */
  codeLines: number;
  /** Number of methods generated */
  methodCount: number;
  /** Number of properties generated */
  propertyCount: number;
  /** Number of fields generated */
  fieldCount: number;
  /** Estimated complexity score */
  complexityScore: number;
}

/**
 * Information about generated file
 */
export interface GeneratedFileInfo {
  /** File name */
  fileName: string;
  /** File path */
  filePath: string;
  /** File size in bytes */
  fileSize: number;
  /** File encoding */
  encoding: string;
}

/**
 * Code generation error
 */
export interface GenerationError {
  /** Error type */
  type: GenerationErrorType;
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
  /** Context where error occurred */
  context?: string;
  /** Suggested fix or workaround */
  suggestion?: string;
}

/**
 * Types of generation errors
 */
export enum GenerationErrorType {
  PARSING_ERROR = 'parsing_error',
  TEMPLATE_ERROR = 'template_error',
  VALIDATION_ERROR = 'validation_error',
  TYPE_RESOLUTION_ERROR = 'type_resolution_error',
  DEPENDENCY_ERROR = 'dependency_error',
  OUTPUT_ERROR = 'output_error'
}

/**
 * Performance metrics for code generation
 */
export interface GenerationMetrics {
  /** Total generation time in milliseconds */
  totalTime: number;
  /** Time spent parsing source entity */
  parseTime: number;
  /** Time spent generating code */
  generationTime: number;
  /** Time spent validating output */
  validationTime: number;
  /** Memory usage in bytes */
  memoryUsage: number;
}

/**
 * Template configuration for code generation
 */
export interface TemplateConfig {
  /** Template name/identifier */
  name: string;
  /** Template content or path */
  template: string;
  /** Template engine type */
  engine: TemplateEngine;
  /** Template variables and their types */
  variables: Record<string, TemplateVariable>;
  /** Template metadata */
  metadata: TemplateMetadata;
}

/**
 * Supported template engines
 */
export enum TemplateEngine {
  HANDLEBARS = 'handlebars',
  MUSTACHE = 'mustache',
  SIMPLE_REPLACE = 'simple_replace'
}

/**
 * Template variable definition
 */
export interface TemplateVariable {
  /** Variable type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Variable description */
  description: string;
  /** Whether variable is required */
  required: boolean;
  /** Default value */
  defaultValue?: any;
}

/**
 * Template metadata
 */
export interface TemplateMetadata {
  /** Template description */
  description: string;
  /** Template author */
  author: string;
  /** Template version */
  version: string;
  /** Supported generation types */
  supportedTypes: GenerationType[];
  /** Template tags for categorization */
  tags: string[];
}

/**
 * Context passed to code generators
 */
export interface GenerationContext {
  /** Current generation request */
  request: CodeGenerationRequest;
  /** Available templates */
  templates: Map<string, TemplateConfig>;
  /** Type resolver for IL2CPP types */
  typeResolver: TypeResolver;
  /** Utility functions */
  utils: GenerationUtils;
}

/**
 * Type resolver interface for IL2CPP types
 */
export interface TypeResolver {
  /** Resolve IL2CPP type to C# type */
  resolveType(il2cppType: string): string;
  /** Check if type is Unity-specific */
  isUnityType(type: string): boolean;
  /** Get using statements for type */
  getUsingsForType(type: string): string[];
  /** Resolve generic type parameters */
  resolveGenericType(type: string, genericArgs: string[]): string;
}

/**
 * Utility functions for code generation
 */
export interface GenerationUtils {
  /** Convert string to specified naming convention */
  toNamingConvention(str: string, convention: FileNamingConvention): string;
  /** Generate XML documentation comment */
  generateXmlDoc(description: string, parameters?: string[], returns?: string): string;
  /** Format code according to style options */
  formatCode(code: string, style: CodeStyleOptions): string;
  /** Validate generated C# code syntax */
  validateCSharpSyntax(code: string): ValidationResult;
}

/**
 * Code validation result
 */
export interface ValidationResult {
  /** Whether code is valid */
  isValid: boolean;
  /** Syntax errors found */
  errors: SyntaxError[];
  /** Warnings or suggestions */
  warnings: string[];
}

/**
 * Syntax error information
 */
export interface SyntaxError {
  /** Error message */
  message: string;
  /** Line number where error occurs */
  line: number;
  /** Column number where error occurs */
  column: number;
  /** Error severity */
  severity: 'error' | 'warning' | 'info';
}
