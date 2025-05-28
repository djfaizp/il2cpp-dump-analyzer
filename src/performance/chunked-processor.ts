/**
 * Chunked Processing with Progress Tracking
 * Implements progressive chunking, resumable processing, and parallel execution for large IL2CPP dumps
 */

import { EnhancedIL2CPPParser } from '../parser/enhanced-il2cpp-parser';
import { EnhancedParseResult } from '../parser/enhanced-types';

/**
 * Processing state enumeration
 */
export enum ProcessingState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  COMPLETED_WITH_ERRORS = 'completed_with_errors',
  CANCELLED = 'cancelled',
  ERROR = 'error'
}

/**
 * Chunk metadata information
 */
export interface ChunkMetadata {
  /** Unique chunk identifier */
  id: string;
  /** Chunk index in the sequence */
  index: number;
  /** Start position in original content */
  startPosition: number;
  /** End position in original content */
  endPosition: number;
  /** Chunk content size in characters */
  size: number;
  /** Whether this chunk has been processed */
  processed: boolean;
  /** Processing start time */
  processingStartTime?: number;
  /** Processing end time */
  processingEndTime?: number;
  /** Parse result for this chunk */
  parseResult?: EnhancedParseResult;
  /** Processing errors for this chunk */
  errors?: string[];
}

/**
 * Progress information for chunked processing
 */
export interface ChunkProcessingProgress {
  /** Current processing state */
  state: ProcessingState;
  /** Number of chunks processed */
  processedChunks: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Completion percentage (0-100) */
  percentage: number;
  /** Current chunk being processed */
  currentChunk?: ChunkMetadata;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemainingMs?: number;
  /** Current processing speed (chunks per second) */
  chunksPerSecond?: number;
  /** Parallel processing status */
  parallelProcessingActive?: boolean;
  /** Number of active concurrent processes */
  activeConcurrentProcesses?: number;
}

/**
 * Performance metrics for chunked processing
 */
export interface ChunkProcessingMetrics {
  /** Total processing time in milliseconds */
  totalProcessingTimeMs: number;
  /** Average time per chunk in milliseconds */
  averageChunkProcessingTimeMs: number;
  /** Processing speed in chunks per second */
  chunksPerSecond: number;
  /** Parallel processing efficiency score (0-100) */
  parallelEfficiencyScore: number;
  /** Peak concurrent processes used */
  peakConcurrentProcesses: number;
  /** Total wait time due to concurrency limits */
  totalWaitTimeMs: number;
}

/**
 * Chunk statistics
 */
export interface ChunkStatistics {
  /** Average chunk size in characters */
  averageChunkSize: number;
  /** Minimum chunk size */
  minChunkSize: number;
  /** Maximum chunk size */
  maxChunkSize: number;
  /** Total content size */
  totalContentSize: number;
  /** Number of chunks with errors */
  chunksWithErrors: number;
}

/**
 * Resumable processing state
 */
export interface ResumableProcessingState {
  /** Processing state */
  state: ProcessingState;
  /** Original content */
  content: string;
  /** Processing options */
  options: ChunkProcessingOptions;
  /** All chunks metadata */
  chunks: ChunkMetadata[];
  /** Current processing index */
  currentIndex: number;
  /** Processing start time */
  startTime: number;
  /** Accumulated errors */
  errors: string[];
}

/**
 * Cancellation token for processing operations
 */
export interface CancellationToken {
  /** Set to true to cancel the operation */
  cancelled: boolean;
}

/**
 * Options for chunked processing
 */
export interface ChunkProcessingOptions {
  /** Size of each chunk in characters (default: 10000) */
  chunkSize?: number;
  /** Maximum number of concurrent chunk processes (default: 4) */
  maxConcurrency?: number;
  /** Progress callback function */
  progressCallback?: (progress: ChunkProcessingProgress) => void;
  /** Cancellation token */
  cancellationToken?: CancellationToken;
  /** Enable resumable processing (default: false) */
  enableResumable?: boolean;
  /** Enable ETA calculation (default: true) */
  enableETA?: boolean;
  /** Continue processing on chunk errors (default: true) */
  continueOnError?: boolean;
  /** Collect performance metrics (default: true) */
  collectMetrics?: boolean;
  /** Chunk overlap size for context preservation (default: 100) */
  chunkOverlap?: number;
}

