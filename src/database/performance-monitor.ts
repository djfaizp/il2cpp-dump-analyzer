/**
 * Performance metrics for database operations
 */
export interface PerformanceMetrics {
  operationName: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Aggregated performance statistics
 */
export interface PerformanceStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  errorRate: number;
  operationsPerSecond: number;
}

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: Date;
}

/**
 * Performance monitor and cache for database operations
 */
export class DatabasePerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private cacheMap = new Map<string, CacheEntry<any>>();
  private maxMetrics: number;
  private defaultCacheTtlMs: number;
  private maxCacheSize: number;

  constructor(
    maxMetrics: number = 1000,
    defaultCacheTtlMs: number = 300000, // 5 minutes
    maxCacheSize: number = 500
  ) {
    this.maxMetrics = maxMetrics;
    this.defaultCacheTtlMs = defaultCacheTtlMs;
    this.maxCacheSize = maxCacheSize;

    // Cleanup expired cache entries periodically
    setInterval(() => this.cleanupCache(), 60000); // Every minute
  }

  /**
   * Measure and record the performance of an operation
   */
  async measureOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      const result = await operation();
      success = true;
      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      this.recordMetric({
        operationName,
        duration,
        timestamp: new Date(),
        success,
        error,
        metadata
      });
    }
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log slow operations
    if (metric.duration > 5000) { // 5 seconds
      console.warn(`Slow database operation detected: ${metric.operationName} took ${metric.duration}ms`);
    }
  }

  /**
   * Get performance statistics for a specific operation or all operations
   */
  getStats(operationName?: string): PerformanceStats {
    const relevantMetrics = operationName
      ? this.metrics.filter(m => m.operationName === operationName)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorRate: 0,
        operationsPerSecond: 0
      };
    }

    const durations = relevantMetrics.map(m => m.duration).sort((a, b) => a - b);
    const successfulOps = relevantMetrics.filter(m => m.success).length;
    const totalOps = relevantMetrics.length;

    // Calculate time span for operations per second
    const timeSpanMs = relevantMetrics.length > 1
      ? relevantMetrics[relevantMetrics.length - 1].timestamp.getTime() - relevantMetrics[0].timestamp.getTime()
      : 1000;

    return {
      totalOperations: totalOps,
      successfulOperations: successfulOps,
      failedOperations: totalOps - successfulOps,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p50Duration: this.percentile(durations, 0.5),
      p95Duration: this.percentile(durations, 0.95),
      p99Duration: this.percentile(durations, 0.99),
      errorRate: (totalOps - successfulOps) / totalOps,
      operationsPerSecond: (totalOps / timeSpanMs) * 1000
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil(sortedArray.length * p) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Cache a value with optional TTL
   */
  cache<T>(key: string, value: T, ttlMs?: number): void {
    // Remove oldest entries if cache is full
    if (this.cacheMap.size >= this.maxCacheSize) {
      const oldestKey = Array.from(this.cacheMap.entries())
        .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime())[0][0];
      this.cacheMap.delete(oldestKey);
    }

    const expiresAt = Date.now() + (ttlMs || this.defaultCacheTtlMs);
    this.cacheMap.set(key, {
      value,
      expiresAt,
      accessCount: 0,
      lastAccessed: new Date()
    });
  }

  /**
   * Get a cached value
   */
  getCached<T>(key: string): T | null {
    const entry = this.cacheMap.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cacheMap.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = new Date();

    return entry.value;
  }

  /**
   * Execute operation with caching
   */
  async withCache<T>(
    key: string,
    operation: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.getCached<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute operation and cache result
    const result = await operation();
    this.cache(key, result, ttlMs);
    return result;
  }

  /**
   * Clear cache entries
   */
  clearCache(pattern?: string): void {
    if (!pattern) {
      this.cacheMap.clear();
      return;
    }

    const regex = new RegExp(pattern);
    for (const [key] of this.cacheMap) {
      if (regex.test(key)) {
        this.cacheMap.delete(key);
      }
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cacheMap) {
      if (now > entry.expiresAt) {
        this.cacheMap.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{
      key: string;
      accessCount: number;
      lastAccessed: Date;
      expiresAt: Date;
    }>;
  } {
    const entries = Array.from(this.cacheMap.entries()).map(([key, entry]) => ({
      key,
      accessCount: entry.accessCount,
      lastAccessed: entry.lastAccessed,
      expiresAt: new Date(entry.expiresAt)
    }));

    const totalAccesses = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const cacheHits = entries.filter(entry => entry.accessCount > 0).length;

    return {
      size: this.cacheMap.size,
      maxSize: this.maxCacheSize,
      hitRate: totalAccesses > 0 ? cacheHits / totalAccesses : 0,
      entries
    };
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Get metrics for a specific time range
   */
  getMetricsInRange(startTime: Date, endTime: Date): PerformanceMetrics[] {
    return this.metrics.filter(
      m => m.timestamp >= startTime && m.timestamp <= endTime
    );
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      stats: this.getStats(),
      cacheStats: this.getCacheStats(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Reset all metrics and cache
   */
  reset(): void {
    this.metrics = [];
    this.cacheMap.clear();
  }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new DatabasePerformanceMonitor();

/**
 * Decorator for measuring method performance
 */
export function measurePerformance(operationName?: string) {
  return function (target: any, propertyName: string, descriptor?: PropertyDescriptor) {
    if (!descriptor) {
      // Handle case where descriptor is not provided
      descriptor = Object.getOwnPropertyDescriptor(target, propertyName) || {
        value: target[propertyName],
        writable: true,
        enumerable: true,
        configurable: true
      };
    }

    const method = descriptor.value;
    const name = operationName || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      return performanceMonitor.measureOperation(
        name,
        () => method.apply(this, args),
        { className: target.constructor.name, methodName: propertyName }
      );
    };

    return descriptor;
  };
}
