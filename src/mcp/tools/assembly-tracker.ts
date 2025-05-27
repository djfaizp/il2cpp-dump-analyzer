/**
 * Assembly Tracker Tool Implementation
 * Tracks assembly metadata, version changes, and dependency analysis for IL2CPP dumps
 * Implements comprehensive assembly tracking with caching and comparison capabilities
 */

import { z } from 'zod';
import * as fs from 'fs';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';
import { AssemblyMetadata, BuildInformation } from './extract-metadata-tool';

/**
 * Assembly tracking entry with metadata and timestamps
 */
export interface AssemblyTrackingEntry {
  trackingId: string;
  assemblies: AssemblyMetadata[];
  buildInfo: BuildInformation;
  extractionDate: Date;
  sourceFile?: string;
  dependencies: AssemblyDependencyMap;
  statistics: AssemblyStatistics;
}

/**
 * Assembly dependency mapping
 */
export interface AssemblyDependencyMap {
  [assemblyName: string]: {
    directDependencies: string[];
    transitiveDependencies: string[];
    dependents: string[];
    circularDependencies: string[];
  };
}

/**
 * Assembly processing statistics
 */
export interface AssemblyStatistics {
  totalAssemblies: number;
  totalDependencies: number;
  circularDependencies: number;
  orphanedAssemblies: number;
  processingTime: number;
  memoryUsage: number;
}

/**
 * Assembly comparison result
 */
export interface AssemblyComparisonResult {
  comparisonType: string;
  baseTrackingId: string;
  targetTrackingId: string;
  versionChanges: VersionChange[];
  newAssemblies: AssemblyMetadata[];
  removedAssemblies: AssemblyMetadata[];
  dependencyChanges: DependencyChange[];
  buildInfoChanges: BuildInfoChange[];
  summary: ComparisonSummary;
}

/**
 * Version change information
 */
export interface VersionChange {
  assemblyName: string;
  oldVersion: string;
  newVersion: string;
  changeType: 'major' | 'minor' | 'patch' | 'build';
}

/**
 * Dependency change information
 */
export interface DependencyChange {
  assemblyName: string;
  changeType: 'added' | 'removed' | 'modified';
  dependency: string;
  details?: string;
}

/**
 * Build information change
 */
export interface BuildInfoChange {
  property: string;
  oldValue: string;
  newValue: string;
}

/**
 * Comparison summary
 */
export interface ComparisonSummary {
  totalChanges: number;
  versionChanges: number;
  assemblyChanges: number;
  dependencyChanges: number;
  buildChanges: number;
  hasBreakingChanges: boolean;
}

/**
 * Assembly tracking result
 */
export interface AssemblyTrackingResult {
  trackingEntry: AssemblyTrackingEntry;
  comparison?: AssemblyComparisonResult;
  cacheStatus: {
    cached: boolean;
    cacheSize: number;
    cacheHits: number;
  };
  validationResults: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

/**
 * Assembly tracker tool parameters interface
 */
interface AssemblyTrackerParams {
  content?: string;
  file_path?: string;
  tracking_id: string;
  comparison_mode?: 'full' | 'versions_only' | 'dependencies_only' | 'changes_only';
  compare_with?: string;
  include_dependencies?: boolean;
  enable_caching?: boolean;
  enable_performance_tracking?: boolean;
  max_cache_size?: number;
}

/**
 * Assembly Tracker Tool Handler
 * Provides comprehensive assembly metadata tracking and comparison capabilities
 */
export class AssemblyTrackerToolHandler extends BaseAnalysisToolHandler<AssemblyTrackerParams, AssemblyTrackingResult> {
  private extractionStartTime: number = 0;
  private content: string = '';
  private lines: string[] = [];

  // In-memory cache for assembly metadata (in production, this would use persistent storage)
  private cachedMetadata: Map<string, AssemblyTrackingEntry> = new Map();
  private cacheHits: number = 0;