/**
 * Result of chunked processing operation
 */
export interface ChunkProcessingResult {
  /** Processing state */
  state: ProcessingState;
  /** All processed chunks */
  chunks: ChunkMetadata[];
  /** Number of chunks processed */
  processedChunks: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Combined parse results from all chunks */
  combinedResult: EnhancedParseResult;
  /** Processing errors */
  errors: string[];
  /** Whether parallel processing was used */
  parallelProcessingUsed: boolean;
  /** Maximum concurrency used */
  maxConcurrencyUsed: number;
  /** Performance metrics */
  performanceMetrics?: ChunkProcessingMetrics;
  /** Chunk statistics */
  chunkStatistics?: ChunkStatistics;
  /** Processing start time */
  startTime: number;
  /** Processing end time */
  endTime: number;
}

/**
 * Chunked processor for large IL2CPP dump files
 */
export class ChunkedProcessor {
  private readonly DEFAULT_CHUNK_SIZE = 10000; // 10KB
  private readonly DEFAULT_MAX_CONCURRENCY = 4;
  private readonly DEFAULT_CHUNK_OVERLAP = 100;

  private currentState: ProcessingState = ProcessingState.IDLE;
  private resumableState?: ResumableProcessingState;
  private activeConcurrentProcesses = 0;
  private processingStartTime = 0;
  private processingMetrics: Partial<ChunkProcessingMetrics> = {};

