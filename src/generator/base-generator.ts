/**
 * Abstract base class for IL2CPP code generators
 * Provides common functionality and enforces consistent patterns across all generators
 */

import {
  CodeGenerationRequest,
  CodeGenerationResult,
  GenerationContext,
  GenerationOptions,
  GenerationMetadata,
  GenerationError,
  GenerationErrorType,
  GenerationMetrics,
  CodeStatistics,
  SourceEntityInfo,
  TemplateConfig,
  TypeResolver,
  GenerationUtils,
  FileNamingConvention,
  CodeStyleOptions,
  ValidationResult
} from './types';

/**
 * Abstract base generator class that all specific generators must extend
 */
export abstract class BaseGenerator {
  protected context: GenerationContext;
  protected startTime: number = 0;
  protected metrics: Partial<GenerationMetrics> = {};

  /**
   * Initialize the generator with context
   * @param context Generation context containing request, templates, and utilities
   */
  constructor(context: GenerationContext) {
    this.context = context;
  }

  /**
   * Main entry point for code generation
   * @param request Code generation request
   * @returns Promise resolving to generation result
   */
  public async generate(request: CodeGenerationRequest): Promise<CodeGenerationResult> {
    this.startTime = Date.now();
    const errors: GenerationError[] = [];
    const warnings: string[] = [];

    try {
      // Validate the request
      const validationResult = await this.validateRequest(request);
      if (!validationResult.isValid) {
        errors.push(...validationResult.errors.map(err => ({
          type: GenerationErrorType.VALIDATION_ERROR,
          message: err.message,
          code: 'VALIDATION_FAILED',
          context: `Line ${err.line}, Column ${err.column}`
        })));
      }
      warnings.push(...validationResult.warnings);

      if (errors.length > 0) {
        return this.createErrorResult(request, errors, warnings);
      }

      // Parse the source entity
      const parseStartTime = Date.now();
      const parsedEntity = await this.parseSourceEntity(request);
      this.metrics.parseTime = Date.now() - parseStartTime;

      // Generate the code
      const generationStartTime = Date.now();
      const generatedCode = await this.generateCode(parsedEntity, request.options);
      this.metrics.generationTime = Date.now() - generationStartTime;

      // Validate the generated code
      const validationStartTime = Date.now();
      const codeValidation = await this.validateGeneratedCode(generatedCode);
      this.metrics.validationTime = Date.now() - validationStartTime;

      if (!codeValidation.isValid) {
        errors.push(...codeValidation.errors.map(err => ({
          type: GenerationErrorType.VALIDATION_ERROR,
          message: err.message,
          code: 'CODE_VALIDATION_FAILED',
          context: `Generated code line ${err.line}`
        })));
      }
      warnings.push(...codeValidation.warnings);

      // Create successful result
      return this.createSuccessResult(request, generatedCode, warnings);

    } catch (error) {
      const generationError: GenerationError = {
        type: GenerationErrorType.PARSING_ERROR,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'GENERATION_FAILED',
        context: 'Code generation process'
      };
      errors.push(generationError);
      return this.createErrorResult(request, errors, warnings);
    }
  }

  /**
   * Abstract method to validate the generation request
   * Must be implemented by concrete generators
   */
  protected abstract validateRequest(request: CodeGenerationRequest): Promise<ValidationResult>;

  /**
   * Abstract method to parse the source entity
   * Must be implemented by concrete generators
   */
  protected abstract parseSourceEntity(request: CodeGenerationRequest): Promise<any>;

  /**
   * Abstract method to generate code from parsed entity
   * Must be implemented by concrete generators
   */
  protected abstract generateCode(parsedEntity: any, options: GenerationOptions): Promise<string>;

  /**
   * Validate generated C# code syntax
   * @param code Generated code to validate
   * @returns Validation result
   */
  protected async validateGeneratedCode(code: string): Promise<ValidationResult> {
    return this.context.utils.validateCSharpSyntax(code);
  }

  /**
   * Create a successful generation result
   * @param request Original request
   * @param code Generated code
   * @param warnings Any warnings generated
   * @returns Success result
   */
  protected createSuccessResult(
    request: CodeGenerationRequest,
    code: string,
    warnings: string[]
  ): CodeGenerationResult {
    const totalTime = Date.now() - this.startTime;

    return {
      success: true,
      code,
      metadata: this.createMetadata(request, code, totalTime),
      errors: [],
      warnings,
      metrics: {
        totalTime,
        parseTime: this.metrics.parseTime || 0,
        generationTime: this.metrics.generationTime || 0,
        validationTime: this.metrics.validationTime || 0,
        memoryUsage: process.memoryUsage().heapUsed
      }
    };
  }

