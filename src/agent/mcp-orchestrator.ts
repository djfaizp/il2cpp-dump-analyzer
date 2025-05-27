/**
 * @fileoverview MCP Tool Orchestration Engine
 * Provides intelligent tool orchestration, task decomposition, and workflow management
 * for complex IL2CPP analysis requests within the MCP framework
 */

import { ToolExecutionContext } from '../mcp/base-tool-handler';
import { getAllToolNames, getToolMetadata, isValidTool } from '../mcp/tools/tool-registry';
import { Logger } from '../mcp/mcp-sdk-server';
import {
  OrchestratorConfig,
  TaskDecomposition,
  SubTask,
  WorkflowExecution,
  ToolExecutionResult,
  IntentAnalysis,
  ToolSelection,
  WorkflowContext,
  WorkflowMetrics,
  OrchestratorStats
} from './types';

/**
 * Default configuration for the MCP Orchestrator
 */
const DEFAULT_CONFIG: OrchestratorConfig = {
  maxWorkflowDepth: 5,
  maxParallelTools: 3,
  timeoutMs: 30000,
  enableCaching: true,
  retryAttempts: 2,
  enableLearning: false,
  confidenceThreshold: 0.7,
  enableContextPersistence: true
};

/**
 * MCP Tool Orchestration Engine
 * Intelligently decomposes complex requests into MCP tool workflows
 */
export class MCPOrchestrator {
  private context: ToolExecutionContext;
  private config: OrchestratorConfig;
  private stats: OrchestratorStats;
  private cache: Map<string, ToolExecutionResult>;
  private workflowHistory: Array<{ request: string; decomposition: TaskDecomposition; result: WorkflowExecution }>;

  constructor(context: ToolExecutionContext, config: Partial<OrchestratorConfig> = {}) {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = this.initializeStats();
    this.cache = new Map();
    this.workflowHistory = [];

    this.context.logger.info('MCP Orchestrator initialized', {
      config: this.config,
      availableTools: getAllToolNames().length
    });
  }

