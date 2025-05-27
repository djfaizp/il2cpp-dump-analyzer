/**
 * @fileoverview Analyze Type Compatibility MCP Tool
 *
 * Provides comprehensive analysis of IL2CPP type compatibility including:
 * - Type assignability analysis and inheritance-based compatibility
 * - Interface implementation compatibility checking
 * - Generic type compatibility and constraint validation
 * - Conversion path analysis and implicit/explicit conversion detection
 *
 * This tool implements the type compatibility analysis functionality from TypeAnalyzer
 * as an MCP tool following established patterns and TFD methodology.
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';

/**
 * Zod schema for analyze type compatibility parameters
 */
const AnalyzeTypeCompatibilitySchema = z.object({
  from_type: z.string().optional().describe('Source type for compatibility analysis (required for specific analysis)'),
  to_type: z.string().optional().describe('Target type for compatibility analysis (required for specific analysis)'),
  include_conversion_paths: z.boolean().default(true).describe('Whether to include conversion path analysis'),
  include_implicit_conversions: z.boolean().default(true).describe('Whether to include implicit conversion analysis')
}).refine(data => {
  // If one type is specified, both must be specified
  if (data.from_type && !data.to_type) return false;
  if (!data.from_type && data.to_type) return false;
  return true;
}, {
  message: "Both from_type and to_type must be specified together, or neither for matrix analysis"
});

/**
 * Type compatibility analysis parameters interface
 */
interface AnalyzeTypeCompatibilityParams {
  from_type?: string;
  to_type?: string;
  include_conversion_paths?: boolean;
  include_implicit_conversions?: boolean;
}

/**
 * Assignability rule representation
 */
interface AssignabilityRule {
  fromType: string;
  toType: string;
  rule: string;
  conditions: string[];
}

/**
 * Conversion path representation
 */
interface ConversionPath {
  fromType: string;
  toType: string;
  path: string[];
  conversionType: 'implicit' | 'explicit';
}

/**
 * Type compatibility result
 */
interface TypeCompatibilityResult {
  fromType: string;
  toType: string;
  isCompatible: boolean;
  compatibilityType: 'assignable' | 'convertible' | 'incompatible';
  assignabilityRule?: AssignabilityRule;
  conversionPath?: ConversionPath;
  confidence: number;
}

/**
 * Compatibility matrix entry
 */
interface CompatibilityMatrixEntry {
  fromType: string;
  toType: string;
  compatibility: TypeCompatibilityResult;
}

/**
 * Type compatibility analysis result
 */
interface TypeCompatibilityAnalysisResult {
  // Single type pair analysis
  fromType?: string;
  toType?: string;
  isCompatible?: boolean;
  compatibilityType?: 'assignable' | 'convertible' | 'incompatible';
  assignabilityRule?: AssignabilityRule;
  conversionPath?: ConversionPath;
  confidence?: number;

  // Matrix analysis for all types
  compatibilityMatrix?: CompatibilityMatrixEntry[];

  analysisMetadata: {
    analysisType: 'specific' | 'matrix';
    includeConversionPaths: boolean;
    includeImplicitConversions: boolean;
    timestamp: string;
    totalTypesAnalyzed: number;
    totalCompatibilityChecks: number;
  };
}

/**
 * Analyze Type Compatibility MCP Tool Implementation
 *
 * Analyzes IL2CPP type compatibility and conversion relationships using vector store search.
 * Provides comprehensive compatibility analysis with assignability rules and conversion paths.
 */
export class AnalyzeTypeCompatibilityTool extends BaseAnalysisToolHandler<AnalyzeTypeCompatibilityParams, TypeCompatibilityAnalysisResult> {