  /**
   * Process content using chunked approach
   * @param content Content to process
   * @param options Processing options
   * @returns Promise resolving to processing result
   */
  public async processContent(
    content: string,
    options: ChunkProcessingOptions = {}
  ): Promise<ChunkProcessingResult> {
    const {
      chunkSize = this.DEFAULT_CHUNK_SIZE,
      maxConcurrency = this.DEFAULT_MAX_CONCURRENCY,
      progressCallback,
      cancellationToken,
      enableResumable = false,
      enableETA = true,
      continueOnError = true,
      collectMetrics = true,
      chunkOverlap = this.DEFAULT_CHUNK_OVERLAP
    } = options;

    this.currentState = ProcessingState.PROCESSING;
    this.processingStartTime = Date.now();
    this.activeConcurrentProcesses = 0;

    try {
      // Create chunks
      const chunks = this.createChunks(content, chunkSize, chunkOverlap);
      const totalChunks = chunks.length;
      let processedChunks = 0;
      const errors: string[] = [];

      // Setup resumable state if enabled
      if (enableResumable) {
        this.resumableState = {
          state: ProcessingState.PROCESSING,
          content,
          options,
          chunks,
          currentIndex: 0,
          startTime: this.processingStartTime,
          errors
        };
      }

      // Progress tracking setup
      const progressTracker = {
        lastUpdateTime: Date.now(),
        processedSizes: [] as number[],
        chunkTimes: [] as number[]
      };

      // Process chunks with concurrency control
      const parallelProcessingUsed = maxConcurrency > 1;
      const semaphore = new Array(maxConcurrency).fill(null);
      let currentIndex = 0;

      const processChunk = async (chunk: ChunkMetadata): Promise<void> => {
        // Check for cancellation
        if (cancellationToken?.cancelled) {
          throw new Error('Processing cancelled by user');
        }

        // Check for pause
        if (this.currentState === ProcessingState.PAUSED) {
          return;
        }

        this.activeConcurrentProcesses++;
        const chunkStartTime = Date.now();
        chunk.processingStartTime = chunkStartTime;

        try {
          // Check for cancellation during processing
          if (cancellationToken?.cancelled) {
            throw new Error('Processing cancelled by user');
          }

          // Extract chunk content
          const chunkContent = content.slice(chunk.startPosition, chunk.endPosition);

          // Parse chunk
          const parser = new EnhancedIL2CPPParser();
          parser.loadContent(chunkContent);

          // Check for cancellation before parsing
          if (cancellationToken?.cancelled) {
            throw new Error('Processing cancelled by user');
          }

          chunk.parseResult = parser.extractAllConstructs();
          chunk.processed = true;

          const chunkEndTime = Date.now();
          chunk.processingEndTime = chunkEndTime;

          // Track metrics
          if (collectMetrics) {
            progressTracker.chunkTimes.push(chunkEndTime - chunkStartTime);
            progressTracker.processedSizes.push(chunk.size);
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown chunk processing error';
          chunk.errors = [errorMessage];
          errors.push(`Chunk ${chunk.index}: ${errorMessage}`);

          if (!continueOnError) {
            throw error;
          }
        } finally {
          this.activeConcurrentProcesses--;
          processedChunks++;

          // Update progress
          if (progressCallback) {
            const percentage = (processedChunks / totalChunks) * 100;
            const currentTime = Date.now();

            let estimatedTimeRemainingMs: number | undefined;
            let chunksPerSecond: number | undefined;

            if (enableETA && progressTracker.chunkTimes.length > 0) {
              const avgChunkTime = progressTracker.chunkTimes.reduce((sum, time) => sum + time, 0) / progressTracker.chunkTimes.length;
              const remainingChunks = totalChunks - processedChunks;
              estimatedTimeRemainingMs = remainingChunks * avgChunkTime;

              const elapsedSeconds = (currentTime - this.processingStartTime) / 1000;
              chunksPerSecond = processedChunks / elapsedSeconds;
            }

            progressCallback({
              state: this.currentState,
              processedChunks,
              totalChunks,
              percentage,
              currentChunk: chunk,
              estimatedTimeRemainingMs,
              chunksPerSecond,
              parallelProcessingActive: parallelProcessingUsed,
              activeConcurrentProcesses: this.activeConcurrentProcesses
            });
          }
        }
      };

      // Execute processing with concurrency control
      const processingPromises: Promise<void>[] = [];

      for (const chunk of chunks) {
        // Check for cancellation before starting new chunk
        if (cancellationToken?.cancelled) {
          throw new Error('Processing cancelled by user');
        }

        // Wait for available slot
        while (this.activeConcurrentProcesses >= maxConcurrency) {
          await new Promise(resolve => setTimeout(resolve, 10));

          // Check for cancellation during wait
          if (cancellationToken?.cancelled) {
            throw new Error('Processing cancelled by user');
          }

          // Check for pause during wait (state can be changed externally)
          if ((this.currentState as ProcessingState) === ProcessingState.PAUSED) {
            break;
          }
        }

        // Check for pause before processing next chunk (state can be changed externally)
        if ((this.currentState as ProcessingState) === ProcessingState.PAUSED) {
          break;
        }

        processingPromises.push(processChunk(chunk));
      }

      // Wait for all chunks to complete or handle pause (state can be changed externally)
      if ((this.currentState as ProcessingState) === ProcessingState.PAUSED) {
        // Wait for currently running chunks to complete
        await Promise.all(processingPromises);

        // Return partial result for pause
        const combinedResult = this.combineChunkResults(chunks);
        return {
          state: ProcessingState.PAUSED,
          chunks,
          processedChunks,
          totalChunks,
          combinedResult,
          errors,
          parallelProcessingUsed,
          maxConcurrencyUsed: Math.min(maxConcurrency, totalChunks),
          startTime: this.processingStartTime,
          endTime: Date.now()
        };
      }

      await Promise.all(processingPromises);

      // Determine final state
      const finalState = errors.length > 0 ? ProcessingState.COMPLETED_WITH_ERRORS : ProcessingState.COMPLETED;
      this.currentState = finalState;

      // Final progress update
      if (progressCallback) {
        progressCallback({
          state: finalState,
          processedChunks,
          totalChunks,
          percentage: 100,
          parallelProcessingActive: parallelProcessingUsed,
          activeConcurrentProcesses: 0
        });
      }

      // Combine results
      const combinedResult = this.combineChunkResults(chunks);

      const endTime = Date.now();
      const totalProcessingTimeMs = Math.max(1, endTime - this.processingStartTime); // Ensure at least 1ms

      // Calculate performance metrics
      let performanceMetrics: ChunkProcessingMetrics | undefined;
      if (collectMetrics) {
        performanceMetrics = this.calculatePerformanceMetrics(
          totalProcessingTimeMs,
          progressTracker.chunkTimes,
          maxConcurrency,
          parallelProcessingUsed
        );
      }

      // Calculate chunk statistics
      const chunkStatistics = this.calculateChunkStatistics(chunks, content.length);

      const result: ChunkProcessingResult = {
        state: finalState,
        chunks,
        processedChunks,
        totalChunks,
        combinedResult,
        errors,
        parallelProcessingUsed,
        maxConcurrencyUsed: Math.min(maxConcurrency, totalChunks),
        performanceMetrics,
        chunkStatistics,
        startTime: this.processingStartTime,
        endTime
      };

      return result;

    } catch (error) {
      this.currentState = ProcessingState.ERROR;
      if (error instanceof Error && error.message.includes('cancelled')) {
        this.currentState = ProcessingState.CANCELLED;
      }
      throw error;
    }
  }

  /**
   * Pause the current processing operation
   */
  public pauseProcessing(): void {
    if (this.currentState === ProcessingState.PROCESSING) {
      this.currentState = ProcessingState.PAUSED;
    }
  }

  /**
   * Resume paused processing operation
   */
  public async resumeProcessing(): Promise<ChunkProcessingResult> {
    if (!this.resumableState) {
      throw new Error('No resumable state available');
    }

    if (this.currentState !== ProcessingState.PAUSED) {
      throw new Error('Processing is not in paused state');
    }

    // Resume from where we left off
    const { content, options, chunks } = this.resumableState;
    const unprocessedChunks = chunks.filter(chunk => !chunk.processed);

    if (unprocessedChunks.length === 0) {
      // All chunks were already processed
      this.currentState = ProcessingState.COMPLETED;
      const combinedResult = this.combineChunkResults(chunks);

      return {
        state: ProcessingState.COMPLETED,
        chunks,
        processedChunks: chunks.length,
        totalChunks: chunks.length,
        combinedResult,
        errors: this.resumableState.errors,
        parallelProcessingUsed: (options.maxConcurrency || this.DEFAULT_MAX_CONCURRENCY) > 1,
        maxConcurrencyUsed: options.maxConcurrency || this.DEFAULT_MAX_CONCURRENCY,
        startTime: this.resumableState.startTime,
        endTime: Date.now()
      };
    }

    // Continue processing unprocessed chunks
    this.currentState = ProcessingState.PROCESSING;

    // Create a modified content with only unprocessed chunks
    const modifiedContent = unprocessedChunks.map(chunk =>
      content.slice(chunk.startPosition, chunk.endPosition)
    ).join('\n');

    return this.processContent(modifiedContent, {
      ...options,
      enableResumable: false // Avoid nested resumable states
    });
  }

  /**
   * Get current processing state for resumability
   */
  public getProcessingState(): ResumableProcessingState {
    if (!this.resumableState) {
      return {
        state: this.currentState,
        content: '',
        options: {},
        chunks: [],
        currentIndex: 0,
        startTime: Date.now(),
        errors: []
      };
    }

    return { ...this.resumableState };
  }

  /**
   * Restore processing state from saved state
   */
  public restoreProcessingState(state: ResumableProcessingState): void {
    this.resumableState = { ...state };
    this.currentState = state.state;
  }

  /**
   * Create chunks from content
   */
  private createChunks(content: string, chunkSize: number, overlap: number): ChunkMetadata[] {
    const chunks: ChunkMetadata[] = [];
    let position = 0;
    let chunkIndex = 0;

    while (position < content.length) {
      const startPosition = Math.max(0, position - overlap);
      const endPosition = Math.min(content.length, position + chunkSize);

      // Try to break at natural boundaries (end of line, class, method)
      const adjustedEndPosition = this.findNaturalBreakpoint(content, endPosition, startPosition);

      const chunk: ChunkMetadata = {
        id: `chunk_${chunkIndex}_${Date.now()}`,
        index: chunkIndex,
        startPosition,
        endPosition: adjustedEndPosition,
        size: adjustedEndPosition - startPosition,
        processed: false
      };

      chunks.push(chunk);
      position = adjustedEndPosition;
      chunkIndex++;

      // Prevent infinite loop
      if (adjustedEndPosition === startPosition) {
        position = endPosition;
      }
    }

    return chunks;
  }

  /**
   * Find natural breakpoint for chunk boundaries
   */
  private findNaturalBreakpoint(content: string, idealEnd: number, minEnd: number): number {
    if (idealEnd >= content.length) {
      return content.length;
    }

    // Look for natural breakpoints within a reasonable range
    const searchRange = Math.min(200, idealEnd - minEnd);
    const searchStart = Math.max(minEnd, idealEnd - searchRange);

    // Priority order: class end, method end, line end
    const breakpoints = [
      /}\s*$/gm,  // End of class/method
      /;\s*$/gm,  // End of statement
      /\n/g       // End of line
    ];

    for (const pattern of breakpoints) {
      pattern.lastIndex = 0; // Reset regex
      let match;
      let bestMatch = idealEnd;

      while ((match = pattern.exec(content.slice(searchStart, idealEnd + 50))) !== null) {
        const matchPosition = searchStart + match.index + match[0].length;
        if (matchPosition > minEnd && matchPosition <= idealEnd + 50) {
          bestMatch = matchPosition;
        }
      }

      if (bestMatch !== idealEnd) {
        return bestMatch;
      }
    }

    return idealEnd;
  }