  constructor(context: ToolExecutionContext) {
    super({
      name: 'track_assembly_metadata',
      description: 'Track assembly metadata, version changes, and dependency analysis for IL2CPP dumps',
      enableParameterValidation: true,
      enableResponseFormatting: true,
      maxExecutionTime: 60000
    }, context);
  }

  /**
   * Validate assembly tracker specific parameters
   */
  protected async validateParameters(params: AssemblyTrackerParams): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate that either content or file_path is provided
    if (!params.content && !params.file_path) {
      errors.push('Either content or file_path parameter is required');
    }

    if (params.content && params.file_path) {
      warnings.push('Both content and file_path provided, content will be used');
    }

    // Validate tracking_id
    if (!params.tracking_id || typeof params.tracking_id !== 'string') {
      errors.push('tracking_id is required and must be a string');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(params.tracking_id)) {
      errors.push('tracking_id must be alphanumeric with hyphens/underscores only');
    }

    // Validate comparison_mode
    if (params.comparison_mode && !['full', 'versions_only', 'dependencies_only', 'changes_only'].includes(params.comparison_mode)) {
      errors.push('comparison_mode must be one of: full, versions_only, dependencies_only, changes_only');
    }

    // Validate file_path if provided
    if (params.file_path && !params.content) {
      try {
        if (!fs.existsSync(params.file_path)) {
          errors.push(`File not found: ${params.file_path}`);
        }
      } catch (error) {
        errors.push(`Invalid file path: ${params.file_path}`);
      }
    }

