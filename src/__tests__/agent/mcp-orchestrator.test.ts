/**
 * @fileoverview Test suite for MCP Tool Orchestration Engine
 * Tests intelligent tool orchestration, task decomposition, and workflow execution
 */

import { MCPOrchestrator, TaskDecomposition, WorkflowExecution, OrchestratorConfig } from '../../agent/mcp-orchestrator';
import { ToolExecutionContext } from '../../mcp/base-tool-handler';
import { Logger } from '../../mcp/mcp-sdk-server';

// Mock dependencies
jest.mock('../../mcp/mcp-sdk-server');
jest.mock('../../mcp/tools/tool-registry', () => ({
  getAllToolNames: jest.fn(() => [
    'search_code',
    'find_monobehaviours',
    'find_enum_values',
    'find_class_hierarchy',
    'analyze_dependencies',
    'find_cross_references',
    'find_design_patterns',
    'generate_class_wrapper',
    'generate_method_stubs',
    'generate_monobehaviour_template'
  ]),
  getToolMetadata: jest.fn(),
  isValidTool: jest.fn((toolName: string) => [
    'search_code',
    'find_monobehaviours',
    'find_enum_values',
    'find_class_hierarchy',
    'analyze_dependencies',
    'find_cross_references',
    'find_design_patterns',
    'generate_class_wrapper',
    'generate_method_stubs',
    'generate_monobehaviour_template'
  ].includes(toolName))
}));

