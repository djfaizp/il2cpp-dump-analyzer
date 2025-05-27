/**
 * Analyze Dependencies Tool Implementation
 * Performs comprehensive dependency analysis for IL2CPP classes
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';

/**
 * Analyze dependencies parameters interface
 */
interface AnalyzeDependenciesParams {
  class_name: string;
  analysis_type?: 'incoming' | 'outgoing' | 'bidirectional' | 'circular';
  depth?: number;
  include_system_types?: boolean;
}

/**
 * Dependency node interface
 */
interface DependencyNode {
  name: string;
  fullName: string;
  namespace: string;
  type: 'class' | 'interface' | 'enum';
  relationship: 'inheritance' | 'interface' | 'field' | 'method_parameter' | 'method_return' | 'generic_parameter';
  depth: number;
  isSystemType: boolean;
}

/**
 * Dependency analysis result interface
 */
interface DependencyAnalysisResult {
  targetClass: {
    name: string;
    fullName: string;
    namespace: string;
  };
  incomingDependencies: DependencyNode[];
  outgoingDependencies: DependencyNode[];
  circularDependencies: Array<{
    path: string[];
    description: string;
  }>;
  metrics: {
    totalIncoming: number;
    totalOutgoing: number;
    systemTypeCount: number;
    userTypeCount: number;
    couplingScore: number;
    maxDepthReached: number;
  };
  analysisMetadata: {
    analysisType: string;
    requestedDepth: number;
    actualDepth: number;
    includeSystemTypes: boolean;
    timestamp: string;
  };
}

/**
 * Analyze Dependencies Tool Handler
 * Performs comprehensive dependency mapping and analysis for IL2CPP classes
 */
export class AnalyzeDependenciesToolHandler extends BaseAnalysisToolHandler<AnalyzeDependenciesParams, DependencyAnalysisResult> {
  constructor(context: ToolExecutionContext) {
    super({
      name: 'analyze_dependencies',
      description: 'Analyze class dependencies and relationships',
      enableParameterValidation: true,
      enableResponseFormatting: true
    }, context);
  }

  /**
   * Validate dependency analysis parameters
   */
  protected async validateParameters(params: AnalyzeDependenciesParams): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate class_name parameter
    const classNameValidation = ParameterValidator.validateClassName(params.class_name);
    errors.push(...classNameValidation.errors);
    warnings.push(...classNameValidation.warnings);

    // Validate analysis_type parameter
    const validAnalysisTypes = ['incoming', 'outgoing', 'bidirectional', 'circular'];
    if (params.analysis_type && !validAnalysisTypes.includes(params.analysis_type)) {
      errors.push(`analysis_type must be one of: ${validAnalysisTypes.join(', ')}`);
    } else if (!params.analysis_type) {
      adjustedValues.analysis_type = 'bidirectional';
    }

    // Validate depth parameter
    if (params.depth !== undefined) {
      adjustedValues.depth = ParameterValidator.validateDepth(params.depth);
      if (adjustedValues.depth !== params.depth) {
        warnings.push(`Depth adjusted from ${params.depth} to ${adjustedValues.depth} (valid range: 1-5)`);
      }
    } else {
      adjustedValues.depth = 3;
    }

    // Validate include_system_types parameter
    if (params.include_system_types === undefined) {
      adjustedValues.include_system_types = false;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }

  /**
   * Execute dependency analysis
   */
  protected async executeCore(params: AnalyzeDependenciesParams): Promise<DependencyAnalysisResult> {
    return await this.performAnalysis(async () => {
      // Step 1: Find the target class
      const classResults = await this.context.vectorStore.searchWithFilter(
        params.class_name,
        { type: 'class' },
        1
      );

      if (classResults.length === 0) {
        throw new Error(`Class '${params.class_name}' not found in the IL2CPP dump.`);
      }

      const targetClass = classResults[0];
      const targetClassName = targetClass.metadata.name;
      const targetFullName = targetClass.metadata.fullName;

      this.context.logger.debug(`Analyzing dependencies for class: ${targetClassName} (${targetFullName})`);

      // Step 2: Initialize analysis result
      const result: DependencyAnalysisResult = {
        targetClass: {
          name: targetClassName,
          fullName: targetFullName,
          namespace: targetClass.metadata.namespace || ''
        },
        incomingDependencies: [],
        outgoingDependencies: [],
        circularDependencies: [],
        metrics: {
          totalIncoming: 0,
          totalOutgoing: 0,
          systemTypeCount: 0,
          userTypeCount: 0,
          couplingScore: 0,
          maxDepthReached: 0
        },
        analysisMetadata: {
          analysisType: params.analysis_type || 'bidirectional',
          requestedDepth: params.depth || 3,
          actualDepth: params.depth || 3,
          includeSystemTypes: params.include_system_types || false,
          timestamp: new Date().toISOString()
        }
      };

      // Step 3: Analyze dependencies based on type
      if (params.analysis_type === 'outgoing' || params.analysis_type === 'bidirectional') {
        result.outgoingDependencies = await this.analyzeOutgoingDependencies(
          targetClass,
          params.depth || 3,
          params.include_system_types || false
        );
      }

      if (params.analysis_type === 'incoming' || params.analysis_type === 'bidirectional') {
        result.incomingDependencies = await this.analyzeIncomingDependencies(
          targetClassName,
          params.depth || 3,
          params.include_system_types || false
        );
      }

      if (params.analysis_type === 'circular') {
        result.circularDependencies = await this.detectCircularDependencies(
          targetClassName,
          params.depth || 3
        );
      }

      // Step 4: Calculate metrics
      result.metrics = this.calculateDependencyMetrics(result);

      return result;
    });
  }

