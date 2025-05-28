/**
 * Optimized Batch Vector Store for IL2CPP Dump Analysis
 *
 * Provides enhanced batch processing capabilities for vector storage operations:
 * - Intelligent batching strategies based on content size and complexity
 * - Connection pooling and transaction optimization
 * - Comprehensive retry logic and error recovery
 * - Real-time progress tracking and performance metrics
 *
 * @author IL2CPP Agentic RAG MCP System
 * @version 1.0.0
 */

import { Document } from '@langchain/core/documents';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Embeddings } from '@langchain/core/embeddings';
import crypto from 'crypto';

/**
 * Batching strategies for optimizing vector insertions
 */
export enum BatchingStrategy {
  /** Fixed batch size regardless of content */
  FIXED_SIZE = 'fixed_size',
  /** Adaptive batch size based on content complexity */
  CONTENT_AWARE = 'content_aware',
  /** Dynamic batch size that adapts to performance */
  ADAPTIVE = 'adaptive'
}

/**
 * Configuration for connection pool management
 */
export interface ConnectionPoolConfig {
  /** Maximum number of concurrent connections */
  maxConnections: number;
  /** Minimum number of idle connections to maintain */
  minConnections: number;
  /** Timeout for acquiring a connection (ms) */
  acquireTimeoutMs: number;
  /** Timeout for idle connections (ms) */
  idleTimeoutMs: number;
  /** Maximum number of retry attempts */
  maxRetries: number;
}

/**
 * Options for batch insert operations
 */
export interface BatchInsertOptions {
  /** Callback for progress updates */
  progressCallback?: (progress: BatchInsertProgress) => void;
  /** Batching strategy to use */
  batchingStrategy?: BatchingStrategy;
  /** Fixed batch size (for FIXED_SIZE strategy) */
  fixedBatchSize?: number;
  /** Maximum batch size in bytes (for CONTENT_AWARE strategy) */
  maxBatchSizeBytes?: number;
  /** Maximum number of concurrent batch operations */
  maxConcurrency?: number;
  /** Maximum number of retry attempts per batch */
  maxRetries?: number;
  /** Delay between retry attempts (ms) */
  retryDelayMs?: number;
  /** Timeout for individual batch operations (ms) */
  timeoutMs?: number;
  /** Whether to continue processing on batch errors */
  continueOnError?: boolean;
}

/**
 * Progress information for batch operations
 */
export interface BatchInsertProgress {
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Number of documents processed */
  documentsProcessed: number;
  /** Total number of documents */
  totalDocuments: number;
  /** Current batch being processed */
  currentBatch: number;
  /** Total number of batches */
  totalBatches: number;
  /** Current operation description */
  operation: string;
  /** Estimated time remaining (ms) */
  estimatedTimeRemainingMs?: number;
}

/**
 * Performance metrics for batch operations
 */
export interface BatchInsertMetrics {
  /** Total processing time (ms) */
  totalProcessingTimeMs: number;
  /** Time spent generating embeddings (ms) */
  embeddingGenerationTimeMs: number;
  /** Time spent on database insertions (ms) */
  databaseInsertionTimeMs: number;
  /** Number of batches processed */
  batchesProcessed: number;
  /** Average batch size used */
  averageBatchSizeUsed: number;
  /** Connection pool efficiency (0-100) */
  connectionPoolEfficiency: number;
  /** Number of retries performed */
  retriesPerformed: number;
  /** Throughput in documents per second */
  throughputDocsPerSecond: number;
  /** Whether adaptive batching was used */
  adaptiveBatchingUsed?: boolean;
}

/**
 * Result of batch insert operation
 */
export interface BatchInsertResult {
  /** Total number of documents processed */
  totalDocuments: number;
  /** Number of successful insertions */
  successfulInserts: number;
  /** Number of failed insertions */
  failedInserts: number;
  /** Performance metrics */
  metrics: BatchInsertMetrics;
  /** Error details for failed insertions */
  errors: Array<{ batchIndex: number; error: string; documentCount: number }>;
}

/**
 * Connection pool health information
 */
export interface ConnectionPoolHealth {
  /** Number of active connections */
  activeConnections: number;
  /** Number of idle connections */
  idleConnections: number;
  /** Total number of connections */
  totalConnections: number;
  /** Health score (0-100) */
  healthScore: number;
  /** Average response time (ms) */
  averageResponseTimeMs: number;
}

/**
 * Connection wrapper for pool management
 */
interface PooledConnection {
  client: SupabaseClient;
  id: string;
  createdAt: Date;
  lastUsedAt: Date;
  isActive: boolean;
}