describe('MCPOrchestrator', () => {
  let orchestrator: MCPOrchestrator;
  let mockContext: ToolExecutionContext;
  let mockVectorStore: any;

  beforeEach(() => {
    // Setup mock vector store
    mockVectorStore = {
      searchWithFilter: jest.fn(),
      addDocuments: jest.fn(),
      isInitialized: jest.fn().mockReturnValue(true)
    };

    // Setup mock context
    mockContext = {
      vectorStore: mockVectorStore,
      logger: Logger,
      isInitialized: () => true
    };

    // Setup orchestrator with test configuration
    const config: OrchestratorConfig = {
      maxWorkflowDepth: 5,
      maxParallelTools: 3,
      timeoutMs: 30000,
      enableCaching: true,
      retryAttempts: 2,
      enableLearning: false // Disable for tests
    };

    orchestrator = new MCPOrchestrator(mockContext, config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task Decomposition', () => {
    it('should decompose simple search request into single tool call', async () => {
      const request = "Find all Player classes in the IL2CPP dump";

      const decomposition = await orchestrator.decomposeTask(request);

      expect(decomposition).toBeDefined();
      expect(decomposition.subtasks).toHaveLength(1);
      expect(decomposition.subtasks[0].toolName).toBe('search_code');
      expect(decomposition.subtasks[0].parameters.query).toBe('Player');
      expect(decomposition.subtasks[0].parameters.filter_type).toBe('class');
    });

    it('should decompose complex analysis request into multiple tool calls', async () => {
      const request = "Analyze the Player class hierarchy, find its dependencies, and generate a MonoBehaviour template";

      const decomposition = await orchestrator.decomposeTask(request);

      expect(decomposition).toBeDefined();
      expect(decomposition.subtasks.length).toBeGreaterThan(1);

      // Should include hierarchy analysis
      const hierarchyTask = decomposition.subtasks.find(t => t.toolName === 'find_class_hierarchy');
      expect(hierarchyTask).toBeDefined();

      // Should include dependency analysis
      const dependencyTask = decomposition.subtasks.find(t => t.toolName === 'analyze_dependencies');
      expect(dependencyTask).toBeDefined();

      // Should include MonoBehaviour generation
      const templateTask = decomposition.subtasks.find(t => t.toolName === 'generate_monobehaviour_template');
      expect(templateTask).toBeDefined();
    });

    it('should handle MonoBehaviour-specific requests', async () => {
      const request = "Find all MonoBehaviour classes and analyze their design patterns";

      const decomposition = await orchestrator.decomposeTask(request);

      expect(decomposition.subtasks).toHaveLength(2);
      expect(decomposition.subtasks[0].toolName).toBe('find_monobehaviours');
      expect(decomposition.subtasks[1].toolName).toBe('find_design_patterns');
      expect(decomposition.executionStrategy).toBe('sequential');
    });

    it('should identify parallel execution opportunities', async () => {
      const request = "Search for Enemy classes and find enum values for GameState";

      const decomposition = await orchestrator.decomposeTask(request);

      expect(decomposition.executionStrategy).toBe('parallel');
      expect(decomposition.subtasks).toHaveLength(2);
    });
  });

  describe('Tool Selection', () => {
    it('should select appropriate search tool for code queries', () => {
      const intent = { action: 'search', target: 'Player', type: 'class' };

      const selectedTool = orchestrator.selectTool(intent);

      expect(selectedTool).toBe('search_code');
    });

    it('should select MonoBehaviour tool for Unity component queries', () => {
      const intent = { action: 'find', target: 'MonoBehaviour', type: 'component' };

      const selectedTool = orchestrator.selectTool(intent);

      expect(selectedTool).toBe('find_monobehaviours');
    });

    it('should select generation tool for template requests', () => {
      const intent = { action: 'generate', target: 'Player', type: 'template' };

      const selectedTool = orchestrator.selectTool(intent);

      expect(selectedTool).toBe('generate_monobehaviour_template');
    });

    it('should handle unknown intents gracefully', () => {
      const intent = { action: 'unknown', target: 'test', type: 'invalid' };

      const selectedTool = orchestrator.selectTool(intent);

      expect(selectedTool).toBe('search_code'); // Default fallback
    });
  });

  describe('Workflow Execution', () => {
    it('should execute simple workflow successfully', async () => {
      // Mock successful tool execution
      const mockToolResult = {
        success: true,
        data: [{ content: 'class Player { }', metadata: { type: 'class' } }],
        metadata: { resultCount: 1 }
      };

      jest.spyOn(orchestrator as any, 'executeTool').mockResolvedValue(mockToolResult);

      const decomposition: TaskDecomposition = {
        originalRequest: "Find Player class",
        subtasks: [{
          id: 'task-1',
          toolName: 'search_code',
          parameters: { query: 'Player', filter_type: 'class' },
          dependencies: [],
          priority: 1
        }],
        executionStrategy: 'sequential',
        estimatedDuration: 3000
      };

      const result = await orchestrator.executeWorkflow(decomposition);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle tool execution failures with retry', async () => {
      // Mock failing then succeeding tool execution
      jest.spyOn(orchestrator as any, 'executeTool')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          success: true,
          data: [],
          metadata: { resultCount: 0 }
        });

      const decomposition: TaskDecomposition = {
        originalRequest: "Find NonExistent class",
        subtasks: [{
          id: 'task-1',
          toolName: 'search_code',
          parameters: { query: 'NonExistent' },
          dependencies: [],
          priority: 1
        }],
        executionStrategy: 'sequential',
        estimatedDuration: 3000
      };

      const result = await orchestrator.executeWorkflow(decomposition);

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
    });

    it('should execute parallel workflows correctly', async () => {
      const mockToolResult = {
        success: true,
        data: [],
        metadata: { resultCount: 0 }
      };

      jest.spyOn(orchestrator as any, 'executeTool').mockResolvedValue(mockToolResult);

      const decomposition: TaskDecomposition = {
        originalRequest: "Search for Enemy and find GameState enum",
        subtasks: [
          {
            id: 'task-1',
            toolName: 'search_code',
            parameters: { query: 'Enemy' },
            dependencies: [],
            priority: 1
          },
          {
            id: 'task-2',
            toolName: 'find_enum_values',
            parameters: { enum_name: 'GameState' },
            dependencies: [],
            priority: 1
          }
        ],
        executionStrategy: 'parallel',
        estimatedDuration: 5000
      };

      const startTime = Date.now();
      const result = await orchestrator.executeWorkflow(decomposition);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      // Parallel execution should be faster than sequential
      expect(executionTime).toBeLessThan(10000);
    });

    it('should handle dependencies correctly in sequential execution', async () => {
      const mockSearchResult = {
        success: true,
        data: [{ content: 'class Player { }', metadata: { className: 'Player' } }],
        metadata: { resultCount: 1 }
      };

      const mockHierarchyResult = {
        success: true,
        data: [{ content: 'Player hierarchy', metadata: { baseClass: 'MonoBehaviour' } }],
        metadata: { resultCount: 1 }
      };

      jest.spyOn(orchestrator as any, 'executeTool')
        .mockResolvedValueOnce(mockSearchResult)
        .mockResolvedValueOnce(mockHierarchyResult);

      const decomposition: TaskDecomposition = {
        originalRequest: "Find Player class and analyze its hierarchy",
        subtasks: [
          {
            id: 'task-1',
            toolName: 'search_code',
            parameters: { query: 'Player' },
            dependencies: [],
            priority: 1
          },
          {
            id: 'task-2',
            toolName: 'find_class_hierarchy',
            parameters: { class_name: '${task-1.className}' }, // Dependency on task-1
            dependencies: ['task-1'],
            priority: 2
          }
        ],
        executionStrategy: 'sequential',
        estimatedDuration: 6000
      };

      const result = await orchestrator.executeWorkflow(decomposition);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      // Verify dependency resolution worked
      expect(result.results[1].parameters.class_name).toBe('Player');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool names gracefully', async () => {
      const decomposition: TaskDecomposition = {
        originalRequest: "Test invalid tool",
        subtasks: [{
          id: 'task-1',
          toolName: 'invalid_tool',
          parameters: {},
          dependencies: [],
          priority: 1
        }],
        executionStrategy: 'sequential',
        estimatedDuration: 1000
      };

      const result = await orchestrator.executeWorkflow(decomposition);

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid_tool');
    });

    it('should timeout long-running workflows', async () => {
      // Mock slow tool execution
      jest.spyOn(orchestrator as any, 'executeTool').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 35000))
      );

      const decomposition: TaskDecomposition = {
        originalRequest: "Slow operation",
        subtasks: [{
          id: 'task-1',
          toolName: 'search_code',
          parameters: { query: 'test' },
          dependencies: [],
          priority: 1
        }],
        executionStrategy: 'sequential',
        estimatedDuration: 1000
      };

      const result = await orchestrator.executeWorkflow(decomposition);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    }, 40000);
  });

  describe('Context Management', () => {
    it('should maintain context across tool calls', async () => {
      const mockResults = [
        { success: true, data: [{ metadata: { className: 'Player' } }], metadata: {} },
        { success: true, data: [{ metadata: { dependencies: ['GameObject'] } }], metadata: {} }
      ];

      jest.spyOn(orchestrator as any, 'executeTool')
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1]);

      const decomposition: TaskDecomposition = {
        originalRequest: "Find Player and analyze dependencies",
        subtasks: [
          {
            id: 'task-1',
            toolName: 'search_code',
            parameters: { query: 'Player' },
            dependencies: [],
            priority: 1
          },
          {
            id: 'task-2',
            toolName: 'analyze_dependencies',
            parameters: { class_name: '${task-1.className}' },
            dependencies: ['task-1'],
            priority: 2
          }
        ],
        executionStrategy: 'sequential',
        estimatedDuration: 6000
      };

      const result = await orchestrator.executeWorkflow(decomposition);

      expect(result.success).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context['task-1']).toBeDefined();
      expect(result.context['task-2']).toBeDefined();
    });
  });
});
