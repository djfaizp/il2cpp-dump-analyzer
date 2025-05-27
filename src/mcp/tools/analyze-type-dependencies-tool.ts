/**
 * @fileoverview Analyze Type Dependencies MCP Tool
 *
 * Provides comprehensive analysis of IL2CPP type dependency graphs including:
 * - Type dependency graph creation and visualization
 * - Circular reference detection and analysis
 * - Dependency clustering and relationship mapping
 * - Dependency metrics and complexity analysis
 *
 * This tool implements the type dependency analysis functionality from TypeAnalyzer
 * as an MCP tool following established patterns and TFD methodology.
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';

/**
 * Zod schema for analyze type dependencies parameters
 */
const AnalyzeTypeDependenciesSchema = z.object({
  target_type: z.string().optional().describe('Specific type to analyze dependencies for (optional, analyzes all types if not provided)'),
  include_circular_detection: z.boolean().default(true).describe('Whether to include circular dependency detection'),
  max_depth: z.number().min(1).max(10).default(5).describe('Maximum dependency depth to analyze (1-10)'),
  include_system_types: z.boolean().default(false).describe('Whether to include system types in dependency analysis')
});

/**
 * Type dependency analysis parameters interface
 */
interface AnalyzeTypeDependenciesParams {
  target_type?: string;
  include_circular_detection?: boolean;
  max_depth?: number;
  include_system_types?: boolean;
}

/**
 * Dependency node representation
 */
interface DependencyNode {
  typeName: string;
  namespace: string;
  typeDefIndex: number;
  dependencies: string[];
  dependents: string[];
  dependencyCount: number;
  dependentCount: number;
  centrality: number;
}

/**
 * Dependency edge representation
 */
interface DependencyEdge {
  fromType: string;
  toType: string;
  relationshipType: string;
  strength: number;
}

/**
 * Type cluster representation
 */
interface TypeCluster {
  clusterId: string;
  types: string[];
  isCircular: boolean;
  clusterSize: number;
  internalEdges: number;
  externalEdges: number;
}

/**
 * Dependency metrics
 */
interface DependencyMetrics {
  totalNodes: number;
  totalEdges: number;
  averageDependencies: number;
  maxDependencies: number;
  circularDependencies: number;
  maxDepth: number;
  clusterCount: number;
}

/**
 * Type dependency analysis result
 */
interface TypeDependencyAnalysisResult {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  clusters: TypeCluster[];
  metrics: DependencyMetrics;
  analysisMetadata: {
    targetType?: string;
    includeCircularDetection: boolean;
    maxDepthLimit: number;
    includeSystemTypes: boolean;
    timestamp: string;
    totalTypesAnalyzed: number;
  };
}

/**
 * Analyze Type Dependencies MCP Tool Implementation
 *
 * Analyzes IL2CPP type dependency graphs and relationships using vector store search.
 * Provides comprehensive dependency analysis with circular detection and clustering.
 */
export class AnalyzeTypeDependenciesTool extends BaseAnalysisToolHandler<AnalyzeTypeDependenciesParams, TypeDependencyAnalysisResult> {

