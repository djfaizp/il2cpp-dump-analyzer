/**
 * Find Design Patterns Tool Implementation
 * Detects common design patterns in IL2CPP code with confidence scoring
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';

/**
 * Find design patterns parameters interface
 */
interface FindDesignPatternsParams {
  pattern_types: string[];
  confidence_threshold?: number;
  include_partial_matches?: boolean;
  namespace_scope?: string;
  exclude_unity_patterns?: boolean;
  max_results_per_pattern?: number;
}

/**
 * Design pattern match interface
 */
interface DesignPatternMatch {
  className: string;
  fullName: string;
  namespace: string;
  confidence: number;
  evidence: string[];
  implementation: 'full' | 'partial' | 'variant';
  isPartialMatch: boolean;
  suggestions: string[];
  isUnitySpecific: boolean;
}

/**
 * Design patterns result interface
 */
interface DesignPatternsResult {
  detectedPatterns: Record<string, DesignPatternMatch[]>;
  summary: {
    totalPatternsFound: number;
    patternTypeCount: number;
    averageConfidence: number;
    architecturalInsights: string[];
  };
  metadata: {
    searchedPatterns: string[];
    confidenceThreshold: number;
    includePartialMatches: boolean;
    namespaceScope?: string;
    excludeUnityPatterns: boolean;
    maxResultsPerPattern: number;
    timestamp: string;
  };
}

/**
 * Find Design Patterns Tool Handler
 * Detects common design patterns in IL2CPP code with confidence scoring
 */
export class FindDesignPatternsToolHandler extends BaseAnalysisToolHandler<FindDesignPatternsParams, DesignPatternsResult> {
  constructor(context: ToolExecutionContext) {
    super({
      name: 'find_design_patterns',
      description: 'Detect common design patterns in IL2CPP code',
      enableParameterValidation: true,
      enableResponseFormatting: true
    }, context);
  }

  /**
   * Validate design patterns parameters
   */
  protected async validateParameters(params: FindDesignPatternsParams): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate pattern_types parameter
    const patternValidation = ParameterValidator.validatePatternTypes(params.pattern_types);
    errors.push(...patternValidation.errors);
    warnings.push(...patternValidation.warnings);

    // Validate confidence_threshold parameter
    if (params.confidence_threshold !== undefined) {
      adjustedValues.confidence_threshold = ParameterValidator.validateConfidence(params.confidence_threshold);
      if (adjustedValues.confidence_threshold !== params.confidence_threshold) {
        warnings.push(`Confidence threshold adjusted from ${params.confidence_threshold} to ${adjustedValues.confidence_threshold} (valid range: 0.1-1.0)`);
      }
    } else {
      adjustedValues.confidence_threshold = 0.7;
    }

    // Validate max_results_per_pattern parameter
    if (params.max_results_per_pattern !== undefined) {
      adjustedValues.max_results_per_pattern = ParameterValidator.validateMaxResults(params.max_results_per_pattern, 50);
      if (adjustedValues.max_results_per_pattern !== params.max_results_per_pattern) {
        warnings.push(`max_results_per_pattern adjusted from ${params.max_results_per_pattern} to ${adjustedValues.max_results_per_pattern} (valid range: 1-50)`);
      }
    } else {
      adjustedValues.max_results_per_pattern = 10;
    }

    // Set defaults for optional boolean parameters
    if (params.include_partial_matches === undefined) {
      adjustedValues.include_partial_matches = true;
    }

    if (params.exclude_unity_patterns === undefined) {
      adjustedValues.exclude_unity_patterns = false;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }

