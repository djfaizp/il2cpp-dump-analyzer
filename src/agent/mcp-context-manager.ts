/**
 * @fileoverview Enhanced MCP Context Management
 * Provides context preservation, intelligent caching, and session management
 * for complex IL2CPP analysis workflows within the MCP framework
 */

import { ToolExecutionContext } from '../mcp/base-tool-handler';
import { Logger } from '../mcp/mcp-sdk-server';
import { getAllToolNames } from '../mcp/tools/tool-registry';
import {
  AnalysisSession,
  ContextData,
  EntityContext,
  SessionCache,
  ContextCacheEntry,
  ContextCorrelation,
  SessionMetrics,
  SessionPreferences,
  ContextRecommendation,
  ContextCompressionConfig,
  ToolExecutionResult
} from './types';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Configuration options for the MCP Context Manager
 */
export interface ContextManagerConfig {
  /** Maximum memory per session in MB */
  maxSessionMemoryMB: number;

  /** Session TTL in milliseconds */
  sessionTTLMs: number;

  /** Enable context compression */
  enableCompression: boolean;

  /** Compression threshold in bytes */
  compressionThreshold: number;

  /** Maximum number of active sessions */
  maxActiveSessions: number;

  /** Cache configuration */
  cacheConfig?: {
    maxSizeMB: number;
    ttlMs: number;
    maxEntries: number;
  };

  /** Compression configuration */
  compressionConfig?: ContextCompressionConfig;
}

/**
 * Default configuration for the Context Manager
 */
const DEFAULT_CONFIG: ContextManagerConfig = {
  maxSessionMemoryMB: 100,
  sessionTTLMs: 3600000, // 1 hour
  enableCompression: true,
  compressionThreshold: 100, // 100 bytes - very low threshold for testing
  maxActiveSessions: 10,
  cacheConfig: {
    maxSizeMB: 50,
    ttlMs: 1800000, // 30 minutes
    maxEntries: 1000
  },
  compressionConfig: {
    enabled: true,
    algorithm: 'gzip',
    level: 6,
    threshold: 100, // Very low threshold for testing
    maxUncompressedMB: 20,
    stats: {
      totalCompressed: 0,
      totalSaved: 0,
      averageRatio: 0,
      compressionTime: 0,
      decompressionTime: 0
    }
  }
};

/**
 * Enhanced MCP Context Management System
 * Provides intelligent context preservation and correlation across MCP tool calls
 */
export class MCPContextManager {
  private context: ToolExecutionContext;
  private config: ContextManagerConfig;
  private sessions: Map<string, AnalysisSession>;
  private globalCorrelation: ContextCorrelation;
  private compressionStats: ContextCompressionConfig['stats'];

  constructor(context: ToolExecutionContext, config: Partial<ContextManagerConfig> = {}) {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessions = new Map();
    this.globalCorrelation = this.initializeCorrelation();
    this.compressionStats = { ...DEFAULT_CONFIG.compressionConfig!.stats };

    this.context.logger.info('MCP Context Manager initialized', {
      config: this.config,
      maxSessions: this.config.maxActiveSessions
    });

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Create a new analysis session
   */
  async createSession(
    originalRequest: string,
    options: {
      sessionTTLMs?: number;
      preferences?: SessionPreferences;
      compressionConfig?: ContextCompressionConfig;
    } = {}
  ): Promise<AnalysisSession> {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    const ttl = options.sessionTTLMs || this.config.sessionTTLMs;

    // Update compression config if provided
    if (options.compressionConfig) {
      this.config.compressionConfig = { ...this.config.compressionConfig!, ...options.compressionConfig };
    }

    const session: AnalysisSession = {
      sessionId,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + ttl,
      originalRequest,
      state: 'active',
      contextData: new Map(),
      executedTools: [],
      discoveredEntities: new Map(),
      sessionCache: this.initializeSessionCache(),
      metrics: this.initializeSessionMetrics(),
      preferences: options.preferences
    };

    // Check session limit
    if (this.sessions.size >= this.config.maxActiveSessions) {
      await this.evictOldestSession();
    }

    this.sessions.set(sessionId, session);

    this.context.logger.info('Analysis session created', {
      sessionId,
      originalRequest,
      expiresAt: session.expiresAt
    });

    return session;
  }

  /**
   * Retrieve an existing session
   */
  async getSession(sessionId: string): Promise<AnalysisSession | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (Date.now() > session.expiresAt) {
      await this.expireSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Update session activity timestamp
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = Date.now();
      this.context.logger.debug('Session activity updated', { sessionId });
    }
  }

