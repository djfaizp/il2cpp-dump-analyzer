/**
 * Parameter Validation Utilities
 * Centralizes all parameter validation logic to eliminate duplication across MCP tools
 */

import { z } from 'zod';

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  adjustedValues?: Record<string, any>;
}

/**
 * Parameter validation utilities class
 */
export class ParameterValidator {
  /**
   * Clamp a number value between min and max bounds
   */
  static clampNumber(value: number, min: number, max: number, paramName?: string): number {
    const clamped = Math.min(Math.max(value, min), max);
    if (clamped !== value && paramName) {
      console.warn(`Parameter '${paramName}' adjusted from ${value} to ${clamped} (valid range: ${min}-${max})`);
    }
    return clamped;
  }

  /**
   * Validate confidence threshold (0.1 - 1.0)
   */
  static validateConfidence(threshold: number): number {
    return this.clampNumber(threshold, 0.1, 1.0, 'confidence_threshold');
  }

  /**
   * Validate maximum results count (1 - specified max)
   */
  static validateMaxResults(count: number, max: number = 50): number {
    return this.clampNumber(count, 1, max, 'max_results');
  }

  /**
   * Validate top_k parameter (1 - 100)
   */
  static validateTopK(topK: number): number {
    return this.clampNumber(topK, 1, 100, 'top_k');
  }

  /**
   * Validate depth parameter (1 - 5)
   */
  static validateDepth(depth: number): number {
    return this.clampNumber(depth, 1, 5, 'depth');
  }

  /**
   * Validate and sanitize query string
   */
  static validateQuery(query: string | string[]): string {
    if (Array.isArray(query)) {
      return query[0] || '';
    }
    return typeof query === 'string' ? query.trim() : '';
  }

  /**
   * Validate pattern types for design pattern detection
   */
  static validatePatternTypes(patterns: string[]): ValidationResult {
    const validPatterns = [
      'singleton', 'observer', 'factory', 'strategy', 'command', 'state',
      'decorator', 'adapter', 'facade', 'proxy', 'builder', 'template_method',
      'chain_of_responsibility', 'mediator', 'memento', 'visitor', 'flyweight',
      'composite', 'bridge', 'abstract_factory', 'prototype', 'iterator'
    ];

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(patterns) || patterns.length === 0) {
      errors.push('pattern_types must be a non-empty array');
    } else {
      const invalidPatterns = patterns.filter(p => !validPatterns.includes(p));
      if (invalidPatterns.length > 0) {
        errors.push(`Invalid pattern types: ${invalidPatterns.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate filter parameters for search operations
   */
  static validateSearchFilter(filter: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const validFilterKeys = ['type', 'namespace', 'isMonoBehaviour', 'accessibility', 'isStatic'];

    // Check for invalid filter keys
    const invalidKeys = Object.keys(filter).filter(key => !validFilterKeys.includes(key));
    if (invalidKeys.length > 0) {
      warnings.push(`Unknown filter keys will be ignored: ${invalidKeys.join(', ')}`);
    }

    // Validate specific filter values
    if (filter.type && typeof filter.type !== 'string') {
      errors.push('filter.type must be a string');
    }

    if (filter.namespace && typeof filter.namespace !== 'string') {
      errors.push('filter.namespace must be a string');
    }

    if (filter.isMonoBehaviour !== undefined && typeof filter.isMonoBehaviour !== 'boolean') {
      errors.push('filter.isMonoBehaviour must be a boolean');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate class name parameter
   */
  static validateClassName(className: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!className || typeof className !== 'string') {
      errors.push('class_name is required and must be a string');
    } else {
      const trimmed = className.trim();
      if (trimmed.length === 0) {
        errors.push('class_name cannot be empty');
      } else if (trimmed.length < 2) {
        warnings.push('class_name is very short, consider using a more specific name');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate reference type for cross-reference analysis
   */
  static validateReferenceType(refType: string): ValidationResult {
    const validTypes = ['usage', 'inheritance', 'implementation', 'composition', 'all'];
    const errors: string[] = [];

    if (!refType || !validTypes.includes(refType)) {
      errors.push(`reference_type must be one of: ${validTypes.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Validate target type for cross-reference analysis
   */
  static validateTargetType(targetType: string): ValidationResult {
    const validTypes = ['class', 'interface', 'enum', 'method', 'property', 'field'];
    const errors: string[] = [];

    if (!targetType || !validTypes.includes(targetType)) {
      errors.push(`target_type must be one of: ${validTypes.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Comprehensive parameter validation for common MCP tool parameters
   */
  static validateCommonParams(params: {
    query?: string | string[];
    top_k?: number;
    confidence_threshold?: number;
    max_results?: number;
    depth?: number;
    filter?: Record<string, any>;
  }): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate and adjust numeric parameters
    if (params.top_k !== undefined) {
      adjustedValues.top_k = this.validateTopK(params.top_k);
    }

    if (params.confidence_threshold !== undefined) {
      adjustedValues.confidence_threshold = this.validateConfidence(params.confidence_threshold);
    }

    if (params.max_results !== undefined) {
      adjustedValues.max_results = this.validateMaxResults(params.max_results);
    }

    if (params.depth !== undefined) {
      adjustedValues.depth = this.validateDepth(params.depth);
    }

    // Validate query
    if (params.query !== undefined) {
      adjustedValues.query = this.validateQuery(params.query);
    }

    // Validate filter
    if (params.filter) {
      const filterValidation = this.validateSearchFilter(params.filter);
      errors.push(...filterValidation.errors);
      warnings.push(...filterValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }

  /**
   * Create a Zod schema validator for common parameters
   */
  static createCommonParamsSchema() {
    return z.object({
      query: z.union([z.string(), z.array(z.string())]).optional(),
      top_k: z.number().min(1).max(100).optional().default(5),
      confidence_threshold: z.number().min(0.1).max(1.0).optional().default(0.7),
      max_results: z.number().min(1).max(50).optional().default(10),
      depth: z.number().min(1).max(5).optional().default(3),
      filter_type: z.string().optional(),
      filter_namespace: z.string().optional(),
      filter_monobehaviour: z.boolean().optional()
    });
  }
}

/**
 * Validation error class for parameter validation failures
 */
export class ParameterValidationError extends Error {
  constructor(
    public readonly errors: string[],
    public readonly warnings: string[] = []
  ) {
    super(`Parameter validation failed: ${errors.join(', ')}`);
    this.name = 'ParameterValidationError';
  }
}