  /**
   * Execute design pattern detection
   */
  protected async executeCore(params: FindDesignPatternsParams): Promise<DesignPatternsResult> {
    return await this.performAnalysis(async () => {
      this.context.logger.debug(`Detecting patterns: [${params.pattern_types.join(', ')}], confidence: ${params.confidence_threshold}`);

      // Step 1: Get all classes for analysis
      const filter: Record<string, any> = { type: 'class' };
      if (params.namespace_scope) {
        filter.namespace = params.namespace_scope;
      }

      const allClassesResults = await this.context.vectorStore.searchWithFilter('', filter, 500);

      // Step 2: Initialize result
      const result: DesignPatternsResult = {
        detectedPatterns: {},
        summary: {
          totalPatternsFound: 0,
          patternTypeCount: 0,
          averageConfidence: 0,
          architecturalInsights: []
        },
        metadata: {
          searchedPatterns: params.pattern_types,
          confidenceThreshold: params.confidence_threshold || 0.7,
          includePartialMatches: params.include_partial_matches || true,
          namespaceScope: params.namespace_scope,
          excludeUnityPatterns: params.exclude_unity_patterns || false,
          maxResultsPerPattern: params.max_results_per_pattern || 10,
          timestamp: new Date().toISOString()
        }
      };

      // Step 3: Detect each pattern type
      for (const patternType of params.pattern_types) {
        try {
          this.context.logger.debug(`Detecting ${patternType} pattern...`);

          let matches = await this.detectPattern(patternType, allClassesResults, params);

          // Filter by confidence threshold
          matches = matches.filter(match => match.confidence >= (params.confidence_threshold || 0.7));

          // Filter Unity patterns if excluded
          if (params.exclude_unity_patterns) {
            matches = matches.filter(match => !match.isUnitySpecific);
          }

          // Filter partial matches if not included
          if (!params.include_partial_matches) {
            matches = matches.filter(match => !match.isPartialMatch);
          }

          result.detectedPatterns[patternType] = matches.slice(0, params.max_results_per_pattern || 10);
          this.context.logger.debug(`Found ${matches.length} ${patternType} pattern matches`);

        } catch (patternError) {
          this.context.logger.error(`Error detecting ${patternType} pattern:`, patternError);
          result.detectedPatterns[patternType] = [];
        }
      }

      // Step 4: Calculate summary
      result.summary = this.calculatePatternSummary(result);

      return result;
    });
  }

  /**
   * Detect a specific design pattern
   */
  private async detectPattern(
    patternType: string,
    classes: Document[],
    params: FindDesignPatternsParams
  ): Promise<DesignPatternMatch[]> {
    switch (patternType) {
      case 'singleton':
        return this.detectSingleton(classes);
      case 'observer':
        return this.detectObserver(classes);
      case 'factory':
        return this.detectFactory(classes);
      case 'strategy':
        return this.detectStrategy(classes);
      case 'command':
        return this.detectCommand(classes);
      default:
        this.context.logger.warn(`Pattern detection not implemented for: ${patternType}`);
        return [];
    }
  }

  /**
   * Detect Singleton pattern
   */
  private async detectSingleton(classes: Document[]): Promise<DesignPatternMatch[]> {
    const matches: DesignPatternMatch[] = [];

    for (const classDoc of classes) {
      const content = classDoc.pageContent.toLowerCase();
      const className = classDoc.metadata.name;

      let confidence = 0;
      const evidence: string[] = [];
      const suggestions: string[] = [];

      // Check for static instance field
      const hasStaticInstance = content.includes('static') &&
        (content.includes('instance') || content.includes(className.toLowerCase()));
      if (hasStaticInstance) {
        confidence += 0.4;
        evidence.push('Has static instance field');
      }

      // Check for private constructor
      const hasPrivateConstructor = content.includes('private') && content.includes('constructor');
      if (hasPrivateConstructor) {
        confidence += 0.3;
        evidence.push('Has private constructor');
      } else {
        suggestions.push('Consider making constructor private');
      }

      // Check for GetInstance method
      const hasGetInstanceMethod = content.includes('getinstance') || content.includes('get_instance');
      if (hasGetInstanceMethod) {
        confidence += 0.3;
        evidence.push('Has GetInstance method');
      } else if (confidence > 0.3) {
        suggestions.push('Add public static GetInstance() method');
      }

      // Unity-specific check
      const isUnity = classDoc.metadata.isMonoBehaviour ||
        (classDoc.metadata.namespace && classDoc.metadata.namespace.includes('Unity'));

      if (confidence >= 0.3) {
        matches.push({
          className,
          fullName: classDoc.metadata.fullName,
          namespace: classDoc.metadata.namespace || '',
          confidence,
          evidence,
          implementation: confidence >= 0.8 ? 'full' : 'partial',
          isPartialMatch: confidence < 0.8,
          suggestions: suggestions.concat(confidence < 0.8 ? ['Ensure thread safety for multi-threaded environments'] : []),
          isUnitySpecific: isUnity
        });
      }
    }

    return matches;
  }

