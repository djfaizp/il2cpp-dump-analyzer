/**
 * @fileoverview Agentic Tool Orchestration Validation Test Suite
 * Tests the orchestrator's ability to intelligently chain existing MCP tools for complex analysis workflows
 * Validates real-world scenarios that users would actually request
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MCPOrchestrator } from '../../agent/mcp-orchestrator';
import { MCPContextManager } from '../../agent/mcp-context-manager';
import { MCPToolSelector } from '../../agent/mcp-tool-selector';
import { MCPResponseSynthesizer } from '../../agent/mcp-response-synthesizer';
import { MCPPerformanceOptimizer } from '../../agent/mcp-performance-optimizer';
import { ToolExecutionContext } from '../../mcp/base-tool-handler';
import { TaskDecomposition, WorkflowExecution } from '../../agent/types';

// Mock external dependencies
jest.mock('../../mcp/mcp-sdk-server', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../embeddings/xenova-embeddings', () => ({
  XenovaEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedDocuments: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]])
  }))
}));

// Comprehensive IL2CPP test data for realistic orchestration testing
const mockIL2CPPData = {
  classes: [
    {
      name: 'PlayerController',
      type: 'class',
      namespace: 'Game.Player',
      isMonoBehaviour: true,
      methods: ['Start', 'Update', 'Move', 'Jump', 'OnCollisionEnter'],
      fields: ['speed', 'jumpHeight', 'isGrounded', 'rigidbody'],
      dependencies: ['Rigidbody', 'Collider', 'InputManager', 'AudioSource'],
      baseClass: 'MonoBehaviour',
      interfaces: ['IMovable', 'IControllable'],
      attributes: ['SerializeField', 'RequireComponent']
    },
    {
      name: 'EnemyAI',
      type: 'class',
      namespace: 'Game.AI',
      isMonoBehaviour: true,
      methods: ['Start', 'Update', 'ChasePlayer', 'Attack', 'OnTriggerEnter'],
      fields: ['target', 'attackRange', 'health', 'navMeshAgent'],
      dependencies: ['PlayerController', 'NavMeshAgent', 'Animator'],
      baseClass: 'MonoBehaviour',
      interfaces: ['IEnemy', 'IDamageable'],
      attributes: ['SerializeField']
    },
    {
      name: 'GameManager',
      type: 'class',
      namespace: 'Game.Core',
      isMonoBehaviour: true,
      methods: ['Awake', 'Start', 'InitializeGame', 'GameOver', 'RestartGame'],
      fields: ['instance', 'gameState', 'score', 'lives'],
      dependencies: ['UIManager', 'AudioManager', 'SceneManager'],
      baseClass: 'MonoBehaviour',
      interfaces: ['IGameManager'],
      attributes: ['SerializeField'],
      designPatterns: ['Singleton']
    },
    {
      name: 'WeaponSystem',
      type: 'class',
      namespace: 'Game.Combat',
      isMonoBehaviour: true,
      methods: ['Start', 'Fire', 'Reload', 'SwitchWeapon'],
      fields: ['currentWeapon', 'ammunition', 'fireRate'],
      dependencies: ['PlayerController', 'AudioSource', 'ParticleSystem'],
      baseClass: 'MonoBehaviour',
      interfaces: ['IWeapon'],
      attributes: ['SerializeField']
    }
  ],
  enums: [
    {
      name: 'GameState',
      type: 'enum',
      namespace: 'Game.Core',
      values: ['Menu', 'Playing', 'Paused', 'GameOver']
    },
    {
      name: 'WeaponType',
      type: 'enum',
      namespace: 'Game.Combat',
      values: ['Pistol', 'Rifle', 'Shotgun', 'Grenade']
    }
  ]
};

describe('Agentic Tool Orchestration Validation', () => {
  let orchestrator: MCPOrchestrator;
  let contextManager: MCPContextManager;
  let toolSelector: MCPToolSelector;
  let responseSynthesizer: MCPResponseSynthesizer;
  let performanceOptimizer: MCPPerformanceOptimizer;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    // Create comprehensive mock execution context with realistic tool simulation
    mockContext = {
      vectorStore: {
        similaritySearch: jest.fn().mockImplementation(async (query: string, k: number) => {
          const allItems = [...mockIL2CPPData.classes, ...mockIL2CPPData.enums];
          const results = allItems
            .filter(item =>
              item.name.toLowerCase().includes(query.toLowerCase()) ||
              (item.methods && item.methods.some(m => m.toLowerCase().includes(query.toLowerCase()))) ||
              (item.namespace && item.namespace.toLowerCase().includes(query.toLowerCase()))
            )
            .slice(0, k)
            .map(item => ({
              pageContent: item.type === 'class'
                ? `class ${item.name} : ${item.baseClass || 'Object'} { ${item.methods?.join(', ') || ''} }`
                : `enum ${item.name} { ${item.values?.join(', ') || ''} }`,
              metadata: item
            }));
          return results;
        }),
        searchWithFilter: jest.fn().mockImplementation(async (query: string, filter: any, k: number) => {
          let results = [...mockIL2CPPData.classes, ...mockIL2CPPData.enums];

          // Apply filters
          if (filter.filter_type === 'class') {
            results = results.filter(item => item.type === 'class');
          }
          if (filter.filter_type === 'enum') {
            results = results.filter(item => item.type === 'enum');
          }
          if (filter.filter_monobehaviour) {
            results = results.filter(item => item.isMonoBehaviour);
          }
          if (filter.filter_namespace) {
            results = results.filter(item => item.namespace?.includes(filter.filter_namespace));
          }

          return results
            .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, k)
            .map(item => ({
              pageContent: item.type === 'class'
                ? `class ${item.name} { ${item.methods?.join(', ') || ''} }`
                : `enum ${item.name} { ${item.values?.join(', ') || ''} }`,
              metadata: item
            }));
        }),
        addDocuments: jest.fn()
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

    // Initialize agentic components with orchestration-focused configuration
    orchestrator = new MCPOrchestrator(mockContext, {
      maxWorkflowDepth: 5,
      maxParallelTools: 3,
      enableCaching: true,
      enableLearning: false,
      retryAttempts: 2,
      timeoutMs: 30000
    });

    contextManager = new MCPContextManager(mockContext, {
      maxActiveSessions: 10,
      enableCompression: true,
      enableCorrelation: true,
      cleanupIntervalMs: 0
    });

    toolSelector = new MCPToolSelector(mockContext, {
      selectionStrategy: 'balanced',
      enableCaching: true,
      enableLearning: false
    });

    responseSynthesizer = new MCPResponseSynthesizer(mockContext, {
      enableCaching: true,
      enableQualityAssessment: true
    });

    performanceOptimizer = new MCPPerformanceOptimizer({
      enableCaching: true,
      enableMonitoring: false,
      enableLearning: false,
      enableDeduplication: true
    });
  });

  afterEach(() => {
    performanceOptimizer.dispose();
    if (contextManager && typeof contextManager.dispose === 'function') {
      contextManager.dispose();
    }
  });

  describe('Complex MonoBehaviour Analysis Workflows', () => {
    it('should orchestrate MonoBehaviour → dependencies → patterns → generation workflow', async () => {
      // Arrange: Complex real-world request
      const complexRequest = 'Find PlayerController MonoBehaviour, analyze its dependencies, detect design patterns, and generate an improved wrapper class';

      // Act: Decompose the complex task
      const decomposition = await orchestrator.decomposeTask(complexRequest);

      // Assert: Validate intelligent task decomposition
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(3);
      expect(decomposition.confidence).toBeGreaterThan(0.6);
      expect(decomposition.executionStrategy).toMatch(/sequential|parallel/);

      // Verify that the orchestrator selected appropriate tools for the workflow
      const toolNames = decomposition.subtasks.map(task => task.toolName);
      expect(toolNames).toContain('find_monobehaviours');

      // Should include dependency analysis
      expect(toolNames.some(name => name.includes('dependencies') || name.includes('hierarchy'))).toBe(true);

      // Should include code generation
      expect(toolNames.some(name => name.includes('generate'))).toBe(true);

      // Execute the complete workflow
      const workflowResult = await orchestrator.executeWorkflow(decomposition);

      // Assert: Validate successful workflow execution
      expect(workflowResult.success).toBe(true);
      expect(workflowResult.results.length).toBe(decomposition.subtasks.length);
      expect(workflowResult.executionTime).toBeGreaterThan(0);
      expect(workflowResult.metrics).toBeDefined();
      expect(workflowResult.metrics.totalTools).toBe(decomposition.subtasks.length);
    });

    it('should handle class hierarchy deep analysis workflow', async () => {
      // Arrange: Hierarchical analysis request
      const hierarchyRequest = 'Search for all classes in Game.Player namespace, analyze their inheritance relationships, find cross-references, and document the API';

      // Act: Decompose and execute
      const decomposition = await orchestrator.decomposeTask(hierarchyRequest);
      const workflowResult = await orchestrator.executeWorkflow(decomposition);

      // Assert: Validate hierarchy-focused workflow
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(2);

      const toolNames = decomposition.subtasks.map(task => task.toolName);
      expect(toolNames).toContain('search_code');
      expect(toolNames.some(name => name.includes('hierarchy') || name.includes('cross_references'))).toBe(true);

      expect(workflowResult.success).toBe(true);
      expect(workflowResult.results.every(result => result.success)).toBe(true);
    });
  });

  describe('Design Pattern Detection Pipeline', () => {
    it('should orchestrate comprehensive design pattern analysis workflow', async () => {
      // Arrange: Pattern detection request
      const patternRequest = 'Search for all classes, analyze their structure, detect Singleton and Observer patterns, and generate pattern implementation examples';

      // Act: Execute pattern detection workflow
      const decomposition = await orchestrator.decomposeTask(patternRequest);
      const workflowResult = await orchestrator.executeWorkflow(decomposition);

      // Assert: Validate pattern detection workflow
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(2);

      const toolNames = decomposition.subtasks.map(task => task.toolName);
      expect(toolNames).toContain('search_code');
      expect(toolNames.some(name => name.includes('design_patterns'))).toBe(true);

      expect(workflowResult.success).toBe(true);
      expect(workflowResult.results.length).toBeGreaterThan(0);
    });

    it('should chain pattern detection with code generation intelligently', async () => {
      // Arrange: Pattern-based generation request
      const generationRequest = 'Find GameManager class, detect if it uses Singleton pattern, and generate an improved Singleton implementation';

      // Act: Execute pattern-to-generation workflow
      const decomposition = await orchestrator.decomposeTask(generationRequest);

      // Assert: Validate intelligent tool chaining
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(3);
      expect(decomposition.executionStrategy).toBe('sequential'); // Should be sequential due to dependencies

      const toolNames = decomposition.subtasks.map(task => task.toolName);
      expect(toolNames).toContain('search_code');
      expect(toolNames.some(name => name.includes('design_patterns'))).toBe(true);
      expect(toolNames.some(name => name.includes('generate'))).toBe(true);

      // Verify dependency chain
      const hasProperDependencies = decomposition.subtasks.some(task =>
        task.dependencies && task.dependencies.length > 0
      );
      expect(hasProperDependencies).toBe(true);
    });
  });

  describe('Parallel vs Sequential Execution Strategies', () => {
    it('should choose parallel execution for independent analysis tasks', async () => {
      // Arrange: Request with independent tasks
      const parallelRequest = 'Find all MonoBehaviours and all enums in the codebase';

      // Act: Decompose task
      const decomposition = await orchestrator.decomposeTask(parallelRequest);

      // Assert: Should prefer parallel execution for independent tasks
      expect(decomposition.executionStrategy).toBe('parallel');
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(2);

      // Verify tasks are independent (no dependencies)
      const hasNoDependencies = decomposition.subtasks.every(task =>
        !task.dependencies || task.dependencies.length === 0
      );
      expect(hasNoDependencies).toBe(true);

      // Execute and verify parallel execution works
      const workflowResult = await orchestrator.executeWorkflow(decomposition);
      expect(workflowResult.success).toBe(true);
      expect(workflowResult.executionTime).toBeLessThan(decomposition.estimatedDuration * 1.5); // Should be faster than sequential
    });

    it('should choose sequential execution for dependent analysis tasks', async () => {
      // Arrange: Request with dependent tasks
      const sequentialRequest = 'Find PlayerController class, then analyze its dependencies, then generate method stubs based on the dependency analysis';

      // Act: Decompose task
      const decomposition = await orchestrator.decomposeTask(sequentialRequest);

      // Assert: Should prefer sequential execution for dependent tasks
      expect(decomposition.executionStrategy).toBe('sequential');
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(3);

      // Verify tasks have dependencies
      const hasDependencies = decomposition.subtasks.some(task =>
        task.dependencies && task.dependencies.length > 0
      );
      expect(hasDependencies).toBe(true);

      // Execute and verify sequential execution works
      const workflowResult = await orchestrator.executeWorkflow(decomposition);
      expect(workflowResult.success).toBe(true);
      expect(workflowResult.results.length).toBe(decomposition.subtasks.length);
    });

    it('should handle mixed execution strategies in complex workflows', async () => {
      // Arrange: Complex request with both parallel and sequential elements
      const mixedRequest = 'Find all classes and enums, then for each class analyze dependencies and detect patterns, finally generate comprehensive documentation';

      // Act: Decompose complex task
      const decomposition = await orchestrator.decomposeTask(mixedRequest);

      // Assert: Should handle complex execution strategy
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(3);
      expect(decomposition.confidence).toBeGreaterThan(0.5);

      // Execute and verify mixed strategy works
      const workflowResult = await orchestrator.executeWorkflow(decomposition);
      expect(workflowResult.success).toBe(true);
      expect(workflowResult.metrics.totalTools).toBeGreaterThan(2);
    });
  });

  describe('Error Recovery and Retry Mechanisms', () => {
    it('should recover from individual tool failures in multi-tool workflows', async () => {
      // Arrange: Mock one tool to fail initially
      let searchCallCount = 0;
      mockContext.vectorStore.searchWithFilter = jest.fn().mockImplementation(async (query, filter, k) => {
        searchCallCount++;
        if (searchCallCount === 1) {
          throw new Error('Simulated search failure');
        }
        // Return successful result on retry
        return mockIL2CPPData.classes
          .filter(cls => cls.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, k)
          .map(cls => ({
            pageContent: `class ${cls.name}`,
            metadata: cls
          }));
      });

      // Act: Execute workflow with retry configuration
      const retryOrchestrator = new MCPOrchestrator(mockContext, {
        retryAttempts: 2,
        enableCaching: false,
        timeoutMs: 10000
      });

      const decomposition = await retryOrchestrator.decomposeTask('Find PlayerController and analyze its structure');
      const workflowResult = await retryOrchestrator.executeWorkflow(decomposition);

      // Assert: Should recover from failure
      expect(workflowResult.success).toBe(true);
      expect(searchCallCount).toBeGreaterThan(1); // Should have retried
      expect(workflowResult.retryCount).toBeGreaterThan(0);
    });

    it('should handle complete workflow failure gracefully', async () => {
      // Arrange: Mock all vector store operations to fail
      mockContext.vectorStore.similaritySearch = jest.fn().mockRejectedValue(new Error('Complete vector store failure'));
      mockContext.vectorStore.searchWithFilter = jest.fn().mockRejectedValue(new Error('Complete vector store failure'));

      // Act: Execute workflow that should fail
      const decomposition = await orchestrator.decomposeTask('Find and analyze PlayerController');
      const workflowResult = await orchestrator.executeWorkflow(decomposition);

      // Assert: Should handle failure gracefully
      expect(workflowResult.success).toBe(false);
      expect(workflowResult.error).toBeDefined();
      expect(workflowResult.results).toBeDefined();
      expect(workflowResult.executionTime).toBeGreaterThan(0);
    });

    it('should continue workflow execution after partial failures', async () => {
      // Arrange: Mock specific tool to fail while others succeed
      let dependencyCallCount = 0;
      const originalSearchWithFilter = mockContext.vectorStore.searchWithFilter;

      mockContext.vectorStore.searchWithFilter = jest.fn().mockImplementation(async (query, filter, k) => {
        // Fail dependency analysis calls but allow search calls
        if (query.includes('dependencies') || filter.analysis_type === 'dependencies') {
          dependencyCallCount++;
          throw new Error('Dependency analysis failed');
        }
        return originalSearchWithFilter(query, filter, k);
      });

      // Act: Execute multi-step workflow
      const decomposition = await orchestrator.decomposeTask('Find PlayerController, analyze dependencies, and generate wrapper');
      const workflowResult = await orchestrator.executeWorkflow(decomposition);

      // Assert: Should continue with successful tools
      expect(workflowResult).toBeDefined();
      expect(workflowResult.results.length).toBeGreaterThan(0);

      // Some tools should succeed, some may fail
      const successfulTools = workflowResult.results.filter(result => result.success);
      expect(successfulTools.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow Optimization and Performance Monitoring', () => {
    it('should optimize workflow execution with intelligent caching', async () => {
      // Arrange: Execute same complex workflow multiple times
      const complexRequest = 'Find all MonoBehaviours, analyze their dependencies, and detect design patterns';

      // Act: First execution (should populate cache)
      const start1 = Date.now();
      const decomposition1 = await orchestrator.decomposeTask(complexRequest);
      const workflow1 = await orchestrator.executeWorkflow(decomposition1);
      const time1 = Date.now() - start1;

      // Second execution (should benefit from caching)
      const start2 = Date.now();
      const decomposition2 = await orchestrator.decomposeTask(complexRequest);
      const workflow2 = await orchestrator.executeWorkflow(decomposition2);
      const time2 = Date.now() - start2;

      // Assert: Validate optimization
      expect(workflow1.success).toBe(true);
      expect(workflow2.success).toBe(true);
      expect(decomposition1.subtasks).toEqual(decomposition2.subtasks); // Should be identical
      expect(time2).toBeLessThanOrEqual(time1 * 1.2); // Second execution should be similar or faster
    });

    it('should provide comprehensive workflow metrics', async () => {
      // Arrange: Execute workflow with metrics collection
      const metricsRequest = 'Find PlayerController, analyze its hierarchy, and generate documentation';

      // Act: Execute workflow
      const decomposition = await orchestrator.decomposeTask(metricsRequest);
      const workflowResult = await orchestrator.executeWorkflow(decomposition);

      // Assert: Validate comprehensive metrics
      expect(workflowResult.metrics).toBeDefined();
      expect(workflowResult.metrics.totalTools).toBeGreaterThan(0);
      expect(workflowResult.metrics.successfulTools).toBeGreaterThan(0);
      expect(workflowResult.metrics.averageExecutionTime).toBeGreaterThan(0);
      expect(workflowResult.metrics.totalExecutionTime).toBe(workflowResult.executionTime);

      // Verify performance optimizer has collected data
      const performanceMetrics = performanceOptimizer.getPerformanceMetrics();
      expect(Array.isArray(performanceMetrics)).toBe(true);
    });

    it('should adapt workflow strategies based on performance data', async () => {
      // Arrange: Execute multiple workflows to build performance history
      const requests = [
        'Find PlayerController and analyze dependencies',
        'Find EnemyAI and detect patterns',
        'Find GameManager and generate wrapper'
      ];

      // Act: Execute multiple workflows
      const results = [];
      for (const request of requests) {
        const decomposition = await orchestrator.decomposeTask(request);
        const workflowResult = await orchestrator.executeWorkflow(decomposition);
        results.push({ decomposition, workflowResult });
      }

      // Assert: Validate adaptive behavior
      expect(results.length).toBe(3);
      results.forEach(({ decomposition, workflowResult }) => {
        expect(decomposition.subtasks.length).toBeGreaterThan(0);
        expect(workflowResult.success).toBe(true);
        expect(workflowResult.metrics).toBeDefined();
      });

      // Verify orchestrator has learned from execution history
      const stats = (orchestrator as any).stats;
      expect(stats.totalWorkflows).toBeGreaterThanOrEqual(3);
      expect(stats.successfulWorkflows).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Real-World Scenario Integration', () => {
    it('should handle comprehensive game analysis workflow', async () => {
      // Arrange: Real-world game development scenario
      const gameAnalysisRequest = 'Analyze the complete game architecture: find all MonoBehaviours, map their dependencies, detect design patterns, identify potential performance issues, and generate improved class structures';

      // Act: Execute comprehensive analysis
      const decomposition = await orchestrator.decomposeTask(gameAnalysisRequest);
      const workflowResult = await orchestrator.executeWorkflow(decomposition);

      // Assert: Validate comprehensive analysis
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(4);
      expect(decomposition.confidence).toBeGreaterThan(0.6);

      const toolNames = decomposition.subtasks.map(task => task.toolName);
      expect(toolNames).toContain('find_monobehaviours');
      expect(toolNames.some(name => name.includes('dependencies') || name.includes('hierarchy'))).toBe(true);
      expect(toolNames.some(name => name.includes('design_patterns'))).toBe(true);

      expect(workflowResult.success).toBe(true);
      expect(workflowResult.results.length).toBe(decomposition.subtasks.length);
      expect(workflowResult.metrics.totalTools).toBeGreaterThanOrEqual(4);
    });

    it('should handle code refactoring workflow', async () => {
      // Arrange: Code refactoring scenario
      const refactoringRequest = 'Find PlayerController class, analyze its current implementation, detect code smells and anti-patterns, and generate refactored version with improved design patterns';

      // Act: Execute refactoring workflow
      const decomposition = await orchestrator.decomposeTask(refactoringRequest);
      const workflowResult = await orchestrator.executeWorkflow(decomposition);

      // Assert: Validate refactoring workflow
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(3);
      expect(decomposition.executionStrategy).toBe('sequential'); // Refactoring requires sequential steps

      const toolNames = decomposition.subtasks.map(task => task.toolName);
      expect(toolNames).toContain('search_code');
      expect(toolNames.some(name => name.includes('design_patterns'))).toBe(true);
      expect(toolNames.some(name => name.includes('generate'))).toBe(true);

      expect(workflowResult.success).toBe(true);
      expect(workflowResult.results.every(result => result.success)).toBe(true);
    });

    it('should handle Unity-specific analysis workflow', async () => {
      // Arrange: Unity-specific development scenario
      const unityRequest = 'Find all MonoBehaviour components, analyze their Unity lifecycle methods, detect performance bottlenecks in Update methods, and generate optimized MonoBehaviour templates';

      // Act: Execute Unity-specific workflow
      const decomposition = await orchestrator.decomposeTask(unityRequest);
      const workflowResult = await orchestrator.executeWorkflow(decomposition);

      // Assert: Validate Unity-specific workflow
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(3);

      const toolNames = decomposition.subtasks.map(task => task.toolName);
      expect(toolNames).toContain('find_monobehaviours');
      expect(toolNames.some(name => name.includes('generate_monobehaviour'))).toBe(true);

      expect(workflowResult.success).toBe(true);
      expect(workflowResult.results.length).toBeGreaterThan(0);
    });

    it('should handle cross-cutting concern analysis workflow', async () => {
      // Arrange: Cross-cutting concerns analysis
      const crossCuttingRequest = 'Analyze logging patterns across all classes, find classes that implement similar interfaces, detect common dependencies, and suggest architectural improvements';

      // Act: Execute cross-cutting analysis
      const decomposition = await orchestrator.decomposeTask(crossCuttingRequest);
      const workflowResult = await orchestrator.executeWorkflow(decomposition);

      // Assert: Validate cross-cutting analysis
      expect(decomposition.subtasks.length).toBeGreaterThanOrEqual(3);

      const toolNames = decomposition.subtasks.map(task => task.toolName);
      expect(toolNames).toContain('search_code');
      expect(toolNames.some(name => name.includes('cross_references') || name.includes('dependencies'))).toBe(true);

      expect(workflowResult.success).toBe(true);
      expect(workflowResult.results.length).toBeGreaterThan(0);
    });
  });
});