  /**
   * Combine results from all processed chunks
   */
  private combineChunkResults(chunks: ChunkMetadata[]): EnhancedParseResult {
    const combinedResult: EnhancedParseResult = {
      classes: [],
      enums: [],
      interfaces: [],
      delegates: [],
      generics: [],
      nestedTypes: [],
      properties: [],
      events: [],
      constants: [],
      operators: [],
      indexers: [],
      destructors: [],
      extensionMethods: [],
      imageMappings: new Map(),
      statistics: {
        totalConstructs: 0,
        classCount: 0,
        enumCount: 0,
        interfaceCount: 0,
        delegateCount: 0,
        genericCount: 0,
        nestedTypeCount: 0,
        propertyCount: 0,
        eventCount: 0,
        constantCount: 0,
        operatorCount: 0,
        indexerCount: 0,
        destructorCount: 0,
        extensionMethodCount: 0,
        compilerGeneratedCount: 0,
        coveragePercentage: 0,
        methodCount: 0,
        fieldCount: 0,
        parseErrors: 0,
        parsingCoverage: 0
      }
    };

    // Combine results from all chunks
    for (const chunk of chunks) {
      if (chunk.parseResult) {
        const result = chunk.parseResult;

        // Merge arrays (with deduplication by name)
        this.mergeUniqueArrays(combinedResult.classes, result.classes, 'name');
        this.mergeUniqueArrays(combinedResult.enums, result.enums, 'name');
        this.mergeUniqueArrays(combinedResult.interfaces, result.interfaces, 'name');
        this.mergeUniqueArrays(combinedResult.delegates, result.delegates, 'name');
        this.mergeUniqueArrays(combinedResult.generics, result.generics, 'name');
        this.mergeUniqueArrays(combinedResult.nestedTypes, result.nestedTypes, 'name');
        this.mergeUniqueArrays(combinedResult.properties, result.properties, 'name');
        this.mergeUniqueArrays(combinedResult.events, result.events, 'name');
        this.mergeUniqueArrays(combinedResult.constants, result.constants, 'name');
        this.mergeUniqueArrays(combinedResult.operators, result.operators, 'symbol');
        this.mergeUniqueArrays(combinedResult.indexers, result.indexers, 'returnType');
        this.mergeUniqueArrays(combinedResult.destructors, result.destructors, 'name');
        this.mergeUniqueArrays(combinedResult.extensionMethods, result.extensionMethods, 'name');

        // Merge image mappings
        for (const [key, value] of result.imageMappings) {
          combinedResult.imageMappings.set(key, value);
        }

        // Aggregate statistics
        const stats = combinedResult.statistics;
        const chunkStats = result.statistics;

        stats.classCount += chunkStats.classCount;
        stats.enumCount += chunkStats.enumCount;
        stats.interfaceCount += chunkStats.interfaceCount;
        stats.delegateCount += chunkStats.delegateCount;
        stats.genericCount += chunkStats.genericCount;
        stats.nestedTypeCount += chunkStats.nestedTypeCount;
        stats.propertyCount += chunkStats.propertyCount;
        stats.eventCount += chunkStats.eventCount;
        stats.constantCount += chunkStats.constantCount;
        stats.operatorCount += chunkStats.operatorCount;
        stats.indexerCount += chunkStats.indexerCount;
        stats.destructorCount += chunkStats.destructorCount;
        stats.extensionMethodCount += chunkStats.extensionMethodCount;
        stats.compilerGeneratedCount += chunkStats.compilerGeneratedCount;
        stats.methodCount += chunkStats.methodCount;
        stats.fieldCount += chunkStats.fieldCount;
        stats.parseErrors += chunkStats.parseErrors;
      }
    }

    // Calculate final statistics
    const stats = combinedResult.statistics;
    stats.totalConstructs = stats.classCount + stats.enumCount + stats.interfaceCount +
                           stats.delegateCount + stats.genericCount + stats.nestedTypeCount;

    // Calculate coverage based on processed chunks
    const processedChunks = chunks.filter(chunk => chunk.processed).length;
    stats.parsingCoverage = processedChunks / chunks.length;
    stats.coveragePercentage = stats.parsingCoverage * 100;

    return combinedResult;
  }