  constructor(context: ToolExecutionContext) {
    super({
      name: 'analyze_type_compatibility',
      description: 'Analyze type compatibility, assignability rules, and conversion paths in IL2CPP dumps',
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

    // Validate type pair requirement
    if (params.from_type && !params.to_type) {
      errors.push('to_type is required when from_type is specified');
    }
    if (!params.from_type && params.to_type) {
      errors.push('from_type is required when to_type is specified');
    }

    // Validate type names if provided
    if (params.from_type && typeof params.from_type !== 'string') {
      errors.push('from_type must be a string');
    }
    if (params.to_type && typeof params.to_type !== 'string') {
      errors.push('to_type must be a string');
    }

    // Set defaults for boolean parameters
    if (params.include_conversion_paths === undefined) {
      adjustedValues.include_conversion_paths = true;
    }

    if (params.include_implicit_conversions === undefined) {
      adjustedValues.include_implicit_conversions = true;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }

  /**
   * Execute type compatibility analysis
   */
  protected async executeCore(params: AnalyzeTypeCompatibilityParams): Promise<TypeCompatibilityAnalysisResult> {
    return await this.performAnalysis(async () => {
      this.context.logger.debug('Starting type compatibility analysis', { params });

      if (params.from_type && params.to_type) {
        // Specific type pair analysis
        return await this.analyzeSpecificTypeCompatibility(params);
      } else {
        // Matrix analysis for all types
        return await this.analyzeTypeCompatibilityMatrix(params);
      }
    });
  }

  /**
   * Analyze compatibility between two specific types
   */
  private async analyzeSpecificTypeCompatibility(params: AnalyzeTypeCompatibilityParams): Promise<TypeCompatibilityAnalysisResult> {
    const fromType = params.from_type!;
    const toType = params.to_type!;

    // Search for both types
    const fromTypeResults = await this.context.vectorStore.searchWithFilter(
      fromType,
      { type: ['class', 'interface', 'struct'] },
      1
    );

    const toTypeResults = await this.context.vectorStore.searchWithFilter(
      toType,
      { type: ['class', 'interface', 'struct'] },
      1
    );

    if (fromTypeResults.length === 0) {
      throw new Error(`Source type '${fromType}' not found in IL2CPP dump`);
    }

    if (toTypeResults.length === 0) {
      throw new Error(`Target type '${toType}' not found in IL2CPP dump`);
    }

    const fromTypeDoc = fromTypeResults[0];
    const toTypeDoc = toTypeResults[0];

    // Get all types for comprehensive analysis
    const allTypes = await this.context.vectorStore.searchWithFilter(
      '',
      { type: ['class', 'interface', 'struct'] },
      1000
    );

    // Analyze compatibility
    const compatibility = this.analyzeTypeCompatibility(fromTypeDoc, toTypeDoc, allTypes, params);

    this.context.logger.debug('Specific type compatibility analysis completed', {
      fromType,
      toType,
      isCompatible: compatibility.isCompatible,
      compatibilityType: compatibility.compatibilityType
    });

    return {
      fromType,
      toType,
      isCompatible: compatibility.isCompatible,
      compatibilityType: compatibility.compatibilityType,
      assignabilityRule: compatibility.assignabilityRule,
      conversionPath: compatibility.conversionPath,
      confidence: compatibility.confidence,
      analysisMetadata: {
        analysisType: 'specific',
        includeConversionPaths: params.include_conversion_paths ?? true,
        includeImplicitConversions: params.include_implicit_conversions ?? true,
        timestamp: new Date().toISOString(),
        totalTypesAnalyzed: 2,
        totalCompatibilityChecks: 1
      }
    };
  }

  /**
   * Analyze compatibility matrix for all types
   */
  private async analyzeTypeCompatibilityMatrix(params: AnalyzeTypeCompatibilityParams): Promise<TypeCompatibilityAnalysisResult> {
    // Get all types
    const allTypes = await this.context.vectorStore.searchWithFilter(
      '',
      { type: ['class', 'interface', 'struct'] },
      1000
    );

    if (allTypes.length === 0) {
      throw new Error('No types found in IL2CPP dump for compatibility analysis');
    }

    this.context.logger.debug(`Found ${allTypes.length} types for compatibility matrix analysis`);

    const compatibilityMatrix: CompatibilityMatrixEntry[] = [];
    let totalChecks = 0;

    // Analyze compatibility between all type pairs (limited to avoid performance issues)
    const maxTypes = Math.min(allTypes.length, 20); // Limit to 20 types for matrix analysis
    const typesToAnalyze = allTypes.slice(0, maxTypes);

    for (let i = 0; i < typesToAnalyze.length; i++) {
      for (let j = 0; j < typesToAnalyze.length; j++) {
        if (i !== j) { // Don't analyze self-compatibility
          const fromTypeDoc = typesToAnalyze[i];
          const toTypeDoc = typesToAnalyze[j];

          const compatibility = this.analyzeTypeCompatibility(fromTypeDoc, toTypeDoc, allTypes, params);

          compatibilityMatrix.push({
            fromType: `${fromTypeDoc.metadata.namespace}.${fromTypeDoc.metadata.name}`,
            toType: `${toTypeDoc.metadata.namespace}.${toTypeDoc.metadata.name}`,
            compatibility
          });

          totalChecks++;
        }
      }
    }

    this.context.logger.debug('Type compatibility matrix analysis completed', {
      totalTypes: typesToAnalyze.length,
      totalChecks,
      compatiblePairs: compatibilityMatrix.filter(entry => entry.compatibility.isCompatible).length
    });

    return {
      compatibilityMatrix,
      analysisMetadata: {
        analysisType: 'matrix',
        includeConversionPaths: params.include_conversion_paths ?? true,
        includeImplicitConversions: params.include_implicit_conversions ?? true,
        timestamp: new Date().toISOString(),
        totalTypesAnalyzed: typesToAnalyze.length,
        totalCompatibilityChecks: totalChecks
      }
    };
  }

  /**
   * Analyze compatibility between two type documents
   */
  private analyzeTypeCompatibility(
    fromTypeDoc: Document,
    toTypeDoc: Document,
    allTypes: Document[],
    params: AnalyzeTypeCompatibilityParams
  ): TypeCompatibilityResult {
    const fromFullName = `${fromTypeDoc.metadata.namespace}.${fromTypeDoc.metadata.name}`;
    const toFullName = `${toTypeDoc.metadata.namespace}.${toTypeDoc.metadata.name}`;

    // Check direct assignability (inheritance)
    if (this.isAssignableViaInheritance(fromTypeDoc, toTypeDoc, allTypes)) {
      return {
        fromType: fromFullName,
        toType: toFullName,
        isCompatible: true,
        compatibilityType: 'assignable',
        assignabilityRule: {
          fromType: fromFullName,
          toType: toFullName,
          rule: 'inheritance_assignability',
          conditions: ['fromType inherits from toType']
        },
        confidence: 0.95
      };
    }

    // Check interface implementation
    if (this.isAssignableViaInterface(fromTypeDoc, toTypeDoc)) {
      return {
        fromType: fromFullName,
        toType: toFullName,
        isCompatible: true,
        compatibilityType: 'assignable',
        assignabilityRule: {
          fromType: fromFullName,
          toType: toFullName,
          rule: 'interface_assignability',
          conditions: ['fromType implements toType interface']
        },
        confidence: 0.90
      };
    }

    // Check generic compatibility
    if (this.isGenericCompatible(fromTypeDoc, toTypeDoc)) {
      return {
        fromType: fromFullName,
        toType: toFullName,
        isCompatible: true,
        compatibilityType: 'convertible',
        conversionPath: {
          fromType: fromFullName,
          toType: toFullName,
          path: [fromFullName, toFullName],
          conversionType: 'explicit'
        },
        confidence: 0.75
      };
    }

    // Check built-in conversions if requested
    if (params.include_conversion_paths) {
      const conversionPath = this.findBuiltInConversionPath(fromTypeDoc, toTypeDoc, params.include_implicit_conversions);
      if (conversionPath) {
        return {
          fromType: fromFullName,
          toType: toFullName,
          isCompatible: true,
          compatibilityType: 'convertible',
          conversionPath,
          confidence: conversionPath.conversionType === 'implicit' ? 0.85 : 0.70
        };
      }
    }

    // Types are incompatible
    return {
      fromType: fromFullName,
      toType: toFullName,
      isCompatible: false,
      compatibilityType: 'incompatible',
      confidence: 0.95
    };
  }

  /**
   * Check if fromType is assignable to toType via inheritance
   */
  private isAssignableViaInheritance(fromTypeDoc: Document, toTypeDoc: Document, allTypes: Document[]): boolean {
    const toTypeName = toTypeDoc.metadata.name;
    const toFullName = `${toTypeDoc.metadata.namespace}.${toTypeDoc.metadata.name}`;

    // Create type lookup map
    const typeMap = new Map<string, Document>();
    allTypes.forEach(doc => {
      const fullName = `${doc.metadata.namespace}.${doc.metadata.name}`;
      typeMap.set(fullName, doc);
      typeMap.set(doc.metadata.name, doc); // Also map by simple name
    });

    // Traverse inheritance chain
    let currentType = fromTypeDoc;
    const visited = new Set<string>();

    while (currentType && currentType.metadata.baseClass) {
      const currentFullName = `${currentType.metadata.namespace}.${currentType.metadata.name}`;

      if (visited.has(currentFullName)) {
        break; // Circular inheritance detected
      }
      visited.add(currentFullName);

      const baseClass = currentType.metadata.baseClass;

      // Check if base class matches target type
      if (baseClass === toTypeName || baseClass === toFullName) {
        return true;
      }

      // Find base class document
      const baseClassDoc = typeMap.get(baseClass) || typeMap.get(baseClass.split('.').pop() || '');
      if (!baseClassDoc) {
        break;
      }

      currentType = baseClassDoc;
    }

    return false;
  }

  /**
   * Check if fromType is assignable to toType via interface implementation
   */
  private isAssignableViaInterface(fromTypeDoc: Document, toTypeDoc: Document): boolean {
    if (toTypeDoc.metadata.type !== 'interface') {
      return false;
    }

    const toTypeName = toTypeDoc.metadata.name;
    const toFullName = `${toTypeDoc.metadata.namespace}.${toTypeDoc.metadata.name}`;
    const interfaces = fromTypeDoc.metadata.interfaces || [];

    return interfaces.some((interfaceName: string) =>
      interfaceName === toTypeName ||
      interfaceName === toFullName ||
      interfaceName.endsWith(`.${toTypeName}`)
    );
  }

  /**
   * Check if types are compatible via generic type relationships
   */
  private isGenericCompatible(fromTypeDoc: Document, toTypeDoc: Document): boolean {
    // Check if both types are generic or generic instantiations
    const fromGeneric = fromTypeDoc.metadata.genericParameters || fromTypeDoc.metadata.genericInstantiation;
    const toGeneric = toTypeDoc.metadata.genericParameters || toTypeDoc.metadata.genericInstantiation;

    if (!fromGeneric || !toGeneric) {
      return false;
    }

    // Simple generic compatibility check
    // In a real implementation, this would be much more sophisticated
    const fromBaseName = fromTypeDoc.metadata.genericInstantiation?.baseType || fromTypeDoc.metadata.name;
    const toBaseName = toTypeDoc.metadata.genericInstantiation?.baseType || toTypeDoc.metadata.name;

    return fromBaseName === toBaseName;
  }

  /**
   * Find built-in conversion path between types
   */
  private findBuiltInConversionPath(
    fromTypeDoc: Document,
    toTypeDoc: Document,
    includeImplicit: boolean = true
  ): ConversionPath | null {
    const fromTypeName = fromTypeDoc.metadata.name;
    const toTypeName = toTypeDoc.metadata.name;
    const fromFullName = `${fromTypeDoc.metadata.namespace}.${fromTypeDoc.metadata.name}`;
    const toFullName = `${toTypeDoc.metadata.namespace}.${toTypeDoc.metadata.name}`;

    // Define built-in conversion rules
    const implicitConversions = new Map<string, string[]>([
      ['byte', ['short', 'ushort', 'int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal']],
      ['sbyte', ['short', 'int', 'long', 'float', 'double', 'decimal']],
      ['short', ['int', 'long', 'float', 'double', 'decimal']],
      ['ushort', ['int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal']],
      ['int', ['long', 'float', 'double', 'decimal']],
      ['uint', ['long', 'ulong', 'float', 'double', 'decimal']],
      ['long', ['float', 'double', 'decimal']],
      ['ulong', ['float', 'double', 'decimal']],
      ['char', ['ushort', 'int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal']],
      ['float', ['double']]
    ]);

    const explicitConversions = new Map<string, string[]>([
      ['double', ['float', 'decimal', 'long', 'ulong', 'int', 'uint', 'short', 'ushort', 'byte', 'sbyte', 'char']],
      ['float', ['decimal', 'long', 'ulong', 'int', 'uint', 'short', 'ushort', 'byte', 'sbyte', 'char']],
      ['decimal', ['double', 'float', 'long', 'ulong', 'int', 'uint', 'short', 'ushort', 'byte', 'sbyte', 'char']],
      ['long', ['int', 'uint', 'short', 'ushort', 'byte', 'sbyte', 'char']],
      ['ulong', ['long', 'int', 'uint', 'short', 'ushort', 'byte', 'sbyte', 'char']],
      ['int', ['uint', 'short', 'ushort', 'byte', 'sbyte', 'char']],
      ['uint', ['int', 'short', 'ushort', 'byte', 'sbyte', 'char']],
      ['short', ['ushort', 'byte', 'sbyte', 'char']],
      ['ushort', ['short', 'byte', 'sbyte', 'char']],
      ['byte', ['sbyte']],
      ['sbyte', ['byte', 'char']]
    ]);

    // Check implicit conversions
    if (includeImplicit && implicitConversions.has(fromTypeName)) {
      const targets = implicitConversions.get(fromTypeName)!;
      if (targets.includes(toTypeName)) {
        return {
          fromType: fromFullName,
          toType: toFullName,
          path: [fromFullName, toFullName],
          conversionType: 'implicit'
        };
      }
    }

    // Check explicit conversions
    if (explicitConversions.has(fromTypeName)) {
      const targets = explicitConversions.get(fromTypeName)!;
      if (targets.includes(toTypeName)) {
        return {
          fromType: fromFullName,
          toType: toFullName,
          path: [fromFullName, toFullName],
          conversionType: 'explicit'
        };
      }
    }

    return null;
  }

  /**
   * Format type compatibility analysis results
   */
  protected formatResponse(result: TypeCompatibilityAnalysisResult, warnings: string[] = []): MCPResponse {
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
 * Zod schema for analyze type compatibility tool parameters
 */
export const analyzeTypeCompatibilitySchema = z.object({
  from_type: z.string().optional().describe("Source type for compatibility analysis (required for specific analysis)"),
  to_type: z.string().optional().describe("Target type for compatibility analysis (required for specific analysis)"),
  include_conversion_paths: z.boolean().optional().default(true).describe("Include conversion path analysis"),
  include_implicit_conversions: z.boolean().optional().default(true).describe("Include implicit conversion analysis")
}).refine(data => {
  // If one type is specified, both must be specified
  if (data.from_type && !data.to_type) return false;
  if (!data.from_type && data.to_type) return false;
  return true;
}, {
  message: "Both from_type and to_type must be specified together, or neither for matrix analysis"
});

/**
 * Factory function to create and register the analyze type compatibility tool
 */
export function createAnalyzeTypeCompatibilityTool(server: any, context: ToolExecutionContext) {
  const handler = new AnalyzeTypeCompatibilityTool(context);

  server.tool(
    "analyze_type_compatibility",
    analyzeTypeCompatibilitySchema,
    async (params: AnalyzeTypeCompatibilityParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
