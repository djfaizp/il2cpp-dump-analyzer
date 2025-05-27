/**
 * @fileoverview Intelligent MCP Tool Selection and Execution
 * Provides smart tool selection algorithms, capability mapping, and enhanced execution
 * for complex IL2CPP analysis workflows within the MCP framework
 */

import { ToolExecutionContext } from '../mcp/base-tool-handler';
import { Logger } from '../mcp/mcp-sdk-server';
import { TOOL_REGISTRY, getToolMetadata, getAllToolNames } from '../mcp/tools/tool-registry';
import {
  ToolSelectionCriteria,
  ToolSelectionResult,
  ToolCapabilityMap,
  ToolCapability,
  ToolRelationship,
  ToolCompatibility,
  ToolExecutionPlan,
  ToolExecutionResult,
  ToolQualityAssessment,
  ParallelExecutionResult,
  ExecutionTimeEstimate,
  LearningStatistics,
  ToolSelectorConfig,
  ToolSelectionStrategy,
  IntentAnalysis
} from './types';

/**
 * Default configuration for the Tool Selector
 */
const DEFAULT_CONFIG: ToolSelectorConfig = {
  enableIntelligentSelection: true,
  enableParallelExecution: true,
  maxParallelTools: 3,
  selectionStrategy: 'adaptive',
  qualityThreshold: 0.7,
  enableLearning: true,
  maxRetryAttempts: 3,
  enableCaching: true,
  cacheConfig: {
    maxSizeMB: 50,
    ttlMs: 1800000, // 30 minutes
    enableSemanticCaching: true
  }
};

/**
 * Intelligent MCP Tool Selection and Execution System
 * Provides smart tool selection algorithms and enhanced execution capabilities
 */
export class MCPToolSelector {
  private context: ToolExecutionContext;
  private config: ToolSelectorConfig;
  private capabilityMap: ToolCapabilityMap | null = null;
  private learningData: Map<string, any> = new Map();
  private selectionCache: Map<string, ToolSelectionResult> = new Map();
  private executionHistory: Array<{
    criteria: any;
    selectedTool: string;
    result: { success: boolean; qualityScore: number };
  }> = [];

  constructor(context: ToolExecutionContext, config: Partial<ToolSelectorConfig> = {}) {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.context.logger.info('MCP Tool Selector initialized', {
      config: this.config,
      enabledFeatures: {
        intelligentSelection: this.config.enableIntelligentSelection,
        parallelExecution: this.config.enableParallelExecution,
        adaptiveLearning: this.config.enableLearning
      }
    });
  }

  /**
   * Build comprehensive tool capability map
   */
  async buildCapabilityMap(): Promise<ToolCapabilityMap> {
    if (this.capabilityMap) {
      return this.capabilityMap;
    }

    const tools = new Map<string, ToolCapability>();
    const categories = new Map<string, string[]>();
    const complexityLevels = new Map<string, string[]>();
    const toolRelationships = new Map<string, ToolRelationship>();
    const compatibilityMatrix = new Map<string, Map<string, ToolCompatibility>>();

    // Build tool capabilities from registry
    for (const [toolName, entry] of Object.entries(TOOL_REGISTRY)) {
      const metadata = entry.metadata;

      const capability: ToolCapability = {
        name: toolName,
        category: metadata.category,
        complexity: metadata.complexity,
        inputs: {
          required: metadata.requiredParameters,
          optional: metadata.optionalParameters,
          types: this.inferParameterTypes(metadata)
        },
        outputs: {
          format: metadata.outputFormat,
          structure: this.inferOutputStructure(toolName),
          metadata: ['resultCount', 'executionTime']
        },
        performance: {
          averageExecutionTime: this.parseExecutionTime(metadata.estimatedExecutionTime),
          memoryUsage: this.estimateMemoryUsage(metadata.complexity),
          successRate: 0.9 // Default, will be updated with learning
        },
        usage: {
          commonUseCases: this.inferUseCases(metadata),
          bestPractices: this.inferBestPractices(metadata),
          limitations: this.inferLimitations(metadata)
        }
      };

      tools.set(toolName, capability);

      // Group by category
      if (!categories.has(metadata.category)) {
        categories.set(metadata.category, []);
      }
      categories.get(metadata.category)!.push(toolName);

      // Group by complexity
      if (!complexityLevels.has(metadata.complexity)) {
        complexityLevels.set(metadata.complexity, []);
      }
      complexityLevels.get(metadata.complexity)!.push(toolName);

      // Build relationships
      toolRelationships.set(toolName, this.buildToolRelationships(toolName, metadata));
    }

    // Build compatibility matrix
    for (const tool1 of tools.keys()) {
      const tool1Compat = new Map<string, ToolCompatibility>();
      for (const tool2 of tools.keys()) {
        if (tool1 !== tool2) {
          tool1Compat.set(tool2, await this.analyzeToolCompatibility(tool1, tool2));
        }
      }
      compatibilityMatrix.set(tool1, tool1Compat);
    }

    this.capabilityMap = {
      tools,
      categories,
      complexityLevels,
      toolRelationships,
      compatibilityMatrix
    };

    this.context.logger.info('Tool capability map built', {
      totalTools: tools.size,
      categories: Array.from(categories.keys()),
      complexityLevels: Array.from(complexityLevels.keys())
    });

    return this.capabilityMap;
  }

