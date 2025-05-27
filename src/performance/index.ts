/**
 * Performance Module Exports
 * Memory-efficient streaming parser and performance optimization tools
 */

export {
  StreamingIL2CPPParser,
  StreamingParseOptions,
  StreamingParseProgress,
  StreamingParseResult,
  MemoryUsageStats,
  PerformanceMetrics,
  CancellationToken
} from './streaming-parser';

export {
  ChunkedProcessor,
  ChunkProcessingOptions,
  ChunkProcessingProgress,
  ChunkProcessingResult,
  ChunkProcessingMetrics,
  ChunkStatistics,
  ChunkMetadata,
  ResumableProcessingState,
  ProcessingState
} from './chunked-processor';
