/**
 * Base Tool Handler for MCP Tools
 * Eliminates code duplication by providing a common foundation for all MCP tool implementations
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { ParameterValidator, ValidationResult, ParameterValidationError } from '../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../utils/mcp-response-formatter';
import { MCPServerError, ErrorType } from './error-types';

/**
 * Logger interface for consistent logging across tools
 */
interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * Vector store interface for tool operations
 */
interface VectorStore {
  similaritySearch(query: string, k: number): Promise<Document[]>;
  searchWithFilter(query: string, filter: Record<string, any>, k: number): Promise<Document[]>;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  vectorStore: VectorStore;
  logger: Logger;
  isInitialized: () => boolean;
}

/**
 * Base tool configuration
 */
export interface BaseToolConfig {
  name: string;
  description: string;
  maxExecutionTime?: number;
  enableParameterValidation?: boolean;
  enableResponseFormatting?: boolean;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  errors?: string[];
  warnings?: string[];
  executionTime?: number;
  metadata?: Record<string, any>;
}

/**
 * Abstract base class for all MCP tool handlers
 */
export abstract class BaseMCPToolHandler<TParams = any, TResult extends string | object = any> {
  protected readonly config: BaseToolConfig;
  protected readonly context: ToolExecutionContext;
  protected startTime: number = 0;

  constructor(config: BaseToolConfig, context: ToolExecutionContext) {
    this.config = config;
    this.context = context;
  }

  /**
   * Main execution method - handles the complete tool lifecycle
   */
  async execute(params: TParams): Promise<MCPResponse> {
    this.startTime = Date.now();

    try {
      // Step 1: Ensure system is initialized
      this.ensureInitialized();

      // Step 2: Log tool execution start
      this.logToolStart(params);

      // Step 3: Validate parameters
      const validation = await this.validateParameters(params);
      if (!validation.isValid) {
        throw new ParameterValidationError(validation.errors, validation.warnings);
      }

      // Step 4: Apply parameter adjustments
      const adjustedParams = this.applyParameterAdjustments(params, validation.adjustedValues);

      // Step 5: Execute core tool logic
      const result = await this.executeCore(adjustedParams);

      // Step 6: Format and return response
      const response = this.formatResponse(result, validation.warnings);

      // Step 7: Log successful completion
      this.logToolCompletion(result);

      return response;

    } catch (error) {
      // Handle and format errors consistently
      return this.handleError(error, params);
    }
  }

  /**
   * Abstract method for core tool logic - must be implemented by subclasses
   */
  protected abstract executeCore(params: TParams): Promise<TResult>;

  /**
   * Validate tool parameters - can be overridden by subclasses
   */
  protected async validateParameters(params: TParams): Promise<ValidationResult> {
    if (!this.config.enableParameterValidation) {
      return { isValid: true, errors: [], warnings: [] };
    }

    // Default validation using common parameters
    return ParameterValidator.validateCommonParams(params as any);
  }

  /**
   * Apply parameter adjustments from validation
   */
  protected applyParameterAdjustments(
    originalParams: TParams,
    adjustedValues?: Record<string, any>
  ): TParams {
    if (!adjustedValues) {
      return originalParams;
    }

    return { ...originalParams, ...adjustedValues };
  }

  /**
   * Format the tool response - can be overridden by subclasses
   */
  protected formatResponse(result: TResult, warnings: string[] = []): MCPResponse {
    if (!this.config.enableResponseFormatting) {
      return MCPResponseFormatter.formatTextResponse(result);
    }

    const executionTime = Date.now() - this.startTime;
    let response = MCPResponseFormatter.formatAnalysisResults(
      result,
      this.config.name,
      {},
      executionTime
    );

    if (warnings.length > 0) {
      response = MCPResponseFormatter.addWarnings(response, warnings);
    }

    return MCPResponseFormatter.addExecutionTiming(response, this.startTime, this.config.name);
  }

