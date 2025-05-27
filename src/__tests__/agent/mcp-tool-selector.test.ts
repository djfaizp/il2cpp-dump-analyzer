/**
 * @fileoverview Test suite for Intelligent MCP Tool Selection and Execution
 * Tests smart tool selection algorithms, capability mapping, and enhanced execution
 */

import { MCPToolSelector } from '../../agent/mcp-tool-selector';
import { ToolExecutionContext } from '../../mcp/base-tool-handler';
import { Logger } from '../../mcp/mcp-sdk-server';
import {
  ToolSelectionCriteria,
  ToolCapabilityMap,
  ToolExecutionPlan,
  ToolExecutionResult,
  ToolQualityAssessment,
  ParallelExecutionResult,
  ToolSelectionStrategy
} from '../../agent/types';

// Mock dependencies
jest.mock('../../mcp/mcp-sdk-server');

describe('MCPToolSelector', () => {
  let toolSelector: MCPToolSelector;
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

    // Initialize tool selector
    toolSelector = new MCPToolSelector(mockContext, {
      enableIntelligentSelection: true,
      enableParallelExecution: true,
      maxParallelTools: 3,
      selectionStrategy: 'adaptive',
      qualityThreshold: 0.7,
      enableLearning: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Tool Capability Mapping', () => {
    it('should build comprehensive tool capability map', async () => {
      const capabilityMap = await toolSelector.buildCapabilityMap();

      expect(capabilityMap).toBeDefined();
      expect(capabilityMap.tools).toBeInstanceOf(Map);
      expect(capabilityMap.categories).toBeInstanceOf(Map);
      expect(capabilityMap.complexityLevels).toBeInstanceOf(Map);

      // Check that all tool categories are mapped
      expect(capabilityMap.categories.has('search')).toBe(true);
      expect(capabilityMap.categories.has('analysis')).toBe(true);
      expect(capabilityMap.categories.has('generation')).toBe(true);

      // Verify tool metadata is properly mapped
      const searchTools = capabilityMap.categories.get('search');
      expect(searchTools).toContain('search_code');
      expect(searchTools).toContain('find_monobehaviours');
    });

    it('should map tool dependencies and relationships', async () => {
      const capabilityMap = await toolSelector.buildCapabilityMap();

      // Check tool relationships
      const relationships = capabilityMap.toolRelationships;
      expect(relationships).toBeDefined();

      // search_code should be related to analysis tools
      const searchCodeRelations = relationships.get('search_code');
      expect(searchCodeRelations).toBeDefined();
      expect(searchCodeRelations!.complementary).toContain('find_class_hierarchy');
      expect(searchCodeRelations!.complementary).toContain('analyze_dependencies');
    });

    it('should identify tool input/output compatibility', async () => {
      const compatibility = await toolSelector.analyzeToolCompatibility('search_code', 'find_class_hierarchy');

      expect(compatibility).toBeDefined();
      expect(compatibility.isCompatible).toBe(true);
      expect(compatibility.compatibilityScore).toBeGreaterThan(0.5);
      expect(compatibility.sharedParameters).toContain('class_name');
    });
  });

  describe('Intelligent Tool Selection', () => {
    it('should select optimal tool for simple search request', async () => {
      const criteria: ToolSelectionCriteria = {
        intent: {
          action: 'search',
          target: 'Player',
          type: 'class',
          filters: {},
          confidence: 0.9,
          keywords: ['Player', 'class']
        },
        context: {
          previousTools: [],
          availableData: {},
          sessionHistory: []
        },
        constraints: {
          maxExecutionTime: 5000,
          maxComplexity: 'medium',
          preferredCategories: ['search']
        }
      };

      const selection = await toolSelector.selectOptimalTool(criteria);

      expect(selection).toBeDefined();
      expect(selection.toolName).toBe('search_code');
      expect(selection.confidence).toBeGreaterThan(0.8);
      expect(selection.reasoning).toContain('search');
      expect(selection.suggestedParameters.query).toBe('Player');
    });

    it('should select analysis tool for complex analysis request', async () => {
      const criteria: ToolSelectionCriteria = {
        intent: {
          action: 'analyze',
          target: 'Player',
          type: 'class',
          filters: { includeHierarchy: true },
          confidence: 0.8,
          keywords: ['Player', 'hierarchy', 'inheritance']
        },
        context: {
          previousTools: ['search_code'],
          availableData: { 'Player': { type: 'class', found: true } },
          sessionHistory: []
        },
        constraints: {
          maxExecutionTime: 10000,
          maxComplexity: 'complex',
          preferredCategories: ['analysis']
        }
      };

      const selection = await toolSelector.selectOptimalTool(criteria);

      expect(selection).toBeDefined();
      expect(selection.toolName).toBe('find_class_hierarchy');
      expect(selection.confidence).toBeGreaterThan(0.7);
      expect(selection.suggestedParameters.class_name).toBe('Player');
    });

    it('should avoid redundant tool selection', async () => {
      const criteria: ToolSelectionCriteria = {
        intent: {
          action: 'search',
          target: 'Player',
          type: 'class',
          filters: {},
          confidence: 0.9,
          keywords: ['Player']
        },
        context: {
          previousTools: ['search_code', 'search_code'], // Already executed twice
          availableData: { 'Player': { type: 'class', found: true } },
          sessionHistory: []
        },
        constraints: {
          maxExecutionTime: 5000,
          maxComplexity: 'medium',
          preferredCategories: ['search', 'analysis']
        }
      };

      const selection = await toolSelector.selectOptimalTool(criteria);

      // Should suggest analysis tool instead of repeating search
      expect(selection.toolName).not.toBe('search_code');
      expect(['find_class_hierarchy', 'analyze_dependencies']).toContain(selection.toolName);
    });

    it('should provide alternative tool suggestions', async () => {
      const criteria: ToolSelectionCriteria = {
        intent: {
          action: 'find',
          target: 'MonoBehaviour',
          type: 'class',
          filters: {},
          confidence: 0.8,
          keywords: ['MonoBehaviour', 'Unity']
        },
        context: {
          previousTools: [],
          availableData: {},
          sessionHistory: []
        },
        constraints: {
          maxExecutionTime: 5000,
          maxComplexity: 'simple',
          preferredCategories: ['search']
        }
      };

      const selection = await toolSelector.selectOptimalTool(criteria);

      expect(selection.alternatives).toBeDefined();
      expect(selection.alternatives.length).toBeGreaterThan(0);

      // Should suggest both specific and general search tools
      const alternativeNames = selection.alternatives.map(alt => alt.toolName);
      expect(alternativeNames).toContain('search_code');
    });
  });

  describe('Tool Execution Planning', () => {
    it('should create execution plan for single tool', async () => {
      const plan = await toolSelector.createExecutionPlan([{
        toolName: 'search_code',
        parameters: { query: 'Player', filter_type: 'class' },
        priority: 1,
        dependencies: []
      }]);

      expect(plan).toBeDefined();
      expect(plan.executionSteps).toHaveLength(1);
      expect(plan.executionStrategy).toBe('sequential');
      expect(plan.estimatedDuration).toBeGreaterThan(0);
      expect(plan.parallelGroups).toHaveLength(1);
    });

    it('should create parallel execution plan for independent tools', async () => {
      const plan = await toolSelector.createExecutionPlan([
        {
          toolName: 'search_code',
          parameters: { query: 'Player' },
          priority: 1,
          dependencies: []
        },
        {
          toolName: 'find_monobehaviours',
          parameters: { query: 'Enemy' },
          priority: 1,
          dependencies: []
        }
      ]);

      expect(plan.executionStrategy).toBe('parallel');
      expect(plan.parallelGroups).toHaveLength(1);
      expect(plan.parallelGroups[0]).toHaveLength(2);
    });

    it('should create sequential plan for dependent tools', async () => {
      const plan = await toolSelector.createExecutionPlan([
        {
          toolName: 'search_code',
          parameters: { query: 'Player' },
          priority: 1,
          dependencies: []
        },
        {
          toolName: 'find_class_hierarchy',
          parameters: { class_name: 'Player' },
          priority: 2,
          dependencies: ['search_code']
        }
      ]);

      expect(plan.executionStrategy).toBe('sequential');
      expect(plan.parallelGroups).toHaveLength(2);
      expect(plan.parallelGroups[0]).toHaveLength(1);
      expect(plan.parallelGroups[1]).toHaveLength(1);
    });
  });

  describe('Enhanced Tool Execution', () => {
    it('should execute single tool with retry logic', async () => {
      // Mock successful execution
      mockVectorStore.searchWithFilter.mockResolvedValue([
        { content: 'class Player { }', metadata: { type: 'class' } }
      ]);

      const result = await toolSelector.executeTool('search_code', {
        query: 'Player',
        filter_type: 'class'
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.retryCount).toBe(0);
    });

    it('should handle tool execution failures with retries', async () => {
      // Mock failure then success
      mockVectorStore.searchWithFilter
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue([{ content: 'class Player { }' }]);

      const result = await toolSelector.executeTool('search_code', {
        query: 'Player'
      });

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
    });

    it('should fail after max retries exceeded', async () => {
      // Mock persistent failure
      mockVectorStore.searchWithFilter.mockRejectedValue(new Error('Persistent error'));

      const result = await toolSelector.executeTool('search_code', {
        query: 'Player'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Persistent error');
      expect(result.retryCount).toBe(3); // Default max retries
    });
  });

  describe('Parallel Tool Execution', () => {
    it('should execute independent tools in parallel', async () => {
      // Mock different responses for different tools
      mockVectorStore.searchWithFilter
        .mockResolvedValueOnce([{ content: 'class Player { }' }])
        .mockResolvedValueOnce([{ content: 'class Enemy { }' }]);

      const tools = [
        { toolName: 'search_code', parameters: { query: 'Player' } },
        { toolName: 'search_code', parameters: { query: 'Enemy' } }
      ];

      const results = await toolSelector.executeToolsInParallel(tools);

      expect(results).toBeDefined();
      expect(results.success).toBe(true);
      expect(results.results).toHaveLength(2);
      expect(results.executionTime).toBeLessThan(10000); // Should be faster than sequential
      expect(results.parallelExecutions).toBe(2);
    });

    it('should handle partial failures in parallel execution', async () => {
      // Mock one success, one failure
      mockVectorStore.searchWithFilter
        .mockResolvedValueOnce([{ content: 'class Player { }' }])
        .mockRejectedValueOnce(new Error('Tool failure'));

      const tools = [
        { toolName: 'search_code', parameters: { query: 'Player' } },
        { toolName: 'search_code', parameters: { query: 'Invalid' } }
      ];

      const results = await toolSelector.executeToolsInParallel(tools);

      expect(results.success).toBe(false); // Overall failure due to partial failure
      expect(results.results).toHaveLength(2);
      expect(results.results[0].success).toBe(true);
      expect(results.results[1].success).toBe(false);
      expect(results.failedExecutions).toBe(1);
    });
  });

  describe('Tool Result Validation and Quality Assessment', () => {
    it('should validate tool result structure', async () => {
      const result: ToolExecutionResult = {
        success: true,
        data: [{ content: 'class Player { }', metadata: { type: 'class' } }],
        metadata: { resultCount: 1 },
        executionTime: 1500
      };

      const validation = await toolSelector.validateToolResult('search_code', result);

      expect(validation).toBeDefined();
      expect(validation.isValid).toBe(true);
      expect(validation.qualityScore).toBeGreaterThan(0.7);
      expect(validation.issues).toHaveLength(0);
    });

    it('should detect low-quality results', async () => {
      const result: ToolExecutionResult = {
        success: true,
        data: [], // Empty results
        metadata: { resultCount: 0 },
        executionTime: 100
      };

      const validation = await toolSelector.validateToolResult('search_code', result);

      expect(validation.isValid).toBe(false);
      expect(validation.qualityScore).toBeLessThan(0.5);
      expect(validation.issues).toContain('No results found');
    });

    it('should assess result relevance and completeness', async () => {
      const result: ToolExecutionResult = {
        success: true,
        data: [
          { content: 'class Player { }', metadata: { type: 'class', relevance: 0.9 } },
          { content: 'class PlayerController { }', metadata: { type: 'class', relevance: 0.8 } }
        ],
        metadata: { resultCount: 2 }
      };

      const assessment = await toolSelector.assessResultQuality('search_code', result, {
        expectedResultCount: 2,
        relevanceThreshold: 0.7,
        completenessRequirements: ['type', 'content']
      });

      expect(assessment).toBeDefined();
      expect(assessment.relevanceScore).toBeGreaterThan(0.8);
      expect(assessment.completenessScore).toBe(1.0);
      expect(assessment.overallQuality).toBeGreaterThan(0.8);
    });

    it('should provide improvement suggestions for poor results', async () => {
      const result: ToolExecutionResult = {
        success: true,
        data: [{ content: 'partial data' }], // Missing metadata
        metadata: { resultCount: 1 }
      };

      const assessment = await toolSelector.assessResultQuality('search_code', result);

      expect(assessment.suggestions).toBeDefined();
      expect(assessment.suggestions.length).toBeGreaterThan(0);
      expect(assessment.suggestions.some(s => s.includes('metadata'))).toBe(true);
    });
  });

  describe('Adaptive Learning and Optimization', () => {
    it('should learn from successful tool selections', async () => {
      const selectionHistory = [
        {
          criteria: {
            intent: { action: 'search', target: 'Player', type: 'class' },
            context: { previousTools: [] }
          },
          selectedTool: 'search_code',
          result: { success: true, qualityScore: 0.9 }
        },
        {
          criteria: {
            intent: { action: 'search', target: 'Enemy', type: 'class' },
            context: { previousTools: [] }
          },
          selectedTool: 'search_code',
          result: { success: true, qualityScore: 0.8 }
        }
      ];

      await toolSelector.learnFromHistory(selectionHistory);

      const learningStats = await toolSelector.getLearningStatistics();
      expect(learningStats.totalSamples).toBe(2);
      expect(learningStats.averageQuality).toBeGreaterThan(0.8);
      expect(learningStats.toolPreferences.has('search_code')).toBe(true);
    });

    it('should adapt tool selection based on learning', async () => {
      // Train with successful pattern
      await toolSelector.learnFromHistory([
        {
          criteria: {
            intent: { action: 'analyze', target: 'Player', type: 'class' },
            context: { previousTools: ['search_code'] }
          },
          selectedTool: 'find_class_hierarchy',
          result: { success: true, qualityScore: 0.95 }
        }
      ]);

      // Test adapted selection
      const criteria: ToolSelectionCriteria = {
        intent: {
          action: 'analyze',
          target: 'Enemy',
          type: 'class',
          filters: {},
          confidence: 0.8,
          keywords: ['Enemy', 'analyze']
        },
        context: {
          previousTools: ['search_code'],
          availableData: {},
          sessionHistory: []
        },
        constraints: {
          maxExecutionTime: 10000,
          maxComplexity: 'complex'
        }
      };

      const selection = await toolSelector.selectOptimalTool(criteria);

      // Should prefer learned successful pattern
      expect(selection.toolName).toBe('find_class_hierarchy');
      expect(selection.confidence).toBeGreaterThan(0.8);
    });

    it('should identify and avoid poor tool combinations', async () => {
      // Train with failed pattern
      await toolSelector.learnFromHistory([
        {
          criteria: {
            intent: { action: 'generate', target: 'Player', type: 'class' },
            context: { previousTools: [] }
          },
          selectedTool: 'generate_class_wrapper',
          result: { success: false, qualityScore: 0.2 }
        }
      ]);

      const criteria: ToolSelectionCriteria = {
        intent: {
          action: 'generate',
          target: 'Enemy',
          type: 'class',
          filters: {},
          confidence: 0.8,
          keywords: ['Enemy', 'generate']
        },
        context: {
          previousTools: [],
          availableData: {},
          sessionHistory: []
        },
        constraints: {
          maxExecutionTime: 10000,
          maxComplexity: 'medium'
        }
      };

      const selection = await toolSelector.selectOptimalTool(criteria);

      // Should suggest search first due to learned failure pattern
      expect(selection.toolName).toBe('search_code');
      expect(selection.reasoning).toContain('search');
    });
  });

  describe('Tool Selection Strategies', () => {
    it('should use conservative strategy for high-stakes requests', async () => {
      const selector = new MCPToolSelector(mockContext, {
        selectionStrategy: 'conservative',
        qualityThreshold: 0.9,
        enableLearning: false
      });

      const criteria: ToolSelectionCriteria = {
        intent: {
          action: 'analyze',
          target: 'CriticalSystem',
          type: 'class',
          filters: {},
          confidence: 0.7, // Lower confidence
          keywords: ['CriticalSystem']
        },
        context: {
          previousTools: [],
          availableData: {},
          sessionHistory: []
        },
        constraints: {
          maxExecutionTime: 30000,
          maxComplexity: 'complex'
        }
      };

      const selection = await selector.selectOptimalTool(criteria);

      // Conservative strategy should prefer simple, reliable tools
      expect(selection.toolName).toBe('search_code');
      expect(selection.confidence).toBeGreaterThan(0.8);
    });

    it('should use aggressive strategy for exploratory requests', async () => {
      const selector = new MCPToolSelector(mockContext, {
        selectionStrategy: 'aggressive',
        qualityThreshold: 0.6,
        enableLearning: true
      });

      const criteria: ToolSelectionCriteria = {
        intent: {
          action: 'analyze',
          target: 'UnknownPattern',
          type: 'pattern',
          filters: {},
          confidence: 0.9,
          keywords: ['pattern', 'design']
        },
        context: {
          previousTools: [],
          availableData: {},
          sessionHistory: []
        },
        constraints: {
          maxExecutionTime: 60000,
          maxComplexity: 'complex'
        }
      };

      const selection = await selector.selectOptimalTool(criteria);

      // Aggressive strategy should try complex analysis tools
      expect(selection.toolName).toBe('find_design_patterns');
      expect(selection.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('Performance Optimization', () => {
    it('should cache tool selection decisions', async () => {
      const criteria: ToolSelectionCriteria = {
        intent: {
          action: 'search',
          target: 'Player',
          type: 'class',
          filters: {},
          confidence: 0.9,
          keywords: ['Player']
        },
        context: {
          previousTools: [],
          availableData: {},
          sessionHistory: []
        },
        constraints: {
          maxExecutionTime: 5000,
          maxComplexity: 'simple'
        }
      };

      // First selection
      const startTime1 = Date.now();
      const selection1 = await toolSelector.selectOptimalTool(criteria);
      const duration1 = Date.now() - startTime1;

      // Second identical selection (should be cached)
      const startTime2 = Date.now();
      const selection2 = await toolSelector.selectOptimalTool(criteria);
      const duration2 = Date.now() - startTime2;

      expect(selection1.toolName).toBe(selection2.toolName);
      expect(duration2).toBeLessThan(duration1); // Cached should be faster
    });

    it('should provide execution time estimates', async () => {
      const estimate = await toolSelector.estimateExecutionTime('analyze_dependencies', {
        class_name: 'Player',
        analysis_type: 'bidirectional',
        depth: 3
      });

      expect(estimate).toBeDefined();
      expect(estimate.estimatedMs).toBeGreaterThan(0);
      expect(estimate.confidence).toBeGreaterThan(0.5);
      expect(estimate.factors).toBeDefined();
    });
  });
});
