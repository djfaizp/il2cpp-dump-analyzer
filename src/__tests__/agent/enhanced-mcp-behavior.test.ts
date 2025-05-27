/**
 * @fileoverview Enhanced MCP Behavior Testing
 * Comprehensive test suite for agentic MCP workflow validation, testing intelligent
 * orchestration, context management, tool selection, response synthesis, and performance optimization
 */

import {
  MCPOrchestrator,
  MCPContextManager,
  MCPToolSelector,
  MCPResponseSynthesizer,
  MCPPerformanceOptimizer
} from '../../agent';
import {
  TaskDecomposition,
  WorkflowExecutionResult,
  MCPExecutionContext,
  ToolSelectionResult,
  SynthesisResult,
  PerformanceMetrics
} from '../../agent/types';
import { ToolExecutionContext } from '../../mcp/base-tool-handler';

// Mock dependencies
jest.mock('../../mcp/mcp-sdk-server');
jest.mock('../../mcp/tools/tool-registry');
jest.mock('../../embeddings/xenova-embeddings');
jest.mock('../../embeddings/vector-store');

describe('Enhanced MCP Behavior Testing', () => {
  let orchestrator: MCPOrchestrator;
  let contextManager: MCPContextManager;
  let toolSelector: MCPToolSelector;
  let responseSynthesizer: MCPResponseSynthesizer;
  let performanceOptimizer: MCPPerformanceOptimizer;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    // Create mock execution context
    mockContext = {
      vectorStore: {
        similaritySearch: jest.fn(),
        addDocuments: jest.fn(),
        searchWithFilter: jest.fn()
      } as any,
      embeddings: {
        embedQuery: jest.fn(),
        embedDocuments: jest.fn()
      } as any,
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    };

    // Initialize agent components
    orchestrator = new MCPOrchestrator(mockContext);
    contextManager = new MCPContextManager(mockContext);
    toolSelector = new MCPToolSelector(mockContext);
    responseSynthesizer = new MCPResponseSynthesizer(mockContext);
    performanceOptimizer = new MCPPerformanceOptimizer({
      enableCaching: true,
      enableMonitoring: true,
      enableLearning: true,
      enableDeduplication: true,
      monitoringIntervalMs: 100
    });
  });

  afterEach(() => {
    performanceOptimizer.dispose();
  });

  describe('Comprehensive Agentic MCP Workflow Tests', () => {
    it('should execute complete agentic workflow for complex IL2CPP analysis', async () => {
      // Arrange: Complex multi-step analysis request
      const complexRequest = {
        query: "Analyze the PlayerController class, find its dependencies, detect design patterns, and generate improved code",
        intent: "comprehensive_analysis",
        context: {
          sessionId: 'test-session-001',
          userId: 'test-user',
          preferences: {
            includeCodeGeneration: true,
            analysisDepth: 'deep',
            outputFormat: 'detailed'
          }
        }
      };

      // Mock tool responses for the workflow
      const mockSearchResults = [
        {
          pageContent: `
            public class PlayerController : MonoBehaviour
            {
                private float speed = 5.0f;
                private Vector3 position;
                private PlayerState currentState;

                public override void Start() { }
                public override void Update() { }
                private void HandleMovement() { }
                public void SetSpeed(float newSpeed) { speed = newSpeed; }
            }
          `,
          metadata: {
            name: 'PlayerController',
            type: 'class',
            namespace: 'Game.Player',
            baseClass: 'MonoBehaviour'
          }
        }
      ];

      const mockDependencyResults = {
        dependencies: [
          { name: 'MonoBehaviour', type: 'inheritance', strength: 'strong' },
          { name: 'Vector3', type: 'field', strength: 'medium' },
          { name: 'PlayerState', type: 'field', strength: 'medium' }
        ],
        circularDependencies: [],
        dependencyGraph: { nodes: 4, edges: 3 }
      };

      const mockPatternResults = {
        patterns: [
          {
            type: 'state',
            confidence: 0.85,
            description: 'State pattern detected in PlayerState usage',
            instances: ['PlayerController.currentState']
          }
        ]
      };

      // Mock vector store responses
      mockContext.vectorStore.searchWithFilter = jest.fn()
        .mockResolvedValueOnce(mockSearchResults) // search_code
        .mockResolvedValueOnce(mockSearchResults) // find_class_hierarchy
        .mockResolvedValueOnce(mockSearchResults); // analyze_dependencies

      // Act: Execute the complete agentic workflow
      const sessionId = await contextManager.createSession('test-user', { analysisType: 'comprehensive' });

      // Step 1: Task decomposition
      const decomposition = await orchestrator.decomposeTask(complexRequest);
      expect(decomposition.subtasks.length).toBeGreaterThan(1);
      expect(decomposition.executionStrategy).toBeDefined();

      // Step 2: Context-aware tool selection
      const toolSelections: ToolSelectionResult[] = [];
      for (const subtask of decomposition.subtasks) {
        const selection = await toolSelector.selectOptimalTool(subtask, {
          sessionId,
          previousResults: toolSelections.map(s => ({ toolName: s.toolName, success: true })),
          contextSize: 'medium'
        });
        toolSelections.push(selection);
      }

      // Step 3: Workflow execution with performance optimization
      const workflowResult = await performanceOptimizer.getCachedOrExecute(
        'analysis',
        `workflow-${complexRequest.query}`,
        async () => {
          return await orchestrator.executeWorkflow(decomposition);
        },
        {
          requestId: 'req-001',
          toolName: 'orchestrator',
          parameters: complexRequest,
          timestamp: Date.now()
        }
      );

      // Step 4: Response synthesis
      const synthesisResult = await responseSynthesizer.synthesizeResponse(
        workflowResult.results || [],
        {
          query: complexRequest.query,
          intent: complexRequest.intent,
          outputFormat: 'comprehensive',
          includeMetadata: true
        }
      );

      // Assert: Validate complete workflow execution
      expect(workflowResult.success).toBe(true);
      expect(workflowResult.results).toBeDefined();
      expect(synthesisResult.content).toBeDefined();
      expect(synthesisResult.quality.overallScore).toBeGreaterThan(0.7);

      // Validate context preservation
      const sessionContext = await contextManager.getSessionContext(sessionId);
      expect(sessionContext.toolExecutions.length).toBeGreaterThan(0);
      expect(sessionContext.analysisHistory.length).toBeGreaterThan(0);

      // Validate performance optimization
      const cacheStats = performanceOptimizer.getCacheStatistics();
      expect(cacheStats.get('analysis')?.totalRequests).toBeGreaterThan(0);
    });

    it('should handle intelligent task decomposition for different request types', async () => {
      const testCases = [
        {
          request: { query: "Find all MonoBehaviour classes", intent: "simple_search" },
          expectedTools: ['find_monobehaviours'],
          expectedStrategy: 'sequential'
        },
        {
          request: { query: "Analyze PlayerController dependencies and generate wrapper", intent: "analysis_and_generation" },
          expectedTools: ['search_code', 'analyze_dependencies', 'generate_class_wrapper'],
          expectedStrategy: 'sequential'
        },
        {
          request: { query: "Find all design patterns and enum values", intent: "parallel_analysis" },
          expectedTools: ['find_design_patterns', 'find_enum_values'],
          expectedStrategy: 'parallel'
        }
      ];

      for (const testCase of testCases) {
        const decomposition = await orchestrator.decomposeTask(testCase.request);

        expect(decomposition.subtasks.length).toBeGreaterThan(0);
        expect(decomposition.executionStrategy).toBe(testCase.expectedStrategy);

        const toolNames = decomposition.subtasks.map(task => task.toolName);
        testCase.expectedTools.forEach(expectedTool => {
          expect(toolNames).toContain(expectedTool);
        });
      }
    });

    it('should validate context preservation across MCP tool calls', async () => {
      // Arrange: Multi-step analysis with context dependencies
      const sessionId = await contextManager.createSession('test-user', {
        analysisType: 'contextual',
        preserveIntermediateResults: true
      });

      const step1Request = { query: "Find PlayerController class", intent: "search" };
      const step2Request = { query: "Analyze dependencies of the found class", intent: "dependency_analysis" };
      const step3Request = { query: "Generate improved version based on analysis", intent: "code_generation" };

      // Mock responses for each step
      mockContext.vectorStore.searchWithFilter = jest.fn()
        .mockResolvedValueOnce([{
          pageContent: 'PlayerController class content',
          metadata: { name: 'PlayerController', type: 'class' }
        }])
        .mockResolvedValueOnce([{
          pageContent: 'Dependency analysis results',
          metadata: { dependencies: ['MonoBehaviour', 'Vector3'] }
        }]);

      // Act: Execute steps with context preservation
      const step1Result = await orchestrator.executeWorkflow(
        await orchestrator.decomposeTask(step1Request)
      );

      await contextManager.addToolExecution(sessionId, {
        toolName: 'search_code',
        parameters: step1Request,
        result: step1Result,
        timestamp: Date.now(),
        executionTime: 100
      });

      const step2Result = await orchestrator.executeWorkflow(
        await orchestrator.decomposeTask(step2Request)
      );

      await contextManager.addToolExecution(sessionId, {
        toolName: 'analyze_dependencies',
        parameters: step2Request,
        result: step2Result,
        timestamp: Date.now(),
        executionTime: 200
      });

      // Assert: Validate context preservation and correlation
      const sessionContext = await contextManager.getSessionContext(sessionId);
      expect(sessionContext.toolExecutions).toHaveLength(2);

      const correlatedResults = await contextManager.findCorrelatedResults(
        sessionId,
        'PlayerController',
        0.8
      );
      expect(correlatedResults.length).toBeGreaterThan(0);

      // Validate context-aware recommendations
      const recommendations = await contextManager.getContextualRecommendations(sessionId);
      expect(recommendations.suggestedTools.length).toBeGreaterThan(0);
      expect(recommendations.reasoning).toBeDefined();
    });
  });

  describe('Error Recovery and Retry Mechanisms', () => {
    it('should handle tool execution failures with intelligent retry', async () => {
      // Arrange: Mock tool that fails initially then succeeds
      let attemptCount = 0;
      const flakyOperation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error(`Transient error attempt ${attemptCount}`);
        }
        return Promise.resolve({ success: true, data: 'recovered result' });
      });

      // Act: Execute with retry mechanism
      const result = await performanceOptimizer.getCachedOrExecute(
        'search',
        'flaky-operation',
        flakyOperation
      );

      // Assert: Should eventually succeed
      expect(result.success).toBe(true);
      expect(result.data).toBe('recovered result');
      expect(attemptCount).toBe(3);
    });

    it('should provide graceful degradation when tools are unavailable', async () => {
      // Arrange: Request that requires unavailable tool
      const requestWithUnavailableTool = {
        query: "Use unavailable_tool to analyze code",
        intent: "analysis"
      };

      // Mock tool selector to handle unavailable tool
      jest.spyOn(toolSelector, 'selectOptimalTool').mockResolvedValue({
        toolName: 'search_code', // Fallback tool
        confidence: 0.6,
        reasoning: 'Fallback to available search tool',
        parameters: { query: 'analyze code' },
        alternatives: [],
        executionPlan: {
          estimatedTime: 2000,
          complexity: 'medium',
          dependencies: [],
          parallelizable: false
        }
      });

      // Act: Execute with graceful degradation
      const decomposition = await orchestrator.decomposeTask(requestWithUnavailableTool);
      const result = await orchestrator.executeWorkflow(decomposition);

      // Assert: Should provide alternative solution
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('fallback') || w.includes('alternative'))).toBe(true);
    });

    it('should handle workflow timeouts and partial results', async () => {
      // Arrange: Long-running workflow with timeout
      const longRunningRequest = {
        query: "Perform comprehensive analysis with timeout",
        intent: "comprehensive_analysis",
        timeout: 1000 // 1 second timeout
      };

      // Mock slow operations
      mockContext.vectorStore.searchWithFilter = jest.fn()
        .mockImplementation(() => new Promise(resolve =>
          setTimeout(() => resolve([]), 2000) // 2 second delay
        ));

      // Act: Execute with timeout handling
      const startTime = Date.now();
      const decomposition = await orchestrator.decomposeTask(longRunningRequest);
      const result = await orchestrator.executeWorkflow(decomposition);
      const executionTime = Date.now() - startTime;

      // Assert: Should handle timeout gracefully
      expect(executionTime).toBeLessThan(1500); // Should not wait full 2 seconds
      expect(result.partialResults).toBeDefined();
      expect(result.warnings?.some(w => w.includes('timeout'))).toBe(true);
    });
  });

  describe('Performance Benchmarking for Enhanced MCP Response Times', () => {
    it('should meet performance benchmarks for different workflow types', async () => {
      const benchmarks = [
        { type: 'simple_search', maxTime: 2000, request: { query: "Find Player", intent: "search" } },
        { type: 'analysis', maxTime: 5000, request: { query: "Analyze dependencies", intent: "analysis" } },
        { type: 'generation', maxTime: 8000, request: { query: "Generate wrapper", intent: "generation" } }
      ];

      for (const benchmark of benchmarks) {
        const startTime = Date.now();

        // Execute workflow
        const decomposition = await orchestrator.decomposeTask(benchmark.request);
        const result = await orchestrator.executeWorkflow(decomposition);

        const executionTime = Date.now() - startTime;

        // Assert: Should meet performance benchmark
        expect(executionTime).toBeLessThan(benchmark.maxTime);
        expect(result.success).toBe(true);

        console.log(`${benchmark.type} completed in ${executionTime}ms (benchmark: ${benchmark.maxTime}ms)`);
      }
    });

    it('should demonstrate performance improvements with caching', async () => {
      const testQuery = { query: "Find MonoBehaviour classes", intent: "search" };

      // First execution (cache miss)
      const startTime1 = Date.now();
      const result1 = await performanceOptimizer.getCachedOrExecute(
        'search',
        'monobehaviour-search',
        async () => {
          const decomposition = await orchestrator.decomposeTask(testQuery);
          return await orchestrator.executeWorkflow(decomposition);
        }
      );
      const time1 = Date.now() - startTime1;

      // Second execution (cache hit)
      const startTime2 = Date.now();
      const result2 = await performanceOptimizer.getCachedOrExecute(
        'search',
        'monobehaviour-search',
        async () => {
          const decomposition = await orchestrator.decomposeTask(testQuery);
          return await orchestrator.executeWorkflow(decomposition);
        }
      );
      const time2 = Date.now() - startTime2;

      // Assert: Cache hit should be significantly faster
      expect(time2).toBeLessThan(time1 * 0.1); // At least 10x faster
      expect(result1).toEqual(result2); // Same results

      const cacheStats = performanceOptimizer.getCacheStatistics();
      expect(cacheStats.get('search')?.hits).toBeGreaterThan(0);
    });

    it('should optimize performance based on learning patterns', async () => {
      // Execute same operation multiple times to build learning patterns
      const operations = Array.from({ length: 5 }, (_, i) => ({
        query: `Find class ${i}`,
        intent: "search"
      }));

      const executionTimes: number[] = [];

      for (const operation of operations) {
        const startTime = Date.now();

        await performanceOptimizer.getCachedOrExecute(
          'search',
          `learning-${operation.query}`,
          async () => {
            const decomposition = await orchestrator.decomposeTask(operation);
            return await orchestrator.executeWorkflow(decomposition);
          },
          {
            requestId: `req-${Date.now()}`,
            toolName: 'orchestrator',
            parameters: operation,
            timestamp: Date.now()
          }
        );

        executionTimes.push(Date.now() - startTime);
      }

      // Assert: Should show learning and optimization over time
      const learningPatterns = performanceOptimizer.getLearningPatterns();
      expect(learningPatterns.size).toBeGreaterThan(0);

      const recommendations = performanceOptimizer.getOptimizationRecommendations();
      expect(recommendations.length).toBeGreaterThan(0);

      console.log('Execution times:', executionTimes);
      console.log('Learning patterns:', learningPatterns.size);
      console.log('Optimization recommendations:', recommendations);
    });
  });

  describe('Intelligent Task Decomposition and Execution Scenarios', () => {
    it('should decompose complex multi-domain requests correctly', async () => {
      const complexRequests = [
        {
          query: "Find all Unity MonoBehaviour classes, analyze their design patterns, and generate improved templates",
          expectedPhases: ['search', 'analysis', 'generation'],
          expectedTools: ['find_monobehaviours', 'find_design_patterns', 'generate_monobehaviour_template'],
          expectedStrategy: 'sequential'
        },
        {
          query: "Search for Player and Enemy classes simultaneously and compare their hierarchies",
          expectedPhases: ['search', 'analysis'],
          expectedTools: ['search_code', 'find_class_hierarchy'],
          expectedStrategy: 'parallel'
        },
        {
          query: "Generate comprehensive documentation for all game manager classes including dependencies and patterns",
          expectedPhases: ['search', 'analysis', 'generation'],
          expectedTools: ['search_code', 'analyze_dependencies', 'find_design_patterns', 'generate_class_wrapper'],
          expectedStrategy: 'sequential'
        }
      ];

      for (const testCase of complexRequests) {
        const decomposition = await orchestrator.decomposeTask({
          query: testCase.query,
          intent: 'complex_analysis'
        });

        // Validate decomposition structure
        expect(decomposition.subtasks.length).toBeGreaterThan(1);
        expect(decomposition.executionStrategy).toBe(testCase.expectedStrategy);

        // Validate tool selection
        const selectedTools = decomposition.subtasks.map(task => task.toolName);
        testCase.expectedTools.forEach(expectedTool => {
          expect(selectedTools).toContain(expectedTool);
        });

        // Validate phase organization
        const phases = [...new Set(decomposition.subtasks.map(task => task.phase))];
        testCase.expectedPhases.forEach(expectedPhase => {
          expect(phases).toContain(expectedPhase);
        });

        console.log(`Complex request decomposed into ${decomposition.subtasks.length} subtasks with ${decomposition.executionStrategy} strategy`);
      }
    });

    it('should handle dependency resolution in sequential workflows', async () => {
      // Arrange: Request that requires dependency resolution
      const dependentRequest = {
        query: "Find PlayerController, analyze its dependencies, then generate an improved version",
        intent: "dependent_workflow"
      };

      // Mock responses that create dependencies
      mockContext.vectorStore.searchWithFilter = jest.fn()
        .mockResolvedValueOnce([{
          pageContent: 'PlayerController class content',
          metadata: { name: 'PlayerController', type: 'class', namespace: 'Game.Player' }
        }])
        .mockResolvedValueOnce([{
          pageContent: 'Dependency analysis results',
          metadata: {
            dependencies: ['MonoBehaviour', 'Vector3', 'PlayerState'],
            circularDependencies: [],
            couplingScore: 0.6
          }
        }]);

      // Act: Execute dependent workflow
      const decomposition = await orchestrator.decomposeTask(dependentRequest);
      const result = await orchestrator.executeWorkflow(decomposition);

      // Assert: Validate dependency resolution
      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();

      // Verify that dependent tasks received outputs from previous tasks
      const taskResults = result.results || [];
      expect(taskResults.length).toBeGreaterThan(1);

      // Later tasks should have access to earlier results
      for (let i = 1; i < taskResults.length; i++) {
        const currentTask = taskResults[i];
        expect(currentTask.context).toBeDefined();
        expect(currentTask.context.previousResults).toBeDefined();
      }
    });

    it('should optimize parallel execution for independent tasks', async () => {
      // Arrange: Request with parallelizable tasks
      const parallelRequest = {
        query: "Find all enums and design patterns in the codebase",
        intent: "parallel_analysis"
      };

      // Mock independent operations
      mockContext.vectorStore.searchWithFilter = jest.fn()
        .mockImplementation((query: string) => {
          const delay = Math.random() * 100 + 50; // Random delay 50-150ms
          return new Promise(resolve => setTimeout(() => resolve([{
            pageContent: `Results for ${query}`,
            metadata: { query, type: 'mock_result' }
          }]), delay));
        });

      // Act: Execute parallel workflow
      const startTime = Date.now();
      const decomposition = await orchestrator.decomposeTask(parallelRequest);
      const result = await orchestrator.executeWorkflow(decomposition);
      const totalTime = Date.now() - startTime;

      // Assert: Parallel execution should be faster than sequential
      expect(decomposition.executionStrategy).toBe('parallel');
      expect(result.success).toBe(true);

      // Parallel execution should complete faster than sum of individual times
      const estimatedSequentialTime = decomposition.subtasks.reduce(
        (sum, task) => sum + (task.estimatedExecutionTime || 1000), 0
      );
      expect(totalTime).toBeLessThan(estimatedSequentialTime * 0.8);

      console.log(`Parallel execution completed in ${totalTime}ms vs estimated sequential ${estimatedSequentialTime}ms`);
    });

    it('should adapt execution strategy based on resource constraints', async () => {
      // Arrange: Simulate resource constraints
      const resourceConstrainedRequest = {
        query: "Perform comprehensive analysis of all classes",
        intent: "resource_intensive",
        constraints: {
          maxMemoryUsage: '512MB',
          maxExecutionTime: 10000,
          maxConcurrentOperations: 2
        }
      };

      // Mock resource monitoring
      jest.spyOn(performanceOptimizer, 'getPerformanceMetrics').mockReturnValue([{
        timestamp: Date.now(),
        memoryUsage: {
          heapUsed: 400 * 1024 * 1024, // 400MB used
          heapTotal: 512 * 1024 * 1024, // 512MB total
          external: 50 * 1024 * 1024,
          rss: 450 * 1024 * 1024
        },
        cacheMetrics: new Map(),
        activeRequests: 1,
        learningPatterns: 5
      }]);

      // Act: Execute with resource constraints
      const decomposition = await orchestrator.decomposeTask(resourceConstrainedRequest);
      const result = await orchestrator.executeWorkflow(decomposition);

      // Assert: Should adapt to resource constraints
      expect(result.success).toBe(true);

      // Should limit concurrent operations
      const maxConcurrentTasks = Math.max(...decomposition.subtasks.map(task =>
        task.dependencies?.length || 0
      ));
      expect(maxConcurrentTasks).toBeLessThanOrEqual(2);

      // Should include resource optimization warnings
      expect(result.warnings?.some(w =>
        w.includes('resource') || w.includes('memory') || w.includes('optimization')
      )).toBe(true);
    });

    it('should handle mixed synchronous and asynchronous task execution', async () => {
      // Arrange: Mixed execution request
      const mixedRequest = {
        query: "Search for classes, generate immediate summary, then perform deep analysis",
        intent: "mixed_execution"
      };

      // Mock mixed response times
      let callCount = 0;
      mockContext.vectorStore.searchWithFilter = jest.fn()
        .mockImplementation(() => {
          callCount++;
          const delay = callCount === 1 ? 50 : callCount === 2 ? 10 : 200; // Fast, immediate, slow
          return new Promise(resolve => setTimeout(() => resolve([{
            pageContent: `Result ${callCount}`,
            metadata: { callOrder: callCount, executionTime: delay }
          }]), delay));
        });

      // Act: Execute mixed workflow
      const decomposition = await orchestrator.decomposeTask(mixedRequest);
      const result = await orchestrator.executeWorkflow(decomposition);

      // Assert: Should handle mixed execution correctly
      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();

      // Verify execution order and timing
      const executionOrder = result.results?.map(r => r.metadata?.callOrder) || [];
      expect(executionOrder.length).toBeGreaterThan(0);

      // Should maintain logical execution order despite timing differences
      for (let i = 1; i < executionOrder.length; i++) {
        if (decomposition.executionStrategy === 'sequential') {
          expect(executionOrder[i]).toBeGreaterThan(executionOrder[i - 1]);
        }
      }
    });
  });

  describe('Advanced Context Management and Learning', () => {
    it('should build and utilize session knowledge over time', async () => {
      const sessionId = await contextManager.createSession('test-user', {
        learningEnabled: true,
        knowledgeRetention: 'session'
      });

      // Execute a series of related queries to build knowledge
      const learningQueries = [
        { query: "Find PlayerController class", intent: "search" },
        { query: "What are the dependencies of PlayerController?", intent: "analysis" },
        { query: "Are there any design patterns in PlayerController?", intent: "pattern_analysis" },
        { query: "Generate an improved PlayerController", intent: "generation" }
      ];

      const queryResults = [];
      for (const [index, query] of learningQueries.entries()) {
        // Mock progressive knowledge building
        mockContext.vectorStore.searchWithFilter = jest.fn().mockResolvedValue([{
          pageContent: `Enhanced result ${index + 1} based on session knowledge`,
          metadata: {
            sessionKnowledge: index > 0,
            previousQueries: index,
            confidenceBoost: index * 0.1
          }
        }]);

        const decomposition = await orchestrator.decomposeTask(query);
        const result = await orchestrator.executeWorkflow(decomposition);

        await contextManager.addToolExecution(sessionId, {
          toolName: decomposition.subtasks[0]?.toolName || 'unknown',
          parameters: query,
          result,
          timestamp: Date.now(),
          executionTime: 100 + index * 50
        });

        queryResults.push(result);
      }

      // Assert: Later queries should benefit from session knowledge
      const sessionContext = await contextManager.getSessionContext(sessionId);
      expect(sessionContext.toolExecutions.length).toBe(learningQueries.length);

      // Knowledge should accumulate over time
      expect(sessionContext.knowledgeBase.entities.size).toBeGreaterThan(0);
      expect(sessionContext.knowledgeBase.relationships.size).toBeGreaterThan(0);

      // Later queries should show improved confidence/performance
      const firstQueryTime = queryResults[0].executionTime || 0;
      const lastQueryTime = queryResults[queryResults.length - 1].executionTime || 0;

      // Should show learning improvements (faster execution or higher confidence)
      const learningImprovement = sessionContext.analytics.averageConfidenceScore > 0.7;
      expect(learningImprovement).toBe(true);
    });

    it('should provide intelligent cross-session recommendations', async () => {
      // Create multiple sessions with related activities
      const session1 = await contextManager.createSession('user1', { domain: 'player_systems' });
      const session2 = await contextManager.createSession('user2', { domain: 'player_systems' });

      // Add related activities to both sessions
      await contextManager.addToolExecution(session1, {
        toolName: 'search_code',
        parameters: { query: 'PlayerController' },
        result: { success: true, data: 'PlayerController analysis' },
        timestamp: Date.now(),
        executionTime: 150
      });

      await contextManager.addToolExecution(session2, {
        toolName: 'analyze_dependencies',
        parameters: { class_name: 'PlayerController' },
        result: { success: true, data: 'Dependency analysis' },
        timestamp: Date.now(),
        executionTime: 200
      });

      // Act: Get cross-session recommendations
      const recommendations = await contextManager.getContextualRecommendations(session1);

      // Assert: Should provide intelligent recommendations based on cross-session patterns
      expect(recommendations.suggestedTools.length).toBeGreaterThan(0);
      expect(recommendations.reasoning).toContain('similar');
      expect(recommendations.confidence).toBeGreaterThan(0.5);

      // Should suggest tools used successfully in similar contexts
      const suggestedToolNames = recommendations.suggestedTools.map(tool => tool.toolName);
      expect(suggestedToolNames).toContain('analyze_dependencies');
    });

    it('should optimize tool selection based on historical performance', async () => {
      const sessionId = await contextManager.createSession('test-user', {
        adaptiveLearning: true,
        performanceTracking: true
      });

      // Simulate historical performance data
      const performanceHistory = [
        { toolName: 'search_code', avgTime: 100, successRate: 0.95 },
        { toolName: 'find_monobehaviours', avgTime: 150, successRate: 0.90 },
        { toolName: 'find_class_hierarchy', avgTime: 200, successRate: 0.85 }
      ];

      // Mock tool selector to use performance history
      jest.spyOn(toolSelector, 'selectOptimalTool').mockImplementation(async (criteria, context) => {
        const bestTool = performanceHistory.reduce((best, current) =>
          (current.successRate / current.avgTime) > (best.successRate / best.avgTime) ? current : best
        );

        return {
          toolName: bestTool.toolName,
          confidence: bestTool.successRate,
          reasoning: `Selected based on performance: ${bestTool.successRate * 100}% success rate, ${bestTool.avgTime}ms avg time`,
          parameters: criteria.parameters || {},
          alternatives: performanceHistory.filter(tool => tool.toolName !== bestTool.toolName).map(tool => ({
            toolName: tool.toolName,
            confidence: tool.successRate * 0.9,
            reasoning: `Alternative with ${tool.successRate * 100}% success rate`
          })),
          executionPlan: {
            estimatedTime: bestTool.avgTime,
            complexity: 'medium',
            dependencies: [],
            parallelizable: true
          }
        };
      });

      // Act: Request tool selection
      const selection = await toolSelector.selectOptimalTool(
        {
          intent: 'search',
          parameters: { query: 'test' },
          constraints: { maxExecutionTime: 300 }
        },
        { sessionId, contextSize: 'small' }
      );

      // Assert: Should select optimal tool based on performance
      expect(selection.toolName).toBe('search_code'); // Best performance ratio
      expect(selection.confidence).toBe(0.95);
      expect(selection.reasoning).toContain('performance');
      expect(selection.alternatives.length).toBeGreaterThan(0);
    });
  });
});
