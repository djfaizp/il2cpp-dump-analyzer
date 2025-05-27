/**
 * @fileoverview Type definitions for the Agentic MCP Enhancement system
 * Defines interfaces and types for intelligent tool orchestration and workflow management
 */

/**
 * Configuration options for the MCP Orchestrator
 */
export interface OrchestratorConfig {
  /** Maximum depth of workflow execution (prevents infinite loops) */
  maxWorkflowDepth: number;

  /** Maximum number of tools that can run in parallel */
  maxParallelTools: number;

  /** Timeout for workflow execution in milliseconds */
  timeoutMs: number;

  /** Enable intelligent caching of tool results */
  enableCaching: boolean;

  /** Number of retry attempts for failed tool executions */
  retryAttempts: number;

  /** Enable adaptive learning from tool usage patterns */
  enableLearning: boolean;

  /** Minimum confidence threshold for tool selection */
  confidenceThreshold?: number;

  /** Enable context preservation across tool calls */
  enableContextPersistence?: boolean;
}

/**
 * Represents a single subtask in a decomposed workflow
 */
export interface SubTask {
  /** Unique identifier for the subtask */
  id: string;

  /** Name of the MCP tool to execute */
  toolName: string;

  /** Parameters to pass to the tool */
  parameters: Record<string, any>;

  /** List of subtask IDs this task depends on */
  dependencies: string[];

  /** Execution priority (1 = highest) */
  priority: number;

  /** Estimated execution time in milliseconds */
  estimatedDuration?: number;

  /** Optional description of what this subtask accomplishes */
  description?: string;
}

/**
 * Complete task decomposition result
 */
export interface TaskDecomposition {
  /** Original user request */
  originalRequest: string;

  /** List of subtasks to execute */
  subtasks: SubTask[];

  /** Execution strategy for the workflow */
  executionStrategy: 'sequential' | 'parallel' | 'hybrid';

  /** Estimated total duration in milliseconds */
  estimatedDuration: number;

  /** Confidence score for the decomposition (0-1) */
  confidence?: number;

  /** Optional explanation of the decomposition strategy */
  explanation?: string;
}

/**
 * Result of executing a single tool
 */
export interface ToolExecutionResult {
  /** Whether the tool execution was successful */
  success: boolean;

  /** Tool output data */
  data: any[];

  /** Execution metadata */
  metadata: Record<string, any>;

  /** Error message if execution failed */
  error?: string;

  /** Execution time in milliseconds */
  executionTime?: number;

  /** Number of retry attempts made */
  retryCount?: number;
}

/**
 * Complete workflow execution result
 */
export interface WorkflowExecution {
  /** Whether the entire workflow was successful */
  success: boolean;

  /** Results from each subtask */
  results: ToolExecutionResult[];

  /** Total execution time in milliseconds */
  executionTime: number;

  /** Number of retry attempts across all tools */
  retryCount: number;

  /** Workflow execution context and state */
  context: Record<string, any>;

  /** Error message if workflow failed */
  error?: string;

  /** Performance metrics */
  metrics?: WorkflowMetrics;
}

/**
 * Performance metrics for workflow execution
 */
export interface WorkflowMetrics {
  /** Total number of tools executed */
  toolsExecuted: number;

  /** Number of successful tool executions */
  successfulExecutions: number;

  /** Number of failed tool executions */
  failedExecutions: number;

  /** Average tool execution time */
  averageExecutionTime: number;

  /** Peak memory usage during execution */
  peakMemoryUsage?: number;

  /** Cache hit rate for tool results */
  cacheHitRate?: number;
}

/**
 * Intent analysis result for natural language requests
 */
export interface IntentAnalysis {
  /** Primary action to perform */
  action: 'search' | 'find' | 'analyze' | 'generate' | 'compare' | 'list';

  /** Target entity or concept */
  target: string;

  /** Type of entity (class, method, enum, etc.) */
  type: string;

  /** Additional filters or constraints */
  filters: Record<string, any>;

  /** Confidence score for the intent analysis (0-1) */
  confidence: number;

  /** Extracted keywords and entities */
  keywords: string[];
}

