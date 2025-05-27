/**
 * MCP Performance Optimizer - Intelligent caching and performance optimization for MCP workflows
 *
 * This module provides comprehensive performance optimization for the IL2CPP Dump Analyzer
 * Agentic RAG MCP System, including intelligent caching, bottleneck detection, adaptive
 * learning, and resource management.
 */

import { MCPServerError } from '../mcp/error-types.js';
import {
  MCPToolResult,
  MCPExecutionContext,
  WorkflowMetrics,
  CacheEntry,
  PerformanceMetrics,
  OptimizationStrategy,
  CacheConfig,
  LearningPattern
} from './types.js';

/**
 * Cache configuration for different types of MCP operations
 */
interface CacheConfiguration {
  /** Maximum cache size in MB */
  maxSizeBytes: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
  /** Maximum number of entries */
  maxEntries: number;
  /** Cache hit ratio threshold for optimization */
  hitRatioThreshold: number;
  /** Enable adaptive TTL based on usage patterns */
  adaptiveTtl: boolean;
}

/**
 * Performance optimization configuration
 */
interface OptimizationConfig {
  /** Enable intelligent caching */
  enableCaching: boolean;
  /** Enable performance monitoring */
  enableMonitoring: boolean;
  /** Enable adaptive learning */
  enableLearning: boolean;
  /** Enable request deduplication */
  enableDeduplication: boolean;
  /** Performance monitoring interval in ms */
  monitoringIntervalMs: number;
  /** Memory usage threshold for cleanup (percentage) */
  memoryThreshold: number;
}

/**
 * Cache statistics for monitoring and optimization
 */
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  hitRatio: number;
  averageResponseTime: number;
  memoryUsage: number;
}

/**
 * Performance bottleneck detection result
 */
interface BottleneckAnalysis {
  detected: boolean;
  type: 'memory' | 'cpu' | 'io' | 'network' | 'cache';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendations: string[];
  metrics: Record<string, number>;
}

/**
 * MCP Performance Optimizer - Comprehensive performance optimization for MCP workflows
 */
export class MCPPerformanceOptimizer {
  private caches: Map<string, Map<string, CacheEntry<any>>> = new Map();
  private cacheStats: Map<string, CacheStats> = new Map();
  private performanceMetrics: PerformanceMetrics[] = [];
  private learningPatterns: Map<string, LearningPattern> = new Map();
  private activeRequests: Map<string, Promise<any>> = new Map();
  private config: OptimizationConfig;
  private cacheConfigs: Map<string, CacheConfiguration> = new Map();
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = {
      enableCaching: true,
      enableMonitoring: true,
      enableLearning: true,
      enableDeduplication: true,
      monitoringIntervalMs: 30000, // 30 seconds
      memoryThreshold: 80, // 80% memory usage
      ...config
    };

    this.initializeCacheConfigurations();

