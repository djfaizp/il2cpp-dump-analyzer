/**
 * Find Unused Assets Tool Implementation
 * Identifies potentially unused Unity assets for optimization
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';
import { UnityAssetAnalyzer, AssetAnalysisResult } from '../../analysis/asset-analyzer';

/**
 * Find unused assets parameters interface
 */
interface FindUnusedAssetsParams {
  asset_type_filter?: string[];
  exclude_editor_assets?: boolean;
  confidence_threshold?: number;
  include_potential_references?: boolean;
  namespace_scope?: string;
  max_results?: number;
}

/**
 * Unused asset interface
 */
interface UnusedAsset {
  assetPath: string;
  assetType: string;
  confidence: number;
  reasons: string[];
  potentialReferences: string[];
  estimatedSizeImpact: string;
  removalRisk: 'low' | 'medium' | 'high';
}

/**
 * Unused assets result interface
 */
interface UnusedAssetsResult {
  unusedAssets: UnusedAsset[];
  summary: {
    totalUnusedAssets: number;
    unusedByType: Record<string, number>;
    estimatedSpaceSavings: string;
    highConfidenceUnused: number;
    removalRecommendations: string[];
  };
  metadata: {
    analysisScope: string;
    confidenceThreshold: number;
    includeEditorAssets: boolean;
    timestamp: string;
    processingTime: number;
  };
}

/**
 * Find Unused Assets Tool Handler
 * Identifies potentially unused Unity assets for optimization
 */
export class FindUnusedAssetsToolHandler extends BaseAnalysisToolHandler<FindUnusedAssetsParams, UnusedAssetsResult> {
  private assetAnalyzer: UnityAssetAnalyzer;

  constructor(context: ToolExecutionContext) {
    super({
      name: 'find_unused_assets',
      description: 'Find potentially unused Unity assets for optimization',
      enableParameterValidation: true,
      enableResponseFormatting: true
    }, context);
    
    this.assetAnalyzer = new UnityAssetAnalyzer();
  }