/**
 * Tool selection criteria and scoring
 */
export interface ToolSelection {
  /** Selected tool name */
  toolName: string;

  /** Confidence score for the selection (0-1) */
  confidence: number;

  /** Reasoning for the tool selection */
  reasoning: string;

  /** Alternative tools considered */
  alternatives: Array<{
    toolName: string;
    score: number;
    reason: string;
  }>;
}

/**
 * Context state for workflow execution
 */
export interface WorkflowContext {
  /** Current execution state */
  state: 'initializing' | 'executing' | 'completed' | 'failed' | 'cancelled';

  /** Results from completed subtasks */
  completedTasks: Record<string, ToolExecutionResult>;

  /** Shared data between subtasks */
  sharedData: Record<string, any>;

  /** Execution start time */
  startTime: number;

  /** Current subtask being executed */
  currentTask?: string;

  /** Error information if workflow failed */
  errorInfo?: {
    taskId: string;
    error: string;
    timestamp: number;
  };
}

/**
 * Caching configuration and state
 */
export interface CacheConfig {
  /** Enable result caching */
  enabled: boolean;

  /** Maximum cache size in MB */
  maxSizeMB: number;

  /** Cache TTL in milliseconds */
  ttlMs: number;

  /** Cache key generation strategy */
  keyStrategy: 'simple' | 'semantic' | 'hybrid';
}

/**
 * Learning and adaptation configuration
 */
export interface LearningConfig {
  /** Enable adaptive learning */
  enabled: boolean;

  /** Learning rate for tool selection optimization */
  learningRate: number;

  /** Minimum samples required for learning */
  minSamples: number;

  /** Enable pattern recognition in user requests */
  enablePatternRecognition: boolean;
}

/**
 * Error recovery strategy
 */
export interface ErrorRecoveryStrategy {
  /** Maximum retry attempts */
  maxRetries: number;

  /** Backoff strategy for retries */
  backoffStrategy: 'linear' | 'exponential' | 'fixed';

  /** Base delay between retries in milliseconds */
  baseDelayMs: number;

  /** Enable fallback tool selection */
  enableFallback: boolean;

  /** Enable graceful degradation */
  enableGracefulDegradation: boolean;
}

/**
 * Orchestrator state and statistics
 */
export interface OrchestratorStats {
  /** Total number of workflows executed */
  totalWorkflows: number;

  /** Number of successful workflows */
  successfulWorkflows: number;

  /** Average workflow execution time */
  averageExecutionTime: number;

  /** Most frequently used tools */
  popularTools: Array<{
    toolName: string;
    usageCount: number;
    successRate: number;
  }>;

  /** Cache performance statistics */
  cacheStats: {
    hits: number;
    misses: number;
    hitRate: number;
  };

  /** Learning system statistics */
  learningStats?: {
    patternsLearned: number;
    accuracyImprovement: number;
    lastTrainingTime: number;
  };
}

// ============================================================================
// ENHANCED MCP CONTEXT MANAGEMENT TYPES
// ============================================================================

/**
 * Represents a complete analysis session with context tracking
 */
export interface AnalysisSession {
  /** Unique session identifier */
  sessionId: string;

  /** Session creation timestamp */
  createdAt: number;

  /** Last activity timestamp */
  lastActivityAt: number;

  /** Session expiration timestamp */
  expiresAt: number;

  /** Original user request that started the session */
  originalRequest: string;

  /** Current session state */
  state: 'active' | 'idle' | 'expired' | 'archived';

  /** Context data accumulated during the session */
  contextData: Map<string, ContextData>;

  /** Tools executed in this session */
  executedTools: Array<{
    toolName: string;
    parameters: Record<string, any>;
    result: ToolExecutionResult;
    timestamp: number;
  }>;

  /** Entities discovered and analyzed in this session */
  discoveredEntities: Map<string, EntityContext>;

  /** Session-specific cache */
  sessionCache: SessionCache;

  /** Session metrics and analytics */
  metrics: SessionMetrics;

  /** User preferences and settings for this session */
  preferences?: SessionPreferences;
}

/**
 * Individual context data entry with metadata
 */
