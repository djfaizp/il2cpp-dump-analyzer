/**
 * @fileoverview Analyze Generic Types MCP Tool
 *
 * Provides comprehensive analysis of IL2CPP generic type relationships including:
 * - Generic type definition analysis and constraint mapping
 * - Type parameter relationship analysis
 * - Generic instantiation tracking and usage patterns
 * - Constraint complexity analysis and validation
 *
 * This tool implements the generic type analysis functionality from TypeAnalyzer
 * as an MCP tool following established patterns and TFD methodology.
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';

/**
 * Zod schema for analyze generic types parameters
 */
const AnalyzeGenericTypesSchema = z.object({
  target_type: z.string().optional().describe('Specific generic type to analyze (optional, analyzes all generic types if not provided)'),
  include_constraints: z.boolean().default(true).describe('Whether to include constraint analysis'),
  include_instantiations: z.boolean().default(false).describe('Whether to include generic instantiation analysis'),
  complexity_threshold: z.number().min(1).max(10).default(1).describe('Minimum complexity threshold for analysis (1-10)')
});

/**
 * Generic type analysis parameters interface
 */
interface AnalyzeGenericTypesParams {
  target_type?: string;
  include_constraints?: boolean;
  include_instantiations?: boolean;
  complexity_threshold?: number;
}

/**
 * Generic type definition representation
 */
interface GenericTypeDefinition {
  typeName: string;
  namespace: string;
  typeDefIndex: number;
  genericParameters: string[];
  constraints: string[];
  constraintCount: number;
  complexityScore: number;
  isInterface: boolean;
}

/**
 * Constraint relationship representation
 */
interface ConstraintRelationship {
  sourceType: string;
  targetParameter: string;
  constraintType: string;
  constraintTarget: string;
  isTypeConstraint: boolean;
  isInterfaceConstraint: boolean;
  isClassConstraint: boolean;
}

/**
 * Generic instantiation representation
 */
interface GenericInstantiation {
  baseType: string;
  typeArguments: string[];
  instantiationContext: string;
  usageLocation: string;
  complexityScore: number;
}

/**
 * Generic type complexity metrics
 */
interface GenericComplexityMetrics {
  totalGenericTypes: number;
  averageTypeParameters: number;
  maxTypeParameters: number;
  constraintComplexity: number;
  nestingDepth: number;
}

/**
 * Generic type analysis result
 */
interface GenericTypeAnalysisResult {
  genericTypeDefinitions: GenericTypeDefinition[];
  constraintRelationships: ConstraintRelationship[];
  genericInstantiations: GenericInstantiation[];
  complexityMetrics: GenericComplexityMetrics;
  analysisMetadata: {
    targetType?: string;
    includeConstraints: boolean;
    includeInstantiations: boolean;
    complexityThreshold: number;
    timestamp: string;
    totalTypesAnalyzed: number;
  };
}

/**
 * Analyze Generic Types MCP Tool Implementation
 *
 * Analyzes IL2CPP generic type relationships and constraints using vector store search.
 * Provides comprehensive generic type analysis with constraint mapping and instantiation tracking.
 */
export class AnalyzeGenericTypesTool extends BaseAnalysisToolHandler<AnalyzeGenericTypesParams, GenericTypeAnalysisResult> {

  constructor(context: ToolExecutionContext) {
    super({
      name: 'analyze_generic_types',
      description: 'Analyze generic type relationships, constraints, and instantiations in IL2CPP dumps',
      enableParameterValidation: true,
      enableResponseFormatting: true
    }, context);
  }