  /**
   * Create an error result
   * @param request Original request
   * @param errors Errors that occurred
   * @param warnings Any warnings generated
   * @returns Error result
   */
  protected createErrorResult(
    request: CodeGenerationRequest,
    errors: GenerationError[],
    warnings: string[]
  ): CodeGenerationResult {
    const totalTime = Date.now() - this.startTime;

    return {
      success: false,
      metadata: this.createMetadata(request, '', totalTime),
      errors,
      warnings,
      metrics: {
        totalTime,
        parseTime: this.metrics.parseTime || 0,
        generationTime: this.metrics.generationTime || 0,
        validationTime: this.metrics.validationTime || 0,
        memoryUsage: process.memoryUsage().heapUsed
      }
    };
  }

  /**
   * Create generation metadata
   * @param request Original request
   * @param code Generated code
   * @param totalTime Total generation time
   * @returns Generation metadata
   */
  protected createMetadata(
    request: CodeGenerationRequest,
    code: string,
    totalTime: number
  ): GenerationMetadata {
    return {
      requestId: request.id,
      timestamp: new Date(),
      sourceInfo: this.extractSourceInfo(request),
      codeStats: this.calculateCodeStatistics(code),
      dependencies: this.extractDependencies(code),
      fileInfo: request.target.outputPath ? {
        fileName: this.generateFileName(request),
        filePath: request.target.outputPath,
        fileSize: Buffer.byteLength(code, 'utf8'),
        encoding: 'utf8'
      } : undefined
    };
  }

  /**
   * Extract source entity information
   * @param request Generation request
   * @returns Source entity info
   */
  protected extractSourceInfo(request: CodeGenerationRequest): SourceEntityInfo {
    const source = request.source;
    return {
      type: this.getEntityType(source),
      name: source.name,
      fullName: ('fullName' in source ? source.fullName : undefined) || source.name,
      namespace: ('namespace' in source ? source.namespace : undefined) || '',
      typeDefIndex: 'typeDefIndex' in source ? source.typeDefIndex : undefined
    };
  }

  /**
   * Get entity type string
   * @param entity Source entity
   * @returns Entity type string
   */
  protected getEntityType(entity: any): string {
    if ('isMonoBehaviour' in entity) return 'class';
    if ('values' in entity) return 'enum';
    if ('methods' in entity && !('fields' in entity)) return 'interface';
    if ('returnType' in entity) return 'method';
    if ('type' in entity && !('methods' in entity)) return 'field';
    return 'unknown';
  }

  /**
   * Calculate code statistics
   * @param code Generated code
   * @returns Code statistics
   */
  protected calculateCodeStatistics(code: string): CodeStatistics {
    const lines = code.split('\n');
    const codeLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    });

    const methodCount = (code.match(/\b(public|private|protected|internal)\s+.*\s+\w+\s*\(/g) || []).length;
    const propertyCount = (code.match(/\b(public|private|protected|internal)\s+.*\s+\w+\s*{\s*(get|set)/g) || []).length;
    const fieldCount = (code.match(/\b(public|private|protected|internal)\s+.*\s+\w+\s*[;=]/g) || []).length;

    return {
      totalLines: lines.length,
      codeLines: codeLines.length,
      methodCount,
      propertyCount,
      fieldCount,
      complexityScore: this.calculateComplexityScore(code)
    };
  }

  /**
   * Calculate complexity score based on code patterns
   * @param code Generated code
   * @returns Complexity score (1-10)
   */
  protected calculateComplexityScore(code: string): number {
    let score = 1;

    // Add complexity for control structures
    score += (code.match(/\b(if|else|while|for|foreach|switch|try|catch)\b/g) || []).length * 0.5;

    // Add complexity for nested structures
    score += (code.match(/{[^}]*{/g) || []).length * 0.3;

    // Add complexity for generic types
    score += (code.match(/<[^>]+>/g) || []).length * 0.2;

    return Math.min(Math.round(score), 10);
  }

  /**
   * Extract dependencies from generated code
   * @param code Generated code
   * @returns Array of dependency strings
   */
  protected extractDependencies(code: string): string[] {
    const usingMatches = code.match(/using\s+([^;]+);/g) || [];
    return usingMatches.map(match => match.replace(/using\s+/, '').replace(';', '').trim());
  }

  /**
   * Generate file name based on request
   * @param request Generation request
   * @returns Generated file name
   */
  protected generateFileName(request: CodeGenerationRequest): string {
    const baseName = request.source.name;
    const convention = request.target.fileNaming;
    const convertedName = this.context.utils.toNamingConvention(baseName, convention);
    return `${convertedName}.cs`;
  }

  /**
   * Get template by name from context
   * @param templateName Name of template to retrieve
   * @returns Template config or undefined
   */
  protected getTemplate(templateName: string): TemplateConfig | undefined {
    return this.context.templates.get(templateName);
  }

  /**
   * Resolve IL2CPP type to C# type
   * @param il2cppType IL2CPP type string
   * @returns C# type string
   */
  protected resolveType(il2cppType: string): string {
    return this.context.typeResolver.resolveType(il2cppType);
  }

  /**
   * Format generated code according to style options
   * @param code Raw generated code
   * @param style Code style options
   * @returns Formatted code
   */
  protected formatCode(code: string, style: CodeStyleOptions): string {
    return this.context.utils.formatCode(code, style);
  }
}