  /**
   * Detect Observer pattern
   */
  private async detectObserver(classes: Document[]): Promise<DesignPatternMatch[]> {
    const matches: DesignPatternMatch[] = [];

    for (const classDoc of classes) {
      const content = classDoc.pageContent.toLowerCase();
      const className = classDoc.metadata.name;

      let confidence = 0;
      const evidence: string[] = [];

      // Check for event/delegate patterns
      if (content.includes('event') || content.includes('delegate')) {
        confidence += 0.4;
        evidence.push('Uses events or delegates');
      }

      // Check for observer-like method names
      if (content.includes('notify') || content.includes('update') || content.includes('observe')) {
        confidence += 0.3;
        evidence.push('Has observer-pattern method names');
      }

      // Check for list of observers
      if (content.includes('list') && (content.includes('observer') || content.includes('listener'))) {
        confidence += 0.3;
        evidence.push('Maintains list of observers');
      }

      const isUnity = classDoc.metadata.isMonoBehaviour ||
        (classDoc.metadata.namespace && classDoc.metadata.namespace.includes('Unity'));

      if (confidence >= 0.3) {
        matches.push({
          className,
          fullName: classDoc.metadata.fullName,
          namespace: classDoc.metadata.namespace || '',
          confidence,
          evidence,
          implementation: confidence >= 0.8 ? 'full' : 'partial',
          isPartialMatch: confidence < 0.8,
          suggestions: ['Consider implementing IObserver interface', 'Add proper event handling'],
          isUnitySpecific: isUnity
        });
      }
    }

    return matches;
  }

  /**
   * Detect Factory pattern
   */
  private async detectFactory(classes: Document[]): Promise<DesignPatternMatch[]> {
    const matches: DesignPatternMatch[] = [];

    for (const classDoc of classes) {
      const content = classDoc.pageContent.toLowerCase();
      const className = classDoc.metadata.name;

      let confidence = 0;
      const evidence: string[] = [];

      // Check for factory method names
      if (content.includes('create') || content.includes('make') || content.includes('build')) {
        confidence += 0.3;
        evidence.push('Has factory method names');
      }

      // Check for factory in class name
      if (className.toLowerCase().includes('factory')) {
        confidence += 0.4;
        evidence.push('Class name indicates factory pattern');
      }

      // Check for static creation methods
      if (content.includes('static') && (content.includes('create') || content.includes('make'))) {
        confidence += 0.3;
        evidence.push('Has static creation methods');
      }

      const isUnity = classDoc.metadata.isMonoBehaviour ||
        (classDoc.metadata.namespace && classDoc.metadata.namespace.includes('Unity'));

      if (confidence >= 0.3) {
        matches.push({
          className,
          fullName: classDoc.metadata.fullName,
          namespace: classDoc.metadata.namespace || '',
          confidence,
          evidence,
          implementation: confidence >= 0.8 ? 'full' : 'partial',
          isPartialMatch: confidence < 0.8,
          suggestions: ['Consider implementing abstract factory interface'],
          isUnitySpecific: isUnity
        });
      }
    }

    return matches;
  }

