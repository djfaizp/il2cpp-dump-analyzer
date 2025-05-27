/**
 * Find Cross References Tool Implementation
 * Analyzes cross-references and usage patterns in IL2CPP code
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';

/**
 * Find cross references parameters interface
 */
interface FindCrossReferencesParams {
  target_name: string;
  target_type: 'class' | 'interface' | 'enum' | 'method' | 'property' | 'field';
  reference_type?: 'usage' | 'inheritance' | 'implementation' | 'composition' | 'all';
  max_results?: number;
  include_nested?: boolean;
  include_system_types?: boolean;
}

/**
 * Cross reference interface
 */
interface CrossReference {
  referencingEntity: {
    name: string;
    fullName: string;
    namespace: string;
    type: string;
    location: string;
  };
  referenceType: string;
  context: string;
  lineNumber?: number;
  confidence: number;
}

/**
 * Cross references result interface
 */
interface CrossReferencesResult {
  target: {
    name: string;
    fullName: string;
    type: string;
    found: boolean;
  };
  references: CrossReference[];
  summary: {
    totalReferences: number;
    referencesByType: Record<string, number>;
    topReferencingNamespaces: Array<{ namespace: string; count: number }>;
    analysisMetadata: {
      searchedTarget: string;
      searchedType: string;
      referenceType: string;
      maxResults: number;
      includeNested: boolean;
      includeSystemTypes: boolean;
      timestamp: string;
    };
  };
}

/**
 * Find Cross References Tool Handler
 * Analyzes cross-references and usage patterns in IL2CPP code
 */
export class FindCrossReferencesToolHandler extends BaseAnalysisToolHandler<FindCrossReferencesParams, CrossReferencesResult> {
  constructor(context: ToolExecutionContext) {
    super({
      name: 'find_cross_references',
      description: 'Find cross-references and usage patterns in IL2CPP code',
      enableParameterValidation: true,
      enableResponseFormatting: true
    }, context);
  }

  /**
   * Validate cross references parameters
   */
  protected async validateParameters(params: FindCrossReferencesParams): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate target_name parameter
    if (!params.target_name || typeof params.target_name !== 'string') {
      errors.push('target_name is required and must be a string');
    } else if (params.target_name.trim().length === 0) {
      errors.push('target_name cannot be empty');
    }

    // Validate target_type parameter
    const targetTypeValidation = ParameterValidator.validateTargetType(params.target_type);
    errors.push(...targetTypeValidation.errors);

    // Validate reference_type parameter
    if (params.reference_type) {
      const referenceTypeValidation = ParameterValidator.validateReferenceType(params.reference_type);
      errors.push(...referenceTypeValidation.errors);
    } else {
      adjustedValues.reference_type = 'all';
    }

    // Validate max_results parameter
    if (params.max_results !== undefined) {
      adjustedValues.max_results = ParameterValidator.validateMaxResults(params.max_results, 200);
      if (adjustedValues.max_results !== params.max_results) {
        warnings.push(`max_results adjusted from ${params.max_results} to ${adjustedValues.max_results} (valid range: 1-200)`);
      }
    } else {
      adjustedValues.max_results = 50;
    }

    // Set defaults for optional boolean parameters
    if (params.include_nested === undefined) {
      adjustedValues.include_nested = true;
    }

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
   * Execute cross references analysis
   */
  protected async executeCore(params: FindCrossReferencesParams): Promise<CrossReferencesResult> {
    return await this.performAnalysis(async () => {
      // Step 1: Find the target entity
      const targetResults = await this.findTargetEntity(params.target_name, params.target_type);

      if (targetResults.length === 0) {
        return this.createNotFoundResult(params);
      }

      const target = targetResults[0];
      this.context.logger.debug(`Searching for references to: ${target.metadata.fullName}`);

      // Step 2: Search for references
      const references = await this.searchForReferences(target, params);

      // Step 3: Build result
      const result: CrossReferencesResult = {
        target: {
          name: target.metadata.name,
          fullName: target.metadata.fullName,
          type: target.metadata.type,
          found: true
        },
        references,
        summary: this.calculateSummary(references, params)
      };

      this.context.logger.debug(`Found ${references.length} cross-references for ${target.metadata.name}`);

      return result;
    });
  }

  /**
   * Find the target entity
   */
  private async findTargetEntity(targetName: string, targetType: string): Promise<Document[]> {
    return await this.context.vectorStore.searchWithFilter(
      targetName,
      { type: targetType },
      1
    );
  }

  /**
   * Search for references to the target entity
   */
  private async searchForReferences(
    target: Document,
    params: FindCrossReferencesParams
  ): Promise<CrossReference[]> {
    const references: CrossReference[] = [];
    const maxResults = params.max_results || 50;

    // Generate search queries based on the target
    const searchQueries = this.generateSearchQueries(target);

    const foundReferences = new Map<string, CrossReference>();

    for (const query of searchQueries) {
      try {
        const searchResults = await this.context.vectorStore.similaritySearch(
          query,
          Math.min(maxResults * 2, 100)
        );

        for (const result of searchResults) {
          // Skip self-references
          if (result.metadata.fullName === target.metadata.fullName) {
            continue;
          }

          // Skip system types if not included
          if (!params.include_system_types && this.isSystemType(result.metadata.namespace)) {
            continue;
          }

          const reference = this.createCrossReference(result, target, query, params);
          if (reference && !foundReferences.has(reference.referencingEntity.fullName)) {
            foundReferences.set(reference.referencingEntity.fullName, reference);
          }
        }

        if (foundReferences.size >= maxResults) {
          break;
        }
      } catch (error) {
        this.context.logger.warn(`Search query failed: ${query}`, error);
      }
    }

    return Array.from(foundReferences.values()).slice(0, maxResults);
  }