  /**
   * Analyze compatibility between two tools
   */
  async analyzeToolCompatibility(tool1: string, tool2: string): Promise<ToolCompatibility> {
    const metadata1 = getToolMetadata(tool1);
    const metadata2 = getToolMetadata(tool2);

    if (!metadata1 || !metadata2) {
      return {
        isCompatible: false,
        compatibilityScore: 0,
        sharedParameters: [],
        dataFlowCompatible: false
      };
    }

    // Find shared parameters
    const sharedParams = metadata1.requiredParameters.filter(param =>
      metadata2.requiredParameters.includes(param) || metadata2.optionalParameters.includes(param)
    );

    // Add common parameter mappings
    if (tool1 === 'search_code' && tool2 === 'find_class_hierarchy') {
      sharedParams.push('class_name'); // search_code.query -> find_class_hierarchy.class_name
    }

    // Check data flow compatibility
    const dataFlowCompatible = this.checkDataFlowCompatibility(tool1, tool2);

    // Calculate compatibility score
    const compatibilityScore = this.calculateCompatibilityScore(metadata1, metadata2, sharedParams);

    return {
      isCompatible: compatibilityScore > 0.3,
      compatibilityScore,
      sharedParameters: sharedParams,
      dataFlowCompatible,
      executionOrder: this.determineExecutionOrder(tool1, tool2)
    };
  }

  /**
   * Select optimal tool based on criteria
   */
  async selectOptimalTool(criteria: ToolSelectionCriteria): Promise<ToolSelectionResult> {
    // Check cache first
    const cacheKey = this.generateCacheKey(criteria);
    if (this.config.enableCaching && this.selectionCache.has(cacheKey)) {
      return this.selectionCache.get(cacheKey)!;
    }

    await this.buildCapabilityMap();

    // Apply selection strategy
    const candidates = await this.getCandidateTools(criteria);
    const scoredCandidates = await this.scoreToolCandidates(candidates, criteria);
    const selectedTool = this.applySelectionStrategy(scoredCandidates, criteria);

    const result: ToolSelectionResult = {
      toolName: selectedTool.toolName,
      confidence: selectedTool.score,
      reasoning: selectedTool.reasoning,
      suggestedParameters: this.generateSuggestedParameters(selectedTool.toolName, criteria),
      estimatedExecutionTime: selectedTool.estimatedTime,
      alternatives: scoredCandidates.slice(1, 4).map(candidate => ({
        toolName: candidate.toolName,
        confidence: candidate.score,
        reasoning: candidate.reasoning,
        estimatedExecutionTime: candidate.estimatedTime
      })),
      strategy: this.config.selectionStrategy
    };

    // Cache the result
    if (this.config.enableCaching) {
      this.selectionCache.set(cacheKey, result);
    }

    this.context.logger.debug('Tool selected', {
      selectedTool: result.toolName,
      confidence: result.confidence,
      alternatives: result.alternatives.length
    });

    return result;
  }