  /**
   * Store context data in a session
   */
  async storeContext(sessionId: string, contextData: ContextData): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Check if compression is needed
    const dataSize = this.calculateDataSize(contextData.data);
    if (this.config.enableCompression && dataSize > this.config.compressionThreshold) {
      contextData = await this.compressContextData(contextData);
    }

    session.contextData.set(contextData.id, contextData);
    await this.updateSessionActivity(sessionId);

    // Update correlation index
    await this.updateCorrelationIndex(sessionId, contextData);

    this.context.logger.debug('Context data stored', {
      sessionId,
      contextId: contextData.id,
      type: contextData.type,
      compressed: !!contextData.compression?.isCompressed
    });
  }

  /**
   * Retrieve context data from a session
   */
  async getContext(sessionId: string, contextId: string): Promise<ContextData | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    let contextData = session.contextData.get(contextId);
    if (!contextData) {
      return null;
    }

    // Decompress if needed
    if (contextData.compression?.isCompressed) {
      contextData = await this.decompressContextData(contextData);
    }

    // Update access metadata
    contextData.metadata.lastAccessedAt = Date.now();
    contextData.metadata.accessCount++;

    await this.updateSessionActivity(sessionId);

    return contextData;
  }

  /**
   * Get all contexts for a session
   */
  async getAllContexts(sessionId: string): Promise<ContextData[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return [];
    }

    const contexts: ContextData[] = [];
    for (const contextData of session.contextData.values()) {
      const decompressed = contextData.compression?.isCompressed
        ? await this.decompressContextData(contextData)
        : contextData;
      contexts.push(decompressed);
    }

    return contexts;
  }

  /**
   * Update existing context data
   */
  async updateContext(sessionId: string, contextId: string, newData: any): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const existingContext = session.contextData.get(contextId);
    if (!existingContext) {
      throw new Error(`Context not found: ${contextId}`);
    }

    // Decompress if needed before updating
    let contextData = existingContext.compression?.isCompressed
      ? await this.decompressContextData(existingContext)
      : existingContext;

    // Update data and metadata
    contextData.data = { ...contextData.data, ...newData };
    contextData.metadata.lastAccessedAt = Date.now();
    contextData.metadata.accessCount++;

    // Recompress if needed
    const dataSize = this.calculateDataSize(contextData.data);
    if (this.config.enableCompression && dataSize > this.config.compressionThreshold) {
      contextData = await this.compressContextData(contextData);
    }

    session.contextData.set(contextId, contextData);
    await this.updateSessionActivity(sessionId);
  }

  /**
   * Cache tool result with intelligent correlation
   */
  async cacheToolResult(sessionId: string, toolResult: {
    toolName: string;
    parameters: Record<string, any>;
    result: ToolExecutionResult;
  }): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const cacheKey = this.generateCacheKey(toolResult.toolName, toolResult.parameters);
    const semanticTags = this.extractSemanticTags(toolResult);

    const cacheEntry: ContextCacheEntry = {
      key: cacheKey,
      data: toolResult.result,
      metadata: {
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        size: this.calculateDataSize(toolResult.result),
        ttl: this.config.cacheConfig!.ttlMs
      },
      semanticTags,
      relatedKeys: []
    };

    // Check cache size limits
    if (this.shouldEvictCache(session.sessionCache, cacheEntry)) {
      await this.evictCacheEntries(session.sessionCache);
    }

    session.sessionCache.entries.set(cacheKey, cacheEntry);
    session.sessionCache.stats.totalSize += cacheEntry.metadata.size;

    // Update correlation index
    await this.updateCacheCorrelation(session.sessionCache, cacheEntry);

    this.context.logger.debug('Tool result cached', {
      sessionId,
      toolName: toolResult.toolName,
      cacheKey,
      semanticTags
    });
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize session cache
   */
  private initializeSessionCache(): SessionCache {
    return {
      entries: new Map(),
      config: {
        maxSizeMB: this.config.cacheConfig!.maxSizeMB,
        ttlMs: this.config.cacheConfig!.ttlMs,
        maxEntries: 10, // Lower limit for testing
        enableSemanticCorrelation: true
      },
      stats: {
        hits: 0,
        misses: 0,
        evictions: 0,
        totalSize: 0,
        hitRate: 0
      },
      correlationIndex: new Map()
    };
  }

  /**
   * Initialize session metrics
   */
  private initializeSessionMetrics(): SessionMetrics {
    return {
      totalDuration: 0,
      toolsExecuted: 0,
      entitiesDiscovered: 0,
      cachePerformance: {
        hitRate: 0,
        averageRetrievalTime: 0,
        memoryUsage: 0
      },
      correlationMetrics: {
        successfulCorrelations: 0,
        averageCorrelationScore: 0,
        recommendationAccuracy: 0
      },
      memoryMetrics: {
        totalMemoryUsed: 0,
        compressedDataSize: 0,
        compressionRatio: 0,
        peakMemoryUsage: 0
      },
      interactionMetrics: {
        averageRequestComplexity: 0,
        mostUsedTools: [],
        analysisDepth: 0
      }
    };
  }

  /**
   * Initialize global correlation system
   */
  private initializeCorrelation(): ContextCorrelation {
    return {
      entityGraph: new Map(),
      toolPatterns: new Map(),
      flowRecommendations: [],
      semanticIndex: new Map()
    };
  }

  /**
   * Get cached tool result
   */
  async getCachedResult(sessionId: string, toolName: string, parameters: Record<string, any>): Promise<{ result: ToolExecutionResult } | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const cacheKey = this.generateCacheKey(toolName, parameters);
    const cacheEntry = session.sessionCache.entries.get(cacheKey);

    if (!cacheEntry) {
      session.sessionCache.stats.misses++;
      // Update hit rate
      const totalAccess = session.sessionCache.stats.hits + session.sessionCache.stats.misses;
      session.sessionCache.stats.hitRate = session.sessionCache.stats.hits / totalAccess;
      return null;
    }

    // Check TTL
    if (Date.now() - cacheEntry.metadata.createdAt > cacheEntry.metadata.ttl) {
      session.sessionCache.entries.delete(cacheKey);
      session.sessionCache.stats.evictions++;
      session.sessionCache.stats.misses++;
      // Update hit rate
      const totalAccess = session.sessionCache.stats.hits + session.sessionCache.stats.misses;
      session.sessionCache.stats.hitRate = session.sessionCache.stats.hits / totalAccess;
      return null;
    }

    // Update access metadata
    cacheEntry.metadata.lastAccessedAt = Date.now();
    cacheEntry.metadata.accessCount++;
    session.sessionCache.stats.hits++;

    // Update hit rate
    const totalAccess = session.sessionCache.stats.hits + session.sessionCache.stats.misses;
    session.sessionCache.stats.hitRate = session.sessionCache.stats.hits / totalAccess;

    return { result: cacheEntry.data };
  }

  /**
   * Get cache statistics for a session
   */
  async getCacheStats(sessionId: string): Promise<SessionCache['stats'] & { maxSizeMB: number }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return {
      ...session.sessionCache.stats,
      maxSizeMB: session.sessionCache.config.maxSizeMB
    };
  }

  /**
   * Find correlations based on search term
   */
  async findCorrelations(sessionId: string, searchTerm: string): Promise<ContextData[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return [];
    }

    const correlations: ContextData[] = [];
    const lowerSearchTerm = searchTerm.toLowerCase();

    for (const contextData of session.contextData.values()) {
      // Check if context is related to search term
      const isRelated = contextData.metadata.tags.some(tag =>
        tag.toLowerCase().includes(lowerSearchTerm)
      ) || JSON.stringify(contextData.data).toLowerCase().includes(lowerSearchTerm);

      if (isRelated) {
        const decompressed = contextData.compression?.isCompressed
          ? await this.decompressContextData(contextData)
          : contextData;
        correlations.push(decompressed);
      }
    }

    return correlations;
  }

  /**
   * Add entity to session
   */
  async addEntity(sessionId: string, entity: {
    name: string;
    type: string;
    relationships?: Array<{ type: string; target: string; confidence?: number }>;
  }): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const entityContext: EntityContext = {
      name: entity.name,
      type: entity.type,
      analysisResults: new Map(),
      relationships: entity.relationships?.map(rel => ({
        type: rel.type as any,
        target: rel.target,
        confidence: rel.confidence || 0.8
      })) || [],
      discoveredAt: Date.now(),
      lastAnalyzedAt: Date.now(),
      completeness: 0.1
    };

    session.discoveredEntities.set(entity.name, entityContext);
    session.metrics.entitiesDiscovered = session.discoveredEntities.size;

    // Update global entity graph
    if (!this.globalCorrelation.entityGraph.has(entity.name)) {
      this.globalCorrelation.entityGraph.set(entity.name, new Set());
    }

    // Add relationships to graph
    for (const rel of entityContext.relationships) {
      this.globalCorrelation.entityGraph.get(entity.name)!.add(rel.target);
    }

    await this.updateSessionActivity(sessionId);
  }

  /**
   * Get entity relationship graph for session
   */
  async getEntityGraph(sessionId: string): Promise<Map<string, Set<string>>> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return new Map();
    }

    const graph = new Map<string, Set<string>>();

    for (const [entityName, entityContext] of session.discoveredEntities) {
      if (!graph.has(entityName)) {
        graph.set(entityName, new Set());
      }

      for (const relationship of entityContext.relationships) {
        graph.get(entityName)!.add(relationship.target);
      }
    }

    return graph;
  }

  /**
   * Get context-aware recommendations
   */
  async getRecommendations(sessionId: string): Promise<ContextRecommendation[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return [];
    }

    const recommendations: ContextRecommendation[] = [];
    const executedTools = new Set(session.executedTools.map(t => t.toolName));

    // Analyze current context to suggest next tools
    const hasClassAnalysis = Array.from(session.contextData.values()).some(c =>
      c.metadata.tags.includes('class')
    );

    if (hasClassAnalysis) {
      if (!executedTools.has('find_class_hierarchy')) {
        recommendations.push({
          toolName: 'find_class_hierarchy',
          confidence: 0.8,
          reasoning: 'Class found, hierarchy analysis would provide inheritance information',
          suggestedParameters: {},
          expectedBenefit: {
            newInformation: 0.7,
            contextEnrichment: 0.8,
            analysisCompletion: 0.6
          },
          alternatives: []
        });
      }

      if (!executedTools.has('analyze_dependencies')) {
        recommendations.push({
          toolName: 'analyze_dependencies',
          confidence: 0.7,
          reasoning: 'Class analysis complete, dependency analysis would show relationships',
          suggestedParameters: {},
          expectedBenefit: {
            newInformation: 0.6,
            contextEnrichment: 0.7,
            analysisCompletion: 0.5
          },
          alternatives: []
        });
      }

      if (!executedTools.has('find_cross_references')) {
        recommendations.push({
          toolName: 'find_cross_references',
          confidence: 0.6,
          reasoning: 'Cross-reference analysis would show usage patterns',
          suggestedParameters: {},
          expectedBenefit: {
            newInformation: 0.5,
            contextEnrichment: 0.6,
            analysisCompletion: 0.4
          },
          alternatives: []
        });
      }
    }

    return recommendations.slice(0, 3); // Return top 3 recommendations
  }

  /**
   * Record tool execution in session
   */
  async recordToolExecution(sessionId: string, execution: {
    toolName: string;
    parameters: Record<string, any>;
    result: ToolExecutionResult;
    timestamp: number;
  }): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.executedTools.push(execution);
    session.metrics.toolsExecuted = session.executedTools.length;

    // Update tool patterns for correlation
    if (session.executedTools.length > 1) {
      const previousTool = session.executedTools[session.executedTools.length - 2];
      this.updateToolPatterns(previousTool.toolName, execution.toolName);
    }

    await this.updateSessionActivity(sessionId);
  }

  /**
   * Get tool recommendations based on context
   */
  async getToolRecommendations(sessionId: string): Promise<ContextRecommendation[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return [];
    }

    const recommendations: ContextRecommendation[] = [];
    const recentTools = session.executedTools.slice(-3).map(t => t.toolName);
    const toolCounts = new Map<string, number>();

    // Count tool usage to avoid redundancy
    for (const tool of session.executedTools) {
      toolCounts.set(tool.toolName, (toolCounts.get(tool.toolName) || 0) + 1);
    }

    // Get last executed tool for context
    const lastTool = session.executedTools[session.executedTools.length - 1];
    if (!lastTool) {
      return [];
    }

    // Extract entity name from last tool execution
    const entityName = this.extractEntityFromParameters(lastTool.parameters);

    // Generate recommendations based on last tool
    switch (lastTool.toolName) {
      case 'search_code':
        if ((toolCounts.get('find_class_hierarchy') || 0) === 0) {
          recommendations.push({
            toolName: 'find_class_hierarchy',
            confidence: 0.8,
            reasoning: 'Class found, analyze inheritance hierarchy',
            suggestedParameters: { class_name: entityName },
            expectedBenefit: {
              newInformation: 0.8,
              contextEnrichment: 0.7,
              analysisCompletion: 0.6
            },
            alternatives: []
          });
        }

        if ((toolCounts.get('analyze_dependencies') || 0) === 0) {
          recommendations.push({
            toolName: 'analyze_dependencies',
            confidence: 0.7,
            reasoning: 'Analyze class dependencies and relationships',
            suggestedParameters: { class_name: entityName },
            expectedBenefit: {
              newInformation: 0.7,
              contextEnrichment: 0.6,
              analysisCompletion: 0.5
            },
            alternatives: []
          });
        }

        if ((toolCounts.get('find_cross_references') || 0) === 0) {
          recommendations.push({
            toolName: 'find_cross_references',
            confidence: 0.6,
            reasoning: 'Find where this class is used',
            suggestedParameters: { target_name: entityName, target_type: 'class' },
            expectedBenefit: {
              newInformation: 0.6,
              contextEnrichment: 0.5,
              analysisCompletion: 0.4
            },
            alternatives: []
          });
        }
        break;

      case 'find_class_hierarchy':
        if ((toolCounts.get('analyze_dependencies') || 0) === 0) {
          recommendations.push({
            toolName: 'analyze_dependencies',
            confidence: 0.8,
            reasoning: 'Hierarchy analyzed, now check dependencies',
            suggestedParameters: { class_name: entityName },
            expectedBenefit: {
              newInformation: 0.7,
              contextEnrichment: 0.8,
              analysisCompletion: 0.6
            },
            alternatives: []
          });
        }
        break;
    }

    // Reduce confidence for recently used tools
    for (const rec of recommendations) {
      const usageCount = toolCounts.get(rec.toolName) || 0;
      if (usageCount > 0) {
        rec.confidence *= Math.max(0.3, 1 - (usageCount * 0.3));
      }
    }

    return recommendations.slice(0, 3);
  }

  /**
   * Get session metrics
   */
  async getSessionMetrics(sessionId: string): Promise<SessionMetrics> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update metrics
    session.metrics.totalDuration = Date.now() - session.createdAt;
    session.metrics.cachePerformance.hitRate = session.sessionCache.stats.hitRate;
    session.metrics.cachePerformance.memoryUsage = session.sessionCache.stats.totalSize;

    // Calculate memory metrics
    let totalMemory = 0;
    let compressedSize = 0;
    for (const context of session.contextData.values()) {
      if (context.compression?.isCompressed) {
        compressedSize += context.compression.compressedSize;
        totalMemory += context.compression.originalSize;
      } else {
        const size = this.calculateDataSize(context.data);
        totalMemory += size;
      }
    }

    session.metrics.memoryMetrics.totalMemoryUsed = totalMemory;
    session.metrics.memoryMetrics.compressedDataSize = compressedSize;
    session.metrics.memoryMetrics.compressionRatio = totalMemory > 0 ? compressedSize / totalMemory : 0;

    // Update peak memory usage
    if (totalMemory > session.metrics.memoryMetrics.peakMemoryUsage) {
      session.metrics.memoryMetrics.peakMemoryUsage = totalMemory;
    }

    return { ...session.metrics };
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    activeSessions: number;
    totalSessions: number;
    averageSessionDuration: number;
    memoryUsage: number;
  }> {
    const activeSessions = this.sessions.size;
    let totalDuration = 0;
    let totalMemory = 0;

    for (const session of this.sessions.values()) {
      totalDuration += Date.now() - session.createdAt;

      // Calculate session memory usage
      for (const context of session.contextData.values()) {
        if (context.compression?.isCompressed) {
          totalMemory += context.compression.compressedSize;
        } else {
          totalMemory += this.calculateDataSize(context.data);
        }
      }
    }

    return {
      activeSessions,
      totalSessions: activeSessions, // For now, same as active
      averageSessionDuration: activeSessions > 0 ? totalDuration / activeSessions : 0,
      memoryUsage: totalMemory
    };
  }

  /**
   * Get memory statistics for a session
   */
  async getMemoryStats(sessionId: string): Promise<SessionMetrics['memoryMetrics']> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return session.metrics.memoryMetrics;
  }

  /**
   * Optimize memory usage for a session
   */
  async optimizeMemory(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Compress uncompressed contexts that exceed threshold
    for (const [contextId, contextData] of session.contextData) {
      if (!contextData.compression?.isCompressed) {
        const size = this.calculateDataSize(contextData.data);
        if (size > this.config.compressionThreshold) {
          const compressed = await this.compressContextData(contextData);
          session.contextData.set(contextId, compressed);
        }
      }
    }

    // Evict least recently used contexts if memory limit exceeded
    const totalMemory = this.calculateSessionMemoryUsage(session);
    if (totalMemory > this.config.maxSessionMemoryMB * 1024 * 1024) {
      await this.evictLeastRecentlyUsedContexts(session);
    }

    this.context.logger.debug('Memory optimization completed', { sessionId });
  }

  /**
   * Get compression configuration for a session
   */
  async getCompressionConfig(sessionId: string): Promise<ContextCompressionConfig> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return this.config.compressionConfig!;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      await this.expireSession(sessionId);
    }

    if (expiredSessions.length > 0) {
      this.context.logger.info('Expired sessions cleaned up', {
        count: expiredSessions.length
      });
    }
  }

  /**
   * Clean up all sessions and resources
   */
  async cleanup(): Promise<void> {
    this.sessions.clear();
    this.globalCorrelation = this.initializeCorrelation();
    this.context.logger.info('Context manager cleanup completed');
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Calculate data size in bytes
   */
  private calculateDataSize(data: any): number {
    return Buffer.byteLength(JSON.stringify(data), 'utf8');
  }

  /**
   * Compress context data
   */
  private async compressContextData(contextData: ContextData): Promise<ContextData> {
    const startTime = Date.now();
    const originalData = JSON.stringify(contextData.data);
    const originalSize = Buffer.byteLength(originalData, 'utf8');

    try {
      const compressed = await gzip(originalData);
      const compressedSize = compressed.length;

      // Update compression stats
      this.compressionStats.totalCompressed++;
      this.compressionStats.totalSaved += (originalSize - compressedSize);
      this.compressionStats.compressionTime += (Date.now() - startTime);
      this.compressionStats.averageRatio = this.compressionStats.totalSaved /
        (this.compressionStats.totalSaved + compressedSize);

      return {
        ...contextData,
        data: compressed.toString('base64'),
        compression: {
          isCompressed: true,
          originalSize,
          compressedSize,
          algorithm: 'gzip'
        }
      };
    } catch (error) {
      this.context.logger.warn('Compression failed, storing uncompressed', {
        contextId: contextData.id,
        error
      });
      return contextData;
    }
  }

  /**
   * Decompress context data
   */
  private async decompressContextData(contextData: ContextData): Promise<ContextData> {
    if (!contextData.compression?.isCompressed) {
      return contextData;
    }

    const startTime = Date.now();

    try {
      const compressedBuffer = Buffer.from(contextData.data as string, 'base64');
      const decompressed = await gunzip(compressedBuffer);
      const originalData = JSON.parse(decompressed.toString('utf8'));

      // Update decompression stats
      this.compressionStats.decompressionTime += (Date.now() - startTime);

      return {
        ...contextData,
        data: originalData,
        compression: {
          ...contextData.compression,
          isCompressed: false
        }
      };
    } catch (error) {
      this.context.logger.error('Decompression failed', {
        contextId: contextData.id,
        error
      });
      throw new Error(`Failed to decompress context data: ${contextData.id}`);
    }
  }

  /**
   * Generate cache key for tool and parameters
   */
  private generateCacheKey(toolName: string, parameters: Record<string, any>): string {
    const paramString = JSON.stringify(parameters, Object.keys(parameters).sort());
    return `${toolName}:${Buffer.from(paramString).toString('base64')}`;
  }

  /**
   * Extract semantic tags from tool result
   */
  private extractSemanticTags(toolResult: {
    toolName: string;
    parameters: Record<string, any>;
    result: ToolExecutionResult;
  }): string[] {
    const tags: string[] = [toolResult.toolName];

    // Extract tags from parameters
    for (const [key, value] of Object.entries(toolResult.parameters)) {
      if (typeof value === 'string' && value.length > 0) {
        tags.push(value.toLowerCase());
      }
    }

    // Extract tags from result data
    if (toolResult.result.data && Array.isArray(toolResult.result.data)) {
      for (const item of toolResult.result.data) {
        if (item.metadata?.type) {
          tags.push(item.metadata.type);
        }
      }
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Check if cache should evict entries
   */
  private shouldEvictCache(cache: SessionCache, newEntry: ContextCacheEntry): boolean {
    const maxSize = cache.config.maxSizeMB * 1024 * 1024;
    const wouldExceedSize = cache.stats.totalSize + newEntry.metadata.size > maxSize;
    const wouldExceedCount = cache.entries.size >= cache.config.maxEntries;

    return wouldExceedSize || wouldExceedCount;
  }

  /**
   * Evict cache entries using LRU strategy
   */
  private async evictCacheEntries(cache: SessionCache): Promise<void> {
    const entries = Array.from(cache.entries.values());

    // Sort by last accessed time (LRU first)
    entries.sort((a, b) => a.metadata.lastAccessedAt - b.metadata.lastAccessedAt);

    // Remove oldest 25% of entries
    const toRemove = Math.ceil(entries.length * 0.25);

    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const entry = entries[i];
      cache.entries.delete(entry.key);
      cache.stats.totalSize -= entry.metadata.size;
      cache.stats.evictions++;
    }
  }

  /**
   * Update cache correlation index
   */
  private async updateCacheCorrelation(cache: SessionCache, entry: ContextCacheEntry): Promise<void> {
    // Build correlation based on semantic tags
    for (const tag of entry.semanticTags) {
      if (!cache.correlationIndex.has(tag)) {
        cache.correlationIndex.set(tag, []);
      }
      cache.correlationIndex.get(tag)!.push(entry.key);
    }
  }

  /**
   * Update correlation index with new context
   */
  private async updateCorrelationIndex(sessionId: string, contextData: ContextData): Promise<void> {
    // Update semantic index
    for (const tag of contextData.metadata.tags) {
      if (!this.globalCorrelation.semanticIndex.has(tag)) {
        this.globalCorrelation.semanticIndex.set(tag, []);
      }

      this.globalCorrelation.semanticIndex.get(tag)!.push({
        entity: contextData.id,
        similarity: 1.0,
        context: sessionId
      });
    }
  }

  /**
   * Update tool usage patterns
   */
  private updateToolPatterns(previousTool: string, currentTool: string): void {
    if (!this.globalCorrelation.toolPatterns.has(previousTool)) {
      this.globalCorrelation.toolPatterns.set(previousTool, []);
    }

    const patterns = this.globalCorrelation.toolPatterns.get(previousTool)!;
    const existing = patterns.find(p => p.followedBy === currentTool);

    if (existing) {
      existing.frequency++;
      existing.confidence = Math.min(0.95, existing.confidence + 0.05);
    } else {
      patterns.push({
        followedBy: currentTool,
        frequency: 1,
        confidence: 0.6
      });
    }
  }

  /**
   * Extract entity name from tool parameters
   */
  private extractEntityFromParameters(parameters: Record<string, any>): string {
    return parameters.class_name ||
           parameters.target_name ||
           parameters.query ||
           parameters.enum_name ||
           'Unknown';
  }

  /**
   * Calculate total memory usage for a session
   */
  private calculateSessionMemoryUsage(session: AnalysisSession): number {
    let totalMemory = 0;

    for (const context of session.contextData.values()) {
      if (context.compression?.isCompressed) {
        totalMemory += context.compression.compressedSize;
      } else {
        totalMemory += this.calculateDataSize(context.data);
      }
    }

    return totalMemory;
  }

  /**
   * Evict least recently used contexts from session
   */
  private async evictLeastRecentlyUsedContexts(session: AnalysisSession): Promise<void> {
    const contexts = Array.from(session.contextData.entries());

    // Sort by last accessed time
    contexts.sort(([, a], [, b]) => a.metadata.lastAccessedAt - b.metadata.lastAccessedAt);

    // Remove oldest 20% of contexts
    const toRemove = Math.ceil(contexts.length * 0.2);

    for (let i = 0; i < toRemove && i < contexts.length; i++) {
      const [contextId] = contexts[i];
      session.contextData.delete(contextId);
    }

    this.context.logger.debug('Evicted LRU contexts', {
      sessionId: session.sessionId,
      evicted: toRemove
    });
  }

  /**
   * Expire a session
   */
  private async expireSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = 'expired';
      this.sessions.delete(sessionId);
      this.context.logger.debug('Session expired', { sessionId });
    }
  }

  /**
   * Evict oldest session to make room for new one
   */
  private async evictOldestSession(): Promise<void> {
    let oldestSession: AnalysisSession | null = null;
    let oldestSessionId: string | null = null;

    for (const [sessionId, session] of this.sessions) {
      if (!oldestSession || session.createdAt < oldestSession.createdAt) {
        oldestSession = session;
        oldestSessionId = sessionId;
      }
    }

    if (oldestSessionId) {
      await this.expireSession(oldestSessionId);
      this.context.logger.info('Evicted oldest session', { sessionId: oldestSessionId });
    }
  }

  /**
   * Start cleanup interval for expired sessions
   */
  private startCleanupInterval(): void {
    setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        this.context.logger.error('Cleanup interval error', { error });
      }
    }, 300000); // Run every 5 minutes
  }
}
