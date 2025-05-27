/**
 * @fileoverview Context Management and Caching Validation Test Suite
 * Tests context preservation across tool calls within sessions, intelligent caching of analysis results,
 * context correlation and cross-tool result synthesis, and memory-efficient context compression
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MCPContextManager } from '../../agent/mcp-context-manager';
import { MCPOrchestrator } from '../../agent/mcp-orchestrator';
import { MCPPerformanceOptimizer } from '../../agent/mcp-performance-optimizer';
import { ToolExecutionContext } from '../../mcp/base-tool-handler';
import { ContextData, AnalysisSession, ToolExecutionResult } from '../../agent/types';

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

// Comprehensive test data for context management validation
const mockAnalysisData = {
  playerClass: {
    name: 'PlayerController',
    type: 'class',
    namespace: 'Game.Player',
    methods: ['Start', 'Update', 'Move', 'Jump', 'OnCollisionEnter'],
    fields: ['speed', 'jumpHeight', 'isGrounded', 'rigidbody'],
    dependencies: ['Rigidbody', 'Collider', 'InputManager', 'AudioSource'],
    baseClass: 'MonoBehaviour',
    interfaces: ['IMovable', 'IControllable']
  },
  enemyClass: {
    name: 'EnemyAI',
    type: 'class',
    namespace: 'Game.AI',
    methods: ['Start', 'Update', 'ChasePlayer', 'Attack'],
    fields: ['target', 'attackRange', 'health'],
    dependencies: ['PlayerController', 'NavMeshAgent', 'Animator'],
    baseClass: 'MonoBehaviour'
  },
  gameManager: {
    name: 'GameManager',
    type: 'class',
    namespace: 'Game.Core',
    methods: ['Awake', 'Start', 'InitializeGame', 'GameOver'],
    fields: ['instance', 'gameState', 'score'],
    dependencies: ['UIManager', 'AudioManager'],
    designPatterns: ['Singleton']
  }
};

describe('Context Management and Caching Validation', () => {
  let contextManager: MCPContextManager;
  let orchestrator: MCPOrchestrator;
  let performanceOptimizer: MCPPerformanceOptimizer;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    // Create comprehensive mock execution context
    mockContext = {
      vectorStore: {
        similaritySearch: jest.fn().mockImplementation(async (query: string, k: number) => {
          const allClasses = Object.values(mockAnalysisData);
          return allClasses
            .filter(cls => cls.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, k)
            .map(cls => ({
              pageContent: `class ${cls.name} : ${cls.baseClass || 'Object'} { ${cls.methods.join(', ')} }`,
              metadata: cls
            }));
        }),
        searchWithFilter: jest.fn().mockImplementation(async (query: string, filter: any, k: number) => {
          const allClasses = Object.values(mockAnalysisData);
          return allClasses
            .filter(cls => cls.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, k)
            .map(cls => ({
              pageContent: `class ${cls.name} { ${cls.methods.join(', ')} }`,
              metadata: cls
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

    // Initialize components with context management focused configuration
    contextManager = new MCPContextManager(mockContext, {
      maxSessionMemoryMB: 50,
      sessionTTLMs: 3600000, // 1 hour
      enableCompression: true,
      compressionThreshold: 100, // Low threshold for testing
      maxActiveSessions: 5,
      cacheConfig: {
        maxSizeMB: 25,
        ttlMs: 1800000, // 30 minutes
        maxEntries: 100
      }
    });

    orchestrator = new MCPOrchestrator(mockContext, {
      maxWorkflowDepth: 3,
      enableCaching: true,
      enableContextPersistence: true
    });

    performanceOptimizer = new MCPPerformanceOptimizer({
      enableCaching: true,
      enableMonitoring: false,
      enableLearning: false
    });
  });

  afterEach(() => {
    performanceOptimizer.dispose();
    if (contextManager && typeof contextManager.dispose === 'function') {
      contextManager.dispose();
    }
  });

  describe('Context Preservation Across Tool Calls', () => {
    it('should preserve context across multiple tool executions within a session', async () => {
      // Arrange: Create session and execute multiple related tools
      const session = await contextManager.createSession(
        'Analyze PlayerController class comprehensively'
      );

      // Act: Simulate multi-step analysis workflow with context preservation

      // Step 1: Search for PlayerController
      const searchContext: ContextData = {
        id: 'search-player-controller',
        type: 'tool_result',
        data: {
          searchQuery: 'PlayerController',
          results: [mockAnalysisData.playerClass],
          toolName: 'search_code'
        },
        metadata: {
          source: 'search_code',
          confidence: 0.9,
          relevance: 0.95,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['search', 'PlayerController', 'class'],
          relatedContexts: []
        }
      };

      await contextManager.storeContext(session.sessionId, searchContext);

      // Step 2: Analyze class hierarchy (should reference previous search)
      const hierarchyContext: ContextData = {
        id: 'hierarchy-player-controller',
        type: 'analysis_result',
        data: {
          className: 'PlayerController',
          baseClass: mockAnalysisData.playerClass.baseClass,
          interfaces: mockAnalysisData.playerClass.interfaces,
          inheritanceChain: ['MonoBehaviour', 'Behaviour', 'Component', 'Object'],
          toolName: 'find_class_hierarchy'
        },
        metadata: {
          source: 'find_class_hierarchy',
          confidence: 0.85,
          relevance: 0.9,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['hierarchy', 'inheritance', 'PlayerController'],
          relatedContexts: ['search-player-controller']
        }
      };

      await contextManager.storeContext(session.sessionId, hierarchyContext);

      // Step 3: Analyze dependencies (should reference both previous contexts)
      const dependencyContext: ContextData = {
        id: 'dependencies-player-controller',
        type: 'analysis_result',
        data: {
          className: 'PlayerController',
          dependencies: mockAnalysisData.playerClass.dependencies,
          dependencyGraph: {
            direct: ['Rigidbody', 'Collider', 'InputManager'],
            indirect: ['Transform', 'GameObject']
          },
          toolName: 'analyze_dependencies'
        },
        metadata: {
          source: 'analyze_dependencies',
          confidence: 0.8,
          relevance: 0.85,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['dependencies', 'analysis', 'PlayerController'],
          relatedContexts: ['search-player-controller', 'hierarchy-player-controller']
        }
      };

      await contextManager.storeContext(session.sessionId, dependencyContext);

      // Assert: Validate context preservation and relationships
      const allContexts = await contextManager.getAllContexts(session.sessionId);
      expect(allContexts).toHaveLength(3);

      // Verify context relationships are preserved
      const searchCtx = allContexts.find(c => c.id === 'search-player-controller');
      const hierarchyCtx = allContexts.find(c => c.id === 'hierarchy-player-controller');
      const dependencyCtx = allContexts.find(c => c.id === 'dependencies-player-controller');

      expect(searchCtx).toBeDefined();
      expect(hierarchyCtx).toBeDefined();
      expect(dependencyCtx).toBeDefined();

      // Verify cross-references
      expect(hierarchyCtx!.metadata.relatedContexts).toContain('search-player-controller');
      expect(dependencyCtx!.metadata.relatedContexts).toContain('search-player-controller');
      expect(dependencyCtx!.metadata.relatedContexts).toContain('hierarchy-player-controller');

      // Verify data consistency across contexts
      expect(searchCtx!.data.results[0].name).toBe('PlayerController');
      expect(hierarchyCtx!.data.className).toBe('PlayerController');
      expect(dependencyCtx!.data.className).toBe('PlayerController');
    });

    it('should maintain context integrity during concurrent tool executions', async () => {
      // Arrange: Create session for concurrent analysis
      const session = await contextManager.createSession(
        'Concurrent analysis of multiple classes'
      );

      // Act: Execute multiple tool analyses concurrently
      const concurrentAnalyses = [
        {
          id: 'player-analysis',
          className: 'PlayerController',
          data: mockAnalysisData.playerClass
        },
        {
          id: 'enemy-analysis',
          className: 'EnemyAI',
          data: mockAnalysisData.enemyClass
        },
        {
          id: 'manager-analysis',
          className: 'GameManager',
          data: mockAnalysisData.gameManager
        }
      ];

      const contextPromises = concurrentAnalyses.map(async (analysis) => {
        const contextData: ContextData = {
          id: analysis.id,
          type: 'concurrent_analysis',
          data: {
            className: analysis.className,
            analysisData: analysis.data,
            timestamp: Date.now()
          },
          metadata: {
            source: 'concurrent_tool',
            confidence: 0.9,
            relevance: 0.8,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 0,
            tags: ['concurrent', 'class', analysis.className.toLowerCase()],
            relatedContexts: []
          }
        };

        await contextManager.storeContext(session.sessionId, contextData);
        return contextData;
      });

      const storedContexts = await Promise.all(contextPromises);

      // Assert: Validate concurrent context integrity
      expect(storedContexts).toHaveLength(3);

      const retrievedContexts = await contextManager.getAllContexts(session.sessionId);
      expect(retrievedContexts).toHaveLength(3);

      // Verify each context maintained its integrity
      for (const originalContext of storedContexts) {
        const retrieved = retrievedContexts.find(c => c.id === originalContext.id);
        expect(retrieved).toBeDefined();
        expect(retrieved!.data.className).toBe(originalContext.data.className);
        expect(retrieved!.metadata.source).toBe('concurrent_tool');
      }

      // Verify no data corruption between concurrent operations
      const playerCtx = retrievedContexts.find(c => c.id === 'player-analysis');
      const enemyCtx = retrievedContexts.find(c => c.id === 'enemy-analysis');

      expect(playerCtx!.data.analysisData.name).toBe('PlayerController');
      expect(enemyCtx!.data.analysisData.name).toBe('EnemyAI');
      expect(playerCtx!.data.analysisData.namespace).not.toBe(enemyCtx!.data.analysisData.namespace);
    });
  });

  describe('Intelligent Caching of Analysis Results', () => {
    it('should cache tool results and retrieve them efficiently', async () => {
      // Arrange: Create session for caching test
      const session = await contextManager.createSession(
        'Test intelligent caching of analysis results'
      );

      // Act: Execute tool and cache result
      const toolResult = {
        toolName: 'search_code',
        parameters: { query: 'PlayerController', filter_type: 'class' },
        result: {
          success: true,
          data: [mockAnalysisData.playerClass],
          metadata: { resultCount: 1, executionTime: 150 }
        }
      };

      await contextManager.cacheToolResult(session.sessionId, toolResult);

      // Try to retrieve cached result with exact parameters
      const cachedResult = await contextManager.getCachedResult(
        session.sessionId,
        'search_code',
        { query: 'PlayerController', filter_type: 'class' }
      );

      // Assert: Cached result should be retrieved successfully
      expect(cachedResult).toBeDefined();
      expect(cachedResult!.result.success).toBe(true);
      expect(cachedResult!.result.data).toHaveLength(1);
      expect(cachedResult!.result.data[0].name).toBe('PlayerController');

      // Verify cache statistics
      const cacheStats = await contextManager.getCacheStats(session.sessionId);
      expect(cacheStats.hits).toBe(1);
      expect(cacheStats.misses).toBe(0);
    });

    it('should implement intelligent cache eviction policies', async () => {
      // Arrange: Create session with limited cache size
      const session = await contextManager.createSession(
        'Test cache eviction policies'
      );

      // Act: Fill cache beyond capacity with multiple tool results
      const toolResults = [];
      for (let i = 0; i < 15; i++) {
        toolResults.push({
          toolName: 'search_code',
          parameters: { query: `TestClass${i}`, filter_type: 'class' },
          result: {
            success: true,
            data: [{ name: `TestClass${i}`, type: 'class', content: `class TestClass${i} {}` }],
            metadata: { resultCount: 1 }
          }
        });
      }

      // Cache all results
      for (const result of toolResults) {
        await contextManager.cacheToolResult(session.sessionId, result);
      }

      // Assert: Cache should have evicted some entries
      const cacheStats = await contextManager.getCacheStats(session.sessionId);
      expect(cacheStats.evictions).toBeGreaterThan(0);
      expect(cacheStats.totalSize).toBeLessThanOrEqual(cacheStats.maxSizeMB * 1024 * 1024);
    });

    it('should provide accurate cache hit/miss statistics', async () => {
      // Arrange: Create session for statistics test
      const session = await contextManager.createSession(
        'Test cache statistics accuracy'
      );

      // Act: Cache a tool result
      const toolResult = {
        toolName: 'find_monobehaviours',
        parameters: { query: 'Player' },
        result: { success: true, data: [mockAnalysisData.playerClass], metadata: {} }
      };

      await contextManager.cacheToolResult(session.sessionId, toolResult);

      // Generate cache hit
      await contextManager.getCachedResult(session.sessionId, 'find_monobehaviours', { query: 'Player' });

      // Generate cache miss
      await contextManager.getCachedResult(session.sessionId, 'find_monobehaviours', { query: 'Enemy' });

      // Assert: Statistics should be accurate
      const stats = await contextManager.getCacheStats(session.sessionId);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should correlate related cached results intelligently', async () => {
      // Arrange: Create session for correlation test
      const session = await contextManager.createSession(
        'Test intelligent result correlation'
      );

      // Act: Cache related tool results
      const searchResult = {
        toolName: 'search_code',
        parameters: { query: 'PlayerController' },
        result: { success: true, data: [mockAnalysisData.playerClass], metadata: {} }
      };

      const hierarchyResult = {
        toolName: 'find_class_hierarchy',
        parameters: { class_name: 'PlayerController' },
        result: {
          success: true,
          data: {
            className: 'PlayerController',
            baseClass: 'MonoBehaviour',
            derivedClasses: []
          },
          metadata: {}
        }
      };

      await contextManager.cacheToolResult(session.sessionId, searchResult);
      await contextManager.cacheToolResult(session.sessionId, hierarchyResult);

      // Verify both results are cached
      const cachedSearch = await contextManager.getCachedResult(
        session.sessionId,
        'search_code',
        { query: 'PlayerController' }
      );

      const cachedHierarchy = await contextManager.getCachedResult(
        session.sessionId,
        'find_class_hierarchy',
        { class_name: 'PlayerController' }
      );

      // Assert: Both results should be cached and retrievable
      expect(cachedSearch).toBeDefined();
      expect(cachedHierarchy).toBeDefined();
      expect(cachedSearch!.result.success).toBe(true);
      expect(cachedHierarchy!.result.success).toBe(true);

      // Verify cache statistics show multiple entries
      const cacheStats = await contextManager.getCacheStats(session.sessionId);
      expect(cacheStats.hits).toBe(2); // Two cache hits
    });
  });

  describe('Context Correlation and Cross-Tool Result Synthesis', () => {
    it('should store and retrieve contexts from different tools analyzing the same entity', async () => {
      // Arrange: Create session for correlation test
      const session = await contextManager.createSession(
        'Test context correlation across tools'
      );

      // Act: Store contexts from different tools for the same entity
      const searchContext: ContextData = {
        id: 'search-player',
        type: 'tool_result',
        data: {
          searchQuery: 'PlayerController',
          results: [mockAnalysisData.playerClass],
          toolName: 'search_code'
        },
        metadata: {
          source: 'search_code',
          confidence: 0.9,
          relevance: 0.95,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['search', 'PlayerController', 'class'],
          relatedContexts: []
        }
      };

      const hierarchyContext: ContextData = {
        id: 'hierarchy-player',
        type: 'analysis_result',
        data: {
          className: 'PlayerController',
          baseClass: 'MonoBehaviour',
          derivedClasses: [],
          toolName: 'find_class_hierarchy'
        },
        metadata: {
          source: 'find_class_hierarchy',
          confidence: 0.85,
          relevance: 0.9,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['hierarchy', 'PlayerController', 'inheritance'],
          relatedContexts: ['search-player']
        }
      };

      const dependencyContext: ContextData = {
        id: 'dependencies-player',
        type: 'analysis_result',
        data: {
          className: 'PlayerController',
          dependencies: mockAnalysisData.playerClass.dependencies,
          toolName: 'analyze_dependencies'
        },
        metadata: {
          source: 'analyze_dependencies',
          confidence: 0.8,
          relevance: 0.85,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['dependencies', 'PlayerController', 'analysis'],
          relatedContexts: ['search-player', 'hierarchy-player']
        }
      };

      await contextManager.storeContext(session.sessionId, searchContext);
      await contextManager.storeContext(session.sessionId, hierarchyContext);
      await contextManager.storeContext(session.sessionId, dependencyContext);

      // Assert: All contexts should be stored and retrievable
      const retrievedSearch = await contextManager.getContext(session.sessionId, 'search-player');
      const retrievedHierarchy = await contextManager.getContext(session.sessionId, 'hierarchy-player');
      const retrievedDependency = await contextManager.getContext(session.sessionId, 'dependencies-player');

      expect(retrievedSearch).toBeDefined();
      expect(retrievedHierarchy).toBeDefined();
      expect(retrievedDependency).toBeDefined();

      // Verify context data integrity
      expect(retrievedSearch!.data.searchQuery).toBe('PlayerController');
      expect(retrievedHierarchy!.data.className).toBe('PlayerController');
      expect(retrievedDependency!.data.className).toBe('PlayerController');

      // Verify related contexts are preserved
      expect(retrievedHierarchy!.metadata.relatedContexts).toContain('search-player');
      expect(retrievedDependency!.metadata.relatedContexts).toContain('search-player');
      expect(retrievedDependency!.metadata.relatedContexts).toContain('hierarchy-player');
    });

    it('should store and retrieve multiple related contexts for synthesis', async () => {
      // Arrange: Create session with multiple related contexts
      const session = await contextManager.createSession(
        'Test cross-tool result synthesis'
      );

      // Store multiple contexts for the same entity
      const contexts = [
        {
          id: 'search-enemy',
          type: 'tool_result' as const,
          data: { entity: 'EnemyAI', results: [mockAnalysisData.enemyClass] },
          metadata: {
            source: 'search_code',
            confidence: 0.9,
            relevance: 0.95,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 0,
            tags: ['search', 'EnemyAI'],
            relatedContexts: []
          }
        },
        {
          id: 'patterns-enemy',
          type: 'analysis_result' as const,
          data: {
            entity: 'EnemyAI',
            patterns: ['State Machine', 'Observer'],
            confidence: 0.8
          },
          metadata: {
            source: 'find_design_patterns',
            confidence: 0.8,
            relevance: 0.85,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 0,
            tags: ['patterns', 'EnemyAI'],
            relatedContexts: ['search-enemy']
          }
        }
      ];

      for (const context of contexts) {
        await contextManager.storeContext(session.sessionId, context);
      }

      // Act: Retrieve all contexts
      const searchContext = await contextManager.getContext(session.sessionId, 'search-enemy');
      const patternsContext = await contextManager.getContext(session.sessionId, 'patterns-enemy');

      // Assert: Should provide comprehensive data for synthesis
      expect(searchContext).toBeDefined();
      expect(patternsContext).toBeDefined();

      expect(searchContext!.data.entity).toBe('EnemyAI');
      expect(patternsContext!.data.entity).toBe('EnemyAI');
      expect(patternsContext!.data.patterns).toContain('State Machine');
      expect(patternsContext!.data.patterns).toContain('Observer');

      // Verify related contexts are preserved for synthesis
      expect(patternsContext!.metadata.relatedContexts).toContain('search-enemy');
      expect(patternsContext!.metadata.source).toBe('find_design_patterns');
      expect(searchContext!.metadata.source).toBe('search_code');
    });
  });

  describe('Memory-Efficient Context Compression', () => {
    it('should compress large context data automatically', async () => {
      // Arrange: Create session with compression enabled
      const session = await contextManager.createSession(
        'Test context compression for large data'
      );

      // Create large context data that exceeds compression threshold
      const largeData = {
        className: 'LargeClass',
        methods: Array.from({ length: 100 }, (_, i) => ({
          name: `method${i}`,
          parameters: Array.from({ length: 10 }, (_, j) => `param${j}`),
          body: `// Large method body with lots of content ${'x'.repeat(1000)}`
        })),
        fields: Array.from({ length: 50 }, (_, i) => ({
          name: `field${i}`,
          type: 'string',
          value: `Large field value ${'y'.repeat(500)}`
        }))
      };

      const largeContext: ContextData = {
        id: 'large-context',
        type: 'analysis_result',
        data: largeData,
        metadata: {
          source: 'search_code',
          confidence: 0.9,
          relevance: 0.95,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['large', 'compression'],
          relatedContexts: []
        }
      };

      // Act: Store large context (should trigger compression)
      await contextManager.storeContext(session.sessionId, largeContext);

      // Retrieve context (should decompress automatically)
      const retrievedContext = await contextManager.getContext(session.sessionId, 'large-context');

      // Assert: Context should be compressed and decompressed correctly
      expect(retrievedContext).toBeDefined();
      expect(retrievedContext!.data.className).toBe('LargeClass');
      expect(retrievedContext!.data.methods).toHaveLength(100);
      expect(retrievedContext!.data.fields).toHaveLength(50);

      // Verify compression occurred by checking memory stats
      const memoryStats = await contextManager.getMemoryStats(session.sessionId);
      expect(memoryStats.compressedDataSize).toBeGreaterThan(0);
      expect(memoryStats.compressionRatio).toBeGreaterThan(0.1);
    });

    it('should handle compression and decompression errors gracefully', async () => {
      // Arrange: Create session for error handling test
      const session = await contextManager.createSession(
        'Test compression error handling'
      );

      // Create context with circular references (should handle gracefully)
      const circularData: any = { name: 'CircularTest' };
      circularData.self = circularData; // Circular reference

      const problematicContext: ContextData = {
        id: 'problematic-context',
        type: 'analysis_result',
        data: circularData,
        metadata: {
          source: 'test',
          confidence: 0.9,
          relevance: 0.95,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['circular', 'error'],
          relatedContexts: []
        }
      };

      // Act & Assert: Should handle circular reference gracefully
      // Note: This will likely throw due to JSON.stringify circular reference
      await expect(
        contextManager.storeContext(session.sessionId, problematicContext)
      ).rejects.toThrow();

      // Create a non-circular context instead to test error recovery
      const safeContext: ContextData = {
        id: 'safe-context',
        type: 'analysis_result',
        data: { name: 'SafeTest', content: 'Safe content' },
        metadata: {
          source: 'test',
          confidence: 0.9,
          relevance: 0.95,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['safe', 'test'],
          relatedContexts: []
        }
      };

      await contextManager.storeContext(session.sessionId, safeContext);
      const retrieved = await contextManager.getContext(session.sessionId, 'safe-context');
      expect(retrieved).toBeDefined();
      expect(retrieved!.data.name).toBe('SafeTest');
    });

    it('should optimize compression based on data patterns', async () => {
      // Arrange: Create session for compression optimization test
      const session = await contextManager.createSession(
        'Test compression optimization'
      );

      // Create different types of data to test compression efficiency
      const textHeavyData = {
        type: 'text-heavy',
        content: 'Lorem ipsum '.repeat(1000),
        description: 'Text heavy content '.repeat(500)
      };

      const structuredData = {
        type: 'structured',
        classes: Array.from({ length: 50 }, (_, i) => ({
          name: `Class${i}`,
          methods: [`method1`, `method2`, `method3`],
          fields: [`field1`, `field2`]
        }))
      };

      const contexts = [
        {
          id: 'text-heavy',
          type: 'analysis_result' as const,
          data: textHeavyData,
          metadata: {
            source: 'test',
            confidence: 0.9,
            relevance: 0.95,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 0,
            tags: ['text'],
            relatedContexts: []
          }
        },
        {
          id: 'structured',
          type: 'analysis_result' as const,
          data: structuredData,
          metadata: {
            source: 'test',
            confidence: 0.9,
            relevance: 0.95,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 0,
            tags: ['structured'],
            relatedContexts: []
          }
        }
      ];

      // Act: Store both contexts
      for (const context of contexts) {
        await contextManager.storeContext(session.sessionId, context);
      }

      // Assert: Compression should be optimized for different data types
      const memoryStats = await contextManager.getMemoryStats(session.sessionId);
      expect(memoryStats.compressedDataSize).toBeGreaterThan(0);
      expect(memoryStats.compressionRatio).toBeGreaterThan(0.1);
      expect(memoryStats.totalMemoryUsed).toBeGreaterThan(0);
    });
  });

  describe('Session Lifecycle Management and Cleanup', () => {
    it('should manage session creation and expiration correctly', async () => {
      // Arrange: Create session with short TTL for testing
      const shortTTLSession = await contextManager.createSession(
        'Test session expiration',
        { ttlMs: 100 } // Very short TTL for testing
      );

      // Act: Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Try to access expired session
      const expiredSession = await contextManager.getSession(shortTTLSession.sessionId);

      // Assert: Session should be expired or cleaned up
      expect(expiredSession).toBeNull();
    });

    it('should handle session cleanup and resource management', async () => {
      // Arrange: Create multiple sessions to test cleanup
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const session = await contextManager.createSession(
          `Test session ${i}`,
          { ttlMs: 5000 }
        );
        sessions.push(session);

        // Add some context data to each session
        await contextManager.storeContext(session.sessionId, {
          id: `context-${i}`,
          type: 'tool_result',
          data: { test: `data-${i}` },
          metadata: {
            source: 'test',
            confidence: 0.9,
            relevance: 0.95,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 0,
            tags: ['test'],
            relatedContexts: []
          }
        });
      }

      // Act: Trigger cleanup
      await contextManager.cleanupExpiredSessions();

      // Assert: Active sessions should still exist
      for (const session of sessions) {
        const activeSession = await contextManager.getSession(session.sessionId);
        expect(activeSession).toBeDefined();
        expect(activeSession!.state).toBe('active');
      }

      // Verify session metrics
      const sessionStats = await contextManager.getSessionStats();
      expect(sessionStats.activeSessions).toBe(3);
      expect(sessionStats.totalSessions).toBeGreaterThanOrEqual(3);
    });

    it('should enforce session limits and evict oldest sessions', async () => {
      // Arrange: Create more sessions than the configured limit
      const maxSessions = 5; // Assuming this is the configured limit
      const sessions = [];

      for (let i = 0; i < maxSessions + 2; i++) {
        const session = await contextManager.createSession(
          `Limit test session ${i}`
        );
        sessions.push(session);

        // Add small delay to ensure different creation times
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Act: Check active sessions
      const sessionStats = await contextManager.getSessionStats();

      // Assert: Should not exceed session limit
      expect(sessionStats.activeSessions).toBeLessThanOrEqual(maxSessions);

      // Verify oldest sessions were evicted
      const firstSession = await contextManager.getSession(sessions[0].sessionId);
      const lastSession = await contextManager.getSession(sessions[sessions.length - 1].sessionId);

      expect(firstSession).toBeNull(); // Oldest should be evicted
      expect(lastSession).toBeDefined(); // Newest should remain
    });

    it('should provide comprehensive session statistics and monitoring', async () => {
      // Arrange: Create session with various activities
      const session = await contextManager.createSession(
        'Statistics test session'
      );

      // Add contexts and cache results
      await contextManager.storeContext(session.sessionId, {
        id: 'stats-context',
        type: 'tool_result',
        data: { test: 'statistics' },
        metadata: {
          source: 'test',
          confidence: 0.9,
          relevance: 0.95,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['stats'],
          relatedContexts: []
        }
      });

      await contextManager.cacheToolResult(session.sessionId, {
        toolName: 'test_tool',
        parameters: { test: 'param' },
        result: { success: true, data: 'test result', metadata: {} }
      });

      // Act: Get comprehensive statistics
      const sessionStats = await contextManager.getSessionStats();
      const memoryStats = await contextManager.getMemoryStats(session.sessionId);
      const cacheStats = await contextManager.getCacheStats(session.sessionId);

      // Assert: Statistics should be comprehensive and accurate
      expect(sessionStats).toBeDefined();
      expect(sessionStats.activeSessions).toBeGreaterThan(0);
      expect(sessionStats.memoryUsage).toBeGreaterThan(0);

      expect(memoryStats).toBeDefined();
      expect(memoryStats.totalMemoryUsed).toBeGreaterThan(0);

      expect(cacheStats).toBeDefined();
      expect(cacheStats.totalSize).toBeGreaterThanOrEqual(0);
    });

    it('should handle graceful shutdown and resource cleanup', async () => {
      // Arrange: Create session with resources
      const session = await contextManager.createSession(
        'Shutdown test session'
      );

      await contextManager.storeContext(session.sessionId, {
        id: 'shutdown-context',
        type: 'tool_result',
        data: { test: 'shutdown' },
        metadata: {
          source: 'test',
          confidence: 0.9,
          relevance: 0.95,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['shutdown'],
          relatedContexts: []
        }
      });

      // Act: Trigger graceful shutdown
      if (typeof contextManager.dispose === 'function') {
        await contextManager.dispose();
      }

      // Assert: Resources should be cleaned up
      // Note: After disposal, operations should either fail gracefully or be no-ops
      try {
        const postShutdownSession = await contextManager.getSession(session.sessionId);
        // If this doesn't throw, the session should be null or undefined
        expect(postShutdownSession).toBeFalsy();
      } catch (error) {
        // Graceful failure is also acceptable
        expect(error).toBeDefined();
      }
    });
  });
});