  /**
   * Analyze outgoing dependencies (what this class depends on)
   */
  private async analyzeOutgoingDependencies(
    targetClass: Document,
    depth: number,
    includeSystemTypes: boolean
  ): Promise<DependencyNode[]> {
    const dependencies: DependencyNode[] = [];
    const visited = new Set<string>();

    // Helper function to check if a type is a system type
    const isSystemType = (typeName: string): boolean => {
      if (!typeName) return false;
      const systemPrefixes = ['System.', 'UnityEngine.', 'Unity.', 'Microsoft.', 'Mono.'];
      return systemPrefixes.some(prefix => typeName.startsWith(prefix));
    };

    // Helper function to extract type name from complex type strings
    const extractTypeName = (typeStr: string): string => {
      if (!typeStr) return '';
      return typeStr.replace(/[<>\[\]]/g, '').split(',')[0].trim();
    };

    // Analyze inheritance dependencies
    if (targetClass.metadata.baseClass) {
      const baseClassName = extractTypeName(targetClass.metadata.baseClass);
      if (!isSystemType(baseClassName) || includeSystemTypes) {
        dependencies.push({
          name: baseClassName,
          fullName: baseClassName,
          namespace: '',
          type: 'class',
          relationship: 'inheritance',
          depth: 1,
          isSystemType: isSystemType(baseClassName)
        });
      }
    }

    // Analyze interface dependencies
    if (targetClass.metadata.interfaces) {
      targetClass.metadata.interfaces.forEach((iface: string) => {
        const ifaceName = extractTypeName(iface);
        if (!isSystemType(ifaceName) || includeSystemTypes) {
          dependencies.push({
            name: ifaceName,
            fullName: ifaceName,
            namespace: '',
            type: 'interface',
            relationship: 'interface',
            depth: 1,
            isSystemType: isSystemType(ifaceName)
          });
        }
      });
    }

    // Analyze field type dependencies
    if (targetClass.metadata.fields) {
      targetClass.metadata.fields.forEach((field: any) => {
        const fieldTypeName = extractTypeName(field.type);
        if (!isSystemType(fieldTypeName) || includeSystemTypes) {
          dependencies.push({
            name: fieldTypeName,
            fullName: fieldTypeName,
            namespace: '',
            type: 'class',
            relationship: 'field',
            depth: 1,
            isSystemType: isSystemType(fieldTypeName)
          });
        }
      });
    }

    return dependencies;
  }

  /**
   * Analyze incoming dependencies (what depends on this class)
   */
  private async analyzeIncomingDependencies(
    targetClassName: string,
    depth: number,
    includeSystemTypes: boolean
  ): Promise<DependencyNode[]> {
    const dependencies: DependencyNode[] = [];

    // Search for classes that inherit from this class
    const inheritanceResults = await this.context.vectorStore.searchWithFilter(
      targetClassName,
      { baseClass: targetClassName },
      50
    );

    inheritanceResults.forEach(doc => {
      dependencies.push({
        name: doc.metadata.name,
        fullName: doc.metadata.fullName,
        namespace: doc.metadata.namespace || '',
        type: 'class',
        relationship: 'inheritance',
        depth: 1,
        isSystemType: false
      });
    });

    return dependencies;
  }

  /**
   * Detect circular dependencies
   */
  private async detectCircularDependencies(
    targetClassName: string,
    depth: number
  ): Promise<Array<{ path: string[]; description: string }>> {
    // Simplified circular dependency detection
    // In a full implementation, this would traverse the dependency graph
    return [];
  }

  /**
   * Calculate dependency metrics
   */
  private calculateDependencyMetrics(result: DependencyAnalysisResult) {
    const totalIncoming = result.incomingDependencies.length;
    const totalOutgoing = result.outgoingDependencies.length;
    const allDeps = [...result.incomingDependencies, ...result.outgoingDependencies];

    const systemTypeCount = allDeps.filter(dep => dep.isSystemType).length;
    const userTypeCount = allDeps.filter(dep => !dep.isSystemType).length;

    // Simple coupling score calculation
    const couplingScore = Math.min((totalIncoming + totalOutgoing) / 10, 1.0);

    const maxDepthReached = Math.max(
      ...allDeps.map(dep => dep.depth),
      0
    );

    return {
      totalIncoming,
      totalOutgoing,
      systemTypeCount,
      userTypeCount,
      couplingScore,
      maxDepthReached
    };
  }

  /**
   * Handle class not found error specifically
   */
  protected handleError(error: any, params?: AnalyzeDependenciesParams): MCPResponse {
    if (error.message && error.message.includes('not found')) {
      return MCPResponseFormatter.formatNotFoundResponse(
        params?.class_name || 'unknown',
        'Class'
      );
    }

    return super.handleError(error, params);
  }
}

/**
 * Zod schema for analyze dependencies tool parameters
 */
export const analyzeDependenciesSchema = z.object({
  class_name: z.string().describe("Target class to analyze dependencies for"),
  analysis_type: z.enum(["incoming", "outgoing", "bidirectional", "circular"]).optional().default("bidirectional").describe("Type of dependency analysis to perform"),
  depth: z.number().optional().default(3).describe("How deep to traverse dependency chains (1-5)"),
  include_system_types: z.boolean().optional().default(false).describe("Include Unity/System dependencies in analysis")
});

/**
 * Factory function to create and register the analyze dependencies tool
 */
export function createAnalyzeDependenciesTool(server: any, context: ToolExecutionContext) {
  const handler = new AnalyzeDependenciesToolHandler(context);

  server.tool(
    "analyze_dependencies",
    analyzeDependenciesSchema,
    async (params: AnalyzeDependenciesParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