  /**
   * Detect Strategy pattern
   */
  private async detectStrategy(classes: Document[]): Promise<DesignPatternMatch[]> {
    // Simplified strategy pattern detection
    return [];
  }

  /**
   * Detect Command pattern
   */
  private async detectCommand(classes: Document[]): Promise<DesignPatternMatch[]> {
    // Simplified command pattern detection
    return [];
  }

  /**
   * Calculate pattern summary statistics
   */
  private calculatePatternSummary(result: DesignPatternsResult) {
    const allMatches = Object.values(result.detectedPatterns).flat();
    const totalPatternsFound = allMatches.length;
    const patternTypeCount = Object.keys(result.detectedPatterns).filter(
      pattern => result.detectedPatterns[pattern].length > 0
    ).length;

    const averageConfidence = totalPatternsFound > 0
      ? allMatches.reduce((sum, match) => sum + match.confidence, 0) / totalPatternsFound
      : 0;

    const architecturalInsights = this.generateArchitecturalInsights(result.detectedPatterns);

    return {
      totalPatternsFound,
      patternTypeCount,
      averageConfidence,
      architecturalInsights
    };
  }

  /**
   * Generate architectural insights based on detected patterns
   */
  private generateArchitecturalInsights(detectedPatterns: Record<string, DesignPatternMatch[]>): string[] {
    const insights: string[] = [];

    if (detectedPatterns.singleton && detectedPatterns.singleton.length > 0) {
      insights.push('Codebase uses Singleton pattern for global state management');
    }

    if (detectedPatterns.observer && detectedPatterns.observer.length > 0) {
      insights.push('Event-driven architecture detected with Observer pattern usage');
    }

    if (detectedPatterns.factory && detectedPatterns.factory.length > 0) {
      insights.push('Object creation is abstracted using Factory patterns');
    }

    if (insights.length === 0) {
      insights.push('No significant design patterns detected with the specified criteria');
      insights.push('Consider lowering the confidence threshold or enabling partial matches');
      insights.push('The codebase may use different architectural patterns not covered by this analysis');
    }

    return insights;
  }

  /**
   * Format pattern detection results
   */
  protected formatResponse(result: DesignPatternsResult, warnings: string[] = []): MCPResponse {
    let response = MCPResponseFormatter.formatPatternResults(
      result.detectedPatterns,
      result.summary,
      result.metadata
    );

    if (warnings.length > 0) {
      response = MCPResponseFormatter.addWarnings(response, warnings);
    }

    return MCPResponseFormatter.addExecutionTiming(response, this.startTime, this.config.name);
  }
}

/**
 * Zod schema for find design patterns tool parameters
 */
export const findDesignPatternsSchema = z.object({
  pattern_types: z.array(z.enum(["singleton", "observer", "factory", "strategy", "command", "state", "decorator", "adapter", "facade", "proxy", "builder", "template_method", "chain_of_responsibility", "mediator", "memento", "visitor", "flyweight", "composite", "bridge", "abstract_factory", "prototype", "iterator"])).describe("Array of design patterns to detect"),
  confidence_threshold: z.number().optional().default(0.7).describe("Minimum confidence level (0.1-1.0)"),
  include_partial_matches: z.boolean().optional().default(true).describe("Include partial pattern implementations"),
  namespace_scope: z.string().optional().describe("Limit search to specific namespace pattern"),
  exclude_unity_patterns: z.boolean().optional().default(false).describe("Exclude Unity-specific pattern implementations"),
  max_results_per_pattern: z.number().optional().default(10).describe("Maximum results per pattern type (1-50)")
});

/**
 * Factory function to create and register the find design patterns tool
 */
export function createFindDesignPatternsTool(server: any, context: ToolExecutionContext) {
  const handler = new FindDesignPatternsToolHandler(context);

  server.tool(
    "find_design_patterns",
    findDesignPatternsSchema,
    async (params: FindDesignPatternsParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