export interface ContextData {
  /** Unique identifier for this context entry */
  id: string;

  /** Type of context data */
  type: 'tool_result' | 'entity_info' | 'relationship' | 'analysis_state' | 'user_preference';

  /** The actual context data */
  data: any;

  /** Metadata about the context */
  metadata: {
    /** Source tool or operation that created this context */
    source: string;

    /** Confidence score for this context data (0-1) */
    confidence: number;

    /** Relevance score for current analysis (0-1) */
    relevance: number;

    /** Creation timestamp */
    createdAt: number;

    /** Last access timestamp */
    lastAccessedAt: number;

    /** Access count */
    accessCount: number;

    /** Tags for categorization */
    tags: string[];

    /** Related context IDs */
    relatedContexts: string[];
  };

  /** Compression information if data is compressed */
  compression?: {
    isCompressed: boolean;
    originalSize: number;
    compressedSize: number;
    algorithm: string;
  };
}

/**
 * Entity context information for discovered IL2CPP entities
 */
export interface EntityContext {
  /** Entity name */
  name: string;

  /** Entity type (class, method, enum, etc.) */
  type: string;

  /** Namespace or containing type */
  namespace?: string;

  /** Analysis results for this entity */
  analysisResults: Map<string, any>;

  /** Relationships to other entities */
  relationships: Array<{
    type: 'inherits' | 'implements' | 'uses' | 'contains' | 'references';
    target: string;
    confidence: number;
  }>;

  /** Discovery timestamp */
  discoveredAt: number;

  /** Last analysis timestamp */
  lastAnalyzedAt: number;

  /** Analysis completeness score (0-1) */
  completeness: number;
}

/**
 * Session-specific intelligent caching
 */
export interface SessionCache {
  /** Cache entries with semantic correlation */
  entries: Map<string, ContextCacheEntry>;

  /** Cache configuration */
  config: {
    maxSizeMB: number;
    ttlMs: number;
    maxEntries: number;
    enableSemanticCorrelation: boolean;
  };

  /** Cache statistics */
  stats: {
    hits: number;
    misses: number;
    evictions: number;
    totalSize: number;
    hitRate: number;
  };

  /** Semantic correlation index for intelligent retrieval */
  correlationIndex: Map<string, string[]>;
}

/**
 * Cache entry with correlation metadata for context management
 */
export interface ContextCacheEntry {
  /** Cache key */
  key: string;

  /** Cached data */
  data: any;

  /** Entry metadata */
  metadata: {
    createdAt: number;
    lastAccessedAt: number;
    accessCount: number;
    size: number;
    ttl: number;
  };

  /** Semantic tags for correlation */
  semanticTags: string[];

  /** Related cache keys */
  relatedKeys: string[];
}

// ============================================================================
// MCP PERFORMANCE OPTIMIZATION TYPES
// ============================================================================

/**
 * Cache entry with enhanced metadata for performance optimization
 */
export interface CacheEntry<T = any> {
  /** Cache key */
  key: string;

  /** Cached data */
  data: T;

  /** Entry creation timestamp */
  timestamp: number;

  /** Last access timestamp */
  lastAccessed: number;

  /** Number of times this entry has been accessed */
  accessCount: number;

  /** Estimated size of the cached data in bytes */
  size?: number;

  /** Entry metadata */
  metadata?: {
    createdAt: number;
    lastAccessedAt: number;
    accessCount: number;
    size: number;
    ttl: number;
  };

  /** Semantic tags for correlation */
  semanticTags?: string[];

  /** Related cache keys */
  relatedKeys?: string[];

  /** Execution context when this entry was created */
  context?: MCPExecutionContext;
}

/**
 * Performance metrics for monitoring and optimization
 */
export interface PerformanceMetrics {
  /** Metrics collection timestamp */
  timestamp: number;

  /** Memory usage statistics */
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };

  /** Cache performance metrics by cache type */
  cacheMetrics: Map<string, CacheStats>;

  /** Number of active requests */
  activeRequests: number;

  /** Number of learning patterns stored */
  learningPatterns: number;
}

