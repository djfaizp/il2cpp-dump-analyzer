/**
 * @fileoverview Agentic Workflow Integration Testing
 * Focused test suite for core agentic MCP workflow validation without external dependencies
 */

import { MCPOrchestrator } from '../../agent/mcp-orchestrator';
import { MCPContextManager } from '../../agent/mcp-context-manager';
import { MCPToolSelector } from '../../agent/mcp-tool-selector';
import { MCPResponseSynthesizer } from '../../agent/mcp-response-synthesizer';
import { MCPPerformanceOptimizer } from '../../agent/mcp-performance-optimizer';
import { ToolExecutionContext } from '../../mcp/base-tool-handler';

// Mock all external dependencies
jest.mock('../../mcp/mcp-sdk-server', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../mcp/tools/tool-registry', () => ({
  getAllToolNames: jest.fn(() => [
    'search_code',
    'find_monobehaviours',
    'find_class_hierarchy',
    'analyze_dependencies',
    'find_design_patterns',
    'generate_class_wrapper'
  ]),
  getToolMetadata: jest.fn((toolName: string) => ({
    name: toolName,
    category: toolName.includes('generate') ? 'generation' : toolName.includes('analyze') ? 'analysis' : 'search',
    complexity: 'medium',
    estimatedExecutionTime: '2-5 seconds',
    requiredParameters: ['query'],
    optionalParameters: ['filter_type', 'top_k'],
    outputFormat: 'JSON with results and metadata'
  })),
  isValidTool: jest.fn(() => true)
}));

