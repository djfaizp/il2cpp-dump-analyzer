/**
 * Analyze Asset Dependencies Tool Implementation
 * Analyzes Unity asset dependency graphs and relationships
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';
import { UnityAssetAnalyzer, AssetDependency, AssetAnalysisResult } from '../../analysis/asset-analyzer';

/**
 * Analyze asset dependencies parameters interface
 */
interface AnalyzeAssetDependenciesParams {
  target_asset?: string;
  dependency_type?: 'incoming' | 'outgoing' | 'both';
  max_depth?: number;
  include_circular_dependencies?: boolean;
  asset_type_filter?: string[];
  namespace_scope?: string;
  max_results?: number;
}

/**
 * Asset dependency node interface
 */
interface DependencyNode {
  assetPath: string;
  assetType: string;
  dependsOn: string[];
  dependents: string[];
  depth: number;
  isCircular: boolean;
  circularWith: string[];
  loadingMethods: string[];
  referencingClasses: string[];
}

/**
 * Dependency graph interface
 */
interface DependencyGraph {
  nodes: DependencyNode[];
  edges: Array<{
    from: string;
    to: string;
    type: 'depends_on' | 'depended_by';
    strength: number;
  }>;
  clusters: Array<{
    id: string;
    assets: string[];
    type: 'circular' | 'hierarchical' | 'isolated';
  }>;
}

/**
 * Asset dependencies result interface
 */
interface AssetDependenciesResult {
  targetAsset?: string;
  dependencyGraph: DependencyGraph;
  circularDependencies: Array<{
    cycle: string[];
    severity: 'low' | 'medium' | 'high';
    impact: string;
    recommendation: string;
  }>;
  dependencyMetrics: {
    totalAssets: number;
    totalDependencies: number;
    averageDependenciesPerAsset: number;
    maxDependencyDepth: number;
    circularDependencyCount: number;
    isolatedAssets: number;
  };
  optimizationRecommendations: string[];
  metadata: {
    analysisType: string;
    targetAsset?: string;
    dependencyType: string;
    maxDepth: number;
    timestamp: string;
    processingTime: number;
  };
}

/**
 * Analyze Asset Dependencies Tool Handler
 * Analyzes Unity asset dependency graphs and relationships
 */
export class AnalyzeAssetDependenciesToolHandler extends BaseAnalysisToolHandler<AnalyzeAssetDependenciesParams, AssetDependenciesResult> {
  private assetAnalyzer: UnityAssetAnalyzer;

  constructor(context: ToolExecutionContext) {
    super({
      name: 'analyze_asset_dependencies',
      description: 'Analyze Unity asset dependency graphs and relationships',
      enableParameterValidation: true,
      enableResponseFormatting: true
    }, context);
    
    this.assetAnalyzer = new UnityAssetAnalyzer();
  }

  /**
   * Validate asset dependencies parameters
   */
  protected async validateParameters(params: AnalyzeAssetDependenciesParams): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate max_depth parameter
    if (params.max_depth !== undefined) {
      if (params.max_depth < 1 || params.max_depth > 10) {
        adjustedValues.max_depth = Math.max(1, Math.min(params.max_depth, 10));
        warnings.push(`max_depth adjusted from ${params.max_depth} to ${adjustedValues.max_depth} (valid range: 1-10)`);
      }
    } else {
      adjustedValues.max_depth = 5;
    }