/**
 * Cache statistics for performance monitoring
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  hitRatio: number;
  averageResponseTime: number;
  memoryUsage: number;
}

/**
 * Learning pattern for adaptive optimization
 */
export interface LearningPattern {
  /** Pattern identifier */
  key: string;

  /** Cache type this pattern applies to */
  cacheType: string;

  /** Total number of executions */
  totalExecutions: number;

  /** Average execution time in milliseconds */
  averageExecutionTime: number;

  /** Variance in execution time */
  executionTimeVariance: number;

  /** Number of cache accesses */
  accessCount: number;

  /** Last access timestamp */
  lastAccessed: number;

  /** Execution contexts for pattern analysis */
  contexts: MCPExecutionContext[];
}

/**
 * MCP execution context for performance tracking
 */
export interface MCPExecutionContext {
  /** Request identifier */
  requestId: string;

  /** Tool name being executed */
  toolName: string;

  /** Request parameters */
  parameters: Record<string, any>;

  /** User session identifier */
  sessionId?: string;

  /** Request timestamp */
  timestamp: number;

  /** Request priority */
  priority?: 'low' | 'normal' | 'high' | 'critical';

  /** Expected response time in milliseconds */
  expectedResponseTime?: number;
}

/**
 * MCP tool result with enhanced metadata
 */
export interface MCPToolResult {
  /** Whether the operation was successful */
  success: boolean;

  /** Result data */
  data: any;

  /** Result metadata */
  metadata: Record<string, any>;

  /** Error information if operation failed */
  error?: string;

  /** Execution time in milliseconds */
  executionTime: number;

  /** Cache information */
  cacheInfo?: {
    hit: boolean;
    key: string;
    type: string;
  };
}

/**
 * Optimization strategy configuration
 */
export interface OptimizationStrategy {
  /** Strategy name */
  name: string;

  /** Strategy description */
  description: string;

  /** Configuration parameters */
  parameters: Record<string, any>;

  /** Conditions when this strategy should be applied */
  conditions: Array<{
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    value: number;
  }>;

  /** Actions to take when strategy is triggered */
  actions: Array<{
    type: 'cache_clear' | 'cache_resize' | 'ttl_adjust' | 'eviction_policy_change';
    parameters: Record<string, any>;
  }>;
}

/**
 * Context correlation and relationship mapping
 */
export interface ContextCorrelation {
  /** Entity relationship graph */
  entityGraph: Map<string, Set<string>>;

  /** Tool usage patterns */
  toolPatterns: Map<string, Array<{
    followedBy: string;
    frequency: number;
    confidence: number;
  }>>;

  /** Analysis flow recommendations */
  flowRecommendations: Array<{
    currentTool: string;
    suggestedNext: string[];
    reasoning: string;
    confidence: number;
  }>;

  /** Semantic similarity index */
  semanticIndex: Map<string, Array<{
    entity: string;
    similarity: number;
    context: string;
  }>>;
}

/**
 * Session metrics and analytics
 */
export interface SessionMetrics {
  /** Total session duration */
  totalDuration: number;

  /** Number of tools executed */
  toolsExecuted: number;

  /** Number of entities discovered */
  entitiesDiscovered: number;

  /** Cache performance */
  cachePerformance: {
    hitRate: number;
    averageRetrievalTime: number;
    memoryUsage: number;
  };

  /** Context correlation effectiveness */
  correlationMetrics: {
    successfulCorrelations: number;
    averageCorrelationScore: number;
    recommendationAccuracy: number;
  };

  /** Memory usage statistics */
  memoryMetrics: {
    totalMemoryUsed: number;
    compressedDataSize: number;
    compressionRatio: number;
    peakMemoryUsage: number;
  };

  /** User interaction patterns */
  interactionMetrics: {
    averageRequestComplexity: number;
    mostUsedTools: string[];
    analysisDepth: number;
  };
}

/**
 * Session preferences and configuration
 */
export interface SessionPreferences {
  /** Preferred analysis depth */
  analysisDepth: 'shallow' | 'medium' | 'deep';

  /** Enable aggressive caching */
  aggressiveCaching: boolean;

  /** Memory usage limits */
  memoryLimits: {
    maxSessionMemoryMB: number;
    enableCompression: boolean;
    compressionThreshold: number;
  };

