/**
 * @fileoverview Analyze Type Hierarchies MCP Tool
 *
 * Provides comprehensive analysis of IL2CPP type inheritance hierarchies including:
 * - Inheritance hierarchy analysis and interface implementations
 * - Multiple inheritance pattern detection
 * - Orphaned type identification
 * - Namespace-based filtering and depth-limited analysis
 *
 * This tool implements the type hierarchy analysis functionality from TypeAnalyzer
 * as an MCP tool following established patterns and TFD methodology.
 */

import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';

/**
 * Zod schema for analyze type hierarchies parameters
 */
const AnalyzeTypeHierarchiesSchema = z.object({
  target_type: z.string().optional().describe('Specific type to analyze (optional, analyzes all types if not provided)'),
  include_interfaces: z.boolean().default(true).describe('Whether to include interface implementations in analysis'),
  max_depth: z.number().min(1).max(10).default(5).describe('Maximum hierarchy depth to analyze (1-10)'),
  namespace_filter: z.string().optional().describe('Filter analysis to specific namespace pattern')
});

/**
 * Type hierarchy analysis parameters interface
 */
interface AnalyzeTypeHierarchiesParams {
  target_type?: string;
  include_interfaces?: boolean;
  max_depth?: number;
  namespace_filter?: string;
}

/**
 * Type hierarchy node representation
 */
interface TypeHierarchyNode {
  typeName: string;
  namespace: string;
  typeDefIndex: number;
  baseType?: string;
  derivedTypes: TypeHierarchyNode[];
  depth: number;
  interfaces: string[];
}

/**
 * Inheritance hierarchy structure
 */
interface InheritanceHierarchy {
  rootType: TypeHierarchyNode;
  totalNodes: number;
  maxDepth: number;
  hasInterfaces: boolean;
}

/**
 * Multiple inheritance pattern detection
 */
interface MultipleInheritancePattern {
  typeName: string;
  namespace: string;
  baseClass: string;
  interfaces: string[];
  complexityScore: number;
}

/**
 * Type hierarchy analysis result
 */
interface TypeHierarchyAnalysisResult {
  hierarchies: InheritanceHierarchy[];
  multipleInheritancePatterns: MultipleInheritancePattern[];
  orphanedTypes: string[];
  maxDepth: number;
  totalHierarchies: number;
  analysisMetadata: {
    targetType?: string;
    includeInterfaces: boolean;
    maxDepthLimit: number;
    namespaceFilter?: string;
    timestamp: string;
    totalTypesAnalyzed: number;
  };
}

/**
 * Analyze Type Hierarchies MCP Tool Implementation
 *
 * Analyzes IL2CPP type inheritance hierarchies and relationships using vector store search.
 * Provides comprehensive hierarchy analysis with interface support and filtering capabilities.
 */
export class AnalyzeTypeHierarchiesTool extends BaseAnalysisToolHandler<AnalyzeTypeHierarchiesParams, TypeHierarchyAnalysisResult> {

