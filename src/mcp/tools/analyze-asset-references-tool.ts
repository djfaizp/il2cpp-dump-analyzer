/**
 * Analyze Asset References Tool Implementation
 * Analyzes Unity asset references and dependencies in IL2CPP code
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';
import { UnityAssetAnalyzer, AssetAnalysisResult } from '../../analysis/asset-analyzer';

/**
 * Analyze asset references parameters interface
 */
interface AnalyzeAssetReferencesParams {
  namespace_filter?: string;
  asset_type_filter?: string[];
  loading_method_filter?: string[];
  include_editor_assets?: boolean;
  include_optimization_recommendations?: boolean;
  max_results?: number;
}

/**
 * Analyze Asset References Tool Handler
 * Analyzes Unity asset references and dependencies in IL2CPP code
 */
export class AnalyzeAssetReferencesToolHandler extends BaseAnalysisToolHandler<AnalyzeAssetReferencesParams, AssetAnalysisResult> {
  private assetAnalyzer: UnityAssetAnalyzer;

  constructor(context: ToolExecutionContext) {
    super({
      name: 'analyze_asset_references',
      description: 'Analyze Unity asset references and dependencies in IL2CPP code',
      enableParameterValidation: true,
      enableResponseFormatting: true
    }, context);
    
    this.assetAnalyzer = new UnityAssetAnalyzer();
  }

  /**
   * Validate asset analysis parameters
   */
  protected async validateParameters(params: AnalyzeAssetReferencesParams): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate asset_type_filter parameter
    if (params.asset_type_filter) {
      const validAssetTypes = ['Texture', 'Audio', 'Prefab', 'Material', 'Animation', 'Script', 'Mesh', 'Font'];
      const invalidTypes = params.asset_type_filter.filter(type => !validAssetTypes.includes(type));
      if (invalidTypes.length > 0) {
        warnings.push(`Unknown asset types will be ignored: ${invalidTypes.join(', ')}`);
      }
    }

    // Validate loading_method_filter parameter
    if (params.loading_method_filter) {
      const validMethods = ['Resources.Load', 'AssetDatabase', 'Addressables', 'Direct Reference'];
      const invalidMethods = params.loading_method_filter.filter(method => !validMethods.includes(method));
      if (invalidMethods.length > 0) {
        warnings.push(`Unknown loading methods will be ignored: ${invalidMethods.join(', ')}`);
      }
    }

    // Validate max_results parameter
    if (params.max_results !== undefined) {
      adjustedValues.max_results = ParameterValidator.validateMaxResults(params.max_results, 1000);
      if (adjustedValues.max_results !== params.max_results) {
        warnings.push(`max_results adjusted from ${params.max_results} to ${adjustedValues.max_results} (valid range: 1-1000)`);
      }
    } else {
      adjustedValues.max_results = 500;
    }

    // Set defaults for optional boolean parameters
    if (params.include_editor_assets === undefined) {
      adjustedValues.include_editor_assets = false;
    }

    if (params.include_optimization_recommendations === undefined) {
      adjustedValues.include_optimization_recommendations = true;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }

  /**
   * Execute asset reference analysis
   */
  protected async executeCore(params: AnalyzeAssetReferencesParams): Promise<AssetAnalysisResult> {
    return await this.performAnalysis(async () => {
      this.context.logger.debug('Starting Unity asset reference analysis...');

      // Step 1: Get all relevant documents for analysis
      const documents = await this.getDocumentsForAnalysis(params);

      if (documents.length === 0) {
        throw new Error('No documents found for asset analysis. Ensure IL2CPP dump contains Unity code.');
      }

      this.context.logger.debug(`Analyzing ${documents.length} documents for asset references`);

      // Step 2: Perform asset analysis
      const analysisResult = await this.assetAnalyzer.analyzeAssets(documents);

      // Step 3: Apply filters to results
      const filteredResult = this.applyFilters(analysisResult, params);

      // Step 4: Limit results if specified
      if (params.max_results && params.max_results < filteredResult.assetReferences.length) {
        filteredResult.assetReferences = filteredResult.assetReferences.slice(0, params.max_results);
        filteredResult.totalAssets = Math.min(filteredResult.totalAssets, params.max_results);
      }

      this.context.logger.debug(`Asset analysis completed. Found ${filteredResult.totalAssets} assets with ${filteredResult.assetReferences.length} references`);

      return filteredResult;
    });
  }

  /**
   * Get documents for asset analysis based on filters
   */
  private async getDocumentsForAnalysis(params: AnalyzeAssetReferencesParams): Promise<Document[]> {
    const filter: Record<string, any> = {};

    // Apply namespace filter
    if (params.namespace_filter) {
      filter.namespace = params.namespace_filter;
    }

    // Get all classes and methods that might contain asset references
    const classResults = await this.context.vectorStore.searchWithFilter('', 
      { ...filter, type: 'class' }, 
      1000
    );

    const methodResults = await this.context.vectorStore.searchWithFilter('', 
      { ...filter, type: 'method' }, 
      1000
    );

    // Combine and deduplicate results
    const allDocuments = [...classResults, ...methodResults];
    const uniqueDocuments = new Map<string, Document>();
    
    allDocuments.forEach(doc => {
      const key = `${doc.metadata.fullName || doc.metadata.name}_${doc.metadata.type}`;
      if (!uniqueDocuments.has(key)) {
        uniqueDocuments.set(key, doc);
      }
    });

    return Array.from(uniqueDocuments.values());
  }