  /** Tool preferences */
  toolPreferences: {
    preferredTools: string[];
    avoidedTools: string[];
    parallelExecution: boolean;
  };

  /** Context retention settings */
  contextRetention: {
    retainDuration: number;
    autoArchive: boolean;
    compressionLevel: number;
  };
}

/**
 * Context-aware tool recommendation
 */
export interface ContextRecommendation {
  /** Recommended tool name */
  toolName: string;

  /** Recommendation confidence (0-1) */
  confidence: number;

  /** Reasoning for the recommendation */
  reasoning: string;

  /** Suggested parameters based on context */
  suggestedParameters: Record<string, any>;

  /** Expected benefit of executing this tool */
  expectedBenefit: {
    newInformation: number;
    contextEnrichment: number;
    analysisCompletion: number;
  };

  /** Alternative recommendations */
  alternatives: Array<{
    toolName: string;
    confidence: number;
    reasoning: string;
  }>;
}

/**
 * Context compression configuration
 */
export interface ContextCompressionConfig {
  /** Enable context compression */
  enabled: boolean;

  /** Compression algorithm */
  algorithm: 'gzip' | 'lz4' | 'brotli';

  /** Compression level (1-9) */
  level: number;

  /** Size threshold for compression (bytes) */
  threshold: number;

  /** Maximum uncompressed data to keep in memory */
  maxUncompressedMB: number;

  /** Compression statistics */
  stats: {
    totalCompressed: number;
    totalSaved: number;
    averageRatio: number;
    compressionTime: number;
    decompressionTime: number;
  };
}

// ============================================================================
// INTELLIGENT MCP TOOL SELECTION AND EXECUTION TYPES
// ============================================================================

/**
 * Tool selection criteria for intelligent tool selection
 */
export interface ToolSelectionCriteria {
  /** Analyzed intent from user request */
  intent: IntentAnalysis;

  /** Current execution context */
  context: {
    /** Previously executed tools in this session */
    previousTools: string[];

    /** Available data from previous tool executions */
    availableData: Record<string, any>;

    /** Session history for learning */
    sessionHistory: Array<{
      toolName: string;
      parameters: Record<string, any>;
      result: ToolExecutionResult;
      timestamp: number;
    }>;
  };

  /** Execution constraints */
  constraints: {
    /** Maximum execution time allowed */
    maxExecutionTime: number;

    /** Maximum tool complexity allowed */
    maxComplexity: 'simple' | 'medium' | 'complex';

    /** Preferred tool categories */
    preferredCategories?: Array<'search' | 'analysis' | 'generation'>;

    /** Tools to avoid */
    excludedTools?: string[];
  };
}

/**
 * Enhanced tool selection result with reasoning and alternatives
 */
export interface ToolSelectionResult {
  /** Selected tool name */
  toolName: string;

  /** Confidence score for the selection (0-1) */
  confidence: number;

  /** Reasoning for the tool selection */
  reasoning: string;

  /** Suggested parameters for the tool */
  suggestedParameters: Record<string, any>;

  /** Expected execution time estimate */
  estimatedExecutionTime: number;

  /** Alternative tool suggestions */
  alternatives: Array<{
    toolName: string;
    confidence: number;
    reasoning: string;
    estimatedExecutionTime: number;
  }>;

  /** Selection strategy used */
  strategy: ToolSelectionStrategy;
}

/**
 * Tool selection strategy configuration
 */
export type ToolSelectionStrategy = 'conservative' | 'balanced' | 'aggressive' | 'adaptive';

/**
 * Tool capability mapping for intelligent selection
 */
export interface ToolCapabilityMap {
  /** Tool metadata indexed by tool name */
  tools: Map<string, ToolCapability>;

  /** Tools grouped by category */
  categories: Map<string, string[]>;

  /** Tools grouped by complexity level */
  complexityLevels: Map<string, string[]>;

  /** Tool relationships and dependencies */
  toolRelationships: Map<string, ToolRelationship>;

  /** Input/output compatibility matrix */
  compatibilityMatrix: Map<string, Map<string, ToolCompatibility>>;
}

