/**
 * Performance Module Exports
 * Memory-efficient streaming parser and performance optimization tools
 */

export { StreamingIL2CPPParser } from './streaming-parser';
export type {
  StreamingParseOptions,
  StreamingParseProgress,
  StreamingParseResult,
  MemoryUsageStats,
  PerformanceMetrics,
  CancellationToken
} from './streaming-parser';

export { ChunkedProcessor } from './chunked-processor';
export type {
  ChunkProcessingOptions,
  ChunkProcessingProgress,
  ChunkProcessingResult,
  ChunkProcessingMetrics,
  ChunkStatistics,
  ChunkMetadata,
  ResumableProcessingState,
  ProcessingState
} from './chunked-processor';

export {
  BatchVectorStore,
  BatchingStrategy
} from './batch-vector-store';
export type {
  BatchInsertOptions,
  BatchInsertProgress,
  BatchInsertResult,
  BatchInsertMetrics,
  ConnectionPoolConfig,
  ConnectionPoolHealth
} from './batch-vector-store';