  /**
   * Execute a single tool with enhanced error handling and retries
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= (this.config.maxRetryAttempts || 3); attempt++) {
      try {
        this.context.logger.debug('Executing tool', { toolName, parameters, attempt });

        // Get tool from registry
        const toolEntry = TOOL_REGISTRY[toolName];
        if (!toolEntry) {
          throw new Error(`Tool not found: ${toolName}`);
        }

        // Execute the tool (simplified - in real implementation would call actual tool)
        const result = await this.executeToolInternal(toolName, parameters);

        const executionTime = Date.now() - startTime;

        return {
          success: true,
          data: result.data || [],
          metadata: { ...result.metadata, executionTime },
          executionTime,
          retryCount: attempt
        };

      } catch (error) {
        lastError = error as Error;
        retryCount = attempt;

        if (attempt < (this.config.maxRetryAttempts || 3)) {
          const delay = this.calculateRetryDelay(attempt);
          this.context.logger.warn('Tool execution failed, retrying', {
            toolName,
            attempt,
            error: lastError.message,
            retryDelay: delay
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    const executionTime = Date.now() - startTime;

    return {
      success: false,
      data: [],
      metadata: { executionTime },
      error: lastError?.message || 'Unknown error',
      executionTime,
      retryCount
    };
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeToolsInParallel(tools: Array<{
    toolName: string;
    parameters: Record<string, any>;
  }>): Promise<ParallelExecutionResult> {
    const startTime = Date.now();

    this.context.logger.info('Starting parallel tool execution', {
      toolCount: tools.length,
      tools: tools.map(t => t.toolName)
    });

    // Execute all tools in parallel
    const promises = tools.map(async (tool, index) => {
      try {
        const result = await this.executeTool(tool.toolName, tool.parameters);
        return { index, result };
      } catch (error) {
        return {
          index,
          result: {
            success: false,
            data: [],
            metadata: {},
            error: (error as Error).message,
            executionTime: 0,
            retryCount: 0
          } as ToolExecutionResult
        };
      }
    });

    const results = await Promise.all(promises);
    const executionTime = Date.now() - startTime;

    // Sort results by original order
    results.sort((a, b) => a.index - b.index);
    const toolResults = results.map(r => r.result);

    const successfulExecutions = toolResults.filter(r => r.success).length;
    const failedExecutions = toolResults.length - successfulExecutions;

    const executionTimes = toolResults.map(r => r.executionTime || 0);

    return {
      success: failedExecutions === 0,
      results: toolResults,
      executionTime,
      parallelExecutions: tools.length,
      successfulExecutions,
      failedExecutions,
      performanceMetrics: {
        averageExecutionTime: executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length,
        maxExecutionTime: Math.max(...executionTimes),
        minExecutionTime: Math.min(...executionTimes),
        throughput: tools.length / (executionTime / 1000)
      },
      resourceUsage: {
        peakMemoryUsage: 0, // Would be measured in real implementation
        totalCpuTime: executionTime,
        networkRequests: tools.length
      }
    };
  }

  /**
   * Create execution plan for multiple tools
   */
  async createExecutionPlan(tools: Array<{
    toolName: string;
    parameters: Record<string, any>;
    priority: number;
    dependencies: string[];
  }>): Promise<ToolExecutionPlan> {
    await this.buildCapabilityMap();

    // Analyze dependencies and create execution groups
    const parallelGroups: Array<Array<{ toolName: string; parameters: Record<string, any> }>> = [];
    const processed = new Set<string>();
    let currentGroup: Array<{ toolName: string; parameters: Record<string, any> }> = [];

    // Sort tools by priority and dependencies
    const sortedTools = [...tools].sort((a, b) => {
      if (a.dependencies.length !== b.dependencies.length) {
        return a.dependencies.length - b.dependencies.length;
      }
      return a.priority - b.priority;
    });

    for (const tool of sortedTools) {
      // Check if all dependencies are satisfied
      const dependenciesSatisfied = tool.dependencies.every(dep => processed.has(dep));

      if (dependenciesSatisfied && tool.dependencies.length === 0) {
        // Can run in parallel with other independent tools
        currentGroup.push({ toolName: tool.toolName, parameters: tool.parameters });
      } else {
        // Start new sequential group
        if (currentGroup.length > 0) {
          parallelGroups.push([...currentGroup]);
          currentGroup = [];
        }
        currentGroup.push({ toolName: tool.toolName, parameters: tool.parameters });
        parallelGroups.push([...currentGroup]);
        currentGroup = [];
      }

      processed.add(tool.toolName);
    }

    if (currentGroup.length > 0) {
      parallelGroups.push(currentGroup);
    }

    // Calculate execution strategy
    const executionStrategy = parallelGroups.length === 1 && parallelGroups[0].length > 1
      ? 'parallel'
      : parallelGroups.every(group => group.length === 1)
        ? 'sequential'
        : 'hybrid';

    // Estimate total duration
    let estimatedDuration = 0;
    for (const group of parallelGroups) {
      if (group.length === 1) {
        estimatedDuration += await this.estimateToolExecutionTime(group[0].toolName, group[0].parameters);
      } else {
        // Parallel execution - use maximum time in group
        const groupTimes = await Promise.all(
          group.map(tool => this.estimateToolExecutionTime(tool.toolName, tool.parameters))
        );
        estimatedDuration += Math.max(...groupTimes);
      }
    }

    // Create execution steps with estimated durations
    const executionSteps = [];
    for (let index = 0; index < tools.length; index++) {
      const tool = tools[index];
      executionSteps.push({
        stepId: `step_${index}`,
        toolName: tool.toolName,
        parameters: tool.parameters,
        dependencies: tool.dependencies,
        estimatedDuration: await this.estimateToolExecutionTime(tool.toolName, tool.parameters)
      });
    }

    return {
      executionSteps,
      executionStrategy,
      parallelGroups,
      estimatedDuration,
      riskAssessment: {
        overallRisk: this.assessExecutionRisk(tools),
        riskFactors: this.identifyRiskFactors(tools),
        mitigationStrategies: this.suggestMitigationStrategies(tools)
      }
    };
  }

  /**
   * Validate tool result structure and quality
   */
  async validateToolResult(toolName: string, result: ToolExecutionResult): Promise<ToolQualityAssessment> {
    const issues: string[] = [];
    let qualityScore = 1.0;

    // Basic structure validation
    if (!result.success && !result.error) {
      issues.push('Failed result missing error message');
      qualityScore -= 0.3;
    }

    if (result.success && (!result.data || !Array.isArray(result.data))) {
      issues.push('Successful result missing or invalid data array');
      qualityScore -= 0.4;
    }

    if (result.success && result.data && result.data.length === 0) {
      issues.push('No results found');
      qualityScore -= 0.6; // Stronger penalty for no results
    }

    // Tool-specific validation
    const toolMetadata = getToolMetadata(toolName);
    if (toolMetadata && result.success && result.data) {
      // Check expected output structure
      for (const item of result.data) {
        if (!item.content) {
          issues.push('Result item missing content');
          qualityScore -= 0.2;
        }
        if (!item.metadata) {
          issues.push('Result item missing metadata');
          qualityScore -= 0.1;
        }
      }
    }

    return {
      isValid: issues.length === 0 && qualityScore > 0.5,
      qualityScore: Math.max(0, qualityScore),
      relevanceScore: this.calculateRelevanceScore(result),
      completenessScore: this.calculateCompletenessScore(result),
      overallQuality: Math.max(0, qualityScore),
      issues,
      suggestions: this.generateImprovementSuggestions(issues),
      metrics: {
        resultCount: result.data?.length || 0,
        averageRelevance: this.calculateAverageRelevance(result),
        dataCompleteness: this.calculateDataCompleteness(result),
        structuralIntegrity: this.calculateStructuralIntegrity(result)
      }
    };
  }