/**
 * Individual tool capability information
 */
export interface ToolCapability {
  /** Tool name */
  name: string;

  /** Tool category */
  category: 'search' | 'analysis' | 'generation';

  /** Complexity level */
  complexity: 'simple' | 'medium' | 'complex';

  /** Input requirements */
  inputs: {
    required: string[];
    optional: string[];
    types: Record<string, string>;
  };

  /** Output format and structure */
  outputs: {
    format: string;
    structure: Record<string, any>;
    metadata: string[];
  };

  /** Performance characteristics */
  performance: {
    averageExecutionTime: number;
    memoryUsage: number;
    successRate: number;
  };

  /** Usage patterns and recommendations */
  usage: {
    commonUseCases: string[];
    bestPractices: string[];
    limitations: string[];
  };
}

/**
 * Tool relationship information
 */
export interface ToolRelationship {
  /** Tools that work well together */
  complementary: string[];

  /** Tools that are alternatives to this one */
  alternatives: string[];

  /** Tools that should be executed before this one */
  prerequisites: string[];

  /** Tools that can follow this one */
  followUp: string[];

  /** Tools that conflict with this one */
  conflicts: string[];
}

/**
 * Tool compatibility assessment
 */
export interface ToolCompatibility {
  /** Whether tools are compatible */
  isCompatible: boolean;

  /** Compatibility score (0-1) */
  compatibilityScore: number;

  /** Shared parameters between tools */
  sharedParameters: string[];

  /** Data flow compatibility */
  dataFlowCompatible: boolean;

  /** Execution order requirements */
  executionOrder?: 'sequential' | 'parallel' | 'either';
}

/**
 * Tool execution plan for complex workflows
 */
export interface ToolExecutionPlan {
  /** Execution steps in order */
  executionSteps: Array<{
    stepId: string;
    toolName: string;
    parameters: Record<string, any>;
    dependencies: string[];
    estimatedDuration: number;
  }>;

  /** Overall execution strategy */
  executionStrategy: 'sequential' | 'parallel' | 'hybrid';

  /** Parallel execution groups */
  parallelGroups: Array<Array<{
    toolName: string;
    parameters: Record<string, any>;
  }>>;

  /** Total estimated duration */
  estimatedDuration: number;

  /** Risk assessment */
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high';
    riskFactors: string[];
    mitigationStrategies: string[];
  };
}

/**
 * Tool result validation and quality assessment
 */
export interface ToolQualityAssessment {
  /** Whether the result is valid */
  isValid: boolean;

  /** Overall quality score (0-1) */
  qualityScore: number;

  /** Relevance score (0-1) */
  relevanceScore: number;

  /** Completeness score (0-1) */
  completenessScore: number;

  /** Overall quality rating */
  overallQuality: number;

  /** Identified issues */
  issues: string[];

  /** Improvement suggestions */
  suggestions: string[];

  /** Quality metrics */
  metrics: {
    resultCount: number;
    averageRelevance: number;
    dataCompleteness: number;
    structuralIntegrity: number;
  };
}

/**
 * Parallel tool execution result
 */
export interface ParallelExecutionResult {
  /** Whether all executions were successful */
  success: boolean;

  /** Individual tool execution results */
  results: ToolExecutionResult[];

  /** Total execution time */
  executionTime: number;

  /** Number of tools executed in parallel */
  parallelExecutions: number;

  /** Number of successful executions */
  successfulExecutions: number;

  /** Number of failed executions */
  failedExecutions: number;

  /** Performance metrics */
  performanceMetrics: {
    averageExecutionTime: number;
    maxExecutionTime: number;
    minExecutionTime: number;
    throughput: number;
  };

  /** Resource usage statistics */
  resourceUsage: {
    peakMemoryUsage: number;
    totalCpuTime: number;
    networkRequests: number;
  };
}

/**
 * Tool execution time estimation
 */
export interface ExecutionTimeEstimate {
  /** Estimated execution time in milliseconds */
  estimatedMs: number;

  /** Confidence in the estimate (0-1) */
  confidence: number;

