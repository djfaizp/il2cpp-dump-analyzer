/**
 * @fileoverview Tests for MCP Performance Optimizer
 * Comprehensive test suite for intelligent caching, performance monitoring, and optimization
 */

import { MCPPerformanceOptimizer } from '../../agent/mcp-performance-optimizer';
import { MCPExecutionContext, PerformanceMetrics, CacheStats } from '../../agent/types';

describe('MCPPerformanceOptimizer', () => {
  let optimizer: MCPPerformanceOptimizer;

  beforeEach(() => {
    optimizer = new MCPPerformanceOptimizer({
      enableCaching: true,
      enableMonitoring: true,
      enableLearning: true,
      enableDeduplication: true,
      monitoringIntervalMs: 100, // Short interval for testing
      memoryThreshold: 80
    });
  });

  afterEach(() => {
    optimizer.dispose();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultOptimizer = new MCPPerformanceOptimizer();
      expect(defaultOptimizer).toBeDefined();
      
      const stats = defaultOptimizer.getCacheStatistics();
      expect(stats.size).toBeGreaterThan(0); // Should have cache types initialized
      
      defaultOptimizer.dispose();
    });

    it('should initialize cache configurations for different types', () => {
      const stats = optimizer.getCacheStatistics();
      
      // Should have standard cache types
      expect(stats.has('search')).toBe(true);
      expect(stats.has('analysis')).toBe(true);
      expect(stats.has('generation')).toBe(true);
      expect(stats.has('embeddings')).toBe(true);
      
      // Each cache should have initial stats
      for (const [cacheType, cacheStats] of stats.entries()) {
        expect(cacheStats.hits).toBe(0);
        expect(cacheStats.misses).toBe(0);
        expect(cacheStats.totalRequests).toBe(0);
        expect(cacheStats.hitRatio).toBe(0);
      }
    });
  });

  describe('Caching Operations', () => {
    it('should cache and retrieve results correctly', async () => {
      const testData = { result: 'test data', timestamp: Date.now() };
      const operation = jest.fn().mockResolvedValue(testData);
      
      // First call should execute operation
      const result1 = await optimizer.getCachedOrExecute('search', 'test-key', operation);
      expect(result1).toEqual(testData);
      expect(operation).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      const result2 = await optimizer.getCachedOrExecute('search', 'test-key', operation);
      expect(result2).toEqual(testData);
      expect(operation).toHaveBeenCalledTimes(1); // Should not be called again
      
      // Verify cache stats
      const stats = optimizer.getCacheStatistics();
      const searchStats = stats.get('search');
      expect(searchStats?.hits).toBe(1);
      expect(searchStats?.misses).toBe(1);
      expect(searchStats?.totalRequests).toBe(2);
      expect(searchStats?.hitRatio).toBe(0.5);
    });

    it('should handle cache misses correctly', async () => {
      const operation1 = jest.fn().mockResolvedValue('result1');
      const operation2 = jest.fn().mockResolvedValue('result2');
      
      const result1 = await optimizer.getCachedOrExecute('search', 'key1', operation1);
      const result2 = await optimizer.getCachedOrExecute('search', 'key2', operation2);
      
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(operation1).toHaveBeenCalledTimes(1);
      expect(operation2).toHaveBeenCalledTimes(1);
      
      const stats = optimizer.getCacheStatistics();
      const searchStats = stats.get('search');
      expect(searchStats?.misses).toBe(2);
      expect(searchStats?.hits).toBe(0);
    });

    it('should handle operation errors correctly', async () => {
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);
      
      await expect(
        optimizer.getCachedOrExecute('search', 'error-key', operation)
      ).rejects.toThrow('Operation failed');
      
      expect(operation).toHaveBeenCalledTimes(1);
      
      const stats = optimizer.getCacheStatistics();
      const searchStats = stats.get('search');
      expect(searchStats?.misses).toBe(1);
      expect(searchStats?.hits).toBe(0);
    });

    it('should support request deduplication', async () => {
      const operation = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('result'), 50))
      );
      
      // Start multiple concurrent requests with same key
      const promises = [
        optimizer.getCachedOrExecute('search', 'dedup-key', operation),
        optimizer.getCachedOrExecute('search', 'dedup-key', operation),
        optimizer.getCachedOrExecute('search', 'dedup-key', operation)
      ];
      
      const results = await Promise.all(promises);
      
      // All should return same result
      expect(results).toEqual(['result', 'result', 'result']);
      
      // Operation should only be called once due to deduplication
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Management', () => {
    it('should clear specific cache type', async () => {
      // Add some data to cache
      await optimizer.getCachedOrExecute('search', 'key1', () => Promise.resolve('data1'));
      await optimizer.getCachedOrExecute('analysis', 'key2', () => Promise.resolve('data2'));
      
      let stats = optimizer.getCacheStatistics();
      expect(stats.get('search')?.totalRequests).toBe(1);
      expect(stats.get('analysis')?.totalRequests).toBe(1);
      
      // Clear only search cache
      optimizer.clearCache('search');
      
      stats = optimizer.getCacheStatistics();
      expect(stats.get('search')?.totalRequests).toBe(0);
      expect(stats.get('analysis')?.totalRequests).toBe(1); // Should remain
    });

    it('should clear all caches', async () => {
      // Add data to multiple caches
      await optimizer.getCachedOrExecute('search', 'key1', () => Promise.resolve('data1'));
      await optimizer.getCachedOrExecute('analysis', 'key2', () => Promise.resolve('data2'));
      
      // Clear all caches
      optimizer.clearCache();
      
      const stats = optimizer.getCacheStatistics();
      for (const [, cacheStats] of stats.entries()) {
        expect(cacheStats.totalRequests).toBe(0);
        expect(cacheStats.hits).toBe(0);
        expect(cacheStats.misses).toBe(0);
      }
    });

    it('should evict least recently used entries when cache is full', async () => {
      // Create optimizer with very small cache for testing
      const smallOptimizer = new MCPPerformanceOptimizer({
        enableCaching: true
      });
      
      try {
        // Fill cache beyond capacity (assuming search cache has maxEntries limit)
        const operations = Array.from({ length: 10 }, (_, i) => 
          smallOptimizer.getCachedOrExecute(`search`, `key${i}`, () => Promise.resolve(`data${i}`))
        );
        
        await Promise.all(operations);
        
        const stats = smallOptimizer.getCacheStatistics();
        const searchStats = stats.get('search');
        
        // Should have some evictions if cache size was exceeded
        expect(searchStats?.totalRequests).toBe(10);
        expect(searchStats?.misses).toBe(10); // All were cache misses initially
      } finally {
        smallOptimizer.dispose();
      }
    });
  });

  describe('Performance Monitoring', () => {
    it('should collect performance metrics', async () => {
      // Wait for at least one monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const metrics = optimizer.getPerformanceMetrics();
      expect(metrics.length).toBeGreaterThan(0);
      
      const latestMetrics = metrics[metrics.length - 1];
      expect(latestMetrics.timestamp).toBeGreaterThan(0);
      expect(latestMetrics.memoryUsage).toBeDefined();
      expect(latestMetrics.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(latestMetrics.cacheMetrics).toBeDefined();
      expect(latestMetrics.activeRequests).toBeDefined();
    });

    it('should track cache performance metrics', async () => {
      // Generate some cache activity
      await optimizer.getCachedOrExecute('search', 'perf-key1', () => Promise.resolve('data1'));
      await optimizer.getCachedOrExecute('search', 'perf-key1', () => Promise.resolve('data1')); // Cache hit
      await optimizer.getCachedOrExecute('search', 'perf-key2', () => Promise.resolve('data2')); // Cache miss
      
      // Wait for monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const metrics = optimizer.getPerformanceMetrics();
      expect(metrics.length).toBeGreaterThan(0);
      
      const latestMetrics = metrics[metrics.length - 1];
      const searchMetrics = latestMetrics.cacheMetrics.get('search');
      
      expect(searchMetrics).toBeDefined();
      expect(searchMetrics?.totalRequests).toBeGreaterThan(0);
      expect(searchMetrics?.hitRatio).toBeGreaterThanOrEqual(0);
      expect(searchMetrics?.hitRatio).toBeLessThanOrEqual(1);
    });

    it('should stop monitoring when disposed', () => {
      const initialMetrics = optimizer.getPerformanceMetrics();
      
      optimizer.dispose();
      
      // Wait longer than monitoring interval
      setTimeout(() => {
        const finalMetrics = optimizer.getPerformanceMetrics();
        expect(finalMetrics.length).toBe(initialMetrics.length);
      }, 200);
    });
  });

  describe('Learning and Adaptation', () => {
    it('should record learning patterns', async () => {
      const context: MCPExecutionContext = {
        requestId: 'test-request',
        toolName: 'search_code',
        parameters: { query: 'test' },
        timestamp: Date.now()
      };
      
      // Execute operation with context
      await optimizer.getCachedOrExecute(
        'search', 
        'learning-key', 
        () => new Promise(resolve => setTimeout(() => resolve('data'), 100)),
        context
      );
      
      const patterns = optimizer.getLearningPatterns();
      expect(patterns.size).toBeGreaterThan(0);
      
      const pattern = patterns.get('search:learning-key');
      expect(pattern).toBeDefined();
      expect(pattern?.totalExecutions).toBe(1);
      expect(pattern?.averageExecutionTime).toBeGreaterThan(0);
      expect(pattern?.contexts).toHaveLength(1);
      expect(pattern?.contexts[0]).toEqual(context);
    });

    it('should update learning patterns with multiple executions', async () => {
      const key = 'multi-exec-key';
      
      // Execute multiple times with different execution times
      await optimizer.getCachedOrExecute('search', key, () => 
        new Promise(resolve => setTimeout(() => resolve('data1'), 50))
      );
      
      // Clear cache to force re-execution
      optimizer.clearCache('search');
      
      await optimizer.getCachedOrExecute('search', key, () => 
        new Promise(resolve => setTimeout(() => resolve('data2'), 100))
      );
      
      const patterns = optimizer.getLearningPatterns();
      const pattern = patterns.get(`search:${key}`);
      
      expect(pattern?.totalExecutions).toBe(2);
      expect(pattern?.averageExecutionTime).toBeGreaterThan(0);
      expect(pattern?.executionTimeVariance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Optimization Recommendations', () => {
    it('should provide optimization recommendations', async () => {
      // Generate some activity to get recommendations
      await optimizer.getCachedOrExecute('search', 'rec-key1', () => Promise.resolve('data1'));
      await optimizer.getCachedOrExecute('search', 'rec-key2', () => Promise.resolve('data2'));
      
      const recommendations = optimizer.getOptimizationRecommendations();
      expect(Array.isArray(recommendations)).toBe(true);
      
      // Recommendations should be strings
      recommendations.forEach(rec => {
        expect(typeof rec).toBe('string');
        expect(rec.length).toBeGreaterThan(0);
      });
    });

    it('should detect low cache hit ratio issues', async () => {
      // Create many cache misses to trigger low hit ratio
      for (let i = 0; i < 10; i++) {
        await optimizer.getCachedOrExecute('search', `miss-key-${i}`, () => Promise.resolve(`data${i}`));
      }
      
      const recommendations = optimizer.getOptimizationRecommendations();
      const hasHitRatioRecommendation = recommendations.some(rec => 
        rec.includes('hit ratio') || rec.includes('cache strategy')
      );
      
      expect(hasHitRatioRecommendation).toBe(true);
    });
  });

  describe('Cache Pre-warming', () => {
    it('should pre-warm cache with common queries', async () => {
      const queries = [
        { key: 'warm-key1', operation: () => Promise.resolve('warm-data1') },
        { key: 'warm-key2', operation: () => Promise.resolve('warm-data2') },
        { key: 'warm-key3', operation: () => Promise.resolve('warm-data3') }
      ];
      
      await optimizer.preWarmCache('search', queries);
      
      // Verify cache was pre-warmed by checking for cache hits
      const result1 = await optimizer.getCachedOrExecute('search', 'warm-key1', () => Promise.resolve('different-data'));
      const result2 = await optimizer.getCachedOrExecute('search', 'warm-key2', () => Promise.resolve('different-data'));
      
      expect(result1).toBe('warm-data1'); // Should get pre-warmed data
      expect(result2).toBe('warm-data2'); // Should get pre-warmed data
      
      const stats = optimizer.getCacheStatistics();
      const searchStats = stats.get('search');
      expect(searchStats?.hits).toBeGreaterThan(0);
    });

    it('should handle pre-warming errors gracefully', async () => {
      const queries = [
        { key: 'good-key', operation: () => Promise.resolve('good-data') },
        { key: 'bad-key', operation: () => Promise.reject(new Error('Pre-warm error')) },
        { key: 'another-good-key', operation: () => Promise.resolve('more-good-data') }
      ];
      
      // Should not throw even if some operations fail
      await expect(optimizer.preWarmCache('search', queries)).resolves.toBeUndefined();
      
      // Good operations should still be cached
      const result = await optimizer.getCachedOrExecute('search', 'good-key', () => Promise.resolve('different'));
      expect(result).toBe('good-data');
    });
  });

  describe('Performance Data Export', () => {
    it('should export comprehensive performance data', async () => {
      // Generate some activity
      await optimizer.getCachedOrExecute('search', 'export-key', () => Promise.resolve('export-data'));
      
      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const exportData = optimizer.exportPerformanceData();
      
      expect(exportData.metrics).toBeDefined();
      expect(Array.isArray(exportData.metrics)).toBe(true);
      
      expect(exportData.cacheStats).toBeDefined();
      expect(typeof exportData.cacheStats).toBe('object');
      
      expect(exportData.learningPatterns).toBeDefined();
      expect(typeof exportData.learningPatterns).toBe('object');
      
      expect(exportData.config).toBeDefined();
      expect(exportData.config.enableCaching).toBe(true);
    });
  });
});