    // Validate max_cache_size
    if (params.max_cache_size !== undefined) {
      if (params.max_cache_size < 10 || params.max_cache_size > 10000) {
        adjustedValues.max_cache_size = Math.max(10, Math.min(10000, params.max_cache_size));
        warnings.push(`max_cache_size adjusted to ${adjustedValues.max_cache_size} (valid range: 10-10000)`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }

  /**
   * Execute the core assembly tracking logic
   */
  protected async executeCore(params: AssemblyTrackerParams): Promise<AssemblyTrackingResult> {
    return await this.performAnalysis(async () => {
      this.extractionStartTime = Date.now();

      // Load content
      await this.loadContent(params);

      // Validate content
      if (!this.content || this.content.trim().length === 0) {
        throw new Error('IL2CPP dump content is empty or invalid');
      }

      this.lines = this.content.split('\n');

      // Extract assembly metadata
      const assemblies = this.extractAssemblyMetadata();
      const buildInfo = this.extractBuildInformation();
      const dependencies = this.analyzeDependencies(assemblies);
      const statistics = this.calculateStatistics(assemblies, dependencies);

      // Create tracking entry
      const trackingEntry: AssemblyTrackingEntry = {
        trackingId: params.tracking_id,
        assemblies,
        buildInfo,
        extractionDate: new Date(),
        sourceFile: params.file_path,
        dependencies,
        statistics
      };

      // Handle caching
      const cacheStatus = this.handleCaching(params, trackingEntry);

      // Handle comparison if requested
      let comparison: AssemblyComparisonResult | undefined;
      if (params.compare_with) {
        comparison = this.performComparison(trackingEntry, params.compare_with, params.comparison_mode || 'full');
      }

      // Validate results
      const validationResults = this.validateTrackingResults(trackingEntry);

      return {
        trackingEntry,
        comparison,
        cacheStatus,
        validationResults
      };
    });
  }

  /**
   * Load content from parameters
   */
  private async loadContent(params: AssemblyTrackerParams): Promise<void> {
    try {
      if (params.content) {
        this.content = params.content;
      } else if (params.file_path) {
        this.content = await fs.promises.readFile(params.file_path, 'utf-8');
      }
    } catch (error) {
      throw new Error(`Failed to load IL2CPP dump: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract assembly metadata from image mappings
   */
  private extractAssemblyMetadata(): AssemblyMetadata[] {
    const assemblies: AssemblyMetadata[] = [];
    const imageRegex = /\/\/ Image (\d+): (.+?) - Assembly: (.+?), Version=(.+?), Culture=(.+?), PublicKeyToken=(.+?)$/;

    for (const line of this.lines) {
      const trimmedLine = line.trim();
      const match = trimmedLine.match(imageRegex);

      if (match) {
        const [, imageIndexStr, imageName, assemblyName, version, culture, publicKeyToken] = match;

        assemblies.push({
          name: assemblyName.trim(),
          version: version.trim(),
          culture: culture.trim(),
          publicKeyToken: publicKeyToken.trim(),
          imageName: imageName.trim(),
          imageIndex: parseInt(imageIndexStr),
          dependencies: []
        });
      }
    }

    return assemblies;
  }

  /**
   * Extract build and compilation information
   */
  private extractBuildInformation(): BuildInformation {
    const buildInfo: BuildInformation = {};

    for (const line of this.lines) {
      const trimmedLine = line.trim();

      // Unity version
      const unityMatch = trimmedLine.match(/\/\/ Generated by Unity IL2CPP v(.+?)$/);
      if (unityMatch) {
        buildInfo.unityVersion = unityMatch[1].trim();
        buildInfo.il2cppVersion = unityMatch[1].trim();
      }

      // Build configuration
      const configMatch = trimmedLine.match(/\/\/ Build Configuration: (.+?)$/);
      if (configMatch) {
        buildInfo.buildConfiguration = configMatch[1].trim();
      }

      // Target platform
      const platformMatch = trimmedLine.match(/\/\/ Target Platform: (.+?)$/);
      if (platformMatch) {
        buildInfo.targetPlatform = platformMatch[1].trim();
      }

      // Scripting backend
      const backendMatch = trimmedLine.match(/\/\/ Scripting Backend: (.+?)$/);
      if (backendMatch) {
        buildInfo.scriptingBackend = backendMatch[1].trim();
      }
    }

    return buildInfo;
  }

  /**
   * Analyze assembly dependencies and relationships
   */
  private analyzeDependencies(assemblies: AssemblyMetadata[]): AssemblyDependencyMap {
    const dependencyMap: AssemblyDependencyMap = {};

    // Initialize dependency map for each assembly
    for (const assembly of assemblies) {
      dependencyMap[assembly.name] = {
        directDependencies: [],
        transitiveDependencies: [],
        dependents: [],
        circularDependencies: []
      };
    }

    // Analyze dependencies based on common patterns
    for (const assembly of assemblies) {
      const deps = dependencyMap[assembly.name];

      // System assemblies typically depend on mscorlib
      if (assembly.name !== 'mscorlib' && assemblies.some(a => a.name === 'mscorlib')) {
        deps.directDependencies.push('mscorlib');
      }

      // Unity assemblies depend on Unity core modules
      if (assembly.name.startsWith('Assembly-') || assembly.imageName.includes('game')) {
        const unityCore = assemblies.find(a => a.name === 'UnityEngine.CoreModule');
        if (unityCore && assembly.name !== unityCore.name) {
          deps.directDependencies.push(unityCore.name);
        }
      }

      // Update assembly dependencies in metadata
      assembly.dependencies = deps.directDependencies;
    }

    // Calculate transitive dependencies and dependents
    this.calculateTransitiveDependencies(dependencyMap);
    this.calculateDependents(dependencyMap);
    this.detectCircularDependencies(dependencyMap);

    return dependencyMap;
  }

  /**
   * Calculate transitive dependencies
   */
  private calculateTransitiveDependencies(dependencyMap: AssemblyDependencyMap): void {
    for (const assemblyName in dependencyMap) {
      const visited = new Set<string>();
      const transitive = new Set<string>();

      const traverse = (name: string) => {
        if (visited.has(name)) return;
        visited.add(name);

        const deps = dependencyMap[name]?.directDependencies || [];
        for (const dep of deps) {
          if (dep !== assemblyName) {
            transitive.add(dep);
            traverse(dep);
          }
        }
      };

      traverse(assemblyName);
      dependencyMap[assemblyName].transitiveDependencies = Array.from(transitive);
    }
  }

  /**
   * Calculate dependents (reverse dependencies)
   */
  private calculateDependents(dependencyMap: AssemblyDependencyMap): void {
    for (const assemblyName in dependencyMap) {
      const deps = dependencyMap[assemblyName].directDependencies;
      for (const dep of deps) {
        if (dependencyMap[dep]) {
          dependencyMap[dep].dependents.push(assemblyName);
        }
      }
    }
  }

  /**
   * Detect circular dependencies
   */
  private detectCircularDependencies(dependencyMap: AssemblyDependencyMap): void {
    for (const assemblyName in dependencyMap) {
      const visited = new Set<string>();
      const recursionStack = new Set<string>();
      const circular: string[] = [];

      const detectCycle = (name: string, path: string[]): boolean => {
        if (recursionStack.has(name)) {
          const cycleStart = path.indexOf(name);
          circular.push(...path.slice(cycleStart), name);
          return true;
        }

        if (visited.has(name)) return false;

        visited.add(name);
        recursionStack.add(name);

        const deps = dependencyMap[name]?.directDependencies || [];
        for (const dep of deps) {
          if (detectCycle(dep, [...path, name])) {
            return true;
          }
        }

        recursionStack.delete(name);
        return false;
      };

      detectCycle(assemblyName, []);
      dependencyMap[assemblyName].circularDependencies = circular;
    }
  }

  /**
   * Calculate assembly processing statistics
   */
  private calculateStatistics(assemblies: AssemblyMetadata[], dependencies: AssemblyDependencyMap): AssemblyStatistics {
    const processingTime = Date.now() - this.extractionStartTime;
    const memoryUsage = process.memoryUsage().heapUsed;

    let totalDependencies = 0;
    let circularDependencies = 0;
    let orphanedAssemblies = 0;

    for (const assemblyName in dependencies) {
      const deps = dependencies[assemblyName];
      totalDependencies += deps.directDependencies.length;

      if (deps.circularDependencies.length > 0) {
        circularDependencies++;
      }

      if (deps.directDependencies.length === 0 && deps.dependents.length === 0) {
        orphanedAssemblies++;
      }
    }

    return {
      totalAssemblies: assemblies.length,
      totalDependencies,
      circularDependencies,
      orphanedAssemblies,
      processingTime,
      memoryUsage
    };
  }

  /**
   * Handle caching of assembly metadata
   */
  private handleCaching(params: AssemblyTrackerParams, trackingEntry: AssemblyTrackingEntry): { cached: boolean; cacheSize: number; cacheHits: number } {
    const enableCaching = params.enable_caching !== false; // Default to true
    const maxCacheSize = params.max_cache_size || 1000;

    if (enableCaching) {
      // Manage cache size
      if (this.cachedMetadata.size >= maxCacheSize) {
        // Remove oldest entries (simple LRU-like behavior)
        const oldestKey = this.cachedMetadata.keys().next().value;
        if (oldestKey !== undefined) {
          this.cachedMetadata.delete(oldestKey);
        }
      }

      // Cache the current entry
      this.cachedMetadata.set(params.tracking_id, trackingEntry);
    }

    return {
      cached: enableCaching,
      cacheSize: this.cachedMetadata.size,
      cacheHits: this.cacheHits
    };
  }

  /**
   * Perform comparison between two assembly tracking entries
   */
  private performComparison(currentEntry: AssemblyTrackingEntry, compareWithId: string, comparisonMode: string): AssemblyComparisonResult {
    const baseEntry = this.cachedMetadata.get(compareWithId);
    if (!baseEntry) {
      throw new Error(`Comparison target not found: ${compareWithId}`);
    }

    this.cacheHits++;

    const versionChanges = this.detectVersionChanges(baseEntry.assemblies, currentEntry.assemblies);
    const newAssemblies = this.detectNewAssemblies(baseEntry.assemblies, currentEntry.assemblies);
    const removedAssemblies = this.detectRemovedAssemblies(baseEntry.assemblies, currentEntry.assemblies);
    const dependencyChanges = this.detectDependencyChanges(baseEntry.dependencies, currentEntry.dependencies);
    const buildInfoChanges = this.detectBuildInfoChanges(baseEntry.buildInfo, currentEntry.buildInfo);

    const summary: ComparisonSummary = {
      totalChanges: versionChanges.length + newAssemblies.length + removedAssemblies.length + dependencyChanges.length + buildInfoChanges.length,
      versionChanges: versionChanges.length,
      assemblyChanges: newAssemblies.length + removedAssemblies.length,
      dependencyChanges: dependencyChanges.length,
      buildChanges: buildInfoChanges.length,
      hasBreakingChanges: this.hasBreakingChanges(versionChanges, removedAssemblies, dependencyChanges)
    };

    return {
      comparisonType: comparisonMode,
      baseTrackingId: compareWithId,
      targetTrackingId: currentEntry.trackingId,
      versionChanges,
      newAssemblies,
      removedAssemblies,
      dependencyChanges,
      buildInfoChanges,
      summary
    };
  }

  /**
   * Detect version changes between assemblies
   */
  private detectVersionChanges(baseAssemblies: AssemblyMetadata[], targetAssemblies: AssemblyMetadata[]): VersionChange[] {
    const changes: VersionChange[] = [];

    for (const targetAssembly of targetAssemblies) {
      const baseAssembly = baseAssemblies.find(a => a.name === targetAssembly.name);
      if (baseAssembly && baseAssembly.version !== targetAssembly.version) {
        changes.push({
          assemblyName: targetAssembly.name,
          oldVersion: baseAssembly.version,
          newVersion: targetAssembly.version,
          changeType: this.determineVersionChangeType(baseAssembly.version, targetAssembly.version)
        });
      }
    }

    return changes;
  }

  /**
   * Determine the type of version change
   */
  private determineVersionChangeType(oldVersion: string, newVersion: string): 'major' | 'minor' | 'patch' | 'build' {
    const oldParts = oldVersion.split('.').map(Number);
    const newParts = newVersion.split('.').map(Number);

    if (oldParts[0] !== newParts[0]) return 'major';
    if (oldParts[1] !== newParts[1]) return 'minor';
    if (oldParts[2] !== newParts[2]) return 'patch';
    return 'build';
  }

  /**
   * Detect new assemblies
   */
  private detectNewAssemblies(baseAssemblies: AssemblyMetadata[], targetAssemblies: AssemblyMetadata[]): AssemblyMetadata[] {
    return targetAssemblies.filter(target => !baseAssemblies.some(base => base.name === target.name));
  }

  /**
   * Detect removed assemblies
   */
  private detectRemovedAssemblies(baseAssemblies: AssemblyMetadata[], targetAssemblies: AssemblyMetadata[]): AssemblyMetadata[] {
    return baseAssemblies.filter(base => !targetAssemblies.some(target => target.name === base.name));
  }

  /**
   * Detect dependency changes
   */
  private detectDependencyChanges(baseDeps: AssemblyDependencyMap, targetDeps: AssemblyDependencyMap): DependencyChange[] {
    const changes: DependencyChange[] = [];

    for (const assemblyName in targetDeps) {
      const baseDep = baseDeps[assemblyName];
      const targetDep = targetDeps[assemblyName];

      if (!baseDep) {
        // New assembly with dependencies
        for (const dep of targetDep.directDependencies) {
          changes.push({
            assemblyName,
            changeType: 'added',
            dependency: dep,
            details: 'New assembly dependency'
          });
        }
        continue;
      }

      // Check for added dependencies
      for (const dep of targetDep.directDependencies) {
        if (!baseDep.directDependencies.includes(dep)) {
          changes.push({
            assemblyName,
            changeType: 'added',
            dependency: dep
          });
        }
      }

      // Check for removed dependencies
      for (const dep of baseDep.directDependencies) {
        if (!targetDep.directDependencies.includes(dep)) {
          changes.push({
            assemblyName,
            changeType: 'removed',
            dependency: dep
          });
        }
      }
    }

    return changes;
  }

  /**
   * Detect build information changes
   */
  private detectBuildInfoChanges(baseBuildInfo: BuildInformation, targetBuildInfo: BuildInformation): BuildInfoChange[] {
    const changes: BuildInfoChange[] = [];
    const properties = ['unityVersion', 'il2cppVersion', 'buildConfiguration', 'targetPlatform', 'scriptingBackend'];

    for (const prop of properties) {
      const oldValue = (baseBuildInfo as any)[prop] || '';
      const newValue = (targetBuildInfo as any)[prop] || '';

      if (oldValue !== newValue) {
        changes.push({
          property: prop,
          oldValue,
          newValue
        });
      }
    }

    return changes;
  }

  /**
   * Check if changes are breaking
   */
  private hasBreakingChanges(versionChanges: VersionChange[], removedAssemblies: AssemblyMetadata[], dependencyChanges: DependencyChange[]): boolean {
    // Major version changes are breaking
    if (versionChanges.some(change => change.changeType === 'major')) {
      return true;
    }

    // Removed assemblies are breaking
    if (removedAssemblies.length > 0) {
      return true;
    }

    // Removed dependencies can be breaking
    if (dependencyChanges.some(change => change.changeType === 'removed')) {
      return true;
    }

    return false;
  }

  /**
   * Validate tracking results
   */
  private validateTrackingResults(trackingEntry: AssemblyTrackingEntry): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate assemblies
    if (trackingEntry.assemblies.length === 0) {
      errors.push('No assembly metadata found in IL2CPP dump');
    }

    // Validate tracking ID
    if (!trackingEntry.trackingId || trackingEntry.trackingId.trim().length === 0) {
      errors.push('Tracking ID is required');
    }

    // Check for potential issues
    if (trackingEntry.statistics.circularDependencies > 0) {
      warnings.push(`${trackingEntry.statistics.circularDependencies} circular dependencies detected`);
    }

    if (trackingEntry.statistics.orphanedAssemblies > 0) {
      warnings.push(`${trackingEntry.statistics.orphanedAssemblies} orphaned assemblies detected`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Format the assembly tracking response
   */
  protected formatResponse(result: AssemblyTrackingResult, warnings: string[] = []): MCPResponse {
    const allWarnings = [...warnings, ...result.validationResults.warnings];

    // Handle validation errors
    if (!result.validationResults.isValid) {
      return MCPResponseFormatter.formatValidationResults(
        false,
        result.validationResults.errors,
        allWarnings
      );
    }

    // Create a serializable copy of the result to avoid circular references
    const serializableResult = this.createSerializableResult(result);

    // Create comprehensive response content
    let content = `# Assembly Tracking Results\n\n`;

    // Basic tracking information
    content += `**Tracking ID:** ${result.trackingEntry.trackingId}\n`;
    content += `**Extraction Date:** ${result.trackingEntry.extractionDate.toISOString()}\n`;
    if (result.trackingEntry.sourceFile) {
      content += `**Source File:** ${result.trackingEntry.sourceFile}\n`;
    }
    content += `\n`;

    // Assembly statistics
    const stats = result.trackingEntry.statistics;
    content += `## Assembly Statistics\n`;
    content += `- **Assemblies processed:** ${stats.totalAssemblies}\n`;
    content += `- **Total dependencies:** ${stats.totalDependencies}\n`;
    content += `- **Circular dependencies:** ${stats.circularDependencies}\n`;
    content += `- **Orphaned assemblies:** ${stats.orphanedAssemblies}\n`;
    content += `- **Processing time:** ${stats.processingTime}ms\n`;
    content += `- **Memory usage:** ${Math.round(stats.memoryUsage / 1024 / 1024 * 100) / 100} MB\n\n`;

    // Assembly list
    content += `## Tracked Assemblies\n`;
    for (const assembly of result.trackingEntry.assemblies) {
      content += `- **${assembly.name}** v${assembly.version}\n`;
      content += `  - Image: ${assembly.imageName} (Index: ${assembly.imageIndex})\n`;
      content += `  - Culture: ${assembly.culture}\n`;
      if (assembly.dependencies && assembly.dependencies.length > 0) {
        content += `  - Dependencies: ${assembly.dependencies.join(', ')}\n`;
      }
    }
    content += `\n`;

    // Build information
    if (result.trackingEntry.buildInfo) {
      const buildInfo = result.trackingEntry.buildInfo;
      content += `## Build Information\n`;
      if (buildInfo.unityVersion) content += `- **Unity Version:** ${buildInfo.unityVersion}\n`;
      if (buildInfo.il2cppVersion) content += `- **IL2CPP Version:** ${buildInfo.il2cppVersion}\n`;
      if (buildInfo.buildConfiguration) content += `- **Build Configuration:** ${buildInfo.buildConfiguration}\n`;
      if (buildInfo.targetPlatform) content += `- **Target Platform:** ${buildInfo.targetPlatform}\n`;
      if (buildInfo.scriptingBackend) content += `- **Scripting Backend:** ${buildInfo.scriptingBackend}\n`;
      content += `\n`;
    }

    // Comparison results
    if (result.comparison) {
      content += this.formatComparisonResults(result.comparison);
    }

    // Cache status
    content += `## Cache Status\n`;
    content += `- **Caching enabled:** ${result.cacheStatus.cached}\n`;
    content += `- **Cache size:** ${result.cacheStatus.cacheSize} entries\n`;
    content += `- **Cache hits:** ${result.cacheStatus.cacheHits}\n\n`;

    // Warnings
    if (allWarnings.length > 0) {
      content += `## Warnings\n`;
      for (const warning of allWarnings) {
        content += `- ${warning}\n`;
      }
      content += `\n`;
    }

    content += `Assembly tracking completed successfully.`;

    // Create response data using serializable result
    const responseData = {
      trackingResult: serializableResult,
      summary: {
        trackingId: result.trackingEntry.trackingId,
        assemblies: stats.totalAssemblies,
        dependencies: stats.totalDependencies,
        processingTime: stats.processingTime,
        memoryUsage: Math.round(stats.memoryUsage / 1024 / 1024 * 100) / 100,
        isValid: result.validationResults.isValid,
        hasComparison: !!result.comparison,
        cacheEnabled: result.cacheStatus.cached
      }
    };

    let response = MCPResponseFormatter.formatAnalysisResults(
      responseData,
      this.config.name,
      { content },
      Date.now() - this.startTime
    );

    if (allWarnings.length > 0) {
      response = MCPResponseFormatter.addWarnings(response, allWarnings);
    }

    return MCPResponseFormatter.addExecutionTiming(response, this.startTime, this.config.name);
  }

  /**
   * Format comparison results section
   */
  private formatComparisonResults(comparison: AssemblyComparisonResult): string {
    let content = `## Comparison Results\n`;
    content += `**Comparison Type:** ${comparison.comparisonType}\n`;
    content += `**Base:** ${comparison.baseTrackingId} → **Target:** ${comparison.targetTrackingId}\n\n`;

    // Summary
    const summary = comparison.summary;
    content += `### Summary\n`;
    content += `- **Total changes:** ${summary.totalChanges}\n`;
    content += `- **Version changes:** ${summary.versionChanges}\n`;
    content += `- **Assembly changes:** ${summary.assemblyChanges}\n`;
    content += `- **Dependency changes:** ${summary.dependencyChanges}\n`;
    content += `- **Build changes:** ${summary.buildChanges}\n`;
    content += `- **Breaking changes:** ${summary.hasBreakingChanges ? 'Yes' : 'No'}\n\n`;

    // Version changes
    if (comparison.versionChanges.length > 0) {
      content += `### Version Changes\n`;
      for (const change of comparison.versionChanges) {
        content += `- **${change.assemblyName}:** ${change.oldVersion} → ${change.newVersion} (${change.changeType})\n`;
      }
      content += `\n`;
    }

    // New assemblies
    if (comparison.newAssemblies.length > 0) {
      content += `### New Assemblies\n`;
      for (const assembly of comparison.newAssemblies) {
        content += `- **${assembly.name}** v${assembly.version}\n`;
      }
      content += `\n`;
    }

    // Removed assemblies
    if (comparison.removedAssemblies.length > 0) {
      content += `### Removed Assemblies\n`;
      for (const assembly of comparison.removedAssemblies) {
        content += `- **${assembly.name}** v${assembly.version}\n`;
      }
      content += `\n`;
    }

    // Dependency changes
    if (comparison.dependencyChanges.length > 0) {
      content += `### Dependency Changes\n`;
      for (const change of comparison.dependencyChanges) {
        content += `- **${change.assemblyName}:** ${change.changeType} dependency on ${change.dependency}\n`;
        if (change.details) {
          content += `  - ${change.details}\n`;
        }
      }
      content += `\n`;
    }

    // Build information changes
    if (comparison.buildInfoChanges.length > 0) {
      content += `### Build Information Changes\n`;
      for (const change of comparison.buildInfoChanges) {
        content += `- **${change.property}:** ${change.oldValue} → ${change.newValue}\n`;
      }
      content += `\n`;
    }

    if (comparison.summary.totalChanges === 0) {
      content += `No changes detected between builds.\n\n`;
    } else {
      content += `Retrieved cached metadata for ${comparison.baseTrackingId}.\n`;
      content += `Metadata comparison completed.\n\n`;
    }

    return content;
  }

  /**
   * Create a serializable copy of the result to avoid circular references
   */
  private createSerializableResult(result: AssemblyTrackingResult): any {
    return {
      trackingEntry: {
        ...result.trackingEntry,
        dependencies: this.serializeDependencyMap(result.trackingEntry.dependencies)
      },
      comparison: result.comparison,
      cacheStatus: result.cacheStatus,
      validationResults: result.validationResults
    };
  }

  /**
   * Serialize dependency map to avoid circular references
   */
  private serializeDependencyMap(dependencyMap: AssemblyDependencyMap): any {
    const serialized: any = {};

    for (const [assemblyName, deps] of Object.entries(dependencyMap)) {
      serialized[assemblyName] = {
        directDependencies: [...deps.directDependencies],
        transitiveDependencies: [...deps.transitiveDependencies],
        dependents: [...deps.dependents],
        circularDependencies: [...deps.circularDependencies]
      };
    }

    return serialized;
  }
}

/**
 * Zod schema for assembly tracker tool parameters
 */
export const assemblyTrackerSchema = z.object({
  content: z.string().optional().describe("IL2CPP dump content to analyze"),
  file_path: z.string().optional().describe("Path to IL2CPP dump file"),
  tracking_id: z.string().min(1).max(100).describe("Unique identifier for this assembly tracking entry"),
  comparison_mode: z.enum(['full', 'versions_only', 'dependencies_only', 'changes_only']).optional().default('full').describe("Type of comparison to perform"),
  compare_with: z.string().optional().describe("Tracking ID to compare with (requires cached metadata)"),
  include_dependencies: z.boolean().optional().default(true).describe("Include dependency analysis in tracking"),
  enable_caching: z.boolean().optional().default(true).describe("Enable caching of assembly metadata"),
  enable_performance_tracking: z.boolean().optional().default(true).describe("Enable performance monitoring"),
  max_cache_size: z.number().min(10).max(10000).optional().default(1000).describe("Maximum number of cached entries")
});

/**
 * Factory function to create and register the assembly tracker tool
 */
export function createAssemblyTrackerTool(server: any, context: ToolExecutionContext) {
  const handler = new AssemblyTrackerToolHandler(context);

  server.tool(
    "track_assembly_metadata",
    assemblyTrackerSchema,
    async (params: AssemblyTrackerParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