  /** Factors affecting execution time */
  factors: {
    parameterComplexity: number;
    dataSize: number;
    systemLoad: number;
    historicalPerformance: number;
  };

  /** Range estimate */
  range: {
    minimum: number;
    maximum: number;
    median: number;
  };
}

/**
 * Learning statistics for adaptive tool selection
 */
export interface LearningStatistics {
  /** Total number of learning samples */
  totalSamples: number;

  /** Average quality score across all samples */
  averageQuality: number;

  /** Tool preference scores */
  toolPreferences: Map<string, number>;

  /** Successful pattern recognition */
  patterns: Array<{
    pattern: string;
    frequency: number;
    successRate: number;
    confidence: number;
  }>;

  /** Learning accuracy metrics */
  accuracy: {
    predictionAccuracy: number;
    improvementRate: number;
    lastUpdated: number;
  };
}

/**
 * Tool selector configuration
 */
export interface ToolSelectorConfig {
  /** Enable intelligent tool selection */
  enableIntelligentSelection: boolean;

  /** Enable parallel tool execution */
  enableParallelExecution: boolean;

  /** Maximum number of tools to run in parallel */
  maxParallelTools: number;

  /** Tool selection strategy */
  selectionStrategy: ToolSelectionStrategy;

  /** Minimum quality threshold for results */
  qualityThreshold: number;

  /** Enable adaptive learning */
  enableLearning: boolean;

  /** Maximum retry attempts for failed executions */
  maxRetryAttempts?: number;

  /** Enable result caching */
  enableCaching?: boolean;

  /** Cache configuration */
  cacheConfig?: {
    maxSizeMB: number;
    ttlMs: number;
    enableSemanticCaching: boolean;
  };
}

// ============================================================================
// MCP RESPONSE SYNTHESIS AND AGGREGATION TYPES
// ============================================================================

/**
 * Configuration for MCP Response Synthesizer
 */
export interface ResponseSynthesizerConfig {
  /** Enable semantic correlation between results */
  enableSemanticCorrelation: boolean;

  /** Maximum length of synthesized response */
  maxResponseLength: number;

  /** Quality threshold for accepting results */
  qualityThreshold: number;

  /** Enable intelligent response caching */
  enableCaching: boolean;

  /** Cache configuration */
  cacheConfig: {
    maxEntries: number;
    ttlMs: number;
    enableSemanticCaching: boolean;
  };

  /** Response formatting preferences */
  formatting: {
    includeMetadata: boolean;
    includeQualityMetrics: boolean;
    includeCorrelations: boolean;
    preferredFormat: 'structured' | 'narrative' | 'hybrid';
  };
}

/**
 * Synthesized response from single tool result
 */
export interface SynthesizedResponse {
  /** Whether synthesis was successful */
  success: boolean;

  /** Synthesized content combining all results */
  synthesizedContent: string;

  /** Quality assessment of the synthesized response */
  qualityAssessment: ResponseQualityAssessment;

  /** Metadata about the synthesis process */
  metadata: {
    originalToolName: string;
    synthesisTimestamp: number;
    synthesisTime: number;
    resultCount: number;
    contentLength: number;
  };

  /** Issues encountered during synthesis */
  issues: string[];

  /** Suggestions for improvement */
  suggestions: string[];
}

/**
 * Aggregated response from multiple tool results
 */
export interface AggregatedResponse {
  /** Whether aggregation was successful */
  success: boolean;

  /** Synthesized content combining all results */
  synthesizedContent: string;

  /** Correlations found between different tool results */
  correlations: ResultCorrelation[];

  /** Quality assessment of the aggregated response */
  qualityAssessment: ResponseQualityAssessment;

  /** Summary of aggregation process */
  aggregationSummary: {
    totalTools: number;
    successfulTools: number;
    failedTools: number;
    correlationsFound: number;
    synthesisStrategy: string;
  };

  /** Metadata about the aggregation process */
  metadata: {
    toolNames: string[];
    aggregationTimestamp: number;
    aggregationTime: number;
    totalResultCount: number;
    contentLength: number;
  };

  /** Issues encountered during aggregation */
  issues: string[];