  constructor(context: ToolExecutionContext) {
    super({
      name: 'analyze_type_dependencies',
      description: 'Analyze type dependency graphs, circular references, and dependency clusters in IL2CPP dumps',
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

    // Validate max_depth parameter
    if (params.max_depth !== undefined) {
      if (typeof params.max_depth !== 'number' || params.max_depth < 1 || params.max_depth > 10) {
        errors.push('max_depth must be a number between 1 and 10');
      }
    } else {
      adjustedValues.max_depth = 5;
    }

    // Set defaults for boolean parameters
    if (params.include_circular_detection === undefined) {
      adjustedValues.include_circular_detection = true;
    }

    if (params.include_system_types === undefined) {
      adjustedValues.include_system_types = false;
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
   * Execute type dependency analysis
   */
  protected async executeCore(params: AnalyzeTypeDependenciesParams): Promise<TypeDependencyAnalysisResult> {
    return await this.performAnalysis(async () => {
      this.context.logger.debug('Starting type dependency analysis', { params });

      // Step 1: Get all types or specific target type
      let typeDocuments: Document[];

      if (params.target_type) {
        // Search for specific target type
        const targetResults = await this.context.vectorStore.searchWithFilter(
          params.target_type,
          { type: ['class', 'interface'] },
          1
        );

        if (targetResults.length === 0) {
          throw new Error(`Target type '${params.target_type}' not found in IL2CPP dump`);
        }

        // Get all types for dependency analysis
        typeDocuments = await this.context.vectorStore.searchWithFilter(
          '',
          { type: ['class', 'interface'] },
          1000
        );
      } else {
        // Get all types
        typeDocuments = await this.context.vectorStore.searchWithFilter(
          '',
          { type: ['class', 'interface'] },
          1000
        );
      }

      if (typeDocuments.length === 0) {
        throw new Error('No types found in IL2CPP dump for dependency analysis');
      }

      this.context.logger.debug(`Found ${typeDocuments.length} types for dependency analysis`);

      // Step 2: Build dependency graph
      const { nodes, edges } = this.buildDependencyGraph(typeDocuments, params);

      // Step 3: Create type clusters and detect circular dependencies
      let clusters: TypeCluster[] = [];
      if (params.include_circular_detection) {
        clusters = this.createTypeClusters(nodes, edges);
      }

      // Step 4: Calculate dependency metrics
      const metrics = this.calculateDependencyMetrics(nodes, edges, clusters);

      const result: TypeDependencyAnalysisResult = {
        nodes,
        edges,
        clusters,
        metrics,
        analysisMetadata: {
          targetType: params.target_type,
          includeCircularDetection: params.include_circular_detection ?? true,
          maxDepthLimit: params.max_depth ?? 5,
          includeSystemTypes: params.include_system_types ?? false,
          timestamp: new Date().toISOString(),
          totalTypesAnalyzed: typeDocuments.length
        }
      };

      this.context.logger.debug('Type dependency analysis completed', {
        nodes: nodes.length,
        edges: edges.length,
        clusters: clusters.length,
        circularDependencies: metrics.circularDependencies
      });

      return result;
    });
  }

  /**
   * Build dependency graph from type documents
   */
  private buildDependencyGraph(
    typeDocuments: Document[],
    params: AnalyzeTypeDependenciesParams
  ): { nodes: DependencyNode[]; edges: DependencyEdge[] } {
    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];
    const includeSystemTypes = params.include_system_types ?? false;

    // Create type lookup map
    const typeMap = new Map<string, Document>();
    typeDocuments.forEach(doc => {
      const fullName = `${doc.metadata.namespace}.${doc.metadata.name}`;
      typeMap.set(fullName, doc);
    });

    // Helper function to check if a type is a system type
    const isSystemType = (typeName: string): boolean => {
      if (!typeName) return false;
      const systemPrefixes = ['System.', 'UnityEngine.', 'Unity.', 'Microsoft.', 'Mono.'];
      return systemPrefixes.some(prefix => typeName.startsWith(prefix));
    };

    // Build nodes and edges
    for (const doc of typeDocuments) {
      const fullName = `${doc.metadata.namespace}.${doc.metadata.name}`;

      // Skip system types if not included
      if (!includeSystemTypes && isSystemType(fullName)) {
        continue;
      }

      const node = this.createDependencyNode(doc, typeDocuments, includeSystemTypes);
      nodes.push(node);

      // Create edges for dependencies
      for (const dependency of node.dependencies) {
        if (!includeSystemTypes && isSystemType(dependency)) {
          continue;
        }

        edges.push({
          fromType: fullName,
          toType: dependency,
          relationshipType: this.getRelationshipType(doc, dependency),
          strength: 1
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * Create a dependency node from a type document
   */
  private createDependencyNode(
    doc: Document,
    allTypes: Document[],
    includeSystemTypes: boolean
  ): DependencyNode {
    const fullName = `${doc.metadata.namespace}.${doc.metadata.name}`;
    const dependencies: string[] = [];

    // Add base class dependency
    if (doc.metadata.baseClass) {
      const baseFullName = doc.metadata.baseClass.includes('.')
        ? doc.metadata.baseClass
        : `${doc.metadata.namespace}.${doc.metadata.baseClass}`;

      if (includeSystemTypes || !this.isSystemType(baseFullName)) {
        dependencies.push(baseFullName);
      }
    }

    // Add interface dependencies
    if (doc.metadata.interfaces) {
      for (const interfaceName of doc.metadata.interfaces) {
        const interfaceFullName = interfaceName.includes('.')
          ? interfaceName
          : `${doc.metadata.namespace}.${interfaceName}`;

        if (includeSystemTypes || !this.isSystemType(interfaceFullName)) {
          dependencies.push(interfaceFullName);
        }
      }
    }

    // Find dependents (types that depend on this type)
    const dependents = allTypes
      .filter(t => {
        const tFullName = `${t.metadata.namespace}.${t.metadata.name}`;
        return (t.metadata.baseClass === doc.metadata.name ||
                t.metadata.baseClass === fullName ||
                (t.metadata.interfaces && t.metadata.interfaces.includes(doc.metadata.name))) &&
               (includeSystemTypes || !this.isSystemType(tFullName));
      })
      .map(t => `${t.metadata.namespace}.${t.metadata.name}`);

    // Calculate centrality (simplified betweenness centrality)
    const centrality = (dependencies.length + dependents.length) / allTypes.length;

    return {
      typeName: fullName,
      namespace: doc.metadata.namespace || '',
      typeDefIndex: doc.metadata.typeDefIndex || 0,
      dependencies,
      dependents,
      dependencyCount: dependencies.length,
      dependentCount: dependents.length,
      centrality
    };
  }

  /**
   * Check if a type is a system type
   */
  private isSystemType(typeName: string): boolean {
    if (!typeName) return false;
    const systemPrefixes = ['System.', 'UnityEngine.', 'Unity.', 'Microsoft.', 'Mono.'];
    return systemPrefixes.some(prefix => typeName.startsWith(prefix));
  }

  /**
   * Get relationship type between types
   */
  private getRelationshipType(doc: Document, dependency: string): string {
    if (doc.metadata.baseClass === dependency ||
        doc.metadata.baseClass?.endsWith(`.${dependency}`)) {
      return 'inheritance';
    }
    if (doc.metadata.interfaces?.includes(dependency) ||
        doc.metadata.interfaces?.some((i: string) => i.endsWith(`.${dependency}`))) {
      return 'interface';
    }
    return 'dependency';
  }

  /**
   * Create type clusters and detect circular dependencies
   */
  private createTypeClusters(nodes: DependencyNode[], edges: DependencyEdge[]): TypeCluster[] {
    const clusters: TypeCluster[] = [];
    const visited = new Set<string>();
    const typeToCluster = new Map<string, string>();

    // Use Union-Find algorithm to detect connected components
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    // Initialize Union-Find
    for (const node of nodes) {
      parent.set(node.typeName, node.typeName);
      rank.set(node.typeName, 0);
    }

    // Find function with path compression
    const find = (x: string): string => {
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)!));
      }
      return parent.get(x)!;
    };

    // Union function with rank optimization
    const union = (x: string, y: string): void => {
      const rootX = find(x);
      const rootY = find(y);

      if (rootX !== rootY) {
        const rankX = rank.get(rootX) || 0;
        const rankY = rank.get(rootY) || 0;

        if (rankX < rankY) {
          parent.set(rootX, rootY);
        } else if (rankX > rankY) {
          parent.set(rootY, rootX);
        } else {
          parent.set(rootY, rootX);
          rank.set(rootX, rankX + 1);
        }
      }
    };

    // Union connected types
    for (const edge of edges) {
      union(edge.fromType, edge.toType);
    }

    // Group types by cluster
    const clusterGroups = new Map<string, string[]>();
    for (const node of nodes) {
      const root = find(node.typeName);
      if (!clusterGroups.has(root)) {
        clusterGroups.set(root, []);
      }
      clusterGroups.get(root)!.push(node.typeName);
    }

    // Create cluster objects
    let clusterId = 0;
    for (const [root, types] of clusterGroups) {
      if (types.length > 1) { // Only include clusters with multiple types
        const cluster = this.createCluster(
          `cluster_${clusterId++}`,
          types,
          edges
        );
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Create a cluster object with metrics
   */
  private createCluster(clusterId: string, types: string[], edges: DependencyEdge[]): TypeCluster {
    const typeSet = new Set(types);

    // Count internal and external edges
    let internalEdges = 0;
    let externalEdges = 0;

    for (const edge of edges) {
      const fromInCluster = typeSet.has(edge.fromType);
      const toInCluster = typeSet.has(edge.toType);

      if (fromInCluster && toInCluster) {
        internalEdges++;
      } else if (fromInCluster || toInCluster) {
        externalEdges++;
      }
    }

    // Detect circular dependencies using DFS
    const isCircular = this.detectCircularDependency(types, edges);

    return {
      clusterId,
      types,
      isCircular,
      clusterSize: types.length,
      internalEdges,
      externalEdges
    };
  }

  /**
   * Detect circular dependencies within a cluster using DFS
   */
  private detectCircularDependency(types: string[], edges: DependencyEdge[]): boolean {
    const typeSet = new Set(types);
    const graph = new Map<string, string[]>();

    // Build adjacency list for cluster types only
    for (const type of types) {
      graph.set(type, []);
    }

    for (const edge of edges) {
      if (typeSet.has(edge.fromType) && typeSet.has(edge.toType)) {
        graph.get(edge.fromType)!.push(edge.toType);
      }
    }

    // DFS to detect cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const type of types) {
      if (!visited.has(type)) {
        if (hasCycle(type)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Calculate dependency metrics
   */
  private calculateDependencyMetrics(
    nodes: DependencyNode[],
    edges: DependencyEdge[],
    clusters: TypeCluster[]
  ): DependencyMetrics {
    if (nodes.length === 0) {
      return {
        totalNodes: 0,
        totalEdges: 0,
        averageDependencies: 0,
        maxDependencies: 0,
        circularDependencies: 0,
        maxDepth: 0,
        clusterCount: 0
      };
    }

    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const totalDependencies = nodes.reduce((sum, node) => sum + node.dependencyCount, 0);
    const averageDependencies = totalDependencies / totalNodes;
    const maxDependencies = Math.max(...nodes.map(node => node.dependencyCount));
    const circularDependencies = clusters.filter(cluster => cluster.isCircular).length;
    const maxDepth = this.calculateMaxDependencyDepth(nodes, edges);
    const clusterCount = clusters.length;

    return {
      totalNodes,
      totalEdges,
      averageDependencies,
      maxDependencies,
      circularDependencies,
      maxDepth,
      clusterCount
    };
  }

  /**
   * Calculate maximum dependency depth using BFS
   */
  private calculateMaxDependencyDepth(nodes: DependencyNode[], edges: DependencyEdge[]): number {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize graph and in-degree count
    for (const node of nodes) {
      graph.set(node.typeName, []);
      inDegree.set(node.typeName, 0);
    }

    // Build graph and calculate in-degrees
    for (const edge of edges) {
      if (graph.has(edge.fromType) && graph.has(edge.toType)) {
        graph.get(edge.fromType)!.push(edge.toType);
        inDegree.set(edge.toType, (inDegree.get(edge.toType) || 0) + 1);
      }
    }

    // Topological sort with depth tracking
    const queue: Array<{ node: string; depth: number }> = [];
    let maxDepth = 0;

    // Start with nodes that have no dependencies
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push({ node, depth: 0 });
      }
    }

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      maxDepth = Math.max(maxDepth, depth);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        const newInDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newInDegree);

        if (newInDegree === 0) {
          queue.push({ node: neighbor, depth: depth + 1 });
        }
      }
    }

    return maxDepth;
  }

  /**
   * Format dependency analysis results
   */
  protected formatResponse(result: TypeDependencyAnalysisResult, warnings: string[] = []): MCPResponse {
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
 * Zod schema for analyze type dependencies tool parameters
 */
export const analyzeTypeDependenciesSchema = z.object({
  target_type: z.string().optional().describe("Specific type to analyze dependencies for (optional, analyzes all types if not provided)"),
  include_circular_detection: z.boolean().optional().default(true).describe("Include circular dependency detection"),
  max_depth: z.number().min(1).max(10).optional().default(5).describe("Maximum dependency depth to analyze (1-10)"),
  include_system_types: z.boolean().optional().default(false).describe("Include system types in dependency analysis")
});

/**
 * Factory function to create and register the analyze type dependencies tool
 */
export function createAnalyzeTypeDependenciesTool(server: any, context: ToolExecutionContext) {
  const handler = new AnalyzeTypeDependenciesTool(context);

  server.tool(
    "analyze_type_dependencies",
    analyzeTypeDependenciesSchema,
    async (params: AnalyzeTypeDependenciesParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