    // Validate asset_type_filter parameter
    if (params.asset_type_filter) {
      const validAssetTypes = ['Texture', 'Audio', 'Prefab', 'Material', 'Animation', 'Script', 'Mesh', 'Font'];
      const invalidTypes = params.asset_type_filter.filter(type => !validAssetTypes.includes(type));
      if (invalidTypes.length > 0) {
        warnings.push(`Unknown asset types will be ignored: ${invalidTypes.join(', ')}`);
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

    // Set defaults for optional parameters
    if (params.dependency_type === undefined) {
      adjustedValues.dependency_type = 'both';
    }

    if (params.include_circular_dependencies === undefined) {
      adjustedValues.include_circular_dependencies = true;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }

  /**
   * Execute asset dependencies analysis
   */
  protected async executeCore(params: AnalyzeAssetDependenciesParams): Promise<AssetDependenciesResult> {
    return await this.performAnalysis(async () => {
      this.context.logger.debug('Starting asset dependencies analysis...');

      // Step 1: Get all documents for analysis
      const documents = await this.getDocumentsForAnalysis(params);

      if (documents.length === 0) {
        throw new Error('No documents found for asset dependency analysis.');
      }

      this.context.logger.debug(`Analyzing ${documents.length} documents for asset dependencies`);

      // Step 2: Perform full asset analysis
      const assetAnalysis = await this.assetAnalyzer.analyzeAssets(documents);

      // Step 3: Build enhanced dependency graph
      const dependencyGraph = await this.buildEnhancedDependencyGraph(assetAnalysis, params);

      // Step 4: Analyze circular dependencies
      const circularDependencies = await this.analyzeCircularDependencies(dependencyGraph, assetAnalysis);

      // Step 5: Calculate dependency metrics
      const dependencyMetrics = this.calculateDependencyMetrics(dependencyGraph);

      // Step 6: Generate optimization recommendations
      const optimizationRecommendations = this.generateDependencyOptimizations(
        dependencyGraph,
        circularDependencies,
        dependencyMetrics
      );

      this.context.logger.debug(`Dependency analysis completed. Found ${dependencyGraph.nodes.length} assets with ${dependencyGraph.edges.length} dependencies`);

      return {
        targetAsset: params.target_asset,
        dependencyGraph,
        circularDependencies,
        dependencyMetrics,
        optimizationRecommendations,
        metadata: {
          analysisType: params.target_asset ? 'Single Asset' : 'Full Codebase',
          targetAsset: params.target_asset,
          dependencyType: params.dependency_type || 'both',
          maxDepth: params.max_depth || 5,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - this.startTime,
        },
      };
    });
  }

  /**
   * Get documents for analysis based on filters
   */
  private async getDocumentsForAnalysis(params: AnalyzeAssetDependenciesParams): Promise<Document[]> {
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
   * Build enhanced dependency graph with detailed analysis
   */
  private async buildEnhancedDependencyGraph(
    assetAnalysis: AssetAnalysisResult,
    params: AnalyzeAssetDependenciesParams
  ): Promise<DependencyGraph> {
    const nodes: DependencyNode[] = [];
    const edges: Array<{ from: string; to: string; type: 'depends_on' | 'depended_by'; strength: number }> = [];
    const assetMap = new Map<string, DependencyNode>();

    // Create nodes from asset references
    assetAnalysis.assetReferences.forEach(ref => {
      if (!assetMap.has(ref.assetPath)) {
        const node: DependencyNode = {
          assetPath: ref.assetPath,
          assetType: ref.assetType,
          dependsOn: [],
          dependents: [],
          depth: 0,
          isCircular: false,
          circularWith: [],
          loadingMethods: [ref.loadingMethod],
          referencingClasses: [ref.referencingClass],
        };
        assetMap.set(ref.assetPath, node);
      } else {
        const node = assetMap.get(ref.assetPath)!;
        if (!node.loadingMethods.includes(ref.loadingMethod)) {
          node.loadingMethods.push(ref.loadingMethod);
        }
        if (!node.referencingClasses.includes(ref.referencingClass)) {
          node.referencingClasses.push(ref.referencingClass);
        }
      }
    });

    // Build dependency relationships
    assetAnalysis.dependencies.forEach(dep => {
      const node = assetMap.get(dep.assetPath);
      if (node) {
        node.dependsOn = dep.dependsOn;
        node.dependents = dep.dependents;
        node.depth = dep.depth;
        node.circularWith = dep.circularReferences;
        node.isCircular = dep.circularReferences.length > 0;

        // Create edges for dependencies
        dep.dependsOn.forEach(dependency => {
          edges.push({
            from: dep.assetPath,
            to: dependency,
            type: 'depends_on',
            strength: 1,
          });
        });

        dep.dependents.forEach(dependent => {
          edges.push({
            from: dependent,
            to: dep.assetPath,
            type: 'depended_by',
            strength: 1,
          });
        });
      }
    });

    // Filter nodes based on parameters
    let filteredNodes = Array.from(assetMap.values());

    // Filter by asset type
    if (params.asset_type_filter && params.asset_type_filter.length > 0) {
      filteredNodes = filteredNodes.filter(node => 
        params.asset_type_filter!.includes(node.assetType)
      );
    }

    // Filter by target asset if specified
    if (params.target_asset) {
      filteredNodes = this.filterByTargetAsset(filteredNodes, params.target_asset, params);
    }

    // Limit results
    if (params.max_results && filteredNodes.length > params.max_results) {
      filteredNodes = filteredNodes.slice(0, params.max_results);
    }

    // Create clusters
    const clusters = this.identifyClusters(filteredNodes);

    return {
      nodes: filteredNodes,
      edges: edges.filter(edge => 
        filteredNodes.some(node => node.assetPath === edge.from) &&
        filteredNodes.some(node => node.assetPath === edge.to)
      ),
      clusters,
    };
  }

  /**
   * Filter nodes by target asset and dependency type
   */
  private filterByTargetAsset(
    nodes: DependencyNode[],
    targetAsset: string,
    params: AnalyzeAssetDependenciesParams
  ): DependencyNode[] {
    const targetNode = nodes.find(node => 
      node.assetPath === targetAsset || node.assetPath.includes(targetAsset)
    );

    if (!targetNode) {
      return [];
    }

    const relatedNodes = new Set<string>([targetNode.assetPath]);
    const maxDepth = params.max_depth || 5;

    // Add dependencies based on type
    if (params.dependency_type === 'outgoing' || params.dependency_type === 'both') {
      this.addDependencies(targetNode, nodes, relatedNodes, maxDepth, 'outgoing');
    }

    if (params.dependency_type === 'incoming' || params.dependency_type === 'both') {
      this.addDependencies(targetNode, nodes, relatedNodes, maxDepth, 'incoming');
    }

    return nodes.filter(node => relatedNodes.has(node.assetPath));
  }

  /**
   * Add dependencies recursively
   */
  private addDependencies(
    node: DependencyNode,
    allNodes: DependencyNode[],
    relatedNodes: Set<string>,
    maxDepth: number,
    direction: 'incoming' | 'outgoing',
    currentDepth: number = 0
  ): void {
    if (currentDepth >= maxDepth) return;

    const dependencies = direction === 'outgoing' ? node.dependsOn : node.dependents;

    dependencies.forEach(depPath => {
      if (!relatedNodes.has(depPath)) {
        relatedNodes.add(depPath);
        const depNode = allNodes.find(n => n.assetPath === depPath);
        if (depNode) {
          this.addDependencies(depNode, allNodes, relatedNodes, maxDepth, direction, currentDepth + 1);
        }
      }
    });
  }

  /**
   * Identify asset clusters
   */
  private identifyClusters(nodes: DependencyNode[]): Array<{ id: string; assets: string[]; type: 'circular' | 'hierarchical' | 'isolated' }> {
    const clusters: Array<{ id: string; assets: string[]; type: 'circular' | 'hierarchical' | 'isolated' }> = [];

    // Find circular clusters
    const circularAssets = nodes.filter(node => node.isCircular);
    if (circularAssets.length > 0) {
      clusters.push({
        id: 'circular_dependencies',
        assets: circularAssets.map(node => node.assetPath),
        type: 'circular',
      });
    }

    // Find isolated assets
    const isolatedAssets = nodes.filter(node => 
      node.dependsOn.length === 0 && node.dependents.length === 0
    );
    if (isolatedAssets.length > 0) {
      clusters.push({
        id: 'isolated_assets',
        assets: isolatedAssets.map(node => node.assetPath),
        type: 'isolated',
      });
    }

    // Find hierarchical clusters (simplified)
    const hierarchicalAssets = nodes.filter(node => 
      !node.isCircular && (node.dependsOn.length > 0 || node.dependents.length > 0)
    );
    if (hierarchicalAssets.length > 0) {
      clusters.push({
        id: 'hierarchical_dependencies',
        assets: hierarchicalAssets.map(node => node.assetPath),
        type: 'hierarchical',
      });
    }

    return clusters;
  }

  /**
   * Analyze circular dependencies in detail
   */
  private async analyzeCircularDependencies(
    dependencyGraph: DependencyGraph,
    assetAnalysis: AssetAnalysisResult
  ): Promise<Array<{ cycle: string[]; severity: 'low' | 'medium' | 'high'; impact: string; recommendation: string }>> {
    const circularDeps: Array<{ cycle: string[]; severity: 'low' | 'medium' | 'high'; impact: string; recommendation: string }> = [];

    // Analyze each circular dependency from the original analysis
    assetAnalysis.circularDependencies.forEach(cycle => {
      const severity = this.assessCircularDependencySeverity(cycle, dependencyGraph);
      const impact = this.assessCircularDependencyImpact(cycle, dependencyGraph);
      const recommendation = this.generateCircularDependencyRecommendation(cycle, severity);

      circularDeps.push({
        cycle,
        severity,
        impact,
        recommendation,
      });
    });

    return circularDeps;
  }

  /**
   * Assess severity of circular dependency
   */
  private assessCircularDependencySeverity(cycle: string[], dependencyGraph: DependencyGraph): 'low' | 'medium' | 'high' {
    if (cycle.length > 5) return 'high';
    if (cycle.length > 3) return 'medium';
    return 'low';
  }

  /**
   * Assess impact of circular dependency
   */
  private assessCircularDependencyImpact(cycle: string[], dependencyGraph: DependencyGraph): string {
    const affectedNodes = dependencyGraph.nodes.filter(node => cycle.includes(node.assetPath));
    const totalReferences = affectedNodes.reduce((sum, node) => sum + node.referencingClasses.length, 0);

    if (totalReferences > 10) {
      return 'High impact - affects many classes and may cause loading issues';
    } else if (totalReferences > 5) {
      return 'Medium impact - affects several classes';
    } else {
      return 'Low impact - affects few classes';
    }
  }

  /**
   * Generate recommendation for circular dependency
   */
  private generateCircularDependencyRecommendation(cycle: string[], severity: 'low' | 'medium' | 'high'): string {
    const recommendations = {
      low: 'Consider refactoring to break the circular dependency through interface abstraction',
      medium: 'Refactor immediately - use dependency injection or event-driven patterns',
      high: 'Critical - restructure asset dependencies to prevent loading failures',
    };

    return recommendations[severity];
  }

  /**
   * Calculate dependency metrics
   */
  private calculateDependencyMetrics(dependencyGraph: DependencyGraph) {
    const totalAssets = dependencyGraph.nodes.length;
    const totalDependencies = dependencyGraph.edges.length;
    const averageDependenciesPerAsset = totalAssets > 0 ? totalDependencies / totalAssets : 0;
    const maxDependencyDepth = Math.max(...dependencyGraph.nodes.map(node => node.depth), 0);
    const circularDependencyCount = dependencyGraph.nodes.filter(node => node.isCircular).length;
    const isolatedAssets = dependencyGraph.nodes.filter(node => 
      node.dependsOn.length === 0 && node.dependents.length === 0
    ).length;

    return {
      totalAssets,
      totalDependencies,
      averageDependenciesPerAsset: Math.round(averageDependenciesPerAsset * 100) / 100,
      maxDependencyDepth,
      circularDependencyCount,
      isolatedAssets,
    };
  }

  /**
   * Generate optimization recommendations
   */
  private generateDependencyOptimizations(
    dependencyGraph: DependencyGraph,
    circularDependencies: any[],
    metrics: any
  ): string[] {
    const recommendations: string[] = [];

    if (circularDependencies.length > 0) {
      recommendations.push(`Found ${circularDependencies.length} circular dependency cycles. Review and refactor to prevent loading issues.`);
    }

    if (metrics.maxDependencyDepth > 5) {
      recommendations.push(`Maximum dependency depth is ${metrics.maxDependencyDepth}. Consider flattening deep dependency chains.`);
    }

    if (metrics.averageDependenciesPerAsset > 10) {
      recommendations.push(`High average dependencies per asset (${metrics.averageDependenciesPerAsset}). Consider reducing coupling between assets.`);
    }

    if (metrics.isolatedAssets > 0) {
      recommendations.push(`Found ${metrics.isolatedAssets} isolated assets. Review if these are actually unused.`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Asset dependency structure appears well-organized with no major issues detected.');
    }

    return recommendations;
  }

  /**
   * Format asset dependencies results
   */
  protected formatResponse(result: AssetDependenciesResult, warnings: string[] = []): MCPResponse {
    let response = MCPResponseFormatter.formatAnalysisResults(
      result,
      this.config.name,
      { analysis_type: 'Asset Dependencies Analysis' },
      Date.now() - this.startTime
    );

    if (warnings.length > 0) {
      response = MCPResponseFormatter.addWarnings(response, warnings);
    }

    return response;
  }
}

/**
 * Zod schema for analyze asset dependencies tool parameters
 */
export const analyzeAssetDependenciesSchema = z.object({
  target_asset: z.string().optional().describe("Specific asset to analyze dependencies for (optional - analyzes all if not specified)"),
  dependency_type: z.enum(["incoming", "outgoing", "both"]).optional().default("both").describe("Type of dependencies to analyze"),
  max_depth: z.number().optional().default(5).describe("Maximum dependency depth to traverse (1-10)"),
  include_circular_dependencies: z.boolean().optional().default(true).describe("Include circular dependency analysis"),
  asset_type_filter: z.array(z.enum(["Texture", "Audio", "Prefab", "Material", "Animation", "Script", "Mesh", "Font"])).optional().describe("Filter by specific asset types"),
  namespace_scope: z.string().optional().describe("Limit analysis to specific namespace pattern"),
  max_results: z.number().optional().default(500).describe("Maximum number of assets to analyze (1-1000)")
});

/**
 * Factory function to create and register the analyze asset dependencies tool
 */
export function createAnalyzeAssetDependenciesTool(server: any, context: ToolExecutionContext) {
  const handler = new AnalyzeAssetDependenciesToolHandler(context);

  server.tool(
    "analyze_asset_dependencies",
    analyzeAssetDependenciesSchema,
    async (params: AnalyzeAssetDependenciesParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