  /**
   * Merge arrays with deduplication
   */
  private mergeUniqueArrays<T>(target: T[], source: T[], keyProperty: keyof T): void {
    const existingKeys = new Set(target.map(item => item[keyProperty]));

    for (const item of source) {
      if (!existingKeys.has(item[keyProperty])) {
        target.push(item);
        existingKeys.add(item[keyProperty]);
      }
    }
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(
    totalProcessingTimeMs: number,
    chunkTimes: number[],
    maxConcurrency: number,
    parallelProcessingUsed: boolean
  ): ChunkProcessingMetrics {
    const averageChunkProcessingTimeMs = chunkTimes.length > 0
      ? chunkTimes.reduce((sum, time) => sum + time, 0) / chunkTimes.length
      : 1; // Default to 1ms to avoid zero

    const chunksPerSecond = totalProcessingTimeMs > 0
      ? (chunkTimes.length / totalProcessingTimeMs) * 1000
      : chunkTimes.length; // If processing was instant, use chunk count

    // Calculate parallel efficiency
    const sequentialTime = chunkTimes.reduce((sum, time) => sum + time, 0);
    const parallelEfficiencyScore = parallelProcessingUsed && totalProcessingTimeMs > 0
      ? Math.min(100, (sequentialTime / Math.max(totalProcessingTimeMs, 1)) * 100 / maxConcurrency)
      : 100;

    return {
      totalProcessingTimeMs, // Already ensured to be at least 1ms in caller
      averageChunkProcessingTimeMs,
      chunksPerSecond,
      parallelEfficiencyScore,
      peakConcurrentProcesses: maxConcurrency,
      totalWaitTimeMs: Math.max(0, totalProcessingTimeMs - sequentialTime)
    };
  }

  /**
   * Calculate chunk statistics
   */
  private calculateChunkStatistics(chunks: ChunkMetadata[], totalContentSize: number): ChunkStatistics {
    if (chunks.length === 0) {
      return {
        averageChunkSize: 0,
        minChunkSize: 0,
        maxChunkSize: 0,
        totalContentSize,
        chunksWithErrors: 0
      };
    }

    const chunkSizes = chunks.map(chunk => chunk.size);
    const chunksWithErrors = chunks.filter(chunk => chunk.errors && chunk.errors.length > 0).length;

    return {
      averageChunkSize: chunkSizes.reduce((sum, size) => sum + size, 0) / chunkSizes.length,
      minChunkSize: Math.min(...chunkSizes),
      maxChunkSize: Math.max(...chunkSizes),
      totalContentSize,
      chunksWithErrors
    };
  }
}