  /**
   * Validate unused assets parameters
   */
  protected async validateParameters(params: FindUnusedAssetsParams): Promise<ValidationResult> {
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

    // Validate confidence_threshold parameter
    if (params.confidence_threshold !== undefined) {
      adjustedValues.confidence_threshold = ParameterValidator.validateConfidence(params.confidence_threshold);
      if (adjustedValues.confidence_threshold !== params.confidence_threshold) {
        warnings.push(`Confidence threshold adjusted from ${params.confidence_threshold} to ${adjustedValues.confidence_threshold} (valid range: 0.1-1.0)`);
      }
    } else {
      adjustedValues.confidence_threshold = 0.8;
    }

    // Validate max_results parameter
    if (params.max_results !== undefined) {
      adjustedValues.max_results = ParameterValidator.validateMaxResults(params.max_results, 500);
      if (adjustedValues.max_results !== params.max_results) {
        warnings.push(`max_results adjusted from ${params.max_results} to ${adjustedValues.max_results} (valid range: 1-500)`);
      }
    } else {
      adjustedValues.max_results = 100;
    }

    // Set defaults for optional boolean parameters
    if (params.exclude_editor_assets === undefined) {
      adjustedValues.exclude_editor_assets = true;
    }

    if (params.include_potential_references === undefined) {
      adjustedValues.include_potential_references = true;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }

  /**
   * Execute unused assets analysis
   */
  protected async executeCore(params: FindUnusedAssetsParams): Promise<UnusedAssetsResult> {
    return await this.performAnalysis(async () => {
      this.context.logger.debug('Starting unused assets analysis...');

      // Step 1: Get all documents for analysis
      const documents = await this.getDocumentsForAnalysis(params);

      if (documents.length === 0) {
        throw new Error('No documents found for unused asset analysis.');
      }

      this.context.logger.debug(`Analyzing ${documents.length} documents for unused assets`);

      // Step 2: Perform full asset analysis
      const assetAnalysis = await this.assetAnalyzer.analyzeAssets(documents);

      // Step 3: Identify unused assets with detailed analysis
      const unusedAssets = await this.identifyUnusedAssets(assetAnalysis, documents, params);

      // Step 4: Calculate summary statistics
      const summary = this.calculateSummary(unusedAssets);

      // Step 5: Apply filters and limits
      const filteredUnusedAssets = this.applyFilters(unusedAssets, params);

      this.context.logger.debug(`Found ${filteredUnusedAssets.length} potentially unused assets`);

      return {
        unusedAssets: filteredUnusedAssets,
        summary,
        metadata: {
          analysisScope: params.namespace_scope || 'All namespaces',
          confidenceThreshold: params.confidence_threshold || 0.8,
          includeEditorAssets: !params.exclude_editor_assets,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - this.startTime,
        },
      };
    });
  }

  /**
   * Get documents for analysis based on filters
   */
  private async getDocumentsForAnalysis(params: FindUnusedAssetsParams): Promise<Document[]> {
    const filter: Record<string, any> = {};

    // Apply namespace filter
    if (params.namespace_scope) {
      filter.namespace = params.namespace_scope;
    }

    // Get all relevant documents
    const classResults = await this.context.vectorStore.searchWithFilter('', 
      { ...filter, type: 'class' }, 
      1000
    );

    const methodResults = await this.context.vectorStore.searchWithFilter('', 
      { ...filter, type: 'method' }, 
      1000
    );

    return [...classResults, ...methodResults];
  }

  /**
   * Identify unused assets with detailed analysis
   */
  private async identifyUnusedAssets(
    assetAnalysis: AssetAnalysisResult,
    documents: Document[],
    params: FindUnusedAssetsParams
  ): Promise<UnusedAsset[]> {
    const unusedAssets: UnusedAsset[] = [];
    const usedAssetPaths = new Set(assetAnalysis.assetReferences.map(ref => ref.assetPath));

    // Get all potential asset paths from the codebase
    const allPotentialAssets = await this.extractAllPotentialAssets(documents);

    for (const assetPath of allPotentialAssets) {
      if (!usedAssetPaths.has(assetPath)) {
        const unusedAsset = await this.analyzeUnusedAsset(assetPath, documents, params);
        if (unusedAsset && unusedAsset.confidence >= (params.confidence_threshold || 0.8)) {
          unusedAssets.push(unusedAsset);
        }
      }
    }

    return unusedAssets;
  }

  /**
   * Extract all potential asset paths from documents
   */
  private async extractAllPotentialAssets(documents: Document[]): Promise<string[]> {
    const assetPaths = new Set<string>();

    // Look for string literals that might be asset paths
    const assetPathPatterns = [
      /"([^"]+\.(png|jpg|jpeg|gif|bmp|tga|psd|tiff|prefab|mat|anim|wav|mp3|ogg|aiff|fbx|obj|blend|unity|asset))"/gi,
      /"(Assets\/[^"]+)"/gi,
      /"(Resources\/[^"]+)"/gi,
      /"([^"]+\/[^"]+)"/gi, // General path-like strings
    ];

    for (const doc of documents) {
      const content = doc.pageContent;
      
      for (const pattern of assetPathPatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const path = match[1];
          if (path && path.length > 3 && !path.includes('System.') && !path.includes('UnityEngine.')) {
            assetPaths.add(path);
          }
        }
      }
    }

    return Array.from(assetPaths);
  }

  /**
   * Analyze a specific unused asset
   */
  private async analyzeUnusedAsset(
    assetPath: string,
    documents: Document[],
    params: FindUnusedAssetsParams
  ): Promise<UnusedAsset | null> {
    const reasons: string[] = [];
    const potentialReferences: string[] = [];
    let confidence = 0.9; // Start with high confidence for unused

    // Check for any potential references in comments or strings
    if (params.include_potential_references) {
      for (const doc of documents) {
        const content = doc.pageContent.toLowerCase();
        const assetName = assetPath.split('/').pop()?.split('.')[0]?.toLowerCase();
        
        if (assetName && content.includes(assetName)) {
          potentialReferences.push(`Potential reference in ${doc.metadata.name}`);
          confidence -= 0.1; // Reduce confidence if potential references found
        }
      }
    }

    // Determine asset type from path
    const assetType = this.determineAssetTypeFromPath(assetPath);

    // Filter by asset type if specified
    if (params.asset_type_filter && !params.asset_type_filter.includes(assetType)) {
      return null;
    }

    // Exclude editor assets if specified
    if (params.exclude_editor_assets && assetPath.includes('Editor')) {
      return null;
    }

    // Add reasons for being considered unused
    reasons.push('No direct code references found');
    if (potentialReferences.length === 0) {
      reasons.push('No potential references in comments or strings');
    }

    // Determine removal risk
    const removalRisk = this.assessRemovalRisk(assetPath, assetType, potentialReferences.length);

    // Estimate size impact
    const estimatedSizeImpact = this.estimateSizeImpact(assetType);

    return {
      assetPath,
      assetType,
      confidence: Math.max(confidence, 0.1),
      reasons,
      potentialReferences,
      estimatedSizeImpact,
      removalRisk,
    };
  }

  /**
   * Determine asset type from file path
   */
  private determineAssetTypeFromPath(assetPath: string): string {
    const extension = assetPath.split('.').pop()?.toLowerCase();
    
    const typeMap: Record<string, string> = {
      'png': 'Texture', 'jpg': 'Texture', 'jpeg': 'Texture', 'gif': 'Texture', 'bmp': 'Texture', 'tga': 'Texture', 'psd': 'Texture', 'tiff': 'Texture',
      'prefab': 'Prefab',
      'mat': 'Material',
      'anim': 'Animation',
      'wav': 'Audio', 'mp3': 'Audio', 'ogg': 'Audio', 'aiff': 'Audio',
      'fbx': 'Mesh', 'obj': 'Mesh', 'blend': 'Mesh',
      'cs': 'Script',
      'unity': 'Scene',
      'asset': 'Asset',
    };

    return typeMap[extension || ''] || 'Unknown';
  }

  /**
   * Assess removal risk for an asset
   */
  private assessRemovalRisk(assetPath: string, assetType: string, potentialReferencesCount: number): 'low' | 'medium' | 'high' {
    // High risk assets
    if (assetPath.includes('Main') || assetPath.includes('Default') || assetPath.includes('Core')) {
      return 'high';
    }

    // Medium risk if potential references exist
    if (potentialReferencesCount > 0) {
      return 'medium';
    }

    // Low risk for clearly unused assets
    return 'low';
  }

  /**
   * Estimate size impact of removing an asset
   */
  private estimateSizeImpact(assetType: string): string {
    const sizeEstimates: Record<string, string> = {
      'Texture': 'Medium (1-10MB typical)',
      'Audio': 'Large (5-50MB typical)',
      'Prefab': 'Small (1-100KB typical)',
      'Material': 'Small (1-10KB typical)',
      'Animation': 'Medium (100KB-5MB typical)',
      'Mesh': 'Large (1-100MB typical)',
      'Script': 'Minimal (<1KB typical)',
      'Scene': 'Large (1-50MB typical)',
    };

    return sizeEstimates[assetType] || 'Unknown';
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(unusedAssets: UnusedAsset[]) {
    const unusedByType: Record<string, number> = {};
    let highConfidenceUnused = 0;

    unusedAssets.forEach(asset => {
      unusedByType[asset.assetType] = (unusedByType[asset.assetType] || 0) + 1;
      if (asset.confidence >= 0.9) {
        highConfidenceUnused++;
      }
    });

    const removalRecommendations = [
      'Review high-confidence unused assets first',
      'Check version control history before removing assets',
      'Consider creating a backup before bulk asset removal',
      'Test thoroughly after removing assets to ensure no runtime issues',
    ];

    if (highConfidenceUnused > 10) {
      removalRecommendations.push('Consider automated cleanup for high-confidence unused assets');
    }

    return {
      totalUnusedAssets: unusedAssets.length,
      unusedByType,
      estimatedSpaceSavings: 'Varies by asset types (see individual estimates)',
      highConfidenceUnused,
      removalRecommendations,
    };
  }

  /**
   * Apply filters to unused assets
   */
  private applyFilters(unusedAssets: UnusedAsset[], params: FindUnusedAssetsParams): UnusedAsset[] {
    let filtered = unusedAssets;

    // Apply confidence threshold
    filtered = filtered.filter(asset => asset.confidence >= (params.confidence_threshold || 0.8));

    // Apply max results limit
    if (params.max_results) {
      filtered = filtered
        .sort((a, b) => b.confidence - a.confidence) // Sort by confidence descending
        .slice(0, params.max_results);
    }

    return filtered;
  }

  /**
   * Format unused assets results
   */
  protected formatResponse(result: UnusedAssetsResult, warnings: string[] = []): MCPResponse {
    let response = MCPResponseFormatter.formatAnalysisResults(
      result,
      this.config.name,
      { analysis_type: 'Unused Assets Analysis' },
      Date.now() - this.startTime
    );

    if (warnings.length > 0) {
      response = MCPResponseFormatter.addWarnings(response, warnings);
    }

    return response;
  }
}

/**
 * Zod schema for find unused assets tool parameters
 */
export const findUnusedAssetsSchema = z.object({
  asset_type_filter: z.array(z.enum(["Texture", "Audio", "Prefab", "Material", "Animation", "Script", "Mesh", "Font"])).optional().describe("Filter by specific asset types"),
  exclude_editor_assets: z.boolean().optional().default(true).describe("Exclude editor-only assets from analysis"),
  confidence_threshold: z.number().optional().default(0.8).describe("Minimum confidence level for unused assets (0.1-1.0)"),
  include_potential_references: z.boolean().optional().default(true).describe("Check for potential references in comments and strings"),
  namespace_scope: z.string().optional().describe("Limit analysis to specific namespace pattern"),
  max_results: z.number().optional().default(100).describe("Maximum number of unused assets to return (1-500)")
});

/**
 * Factory function to create and register the find unused assets tool
 */
export function createFindUnusedAssetsTool(server: any, context: ToolExecutionContext) {
  const handler = new FindUnusedAssetsToolHandler(context);

  server.tool(
    "find_unused_assets",
    findUnusedAssetsSchema,
    async (params: FindUnusedAssetsParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