  /**
   * Generate search queries for finding references
   */
  private generateSearchQueries(target: Document): string[] {
    const targetName = target.metadata.name;
    const targetFullName = target.metadata.fullName;

    return [
      targetName,
      targetFullName,
      `: ${targetName}`,
      `<${targetName}>`,
      `${targetName}[]`,
      `${targetName}(`,
      `.${targetName}`,
      `new ${targetName}`,
      `typeof(${targetName})`,
      `${targetName}.`
    ];
  }

  /**
   * Create a cross reference from a search result
   */
  private createCrossReference(
    result: Document,
    target: Document,
    query: string,
    params: FindCrossReferencesParams
  ): CrossReference | null {
    try {
      const referenceType = this.determineReferenceType(result, target, query);

      // Filter by reference type if specified
      if (params.reference_type !== 'all' && referenceType !== params.reference_type) {
        return null;
      }

      return {
        referencingEntity: {
          name: result.metadata.name,
          fullName: result.metadata.fullName,
          namespace: result.metadata.namespace || '',
          type: result.metadata.type,
          location: `${result.metadata.namespace || 'global'}.${result.metadata.name}`
        },
        referenceType,
        context: this.extractContext(result.pageContent, target.metadata.name),
        confidence: this.calculateConfidence(result, target, query)
      };
    } catch (error) {
      this.context.logger.warn('Failed to create cross reference', error);
      return null;
    }
  }

  /**
   * Determine the type of reference
   */
  private determineReferenceType(result: Document, target: Document, query: string): string {
    if (query.includes('new ')) return 'instantiation';
    if (query.includes(': ')) return 'inheritance';
    if (query.includes('<') && query.includes('>')) return 'generic_parameter';
    if (query.includes('[]')) return 'array_type';
    if (query.includes('(')) return 'method_call';
    if (query.includes('.')) return 'member_access';
    return 'usage';
  }

  /**
   * Extract context around the reference
   */
  private extractContext(content: string, targetName: string): string {
    const lines = content.split('\n');
    const targetLine = lines.find(line => line.includes(targetName));
    return targetLine ? targetLine.trim() : '';
  }

  /**
   * Calculate confidence score for the reference
   */
  private calculateConfidence(result: Document, target: Document, query: string): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for exact matches
    if (result.pageContent.includes(target.metadata.fullName)) {
      confidence += 0.3;
    }

    // Increase confidence for specific query patterns
    if (query.includes('new ') || query.includes(': ')) {
      confidence += 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Check if a namespace is a system type
   */
  private isSystemType(namespace: string): boolean {
    if (!namespace) return false;
    const systemPrefixes = ['System', 'UnityEngine', 'Unity', 'Microsoft', 'Mono'];
    return systemPrefixes.some(prefix => namespace.startsWith(prefix));
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    references: CrossReference[],
    params: FindCrossReferencesParams
  ) {
    const referencesByType: Record<string, number> = {};
    const namespaceCount: Record<string, number> = {};

    references.forEach(ref => {
      // Count by reference type
      referencesByType[ref.referenceType] = (referencesByType[ref.referenceType] || 0) + 1;

      // Count by namespace
      const namespace = ref.referencingEntity.namespace || 'global';
      namespaceCount[namespace] = (namespaceCount[namespace] || 0) + 1;
    });

    const topReferencingNamespaces = Object.entries(namespaceCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([namespace, count]) => ({ namespace, count }));

    return {
      totalReferences: references.length,
      referencesByType,
      topReferencingNamespaces,
      analysisMetadata: {
        searchedTarget: params.target_name,
        searchedType: params.target_type,
        referenceType: params.reference_type || 'all',
        maxResults: params.max_results || 50,
        includeNested: params.include_nested || true,
        includeSystemTypes: params.include_system_types || false,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Create result for when target is not found
   */
  private createNotFoundResult(params: FindCrossReferencesParams): CrossReferencesResult {
    return {
      target: {
        name: params.target_name,
        fullName: params.target_name,
        type: params.target_type,
        found: false
      },
      references: [],
      summary: {
        totalReferences: 0,
        referencesByType: {},
        topReferencingNamespaces: [],
        analysisMetadata: {
          searchedTarget: params.target_name,
          searchedType: params.target_type,
          referenceType: params.reference_type || 'all',
          maxResults: params.max_results || 50,
          includeNested: params.include_nested || true,
          includeSystemTypes: params.include_system_types || false,
          timestamp: new Date().toISOString()
        }
      }
    };
  }
}

/**
 * Zod schema for find cross references tool parameters
 */
export const findCrossReferencesSchema = z.object({
  target_name: z.string().describe("Exact or partial name of the target entity to find references for"),
  target_type: z.enum(["class", "interface", "enum", "method", "property", "field"]).describe("Type of entity to find references for"),
  reference_type: z.enum(["usage", "inheritance", "implementation", "composition", "all"]).optional().default("all").describe("Type of references to find"),
  max_results: z.number().optional().default(50).describe("Maximum number of references to return (1-200)"),
  include_nested: z.boolean().optional().default(true).describe("Include references within nested types and inner classes"),
  include_system_types: z.boolean().optional().default(false).describe("Include references from Unity/System types")
});

/**
 * Factory function to create and register the find cross references tool
 */
export function createFindCrossReferencesTool(server: any, context: ToolExecutionContext) {
  const handler = new FindCrossReferencesToolHandler(context);

  server.tool(
    "find_cross_references",
    findCrossReferencesSchema,
    async (params: FindCrossReferencesParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