  /**
   * Handle errors consistently across all tools
   */
  protected handleError(error: any, params?: TParams): MCPResponse {
    const executionTime = Date.now() - this.startTime;

    this.context.logger.error(`Error in ${this.config.name} tool:`, error);

    // Handle parameter validation errors
    if (error instanceof ParameterValidationError) {
      return MCPResponseFormatter.formatValidationResults(
        false,
        error.errors,
        error.warnings
      );
    }

    // Handle MCP server errors
    if (error instanceof MCPServerError) {
      throw error; // Re-throw MCP errors to be handled by the framework
    }

    // Handle generic errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    throw new MCPServerError(
      `Tool execution error: ${errorMessage}`,
      ErrorType.TOOL_EXECUTION_ERROR
    );
  }

  /**
   * Ensure the system is properly initialized
   */
  protected ensureInitialized(): void {
    if (!this.context.isInitialized()) {
      throw new MCPServerError(
        'MCP server not initialized. Please wait for initialization to complete.',
        ErrorType.INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Log tool execution start
   */
  protected logToolStart(params: TParams): void {
    this.context.logger.debug(
      `Tool call: ${this.config.name}`,
      { parameters: this.sanitizeParamsForLogging(params) }
    );
  }

  /**
   * Log tool execution completion
   */
  protected logToolCompletion(result: TResult): void {
    const executionTime = Date.now() - this.startTime;
    this.context.logger.debug(
      `${this.config.name} completed successfully in ${executionTime}ms`
    );
  }

  /**
   * Sanitize parameters for logging (remove sensitive data)
   */
  protected sanitizeParamsForLogging(params: TParams): any {
    // Override in subclasses if needed to remove sensitive parameters
    return params;
  }

  /**
   * Helper method for vector store searches with consistent error handling
   */
  protected async performVectorSearch(
    query: string,
    filter: Record<string, any> = {},
    limit: number = 5
  ): Promise<Document[]> {
    try {
      if (Object.keys(filter).length > 0) {
        return await this.context.vectorStore.searchWithFilter(query, filter, limit);
      } else {
        return await this.context.vectorStore.similaritySearch(query, limit);
      }
    } catch (error) {
      this.context.logger.error('Vector search failed:', error);
      throw new MCPServerError(
        `Search operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.TOOL_EXECUTION_ERROR
      );
    }
  }

  /**
   * Helper method to create search filters from parameters
   */
  protected createSearchFilter(params: any): Record<string, any> {
    const filter: Record<string, any> = {};

    if (params.filter_type) filter.type = params.filter_type;
    if (params.filter_namespace) filter.namespace = params.filter_namespace;
    if (params.filter_monobehaviour) filter.isMonoBehaviour = true;

    return filter;
  }

  /**
   * Helper method to extract and validate query from parameters
   */
  protected extractQuery(params: any): string {
    return ParameterValidator.validateQuery(params.query || params.class_name || '');
  }
}

/**
 * Specialized base class for search-based tools
 */
export abstract class BaseSearchToolHandler<TParams = any> extends BaseMCPToolHandler<TParams, Document[]> {
  /**
   * Execute search and format results
   */
  protected async executeCore(params: TParams): Promise<Document[]> {
    const query = this.extractQuery(params);
    const filter = this.createSearchFilter(params);
    const limit = (params as any).top_k || 5;

    return await this.performVectorSearch(query, filter, limit);
  }

  /**
   * Format search results with metadata
   */
  protected formatResponse(results: Document[], warnings: string[] = []): MCPResponse {
    const query = this.extractQuery({} as TParams);
    const filter = this.createSearchFilter({} as TParams);

    let response = MCPResponseFormatter.formatSearchResults(results, query, filter, {
      totalTime: Date.now() - this.startTime,
      warnings
    });

    return MCPResponseFormatter.addExecutionTiming(response, this.startTime, this.config.name);
  }
}

/**
 * Specialized base class for analysis tools
 */
export abstract class BaseAnalysisToolHandler<TParams = any, TResult extends string | object = any> extends BaseMCPToolHandler<TParams, TResult> {
  /**
   * Perform analysis with consistent error handling and logging
   */
  protected async performAnalysis(analysisFunction: () => Promise<TResult>): Promise<TResult> {
    try {
      this.context.logger.debug(`Starting ${this.config.name} analysis`);
      const result = await analysisFunction();
      this.context.logger.debug(`${this.config.name} analysis completed`);
      return result;
    } catch (error) {
      this.context.logger.error(`${this.config.name} analysis failed:`, error);
      throw error;
    }
  }
}

/**
 * Specialized base class for code generation tools
 */
export abstract class BaseGenerationToolHandler<TParams = any, TResult extends string | object = any> extends BaseMCPToolHandler<TParams, TResult> {
  /**
   * Perform code generation with consistent error handling and logging
   */
  protected async performGeneration(generationFunction: () => Promise<TResult>): Promise<TResult> {
    try {
      this.context.logger.debug(`Starting ${this.config.name} code generation`);
      const result = await generationFunction();
      this.context.logger.debug(`${this.config.name} code generation completed`);
      return result;
    } catch (error) {
      this.context.logger.error(`${this.config.name} code generation failed:`, error);
      throw error;
    }
  }

  /**
   * Validate class name for generation
   */
  protected validateClassNameForGeneration(className: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!className || typeof className !== 'string') {
      errors.push('class_name is required and must be a string');
    } else {
      const trimmed = className.trim();
      if (trimmed.length === 0) {
        errors.push('class_name cannot be empty');
      } else if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(trimmed)) {
        errors.push('class_name must be a valid identifier (letters, numbers, underscore, starting with letter)');
      } else if (!/^[A-Z]/.test(trimmed)) {
        warnings.push('class_name should follow PascalCase convention');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Format generation results with metadata
   */
  protected formatGenerationResponse(
    generatedCode: string,
    metadata: {
      className?: string;
      fileName?: string;
      language?: string;
      warnings?: string[];
      statistics?: Record<string, any>;
    },
    warnings: string[] = []
  ): MCPResponse {
    const allWarnings = [...warnings, ...(metadata.warnings || [])];

    let response = MCPResponseFormatter.formatGenerationResults(generatedCode, {
      ...metadata,
      warnings: allWarnings
    });

    if (allWarnings.length > 0) {
      response = MCPResponseFormatter.addWarnings(response, allWarnings);
    }

    return MCPResponseFormatter.addExecutionTiming(response, this.startTime, this.config.name);
  }
}