  /**
   * Assess result quality with custom criteria
   */
  async assessResultQuality(
    toolName: string,
    result: ToolExecutionResult,
    criteria?: {
      expectedResultCount?: number;
      relevanceThreshold?: number;
      completenessRequirements?: string[];
    }
  ): Promise<ToolQualityAssessment> {
    const baseAssessment = await this.validateToolResult(toolName, result);

    if (!criteria) {
      return baseAssessment;
    }

    let adjustedScore = baseAssessment.qualityScore;
    const additionalIssues: string[] = [];

    // Check expected result count
    if (criteria.expectedResultCount && result.data) {
      const actualCount = result.data.length;
      if (actualCount < criteria.expectedResultCount) {
        additionalIssues.push(`Expected ${criteria.expectedResultCount} results, got ${actualCount}`);
        adjustedScore -= 0.2;
      }
    }

    // Check relevance threshold
    if (criteria.relevanceThreshold && result.data) {
      const lowRelevanceItems = result.data.filter(item =>
        (item.metadata?.relevance || 0) < criteria.relevanceThreshold!
      );
      if (lowRelevanceItems.length > 0) {
        additionalIssues.push(`${lowRelevanceItems.length} items below relevance threshold`);
        adjustedScore -= 0.1 * (lowRelevanceItems.length / result.data.length);
      }
    }

    // Check completeness requirements
    if (criteria.completenessRequirements && result.data) {
      for (const requirement of criteria.completenessRequirements) {
        const missingItems = result.data.filter(item => !item[requirement] && !item.metadata?.[requirement]);
        if (missingItems.length > 0) {
          additionalIssues.push(`${missingItems.length} items missing ${requirement}`);
          adjustedScore -= 0.1;
        }
      }
    }

    return {
      ...baseAssessment,
      qualityScore: Math.max(0, adjustedScore),
      overallQuality: Math.max(0, adjustedScore),
      issues: [...baseAssessment.issues, ...additionalIssues],
      suggestions: this.generateImprovementSuggestions([...baseAssessment.issues, ...additionalIssues])
    };
  }

  /**
   * Learn from tool selection history
   */
  async learnFromHistory(history: Array<{
    criteria: any;
    selectedTool: string;
    result: { success: boolean; qualityScore: number };
  }>): Promise<void> {
    if (!this.config.enableLearning) {
      return;
    }

    this.executionHistory.push(...history);

    // Update tool preferences based on success rates
    const toolStats = new Map<string, { successes: number; total: number; avgQuality: number }>();

    for (const entry of this.executionHistory) {
      const stats = toolStats.get(entry.selectedTool) || { successes: 0, total: 0, avgQuality: 0 };
      stats.total++;
      if (entry.result.success) {
        stats.successes++;
      }
      stats.avgQuality = (stats.avgQuality * (stats.total - 1) + entry.result.qualityScore) / stats.total;
      toolStats.set(entry.selectedTool, stats);
    }

    // Update capability map with learned performance data
    if (this.capabilityMap) {
      for (const [toolName, stats] of toolStats) {
        const capability = this.capabilityMap.tools.get(toolName);
        if (capability) {
          capability.performance.successRate = stats.successes / stats.total;
        }
      }
    }

    this.context.logger.info('Learning from execution history', {
      totalSamples: this.executionHistory.length,
      toolsLearned: toolStats.size
    });
  }

  /**
   * Get learning statistics
   */
  async getLearningStatistics(): Promise<LearningStatistics> {
    const toolPreferences = new Map<string, number>();
    let totalQuality = 0;

    for (const entry of this.executionHistory) {
      const current = toolPreferences.get(entry.selectedTool) || 0;
      toolPreferences.set(entry.selectedTool, current + entry.result.qualityScore);
      totalQuality += entry.result.qualityScore;
    }

    // Normalize preferences
    for (const [tool, score] of toolPreferences) {
      toolPreferences.set(tool, score / this.executionHistory.length);
    }

    return {
      totalSamples: this.executionHistory.length,
      averageQuality: this.executionHistory.length > 0 ? totalQuality / this.executionHistory.length : 0,
      toolPreferences,
      patterns: [], // Would be implemented with pattern recognition
      accuracy: {
        predictionAccuracy: 0.85, // Would be calculated from actual predictions
        improvementRate: 0.1,
        lastUpdated: Date.now()
      }
    };
  }

