/**
 * @fileoverview Test suite for Enhanced MCP Context Management
 * Tests context preservation, intelligent caching, and session management
 */

import { MCPContextManager } from '../../agent/mcp-context-manager';
import { ToolExecutionContext } from '../../mcp/base-tool-handler';
import { Logger } from '../../mcp/mcp-sdk-server';
import {
  AnalysisSession,
  ContextData,
  SessionCache,
  ContextRecommendation,
  SessionMetrics,
  ContextCompressionConfig
} from '../../agent/types';

// Mock dependencies
jest.mock('../../mcp/mcp-sdk-server');

describe('MCPContextManager', () => {
  let contextManager: MCPContextManager;
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

    // Initialize context manager
    contextManager = new MCPContextManager(mockContext, {
      maxSessionMemoryMB: 100,
      sessionTTLMs: 3600000, // 1 hour
      enableCompression: true,
      compressionThreshold: 1024,
      maxActiveSessions: 10
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Session Management', () => {
    it('should create new analysis session', async () => {
      const request = "Analyze Player class hierarchy";

      const session = await contextManager.createSession(request);

      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.originalRequest).toBe(request);
      expect(session.state).toBe('active');
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.contextData).toBeInstanceOf(Map);
      expect(session.discoveredEntities).toBeInstanceOf(Map);
    });

    it('should retrieve existing session', async () => {
      const request = "Find MonoBehaviour classes";
      const session = await contextManager.createSession(request);

      const retrieved = await contextManager.getSession(session.sessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved!.sessionId).toBe(session.sessionId);
      expect(retrieved!.originalRequest).toBe(request);
    });

    it('should update session activity timestamp', async () => {
      const session = await contextManager.createSession("Test request");
      const originalTimestamp = session.lastActivityAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await contextManager.updateSessionActivity(session.sessionId);
      const updated = await contextManager.getSession(session.sessionId);

      expect(updated!.lastActivityAt).toBeGreaterThan(originalTimestamp);
    });

    it('should expire old sessions', async () => {
      // Create session with short TTL
      const session = await contextManager.createSession("Test request", {
        sessionTTLMs: 100 // 100ms
      });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      await contextManager.cleanupExpiredSessions();
      const retrieved = await contextManager.getSession(session.sessionId);

      expect(retrieved).toBeNull();
    });

    it('should handle session cleanup', async () => {
      const sessions = await Promise.all([
        contextManager.createSession("Request 1"),
        contextManager.createSession("Request 2"),
        contextManager.createSession("Request 3")
      ]);

      const stats = await contextManager.getSessionStats();
      expect(stats.activeSessions).toBe(3);

      await contextManager.cleanup();

      const statsAfter = await contextManager.getSessionStats();
      expect(statsAfter.activeSessions).toBe(0);
    });
  });

  describe('Context Persistence', () => {
    it('should store and retrieve context data', async () => {
      const session = await contextManager.createSession("Test request");

      const contextData: ContextData = {
        id: 'test-context-1',
        type: 'tool_result',
        data: { className: 'Player', methods: ['Start', 'Update'] },
        metadata: {
          source: 'search_code',
          confidence: 0.9,
          relevance: 0.8,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['class', 'player'],
          relatedContexts: []
        }
      };

      await contextManager.storeContext(session.sessionId, contextData);
      const retrieved = await contextManager.getContext(session.sessionId, 'test-context-1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.data.className).toBe('Player');
      expect(retrieved!.metadata.source).toBe('search_code');
    });

    it('should maintain context integrity across tool calls', async () => {
      const session = await contextManager.createSession("Complex analysis");

      // Store multiple related contexts
      const contexts = [
        {
          id: 'player-class',
          type: 'entity_info' as const,
          data: { name: 'Player', type: 'class' },
          metadata: {
            source: 'search_code',
            confidence: 0.9,
            relevance: 0.9,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 0,
            tags: ['class', 'player'],
            relatedContexts: ['player-hierarchy']
          }
        },
        {
          id: 'player-hierarchy',
          type: 'analysis_state' as const,
          data: { baseClass: 'MonoBehaviour', interfaces: ['IMovable'] },
          metadata: {
            source: 'find_class_hierarchy',
            confidence: 0.8,
            relevance: 0.9,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 0,
            tags: ['hierarchy', 'inheritance'],
            relatedContexts: ['player-class']
          }
        }
      ];

      for (const context of contexts) {
        await contextManager.storeContext(session.sessionId, context);
      }

      const allContexts = await contextManager.getAllContexts(session.sessionId);
      expect(allContexts).toHaveLength(2);

      // Verify relationships are maintained
      const playerContext = allContexts.find(c => c.id === 'player-class');
      expect(playerContext!.metadata.relatedContexts).toContain('player-hierarchy');
    });

    it('should handle context updates', async () => {
      const session = await contextManager.createSession("Update test");

      const originalContext: ContextData = {
        id: 'update-test',
        type: 'entity_info',
        data: { name: 'Enemy', methods: ['Attack'] },
        metadata: {
          source: 'search_code',
          confidence: 0.7,
          relevance: 0.8,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['class'],
          relatedContexts: []
        }
      };

      await contextManager.storeContext(session.sessionId, originalContext);

      // Update with additional information
      const updatedData = {
        name: 'Enemy',
        methods: ['Attack', 'Move', 'TakeDamage'],
        properties: ['health', 'damage']
      };

      await contextManager.updateContext(session.sessionId, 'update-test', updatedData);

      const retrieved = await contextManager.getContext(session.sessionId, 'update-test');
      expect(retrieved!.data.methods).toHaveLength(3);
      expect(retrieved!.data.properties).toBeDefined();
      expect(retrieved!.metadata.accessCount).toBeGreaterThan(0);
    });
  });

  describe('Intelligent Caching', () => {
    it('should cache tool results with correlation', async () => {
      const session = await contextManager.createSession("Caching test");

      const toolResult = {
        toolName: 'search_code',
        parameters: { query: 'Player', filter_type: 'class' },
        result: {
          success: true,
          data: [{ content: 'class Player { }', metadata: { type: 'class' } }],
          metadata: { resultCount: 1 }
        }
      };

      await contextManager.cacheToolResult(session.sessionId, toolResult);

      // Try to retrieve with similar parameters
      const cached = await contextManager.getCachedResult(session.sessionId, 'search_code', {
        query: 'Player',
        filter_type: 'class'
      });

      expect(cached).toBeDefined();
      expect(cached!.result.data).toHaveLength(1);
    });

    it('should implement cache eviction policies', async () => {
      const session = await contextManager.createSession("Eviction test");

      // Fill cache beyond capacity
      const results = [];
      for (let i = 0; i < 15; i++) {
        results.push({
          toolName: 'search_code',
          parameters: { query: `Class${i}` },
          result: {
            success: true,
            data: [{ content: `class Class${i} { }` }],
            metadata: { resultCount: 1 }
          }
        });
      }

      for (const result of results) {
        await contextManager.cacheToolResult(session.sessionId, result);
      }

      const cacheStats = await contextManager.getCacheStats(session.sessionId);
      expect(cacheStats.evictions).toBeGreaterThan(0);
      expect(cacheStats.totalSize).toBeLessThanOrEqual(cacheStats.maxSizeMB * 1024 * 1024);
    });

    it('should provide cache hit/miss statistics', async () => {
      const session = await contextManager.createSession("Stats test");

      const toolResult = {
        toolName: 'find_monobehaviours',
        parameters: { query: 'Player' },
        result: { success: true, data: [], metadata: {} }
      };

      await contextManager.cacheToolResult(session.sessionId, toolResult);

      // Cache hit
      await contextManager.getCachedResult(session.sessionId, 'find_monobehaviours', { query: 'Player' });

      // Cache miss
      await contextManager.getCachedResult(session.sessionId, 'find_monobehaviours', { query: 'Enemy' });

      const stats = await contextManager.getCacheStats(session.sessionId);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('Context Correlation', () => {
    it('should correlate results from different tools', async () => {
      const session = await contextManager.createSession("Correlation test");

      // Store related contexts from different tools
      const searchResult: ContextData = {
        id: 'search-player',
        type: 'tool_result',
        data: { className: 'Player', namespace: 'Game.Characters' },
        metadata: {
          source: 'search_code',
          confidence: 0.9,
          relevance: 0.9,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['class', 'player', 'character'],
          relatedContexts: []
        }
      };

      const hierarchyResult: ContextData = {
        id: 'hierarchy-player',
        type: 'tool_result',
        data: { baseClass: 'MonoBehaviour', interfaces: ['IMovable', 'IDamageable'] },
        metadata: {
          source: 'find_class_hierarchy',
          confidence: 0.8,
          relevance: 0.9,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['hierarchy', 'inheritance', 'player'],
          relatedContexts: []
        }
      };

      await contextManager.storeContext(session.sessionId, searchResult);
      await contextManager.storeContext(session.sessionId, hierarchyResult);

      const correlations = await contextManager.findCorrelations(session.sessionId, 'player');

      expect(correlations).toHaveLength(2);
      expect(correlations.some(c => c.id === 'search-player')).toBe(true);
      expect(correlations.some(c => c.id === 'hierarchy-player')).toBe(true);
    });

    it('should build knowledge graph of related entities', async () => {
      const session = await contextManager.createSession("Knowledge graph test");

      // Add multiple related entities
      const entities = [
        { name: 'Player', type: 'class', relationships: [{ type: 'inherits', target: 'MonoBehaviour' }] },
        { name: 'Enemy', type: 'class', relationships: [{ type: 'inherits', target: 'MonoBehaviour' }] },
        { name: 'MonoBehaviour', type: 'class', relationships: [] },
        { name: 'IMovable', type: 'interface', relationships: [] }
      ];

      for (const entity of entities) {
        await contextManager.addEntity(session.sessionId, entity);
      }

      const graph = await contextManager.getEntityGraph(session.sessionId);

      expect(graph.has('Player')).toBe(true);
      expect(graph.has('Enemy')).toBe(true);
      expect(graph.has('MonoBehaviour')).toBe(true);

      const playerRelations = graph.get('Player');
      expect(playerRelations!.has('MonoBehaviour')).toBe(true);
    });

    it('should suggest related analysis based on context', async () => {
      const session = await contextManager.createSession("Suggestion test");

      // Add context indicating Player class analysis
      await contextManager.storeContext(session.sessionId, {
        id: 'player-analysis',
        type: 'entity_info',
        data: { name: 'Player', type: 'class', analyzed: ['structure'] },
        metadata: {
          source: 'search_code',
          confidence: 0.9,
          relevance: 0.9,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['class', 'player'],
          relatedContexts: []
        }
      });

      const recommendations = await contextManager.getRecommendations(session.sessionId);

      expect(recommendations).toHaveLength(3);
      expect(recommendations.some(r => r.toolName === 'find_class_hierarchy')).toBe(true);
      expect(recommendations.some(r => r.toolName === 'analyze_dependencies')).toBe(true);
    });
  });

  describe('Memory Compression', () => {
    it('should compress large context data', async () => {
      const session = await contextManager.createSession("Compression test");

      // Create large context data
      const largeData = {
        methods: Array.from({ length: 1000 }, (_, i) => ({
          name: `Method${i}`,
          parameters: Array.from({ length: 10 }, (_, j) => `param${j}`),
          body: `// Method ${i} implementation\n`.repeat(50)
        }))
      };

      const contextData: ContextData = {
        id: 'large-context',
        type: 'tool_result',
        data: largeData,
        metadata: {
          source: 'search_code',
          confidence: 0.9,
          relevance: 0.8,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          tags: ['large-data'],
          relatedContexts: []
        }
      };

      await contextManager.storeContext(session.sessionId, contextData);

      const retrieved = await contextManager.getContext(session.sessionId, 'large-context');

      expect(retrieved).toBeDefined();
      expect(retrieved!.data.methods).toHaveLength(1000);

      // Check if compression was applied
      if (retrieved!.compression) {
        expect(retrieved!.compression.isCompressed).toBe(true);
        expect(retrieved!.compression.compressedSize).toBeLessThan(retrieved!.compression.originalSize);
      }
    });

    it('should optimize memory usage for long sessions', async () => {
      const session = await contextManager.createSession("Memory optimization test");

      // Add many contexts to trigger memory optimization
      for (let i = 0; i < 50; i++) {
        await contextManager.storeContext(session.sessionId, {
          id: `context-${i}`,
          type: 'tool_result',
          data: { index: i, data: 'x'.repeat(1000) },
          metadata: {
            source: 'test_tool',
            confidence: 0.8,
            relevance: 0.5,
            createdAt: Date.now() - (50 - i) * 1000, // Older contexts first
            lastAccessedAt: Date.now() - (50 - i) * 1000,
            accessCount: 0,
            tags: [`context-${i}`],
            relatedContexts: []
          }
        });
      }

      const memoryStats = await contextManager.getMemoryStats(session.sessionId);

      expect(memoryStats.totalMemoryUsed).toBeGreaterThan(0);
      expect(memoryStats.compressionRatio).toBeGreaterThan(0);

      // Trigger memory optimization
      await contextManager.optimizeMemory(session.sessionId);

      const optimizedStats = await contextManager.getMemoryStats(session.sessionId);
      expect(optimizedStats.compressedDataSize).toBeGreaterThan(0);
    });

    it('should handle compression configuration', async () => {
      const compressionConfig: ContextCompressionConfig = {
        enabled: true,
        algorithm: 'gzip',
        level: 6,
        threshold: 512,
        maxUncompressedMB: 10,
        stats: {
          totalCompressed: 0,
          totalSaved: 0,
          averageRatio: 0,
          compressionTime: 0,
          decompressionTime: 0
        }
      };

      const session = await contextManager.createSession("Compression config test", {
        compressionConfig
      });

      const config = await contextManager.getCompressionConfig(session.sessionId);

      expect(config.enabled).toBe(true);
      expect(config.algorithm).toBe('gzip');
      expect(config.level).toBe(6);
      expect(config.threshold).toBe(512);
    });
  });

  describe('Context-Aware Tool Selection', () => {
    it('should recommend tools based on previous analysis', async () => {
      const session = await contextManager.createSession("Tool recommendation test");

      // Simulate previous tool execution
      await contextManager.recordToolExecution(session.sessionId, {
        toolName: 'search_code',
        parameters: { query: 'Player', filter_type: 'class' },
        result: {
          success: true,
          data: [{ content: 'class Player { }', metadata: { type: 'class' } }],
          metadata: { resultCount: 1 }
        },
        timestamp: Date.now()
      });

      const recommendations = await contextManager.getToolRecommendations(session.sessionId);

      expect(recommendations).toHaveLength(3);

      const hierarchyRec = recommendations.find(r => r.toolName === 'find_class_hierarchy');
      expect(hierarchyRec).toBeDefined();
      expect(hierarchyRec!.confidence).toBeGreaterThan(0.7);
      expect(hierarchyRec!.suggestedParameters.class_name).toBe('Player');
    });

    it('should avoid redundant tool calls', async () => {
      const session = await contextManager.createSession("Redundancy test");

      // Record multiple executions of the same tool
      const toolExecution = {
        toolName: 'search_code',
        parameters: { query: 'Player' },
        result: { success: true, data: [], metadata: {} },
        timestamp: Date.now()
      };

      await contextManager.recordToolExecution(session.sessionId, toolExecution);
      await contextManager.recordToolExecution(session.sessionId, toolExecution);

      const recommendations = await contextManager.getToolRecommendations(session.sessionId);

      // Should not recommend the same tool again
      const searchRec = recommendations.find(r => r.toolName === 'search_code');
      expect(searchRec?.confidence || 0).toBeLessThan(0.5);
    });

    it('should suggest complementary analysis', async () => {
      const session = await contextManager.createSession("Complementary analysis test");

      // Record class search
      await contextManager.recordToolExecution(session.sessionId, {
        toolName: 'search_code',
        parameters: { query: 'Player', filter_type: 'class' },
        result: {
          success: true,
          data: [{ content: 'class Player : MonoBehaviour { }' }],
          metadata: { resultCount: 1 }
        },
        timestamp: Date.now()
      });

      const recommendations = await contextManager.getToolRecommendations(session.sessionId);

      // Should suggest complementary tools
      const complementaryTools = ['find_class_hierarchy', 'analyze_dependencies', 'find_cross_references'];
      const suggestedTools = recommendations.map(r => r.toolName);

      expect(complementaryTools.some(tool => suggestedTools.includes(tool))).toBe(true);
    });
  });

  describe('Session Analytics', () => {
    it('should track session metrics', async () => {
      const session = await contextManager.createSession("Metrics test");

      // Simulate some activity
      await contextManager.recordToolExecution(session.sessionId, {
        toolName: 'search_code',
        parameters: { query: 'Player' },
        result: { success: true, data: [], metadata: {} },
        timestamp: Date.now()
      });

      await contextManager.addEntity(session.sessionId, {
        name: 'Player',
        type: 'class',
        relationships: []
      });

      const metrics = await contextManager.getSessionMetrics(session.sessionId);

      expect(metrics.toolsExecuted).toBe(1);
      expect(metrics.entitiesDiscovered).toBe(1);
      expect(metrics.totalDuration).toBeGreaterThan(0);
      expect(metrics.cachePerformance).toBeDefined();
      expect(metrics.memoryMetrics).toBeDefined();
    });

    it('should provide session statistics', async () => {
      // Create multiple sessions
      await contextManager.createSession("Session 1");
      await contextManager.createSession("Session 2");
      await contextManager.createSession("Session 3");

      const stats = await contextManager.getSessionStats();

      expect(stats.activeSessions).toBe(3);
      expect(stats.totalSessions).toBe(3);
      expect(stats.averageSessionDuration).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });
});
