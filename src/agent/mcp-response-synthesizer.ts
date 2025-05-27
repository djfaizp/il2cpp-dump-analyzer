/**
 * @fileoverview MCP Response Synthesis and Aggregation Engine
 * Provides intelligent aggregation and synthesis of MCP tool results with
 * context-aware response formatting and quality assessment
 */

import { ToolExecutionContext } from '../mcp/base-tool-handler';
import {
  ResponseSynthesizerConfig,
  SynthesizedResponse,
  AggregatedResponse,
  WorkflowSynthesisResult,
  ResponseQualityAssessment,
  ResultCorrelation,
  SynthesisStrategy,
  ResponseCacheEntry,
  SynthesisStatistics,
  ToolExecutionResult,
  WorkflowExecution
} from './types';

/**
 * Default configuration for the MCP Response Synthesizer
 */
const DEFAULT_CONFIG: ResponseSynthesizerConfig = {
  enableSemanticCorrelation: true,
  maxResponseLength: 10000,
  qualityThreshold: 0.6,
  enableCaching: true,
  cacheConfig: {
    maxEntries: 500,
    ttlMs: 300000, // 5 minutes
    enableSemanticCaching: true
  },
  formatting: {
    includeMetadata: true,
    includeQualityMetrics: false,
    includeCorrelations: true,
    preferredFormat: 'hybrid'
  }
};

/**
 * MCP Response Synthesis and Aggregation Engine
 * Intelligently combines and synthesizes results from multiple MCP tools
 */
export class MCPResponseSynthesizer {
  private context: ToolExecutionContext;
  private config: ResponseSynthesizerConfig;
  private cache: Map<string, ResponseCacheEntry>;
  private statistics: SynthesisStatistics;

  constructor(context: ToolExecutionContext, config: Partial<ResponseSynthesizerConfig> = {}) {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
    this.statistics = this.initializeStatistics();

    if (this.context.logger) {
      this.context.logger.info('MCP Response Synthesizer initialized', {
        config: this.config,
        cacheEnabled: this.config.enableCaching
      });
    }
  }

  /**
   * Synthesize a single tool result into a coherent response
   */
  async synthesizeSingleResult(
    toolResult: ToolExecutionResult,
    toolName: string,
    context?: string
  ): Promise<SynthesizedResponse> {
    const startTime = Date.now();
    this.context.logger.debug('Synthesizing single tool result', { toolName, context });

    try {
      // Check cache first
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey('single', [toolResult], [toolName]);
        const cached = this.getCachedResponse(cacheKey);
        if (cached) {
          this.statistics.cacheStats.hits++;
          return cached as SynthesizedResponse;
        }
        this.statistics.cacheStats.misses++;
      }

      // Validate input
      if (!this.validateToolResult(toolResult)) {
        return this.createErrorResponse('Invalid tool result structure', toolName, startTime);
      }

      // Handle failed tool execution
      if (!toolResult.success) {
        return this.createFailureResponse(toolResult, toolName, startTime);
      }

      // Synthesize content
      const synthesizedContent = this.synthesizeContent([toolResult], [toolName], 'single');

      // Assess quality
      const qualityAssessment = this.assessResultQuality(toolResult, context || '');

      // Create response
      const response: SynthesizedResponse = {
        success: true,
        synthesizedContent,
        qualityAssessment,
        metadata: {
          originalToolName: toolName,
          synthesisTimestamp: Date.now(),
          synthesisTime: Date.now() - startTime,
          resultCount: toolResult.data?.length || 0,
          contentLength: synthesizedContent.length
        },
        issues: qualityAssessment.issues,
        suggestions: qualityAssessment.suggestions
      };

      // Cache the response
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey('single', [toolResult], [toolName]);
        this.cacheResponse(cacheKey, response, [toolName]);
      }

      // Update statistics
      this.updateStatistics(response, Date.now() - startTime);

      this.context.logger.debug('Single tool result synthesized successfully', {
        toolName,
        qualityScore: qualityAssessment.qualityScore,
        contentLength: synthesizedContent.length
      });