  /**
   * Validate input parameters using Zod schema
   */
  protected async validateParameters(params: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate complexity_threshold parameter
    if (params.complexity_threshold !== undefined) {
      if (typeof params.complexity_threshold !== 'number' || params.complexity_threshold < 1 || params.complexity_threshold > 10) {
        errors.push('complexity_threshold must be a number between 1 and 10');
      }
    } else {
      adjustedValues.complexity_threshold = 3;
    }

    // Validate boolean parameters
    if (params.include_constraints === undefined) {
      adjustedValues.include_constraints = true;
    }

    if (params.include_instantiations === undefined) {
      adjustedValues.include_instantiations = true;
    }

    // Validate target_type if provided
    if (params.target_type && typeof params.target_type !== 'string') {
      errors.push('target_type must be a string');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }

  /**
   * Execute generic type analysis
   */
  protected async executeCore(params: AnalyzeGenericTypesParams): Promise<GenericTypeAnalysisResult> {
    return await this.performAnalysis(async () => {
      this.context.logger.debug('Starting generic type analysis', { params });

      // Step 1: Get generic types or specific target type
      let genericDocuments: Document[];

      if (params.target_type) {
        // Search for specific target type
        const targetResults = await this.context.vectorStore.searchWithFilter(
          params.target_type,
          { type: ['class', 'interface'] },
          1
        );

        if (targetResults.length === 0) {
          throw new Error(`Target generic type '${params.target_type}' not found in IL2CPP dump`);
        }

        // Verify it's actually a generic type
        const targetDoc = targetResults[0];
        if (!targetDoc.metadata.genericParameters || targetDoc.metadata.genericParameters.length === 0) {
          throw new Error(`Target type '${params.target_type}' is not a generic type`);
        }

        genericDocuments = targetResults;
      } else {
        // Get all generic types (classes and interfaces with generic parameters)
        const allTypes = await this.context.vectorStore.searchWithFilter(
          '',
          { type: ['class', 'interface'] },
          1000
        );

        genericDocuments = allTypes.filter(doc =>
          doc.metadata.genericParameters && doc.metadata.genericParameters.length > 0
        );
      }

      if (genericDocuments.length === 0) {
        throw new Error('No generic types found in IL2CPP dump for analysis');
      }

      this.context.logger.debug(`Found ${genericDocuments.length} generic types for analysis`);

      // Step 2: Analyze generic type definitions
      const genericTypeDefinitions = this.analyzeGenericTypeDefinitions(genericDocuments, params);

      // Step 3: Analyze constraint relationships if requested
      let constraintRelationships: ConstraintRelationship[] = [];
      if (params.include_constraints) {
        constraintRelationships = this.analyzeConstraintRelationships(genericDocuments);
      }

      // Step 4: Analyze generic instantiations if requested
      let genericInstantiations: GenericInstantiation[] = [];
      if (params.include_instantiations) {
        genericInstantiations = await this.analyzeGenericInstantiations();
      }

      // Step 5: Calculate complexity metrics
      const complexityMetrics = this.calculateComplexityMetrics(genericTypeDefinitions);

      const result: GenericTypeAnalysisResult = {
        genericTypeDefinitions,
        constraintRelationships,
        genericInstantiations,
        complexityMetrics,
        analysisMetadata: {
          targetType: params.target_type,
          includeConstraints: params.include_constraints ?? true,
          includeInstantiations: params.include_instantiations ?? false,
          complexityThreshold: params.complexity_threshold ?? 1,
          timestamp: new Date().toISOString(),
          totalTypesAnalyzed: genericDocuments.length
        }
      };

      this.context.logger.debug('Generic type analysis completed', {
        definitions: genericTypeDefinitions.length,
        constraints: constraintRelationships.length,
        instantiations: genericInstantiations.length,
        avgComplexity: complexityMetrics.averageTypeParameters
      });

      return result;
    });
  }

  /**
   * Analyze generic type definitions
   */
  private analyzeGenericTypeDefinitions(
    genericDocuments: Document[],
    params: AnalyzeGenericTypesParams
  ): GenericTypeDefinition[] {
    const complexityThreshold = params.complexity_threshold ?? 1;

    return genericDocuments
      .map(doc => {
        const genericParameters = doc.metadata.genericParameters || [];
        const constraints = doc.metadata.constraints || [];
        const complexityScore = genericParameters.length + constraints.length;

        return {
          typeName: doc.metadata.name,
          namespace: doc.metadata.namespace || '',
          typeDefIndex: doc.metadata.typeDefIndex || 0,
          genericParameters,
          constraints,
          constraintCount: constraints.length,
          complexityScore,
          isInterface: doc.metadata.type === 'interface'
        };
      })
      .filter(def => def.genericParameters.length >= complexityThreshold)
      .sort((a, b) => b.complexityScore - a.complexityScore);
  }

  /**
   * Analyze constraint relationships between generic types
   */
  private analyzeConstraintRelationships(genericDocuments: Document[]): ConstraintRelationship[] {
    const relationships: ConstraintRelationship[] = [];

    for (const doc of genericDocuments) {
      const typeName = `${doc.metadata.namespace}.${doc.metadata.name}`;
      const constraints = doc.metadata.constraints || [];
      const genericParameters = doc.metadata.genericParameters || [];

      for (const constraint of constraints) {
        // Parse constraint format: "T : class", "U : IComparable<T>", etc.
        const constraintMatch = constraint.match(/(\w+)\s*:\s*(.+)/);
        if (constraintMatch) {
          const [, parameter, constraintTarget] = constraintMatch;

          if (genericParameters.includes(parameter)) {
            relationships.push({
              sourceType: typeName,
              targetParameter: parameter,
              constraintType: this.getConstraintType(constraintTarget),
              constraintTarget: constraintTarget.trim(),
              isTypeConstraint: this.isTypeConstraint(constraintTarget),
              isInterfaceConstraint: this.isInterfaceConstraint(constraintTarget),
              isClassConstraint: constraintTarget.includes('class')
            });
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Analyze generic instantiations in the codebase
   */
  private async analyzeGenericInstantiations(): Promise<GenericInstantiation[]> {
    const instantiations: GenericInstantiation[] = [];

    // Search for fields and methods that use generic types
    const fieldsAndMethods = await this.context.vectorStore.searchWithFilter(
      '',
      { type: ['field', 'method'] },
      500
    );

    for (const doc of fieldsAndMethods) {
      const instantiation = this.extractGenericInstantiation(doc);
      if (instantiation) {
        instantiations.push(instantiation);
      }
    }

    return instantiations.sort((a, b) => b.complexityScore - a.complexityScore);
  }

  /**
   * Extract generic instantiation from document metadata
   */
  private extractGenericInstantiation(doc: Document): GenericInstantiation | null {
    const fieldType = doc.metadata.fieldType || doc.metadata.returnType;
    if (!fieldType) return null;

    // Look for generic type patterns like List<string>, Dictionary<int, string>
    const genericMatch = fieldType.match(/(\w+)<(.+)>/);
    if (!genericMatch) return null;

    const [, baseType, typeArgsStr] = genericMatch;
    const typeArguments = typeArgsStr.split(',').map((arg: string) => arg.trim());

    return {
      baseType,
      typeArguments,
      instantiationContext: doc.metadata.parentClass || 'unknown',
      usageLocation: `${doc.metadata.type}:${doc.metadata.name}`,
      complexityScore: typeArguments.length
    };
  }

  /**
   * Calculate complexity metrics for generic types
   */
  private calculateComplexityMetrics(definitions: GenericTypeDefinition[]): GenericComplexityMetrics {
    if (definitions.length === 0) {
      return {
        totalGenericTypes: 0,
        averageTypeParameters: 0,
        maxTypeParameters: 0,
        constraintComplexity: 0,
        nestingDepth: 0
      };
    }

    const totalGenericTypes = definitions.length;
    const totalTypeParameters = definitions.reduce((sum, def) => sum + def.genericParameters.length, 0);
    const averageTypeParameters = totalTypeParameters / totalGenericTypes;
    const maxTypeParameters = Math.max(...definitions.map(def => def.genericParameters.length));
    const constraintComplexity = definitions.reduce((sum, def) => sum + def.constraints.length, 0);

    // Calculate nesting depth by analyzing generic parameter names
    const nestingDepth = Math.max(...definitions.map(def =>
      Math.max(...def.genericParameters.map(param =>
        (param.match(/</g) || []).length
      ), 0)
    ), 0);

    return {
      totalGenericTypes,
      averageTypeParameters,
      maxTypeParameters,
      constraintComplexity,
      nestingDepth
    };
  }

  /**
   * Determine constraint type from constraint target
   */
  private getConstraintType(constraintTarget: string): string {
    if (constraintTarget.includes('class')) return 'class';
    if (constraintTarget.includes('struct')) return 'struct';
    if (constraintTarget.includes('new()')) return 'constructor';
    if (constraintTarget.includes('notnull')) return 'notnull';
    if (constraintTarget.startsWith('I') && constraintTarget[1]?.toUpperCase() === constraintTarget[1]) {
      return 'interface';
    }
    return 'type';
  }

  /**
   * Check if constraint is a type constraint
   */
  private isTypeConstraint(constraintTarget: string): boolean {
    return !['class', 'struct', 'new()', 'notnull'].some(keyword =>
      constraintTarget.includes(keyword)
    );
  }

  /**
   * Check if constraint is an interface constraint
   */
  private isInterfaceConstraint(constraintTarget: string): boolean {
    return constraintTarget.startsWith('I') &&
           constraintTarget[1]?.toUpperCase() === constraintTarget[1] &&
           !constraintTarget.includes('<');
  }

  /**
   * Format generic type analysis results
   */
  protected formatResponse(result: GenericTypeAnalysisResult, warnings: string[] = []): MCPResponse {
    let response = MCPResponseFormatter.formatAnalysisResults(
      result,
      this.config.name,
      result.analysisMetadata,
      Date.now() - this.startTime
    );

    if (warnings.length > 0) {
      response = MCPResponseFormatter.addWarnings(response, warnings);
    }

    return response;
  }
}

/**
 * Zod schema for analyze generic types tool parameters
 */
export const analyzeGenericTypesSchema = z.object({
  target_type: z.string().optional().describe("Specific generic type to analyze (optional, analyzes all generic types if not provided)"),
  include_constraints: z.boolean().optional().default(true).describe("Include generic type constraints in analysis"),
  include_instantiations: z.boolean().optional().default(false).describe("Include generic instantiation analysis"),
  complexity_threshold: z.number().min(1).max(10).optional().default(1).describe("Minimum complexity threshold for analysis (1-10)")
});

/**
 * Factory function to create and register the analyze generic types tool
 */
export function createAnalyzeGenericTypesTool(server: any, context: ToolExecutionContext) {
  const handler = new AnalyzeGenericTypesTool(context);

  server.tool(
    "analyze_generic_types",
    analyzeGenericTypesSchema,
    async (params: AnalyzeGenericTypesParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
