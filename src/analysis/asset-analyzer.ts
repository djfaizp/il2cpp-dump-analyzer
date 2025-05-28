/**
 * Unity Asset Reference Analyzer
 * Analyzes Unity asset references and dependencies in IL2CPP code
 */

import { Document } from '@langchain/core/documents';

/**
 * Unity asset reference interface
 */
export interface AssetReference {
  assetPath: string;
  assetType: string;
  loadingMethod: string;
  referencingClass: string;
  referencingMethod?: string;
  lineNumber?: number;
  context: string;
  isResourcesLoad: boolean;
  isAssetDatabase: boolean;
  isAddressable: boolean;
  confidence: number;
}

/**
 * Asset dependency interface
 */
export interface AssetDependency {
  assetPath: string;
  dependsOn: string[];
  dependents: string[];
  circularReferences: string[];
  depth: number;
}

/**
 * Asset usage pattern interface
 */
export interface AssetUsagePattern {
  pattern: string;
  frequency: number;
  examples: string[];
  optimization: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Asset analysis result interface
 */
export interface AssetAnalysisResult {
  totalAssets: number;
  assetReferences: AssetReference[];
  dependencies: AssetDependency[];
  usagePatterns: AssetUsagePattern[];
  unusedAssets: string[];
  circularDependencies: string[][];
  optimizationRecommendations: string[];
  metadata: {
    analysisTimestamp: string;
    processingTime: number;
    codebaseSize: number;
    assetTypes: Record<string, number>;
  };
}

/**
 * Unity Asset Analyzer
 * Core engine for analyzing Unity asset references in IL2CPP code
 */
export class UnityAssetAnalyzer {
  private assetLoadingPatterns!: RegExp[];
  private assetTypePatterns!: Map<string, RegExp>;
  private optimizationRules!: Map<string, string>;

  constructor() {
    this.initializePatterns();
    this.initializeOptimizationRules();
  }

  /**
   * Initialize asset loading patterns for detection
   */
  private initializePatterns(): void {
    this.assetLoadingPatterns = [
      // Resources.Load patterns
      /Resources\.Load\s*<\s*(\w+)\s*>\s*\(\s*["']([^"']+)["']\s*\)/gi,
      /Resources\.Load\s*\(\s*["']([^"']+)["']\s*,\s*typeof\s*\(\s*(\w+)\s*\)\s*\)/gi,
      /Resources\.LoadAsync\s*<\s*(\w+)\s*>\s*\(\s*["']([^"']+)["']\s*\)/gi,

      // AssetDatabase patterns (Editor only)
      /AssetDatabase\.LoadAssetAtPath\s*<\s*(\w+)\s*>\s*\(\s*["']([^"']+)["']\s*\)/gi,
      /AssetDatabase\.LoadMainAssetAtPath\s*\(\s*["']([^"']+)["']\s*\)/gi,

      // Addressable patterns
      /Addressables\.LoadAssetAsync\s*<\s*(\w+)\s*>\s*\(\s*["']([^"']+)["']\s*\)/gi,
      /Addressables\.InstantiateAsync\s*\(\s*["']([^"']+)["']\s*\)/gi,

      // Direct asset references
      /\[\s*SerializeField\s*\]\s*.*?(\w+)\s+(\w+)\s*;/gi,
      /public\s+(\w+)\s+(\w+)\s*;.*?\/\/.*?asset/gi,
    ];

    this.assetTypePatterns = new Map([
      ['Texture', /Texture2D|Texture|Sprite/gi],
      ['Audio', /AudioClip|AudioSource/gi],
      ['Prefab', /GameObject|Transform|Prefab/gi],
      ['Material', /Material|Shader/gi],
      ['Animation', /AnimationClip|Animator|Animation/gi],
      ['Script', /MonoBehaviour|ScriptableObject/gi],
      ['Mesh', /Mesh|MeshRenderer|MeshFilter/gi],
      ['Font', /Font|TextMesh/gi],
    ]);
  }

  /**
   * Initialize optimization rules
   */
  private initializeOptimizationRules(): void {
    this.optimizationRules = new Map([
      ['Resources.Load', 'Consider using Addressables for better memory management'],
      ['Synchronous Loading', 'Use async loading methods to prevent frame drops'],
      ['Duplicate References', 'Cache asset references to avoid repeated loading'],
      ['Large Asset Loading', 'Load large assets asynchronously or use streaming'],
      ['Editor-Only Assets', 'Ensure AssetDatabase calls are wrapped in #if UNITY_EDITOR'],
    ]);
  }