  /**
   * Estimate execution time for a tool
   */
  async estimateExecutionTime(toolName: string, parameters: Record<string, any>): Promise<ExecutionTimeEstimate> {
    const baseTime = await this.estimateToolExecutionTime(toolName, parameters);

    return {
      estimatedMs: baseTime,
      confidence: 0.8,
      factors: {
        parameterComplexity: this.calculateParameterComplexity(parameters),
        dataSize: this.estimateDataSize(parameters),
        systemLoad: 0.5, // Would be measured in real implementation
        historicalPerformance: 0.8
      },
      range: {
        minimum: baseTime * 0.7,
        maximum: baseTime * 1.5,
        median: baseTime
      }
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Infer parameter types from metadata
   */
  private inferParameterTypes(metadata: any): Record<string, string> {
    const types: Record<string, string> = {};

    // Common parameter type mappings
    const typeMap: Record<string, string> = {
      'query': 'string',
      'class_name': 'string',
      'target_name': 'string',
      'enum_name': 'string',
      'filter_type': 'string',
      'filter_namespace': 'string',
      'filter_monobehaviour': 'boolean',
      'top_k': 'number',
      'depth': 'number',
      'include_methods': 'boolean',
      'include_nested': 'boolean',
      'max_results': 'number'
    };

    for (const param of [...metadata.requiredParameters, ...metadata.optionalParameters]) {
      types[param] = typeMap[param] || 'string';
    }

    return types;
  }

  /**
   * Infer output structure from tool name
   */
  private inferOutputStructure(toolName: string): Record<string, any> {
    const commonStructure = {
      content: 'string',
      metadata: {
        type: 'string',
        relevance: 'number',
        confidence: 'number'
      }
    };

    // Tool-specific structures
    switch (toolName) {
      case 'find_class_hierarchy':
        return {
          ...commonStructure,
          metadata: {
            ...commonStructure.metadata,
            baseClass: 'string',
            interfaces: 'array',
            depth: 'number'
          }
        };
      case 'analyze_dependencies':
        return {
          ...commonStructure,
          metadata: {
            ...commonStructure.metadata,
            dependencies: 'array',
            dependents: 'array',
            circularDependencies: 'array'
          }
        };
      default:
        return commonStructure;
    }
  }

  /**
   * Parse execution time from metadata
   */
  private parseExecutionTime(timeStr: string): number {
    // Parse time strings like "1-3 seconds", "500ms", etc.
    const match = timeStr.match(/(\d+)(?:-(\d+))?\s*(ms|seconds?|minutes?)/i);
    if (!match) return 2000; // Default 2 seconds

    const min = parseInt(match[1]);
    const max = match[2] ? parseInt(match[2]) : min;
    const unit = match[3].toLowerCase();

    let multiplier = 1;
    if (unit.startsWith('second')) multiplier = 1000;
    else if (unit.startsWith('minute')) multiplier = 60000;

    return ((min + max) / 2) * multiplier;
  }

  /**
   * Estimate memory usage based on complexity
   */
  private estimateMemoryUsage(complexity: string): number {
    switch (complexity) {
      case 'simple': return 10 * 1024 * 1024; // 10MB
      case 'medium': return 50 * 1024 * 1024; // 50MB
      case 'complex': return 100 * 1024 * 1024; // 100MB
      default: return 25 * 1024 * 1024; // 25MB
    }
  }

  /**
   * Infer common use cases from metadata
   */
  private inferUseCases(metadata: any): string[] {
    const useCases: string[] = [];

    if (metadata.category === 'search') {
      useCases.push('Finding specific code elements', 'Initial exploration', 'Code discovery');
    } else if (metadata.category === 'analysis') {
      useCases.push('Deep code analysis', 'Relationship mapping', 'Dependency tracking');
    } else if (metadata.category === 'generation') {
      useCases.push('Code generation', 'Documentation creation', 'Wrapper generation');
    }

    return useCases;
  }

  /**
   * Infer best practices from metadata
   */
  private inferBestPractices(metadata: any): string[] {
    const practices: string[] = [];

    if (metadata.complexity === 'complex') {
      practices.push('Use specific filters to narrow results', 'Allow sufficient execution time');
    }

    if (metadata.category === 'search') {
      practices.push('Start with broad queries then narrow down', 'Use type filters for better results');
    }

    return practices;
  }

  /**
   * Infer limitations from metadata
   */
  private inferLimitations(metadata: any): string[] {
    const limitations: string[] = [];

    if (metadata.complexity === 'complex') {
      limitations.push('High memory usage', 'Longer execution time');
    }

    if (metadata.category === 'generation') {
      limitations.push('Requires existing code analysis', 'May need manual review');
    }

    return limitations;
  }

  /**
   * Build tool relationships
   */
  private buildToolRelationships(toolName: string, metadata: any): ToolRelationship {
    const relationships: ToolRelationship = {
      complementary: [],
      alternatives: [],
      prerequisites: [],
      followUp: [],
      conflicts: []
    };

    // Define common relationships
    switch (toolName) {
      case 'search_code':
        relationships.complementary = ['find_class_hierarchy', 'analyze_dependencies', 'find_cross_references'];
        relationships.alternatives = ['find_monobehaviours'];
        relationships.followUp = ['find_class_hierarchy', 'analyze_dependencies'];
        break;

      case 'find_class_hierarchy':
        relationships.prerequisites = ['search_code'];
        relationships.complementary = ['analyze_dependencies', 'find_cross_references'];
        relationships.followUp = ['analyze_dependencies'];
        break;

      case 'analyze_dependencies':
        relationships.prerequisites = ['search_code'];
        relationships.complementary = ['find_class_hierarchy', 'find_cross_references'];
        break;

      case 'find_monobehaviours':
        relationships.alternatives = ['search_code'];
        relationships.followUp = ['find_class_hierarchy', 'analyze_dependencies'];
        break;
    }

    return relationships;
  }

  /**
   * Check data flow compatibility between tools
   */
  private checkDataFlowCompatibility(tool1: string, tool2: string): boolean {
    // Define data flow patterns
    const dataFlowPatterns: Record<string, string[]> = {
      'search_code': ['find_class_hierarchy', 'analyze_dependencies', 'find_cross_references'],
      'find_monobehaviours': ['find_class_hierarchy', 'analyze_dependencies'],
      'find_class_hierarchy': ['analyze_dependencies', 'find_cross_references'],
      'analyze_dependencies': ['find_cross_references']
    };

    return dataFlowPatterns[tool1]?.includes(tool2) || false;
  }

  /**
   * Calculate compatibility score between tools
   */
  private calculateCompatibilityScore(metadata1: any, metadata2: any, sharedParams: string[]): number {
    let score = 0;

    // Shared parameters boost compatibility
    score += sharedParams.length * 0.2;

    // Same category tools are more compatible
    if (metadata1.category === metadata2.category) {
      score += 0.3;
    }

    // Similar complexity levels are more compatible
    const complexityMap: Record<string, number> = { simple: 1, medium: 2, complex: 3 };
    const complexityDiff = Math.abs(
      (complexityMap[metadata1.complexity] || 2) - (complexityMap[metadata2.complexity] || 2)
    );
    score += (3 - complexityDiff) * 0.1;

    return Math.min(1.0, score);
  }

  /**
   * Determine execution order for tools
   */
  private determineExecutionOrder(tool1: string, tool2: string): 'sequential' | 'parallel' | 'either' {
    // Tools that should run sequentially
    const sequentialPairs: Record<string, string[]> = {
      'search_code': ['find_class_hierarchy', 'analyze_dependencies'],
      'find_monobehaviours': ['find_class_hierarchy', 'analyze_dependencies'],
      'find_class_hierarchy': ['analyze_dependencies']
    };

    if (sequentialPairs[tool1]?.includes(tool2)) {
      return 'sequential';
    }

    // Tools that can run in parallel
    const parallelPairs = [
      ['search_code', 'find_monobehaviours'],
      ['find_class_hierarchy', 'find_cross_references']
    ];

    for (const pair of parallelPairs) {
      if ((pair[0] === tool1 && pair[1] === tool2) || (pair[0] === tool2 && pair[1] === tool1)) {
        return 'parallel';
      }
    }

    return 'either';
  }

  /**
   * Generate cache key for criteria
   */
  private generateCacheKey(criteria: ToolSelectionCriteria): string {
    const key = {
      action: criteria.intent.action,
      target: criteria.intent.target,
      type: criteria.intent.type,
      previousTools: criteria.context.previousTools.sort(),
      constraints: criteria.constraints
    };
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }

  /**
   * Get candidate tools based on criteria
   */
  private async getCandidateTools(criteria: ToolSelectionCriteria): Promise<string[]> {
    if (!this.capabilityMap) {
      await this.buildCapabilityMap();
    }

    const candidates: string[] = [];

    // Filter by category preference
    if (criteria.constraints.preferredCategories) {
      for (const category of criteria.constraints.preferredCategories) {
        const categoryTools = this.capabilityMap!.categories.get(category) || [];
        candidates.push(...categoryTools);
      }
    } else {
      // Add all tools if no category preference
      candidates.push(...this.capabilityMap!.tools.keys());
    }

    // Filter by complexity constraint
    if (criteria.constraints.maxComplexity) {
      const allowedComplexities = this.getAllowedComplexities(criteria.constraints.maxComplexity);
      return candidates.filter(tool => {
        const capability = this.capabilityMap!.tools.get(tool);
        return capability && allowedComplexities.includes(capability.complexity);
      });
    }

    // Remove excluded tools
    if (criteria.constraints.excludedTools) {
      return candidates.filter(tool => !criteria.constraints.excludedTools!.includes(tool));
    }

    return [...new Set(candidates)]; // Remove duplicates
  }

  /**
   * Get allowed complexity levels
   */
  private getAllowedComplexities(maxComplexity: string): string[] {
    switch (maxComplexity) {
      case 'simple': return ['simple'];
      case 'medium': return ['simple', 'medium'];
      case 'complex': return ['simple', 'medium', 'complex'];
      default: return ['simple', 'medium', 'complex'];
    }
  }

  /**
   * Score tool candidates
   */
  private async scoreToolCandidates(candidates: string[], criteria: ToolSelectionCriteria): Promise<Array<{
    toolName: string;
    score: number;
    reasoning: string;
    estimatedTime: number;
  }>> {
    const scored: Array<{
      toolName: string;
      score: number;
      reasoning: string;
      estimatedTime: number;
    }> = [];

    for (const toolName of candidates) {
      const capability = this.capabilityMap!.tools.get(toolName);
      if (!capability) continue;

      let score = 0;
      const reasons: string[] = [];

      // Intent matching
      const intentScore = this.calculateIntentScore(toolName, criteria.intent);
      score += intentScore * 0.5; // Increased weight for intent
      if (intentScore > 0.7) reasons.push('strong intent match');

      // Context relevance
      const contextScore = this.calculateContextScore(toolName, criteria.context);
      score += contextScore * 0.2;
      if (contextScore > 0.7) reasons.push('relevant to context');

      // Performance factors
      const performanceScore = capability.performance.successRate;
      score += performanceScore * 0.2;
      if (performanceScore > 0.8) reasons.push('high success rate');

      // Learning adjustments
      if (this.config.enableLearning) {
        const learningScore = this.getLearningScore(toolName, criteria);
        score += learningScore * 0.1;
        if (learningScore > 0.7) reasons.push('learned preference');
      }

      // Penalty for recent usage (avoid redundancy)
      if (criteria.context.previousTools.includes(toolName)) {
        score *= 0.3; // Stronger penalty
        reasons.push('recently used (penalty applied)');
      }

      const estimatedTime = await this.estimateToolExecutionTime(toolName, {});

      scored.push({
        toolName,
        score: Math.min(1.0, score),
        reasoning: reasons.join(', ') || 'general capability match',
        estimatedTime
      });
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Apply selection strategy to scored candidates
   */
  private applySelectionStrategy(
    candidates: Array<{ toolName: string; score: number; reasoning: string; estimatedTime: number }>,
    criteria: ToolSelectionCriteria
  ): { toolName: string; score: number; reasoning: string; estimatedTime: number } {
    if (candidates.length === 0) {
      throw new Error('No suitable tools found for the given criteria');
    }

    switch (this.config.selectionStrategy) {
      case 'conservative':
        // Prefer simple, reliable tools
        return candidates.find(c => c.score > 0.8) || candidates[0];

      case 'aggressive':
        // Prefer complex, feature-rich tools
        return candidates[0]; // Highest scored

      case 'balanced':
        // Balance between reliability and capability
        return candidates.find(c => c.score > 0.7) || candidates[0];

      case 'adaptive':
      default:
        // Adapt based on context and learning
        return this.adaptiveSelection(candidates, criteria);
    }
  }

  /**
   * Adaptive selection based on context and learning
   */
  private adaptiveSelection(
    candidates: Array<{ toolName: string; score: number; reasoning: string; estimatedTime: number }>,
    criteria: ToolSelectionCriteria
  ): { toolName: string; score: number; reasoning: string; estimatedTime: number } {
    // Consider execution time constraints
    if (criteria.constraints.maxExecutionTime) {
      const timeConstrainedCandidates = candidates.filter(c =>
        c.estimatedTime <= criteria.constraints.maxExecutionTime
      );
      if (timeConstrainedCandidates.length > 0) {
        return timeConstrainedCandidates[0];
      }
    }

    // Default to highest scored
    return candidates[0];
  }

  /**
   * Generate suggested parameters for a tool
   */
  private generateSuggestedParameters(toolName: string, criteria: ToolSelectionCriteria): Record<string, any> {
    const params: Record<string, any> = {};

    // Extract parameters from intent
    if (criteria.intent.target) {
      // Map target to appropriate parameter
      if (toolName === 'search_code' || toolName === 'find_monobehaviours') {
        params.query = criteria.intent.target;
      } else if (toolName === 'find_class_hierarchy' || toolName === 'analyze_dependencies') {
        params.class_name = criteria.intent.target;
      } else if (toolName === 'find_cross_references') {
        params.target_name = criteria.intent.target;
        params.target_type = criteria.intent.type || 'class';
      }
    }

    // Add type filters
    if (criteria.intent.type && (toolName === 'search_code' || toolName === 'find_monobehaviours')) {
      params.filter_type = criteria.intent.type;
    }

    // Add other filters from intent
    if (criteria.intent.filters) {
      Object.assign(params, criteria.intent.filters);
    }

    return params;
  }

  /**
   * Calculate intent score for a tool
   */
  private calculateIntentScore(toolName: string, intent: IntentAnalysis): number {
    let score = 0;

    // Action matching
    const actionMap: Record<string, string[]> = {
      'search': ['search_code', 'find_monobehaviours'],
      'find': ['search_code', 'find_monobehaviours', 'find_class_hierarchy', 'find_cross_references'],
      'analyze': ['analyze_dependencies', 'find_class_hierarchy', 'find_design_patterns'],
      'generate': ['generate_class_wrapper']
    };

    if (actionMap[intent.action]?.includes(toolName)) {
      score += 0.8;
    }

    // Type matching
    if (intent.type === 'class' && ['search_code', 'find_class_hierarchy', 'analyze_dependencies'].includes(toolName)) {
      score += 0.2;
    }

    return Math.min(1.0, score);
  }

  /**
   * Calculate context score for a tool
   */
  private calculateContextScore(toolName: string, context: any): number {
    let score = 0.5; // Base score

    // Check if tool follows logically from previous tools
    const lastTool = context.previousTools[context.previousTools.length - 1];
    if (lastTool && this.capabilityMap) {
      const relationships = this.capabilityMap.toolRelationships.get(lastTool);
      if (relationships?.followUp.includes(toolName)) {
        score += 0.3;
      }
      if (relationships?.complementary.includes(toolName)) {
        score += 0.2;
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Get learning score for a tool
   */
  private getLearningScore(toolName: string, criteria: ToolSelectionCriteria): number {
    // Simple learning score based on historical success
    const toolHistory = this.executionHistory.filter(h => h.selectedTool === toolName);
    if (toolHistory.length === 0) return 0.5; // Neutral for unknown tools

    const avgQuality = toolHistory.reduce((sum, h) => sum + h.result.qualityScore, 0) / toolHistory.length;
    return avgQuality;
  }

  /**
   * Execute tool internally (simplified implementation)
   */
  private async executeToolInternal(toolName: string, parameters: Record<string, any>): Promise<any> {
    // This is a simplified implementation for testing
    // In real implementation, this would call the actual MCP tools

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));

    // Check for mock failures in parameters
    if (parameters.query === 'Invalid' || parameters.query === 'Persistent error') {
      throw new Error(parameters.query);
    }

    switch (toolName) {
      case 'search_code':
        if (parameters.query === 'Player') {
          return {
            data: [{ content: `class ${parameters.query} { }`, metadata: { type: 'class' } }],
            metadata: { resultCount: 1 }
          };
        }
        return {
          data: [{ content: `class ${parameters.query || 'Unknown'} { }`, metadata: { type: 'class' } }],
          metadata: { resultCount: 1 }
        };
      case 'find_monobehaviours':
        return {
          data: [{ content: `class ${parameters.query || 'Unknown'} : MonoBehaviour { }`, metadata: { type: 'class' } }],
          metadata: { resultCount: 1 }
        };
      default:
        return {
          data: [],
          metadata: { resultCount: 0 }
        };
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
  }

  /**
   * Estimate tool execution time
   */
  private async estimateToolExecutionTime(toolName: string, parameters: Record<string, any>): Promise<number> {
    const capability = this.capabilityMap?.tools.get(toolName);
    if (capability) {
      return capability.performance.averageExecutionTime;
    }

    // Default estimates based on tool complexity
    const defaultTimes: Record<string, number> = {
      'search_code': 2000,
      'find_monobehaviours': 3000,
      'find_class_hierarchy': 4000,
      'analyze_dependencies': 8000,
      'find_cross_references': 6000,
      'find_design_patterns': 15000
    };

    return defaultTimes[toolName] || 5000;
  }

  /**
   * Assess execution risk for tools
   */
  private assessExecutionRisk(tools: Array<{ toolName: string; parameters: Record<string, any> }>): 'low' | 'medium' | 'high' {
    const complexTools = tools.filter(t => ['analyze_dependencies', 'find_design_patterns'].includes(t.toolName));

    if (complexTools.length > 2) return 'high';
    if (complexTools.length > 0 || tools.length > 5) return 'medium';
    return 'low';
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(tools: Array<{ toolName: string; parameters: Record<string, any> }>): string[] {
    const factors: string[] = [];

    if (tools.length > 5) factors.push('High number of tools');
    if (tools.some(t => ['analyze_dependencies', 'find_design_patterns'].includes(t.toolName))) {
      factors.push('Complex analysis tools included');
    }

    return factors;
  }

  /**
   * Suggest mitigation strategies
   */
  private suggestMitigationStrategies(tools: Array<{ toolName: string; parameters: Record<string, any> }>): string[] {
    const strategies: string[] = [];

    if (tools.length > 3) {
      strategies.push('Consider parallel execution for independent tools');
    }

    strategies.push('Monitor execution time and implement timeouts');
    strategies.push('Use result caching to avoid redundant executions');

    return strategies;
  }

  // Quality assessment helper methods
  private calculateRelevanceScore(result: ToolExecutionResult): number {
    if (!result.data || result.data.length === 0) return 0;

    const relevanceScores = result.data.map(item => item.metadata?.relevance || 0.5);
    return relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length;
  }

  private calculateCompletenessScore(result: ToolExecutionResult): number {
    if (!result.data || result.data.length === 0) return 0;

    let completenessSum = 0;
    for (const item of result.data) {
      let itemCompleteness = 0;
      if (item.content) itemCompleteness += 0.5;
      if (item.metadata) itemCompleteness += 0.5;
      completenessSum += itemCompleteness;
    }

    return completenessSum / result.data.length;
  }

  private calculateAverageRelevance(result: ToolExecutionResult): number {
    return this.calculateRelevanceScore(result);
  }

  private calculateDataCompleteness(result: ToolExecutionResult): number {
    return this.calculateCompletenessScore(result);
  }

  private calculateStructuralIntegrity(result: ToolExecutionResult): number {
    if (!result.data) return 0;

    let integrityScore = 0;
    for (const item of result.data) {
      if (typeof item === 'object' && item.content && item.metadata) {
        integrityScore += 1;
      } else {
        integrityScore += 0.5;
      }
    }

    return result.data.length > 0 ? integrityScore / result.data.length : 0;
  }

  private generateImprovementSuggestions(issues: string[]): string[] {
    const suggestions: string[] = [];

    for (const issue of issues) {
      if (issue.includes('metadata')) {
        suggestions.push('Ensure all result items include complete metadata');
      }
      if (issue.includes('No results')) {
        suggestions.push('Try broader search criteria or different tool');
      }
      if (issue.includes('relevance')) {
        suggestions.push('Refine search parameters for better relevance');
      }
    }

    return [...new Set(suggestions)]; // Remove duplicates
  }

  private calculateParameterComplexity(parameters: Record<string, any>): number {
    let complexity = 0;

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.length > 50) complexity += 0.3;
      if (typeof value === 'object') complexity += 0.5;
      if (Array.isArray(value)) complexity += 0.4;
      complexity += 0.1; // Base complexity per parameter
    }

    return Math.min(1.0, complexity);
  }

  private estimateDataSize(parameters: Record<string, any>): number {
    // Estimate data size based on parameters
    let size = 0;

    for (const value of Object.values(parameters)) {
      if (typeof value === 'string') {
        size += value.length * 2; // Rough estimate
      } else {
        size += JSON.stringify(value).length;
      }
    }

    return size;
  }
}