      return response;

    } catch (error) {
      this.context.logger.error('Single tool synthesis failed', { error, toolName });
      return this.createErrorResponse(
        `Synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        toolName,
        startTime
      );
    }
  }

  /**
   * Aggregate results from multiple tools into a unified response
   */
  async aggregateMultipleResults(
    toolResults: ToolExecutionResult[],
    toolNames: string[],
    originalRequest: string
  ): Promise<AggregatedResponse> {
    const startTime = Date.now();
    this.context.logger.debug('Aggregating multiple tool results', {
      toolCount: toolResults.length,
      toolNames,
      originalRequest
    });

    try {
      // Check cache first
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey('multiple', toolResults, toolNames);
        const cached = this.getCachedResponse(cacheKey);
        if (cached) {
          this.statistics.cacheStats.hits++;
          return cached as AggregatedResponse;
        }
        this.statistics.cacheStats.misses++;
      }

      // Validate inputs
      const validResults = toolResults.filter(result => this.validateToolResult(result));
      if (validResults.length === 0) {
        return this.createAggregationErrorResponse('No valid tool results to aggregate', toolNames, startTime);
      }

      // Find correlations between results
      const correlations = this.config.enableSemanticCorrelation
        ? this.findResultCorrelations(validResults, toolNames)
        : [];

      // Synthesize aggregated content
      const synthesizedContent = this.synthesizeContent(validResults, toolNames, 'aggregated', correlations);

      // Assess overall quality
      const qualityAssessment = this.assessAggregatedQuality(validResults, originalRequest, correlations);

      // Create aggregation summary
      const successfulTools = validResults.filter(r => r.success).length;
      const failedTools = toolResults.length - successfulTools;

      const response: AggregatedResponse = {
        success: successfulTools > 0,
        synthesizedContent,
        correlations,
        qualityAssessment,
        aggregationSummary: {
          totalTools: toolResults.length,
          successfulTools,
          failedTools,
          correlationsFound: correlations.length,
          synthesisStrategy: this.determineSynthesisStrategy(validResults, correlations)
        },
        metadata: {
          toolNames,
          aggregationTimestamp: Date.now(),
          aggregationTime: Date.now() - startTime,
          totalResultCount: validResults.reduce((sum, r) => sum + (r.data?.length || 0), 0),
          contentLength: synthesizedContent.length
        },
        issues: qualityAssessment.issues,
        suggestions: qualityAssessment.suggestions
      };

      // Cache the response
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey('multiple', toolResults, toolNames);
        this.cacheResponse(cacheKey, response, toolNames);
      }

      // Update statistics
      this.updateStatistics(response, Date.now() - startTime);

      this.context.logger.info('Multiple tool results aggregated successfully', {
        toolCount: toolResults.length,
        correlationsFound: correlations.length,
        qualityScore: qualityAssessment.qualityScore
      });

      return response;

    } catch (error) {
      this.context.logger.error('Multiple tool aggregation failed', { error, toolNames });
      return this.createAggregationErrorResponse(
        `Aggregation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        toolNames,
        startTime
      );
    }
  }

  /**
   * Synthesize complete workflow execution results
   */
  async synthesizeWorkflowResults(
    workflowExecution: WorkflowExecution,
    originalRequest: string
  ): Promise<WorkflowSynthesisResult> {
    const startTime = Date.now();
    this.context.logger.debug('Synthesizing workflow results', {
      originalRequest,
      resultCount: workflowExecution.results.length,
      workflowSuccess: workflowExecution.success
    });

    try {
      // Extract tool names from results
      const toolNames = workflowExecution.results.map(r => r.metadata?.toolName || 'unknown');

      // Check cache first
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey('workflow', workflowExecution.results, toolNames);
        const cached = this.getCachedResponse(cacheKey);
        if (cached) {
          this.statistics.cacheStats.hits++;
          return cached as WorkflowSynthesisResult;
        }
        this.statistics.cacheStats.misses++;
      }

      // Filter valid results
      const validResults = workflowExecution.results.filter(result => this.validateToolResult(result));

      // Find correlations across workflow results
      const correlations = this.config.enableSemanticCorrelation
        ? this.findResultCorrelations(validResults, toolNames)
        : [];

      // Synthesize workflow content
      const synthesizedContent = this.synthesizeWorkflowContent(
        workflowExecution,
        validResults,
        toolNames,
        correlations,
        originalRequest
      );

      // Assess workflow quality
      const qualityAssessment = this.assessWorkflowQuality(
        workflowExecution,
        validResults,
        originalRequest,
        correlations
      );

      // Create workflow summary
      const successfulTools = validResults.filter(r => r.success).length;
      const failedTools = workflowExecution.results.length - successfulTools;

      const response: WorkflowSynthesisResult = {
        success: workflowExecution.success && successfulTools > 0,
        synthesizedContent,
        correlations,
        qualityAssessment,
        workflowSummary: {
          totalTools: workflowExecution.results.length,
          successfulTools,
          failedTools,
          executionTime: workflowExecution.executionTime,
          retryCount: workflowExecution.retryCount,
          correlationsFound: correlations.length
        },
        metadata: {
          originalRequest,
          toolNames,
          synthesisTimestamp: Date.now(),
          synthesisTime: Date.now() - startTime,
          totalResultCount: validResults.reduce((sum, r) => sum + (r.data?.length || 0), 0),
          contentLength: synthesizedContent.length
        },
        issues: qualityAssessment.issues,
        suggestions: qualityAssessment.suggestions
      };

      // Cache the response
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey('workflow', workflowExecution.results, toolNames);
        this.cacheResponse(cacheKey, response, toolNames);
      }

      // Update statistics
      this.updateStatistics(response, Date.now() - startTime);

      this.context.logger.info('Workflow results synthesized successfully', {
        originalRequest,
        correlationsFound: correlations.length,
        qualityScore: qualityAssessment.qualityScore,
        workflowSuccess: response.success
      });

      return response;

    } catch (error) {
      this.context.logger.error('Workflow synthesis failed', { error, originalRequest });
      return this.createWorkflowErrorResponse(
        workflowExecution,
        `Workflow synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        originalRequest,
        startTime
      );
    }
  }

  /**
   * Assess the quality of a tool result
   */
  assessResultQuality(toolResult: ToolExecutionResult, context: string): ResponseQualityAssessment {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check basic validity
    if (!toolResult.success) {
      issues.push('Tool execution failed');
      suggestions.push('Retry the operation or use alternative tools');
    }

    // Check data availability
    if (!toolResult.data || toolResult.data.length === 0) {
      issues.push('No results found');
      suggestions.push('Try broader search criteria or different parameters');
    }

    // Calculate quality scores
    const relevanceScore = this.calculateRelevanceScore(toolResult, context);
    const completenessScore = this.calculateCompletenessScore(toolResult);
    const coherenceScore = this.calculateCoherenceScore(toolResult);

    const qualityScore = (relevanceScore + completenessScore + coherenceScore) / 3;
    const overallQuality = Math.max(0, qualityScore);

    return {
      isValid: toolResult.success && (toolResult.data?.length || 0) > 0,
      qualityScore,
      relevanceScore,
      completenessScore,
      coherenceScore,
      overallQuality,
      issues,
      suggestions,
      metrics: {
        informationDensity: this.calculateInformationDensity(toolResult),
        structuralIntegrity: this.calculateStructuralIntegrity(toolResult),
        semanticConsistency: this.calculateSemanticConsistency(toolResult),
        factualAccuracy: this.calculateFactualAccuracy(toolResult)
      }
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): SynthesisStatistics['cacheStats'] {
    return {
      ...this.statistics.cacheStats,
      totalEntries: this.cache.size,
      memoryUsage: this.calculateCacheMemoryUsage()
    };
  }

  /**
   * Get synthesis statistics
   */
  getStatistics(): SynthesisStatistics {
    return {
      ...this.statistics,
      cacheStats: this.getCacheStats()
    };
  }

  /**
   * Clear cache and reset statistics
   */
  reset(): void {
    this.cache.clear();
    this.statistics = this.initializeStatistics();
    this.context.logger.info('MCP Response Synthesizer reset');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Initialize synthesis statistics
   */
  private initializeStatistics(): SynthesisStatistics {
    return {
      totalSyntheses: 0,
      successfulSyntheses: 0,
      averageSynthesisTime: 0,
      averageQualityScore: 0,
      cacheStats: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        totalEntries: 0,
        memoryUsage: 0
      },
      correlationStats: {
        totalCorrelations: 0,
        averageCorrelationStrength: 0,
        correlationsByType: {}
      },
      qualityStats: {
        averageRelevance: 0,
        averageCompleteness: 0,
        averageCoherence: 0,
        commonIssues: []
      }
    };
  }

  /**
   * Validate tool result structure
   */
  private validateToolResult(toolResult: ToolExecutionResult): boolean {
    if (!toolResult || typeof toolResult !== 'object') {
      return false;
    }

    if (!('success' in toolResult)) {
      return false;
    }

    // Check for malformed data
    if (toolResult.success && toolResult.data === null) {
      return false;
    }

    return true;
  }

  /**
   * Generate cache key for results
   */
  private generateCacheKey(type: string, results: ToolExecutionResult[], toolNames: string[]): string {
    const resultHashes = results.map(r => this.hashObject(r)).join('|');
    return `${type}:${toolNames.join(',')}:${resultHashes}`;
  }

  /**
   * Get cached response if available and valid
   */
  private getCachedResponse(cacheKey: string): SynthesizedResponse | AggregatedResponse | WorkflowSynthesisResult | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    // Check TTL
    if (Date.now() > entry.metadata.createdAt + entry.metadata.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }

    // Update access metadata
    entry.metadata.lastAccessedAt = Date.now();
    entry.metadata.accessCount++;

    return entry.response;
  }

  /**
   * Cache a synthesized response
   */
  private cacheResponse(
    cacheKey: string,
    response: SynthesizedResponse | AggregatedResponse | WorkflowSynthesisResult,
    toolNames: string[]
  ): void {
    // Check cache size limit
    if (this.cache.size >= this.config.cacheConfig.maxEntries) {
      this.evictOldestCacheEntry();
    }

    const entry: ResponseCacheEntry = {
      key: cacheKey,
      response,
      metadata: {
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 1,
        ttl: this.config.cacheConfig.ttlMs,
        size: JSON.stringify(response).length
      },
      semanticTags: this.extractSemanticTags(response),
      inputHash: this.hashObject({ toolNames, response })
    };

    this.cache.set(cacheKey, entry);
  }

  /**
   * Evict oldest cache entry
   */
  private evictOldestCacheEntry(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.metadata.lastAccessedAt < oldestTime) {
        oldestTime = entry.metadata.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Extract semantic tags from response for correlation
   */
  private extractSemanticTags(response: SynthesizedResponse | AggregatedResponse | WorkflowSynthesisResult): string[] {
    const tags: string[] = [];
    const content = response.synthesizedContent.toLowerCase();

    // Extract common IL2CPP entities
    const entityPatterns = [
      /\bclass\s+(\w+)/g,
      /\binterface\s+(\w+)/g,
      /\benum\s+(\w+)/g,
      /\bnamespace\s+([\w.]+)/g,
      /\bmonobehaviour\b/g
    ];

    entityPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        tags.push(...matches.map(match => match.toLowerCase()));
      }
    });

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Calculate cache memory usage
   */
  private calculateCacheMemoryUsage(): number {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.metadata.size;
    }
    return totalSize;
  }

  /**
   * Hash object for cache key generation
   */
  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Create error response for single tool synthesis
   */
  private createErrorResponse(error: string, toolName: string, startTime: number): SynthesizedResponse {
    return {
      success: false,
      synthesizedContent: `Tool synthesis failed: ${error}`,
      qualityAssessment: {
        isValid: false,
        qualityScore: 0,
        relevanceScore: 0,
        completenessScore: 0,
        coherenceScore: 0,
        overallQuality: 0,
        issues: [error],
        suggestions: ['Check tool parameters and try again'],
        metrics: {
          informationDensity: 0,
          structuralIntegrity: 0,
          semanticConsistency: 0,
          factualAccuracy: 0
        }
      },
      metadata: {
        originalToolName: toolName,
        synthesisTimestamp: Date.now(),
        synthesisTime: Date.now() - startTime,
        resultCount: 0,
        contentLength: 0
      },
      issues: [error],
      suggestions: ['Check tool parameters and try again']
    };
  }

  /**
   * Create failure response for failed tool execution
   */
  private createFailureResponse(toolResult: ToolExecutionResult, toolName: string, startTime: number): SynthesizedResponse {
    const errorMessage = toolResult.error || 'Tool execution failed';
    return {
      success: false,
      synthesizedContent: `Tool execution failed: ${errorMessage}`,
      qualityAssessment: {
        isValid: false,
        qualityScore: 0,
        relevanceScore: 0,
        completenessScore: 0,
        coherenceScore: 0,
        overallQuality: 0,
        issues: [errorMessage],
        suggestions: ['Retry with different parameters', 'Check tool availability'],
        metrics: {
          informationDensity: 0,
          structuralIntegrity: 0,
          semanticConsistency: 0,
          factualAccuracy: 0
        }
      },
      metadata: {
        originalToolName: toolName,
        synthesisTimestamp: Date.now(),
        synthesisTime: Date.now() - startTime,
        resultCount: 0,
        contentLength: 0
      },
      issues: [errorMessage],
      suggestions: ['Retry with different parameters', 'Check tool availability']
    };
  }

  /**
   * Synthesize content from tool results
   */
  private synthesizeContent(
    toolResults: ToolExecutionResult[],
    toolNames: string[],
    synthesisType: 'single' | 'aggregated' | 'workflow',
    correlations?: ResultCorrelation[]
  ): string {
    if (toolResults.length === 0) {
      return 'No results found for the requested analysis.';
    }

    const sections: string[] = [];

    // Add summary section
    if (synthesisType !== 'single') {
      sections.push(this.createSummarySection(toolResults, toolNames));
    }

    // Add results from each tool
    toolResults.forEach((result, index) => {
      if (result.success && result.data && result.data.length > 0) {
        const toolName = toolNames[index] || 'unknown';
        sections.push(this.createToolResultSection(result, toolName));
      }
    });

    // Add correlations section if available
    if (correlations && correlations.length > 0) {
      sections.push(this.createCorrelationsSection(correlations));
    }

    // Handle empty results
    if (sections.length === 0) {
      return 'No results found for the requested analysis.';
    }

    return sections.join('\n\n');
  }

  /**
   * Create summary section for multiple results
   */
  private createSummarySection(toolResults: ToolExecutionResult[], toolNames: string[]): string {
    const successfulTools = toolResults.filter(r => r.success).length;
    const totalResults = toolResults.reduce((sum, r) => sum + (r.data?.length || 0), 0);

    return `## Analysis Summary\n\n` +
           `- **Tools executed**: ${toolNames.join(', ')}\n` +
           `- **Successful tools**: ${successfulTools}/${toolResults.length}\n` +
           `- **Total results found**: ${totalResults}`;
  }

  /**
   * Create section for individual tool result
   */
  private createToolResultSection(result: ToolExecutionResult, toolName: string): string {
    const sections: string[] = [];

    // Tool header
    sections.push(`### ${this.formatToolName(toolName)} Results`);

    // Add result count
    const resultCount = result.data?.length || 0;
    sections.push(`Found ${resultCount} result${resultCount !== 1 ? 's' : ''}`);

    // Add results
    if (result.data && result.data.length > 0) {
      result.data.forEach((item, index) => {
        sections.push(this.formatResultItem(item, index + 1, toolName));
      });
    }

    return sections.join('\n\n');
  }

  /**
   * Format individual result item
   */
  private formatResultItem(item: any, index: number, toolName: string): string {
    if (!item) return `${index}. No data available`;

    // Handle different result types based on tool
    if (toolName.includes('search') || toolName.includes('find')) {
      return this.formatSearchResult(item, index);
    } else if (toolName.includes('generate')) {
      return this.formatGenerationResult(item, index);
    } else if (toolName.includes('analyze')) {
      return this.formatAnalysisResult(item, index);
    }

    // Default formatting
    return `${index}. ${item.content || JSON.stringify(item, null, 2)}`;
  }

  /**
   * Format search result item
   */
  private formatSearchResult(item: any, index: number): string {
    const name = item.metadata?.name || item.name || 'Unknown';
    const type = item.metadata?.type || item.type || 'unknown';
    const namespace = item.metadata?.namespace || item.namespace || '';

    let result = `${index}. **${name}** (${type})`;
    if (namespace) {
      result += ` - Namespace: ${namespace}`;
    }

    if (item.content) {
      const preview = item.content.length > 100
        ? item.content.substring(0, 100) + '...'
        : item.content;
      result += `\n   \`\`\`csharp\n   ${preview}\n   \`\`\``;
    }

    return result;
  }

  /**
   * Format generation result item
   */
  private formatGenerationResult(item: any, index: number): string {
    if (item.generatedCode) {
      const preview = item.generatedCode.length > 200
        ? item.generatedCode.substring(0, 200) + '...'
        : item.generatedCode;
      return `${index}. Generated Code:\n\`\`\`csharp\n${preview}\n\`\`\``;
    }
    return `${index}. ${item.content || 'Generated content'}`;
  }

  /**
   * Format analysis result item
   */
  private formatAnalysisResult(item: any, index: number): string {
    if (item.metadata) {
      const details = Object.entries(item.metadata)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n');
      return `${index}. Analysis Result:\n${details}`;
    }
    return `${index}. ${item.content || 'Analysis data'}`;
  }

  /**
   * Create correlations section
   */
  private createCorrelationsSection(correlations: ResultCorrelation[]): string {
    const sections: string[] = ['## Correlations Found'];

    correlations.forEach((correlation, index) => {
      sections.push(
        `${index + 1}. **${correlation.correlationType}** (Strength: ${(correlation.strength * 100).toFixed(1)}%)\n` +
        `   - Entities: ${correlation.entities.join(', ')}\n` +
        `   - Description: ${correlation.description}`
      );
    });

    return sections.join('\n\n');
  }

  /**
   * Format tool name for display
   */
  private formatToolName(toolName: string): string {
    return toolName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Find correlations between tool results
   */
  private findResultCorrelations(toolResults: ToolExecutionResult[], toolNames: string[]): ResultCorrelation[] {
    const correlations: ResultCorrelation[] = [];

    // Find entity relationships
    for (let i = 0; i < toolResults.length; i++) {
      for (let j = i + 1; j < toolResults.length; j++) {
        const correlation = this.findEntityCorrelation(
          toolResults[i], toolNames[i],
          toolResults[j], toolNames[j]
        );
        if (correlation) {
          correlations.push(correlation);
        }
      }
    }

    return correlations;
  }

  /**
   * Find correlation between two tool results
   */
  private findEntityCorrelation(
    result1: ToolExecutionResult, tool1: string,
    result2: ToolExecutionResult, tool2: string
  ): ResultCorrelation | null {
    if (!result1.success || !result2.success || !result1.data || !result2.data) {
      return null;
    }

    // Extract entity names from both results
    const entities1 = this.extractEntityNames(result1);
    const entities2 = this.extractEntityNames(result2);

    // Find common entities
    const commonEntities = entities1.filter(e => entities2.includes(e));

    if (commonEntities.length > 0) {
      return {
        id: `correlation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        correlationType: 'entity_relationship',
        entities: commonEntities,
        sourceTools: [tool1, tool2],
        strength: commonEntities.length / Math.max(entities1.length, entities2.length),
        confidence: 0.8,
        description: `Found ${commonEntities.length} common entities between ${tool1} and ${tool2}`,
        evidence: commonEntities.map(entity => ({
          source: `${tool1} + ${tool2}`,
          content: `Entity "${entity}" found in both results`,
          relevance: 0.9
        }))
      };
    }

    return null;
  }

  /**
   * Extract entity names from tool result
   */
  private extractEntityNames(result: ToolExecutionResult): string[] {
    const entities: string[] = [];

    if (result.data) {
      result.data.forEach(item => {
        if (item.metadata?.name) {
          entities.push(item.metadata.name);
        }
        if (item.name) {
          entities.push(item.name);
        }
        if (item.metadata?.className) {
          entities.push(item.metadata.className);
        }
        if (item.className) {
          entities.push(item.className);
        }
        // Extract from content using regex
        if (item.content) {
          const classMatches = item.content.match(/class\s+(\w+)/g);
          if (classMatches) {
            classMatches.forEach((match: string) => {
              const className = match.replace('class ', '');
              entities.push(className);
            });
          }
        }
      });
    }

    return [...new Set(entities)]; // Remove duplicates
  }

  /**
   * Calculate relevance score for tool result
   */
  private calculateRelevanceScore(toolResult: ToolExecutionResult, context: string): number {
    if (!toolResult.success || !toolResult.data) return 0;

    let relevanceScore = 0.5; // Base score

    // Check if results contain context keywords
    const contextKeywords = context.toLowerCase().split(/\s+/);
    const resultContent = JSON.stringify(toolResult.data).toLowerCase();

    const matchingKeywords = contextKeywords.filter(keyword =>
      keyword.length > 2 && resultContent.includes(keyword)
    );

    relevanceScore += (matchingKeywords.length / Math.max(contextKeywords.length, 1)) * 0.3;

    // Check result count
    const resultCount = toolResult.data.length;
    if (resultCount > 0) {
      relevanceScore += Math.min(resultCount / 10, 0.2); // Up to 0.2 bonus for multiple results
    }

    return Math.min(relevanceScore, 1.0);
  }

  /**
   * Calculate completeness score for tool result
   */
  private calculateCompletenessScore(toolResult: ToolExecutionResult): number {
    if (!toolResult.success) return 0;
    if (!toolResult.data || toolResult.data.length === 0) return 0;

    let completenessScore = 0.3; // Base score for having data

    // Check data richness
    const hasMetadata = toolResult.data.some(item => item.metadata && Object.keys(item.metadata).length > 0);
    if (hasMetadata) completenessScore += 0.3;

    const hasContent = toolResult.data.some(item => item.content && item.content.length > 0);
    if (hasContent) completenessScore += 0.4;

    return Math.min(completenessScore, 1.0);
  }

  /**
   * Calculate coherence score for tool result
   */
  private calculateCoherenceScore(toolResult: ToolExecutionResult): number {
    if (!toolResult.success || !toolResult.data) return 0;

    let coherenceScore = 0.5; // Base score

    // Check structural consistency
    const hasConsistentStructure = toolResult.data.every(item =>
      typeof item === 'object' && (item.content || item.metadata)
    );
    if (hasConsistentStructure) coherenceScore += 0.3;

    // Check for error indicators
    const hasErrors = toolResult.data.some(item =>
      JSON.stringify(item).toLowerCase().includes('error')
    );
    if (!hasErrors) coherenceScore += 0.2;

    return Math.min(coherenceScore, 1.0);
  }

  /**
   * Calculate information density
   */
  private calculateInformationDensity(toolResult: ToolExecutionResult): number {
    if (!toolResult.success || !toolResult.data) return 0;

    const totalContent = toolResult.data.reduce((sum, item) => {
      const contentLength = (item.content || '').length;
      const metadataSize = Object.keys(item.metadata || {}).length;
      return sum + contentLength + metadataSize * 10;
    }, 0);

    return Math.min(totalContent / 1000, 1.0); // Normalize to 0-1
  }

  /**
   * Calculate structural integrity
   */
  private calculateStructuralIntegrity(toolResult: ToolExecutionResult): number {
    if (!toolResult.success || !toolResult.data) return 0;

    const validItems = toolResult.data.filter(item =>
      item && typeof item === 'object' && (item.content || item.metadata)
    );

    return validItems.length / Math.max(toolResult.data.length, 1);
  }

  /**
   * Calculate semantic consistency
   */
  private calculateSemanticConsistency(toolResult: ToolExecutionResult): number {
    if (!toolResult.success || !toolResult.data) return 0;

    // Check if all results are of similar type
    const types = toolResult.data.map(item => item.metadata?.type || 'unknown');
    const uniqueTypes = [...new Set(types)];

    // More consistent if fewer unique types
    return Math.max(0, 1 - (uniqueTypes.length - 1) * 0.2);
  }

  /**
   * Calculate factual accuracy (basic heuristics)
   */
  private calculateFactualAccuracy(toolResult: ToolExecutionResult): number {
    if (!toolResult.success || !toolResult.data) return 0;

    let accuracyScore = 0.7; // Base assumption of accuracy

    // Check for common error patterns
    const resultText = JSON.stringify(toolResult.data).toLowerCase();
    const errorPatterns = ['undefined', 'null', 'error', 'failed', 'invalid'];

    const errorCount = errorPatterns.reduce((count, pattern) => {
      return count + (resultText.match(new RegExp(pattern, 'g')) || []).length;
    }, 0);

    accuracyScore -= errorCount * 0.1;

    return Math.max(0, Math.min(accuracyScore, 1.0));
  }

  /**
   * Assess quality of aggregated results
   */
  private assessAggregatedQuality(
    toolResults: ToolExecutionResult[],
    originalRequest: string,
    correlations: ResultCorrelation[]
  ): ResponseQualityAssessment {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Calculate individual scores
    const relevanceScores = toolResults.map(r => this.calculateRelevanceScore(r, originalRequest));
    const completenessScores = toolResults.map(r => this.calculateCompletenessScore(r));
    const coherenceScores = toolResults.map(r => this.calculateCoherenceScore(r));

    const relevanceScore = relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length;
    const completenessScore = completenessScores.reduce((sum, score) => sum + score, 0) / completenessScores.length;
    const coherenceScore = coherenceScores.reduce((sum, score) => sum + score, 0) / coherenceScores.length;

    // Bonus for correlations
    const correlationBonus = Math.min(correlations.length * 0.1, 0.3);
    const qualityScore = (relevanceScore + completenessScore + coherenceScore) / 3 + correlationBonus;

    // Check for issues
    const failedTools = toolResults.filter(r => !r.success).length;
    if (failedTools > 0) {
      issues.push(`${failedTools} tool(s) failed to execute`);
      suggestions.push('Retry failed tools with different parameters');
    }

    const emptyResults = toolResults.filter(r => !r.data || r.data.length === 0).length;
    if (emptyResults > 0) {
      issues.push(`${emptyResults} tool(s) returned no results`);
      suggestions.push('Try broader search criteria or alternative tools');
    }

    return {
      isValid: qualityScore > 0.3 && failedTools < toolResults.length,
      qualityScore: Math.max(0, qualityScore),
      relevanceScore,
      completenessScore,
      coherenceScore,
      overallQuality: Math.max(0, qualityScore),
      issues,
      suggestions,
      metrics: {
        informationDensity: toolResults.reduce((sum, r) => sum + this.calculateInformationDensity(r), 0) / toolResults.length,
        structuralIntegrity: toolResults.reduce((sum, r) => sum + this.calculateStructuralIntegrity(r), 0) / toolResults.length,
        semanticConsistency: toolResults.reduce((sum, r) => sum + this.calculateSemanticConsistency(r), 0) / toolResults.length,
        factualAccuracy: toolResults.reduce((sum, r) => sum + this.calculateFactualAccuracy(r), 0) / toolResults.length
      }
    };
  }

  /**
   * Synthesize workflow content with execution context
   */
  private synthesizeWorkflowContent(
    workflowExecution: WorkflowExecution,
    validResults: ToolExecutionResult[],
    toolNames: string[],
    correlations: ResultCorrelation[],
    originalRequest: string
  ): string {
    const sections: string[] = [];

    // Add workflow summary
    sections.push(this.createWorkflowSummary(workflowExecution, originalRequest));

    // Add synthesized content from valid results
    if (validResults.length > 0) {
      const synthesizedContent = this.synthesizeContent(validResults, toolNames, 'workflow', correlations);
      sections.push(synthesizedContent);
    }

    // Add workflow execution details
    if (workflowExecution.executionTime > 0 || workflowExecution.retryCount > 0) {
      sections.push(this.createExecutionDetailsSection(workflowExecution));
    }

    // Handle partial failures
    if (!workflowExecution.success) {
      sections.push(this.createPartialFailureSection(workflowExecution));
    }

    return sections.join('\n\n');
  }

  /**
   * Create workflow summary section
   */
  private createWorkflowSummary(workflowExecution: WorkflowExecution, originalRequest: string): string {
    const successfulTools = workflowExecution.results.filter(r => r.success).length;
    const totalTools = workflowExecution.results.length;

    return `## Workflow Analysis Results\n\n` +
           `**Original Request**: ${originalRequest}\n\n` +
           `**Execution Status**: ${workflowExecution.success ? 'Completed' : 'Partial completion'}\n` +
           `**Tools Executed**: ${successfulTools}/${totalTools} successful\n` +
           `**Execution Time**: ${workflowExecution.executionTime}ms\n` +
           `**Retry Count**: ${workflowExecution.retryCount}`;
  }

  /**
   * Create execution details section
   */
  private createExecutionDetailsSection(workflowExecution: WorkflowExecution): string {
    const sections: string[] = ['## Execution Details'];

    if (workflowExecution.metrics) {
      sections.push(
        `- **Tools Executed**: ${workflowExecution.metrics.toolsExecuted}\n` +
        `- **Successful Executions**: ${workflowExecution.metrics.successfulExecutions}\n` +
        `- **Failed Executions**: ${workflowExecution.metrics.failedExecutions}\n` +
        `- **Average Execution Time**: ${workflowExecution.metrics.averageExecutionTime}ms`
      );

      if (workflowExecution.metrics.cacheHitRate !== undefined) {
        sections.push(`- **Cache Hit Rate**: ${(workflowExecution.metrics.cacheHitRate * 100).toFixed(1)}%`);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Create partial failure section
   */
  private createPartialFailureSection(workflowExecution: WorkflowExecution): string {
    const sections: string[] = ['## Partial Results'];

    if (workflowExecution.error) {
      sections.push(`**Error**: ${workflowExecution.error}`);
    }

    const failedResults = workflowExecution.results.filter(r => !r.success);
    if (failedResults.length > 0) {
      sections.push(`**Failed Tools**: ${failedResults.length}`);
      failedResults.forEach((result, index) => {
        if (result.error) {
          sections.push(`${index + 1}. ${result.error}`);
        }
      });
    }

    sections.push('**Note**: The above results represent partial completion of the requested analysis.');

    return sections.join('\n\n');
  }

  /**
   * Assess workflow quality
   */
  private assessWorkflowQuality(
    workflowExecution: WorkflowExecution,
    validResults: ToolExecutionResult[],
    originalRequest: string,
    correlations: ResultCorrelation[]
  ): ResponseQualityAssessment {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Base quality assessment from aggregated results
    const baseQuality = this.assessAggregatedQuality(validResults, originalRequest, correlations);

    // Workflow-specific adjustments
    let workflowQualityScore = baseQuality.qualityScore;

    // Penalize for workflow failure
    if (!workflowExecution.success) {
      workflowQualityScore *= 0.7;
      issues.push('Workflow execution was not fully successful');
      suggestions.push('Review failed tools and retry with adjusted parameters');
    }

    // Penalize for high retry count
    if (workflowExecution.retryCount > 2) {
      workflowQualityScore *= 0.9;
      issues.push('Multiple retry attempts were required');
      suggestions.push('Check tool parameters and system stability');
    }

    // Bonus for efficient execution
    if (workflowExecution.executionTime < 5000 && workflowExecution.retryCount === 0) {
      workflowQualityScore *= 1.1;
    }

    return {
      ...baseQuality,
      qualityScore: Math.min(workflowQualityScore, 1.0),
      overallQuality: Math.min(workflowQualityScore, 1.0),
      issues: [...baseQuality.issues, ...issues],
      suggestions: [...baseQuality.suggestions, ...suggestions]
    };
  }

  /**
   * Determine synthesis strategy based on results and correlations
   */
  private determineSynthesisStrategy(results: ToolExecutionResult[], correlations: ResultCorrelation[]): string {
    if (results.length === 1) return 'single';
    if (correlations.length > 0) return 'integrative';
    if (results.length > 3) return 'structured';
    return 'concatenative';
  }

  /**
   * Create error response for aggregation
   */
  private createAggregationErrorResponse(error: string, toolNames: string[], startTime: number): AggregatedResponse {
    return {
      success: false,
      synthesizedContent: `Aggregation failed: ${error}`,
      correlations: [],
      qualityAssessment: {
        isValid: false,
        qualityScore: 0,
        relevanceScore: 0,
        completenessScore: 0,
        coherenceScore: 0,
        overallQuality: 0,
        issues: [error],
        suggestions: ['Check tool parameters and try again'],
        metrics: {
          informationDensity: 0,
          structuralIntegrity: 0,
          semanticConsistency: 0,
          factualAccuracy: 0
        }
      },
      aggregationSummary: {
        totalTools: toolNames.length,
        successfulTools: 0,
        failedTools: toolNames.length,
        correlationsFound: 0,
        synthesisStrategy: 'error'
      },
      metadata: {
        toolNames,
        aggregationTimestamp: Date.now(),
        aggregationTime: Date.now() - startTime,
        totalResultCount: 0,
        contentLength: 0
      },
      issues: [error],
      suggestions: ['Check tool parameters and try again']
    };
  }

  /**
   * Create error response for workflow synthesis
   */
  private createWorkflowErrorResponse(
    workflowExecution: WorkflowExecution,
    error: string,
    originalRequest: string,
    startTime: number
  ): WorkflowSynthesisResult {
    const toolNames = workflowExecution.results.map(r => r.metadata?.toolName || 'unknown');

    return {
      success: false,
      synthesizedContent: `Workflow synthesis failed: ${error}`,
      correlations: [],
      qualityAssessment: {
        isValid: false,
        qualityScore: 0,
        relevanceScore: 0,
        completenessScore: 0,
        coherenceScore: 0,
        overallQuality: 0,
        issues: [error],
        suggestions: ['Check workflow configuration and try again'],
        metrics: {
          informationDensity: 0,
          structuralIntegrity: 0,
          semanticConsistency: 0,
          factualAccuracy: 0
        }
      },
      workflowSummary: {
        totalTools: workflowExecution.results.length,
        successfulTools: 0,
        failedTools: workflowExecution.results.length,
        executionTime: workflowExecution.executionTime,
        retryCount: workflowExecution.retryCount,
        correlationsFound: 0
      },
      metadata: {
        originalRequest,
        toolNames,
        synthesisTimestamp: Date.now(),
        synthesisTime: Date.now() - startTime,
        totalResultCount: 0,
        contentLength: 0
      },
      issues: [error],
      suggestions: ['Check workflow configuration and try again']
    };
  }

  /**
   * Update synthesis statistics
   */
  private updateStatistics(
    response: SynthesizedResponse | AggregatedResponse | WorkflowSynthesisResult,
    synthesisTime: number
  ): void {
    this.statistics.totalSyntheses++;

    if (response.success) {
      this.statistics.successfulSyntheses++;
    }

    // Update average synthesis time
    this.statistics.averageSynthesisTime =
      (this.statistics.averageSynthesisTime * (this.statistics.totalSyntheses - 1) + synthesisTime) /
      this.statistics.totalSyntheses;

    // Update average quality score
    this.statistics.averageQualityScore =
      (this.statistics.averageQualityScore * (this.statistics.totalSyntheses - 1) + response.qualityAssessment.qualityScore) /
      this.statistics.totalSyntheses;

    // Update cache hit rate
    if (this.statistics.cacheStats.hits + this.statistics.cacheStats.misses > 0) {
      this.statistics.cacheStats.hitRate =
        this.statistics.cacheStats.hits / (this.statistics.cacheStats.hits + this.statistics.cacheStats.misses);
    }

    // Update correlation statistics
    if ('correlations' in response) {
      this.statistics.correlationStats.totalCorrelations += response.correlations.length;

      if (response.correlations.length > 0) {
        const avgStrength = response.correlations.reduce((sum, c) => sum + c.strength, 0) / response.correlations.length;
        this.statistics.correlationStats.averageCorrelationStrength =
          (this.statistics.correlationStats.averageCorrelationStrength + avgStrength) / 2;

        // Update correlation types
        response.correlations.forEach(correlation => {
          this.statistics.correlationStats.correlationsByType[correlation.correlationType] =
            (this.statistics.correlationStats.correlationsByType[correlation.correlationType] || 0) + 1;
        });
      }
    }

    // Update quality statistics
    this.statistics.qualityStats.averageRelevance =
      (this.statistics.qualityStats.averageRelevance + response.qualityAssessment.relevanceScore) / 2;
    this.statistics.qualityStats.averageCompleteness =
      (this.statistics.qualityStats.averageCompleteness + response.qualityAssessment.completenessScore) / 2;
    this.statistics.qualityStats.averageCoherence =
      (this.statistics.qualityStats.averageCoherence + response.qualityAssessment.coherenceScore) / 2;
  }
}