  /**
   * Decompose a complex request into executable subtasks
   */
  async decomposeTask(request: string): Promise<TaskDecomposition> {
    this.context.logger.debug('Decomposing task', { request });

    try {
      // Step 1: Analyze intent from natural language request
      const intent = this.analyzeIntent(request);
      this.context.logger.debug('Intent analyzed', { intent });

      // Step 2: Generate subtasks based on intent
      const subtasks = this.generateSubtasks(intent, request);

      // Step 3: Determine execution strategy
      const executionStrategy = this.determineExecutionStrategy(subtasks);

      // Step 4: Calculate estimated duration
      const estimatedDuration = this.calculateEstimatedDuration(subtasks, executionStrategy);

      const decomposition: TaskDecomposition = {
        originalRequest: request,
        subtasks,
        executionStrategy,
        estimatedDuration,
        confidence: intent.confidence,
        explanation: this.generateDecompositionExplanation(subtasks, executionStrategy)
      };

      this.context.logger.info('Task decomposed successfully', {
        subtaskCount: subtasks.length,
        strategy: executionStrategy,
        estimatedDuration
      });

      return decomposition;

    } catch (error) {
      this.context.logger.error('Task decomposition failed', { error, request });
      throw new Error(`Failed to decompose task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute a complete workflow from task decomposition
   */
  async executeWorkflow(decomposition: TaskDecomposition): Promise<WorkflowExecution> {
    const startTime = Date.now();
    this.context.logger.info('Starting workflow execution', {
      request: decomposition.originalRequest,
      subtasks: decomposition.subtasks.length,
      strategy: decomposition.executionStrategy
    });

    const workflowContext: WorkflowContext = {
      state: 'initializing',
      completedTasks: {},
      sharedData: {},
      startTime
    };

    try {
      workflowContext.state = 'executing';

      let results: ToolExecutionResult[];
      let totalRetryCount = 0;

      // Execute based on strategy
      if (decomposition.executionStrategy === 'parallel') {
        const parallelResults = await this.executeParallel(decomposition.subtasks, workflowContext);
        results = parallelResults.results;
        totalRetryCount = parallelResults.retryCount;
      } else {
        const sequentialResults = await this.executeSequential(decomposition.subtasks, workflowContext);
        results = sequentialResults.results;
        totalRetryCount = sequentialResults.retryCount;
      }

      workflowContext.state = 'completed';
      const executionTime = Date.now() - startTime;

      const execution: WorkflowExecution = {
        success: true,
        results,
        executionTime,
        retryCount: totalRetryCount,
        context: workflowContext.sharedData,
        metrics: this.calculateWorkflowMetrics(results, executionTime)
      };

      // Update statistics
      this.updateStats(decomposition, execution);

      // Store in history for learning
      this.workflowHistory.push({
        request: decomposition.originalRequest,
        decomposition,
        result: execution
      });

      this.context.logger.info('Workflow executed successfully', {
        executionTime,
        successfulTasks: results.filter(r => r.success).length,
        totalTasks: results.length
      });

      return execution;

    } catch (error) {
      workflowContext.state = 'failed';
      workflowContext.errorInfo = {
        taskId: workflowContext.currentTask || 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };

      const executionTime = Date.now() - startTime;

      const execution: WorkflowExecution = {
        success: false,
        results: [],
        executionTime,
        retryCount: 0,
        context: workflowContext.sharedData,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.context.logger.error('Workflow execution failed', {
        error: execution.error,
        executionTime,
        request: decomposition.originalRequest
      });

      return execution;
    }
  }

  /**
   * Select the most appropriate tool for a given intent
   */
  selectTool(intent: IntentAnalysis): string {
    this.context.logger.debug('Selecting tool for intent', { intent });

    // Tool selection logic based on intent analysis
    const { action, target, type } = intent;

    // Search-related intents
    if (action === 'search' || action === 'find') {
      if (target.toLowerCase().includes('monobehaviour') || type === 'component') {
        return 'find_monobehaviours';
      }
      if (type === 'enum' || target.toLowerCase().includes('enum')) {
        return 'find_enum_values';
      }
      return 'search_code';
    }

    // Analysis-related intents
    if (action === 'analyze') {
      if (target.toLowerCase().includes('hierarchy') || target.toLowerCase().includes('inheritance')) {
        return 'find_class_hierarchy';
      }
      if (target.toLowerCase().includes('dependencies') || target.toLowerCase().includes('dependency')) {
        return 'analyze_dependencies';
      }
      if (target.toLowerCase().includes('pattern') || target.toLowerCase().includes('design')) {
        return 'find_design_patterns';
      }
      if (target.toLowerCase().includes('reference') || target.toLowerCase().includes('usage')) {
        return 'find_cross_references';
      }
      return 'analyze_dependencies'; // Default analysis tool
    }

    // Generation-related intents
    if (action === 'generate') {
      if (target.toLowerCase().includes('monobehaviour') || type === 'template') {
        return 'generate_monobehaviour_template';
      }
      if (target.toLowerCase().includes('method') || target.toLowerCase().includes('stub')) {
        return 'generate_method_stubs';
      }
      if (target.toLowerCase().includes('wrapper') || target.toLowerCase().includes('class')) {
        return 'generate_class_wrapper';
      }
      return 'generate_class_wrapper'; // Default generation tool
    }

    // Default fallback
    this.context.logger.warn('No specific tool found for intent, using default', { intent });
    return 'search_code';
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): OrchestratorStats {
    return { ...this.stats };
  }

  /**
   * Clear cache and reset statistics
   */
  reset(): void {
    this.cache.clear();
    this.workflowHistory = [];
    this.stats = this.initializeStats();
    this.context.logger.info('MCP Orchestrator reset');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Initialize orchestrator statistics
   */
  private initializeStats(): OrchestratorStats {
    return {
      totalWorkflows: 0,
      successfulWorkflows: 0,
      averageExecutionTime: 0,
      popularTools: [],
      cacheStats: {
        hits: 0,
        misses: 0,
        hitRate: 0
      }
    };
  }

  /**
   * Analyze intent from natural language request
   */
  private analyzeIntent(request: string): IntentAnalysis {
    const lowerRequest = request.toLowerCase();

    // Extract action
    let action: IntentAnalysis['action'] = 'search';
    if (lowerRequest.includes('find') || lowerRequest.includes('search') || lowerRequest.includes('look')) {
      action = lowerRequest.includes('monobehaviour') ? 'find' : 'search';
    } else if (lowerRequest.includes('analyze') || lowerRequest.includes('analysis')) {
      action = 'analyze';
    } else if (lowerRequest.includes('generate') || lowerRequest.includes('create')) {
      action = 'generate';
    } else if (lowerRequest.includes('compare')) {
      action = 'compare';
    } else if (lowerRequest.includes('list')) {
      action = 'list';
    }

    // Extract target and type
    const target = this.extractTarget(request);
    const type = this.extractType(request);

    // Extract filters
    const filters = this.extractFilters(request);

    // Extract keywords
    const keywords = this.extractKeywords(request);

    // Calculate confidence based on keyword matches and clarity
    const confidence = this.calculateIntentConfidence(request, action, target, type);

    return {
      action,
      target,
      type,
      filters,
      confidence,
      keywords
    };
  }

  /**
   * Extract target entity from request
   */
  private extractTarget(request: string): string {
    // Look for common class names, patterns
    const classPatterns = /\b([A-Z][a-zA-Z]*(?:Manager|Controller|Player|Enemy|Game|UI|System)?)\b/g;
    const matches = request.match(classPatterns);

    if (matches && matches.length > 0) {
      return matches[0];
    }

    // Fallback to first capitalized word
    const capitalizedWords = request.match(/\b[A-Z][a-z]+\b/g);
    return capitalizedWords ? capitalizedWords[0] : 'unknown';
  }

  /**
   * Extract type from request
   */
  private extractType(request: string): string {
    const lowerRequest = request.toLowerCase();

    if (lowerRequest.includes('class')) return 'class';
    if (lowerRequest.includes('method')) return 'method';
    if (lowerRequest.includes('enum')) return 'enum';
    if (lowerRequest.includes('interface')) return 'interface';
    if (lowerRequest.includes('monobehaviour') || lowerRequest.includes('component')) return 'component';
    if (lowerRequest.includes('template')) return 'template';
    if (lowerRequest.includes('wrapper')) return 'wrapper';
    if (lowerRequest.includes('stub')) return 'stub';

    return 'unknown';
  }

  /**
   * Extract filters from request
   */
  private extractFilters(request: string): Record<string, any> {
    const filters: Record<string, any> = {};
    const lowerRequest = request.toLowerCase();

    if (lowerRequest.includes('monobehaviour')) {
      filters.filter_monobehaviour = true;
    }

    // Extract namespace if mentioned
    const namespaceMatch = request.match(/namespace\s+([a-zA-Z.]+)/i);
    if (namespaceMatch) {
      filters.filter_namespace = namespaceMatch[1];
    }

    return filters;
  }

  /**
   * Extract keywords from request
   */
  private extractKeywords(request: string): string[] {
    // Remove common words and extract meaningful keywords
    const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an'];
    const words = request.toLowerCase().split(/\s+/);

    return words
      .filter(word => word.length > 2 && !commonWords.includes(word))
      .filter(word => /^[a-zA-Z]+$/.test(word));
  }

  /**
   * Calculate confidence score for intent analysis
   */
  private calculateIntentConfidence(request: string, action: string, target: string, type: string): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for clear action words
    const actionWords = ['find', 'search', 'analyze', 'generate', 'create'];
    if (actionWords.some(word => request.toLowerCase().includes(word))) {
      confidence += 0.2;
    }

    // Increase confidence for clear targets
    if (target !== 'unknown' && target.length > 2) {
      confidence += 0.2;
    }

    // Increase confidence for clear types
    if (type !== 'unknown') {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate subtasks based on intent analysis
   */
  private generateSubtasks(intent: IntentAnalysis, request: string): SubTask[] {
    const subtasks: SubTask[] = [];

    // Handle complex requests that require multiple tools
    if (this.isComplexRequest(request)) {
      return this.generateComplexSubtasks(intent, request);
    }

    // Simple request - single tool
    const toolName = this.selectTool(intent);
    const parameters = this.generateToolParameters(intent, toolName);

    subtasks.push({
      id: 'task-1',
      toolName,
      parameters,
      dependencies: [],
      priority: 1,
      description: `Execute ${toolName} for ${intent.target}`
    });

    return subtasks;
  }

  /**
   * Check if request requires multiple tools
   */
  private isComplexRequest(request: string): boolean {
    const complexIndicators = [
      'and', 'then', 'also', 'hierarchy', 'dependencies', 'generate',
      'analyze.*and', 'find.*and.*analyze', 'search.*and.*generate'
    ];

    return complexIndicators.some(indicator =>
      new RegExp(indicator, 'i').test(request)
    );
  }

  /**
   * Generate subtasks for complex requests
   */
  private generateComplexSubtasks(intent: IntentAnalysis, request: string): SubTask[] {
    const subtasks: SubTask[] = [];
    const lowerRequest = request.toLowerCase();

    // Pattern: Find class and analyze hierarchy
    if (lowerRequest.includes('hierarchy') || lowerRequest.includes('inheritance')) {
      subtasks.push({
        id: 'task-1',
        toolName: 'search_code',
        parameters: { query: intent.target, filter_type: 'class' },
        dependencies: [],
        priority: 1,
        description: `Find ${intent.target} class`
      });

      subtasks.push({
        id: 'task-2',
        toolName: 'find_class_hierarchy',
        parameters: { class_name: '${task-1.className}' },
        dependencies: ['task-1'],
        priority: 2,
        description: `Analyze class hierarchy for ${intent.target}`
      });
    }

    // Pattern: Find class and analyze dependencies
    if (lowerRequest.includes('dependencies') || lowerRequest.includes('dependency')) {
      if (subtasks.length === 0) {
        subtasks.push({
          id: 'task-1',
          toolName: 'search_code',
          parameters: { query: intent.target, filter_type: 'class' },
          dependencies: [],
          priority: 1,
          description: `Find ${intent.target} class`
        });
      }

      subtasks.push({
        id: `task-${subtasks.length + 1}`,
        toolName: 'analyze_dependencies',
        parameters: { class_name: '${task-1.className}' },
        dependencies: ['task-1'],
        priority: 2,
        description: `Analyze dependencies for ${intent.target}`
      });
    }

    // Pattern: Generate templates
    if (lowerRequest.includes('generate') || lowerRequest.includes('template')) {
      if (subtasks.length === 0) {
        subtasks.push({
          id: 'task-1',
          toolName: 'search_code',
          parameters: { query: intent.target, filter_type: 'class' },
          dependencies: [],
          priority: 1,
          description: `Find ${intent.target} class`
        });
      }

      const generationTool = lowerRequest.includes('monobehaviour')
        ? 'generate_monobehaviour_template'
        : lowerRequest.includes('method')
        ? 'generate_method_stubs'
        : 'generate_class_wrapper';

      subtasks.push({
        id: `task-${subtasks.length + 1}`,
        toolName: generationTool,
        parameters: { class_name: '${task-1.className}' },
        dependencies: ['task-1'],
        priority: 2,
        description: `Generate template for ${intent.target}`
      });
    }

    // Pattern: MonoBehaviour analysis
    if (lowerRequest.includes('monobehaviour') && lowerRequest.includes('pattern')) {
      subtasks.push({
        id: 'task-1',
        toolName: 'find_monobehaviours',
        parameters: { query: intent.target },
        dependencies: [],
        priority: 1,
        description: 'Find MonoBehaviour classes'
      });

      subtasks.push({
        id: 'task-2',
        toolName: 'find_design_patterns',
        parameters: { pattern_types: ['singleton', 'observer', 'state'] },
        dependencies: [],
        priority: 1,
        description: 'Analyze design patterns'
      });
    }

    // If no complex patterns matched, fall back to simple
    if (subtasks.length === 0) {
      const toolName = this.selectTool(intent);
      const parameters = this.generateToolParameters(intent, toolName);

      subtasks.push({
        id: 'task-1',
        toolName,
        parameters,
        dependencies: [],
        priority: 1,
        description: `Execute ${toolName} for ${intent.target}`
      });
    }

    return subtasks;
  }

  /**
   * Generate parameters for a specific tool based on intent
   */
  private generateToolParameters(intent: IntentAnalysis, toolName: string): Record<string, any> {
    const params: Record<string, any> = {};

    switch (toolName) {
      case 'search_code':
        params.query = intent.target;
        if (intent.type !== 'unknown') {
          params.filter_type = intent.type;
        }
        if (intent.filters.filter_monobehaviour) {
          params.filter_monobehaviour = true;
        }
        if (intent.filters.filter_namespace) {
          params.filter_namespace = intent.filters.filter_namespace;
        }
        break;

      case 'find_monobehaviours':
        if (intent.target !== 'unknown') {
          params.query = intent.target;
        }
        break;

      case 'find_enum_values':
        params.enum_name = intent.target;
        break;

      case 'find_class_hierarchy':
        params.class_name = intent.target;
        break;

      case 'analyze_dependencies':
        params.class_name = intent.target;
        break;

      case 'find_cross_references':
        params.target_name = intent.target;
        params.target_type = intent.type !== 'unknown' ? intent.type : 'class';
        break;

      case 'find_design_patterns':
        params.pattern_types = ['singleton', 'observer', 'factory', 'strategy'];
        break;

      case 'generate_class_wrapper':
      case 'generate_method_stubs':
      case 'generate_monobehaviour_template':
        params.class_name = intent.target;
        break;
    }

    return params;
  }

  /**
   * Determine execution strategy for subtasks
   */
  private determineExecutionStrategy(subtasks: SubTask[]): 'sequential' | 'parallel' | 'hybrid' {
    // If any task has dependencies, use sequential
    if (subtasks.some(task => task.dependencies.length > 0)) {
      return 'sequential';
    }

    // If multiple independent tasks, use parallel
    if (subtasks.length > 1) {
      return 'parallel';
    }

    // Single task or simple workflow
    return 'sequential';
  }

  /**
   * Calculate estimated duration for workflow
   */
  private calculateEstimatedDuration(subtasks: SubTask[], strategy: string): number {
    const toolDurations: Record<string, number> = {
      'search_code': 2000,
      'find_monobehaviours': 3000,
      'find_enum_values': 1500,
      'find_class_hierarchy': 4000,
      'analyze_dependencies': 5000,
      'find_cross_references': 6000,
      'find_design_patterns': 8000,
      'generate_class_wrapper': 3000,
      'generate_method_stubs': 4000,
      'generate_monobehaviour_template': 3500
    };

    const taskDurations = subtasks.map(task =>
      toolDurations[task.toolName] || 3000
    );

    if (strategy === 'parallel') {
      return Math.max(...taskDurations);
    } else {
      return taskDurations.reduce((sum, duration) => sum + duration, 0);
    }
  }

  /**
   * Generate explanation for decomposition strategy
   */
  private generateDecompositionExplanation(subtasks: SubTask[], strategy: string): string {
    if (subtasks.length === 1) {
      return `Single tool execution: ${subtasks[0].toolName}`;
    }

    if (strategy === 'parallel') {
      return `Parallel execution of ${subtasks.length} independent tasks`;
    }

    return `Sequential execution of ${subtasks.length} dependent tasks`;
  }

  /**
   * Execute subtasks in parallel
   */
  private async executeParallel(subtasks: SubTask[], context: WorkflowContext): Promise<{ results: ToolExecutionResult[]; retryCount: number }> {
    this.context.logger.debug('Executing subtasks in parallel', { count: subtasks.length });

    const promises = subtasks.map(async (subtask) => {
      context.currentTask = subtask.id;
      return await this.executeSubtask(subtask, context);
    });

    const results = await Promise.all(promises);
    const totalRetryCount = results.reduce((sum, result) => sum + (result.retryCount || 0), 0);

    return { results, retryCount: totalRetryCount };
  }

  /**
   * Execute subtasks sequentially with dependency resolution
   */
  private async executeSequential(subtasks: SubTask[], context: WorkflowContext): Promise<{ results: ToolExecutionResult[]; retryCount: number }> {
    this.context.logger.debug('Executing subtasks sequentially', { count: subtasks.length });

    const results: ToolExecutionResult[] = [];
    let totalRetryCount = 0;

    // Sort by priority and dependencies
    const sortedTasks = this.sortTasksByDependencies(subtasks);

    for (const subtask of sortedTasks) {
      context.currentTask = subtask.id;

      // Resolve dependencies
      const resolvedSubtask = this.resolveDependencies(subtask, context.completedTasks);

      // Execute the subtask
      const result = await this.executeSubtask(resolvedSubtask, context);
      results.push(result);
      totalRetryCount += result.retryCount || 0;

      // Store result for dependency resolution
      context.completedTasks[subtask.id] = result;

      // If task failed and no retry succeeded, stop execution
      if (!result.success) {
        this.context.logger.error('Sequential execution stopped due to task failure', {
          taskId: subtask.id,
          error: result.error
        });
        break;
      }
    }

    return { results, retryCount: totalRetryCount };
  }

  /**
   * Execute a single subtask with retry logic
   */
  private async executeSubtask(subtask: SubTask, context: WorkflowContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        this.context.logger.debug('Executing subtask', {
          taskId: subtask.id,
          toolName: subtask.toolName,
          attempt: attempt + 1
        });

        // Check cache first
        const cacheKey = this.generateCacheKey(subtask);
        if (this.config.enableCaching && this.cache.has(cacheKey)) {
          this.stats.cacheStats.hits++;
          const cachedResult = this.cache.get(cacheKey)!;
          this.context.logger.debug('Cache hit for subtask', { taskId: subtask.id });
          return {
            ...cachedResult,
            executionTime: Date.now() - startTime,
            retryCount: attempt
          };
        }

        this.stats.cacheStats.misses++;

        // Execute the tool
        const result = await this.executeTool(subtask.toolName, subtask.parameters);

        const executionResult: ToolExecutionResult = {
          success: true,
          data: result.data || [],
          metadata: result.metadata || {},
          executionTime: Date.now() - startTime,
          retryCount: attempt
        };

        // Cache successful results
        if (this.config.enableCaching) {
          this.cache.set(cacheKey, executionResult);
        }

        this.context.logger.debug('Subtask executed successfully', {
          taskId: subtask.id,
          executionTime: executionResult.executionTime
        });

        return executionResult;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        this.context.logger.warn('Subtask execution failed', {
          taskId: subtask.id,
          attempt: attempt + 1,
          error: lastError.message
        });

        // Wait before retry (exponential backoff)
        if (attempt < this.config.retryAttempts) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    return {
      success: false,
      data: [],
      metadata: {},
      error: lastError?.message || 'Unknown error',
      executionTime: Date.now() - startTime,
      retryCount: this.config.retryAttempts
    };
  }

  /**
   * Execute a specific MCP tool
   */
  private async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    if (!isValidTool(toolName)) {
      throw new Error(`Invalid tool name: ${toolName}`);
    }

    // This would integrate with the actual MCP tool execution
    // For now, we'll simulate the execution
    this.context.logger.debug('Executing MCP tool', { toolName, parameters });

    // Simulate tool execution delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Return mock result for testing
    return {
      success: true,
      data: [{ content: `Mock result for ${toolName}`, metadata: { toolName, parameters } }],
      metadata: { resultCount: 1, toolName }
    };
  }

  /**
   * Sort tasks by dependencies and priority
   */
  private sortTasksByDependencies(subtasks: SubTask[]): SubTask[] {
    const sorted: SubTask[] = [];
    const remaining = [...subtasks];

    while (remaining.length > 0) {
      const readyTasks = remaining.filter(task =>
        task.dependencies.every(dep =>
          sorted.some(completed => completed.id === dep)
        )
      );

      if (readyTasks.length === 0) {
        // Circular dependency or missing dependency
        this.context.logger.warn('Circular or missing dependencies detected', {
          remaining: remaining.map(t => ({ id: t.id, deps: t.dependencies }))
        });
        // Add remaining tasks anyway to prevent infinite loop
        sorted.push(...remaining);
        break;
      }

      // Sort ready tasks by priority
      readyTasks.sort((a, b) => a.priority - b.priority);

      // Add the highest priority task
      const nextTask = readyTasks[0];
      sorted.push(nextTask);

      // Remove from remaining
      const index = remaining.findIndex(t => t.id === nextTask.id);
      remaining.splice(index, 1);
    }

    return sorted;
  }

  /**
   * Resolve parameter dependencies using completed task results
   */
  private resolveDependencies(subtask: SubTask, completedTasks: Record<string, ToolExecutionResult>): SubTask {
    const resolvedParameters = { ...subtask.parameters };

    // Look for dependency placeholders in parameters
    for (const [key, value] of Object.entries(resolvedParameters)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const dependencyRef = value.slice(2, -1); // Remove ${ and }
        const [taskId, property] = dependencyRef.split('.');

        if (completedTasks[taskId]) {
          const taskResult = completedTasks[taskId];

          if (property && taskResult.metadata[property]) {
            resolvedParameters[key] = taskResult.metadata[property];
          } else if (taskResult.data.length > 0 && taskResult.data[0].metadata) {
            // Try to extract from first result's metadata
            const firstResult = taskResult.data[0];
            if (property && firstResult.metadata[property]) {
              resolvedParameters[key] = firstResult.metadata[property];
            } else {
              // Fallback: use the target from the original subtask
              resolvedParameters[key] = subtask.parameters.class_name || 'Unknown';
            }
          }
        }
      }
    }

    return {
      ...subtask,
      parameters: resolvedParameters
    };
  }

  /**
   * Generate cache key for subtask
   */
  private generateCacheKey(subtask: SubTask): string {
    const paramString = JSON.stringify(subtask.parameters);
    return `${subtask.toolName}:${paramString}`;
  }

  /**
   * Calculate workflow metrics
   */
  private calculateWorkflowMetrics(results: ToolExecutionResult[], totalExecutionTime: number): WorkflowMetrics {
    const successfulExecutions = results.filter(r => r.success).length;
    const failedExecutions = results.length - successfulExecutions;
    const averageExecutionTime = results.reduce((sum, r) => sum + (r.executionTime || 0), 0) / results.length;

    return {
      toolsExecuted: results.length,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime,
      cacheHitRate: this.stats.cacheStats.hits / (this.stats.cacheStats.hits + this.stats.cacheStats.misses)
    };
  }

  /**
   * Update orchestrator statistics
   */
  private updateStats(decomposition: TaskDecomposition, execution: WorkflowExecution): void {
    this.stats.totalWorkflows++;

    if (execution.success) {
      this.stats.successfulWorkflows++;
    }

    // Update average execution time
    const totalTime = this.stats.averageExecutionTime * (this.stats.totalWorkflows - 1) + execution.executionTime;
    this.stats.averageExecutionTime = totalTime / this.stats.totalWorkflows;

    // Update popular tools
    for (const subtask of decomposition.subtasks) {
      const existingTool = this.stats.popularTools.find(t => t.toolName === subtask.toolName);
      if (existingTool) {
        existingTool.usageCount++;
      } else {
        this.stats.popularTools.push({
          toolName: subtask.toolName,
          usageCount: 1,
          successRate: 1.0
        });
      }
    }

    // Sort popular tools by usage
    this.stats.popularTools.sort((a, b) => b.usageCount - a.usageCount);

    // Update cache stats
    this.stats.cacheStats.hitRate = this.stats.cacheStats.hits / (this.stats.cacheStats.hits + this.stats.cacheStats.misses);
  }
}
