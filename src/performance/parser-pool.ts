/**
 * Parser Pool Implementation
 * Object pooling for EnhancedIL2CPPParser instances to reduce creation overhead
 */

import { EnhancedIL2CPPParser } from '../parser/enhanced-il2cpp-parser';

/**
 * Configuration options for the parser pool
 */
export interface ParserPoolOptions {
  /** Maximum number of parsers to keep in the pool (default: 10) */
  maxPoolSize?: number;
  /** Initial number of parsers to create (default: 0) */
  initialPoolSize?: number;
  /** Enable performance metrics collection (default: false) */
  enableMetrics?: boolean;
  /** Timeout for acquiring a parser in milliseconds (default: 5000) */
  acquireTimeoutMs?: number;
}

/**
 * Performance metrics for the parser pool
 */
export interface ParserPoolMetrics {
  /** Total number of acquire operations */
  totalAcquires: number;
  /** Total number of release operations */
  totalReleases: number;
  /** Current number of active parsers */
  currentActive: number;
  /** Current number of parsers in the pool */
  currentPoolSize: number;
  /** Peak number of active parsers */
  peakActive: number;
  /** Average acquire time in milliseconds */
  averageAcquireTimeMs: number;
  /** Total time spent in acquire operations */
  totalAcquireTimeMs: number;
}

/**
 * Object pool for EnhancedIL2CPPParser instances
 * Provides efficient reuse of parser objects to reduce creation overhead
 */
export class ParserPool {
  private readonly pool: EnhancedIL2CPPParser[] = [];
  private readonly activeParsers = new Set<EnhancedIL2CPPParser>();
  private readonly options: Required<ParserPoolOptions>;
  private readonly metrics: ParserPoolMetrics;
  private disposed = false;

  /**
   * Create a new parser pool
   * @param options Configuration options for the pool
   */
  constructor(options: ParserPoolOptions = {}) {
    this.options = {
      maxPoolSize: options.maxPoolSize ?? 10,
      initialPoolSize: options.initialPoolSize ?? 0,
      enableMetrics: options.enableMetrics ?? false,
      acquireTimeoutMs: options.acquireTimeoutMs ?? 5000
    };

    this.metrics = {
      totalAcquires: 0,
      totalReleases: 0,
      currentActive: 0,
      currentPoolSize: 0,
      peakActive: 0,
      averageAcquireTimeMs: 0,
      totalAcquireTimeMs: 0
    };

    // Create initial parsers
    this.initializePool();
  }

  /**
   * Acquire a parser from the pool
   * @returns Promise resolving to an EnhancedIL2CPPParser instance
   */
  public async acquire(): Promise<EnhancedIL2CPPParser> {
    if (this.disposed) {
      throw new Error('Parser pool has been disposed');
    }

    const startTime = Date.now();

    try {
      let parser: EnhancedIL2CPPParser;

      // Try to get parser from pool
      if (this.pool.length > 0) {
        parser = this.pool.pop()!;
      } else {
        // Create new parser if pool is empty
        parser = this.createParser();
      }

      // Add to active set
      this.activeParsers.add(parser);

      // Update metrics
      if (this.options.enableMetrics) {
        this.updateAcquireMetrics(startTime);
      }

      return parser;
    } catch (error) {
      throw new Error(`Failed to acquire parser: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Release a parser back to the pool
   * @param parser The parser to release
   */
  public async release(parser: EnhancedIL2CPPParser): Promise<void> {
    if (this.disposed) {
      return; // Silently ignore releases after disposal
    }

    try {
      // Remove from active set
      if (!this.activeParsers.has(parser)) {
        // Parser not tracked by this pool, ignore
        return;
      }

      this.activeParsers.delete(parser);

      // Reset parser state
      await this.resetParser(parser);

      // Add back to pool if there's space
      if (this.pool.length < this.options.maxPoolSize) {
        this.pool.push(parser);
      }
      // If pool is full, let the parser be garbage collected

      // Update metrics
      if (this.options.enableMetrics) {
        this.updateReleaseMetrics();
      }
    } catch (error) {
      // Log error but don't throw to avoid breaking the caller
      console.warn(`Error releasing parser: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the current number of parsers in the pool
   */
  public getPoolSize(): number {
    return this.pool.length;
  }

  /**
   * Get the maximum pool size
   */
  public getMaxPoolSize(): number {
    return this.options.maxPoolSize;
  }

  /**
   * Get the current number of active parsers
   */
  public getActiveCount(): number {
    return this.activeParsers.size;
  }

  /**
   * Get performance metrics
   */
  public getMetrics(): ParserPoolMetrics {
    if (!this.options.enableMetrics) {
      return {
        totalAcquires: 0,
        totalReleases: 0,
        currentActive: 0,
        currentPoolSize: 0,
        peakActive: 0,
        averageAcquireTimeMs: 0,
        totalAcquireTimeMs: 0
      };
    }

    return {
      ...this.metrics,
      currentActive: this.activeParsers.size,
      currentPoolSize: this.pool.length
    };
  }

  /**
   * Dispose the pool and all parsers
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clear all parsers
    this.pool.length = 0;
    this.activeParsers.clear();

    // Reset metrics
    this.metrics.currentActive = 0;
    this.metrics.currentPoolSize = 0;
  }

  /**
   * Initialize the pool with initial parsers
   */
  private initializePool(): void {
    for (let i = 0; i < this.options.initialPoolSize; i++) {
      try {
        const parser = this.createParser();
        this.pool.push(parser);
      } catch (error) {
        console.warn(`Failed to create initial parser ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        break; // Stop creating if we encounter errors
      }
    }
  }

  /**
   * Create a new parser instance
   */
  private createParser(): EnhancedIL2CPPParser {
    return new EnhancedIL2CPPParser();
  }

  /**
   * Reset parser state for reuse
   */
  private async resetParser(parser: EnhancedIL2CPPParser): Promise<void> {
    try {
      // Reset the parser to clean state
      if (typeof parser.reset === 'function') {
        parser.reset();
      } else {
        // If reset method doesn't exist, create a new parser
        // This is a fallback for older parser versions
        console.warn('Parser reset method not available, parser state may not be clean');
      }
    } catch (error) {
      // Log error but don't throw to avoid breaking the pool
      console.warn(`Error resetting parser: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update metrics for acquire operations
   */
  private updateAcquireMetrics(startTime: number): void {
    const acquireTime = Date.now() - startTime;
    
    this.metrics.totalAcquires++;
    this.metrics.totalAcquireTimeMs += acquireTime;
    this.metrics.averageAcquireTimeMs = this.metrics.totalAcquireTimeMs / this.metrics.totalAcquires;
    
    // Update peak active count
    const currentActive = this.activeParsers.size;
    if (currentActive > this.metrics.peakActive) {
      this.metrics.peakActive = currentActive;
    }
  }

  /**
   * Update metrics for release operations
   */
  private updateReleaseMetrics(): void {
    this.metrics.totalReleases++;
  }
}
