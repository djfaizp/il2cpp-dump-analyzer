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

export { ParserPool } from './parser-pool';
export type {
  ParserPoolOptions,
  ParserPoolMetrics
} from './parser-pool';

export { AsyncSemaphore } from './async-semaphore';
export type {
  AsyncSemaphoreOptions,
  SemaphoreMetrics,
  CancellationToken as SemaphoreCancellationToken
} from './async-semaphore';

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

export { PerformanceMonitor } from './performance-monitor';
export type {
  PerformanceMetrics as MonitorPerformanceMetrics,
  SystemMetrics,
  BottleneckReport,
  OptimizationRecommendation,
  PerformanceThresholds,
  PerformanceRegression,
  MonitoringOptions,
  CompleteBottleneckReport,
  PerformanceDataExport,
  MemoryUsage as MonitorMemoryUsage,
  SystemMemoryUsage
} from './performance-monitor';