  /**
   * Analyze Unity asset references in IL2CPP documents
   */
  public async analyzeAssets(documents: Document[]): Promise<AssetAnalysisResult> {
    const startTime = Date.now();

    const assetReferences: AssetReference[] = [];
    const assetPaths = new Set<string>();
    const assetTypes: Record<string, number> = {};

    // Step 1: Extract asset references from all documents
    for (const doc of documents) {
      const references = this.extractAssetReferences(doc);
      assetReferences.push(...references);

      references.forEach(ref => {
        assetPaths.add(ref.assetPath);
        assetTypes[ref.assetType] = (assetTypes[ref.assetType] || 0) + 1;
      });
    }

    // Step 2: Build dependency graph
    const dependencies = this.buildDependencyGraph(assetReferences);

    // Step 3: Detect usage patterns
    const usagePatterns = this.detectUsagePatterns(assetReferences);

    // Step 4: Find unused assets
    const unusedAssets = this.findUnusedAssets(assetReferences, Array.from(assetPaths));

    // Step 5: Detect circular dependencies
    const circularDependencies = this.detectCircularDependencies(dependencies);

    // Step 6: Generate optimization recommendations
    const optimizationRecommendations = this.generateOptimizationRecommendations(
      assetReferences,
      usagePatterns,
      circularDependencies
    );

    const processingTime = Date.now() - startTime;

    return {
      totalAssets: assetPaths.size,
      assetReferences,
      dependencies,
      usagePatterns,
      unusedAssets,
      circularDependencies,
      optimizationRecommendations,
      metadata: {
        analysisTimestamp: new Date().toISOString(),
        processingTime,
        codebaseSize: documents.length,
        assetTypes,
      },
    };
  }

  /**
   * Extract asset references from a single document
   */
  private extractAssetReferences(document: Document): AssetReference[] {
    const references: AssetReference[] = [];
    const content = document.pageContent;
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      for (const pattern of this.assetLoadingPatterns) {
        pattern.lastIndex = 0; // Reset regex state
        let match;

        while ((match = pattern.exec(line)) !== null) {
          const reference = this.createAssetReference(
            match,
            document,
            lineIndex + 1,
            line.trim()
          );

          if (reference) {
            references.push(reference);
          }
        }
      }
    }

    return references;
  }

