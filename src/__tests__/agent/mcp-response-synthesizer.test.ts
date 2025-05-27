/**
 * @fileoverview Tests for MCP Response Synthesizer
 * Tests intelligent aggregation and synthesis of MCP tool results
 */

import { MCPResponseSynthesizer } from '../../agent/mcp-response-synthesizer';
import { ToolExecutionResult, WorkflowExecution } from '../../agent/types';
import { ToolExecutionContext } from '../../mcp/base-tool-handler';
import { Logger } from '../../mcp/mcp-sdk-server';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Mock tool execution context
const mockContext: ToolExecutionContext = {
  vectorStore: {} as any,
  logger: mockLogger,
  config: {
    enableCaching: true,
    cacheSize: 1000,
    logLevel: 'info'
  }
};

// Mock context without logger for testing
const mockContextNoLogger: ToolExecutionContext = {
  vectorStore: {} as any,
  logger: undefined as any,
  config: {
    enableCaching: true,
    cacheSize: 1000,
    logLevel: 'info'
  }
};

describe('MCPResponseSynthesizer', () => {
  let synthesizer: MCPResponseSynthesizer;

  beforeEach(() => {
    synthesizer = new MCPResponseSynthesizer(mockContext);
    jest.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default configuration', () => {
      // Create a new synthesizer to test initialization
      const testSynthesizer = new MCPResponseSynthesizer(mockContext);
      expect(testSynthesizer).toBeInstanceOf(MCPResponseSynthesizer);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MCP Response Synthesizer initialized',
        expect.any(Object)
      );
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        enableSemanticCorrelation: false,
        maxResponseLength: 5000,
        qualityThreshold: 0.8
      };

      const customSynthesizer = new MCPResponseSynthesizer(mockContext, customConfig);
      expect(customSynthesizer).toBeInstanceOf(MCPResponseSynthesizer);
    });
  });

  describe('Single Tool Result Synthesis', () => {
    it('should synthesize a single search result', async () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        data: [
          {
            content: 'class Player { public void Move() { } }',
            metadata: { name: 'Player', type: 'class', namespace: 'Game' }
          }
        ],
        metadata: { toolName: 'search_code', resultCount: 1 }
      };

      const synthesized = await synthesizer.synthesizeSingleResult(toolResult, 'search_code');

      expect(synthesized.success).toBe(true);
      expect(synthesized.synthesizedContent).toContain('Player');
      expect(synthesized.metadata.originalToolName).toBe('search_code');
      expect(synthesized.qualityAssessment.isValid).toBe(true);
    });

    it('should handle empty results gracefully', async () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        data: [],
        metadata: { toolName: 'search_code', resultCount: 0 }
      };

      const synthesized = await synthesizer.synthesizeSingleResult(toolResult, 'search_code');

      expect(synthesized.success).toBe(true);
      expect(synthesized.synthesizedContent).toContain('No results found');
      expect(synthesized.qualityAssessment.completenessScore).toBe(0);
    });

    it('should handle failed tool execution', async () => {
      const toolResult: ToolExecutionResult = {
        success: false,
        data: [],
        error: 'Tool execution failed',
        metadata: { toolName: 'search_code' }
      };

      const synthesized = await synthesizer.synthesizeSingleResult(toolResult, 'search_code');

      expect(synthesized.success).toBe(false);
      expect(synthesized.synthesizedContent).toContain('execution failed');
      expect(synthesized.qualityAssessment.isValid).toBe(false);
    });
  });

  describe('Multiple Tool Results Aggregation', () => {
    it('should aggregate results from multiple search tools', async () => {
      const toolResults: ToolExecutionResult[] = [
        {
          success: true,
          data: [{ content: 'class Player { }', metadata: { name: 'Player', type: 'class' } }],
          metadata: { toolName: 'search_code', resultCount: 1 }
        },
        {
          success: true,
          data: [{ content: 'class Enemy { }', metadata: { name: 'Enemy', type: 'class' } }],
          metadata: { toolName: 'find_monobehaviours', resultCount: 1 }
        }
      ];

      const aggregated = await synthesizer.aggregateMultipleResults(
        toolResults,
        ['search_code', 'find_monobehaviours'],
        'Find Player and Enemy classes'
      );

      expect(aggregated.success).toBe(true);
      expect(aggregated.synthesizedContent).toContain('Player');
      expect(aggregated.synthesizedContent).toContain('Enemy');
      expect(aggregated.correlations).toHaveLength(0); // No correlations between different classes
      expect(aggregated.qualityAssessment.overallQuality).toBeGreaterThan(0.5);
    });

    it('should identify correlations between related results', async () => {
      const toolResults: ToolExecutionResult[] = [
        {
          success: true,
          data: [{ content: 'class Player { }', metadata: { name: 'Player', type: 'class', namespace: 'Game' } }],
          metadata: { toolName: 'search_code', resultCount: 1 }
        },
        {
          success: true,
          data: [{
            content: 'Player inherits from MonoBehaviour',
            metadata: { className: 'Player', baseClass: 'MonoBehaviour' }
          }],
          metadata: { toolName: 'find_class_hierarchy', resultCount: 1 }
        }
      ];

      const aggregated = await synthesizer.aggregateMultipleResults(
        toolResults,
        ['search_code', 'find_class_hierarchy'],
        'Find Player class and its hierarchy'
      );

      expect(aggregated.correlations.length).toBeGreaterThan(0);
      expect(aggregated.correlations[0].entities).toContain('Player');
      expect(aggregated.correlations[0].correlationType).toBe('entity_relationship');
    });
  });

  describe('Workflow Result Synthesis', () => {
    it('should synthesize complete workflow execution results', async () => {
      const workflowExecution: WorkflowExecution = {
        success: true,
        results: [
          {
            success: true,
            data: [{ content: 'class Player { }', metadata: { name: 'Player', type: 'class' } }],
            metadata: { toolName: 'search_code' }
          },
          {
            success: true,
            data: [{ content: 'Player hierarchy info', metadata: { className: 'Player' } }],
            metadata: { toolName: 'find_class_hierarchy' }
          }
        ],
        executionTime: 1500,
        retryCount: 0,
        context: { originalRequest: 'Find Player class and analyze its hierarchy' }
      };

      const synthesized = await synthesizer.synthesizeWorkflowResults(
        workflowExecution,
        'Find Player class and analyze its hierarchy'
      );

      expect(synthesized.success).toBe(true);
      expect(synthesized.synthesizedContent).toContain('Player');
      expect(synthesized.workflowSummary.totalTools).toBe(2);
      expect(synthesized.workflowSummary.successfulTools).toBe(2);
      expect(synthesized.qualityAssessment.overallQuality).toBeGreaterThan(0.5);
    });

    it('should handle partial workflow failures', async () => {
      const workflowExecution: WorkflowExecution = {
        success: false,
        results: [
          {
            success: true,
            data: [{ content: 'class Player { }', metadata: { name: 'Player', type: 'class' } }],
            metadata: { toolName: 'search_code' }
          },
          {
            success: false,
            data: [],
            error: 'Hierarchy analysis failed',
            metadata: { toolName: 'find_class_hierarchy' }
          }
        ],
        executionTime: 2000,
        retryCount: 1,
        context: { originalRequest: 'Find Player class and analyze its hierarchy' },
        error: 'Partial workflow failure'
      };

      const synthesized = await synthesizer.synthesizeWorkflowResults(
        workflowExecution,
        'Find Player class and analyze its hierarchy'
      );

      expect(synthesized.success).toBe(false);
      expect(synthesized.synthesizedContent).toContain('Partial Results');
      expect(synthesized.workflowSummary.failedTools).toBe(1);
      expect(synthesized.issues).toContain('Workflow execution was not fully successful');
    });
  });

  describe('Quality Assessment', () => {
    it('should assess quality of synthesized results', () => {
      const mockResult = {
        success: true,
        data: [
          { content: 'class Player { }', metadata: { name: 'Player', type: 'class' } },
          { content: 'class Enemy { }', metadata: { name: 'Enemy', type: 'class' } }
        ],
        metadata: { resultCount: 2 }
      };

      const quality = synthesizer.assessResultQuality(mockResult, 'search for classes');

      expect(quality.isValid).toBe(true);
      expect(quality.qualityScore).toBeGreaterThan(0.5);
      expect(quality.relevanceScore).toBeGreaterThan(0);
      expect(quality.completenessScore).toBeGreaterThan(0);
    });

    it('should identify quality issues', () => {
      const mockResult = {
        success: true,
        data: [],
        metadata: { resultCount: 0 }
      };

      const quality = synthesizer.assessResultQuality(mockResult, 'search for classes');

      expect(quality.isValid).toBe(false);
      expect(quality.issues).toContain('No results found');
      expect(quality.completenessScore).toBe(0);
    });
  });

  describe('Response Caching', () => {
    it('should cache synthesized responses', async () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        data: [{ content: 'class Player { }', metadata: { name: 'Player', type: 'class' } }],
        metadata: { toolName: 'search_code', resultCount: 1 }
      };

      // First synthesis
      const result1 = await synthesizer.synthesizeSingleResult(toolResult, 'search_code');

      // Second synthesis with same input should use cache
      const result2 = await synthesizer.synthesizeSingleResult(toolResult, 'search_code');

      expect(result1.synthesizedContent).toBe(result2.synthesizedContent);
      expect(synthesizer.getCacheStats().hits).toBe(1);
    });

    it('should respect cache size limits', async () => {
      const smallCacheSynthesizer = new MCPResponseSynthesizer(mockContext, {
        cacheConfig: { maxEntries: 2, ttlMs: 60000 }
      });

      // Add 3 different results to exceed cache size
      for (let i = 0; i < 3; i++) {
        const toolResult: ToolExecutionResult = {
          success: true,
          data: [{ content: `class Test${i} { }`, metadata: { name: `Test${i}`, type: 'class' } }],
          metadata: { toolName: 'search_code', resultCount: 1 }
        };

        await smallCacheSynthesizer.synthesizeSingleResult(toolResult, 'search_code');
      }

      const stats = smallCacheSynthesizer.getCacheStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed tool results', async () => {
      const malformedResult = {
        success: true,
        data: null, // Invalid data
        metadata: {}
      } as any;

      const synthesized = await synthesizer.synthesizeSingleResult(malformedResult, 'search_code');

      expect(synthesized.success).toBe(false);
      expect(synthesized.issues).toContain('Invalid tool result structure');
    });

    it('should handle synthesis errors gracefully', async () => {
      // Mock a synthesis error by providing invalid input
      const invalidResult = undefined as any;

      const synthesized = await synthesizer.synthesizeSingleResult(invalidResult, 'search_code');

      expect(synthesized.success).toBe(false);
      expect(synthesized.synthesizedContent).toContain('synthesis failed');
    });
  });
});
