/**
 * IL2CPP Code Generation Module
 * Main export file for the code generation infrastructure
 */

// Core types and interfaces
export * from './types';

// Base generator class
export { BaseGenerator } from './base-generator';

// Specific generators
export { ClassWrapperGenerator } from './class-wrapper-generator';
export { MethodStubGenerator } from './method-stub-generator';
export { MonoBehaviourGenerator } from './monobehaviour-generator';

// Template engine types
export type {
  TemplateResult,
  TemplateContext,
  ITemplateEngine,
  CompiledTemplate
} from './template-engine';

// Template engine implementations
export {
  SimpleReplaceEngine,
  TemplateEngineFactory,
  TemplateManager
} from './template-engine';

// Utility functions
export {
  CodeGenerationUtils,
  IL2CPPTypeResolver
} from './utils';

// Re-export commonly used types for convenience
export type {
  CodeGenerationRequest,
  CodeGenerationResult,
  GenerationOptions,
  GenerationTarget,
  GenerationContext,
  TemplateConfig,
  ValidationResult
} from './types';

// Re-export enums as values (not just types)
export {
  GenerationType,
  FileNamingConvention
} from './types';
