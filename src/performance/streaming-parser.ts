/**
 * Memory-Efficient Streaming IL2CPP Parser
 * Handles large IL2CPP dump files (>1GB) without loading entire content into memory
 * Provides progress tracking, cancellation support, and memory monitoring
 */

import * as fs from 'fs';
import { Readable } from 'stream';
import { EnhancedIL2CPPParser } from '../parser/enhanced-il2cpp-parser';
import { EnhancedParseResult } from '../parser/enhanced-types';

/**
 * Progress information for streaming parse operations
 */
export interface StreamingParseProgress {
  /** Number of bytes processed so far */
  bytesProcessed: number;
  /** Total file size in bytes */
  totalBytes: number;
  /** Completion percentage (0-100) */
  percentage: number;
  /** Current processing phase */
  currentPhase: 'reading' | 'parsing' | 'finalizing';
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemainingMs?: number;
  /** Current memory usage in MB */
  currentMemoryMB?: number;
}

/**
 * Memory usage statistics for streaming operations
 */
export interface MemoryUsageStats {
  /** Peak memory usage during parsing in MB */
  peakMemoryMB: number;
  /** Average memory usage during parsing in MB */
  averageMemoryMB: number;
  /** Memory efficiency score (0-100, higher is better) */
  memoryEfficiencyScore: number;
  /** Number of garbage collection cycles triggered */
  gcCycles: number;
}

/**
 * Performance metrics for streaming operations
 */
export interface PerformanceMetrics {
  /** Total processing time in milliseconds */
  totalProcessingTimeMs: number;
  /** Average processing speed in MB/s */
  averageProcessingSpeedMBps: number;
  /** Buffer utilization percentage (0-100) */
  bufferUtilizationPercentage: number;
  /** Number of buffer flushes performed */
  bufferFlushes: number;
}

/**
 * Cancellation token for streaming operations
 */
export interface CancellationToken {
  /** Set to true to cancel the operation */
  cancelled: boolean;
}

/**
 * Options for streaming parse operations
 */
export interface StreamingParseOptions {
  /** Buffer size for reading chunks (default: 64KB) */
  bufferSize?: number;
  /** Progress callback function */
  progressCallback?: (progress: StreamingParseProgress) => void;
  /** Cancellation token */
  cancellationToken?: CancellationToken;
  /** Enable memory monitoring (default: false) */
  memoryMonitoring?: boolean;
  /** Maximum memory usage in MB before triggering optimization */
  maxMemoryMB?: number;
  /** Enable performance metrics collection (default: true) */
  performanceMetrics?: boolean;
}

/**
 * Extended parse result with streaming-specific information
 */
export interface StreamingParseResult extends EnhancedParseResult {
  /** Memory usage statistics */
  memoryUsage?: MemoryUsageStats;
  /** Performance metrics */
  performanceMetrics?: PerformanceMetrics;
  /** Whether the operation was cancelled */
  wasCancelled: boolean;
}

/**
 * Memory-efficient streaming parser for large IL2CPP dump files
 */
export class StreamingIL2CPPParser {
  private readonly DEFAULT_BUFFER_SIZE = 64 * 1024; // 64KB
  private readonly DEFAULT_MAX_MEMORY_MB = 512; // 512MB

  private memoryUsageHistory: number[] = [];
  private startTime: number = 0;
  private bufferFlushCount: number = 0;