  /**
   * Create asset reference from regex match
   */
  private createAssetReference(
    match: RegExpExecArray,
    document: Document,
    lineNumber: number,
    context: string
  ): AssetReference | null {
    try {
      // Extract asset path and type from match groups
      let assetPath = '';
      let assetType = 'Unknown';
      let loadingMethod = '';

      // Determine loading method from context
      if (context.includes('Resources.Load')) {
        loadingMethod = 'Resources.Load';
        assetPath = match[2] || match[1] || '';
        assetType = match[1] || match[2] || 'Object';
      } else if (context.includes('AssetDatabase')) {
        loadingMethod = 'AssetDatabase';
        assetPath = match[2] || match[1] || '';
        assetType = match[1] || 'Object';
      } else if (context.includes('Addressables')) {
        loadingMethod = 'Addressables';
        assetPath = match[2] || match[1] || '';
        assetType = match[1] || 'Object';
      } else {
        loadingMethod = 'Direct Reference';
        assetType = match[1] || 'Object';
        assetPath = match[2] || `${document.metadata.name}.${match[2] || 'field'}`;
      }

      // Determine asset type category
      const typeCategory = this.categorizeAssetType(assetType);

      return {
        assetPath,
        assetType: typeCategory,
        loadingMethod,
        referencingClass: document.metadata.name || 'Unknown',
        referencingMethod: document.metadata.currentMethod,
        lineNumber,
        context,
        isResourcesLoad: loadingMethod === 'Resources.Load',
        isAssetDatabase: loadingMethod === 'AssetDatabase',
        isAddressable: loadingMethod === 'Addressables',
        confidence: this.calculateConfidence(context, assetPath, assetType),
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Categorize asset type based on patterns
   */
  private categorizeAssetType(assetType: string): string {
    for (const [category, pattern] of this.assetTypePatterns) {
      if (pattern.test(assetType)) {
        return category;
      }
    }
    return assetType;
  }

  /**
   * Calculate confidence score for asset reference
   */
  private calculateConfidence(context: string, assetPath: string, assetType: string): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for explicit loading methods
    if (context.includes('Resources.Load') || context.includes('AssetDatabase') || context.includes('Addressables')) {
      confidence += 0.3;
    }

    // Increase confidence for valid asset paths
    if (assetPath && assetPath.length > 0 && !assetPath.includes('null')) {
      confidence += 0.2;
    }

    // Increase confidence for known asset types
    if (this.assetTypePatterns.has(assetType)) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Build dependency graph for assets
   */
  private buildDependencyGraph(references: AssetReference[]): AssetDependency[] {
    const dependencyMap = new Map<string, AssetDependency>();

    // Initialize dependencies
    references.forEach(ref => {
      if (!dependencyMap.has(ref.assetPath)) {
        dependencyMap.set(ref.assetPath, {
          assetPath: ref.assetPath,
          dependsOn: [],
          dependents: [],
          circularReferences: [],
          depth: 0,
        });
      }
    });

    // Build dependency relationships (simplified for now)
    references.forEach(ref => {
      const dependency = dependencyMap.get(ref.assetPath);
      if (dependency) {
        // Add referencing class as dependent
        if (!dependency.dependents.includes(ref.referencingClass)) {
          dependency.dependents.push(ref.referencingClass);
        }
      }
    });

    return Array.from(dependencyMap.values());
  }

  /**
   * Detect asset usage patterns
   */
  private detectUsagePatterns(references: AssetReference[]): AssetUsagePattern[] {
    const patterns: AssetUsagePattern[] = [];
    const methodCounts = new Map<string, number>();

    // Count loading methods
    references.forEach(ref => {
      methodCounts.set(ref.loadingMethod, (methodCounts.get(ref.loadingMethod) || 0) + 1);
    });

    // Create patterns from method usage
    methodCounts.forEach((count, method) => {
      const optimization = this.optimizationRules.get(method) || 'No specific optimization available';
      const severity = count > 10 ? 'high' : count > 5 ? 'medium' : 'low';

      patterns.push({
        pattern: `${method} Usage`,
        frequency: count,
        examples: references
          .filter(ref => ref.loadingMethod === method)
          .slice(0, 3)
          .map(ref => ref.context),
        optimization,
        severity,
      });
    });

    return patterns;
  }

  /**
   * Find potentially unused assets
   */
  private findUnusedAssets(references: AssetReference[], allAssets: string[]): string[] {
    const usedAssets = new Set(references.map(ref => ref.assetPath));
    return allAssets.filter(asset => !usedAssets.has(asset));
  }

  /**
   * Detect circular dependencies in asset graph
   */
  private detectCircularDependencies(dependencies: AssetDependency[]): string[][] {
    // Simplified circular dependency detection
    const circularDeps: string[][] = [];

    dependencies.forEach(dep => {
      if (dep.circularReferences.length > 0) {
        circularDeps.push([dep.assetPath, ...dep.circularReferences]);
      }
    });

    return circularDeps;
  }

  /**
   * Generate optimization recommendations
   */
  private generateOptimizationRecommendations(
    references: AssetReference[],
    patterns: AssetUsagePattern[],
    circularDeps: string[][]
  ): string[] {
    const recommendations: string[] = [];

    // Check for Resources.Load usage
    const resourcesLoadCount = references.filter(ref => ref.isResourcesLoad).length;
    if (resourcesLoadCount > 0) {
      recommendations.push(`Found ${resourcesLoadCount} Resources.Load calls. Consider migrating to Addressables for better performance.`);
    }

    // Check for synchronous loading
    const syncLoadingCount = references.filter(ref =>
      !ref.loadingMethod.includes('Async') && ref.isResourcesLoad
    ).length;
    if (syncLoadingCount > 0) {
      recommendations.push(`Found ${syncLoadingCount} synchronous asset loading calls. Use async methods to prevent frame drops.`);
    }

    // Check for high-frequency patterns
    patterns.forEach(pattern => {
      if (pattern.severity === 'high') {
        recommendations.push(`High usage of ${pattern.pattern} (${pattern.frequency} occurrences). ${pattern.optimization}`);
      }
    });

    // Check for circular dependencies
    if (circularDeps.length > 0) {
      recommendations.push(`Found ${circularDeps.length} circular dependency chains. Review asset dependencies to prevent loading issues.`);
    }

    return recommendations;
  }
}