describe('Agentic Workflow Integration Testing', () => {
  let orchestrator: MCPOrchestrator;
  let contextManager: MCPContextManager;
  let toolSelector: MCPToolSelector;
  let responseSynthesizer: MCPResponseSynthesizer;
  let performanceOptimizer: MCPPerformanceOptimizer;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    // Create minimal mock context
    mockContext = {
      vectorStore: {
        similaritySearch: jest.fn().mockResolvedValue([]),
        addDocuments: jest.fn().mockResolvedValue(undefined),
        searchWithFilter: jest.fn().mockResolvedValue([
          {
            pageContent: 'Mock IL2CPP class content',
            metadata: { name: 'TestClass', type: 'class' }
          }
        ])
      } as any,
      embeddings: {
        embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        embedDocuments: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]])
      } as any,
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    };

    // Initialize components with minimal configuration
    orchestrator = new MCPOrchestrator(mockContext);
    contextManager = new MCPContextManager(mockContext);
    toolSelector = new MCPToolSelector(mockContext);
    responseSynthesizer = new MCPResponseSynthesizer(mockContext);
    performanceOptimizer = new MCPPerformanceOptimizer({
      enableCaching: true,
      enableMonitoring: false, // Disable monitoring to avoid async issues
      enableLearning: true,
      enableDeduplication: true,
      monitoringIntervalMs: 0 // Disable interval
    });
  });

  afterEach(() => {
    performanceOptimizer.dispose();
  });

  describe('Core Agentic Workflow Functionality', () => {
    it('should decompose simple search requests correctly', async () => {
      const simpleRequest = {
        query: "Find PlayerController class",
        intent: "search"
      };

      const decomposition = await orchestrator.decomposeTask(simpleRequest);

      expect(decomposition).toBeDefined();
      expect(decomposition.subtasks.length).toBeGreaterThan(0);
      expect(decomposition.executionStrategy).toBeDefined();
      expect(decomposition.subtasks[0].toolName).toBe('search_code');
      expect(decomposition.subtasks[0].parameters.query).toContain('PlayerController');
    });

    it('should decompose complex multi-step requests', async () => {
      const complexRequest = {
        query: "Find PlayerController, analyze its dependencies, and generate a wrapper class",
        intent: "comprehensive_analysis"
      };

      const decomposition = await orchestrator.decomposeTask(complexRequest);

      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(3);
      expect(decomposition.executionStrategy).toBe('sequential');
      
      const toolNames = decomposition.subtasks.map(task => task.toolName);
      expect(toolNames).toContain('search_code');
      expect(toolNames).toContain('analyze_dependencies');
      expect(toolNames).toContain('generate_class_wrapper');
    });

    it('should execute simple workflows successfully', async () => {
      const simpleRequest = {
        query: "Search for MonoBehaviour classes",
        intent: "search"
      };

      const decomposition = await orchestrator.decomposeTask(simpleRequest);
      const result = await orchestrator.executeWorkflow(decomposition);

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle tool selection based on intent', async () => {
      const testCases = [
        {
          criteria: { intent: 'search', parameters: { query: 'Player' } },
          expectedTool: 'search_code'
        },
        {
          criteria: { intent: 'monobehaviour_search', parameters: { query: 'Component' } },
          expectedTool: 'find_monobehaviours'
        },
        {
          criteria: { intent: 'dependency_analysis', parameters: { class_name: 'Player' } },
          expectedTool: 'analyze_dependencies'
        }
      ];

      for (const testCase of testCases) {
        const selection = await toolSelector.selectOptimalTool(testCase.criteria, {
          sessionId: 'test-session',
          contextSize: 'small'
        });

        expect(selection.toolName).toBe(testCase.expectedTool);
        expect(selection.confidence).toBeGreaterThan(0.5);
        expect(selection.reasoning).toBeDefined();
      }
    });

    it('should manage session context correctly', async () => {
      const sessionId = await contextManager.createSession('test-user', {
        analysisType: 'comprehensive'
      });

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');

      // Add tool execution to session
      await contextManager.addToolExecution(sessionId, {
        toolName: 'search_code',
        parameters: { query: 'PlayerController' },
        result: { success: true, data: 'Mock result' },
        timestamp: Date.now(),
        executionTime: 100
      });

      const sessionContext = await contextManager.getSessionContext(sessionId);
      expect(sessionContext.toolExecutions.length).toBe(1);
      expect(sessionContext.toolExecutions[0].toolName).toBe('search_code');
    });

    it('should synthesize responses from multiple tool results', async () => {
      const mockResults = [
        {
          toolName: 'search_code',
          success: true,
          data: [
            {
              pageContent: 'PlayerController class definition',
              metadata: { name: 'PlayerController', type: 'class' }
            }
          ],
          executionTime: 100
        },
        {
          toolName: 'analyze_dependencies',
          success: true,
          data: {
            dependencies: ['MonoBehaviour', 'Vector3'],
            circularDependencies: [],
            couplingScore: 0.6
          },
          executionTime: 200
        }
      ];

      const synthesisResult = await responseSynthesizer.synthesizeResponse(mockResults, {
        query: 'Analyze PlayerController',
        intent: 'comprehensive_analysis',
        outputFormat: 'detailed',
        includeMetadata: true
      });

      expect(synthesisResult.content).toBeDefined();
      expect(synthesisResult.quality.overallScore).toBeGreaterThan(0);
      expect(synthesisResult.metadata.toolsUsed).toEqual(['search_code', 'analyze_dependencies']);
      expect(synthesisResult.metadata.totalExecutionTime).toBe(300);
    });

    it('should optimize performance with caching', async () => {
      const testOperation = async () => ({
        success: true,
        data: 'Cached result',
        timestamp: Date.now()
      });

      // First execution (cache miss)
      const result1 = await performanceOptimizer.getCachedOrExecute(
        'search',
        'test-key',
        testOperation
      );

      // Second execution (cache hit)
      const result2 = await performanceOptimizer.getCachedOrExecute(
        'search',
        'test-key',
        testOperation
      );

      expect(result1).toEqual(result2);
      
      const cacheStats = performanceOptimizer.getCacheStatistics();
      expect(cacheStats.get('search')?.hits).toBe(1);
      expect(cacheStats.get('search')?.misses).toBe(1);
      expect(cacheStats.get('search')?.totalRequests).toBe(2);
    });

    it('should handle workflow errors gracefully', async () => {
      // Mock a failing tool execution
      mockContext.vectorStore.searchWithFilter = jest.fn().mockRejectedValue(
        new Error('Mock tool failure')
      );

      const request = {
        query: "Search for failing operation",
        intent: "search"
      };

      const decomposition = await orchestrator.decomposeTask(request);
      const result = await orchestrator.executeWorkflow(decomposition);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.errors?.[0]).toContain('Mock tool failure');
    });

    it('should provide contextual recommendations', async () => {
      const sessionId = await contextManager.createSession('test-user', {
        domain: 'unity_analysis'
      });

      // Add some execution history
      await contextManager.addToolExecution(sessionId, {
        toolName: 'search_code',
        parameters: { query: 'Player' },
        result: { success: true, data: 'Player results' },
        timestamp: Date.now(),
        executionTime: 150
      });

      const recommendations = await contextManager.getContextualRecommendations(sessionId);

      expect(recommendations.suggestedTools.length).toBeGreaterThan(0);
      expect(recommendations.reasoning).toBeDefined();
      expect(recommendations.confidence).toBeGreaterThan(0);
    });

    it('should track learning patterns', async () => {
      const testKey = 'learning-test';
      const operation = jest.fn().mockResolvedValue({ data: 'learning result' });

      // Execute multiple times to build patterns
      for (let i = 0; i < 3; i++) {
        await performanceOptimizer.getCachedOrExecute(
          'search',
          `${testKey}-${i}`,
          operation,
          {
            requestId: `req-${i}`,
            toolName: 'search_code',
            parameters: { query: `test-${i}` },
            timestamp: Date.now()
          }
        );
      }

      const learningPatterns = performanceOptimizer.getLearningPatterns();
      expect(learningPatterns.size).toBeGreaterThan(0);

      const recommendations = performanceOptimizer.getOptimizationRecommendations();
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should handle parallel execution strategies', async () => {
      const parallelRequest = {
        query: "Find enums and design patterns simultaneously",
        intent: "parallel_analysis"
      };

      const decomposition = await orchestrator.decomposeTask(parallelRequest);
      
      if (decomposition.executionStrategy === 'parallel') {
        const startTime = Date.now();
        const result = await orchestrator.executeWorkflow(decomposition);
        const executionTime = Date.now() - startTime;

        expect(result.success).toBe(true);
        expect(result.results?.length).toBeGreaterThan(1);
        
        // Parallel execution should be reasonably fast
        expect(executionTime).toBeLessThan(5000);
      }
    });
  });

  describe('Integration Validation', () => {
    it('should integrate all agentic components in a complete workflow', async () => {
      // Create session
      const sessionId = await contextManager.createSession('integration-test', {
        analysisType: 'comprehensive',
        enableLearning: true
      });

      // Complex request requiring multiple components
      const complexRequest = {
        query: "Find PlayerController class, analyze its structure, and provide optimization recommendations",
        intent: "comprehensive_analysis_with_recommendations"
      };

      // Step 1: Task decomposition
      const decomposition = await orchestrator.decomposeTask(complexRequest);
      expect(decomposition.subtasks.length).toBeGreaterThan(1);

      // Step 2: Execute workflow with performance optimization
      const workflowResult = await performanceOptimizer.getCachedOrExecute(
        'analysis',
        `integration-${complexRequest.query}`,
        async () => {
          return await orchestrator.executeWorkflow(decomposition);
        },
        {
          requestId: 'integration-test',
          toolName: 'orchestrator',
          parameters: complexRequest,
          timestamp: Date.now()
        }
      );

      expect(workflowResult.success).toBe(true);

      // Step 3: Add to session context
      await contextManager.addToolExecution(sessionId, {
        toolName: 'orchestrator',
        parameters: complexRequest,
        result: workflowResult,
        timestamp: Date.now(),
        executionTime: workflowResult.executionTime || 0
      });

      // Step 4: Synthesize final response
      const synthesisResult = await responseSynthesizer.synthesizeResponse(
        workflowResult.results || [],
        {
          query: complexRequest.query,
          intent: complexRequest.intent,
          outputFormat: 'comprehensive',
          includeMetadata: true
        }
      );

      // Validate complete integration
      expect(synthesisResult.content).toBeDefined();
      expect(synthesisResult.quality.overallScore).toBeGreaterThan(0.5);
      
      const sessionContext = await contextManager.getSessionContext(sessionId);
      expect(sessionContext.toolExecutions.length).toBe(1);
      
      const cacheStats = performanceOptimizer.getCacheStatistics();
      expect(cacheStats.get('analysis')?.totalRequests).toBeGreaterThan(0);
    });
  });
});