/**
 * Optimized Batch Vector Store with intelligent batching and connection pooling
 */
export class BatchVectorStore {
  private embeddings: Embeddings;
  private supabaseUrl: string;
  private supabaseKey: string;
  private tableName: string;
  private connectionPool: PooledConnection[] = [];
  private connectionPoolConfig: ConnectionPoolConfig;
  private performanceHistory: number[] = [];

  /**
   * Initialize the batch vector store
   *
   * @param embeddings - Embeddings instance for generating vectors
   * @param supabaseUrl - Supabase project URL
   * @param supabaseKey - Supabase API key
   * @param tableName - Database table name for vector storage
   */
  constructor(
    embeddings: Embeddings,
    supabaseUrl: string,
    supabaseKey: string,
    tableName: string = 'il2cpp_documents'
  ) {
    this.embeddings = embeddings;
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.tableName = tableName;

    // Default connection pool configuration
    this.connectionPoolConfig = {
      maxConnections: 10,
      minConnections: 2,
      acquireTimeoutMs: 10000,
      idleTimeoutMs: 60000,
      maxRetries: 3
    };

    this.initializeConnectionPool();
  }

  /**
   * Configure connection pool settings
   *
   * @param config - Connection pool configuration
   */
  public configureConnectionPool(config: Partial<ConnectionPoolConfig>): void {
    this.connectionPoolConfig = { ...this.connectionPoolConfig, ...config };
    this.reinitializeConnectionPool();
  }

  /**
   * Get current connection pool configuration
   *
   * @returns Current connection pool configuration
   */
  public getConnectionPoolConfig(): ConnectionPoolConfig {
    return { ...this.connectionPoolConfig };
  }

  /**
   * Get connection pool health information
   *
   * @returns Connection pool health metrics
   */
  public async getConnectionPoolHealth(): Promise<ConnectionPoolHealth> {
    const now = Date.now();
    const activeConnections = this.connectionPool.filter(conn => conn.isActive).length;
    const idleConnections = this.connectionPool.filter(conn => !conn.isActive).length;
    const totalConnections = this.connectionPool.length;

    // Calculate average response time from performance history
    const averageResponseTime = this.performanceHistory.length > 0
      ? this.performanceHistory.reduce((sum, time) => sum + time, 0) / this.performanceHistory.length
      : 0;

    // Calculate health score based on pool utilization and response times
    const utilizationScore = Math.min(100, (totalConnections / this.connectionPoolConfig.maxConnections) * 100);
    const responseTimeScore = Math.max(0, 100 - (averageResponseTime / 100)); // Penalize slow responses
    const healthScore = (utilizationScore + responseTimeScore) / 2;

    return {
      activeConnections,
      idleConnections,
      totalConnections,
      healthScore: Math.round(healthScore),
      averageResponseTimeMs: Math.round(averageResponseTime)
    };
  }

  /**
   * Perform batch insert operation with intelligent batching and optimization
   *
   * @param documents - Documents to insert
   * @param options - Batch insert options
   * @returns Batch insert result with metrics
   */
  public async batchInsert(
    documents: Document[],
    options: BatchInsertOptions = {}
  ): Promise<BatchInsertResult> {
    const startTime = Date.now();

    // Handle empty document array
    if (documents.length === 0) {
      return this.createEmptyResult();
    }

    // Set default options
    const opts = this.setDefaultOptions(options);

    // Initialize result tracking
    const result: BatchInsertResult = {
      totalDocuments: documents.length,
      successfulInserts: 0,
      failedInserts: 0,
      metrics: this.initializeMetrics(),
      errors: []
    };

    try {
      // Generate embeddings for all documents
      const embeddingStartTime = Date.now();
      const embeddings = await this.embeddings.embedDocuments(
        documents.map(doc => doc.pageContent)
      );
      result.metrics.embeddingGenerationTimeMs = Date.now() - embeddingStartTime;

      // Create batches using selected strategy
      const batches = this.createBatches(documents, embeddings, opts);
      result.metrics.batchesProcessed = batches.length;
      result.metrics.averageBatchSizeUsed = documents.length / batches.length;

      // Report initial progress
      if (opts.progressCallback) {
        opts.progressCallback({
          percentComplete: 0,
          documentsProcessed: 0,
          totalDocuments: documents.length,
          currentBatch: 0,
          totalBatches: batches.length,
          operation: 'Starting batch processing...'
        });
      }

      // Process batches with concurrency control
      await this.processBatchesConcurrently(batches, opts, result);

      // Calculate final metrics
      result.metrics.totalProcessingTimeMs = Date.now() - startTime;
      result.metrics.throughputDocsPerSecond =
        (result.successfulInserts / result.metrics.totalProcessingTimeMs) * 1000;

      // Calculate connection pool efficiency
      const poolHealth = await this.getConnectionPoolHealth();
      result.metrics.connectionPoolEfficiency = poolHealth.healthScore;

      // Mark adaptive batching if used
      if (opts.batchingStrategy === BatchingStrategy.ADAPTIVE) {
        result.metrics.adaptiveBatchingUsed = true;
      }

      // Report completion
      if (opts.progressCallback) {
        opts.progressCallback({
          percentComplete: 100,
          documentsProcessed: result.successfulInserts,
          totalDocuments: documents.length,
          currentBatch: batches.length,
          totalBatches: batches.length,
          operation: 'Batch processing completed'
        });
      }

      return result;

    } catch (error) {
      if (!opts.continueOnError) {
        throw error;
      }

      result.errors.push({
        batchIndex: -1,
        error: error instanceof Error ? error.message : String(error),
        documentCount: documents.length
      });

      return result;
    }
  }