  /** Suggestions for improvement */
  suggestions: string[];
}

/**
 * Workflow synthesis result
 */
export interface WorkflowSynthesisResult {
  /** Whether workflow synthesis was successful */
  success: boolean;

  /** Synthesized content from entire workflow */
  synthesizedContent: string;

  /** Correlations found across workflow results */
  correlations: ResultCorrelation[];

  /** Quality assessment of the workflow results */
  qualityAssessment: ResponseQualityAssessment;

  /** Summary of workflow execution and synthesis */
  workflowSummary: {
    totalTools: number;
    successfulTools: number;
    failedTools: number;
    executionTime: number;
    retryCount: number;
    correlationsFound: number;
  };

  /** Metadata about the workflow synthesis */
  metadata: {
    originalRequest: string;
    toolNames: string[];
    synthesisTimestamp: number;
    synthesisTime: number;
    totalResultCount: number;
    contentLength: number;
  };

  /** Issues encountered during workflow synthesis */
  issues: string[];

  /** Suggestions for improvement */
  suggestions: string[];
}

/**
 * Quality assessment for synthesized responses
 */
export interface ResponseQualityAssessment {
  /** Whether the response meets quality standards */
  isValid: boolean;

  /** Overall quality score (0-1) */
  qualityScore: number;

  /** Relevance to original request (0-1) */
  relevanceScore: number;

  /** Completeness of information (0-1) */
  completenessScore: number;

  /** Coherence and readability (0-1) */
  coherenceScore: number;

  /** Overall quality rating */
  overallQuality: number;

  /** Identified quality issues */
  issues: string[];

  /** Improvement suggestions */
  suggestions: string[];

  /** Quality metrics breakdown */
  metrics: {
    informationDensity: number;
    structuralIntegrity: number;
    semanticConsistency: number;
    factualAccuracy: number;
  };
}

/**
 * Correlation between different tool results
 */
export interface ResultCorrelation {
  /** Unique correlation identifier */
  id: string;

  /** Type of correlation found */
  correlationType: 'entity_relationship' | 'semantic_similarity' | 'data_overlap' | 'contextual_link';

  /** Entities involved in the correlation */
  entities: string[];

  /** Tools that produced the correlated results */
  sourceTools: string[];

  /** Strength of correlation (0-1) */
  strength: number;

  /** Confidence in the correlation (0-1) */
  confidence: number;

  /** Description of the correlation */
  description: string;

  /** Evidence supporting the correlation */
  evidence: Array<{
    source: string;
    content: string;
    relevance: number;
  }>;
}

/**
 * Response synthesis strategy
 */
export type SynthesisStrategy = 'concatenative' | 'integrative' | 'narrative' | 'structured' | 'adaptive';

/**
 * Response cache entry
 */
export interface ResponseCacheEntry {
  /** Cache key */
  key: string;

  /** Cached synthesized response */
  response: SynthesizedResponse | AggregatedResponse | WorkflowSynthesisResult;

  /** Cache metadata */
  metadata: {
    createdAt: number;
    lastAccessedAt: number;
    accessCount: number;
    ttl: number;
    size: number;
  };

  /** Semantic tags for correlation */
  semanticTags: string[];

  /** Hash of input data for cache validation */
  inputHash: string;
}

/**
 * Response synthesis statistics
 */
export interface SynthesisStatistics {
  /** Total number of synthesis operations */
  totalSyntheses: number;

  /** Number of successful syntheses */
  successfulSyntheses: number;

  /** Average synthesis time */
  averageSynthesisTime: number;

  /** Average quality score */
  averageQualityScore: number;

  /** Cache performance */
  cacheStats: {
    hits: number;
    misses: number;
    hitRate: number;
    totalEntries: number;
    memoryUsage: number;
  };

  /** Correlation statistics */
  correlationStats: {
    totalCorrelations: number;
    averageCorrelationStrength: number;
    correlationsByType: Record<string, number>;
  };

  /** Quality metrics */
  qualityStats: {
    averageRelevance: number;
    averageCompleteness: number;
    averageCoherence: number;
    commonIssues: Array<{
      issue: string;
      frequency: number;
    }>;
  };
}