  /**
   * Apply filters to analysis results
   */
  private applyFilters(result: AssetAnalysisResult, params: AnalyzeAssetReferencesParams): AssetAnalysisResult {
    let filteredReferences = result.assetReferences;

    // Filter by asset type
    if (params.asset_type_filter && params.asset_type_filter.length > 0) {
      filteredReferences = filteredReferences.filter(ref => 
        params.asset_type_filter!.includes(ref.assetType)
      );
    }

    // Filter by loading method
    if (params.loading_method_filter && params.loading_method_filter.length > 0) {
      filteredReferences = filteredReferences.filter(ref => 
        params.loading_method_filter!.includes(ref.loadingMethod)
      );
    }

    // Filter editor assets
    if (!params.include_editor_assets) {
      filteredReferences = filteredReferences.filter(ref => 
        !ref.isAssetDatabase
      );
    }

    // Remove optimization recommendations if not requested
    let optimizationRecommendations = result.optimizationRecommendations;
    if (!params.include_optimization_recommendations) {
      optimizationRecommendations = [];
    }

    // Recalculate metadata based on filtered results
    const filteredAssetTypes: Record<string, number> = {};
    filteredReferences.forEach(ref => {
      filteredAssetTypes[ref.assetType] = (filteredAssetTypes[ref.assetType] || 0) + 1;
    });

    return {
      ...result,
      totalAssets: new Set(filteredReferences.map(ref => ref.assetPath)).size,
      assetReferences: filteredReferences,
      optimizationRecommendations,
      metadata: {
        ...result.metadata,
        assetTypes: filteredAssetTypes,
      },
    };
  }

  /**
   * Format asset analysis results
   */
  protected formatResponse(result: AssetAnalysisResult, warnings: string[] = []): MCPResponse {
    // Create a comprehensive summary
    const summary = {
      totalAssets: result.totalAssets,
      totalReferences: result.assetReferences.length,
      assetTypeBreakdown: result.metadata.assetTypes,
      loadingMethodBreakdown: this.calculateLoadingMethodBreakdown(result.assetReferences),
      topAssetTypes: this.getTopAssetTypes(result.metadata.assetTypes, 5),
      usagePatterns: result.usagePatterns.length,
      dependencies: result.dependencies.length,
      unusedAssets: result.unusedAssets.length,
      circularDependencies: result.circularDependencies.length,
      optimizationRecommendations: result.optimizationRecommendations.length,
      processingTime: result.metadata.processingTime,
    };

    const responseData = {
      summary,
      assetReferences: result.assetReferences,
      usagePatterns: result.usagePatterns,
      dependencies: result.dependencies,
      unusedAssets: result.unusedAssets,
      circularDependencies: result.circularDependencies,
      optimizationRecommendations: result.optimizationRecommendations,
      metadata: result.metadata,
    };

    let response = MCPResponseFormatter.formatAnalysisResults(
      responseData,
      this.config.name,
      { analysis_type: 'Unity Asset References' },
      Date.now() - this.startTime
    );

    if (warnings.length > 0) {
      response = MCPResponseFormatter.addWarnings(response, warnings);
    }

    return response;
  }

  /**
   * Calculate loading method breakdown
   */
  private calculateLoadingMethodBreakdown(references: any[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    references.forEach(ref => {
      breakdown[ref.loadingMethod] = (breakdown[ref.loadingMethod] || 0) + 1;
    });
    return breakdown;
  }

  /**
   * Get top asset types by usage
   */
  private getTopAssetTypes(assetTypes: Record<string, number>, limit: number): Array<{ type: string; count: number }> {
    return Object.entries(assetTypes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([type, count]) => ({ type, count }));
  }
}

/**
 * Zod schema for analyze asset references tool parameters
 */
export const analyzeAssetReferencesSchema = z.object({
  namespace_filter: z.string().optional().describe("Filter analysis to specific namespace pattern"),
  asset_type_filter: z.array(z.enum(["Texture", "Audio", "Prefab", "Material", "Animation", "Script", "Mesh", "Font"])).optional().describe("Filter by specific asset types"),
  loading_method_filter: z.array(z.enum(["Resources.Load", "AssetDatabase", "Addressables", "Direct Reference"])).optional().describe("Filter by asset loading methods"),
  include_editor_assets: z.boolean().optional().default(false).describe("Include editor-only asset references (AssetDatabase calls)"),
  include_optimization_recommendations: z.boolean().optional().default(true).describe("Include optimization recommendations in results"),
  max_results: z.number().optional().default(500).describe("Maximum number of asset references to return (1-1000)")
});

/**
 * Factory function to create and register the analyze asset references tool
 */
export function createAnalyzeAssetReferencesTool(server: any, context: ToolExecutionContext) {
  const handler = new AnalyzeAssetReferencesToolHandler(context);

  server.tool(
    "analyze_asset_references",
    analyzeAssetReferencesSchema,
    async (params: AnalyzeAssetReferencesParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