  /**
   * Initialize connection pool with minimum connections
   */
  private initializeConnectionPool(): void {
    this.connectionPool = [];

    // Create minimum number of connections
    for (let i = 0; i < this.connectionPoolConfig.minConnections; i++) {
      this.connectionPool.push(this.createConnection());
    }
  }

  /**
   * Reinitialize connection pool with new configuration
   */
  private reinitializeConnectionPool(): void {
    // Close existing connections
    this.connectionPool = [];

    // Create new pool with updated configuration
    this.initializeConnectionPool();
  }

  /**
   * Create a new pooled connection
   *
   * @returns New pooled connection
   */
  private createConnection(): PooledConnection {
    const client = createClient(this.supabaseUrl, this.supabaseKey);

    return {
      client,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      lastUsedAt: new Date(),
      isActive: false
    };
  }

  /**
   * Acquire a connection from the pool
   *
   * @returns Promise resolving to a pooled connection
   */
  private async acquireConnection(): Promise<PooledConnection> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.connectionPoolConfig.acquireTimeoutMs) {
      // Find an idle connection
      const idleConnection = this.connectionPool.find(conn => !conn.isActive);

      if (idleConnection) {
        idleConnection.isActive = true;
        idleConnection.lastUsedAt = new Date();
        return idleConnection;
      }

      // Create new connection if under max limit
      if (this.connectionPool.length < this.connectionPoolConfig.maxConnections) {
        const newConnection = this.createConnection();
        newConnection.isActive = true;
        this.connectionPool.push(newConnection);
        return newConnection;
      }

      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Connection pool timeout: Unable to acquire connection');
  }

  /**
   * Release a connection back to the pool
   *
   * @param connection - Connection to release
   */
  private releaseConnection(connection: PooledConnection): void {
    connection.isActive = false;
    connection.lastUsedAt = new Date();
  }

  /**
   * Set default options for batch operations
   *
   * @param options - User-provided options
   * @returns Complete options with defaults
   */
  private setDefaultOptions(options: BatchInsertOptions): Required<BatchInsertOptions> {
    return {
      progressCallback: options.progressCallback || (() => {}),
      batchingStrategy: options.batchingStrategy || BatchingStrategy.ADAPTIVE,
      fixedBatchSize: options.fixedBatchSize || 100,
      maxBatchSizeBytes: options.maxBatchSizeBytes || 1024 * 1024, // 1MB
      maxConcurrency: options.maxConcurrency || 5,
      maxRetries: options.maxRetries || 3,
      retryDelayMs: options.retryDelayMs || 1000,
      timeoutMs: options.timeoutMs || 30000,
      continueOnError: options.continueOnError || false
    };
  }

  /**
   * Create empty result for edge cases
   *
   * @returns Empty batch insert result
   */
  private createEmptyResult(): BatchInsertResult {
    return {
      totalDocuments: 0,
      successfulInserts: 0,
      failedInserts: 0,
      metrics: {
        totalProcessingTimeMs: 0,
        embeddingGenerationTimeMs: 0,
        databaseInsertionTimeMs: 0,
        batchesProcessed: 0,
        averageBatchSizeUsed: 0,
        connectionPoolEfficiency: 100,
        retriesPerformed: 0,
        throughputDocsPerSecond: 0
      },
      errors: []
    };
  }

  /**
   * Initialize metrics tracking
   *
   * @returns Initial metrics object
   */
  private initializeMetrics(): BatchInsertMetrics {
    return {
      totalProcessingTimeMs: 0,
      embeddingGenerationTimeMs: 0,
      databaseInsertionTimeMs: 0,
      batchesProcessed: 0,
      averageBatchSizeUsed: 0,
      connectionPoolEfficiency: 0,
      retriesPerformed: 0,
      throughputDocsPerSecond: 0,
      adaptiveBatchingUsed: false
    };
  }

  /**
   * Create batches using the selected batching strategy
   *
   * @param documents - Documents to batch
   * @param embeddings - Corresponding embeddings
   * @param options - Batch options
   * @returns Array of document batches with embeddings
   */
  private createBatches(
    documents: Document[],
    embeddings: number[][],
    options: Required<BatchInsertOptions>
  ): Array<{ documents: Document[]; embeddings: number[][] }> {
    switch (options.batchingStrategy) {
      case BatchingStrategy.FIXED_SIZE:
        return this.createFixedSizeBatches(documents, embeddings, options.fixedBatchSize);

      case BatchingStrategy.CONTENT_AWARE:
        return this.createContentAwareBatches(documents, embeddings, options.maxBatchSizeBytes);

      case BatchingStrategy.ADAPTIVE:
        return this.createAdaptiveBatches(documents, embeddings);

      default:
        return this.createFixedSizeBatches(documents, embeddings, options.fixedBatchSize);
    }
  }

  /**
   * Create fixed-size batches
   *
   * @param documents - Documents to batch
   * @param embeddings - Corresponding embeddings
   * @param batchSize - Fixed batch size
   * @returns Array of fixed-size batches
   */
  private createFixedSizeBatches(
    documents: Document[],
    embeddings: number[][],
    batchSize: number
  ): Array<{ documents: Document[]; embeddings: number[][] }> {
    const batches = [];

    for (let i = 0; i < documents.length; i += batchSize) {
      const endIndex = Math.min(i + batchSize, documents.length);
      batches.push({
        documents: documents.slice(i, endIndex),
        embeddings: embeddings.slice(i, endIndex)
      });
    }

    return batches;
  }

  /**
   * Create content-aware batches based on content size
   *
   * @param documents - Documents to batch
   * @param embeddings - Corresponding embeddings
   * @param maxBatchSizeBytes - Maximum batch size in bytes
   * @returns Array of content-aware batches
   */
  private createContentAwareBatches(
    documents: Document[],
    embeddings: number[][],
    maxBatchSizeBytes: number
  ): Array<{ documents: Document[]; embeddings: number[][] }> {
    const batches = [];
    let currentBatch: Document[] = [];
    let currentEmbeddings: number[][] = [];
    let currentBatchSize = 0;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const embedding = embeddings[i];
      const docSize = Buffer.byteLength(doc.pageContent, 'utf8') +
                     Buffer.byteLength(JSON.stringify(doc.metadata), 'utf8');

      // If adding this document would exceed the limit, start a new batch
      if (currentBatchSize + docSize > maxBatchSizeBytes && currentBatch.length > 0) {
        batches.push({
          documents: [...currentBatch],
          embeddings: [...currentEmbeddings]
        });
        currentBatch = [];
        currentEmbeddings = [];
        currentBatchSize = 0;
      }

      currentBatch.push(doc);
      currentEmbeddings.push(embedding);
      currentBatchSize += docSize;
    }

    // Add the last batch if it has documents
    if (currentBatch.length > 0) {
      batches.push({
        documents: currentBatch,
        embeddings: currentEmbeddings
      });
    }

    return batches;
  }

  /**
   * Create adaptive batches based on performance history
   *
   * @param documents - Documents to batch
   * @param embeddings - Corresponding embeddings
   * @returns Array of adaptive batches
   */
  private createAdaptiveBatches(
    documents: Document[],
    embeddings: number[][]
  ): Array<{ documents: Document[]; embeddings: number[][] }> {
    // Start with a reasonable default batch size
    let adaptiveBatchSize = 50;

    // Adjust based on performance history
    if (this.performanceHistory.length > 0) {
      const avgPerformance = this.performanceHistory.reduce((sum, time) => sum + time, 0) / this.performanceHistory.length;

      // If performance is good (fast), increase batch size
      if (avgPerformance < 1000) { // Less than 1 second per batch
        adaptiveBatchSize = Math.min(200, adaptiveBatchSize * 1.5);
      }
      // If performance is poor (slow), decrease batch size
      else if (avgPerformance > 5000) { // More than 5 seconds per batch
        adaptiveBatchSize = Math.max(10, adaptiveBatchSize * 0.7);
      }
    }

    return this.createFixedSizeBatches(documents, embeddings, Math.floor(adaptiveBatchSize));
  }

  /**
   * Process batches concurrently with proper error handling and progress tracking
   *
   * @param batches - Batches to process
   * @param options - Processing options
   * @param result - Result object to update
   */
  private async processBatchesConcurrently(
    batches: Array<{ documents: Document[]; embeddings: number[][] }>,
    options: Required<BatchInsertOptions>,
    result: BatchInsertResult
  ): Promise<void> {
    const semaphore = new Array(options.maxConcurrency).fill(null);
    let batchIndex = 0;
    let completedBatches = 0;

    const processBatch = async (batch: { documents: Document[]; embeddings: number[][] }, index: number) => {
      const batchStartTime = Date.now();

      try {
        await this.processSingleBatch(batch, index, options, result);
        result.successfulInserts += batch.documents.length;

        // Track performance for adaptive batching
        const batchTime = Date.now() - batchStartTime;
        this.performanceHistory.push(batchTime);

        // Keep only recent performance data (last 100 batches)
        if (this.performanceHistory.length > 100) {
          this.performanceHistory.shift();
        }

      } catch (error) {
        result.failedInserts += batch.documents.length;
        result.errors.push({
          batchIndex: index,
          error: error instanceof Error ? error.message : String(error),
          documentCount: batch.documents.length
        });

        if (!options.continueOnError) {
          throw error;
        }
      }

      completedBatches++;

      // Report progress
      const percentComplete = Math.floor((completedBatches / batches.length) * 100);
      options.progressCallback({
        percentComplete,
        documentsProcessed: result.successfulInserts + result.failedInserts,
        totalDocuments: result.totalDocuments,
        currentBatch: completedBatches,
        totalBatches: batches.length,
        operation: `Processing batch ${completedBatches}/${batches.length}...`
      });
    };

    // Process batches with concurrency control
    const promises: Promise<void>[] = [];

    for (const batch of batches) {
      const promise = processBatch(batch, batchIndex++);
      promises.push(promise);

      // Wait if we've reached max concurrency
      if (promises.length >= options.maxConcurrency) {
        await Promise.race(promises);
        // Remove completed promises
        for (let i = promises.length - 1; i >= 0; i--) {
          if (await Promise.race([promises[i], Promise.resolve('pending')]) !== 'pending') {
            promises.splice(i, 1);
          }
        }
      }
    }

    // Wait for all remaining promises
    await Promise.all(promises);
  }

  /**
   * Process a single batch with retry logic
   *
   * @param batch - Batch to process
   * @param batchIndex - Index of the batch
   * @param options - Processing options
   * @param result - Result object to update metrics
   */
  private async processSingleBatch(
    batch: { documents: Document[]; embeddings: number[][] },
    batchIndex: number,
    options: Required<BatchInsertOptions>,
    result?: BatchInsertResult
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
      try {
        const connection = await this.acquireConnection();

        try {
          // Prepare batch data with document hashes
          const batchData = batch.documents.map((doc, i) => ({
            content: doc.pageContent,
            metadata: doc.metadata,
            embedding: batch.embeddings[i],
            document_hash: this.generateDocumentHash(doc)
          }));

          // Track database insertion time
          const dbStartTime = Date.now();

          // Insert with timeout
          const insertPromise = connection.client
            .from(this.tableName)
            .upsert(batchData, { onConflict: 'document_hash', ignoreDuplicates: true });

          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Batch operation timeout')), options.timeoutMs);
          });

          const { error } = await Promise.race([insertPromise, timeoutPromise]) as any;

          if (error) {
            throw new Error(`Database error: ${error.message}`);
          }

          // Track database insertion time
          if (result) {
            result.metrics.databaseInsertionTimeMs += Date.now() - dbStartTime;
          }

          // Success - release connection and return
          this.releaseConnection(connection);
          return;

        } catch (error) {
          this.releaseConnection(connection);
          throw error;
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt <= options.maxRetries) {
          // Track retry
          if (result) {
            result.metrics.retriesPerformed++;
          }

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, options.retryDelayMs * attempt));
        }
      }
    }

    // All retries failed
    throw lastError || new Error('Unknown error during batch processing');
  }

  /**
   * Generate a hash for document deduplication
   *
   * @param document - Document to hash
   * @returns Document hash string
   */
  private generateDocumentHash(document: Document): string {
    const content = document.pageContent + JSON.stringify(document.metadata);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}