  constructor(context: ToolExecutionContext) {
    super({
      name: 'analyze_type_hierarchies',
      description: 'Analyze inheritance hierarchies and interface implementations in IL2CPP dumps',
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
    if (params.include_interfaces === undefined) {
      adjustedValues.include_interfaces = true;
    }

    if (params.include_abstract_classes === undefined) {
      adjustedValues.include_abstract_classes = true;
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
   * Execute type hierarchy analysis
   */
  protected async executeCore(params: AnalyzeTypeHierarchiesParams): Promise<TypeHierarchyAnalysisResult> {
    return await this.performAnalysis(async () => {
      this.context.logger.debug('Starting type hierarchy analysis', { params });

      // Step 1: Get all classes or specific target type
      let classDocuments: Document[];

      if (params.target_type) {
        // Search for specific target type
        const targetResults = await this.context.vectorStore.searchWithFilter(
          params.target_type,
          { type: 'class' },
          1
        );

        if (targetResults.length === 0) {
          throw new Error(`Target type '${params.target_type}' not found in IL2CPP dump`);
        }

        // Get all classes for hierarchy building
        classDocuments = await this.context.vectorStore.searchWithFilter(
          '',
          { type: 'class' },
          1000
        );
      } else {
        // Get all classes
        classDocuments = await this.context.vectorStore.searchWithFilter(
          '',
          { type: 'class' },
          1000
        );
      }

      if (classDocuments.length === 0) {
        throw new Error('No classes found in IL2CPP dump for hierarchy analysis');
      }

      this.context.logger.debug(`Found ${classDocuments.length} classes for analysis`);

      // Step 2: Apply namespace filtering if specified
      if (params.namespace_filter) {
        classDocuments = classDocuments.filter(doc =>
          doc.metadata.namespace?.includes(params.namespace_filter)
        );

        this.context.logger.debug(`Filtered to ${classDocuments.length} classes in namespace '${params.namespace_filter}'`);
      }

      // Step 3: Build type hierarchy analysis
      const hierarchies = this.buildInheritanceHierarchies(classDocuments, params);
      const multipleInheritancePatterns = this.detectMultipleInheritancePatterns(classDocuments, params);
      const orphanedTypes = this.identifyOrphanedTypes(classDocuments);

      // Step 4: Calculate analysis metrics
      const maxDepth = Math.max(...hierarchies.map(h => h.maxDepth), 0);
      const totalHierarchies = hierarchies.length;

      const result: TypeHierarchyAnalysisResult = {
        hierarchies,
        multipleInheritancePatterns,
        orphanedTypes,
        maxDepth,
        totalHierarchies,
        analysisMetadata: {
          targetType: params.target_type,
          includeInterfaces: params.include_interfaces ?? true,
          maxDepthLimit: params.max_depth ?? 5,
          namespaceFilter: params.namespace_filter,
          timestamp: new Date().toISOString(),
          totalTypesAnalyzed: classDocuments.length
        }
      };

      this.context.logger.debug('Type hierarchy analysis completed', {
        hierarchies: totalHierarchies,
        maxDepth,
        orphanedTypes: orphanedTypes.length,
        multipleInheritance: multipleInheritancePatterns.length
      });

      return result;
    });
  }

  /**
   * Build inheritance hierarchies from class documents
   */
  private buildInheritanceHierarchies(
    classDocuments: Document[],
    params: AnalyzeTypeHierarchiesParams
  ): InheritanceHierarchy[] {
    const hierarchies: InheritanceHierarchy[] = [];
    const processedTypes = new Set<string>();
    const maxDepth = params.max_depth ?? 5;

    // Create type lookup map
    const typeMap = new Map<string, Document>();
    classDocuments.forEach(doc => {
      const fullName = `${doc.metadata.namespace}.${doc.metadata.name}`;
      typeMap.set(fullName, doc);
    });

    // Find root types (types with no base class or base class not in our set)
    const rootTypes = classDocuments.filter(doc => {
      const baseClass = doc.metadata.baseClass;
      if (!baseClass) return true;

      const baseFullName = baseClass.includes('.') ? baseClass : `${doc.metadata.namespace}.${baseClass}`;
      return !typeMap.has(baseFullName);
    });

    // Build hierarchy for each root type
    for (const rootDoc of rootTypes) {
      const fullName = `${rootDoc.metadata.namespace}.${rootDoc.metadata.name}`;

      if (processedTypes.has(fullName)) continue;

      const hierarchy = this.buildHierarchyFromRoot(rootDoc, typeMap, processedTypes, maxDepth, params);
      if (hierarchy) {
        hierarchies.push(hierarchy);
      }
    }

    return hierarchies;
  }

  /**
   * Build hierarchy tree from a root type
   */
  private buildHierarchyFromRoot(
    rootDoc: Document,
    typeMap: Map<string, Document>,
    processedTypes: Set<string>,
    maxDepth: number,
    params: AnalyzeTypeHierarchiesParams
  ): InheritanceHierarchy | null {
    const rootNode = this.createHierarchyNode(rootDoc, typeMap, processedTypes, 0, maxDepth, params);
    if (!rootNode) return null;

    const hierarchy: InheritanceHierarchy = {
      rootType: rootNode,
      totalNodes: this.countNodes(rootNode),
      maxDepth: this.calculateMaxDepth(rootNode),
      hasInterfaces: this.hasInterfaceImplementations(rootNode)
    };

    return hierarchy;
  }

  /**
   * Create a hierarchy node recursively
   */
  private createHierarchyNode(
    doc: Document,
    typeMap: Map<string, Document>,
    processedTypes: Set<string>,
    depth: number,
    maxDepth: number,
    params: AnalyzeTypeHierarchiesParams
  ): TypeHierarchyNode | null {
    if (depth >= maxDepth) return null;

    const fullName = `${doc.metadata.namespace}.${doc.metadata.name}`;
    if (processedTypes.has(fullName)) return null;

    processedTypes.add(fullName);

    const node: TypeHierarchyNode = {
      typeName: doc.metadata.name,
      namespace: doc.metadata.namespace || '',
      typeDefIndex: doc.metadata.typeDefIndex || 0,
      baseType: doc.metadata.baseClass,
      derivedTypes: [],
      depth,
      interfaces: params.include_interfaces ? (doc.metadata.interfaces || []) : []
    };

    // Find derived types
    const derivedDocs = Array.from(typeMap.values()).filter(derivedDoc => {
      const derivedBaseClass = derivedDoc.metadata.baseClass;
      if (!derivedBaseClass) return false;

      return derivedBaseClass === doc.metadata.name ||
             derivedBaseClass === fullName;
    });

    // Recursively build derived types
    for (const derivedDoc of derivedDocs) {
      const derivedNode = this.createHierarchyNode(derivedDoc, typeMap, processedTypes, depth + 1, maxDepth, params);
      if (derivedNode) {
        node.derivedTypes.push(derivedNode);
      }
    }

    return node;
  }

  /**
   * Detect multiple inheritance patterns (class + interfaces)
   */
  private detectMultipleInheritancePatterns(
    classDocuments: Document[],
    params: AnalyzeTypeHierarchiesParams
  ): MultipleInheritancePattern[] {
    if (!params.include_interfaces) return [];

    return classDocuments
      .filter(doc => doc.metadata.baseClass && doc.metadata.interfaces?.length > 0)
      .map(doc => ({
        typeName: doc.metadata.name,
        namespace: doc.metadata.namespace || '',
        baseClass: doc.metadata.baseClass,
        interfaces: doc.metadata.interfaces || [],
        complexityScore: (doc.metadata.interfaces?.length || 0) + 1
      }))
      .sort((a, b) => b.complexityScore - a.complexityScore);
  }

  /**
   * Identify orphaned types (no base class, no derived types)
   */
  private identifyOrphanedTypes(classDocuments: Document[]): string[] {
    const typeNames = new Set(classDocuments.map(doc => doc.metadata.name));

    return classDocuments
      .filter(doc => {
        const hasBaseClass = !!doc.metadata.baseClass && typeNames.has(doc.metadata.baseClass);
        const hasDerivedTypes = classDocuments.some(otherDoc =>
          otherDoc.metadata.baseClass === doc.metadata.name
        );
        return !hasBaseClass && !hasDerivedTypes;
      })
      .map(doc => `${doc.metadata.namespace}.${doc.metadata.name}`);
  }

  /**
   * Count total nodes in hierarchy tree
   */
  private countNodes(node: TypeHierarchyNode): number {
    return 1 + node.derivedTypes.reduce((sum, child) => sum + this.countNodes(child), 0);
  }

  /**
   * Calculate maximum depth of hierarchy tree
   */
  private calculateMaxDepth(node: TypeHierarchyNode): number {
    if (node.derivedTypes.length === 0) return node.depth;
    return Math.max(...node.derivedTypes.map(child => this.calculateMaxDepth(child)));
  }

  /**
   * Check if hierarchy has interface implementations
   */
  private hasInterfaceImplementations(node: TypeHierarchyNode): boolean {
    return node.interfaces.length > 0 ||
           node.derivedTypes.some(child => this.hasInterfaceImplementations(child));
  }

  /**
   * Format hierarchy analysis results
   */
  protected formatResponse(result: TypeHierarchyAnalysisResult, warnings: string[] = []): MCPResponse {
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
 * Zod schema for analyze type hierarchies tool parameters
 */
export const analyzeTypeHierarchiesSchema = z.object({
  target_type: z.string().optional().describe("Specific type to analyze (optional, analyzes all types if not provided)"),
  include_interfaces: z.boolean().optional().default(true).describe("Include interface implementations in hierarchy analysis"),
  max_depth: z.number().min(1).max(10).optional().default(5).describe("Maximum depth to traverse in hierarchy (1-10)"),
  namespace_filter: z.string().optional().describe("Filter results to specific namespace pattern")
});

/**
 * Factory function to create and register the analyze type hierarchies tool
 */
export function createAnalyzeTypeHierarchiesTool(server: any, context: ToolExecutionContext) {
  const handler = new AnalyzeTypeHierarchiesTool(context);

  server.tool(
    "analyze_type_hierarchies",
    analyzeTypeHierarchiesSchema,
    async (params: AnalyzeTypeHierarchiesParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