    if (this.config.enableMonitoring) {
      this.startPerformanceMonitoring();
    }
  }

  /**
   * Initialize cache configurations for different MCP operation types
   */
  private initializeCacheConfigurations(): void {
    // Search results cache - frequently accessed, medium TTL
    this.cacheConfigs.set('search', {
      maxSizeBytes: 50 * 1024 * 1024, // 50MB
      ttlMs: 10 * 60 * 1000, // 10 minutes
      maxEntries: 1000,
      hitRatioThreshold: 0.7,
      adaptiveTtl: true
    });

    // Analysis results cache - computationally expensive, longer TTL
    this.cacheConfigs.set('analysis', {
      maxSizeBytes: 100 * 1024 * 1024, // 100MB
      ttlMs: 30 * 60 * 1000, // 30 minutes
      maxEntries: 500,
      hitRatioThreshold: 0.8,
      adaptiveTtl: true
    });

    // Code generation cache - stable results, long TTL
    this.cacheConfigs.set('generation', {
      maxSizeBytes: 25 * 1024 * 1024, // 25MB
      ttlMs: 60 * 60 * 1000, // 1 hour
      maxEntries: 200,
      hitRatioThreshold: 0.9,
      adaptiveTtl: false
    });

    // Embeddings cache - expensive to compute, very long TTL
    this.cacheConfigs.set('embeddings', {
      maxSizeBytes: 200 * 1024 * 1024, // 200MB
      ttlMs: 24 * 60 * 60 * 1000, // 24 hours
      maxEntries: 10000,
      hitRatioThreshold: 0.95,
      adaptiveTtl: false
    });

    // Initialize cache instances
    for (const cacheType of this.cacheConfigs.keys()) {
      this.caches.set(cacheType, new Map());
      this.cacheStats.set(cacheType, {
        hits: 0,
        misses: 0,
        evictions: 0,
        totalRequests: 0,
        hitRatio: 0,
        averageResponseTime: 0,
        memoryUsage: 0
      });
    }
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectPerformanceMetrics();
      this.detectBottlenecks();
      this.optimizeCaches();
    }, this.config.monitoringIntervalMs);
  }

  /**
   * Stop performance monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Get cached result or execute operation with caching
   */
  public async getCachedOrExecute<T>(
    cacheType: string,
    key: string,
    operation: () => Promise<T>,
    context?: MCPExecutionContext
  ): Promise<T> {
    const startTime = Date.now();

    try {
      // Check for request deduplication
      if (this.config.enableDeduplication) {
        const deduplicationKey = `${cacheType}:${key}`;
        if (this.activeRequests.has(deduplicationKey)) {
          return await this.activeRequests.get(deduplicationKey) as T;
        }
      }

      // Check cache first
      if (this.config.enableCaching) {
        const cached = this.getCachedResult<T>(cacheType, key);
        if (cached !== null) {
          this.updateCacheStats(cacheType, true, Date.now() - startTime);
          return cached;
        }
      }

      // Execute operation with deduplication
      const deduplicationKey = `${cacheType}:${key}`;
      const operationPromise = operation();

      if (this.config.enableDeduplication) {
        this.activeRequests.set(deduplicationKey, operationPromise);
      }

      try {
        const result = await operationPromise;

        // Cache the result
        if (this.config.enableCaching) {
          this.setCachedResult(cacheType, key, result, context);
        }

        this.updateCacheStats(cacheType, false, Date.now() - startTime);

        // Learn from execution pattern
        if (this.config.enableLearning) {
          this.recordLearningPattern(cacheType, key, Date.now() - startTime, context);
        }

        return result;
      } finally {
        if (this.config.enableDeduplication) {
          this.activeRequests.delete(deduplicationKey);
        }
      }
    } catch (error) {
      this.updateCacheStats(cacheType, false, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Get cached result
   */
  private getCachedResult<T>(cacheType: string, key: string): T | null {
    const cache = this.caches.get(cacheType);
    const config = this.cacheConfigs.get(cacheType);

    if (!cache || !config) {
      return null;
    }

    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    // Check TTL
    const now = Date.now();
    const ttl = config.adaptiveTtl ? this.getAdaptiveTtl(cacheType, key) : config.ttlMs;

    if (now - entry.timestamp > ttl) {
      cache.delete(key);
      return null;
    }

    // Update access time for LRU
    entry.lastAccessed = now;
    entry.accessCount++;

    return entry.data;
  }

  /**
   * Set cached result
   */
  private setCachedResult<T>(
    cacheType: string,
    key: string,
    data: T,
    context?: MCPExecutionContext
  ): void {
    const cache = this.caches.get(cacheType);
    const config = this.cacheConfigs.get(cacheType);

    if (!cache || !config) {
      return;
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: now,
      lastAccessed: now,
      accessCount: 1,
      size: this.estimateSize(data),
      metadata: {
        createdAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        size: this.estimateSize(data),
        ttl: config.ttlMs
      },
      semanticTags: [],
      relatedKeys: [],
      context
    };

    // Check cache size limits
    if (cache.size >= config.maxEntries) {
      this.evictLeastRecentlyUsed(cacheType);
    }

    cache.set(key, entry);
  }

  /**
   * Evict least recently used cache entries
   */
  private evictLeastRecentlyUsed(cacheType: string): void {
    const cache = this.caches.get(cacheType);
    const stats = this.cacheStats.get(cacheType);

    if (!cache || !stats) {
      return;
    }

    let oldestEntry: { key: string; lastAccessed: number } | null = null;

    for (const [key, entry] of cache.entries()) {
      if (!oldestEntry || entry.lastAccessed < oldestEntry.lastAccessed) {
        oldestEntry = { key, lastAccessed: entry.lastAccessed };
      }
    }

    if (oldestEntry) {
      cache.delete(oldestEntry.key);
      stats.evictions++;
    }
  }

  /**
   * Get adaptive TTL based on usage patterns
   */
  private getAdaptiveTtl(cacheType: string, key: string): number {
    const config = this.cacheConfigs.get(cacheType);
    const pattern = this.learningPatterns.get(`${cacheType}:${key}`);

    if (!config || !pattern) {
      return config?.ttlMs || 300000; // 5 minutes default
    }

    // Increase TTL for frequently accessed items
    const accessFrequency = pattern.accessCount / Math.max(1, pattern.totalExecutions);
    const frequencyMultiplier = Math.min(2.0, 1.0 + accessFrequency);

    // Decrease TTL for items with high variance in execution time
    const varianceMultiplier = Math.max(0.5, 1.0 - (pattern.executionTimeVariance / 10000));

    return Math.round(config.ttlMs * frequencyMultiplier * varianceMultiplier);
  }

  /**
   * Update cache statistics
   */
  private updateCacheStats(cacheType: string, hit: boolean, responseTime: number): void {
    const stats = this.cacheStats.get(cacheType);
    if (!stats) {
      return;
    }

    stats.totalRequests++;
    if (hit) {
      stats.hits++;
    } else {
      stats.misses++;
    }

    stats.hitRatio = stats.hits / stats.totalRequests;
    stats.averageResponseTime = (stats.averageResponseTime * (stats.totalRequests - 1) + responseTime) / stats.totalRequests;
  }

  /**
   * Record learning pattern for adaptive optimization
   */
  private recordLearningPattern(
    cacheType: string,
    key: string,
    executionTime: number,
    context?: MCPExecutionContext
  ): void {
    const patternKey = `${cacheType}:${key}`;
    let pattern = this.learningPatterns.get(patternKey);

    if (!pattern) {
      pattern = {
        key: patternKey,
        cacheType,
        totalExecutions: 0,
        averageExecutionTime: 0,
        executionTimeVariance: 0,
        accessCount: 0,
        lastAccessed: Date.now(),
        contexts: []
      };
      this.learningPatterns.set(patternKey, pattern);
    }

    // Update execution statistics
    pattern.totalExecutions++;
    const oldAverage = pattern.averageExecutionTime;
    pattern.averageExecutionTime = (oldAverage * (pattern.totalExecutions - 1) + executionTime) / pattern.totalExecutions;

    // Update variance (simplified calculation)
    const variance = Math.pow(executionTime - pattern.averageExecutionTime, 2);
    pattern.executionTimeVariance = (pattern.executionTimeVariance * (pattern.totalExecutions - 1) + variance) / pattern.totalExecutions;

    pattern.lastAccessed = Date.now();

    // Store context for pattern analysis
    if (context && pattern.contexts.length < 10) {
      pattern.contexts.push(context);
    }
  }

  /**
   * Collect performance metrics
   */
  private collectPerformanceMetrics(): void {
    const now = Date.now();
    const memoryUsage = process.memoryUsage();

    const metrics: PerformanceMetrics = {
      timestamp: now,
      memoryUsage: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss
      },
      cacheMetrics: new Map(),
      activeRequests: this.activeRequests.size,
      learningPatterns: this.learningPatterns.size
    };

    // Collect cache metrics
    for (const [cacheType, stats] of this.cacheStats.entries()) {
      const cache = this.caches.get(cacheType);
      const config = this.cacheConfigs.get(cacheType);

      if (cache && config) {
        let totalSize = 0;
        for (const entry of cache.values()) {
          totalSize += entry.size || 0;
        }

        stats.memoryUsage = totalSize;
        metrics.cacheMetrics.set(cacheType, { ...stats });
      }
    }

    this.performanceMetrics.push(metrics);

    // Keep only last 100 metrics entries
    if (this.performanceMetrics.length > 100) {
      this.performanceMetrics = this.performanceMetrics.slice(-100);
    }
  }

  /**
   * Detect performance bottlenecks
   */
  private detectBottlenecks(): BottleneckAnalysis[] {
    const bottlenecks: BottleneckAnalysis[] = [];
    const latestMetrics = this.performanceMetrics[this.performanceMetrics.length - 1];

    if (!latestMetrics) {
      return bottlenecks;
    }

    // Memory bottleneck detection
    const memoryUsagePercent = (latestMetrics.memoryUsage.heapUsed / latestMetrics.memoryUsage.heapTotal) * 100;
    if (memoryUsagePercent > this.config.memoryThreshold) {
      bottlenecks.push({
        detected: true,
        type: 'memory',
        severity: memoryUsagePercent > 95 ? 'critical' : memoryUsagePercent > 90 ? 'high' : 'medium',
        description: `High memory usage detected: ${memoryUsagePercent.toFixed(1)}%`,
        recommendations: [
          'Consider reducing cache sizes',
          'Implement more aggressive cache eviction',
          'Review memory-intensive operations'
        ],
        metrics: {
          memoryUsagePercent,
          heapUsed: latestMetrics.memoryUsage.heapUsed,
          heapTotal: latestMetrics.memoryUsage.heapTotal
        }
      });
    }

    // Cache performance bottleneck detection
    for (const [cacheType, stats] of latestMetrics.cacheMetrics.entries()) {
      const config = this.cacheConfigs.get(cacheType);
      if (config && stats.hitRatio < config.hitRatioThreshold) {
        bottlenecks.push({
          detected: true,
          type: 'cache',
          severity: stats.hitRatio < 0.3 ? 'high' : 'medium',
          description: `Low cache hit ratio for ${cacheType}: ${(stats.hitRatio * 100).toFixed(1)}%`,
          recommendations: [
            'Increase cache TTL',
            'Review cache key generation strategy',
            'Consider pre-warming cache with common queries'
          ],
          metrics: {
            hitRatio: stats.hitRatio,
            totalRequests: stats.totalRequests,
            averageResponseTime: stats.averageResponseTime
          }
        });
      }
    }

    return bottlenecks;
  }

  /**
   * Optimize caches based on performance metrics and learning patterns
   */
  private optimizeCaches(): void {
    for (const [cacheType, cache] of this.caches.entries()) {
      const config = this.cacheConfigs.get(cacheType);
      const stats = this.cacheStats.get(cacheType);

      if (!config || !stats) {
        continue;
      }

      // Clean up expired entries
      this.cleanupExpiredEntries(cacheType);

      // Optimize cache size based on hit ratio
      if (stats.hitRatio < config.hitRatioThreshold && cache.size > config.maxEntries * 0.5) {
        // Reduce cache size if hit ratio is low
        const targetSize = Math.floor(cache.size * 0.8);
        this.reduceCacheSize(cacheType, targetSize);
      }
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(cacheType: string): void {
    const cache = this.caches.get(cacheType);
    const config = this.cacheConfigs.get(cacheType);

    if (!cache || !config) {
      return;
    }

    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of cache.entries()) {
      const ttl = config.adaptiveTtl ? this.getAdaptiveTtl(cacheType, key) : config.ttlMs;
      if (now - entry.timestamp > ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      cache.delete(key);
    }
  }

  /**
   * Reduce cache size to target size
   */
  private reduceCacheSize(cacheType: string, targetSize: number): void {
    const cache = this.caches.get(cacheType);
    if (!cache || cache.size <= targetSize) {
      return;
    }

    // Sort entries by access frequency and recency
    const entries = Array.from(cache.entries()).map(([key, entry]) => ({
      key,
      entry,
      score: entry.accessCount * (1 / (Date.now() - entry.lastAccessed + 1))
    }));

    entries.sort((a, b) => a.score - b.score);

    // Remove least valuable entries
    const toRemove = cache.size - targetSize;
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      cache.delete(entries[i].key);
    }
  }

  /**
   * Estimate size of cached data
   */
  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // Rough estimate (UTF-16)
    } catch {
      return 1024; // Default size if estimation fails
    }
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetrics[] {
    return [...this.performanceMetrics];
  }

  /**
   * Get cache statistics
   */
  public getCacheStatistics(): Map<string, CacheStats> {
    return new Map(this.cacheStats);
  }

  /**
   * Get learning patterns
   */
  public getLearningPatterns(): Map<string, LearningPattern> {
    return new Map(this.learningPatterns);
  }

  /**
   * Clear cache for specific type or all caches
   */
  public clearCache(cacheType?: string): void {
    if (cacheType) {
      const cache = this.caches.get(cacheType);
      if (cache) {
        cache.clear();
        // Reset stats
        const stats = this.cacheStats.get(cacheType);
        if (stats) {
          Object.assign(stats, {
            hits: 0,
            misses: 0,
            evictions: 0,
            totalRequests: 0,
            hitRatio: 0,
            averageResponseTime: 0,
            memoryUsage: 0
          });
        }
      }
    } else {
      // Clear all caches
      for (const cache of this.caches.values()) {
        cache.clear();
      }
      // Reset all stats
      for (const stats of this.cacheStats.values()) {
        Object.assign(stats, {
          hits: 0,
          misses: 0,
          evictions: 0,
          totalRequests: 0,
          hitRatio: 0,
          averageResponseTime: 0,
          memoryUsage: 0
        });
      }
    }
  }

  /**
   * Get optimization recommendations based on current performance
   */
  public getOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const bottlenecks = this.detectBottlenecks();

    for (const bottleneck of bottlenecks) {
      recommendations.push(...bottleneck.recommendations);
    }

    // Add general recommendations based on cache performance
    for (const [cacheType, stats] of this.cacheStats.entries()) {
      if (stats.hitRatio < 0.5 && stats.totalRequests > 100) {
        recommendations.push(`Consider reviewing cache strategy for ${cacheType} (low hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%)`);
      }

      if (stats.averageResponseTime > 1000) {
        recommendations.push(`Optimize operations for ${cacheType} (high average response time: ${stats.averageResponseTime.toFixed(0)}ms)`);
      }
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Pre-warm cache with common queries
   */
  public async preWarmCache(
    cacheType: string,
    queries: Array<{ key: string; operation: () => Promise<any> }>
  ): Promise<void> {
    const promises = queries.map(async ({ key, operation }) => {
      try {
        const result = await operation();
        this.setCachedResult(cacheType, key, result);
      } catch (error) {
        // Ignore pre-warming errors
        console.warn(`Failed to pre-warm cache for ${cacheType}:${key}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Export performance data for analysis
   */
  public exportPerformanceData(): {
    metrics: PerformanceMetrics[];
    cacheStats: Record<string, CacheStats>;
    learningPatterns: Record<string, LearningPattern>;
    config: OptimizationConfig;
  } {
    const cacheStatsObj: Record<string, CacheStats> = {};
    for (const [key, value] of this.cacheStats.entries()) {
      cacheStatsObj[key] = { ...value };
    }

    const learningPatternsObj: Record<string, LearningPattern> = {};
    for (const [key, value] of this.learningPatterns.entries()) {
      learningPatternsObj[key] = { ...value };
    }

    return {
      metrics: [...this.performanceMetrics],
      cacheStats: cacheStatsObj,
      learningPatterns: learningPatternsObj,
      config: { ...this.config }
    };
  }

  /**
   * Cleanup resources and stop monitoring
   */
  public dispose(): void {
    this.stopMonitoring();
    this.clearCache();
    this.performanceMetrics.length = 0;
    this.learningPatterns.clear();
    this.activeRequests.clear();
  }
}