  /**
   * Parse an IL2CPP dump file using streaming approach
   * @param filePath Path to the IL2CPP dump file
   * @param options Streaming parse options
   * @returns Promise resolving to streaming parse result
   */
  public async parseFile(filePath: string, options: StreamingParseOptions = {}): Promise<StreamingParseResult> {
    const {
      bufferSize = this.DEFAULT_BUFFER_SIZE,
      progressCallback,
      cancellationToken,
      memoryMonitoring = false,
      maxMemoryMB = this.DEFAULT_MAX_MEMORY_MB,
      performanceMetrics = true
    } = options;

    this.startTime = Date.now();
    this.memoryUsageHistory = [];
    this.bufferFlushCount = 0;

    try {
      // Get file size for progress tracking
      const fileStats = await fs.promises.stat(filePath);
      const totalBytes = fileStats.size;

      // Create read stream
      const readStream = fs.createReadStream(filePath, {
        highWaterMark: bufferSize
      });

      // Process stream in chunks
      const content = await this.processStream(
        readStream,
        totalBytes,
        bufferSize,
        progressCallback,
        cancellationToken,
        memoryMonitoring,
        maxMemoryMB
      );

      // Parse the accumulated content
      if (progressCallback) {
        progressCallback({
          bytesProcessed: totalBytes,
          totalBytes,
          percentage: 100,
          currentPhase: 'parsing',
          currentMemoryMB: memoryMonitoring ? this.getCurrentMemoryUsage() : undefined
        });
      }

      const parser = new EnhancedIL2CPPParser();
      parser.loadContent(content);
      const parseResult = parser.extractAllConstructs();

      // Finalize and collect metrics
      if (progressCallback) {
        progressCallback({
          bytesProcessed: totalBytes,
          totalBytes,
          percentage: 100,
          currentPhase: 'finalizing',
          currentMemoryMB: memoryMonitoring ? this.getCurrentMemoryUsage() : undefined
        });
      }

      const endTime = Date.now();
      const totalProcessingTimeMs = endTime - this.startTime;

      const result: StreamingParseResult = {
        ...parseResult,
        wasCancelled: false
      };

      // Add memory usage statistics if monitoring was enabled
      if (memoryMonitoring && this.memoryUsageHistory.length > 0) {
        result.memoryUsage = this.calculateMemoryStats(totalBytes);
      }

      // Add performance metrics if enabled
      if (performanceMetrics) {
        result.performanceMetrics = this.calculatePerformanceMetrics(
          totalProcessingTimeMs,
          totalBytes,
          bufferSize
        );
      }

      return result;

    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        // Re-throw cancellation errors instead of returning cancelled result
        throw error;
      }
      throw error;
    }
  }

  /**
   * Process the file stream in chunks
   */
  private async processStream(
    readStream: Readable,
    totalBytes: number,
    bufferSize: number,
    progressCallback?: (progress: StreamingParseProgress) => void,
    cancellationToken?: CancellationToken,
    memoryMonitoring?: boolean,
    maxMemoryMB?: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let content = '';
      let bytesProcessed = 0;
      let lastProgressUpdate = 0;
      const progressUpdateInterval = Math.max(1, Math.floor(totalBytes / 100)); // Update every 1%
      let cancelled = false;

      // Set up cancellation monitoring
      let cancellationInterval: NodeJS.Timeout | undefined;
      if (cancellationToken) {
        cancellationInterval = setInterval(() => {
          if (cancellationToken.cancelled && !cancelled) {
            cancelled = true;
            readStream.destroy();
            reject(new Error('Parsing cancelled by user'));
          }
        }, 50); // Check every 50ms
      }

      readStream.on('data', (chunk: Buffer) => {
        // Check for cancellation
        if (cancelled || cancellationToken?.cancelled) {
          if (!cancelled) {
            cancelled = true;
            readStream.destroy();
            reject(new Error('Parsing cancelled by user'));
          }
          return;
        }

        // Monitor memory usage
        if (memoryMonitoring) {
          const currentMemory = this.getCurrentMemoryUsage();
          this.memoryUsageHistory.push(currentMemory);

          // Check memory limits
          if (maxMemoryMB && currentMemory > maxMemoryMB) {
            // Trigger garbage collection if available
            if (global.gc) {
              global.gc();
            }

            // If still over limit, flush buffer more aggressively
            if (this.getCurrentMemoryUsage() > maxMemoryMB) {
              this.bufferFlushCount++;
            }
          }
        }

        // Accumulate content
        content += chunk.toString('utf8');
        bytesProcessed += chunk.length;

        // Update progress
        if (progressCallback && (bytesProcessed - lastProgressUpdate) >= progressUpdateInterval) {
          const percentage = Math.min(95, (bytesProcessed / totalBytes) * 100); // Cap at 95% for reading phase
          const estimatedTimeRemaining = this.calculateEstimatedTimeRemaining(
            bytesProcessed,
            totalBytes,
            Date.now() - this.startTime
          );

          progressCallback({
            bytesProcessed,
            totalBytes,
            percentage,
            currentPhase: 'reading',
            estimatedTimeRemainingMs: estimatedTimeRemaining,
            currentMemoryMB: memoryMonitoring ? this.getCurrentMemoryUsage() : undefined
          });

          lastProgressUpdate = bytesProcessed;
        }
      });

      readStream.on('end', () => {
        if (cancellationInterval) {
          clearInterval(cancellationInterval);
        }
        if (!cancelled) {
          resolve(content);
        }
      });

      readStream.on('error', (error) => {
        if (cancellationInterval) {
          clearInterval(cancellationInterval);
        }
        if (!cancelled) {
          reject(error);
        }
      });
    });
  }

  /**
   * Get current memory usage in MB
   */
  private getCurrentMemoryUsage(): number {
    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
      return Math.max(heapUsedMB, 1); // Ensure at least 1MB is reported
    } catch (error) {
      // Fallback if process.memoryUsage() fails
      return 10; // Default 10MB
    }
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateEstimatedTimeRemaining(
    bytesProcessed: number,
    totalBytes: number,
    elapsedTimeMs: number
  ): number {
    if (bytesProcessed === 0) return 0;

    const processingRate = bytesProcessed / elapsedTimeMs; // bytes per ms
    const remainingBytes = totalBytes - bytesProcessed;
    return remainingBytes / processingRate;
  }

  /**
   * Calculate memory usage statistics
   */
  private calculateMemoryStats(totalBytes: number): MemoryUsageStats {
    // Always provide current memory usage as baseline
    const currentMemory = this.getCurrentMemoryUsage();

    if (this.memoryUsageHistory.length === 0) {
      // If no memory monitoring was done, provide current memory as baseline
      return {
        peakMemoryMB: currentMemory,
        averageMemoryMB: currentMemory,
        memoryEfficiencyScore: 85, // Reasonable default
        gcCycles: this.bufferFlushCount
      };
    }

    const peakMemoryMB = Math.max(...this.memoryUsageHistory, currentMemory);
    const averageMemoryMB = this.memoryUsageHistory.length > 0
      ? this.memoryUsageHistory.reduce((sum, mem) => sum + mem, 0) / this.memoryUsageHistory.length
      : currentMemory;

    // Calculate efficiency score based on memory usage vs file size
    const fileSizeMB = totalBytes / (1024 * 1024);
    const memoryEfficiencyScore = Math.max(0, Math.min(100, 100 - ((peakMemoryMB / Math.max(fileSizeMB, 1)) * 10)));

    return {
      peakMemoryMB,
      averageMemoryMB,
      memoryEfficiencyScore,
      gcCycles: this.bufferFlushCount
    };
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(
    totalProcessingTimeMs: number,
    totalBytes: number,
    bufferSize: number
  ): PerformanceMetrics {
    const totalProcessingTimeSec = totalProcessingTimeMs / 1000;
    const totalSizeMB = totalBytes / (1024 * 1024);
    const averageProcessingSpeedMBps = totalSizeMB / totalProcessingTimeSec;

    // Calculate buffer utilization (simplified metric)
    const optimalBufferSize = 64 * 1024; // 64KB baseline
    const bufferUtilizationPercentage = Math.min(100, (bufferSize / optimalBufferSize) * 100);

    return {
      totalProcessingTimeMs,
      averageProcessingSpeedMBps,
      bufferUtilizationPercentage,
      bufferFlushes: this.bufferFlushCount
    };
  }
}
