/**
 * Optimized Batch Vector Store Tests
 * Tests for batch vector insertions, connection pooling, and intelligent batching
 * Following Test-Driven Development (TFD) methodology
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Document } from '@langchain/core/documents';
import { realIL2CPPDumpSample, realIL2CPPComplexSample } from './test-data';

import {
  BatchVectorStore,
  BatchInsertOptions,
  BatchInsertProgress,
  BatchInsertResult,
  BatchInsertMetrics,
  ConnectionPoolConfig,
  BatchingStrategy
} from '../performance/batch-vector-store';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  rpc: jest.fn().mockReturnThis(),
  auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'mock-token' } } })
  }
};

// Mock embeddings
const mockEmbeddings = {
  embedDocuments: jest.fn(),
  embedQuery: jest.fn(),
  initialize: jest.fn()
};

describe('Batch Vector Store Tests', () => {
  let batchVectorStore: BatchVectorStore;
  let progressCallback: jest.MockedFunction<(progress: BatchInsertProgress) => void>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock embeddings
    mockEmbeddings.embedDocuments.mockImplementation((texts: string[]) => {
      return Promise.resolve(texts.map(() => Array(384).fill(0.5)));
    });

    // Setup mock Supabase responses - default to success
    mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
    mockSupabaseClient.upsert.mockResolvedValue({ error: null });
    mockSupabaseClient.insert.mockResolvedValue({ error: null });

    progressCallback = jest.fn();

    batchVectorStore = new BatchVectorStore(
      mockEmbeddings as any,
      'mock-url',
      'mock-key',
      'test_table'
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Batch Operations', () => {
    it('should initialize with default configuration', () => {
      // Assert
      expect(batchVectorStore).toBeDefined();
      expect(batchVectorStore.getConnectionPoolConfig()).toBeDefined();
      expect(batchVectorStore.getConnectionPoolConfig().maxConnections).toBeGreaterThan(0);
    });

    it('should insert small batches efficiently', async () => {
      // Arrange
      const documents = Array(50).fill(null).map((_, i) => new Document({
        pageContent: `Test document ${i}`,
        metadata: { type: 'test', index: i }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        batchingStrategy: BatchingStrategy.FIXED_SIZE,
        maxConcurrency: 2
      };

      // Act
      const result = await batchVectorStore.batchInsert(documents, options);

      // Assert
      expect(result).toBeDefined();
      expect(result.totalDocuments).toBe(50);
      expect(result.successfulInserts).toBe(50);
      expect(result.failedInserts).toBe(0);
      expect(result.metrics).toBeDefined();
      expect(progressCallback).toHaveBeenCalled();
    });

    it('should handle large document batches with intelligent sizing', async () => {
      // Arrange
      const documents = Array(1000).fill(null).map((_, i) => new Document({
        pageContent: realIL2CPPDumpSample + ` Modified ${i}`,
        metadata: { type: 'class', index: i, size: 'large' }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        batchingStrategy: BatchingStrategy.CONTENT_AWARE,
        maxConcurrency: 4
      };

      // Act
      const result = await batchVectorStore.batchInsert(documents, options);

      // Assert
      expect(result.totalDocuments).toBe(1000);
      expect(result.successfulInserts).toBe(1000);
      expect(result.metrics.totalProcessingTimeMs).toBeGreaterThan(0);
      expect(result.metrics.averageBatchSizeUsed).toBeGreaterThan(0);
      expect(result.metrics.connectionPoolEfficiency).toBeGreaterThan(0);
    });
  });

  describe('Connection Pool Management', () => {
    it('should configure connection pool with custom settings', () => {
      // Arrange
      const customConfig: ConnectionPoolConfig = {
        maxConnections: 10,
        minConnections: 2,
        acquireTimeoutMs: 5000,
        idleTimeoutMs: 30000,
        maxRetries: 5
      };

      // Act
      batchVectorStore.configureConnectionPool(customConfig);

      // Assert
      const config = batchVectorStore.getConnectionPoolConfig();
      expect(config.maxConnections).toBe(10);
      expect(config.minConnections).toBe(2);
      expect(config.acquireTimeoutMs).toBe(5000);
    });

    it('should handle connection pool exhaustion gracefully', async () => {
      // Arrange
      const smallPoolConfig: ConnectionPoolConfig = {
        maxConnections: 2,
        minConnections: 1,
        acquireTimeoutMs: 1000,
        idleTimeoutMs: 5000,
        maxRetries: 2
      };

      batchVectorStore.configureConnectionPool(smallPoolConfig);

      const documents = Array(100).fill(null).map((_, i) => new Document({
        pageContent: `Document ${i}`,
        metadata: { type: 'test', index: i }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        maxConcurrency: 5, // More than pool size
        batchingStrategy: BatchingStrategy.FIXED_SIZE
      };

      // Act
      const result = await batchVectorStore.batchInsert(documents, options);

      // Assert
      expect(result.totalDocuments).toBe(100);
      expect(result.successfulInserts).toBe(100);
      expect(result.metrics.connectionPoolEfficiency).toBeLessThanOrEqual(100);
    });

    it('should monitor connection pool health', async () => {
      // Arrange & Act
      const poolHealth = await batchVectorStore.getConnectionPoolHealth();

      // Assert
      expect(poolHealth).toBeDefined();
      expect(poolHealth.activeConnections).toBeGreaterThanOrEqual(0);
      expect(poolHealth.idleConnections).toBeGreaterThanOrEqual(0);
      expect(poolHealth.totalConnections).toBeGreaterThanOrEqual(0);
      expect(poolHealth.healthScore).toBeGreaterThanOrEqual(0);
      expect(poolHealth.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Intelligent Batching Strategies', () => {
    it('should use fixed size batching strategy', async () => {
      // Arrange
      const documents = Array(200).fill(null).map((_, i) => new Document({
        pageContent: `Document ${i}`,
        metadata: { type: 'test', index: i }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        batchingStrategy: BatchingStrategy.FIXED_SIZE,
        fixedBatchSize: 25
      };

      // Act
      const result = await batchVectorStore.batchInsert(documents, options);

      // Assert
      expect(result.metrics.batchesProcessed).toBe(8); // 200 / 25
      expect(result.metrics.averageBatchSizeUsed).toBe(25);
    });

    it('should use content-aware batching strategy', async () => {
      // Arrange
      const smallDocs = Array(50).fill(null).map((_, i) => new Document({
        pageContent: `Small doc ${i}`,
        metadata: { type: 'small', index: i }
      }));

      const largeDocs = Array(50).fill(null).map((_, i) => new Document({
        pageContent: realIL2CPPComplexSample + ` Large doc ${i}`,
        metadata: { type: 'large', index: i }
      }));

      const mixedDocuments = [...smallDocs, ...largeDocs];

      const options: BatchInsertOptions = {
        progressCallback,
        batchingStrategy: BatchingStrategy.CONTENT_AWARE,
        maxBatchSizeBytes: 50000 // 50KB limit
      };

      // Act
      const result = await batchVectorStore.batchInsert(mixedDocuments, options);

      // Assert
      expect(result.totalDocuments).toBe(100);
      expect(result.successfulInserts).toBe(100);
      expect(result.metrics.batchesProcessed).toBeGreaterThanOrEqual(2); // Should create multiple batches
    });

    it('should use adaptive batching strategy', async () => {
      // Arrange
      const documents = Array(300).fill(null).map((_, i) => new Document({
        pageContent: `Adaptive doc ${i}`,
        metadata: { type: 'adaptive', index: i }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        batchingStrategy: BatchingStrategy.ADAPTIVE,
        maxConcurrency: 3
      };

      // Act
      const result = await batchVectorStore.batchInsert(documents, options);

      // Assert
      expect(result.totalDocuments).toBe(300);
      expect(result.successfulInserts).toBe(300);
      expect(result.metrics.adaptiveBatchingUsed).toBe(true);
      expect(result.metrics.averageBatchSizeUsed).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    it('should retry failed batch operations', async () => {
      // Arrange
      let attemptCount = 0;

      // Reset the mock and set up failure/success pattern
      mockSupabaseClient.upsert.mockReset();
      mockSupabaseClient.upsert.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          return Promise.resolve({ error: { message: 'Temporary failure' } });
        }
        return Promise.resolve({ error: null });
      });

      const documents = Array(10).fill(null).map((_, i) => new Document({
        pageContent: `Retry doc ${i}`,
        metadata: { type: 'retry', index: i }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        maxRetries: 3,
        retryDelayMs: 10 // Shorter delay for faster test
      };

      // Act
      const result = await batchVectorStore.batchInsert(documents, options);

      // Assert
      expect(result.successfulInserts).toBe(10);
      expect(result.metrics.retriesPerformed).toBeGreaterThan(0);
      expect(attemptCount).toBe(3); // Should retry twice before succeeding
    });

    it('should handle partial batch failures gracefully', async () => {
      // Arrange
      let callCount = 0;

      // Reset the mock and set up alternating failure pattern
      mockSupabaseClient.upsert.mockReset();
      mockSupabaseClient.upsert.mockImplementation(() => {
        callCount++;
        // Fail every other batch
        if (callCount % 2 === 0) {
          return Promise.resolve({ error: { message: 'Batch failure' } });
        }
        return Promise.resolve({ error: null });
      });

      const documents = Array(100).fill(null).map((_, i) => new Document({
        pageContent: `Partial fail doc ${i}`,
        metadata: { type: 'partial', index: i }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        maxRetries: 0, // No retries to ensure predictable failure pattern
        continueOnError: true,
        fixedBatchSize: 25 // Fixed batch size for predictable batching
      };

      // Act
      const result = await batchVectorStore.batchInsert(documents, options);

      // Assert
      expect(result.totalDocuments).toBe(100);
      expect(result.failedInserts).toBeGreaterThan(0);
      expect(result.successfulInserts).toBeGreaterThan(0);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should stop on first error when continueOnError is false', async () => {
      // Arrange
      // Reset the mock and set up to always fail
      mockSupabaseClient.upsert.mockReset();
      mockSupabaseClient.upsert.mockImplementation(() => {
        return Promise.resolve({ error: { message: 'Critical failure' } });
      });

      const documents = Array(100).fill(null).map((_, i) => new Document({
        pageContent: `Stop on error doc ${i}`,
        metadata: { type: 'stop', index: i }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        maxRetries: 0,
        continueOnError: false
      };

      // Act & Assert
      await expect(batchVectorStore.batchInsert(documents, options)).rejects.toThrow();
    });
  });

  describe('Performance and Metrics', () => {
    it('should collect comprehensive performance metrics', async () => {
      // Arrange
      const documents = Array(500).fill(null).map((_, i) => new Document({
        pageContent: `Metrics doc ${i}`,
        metadata: { type: 'metrics', index: i }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        batchingStrategy: BatchingStrategy.ADAPTIVE,
        maxConcurrency: 3
      };

      // Act
      const result = await batchVectorStore.batchInsert(documents, options);

      // Assert
      const metrics = result.metrics;
      expect(metrics.totalProcessingTimeMs).toBeGreaterThan(0);
      expect(metrics.embeddingGenerationTimeMs).toBeGreaterThan(0);
      expect(metrics.databaseInsertionTimeMs).toBeGreaterThan(0);
      expect(metrics.batchesProcessed).toBeGreaterThan(0);
      expect(metrics.averageBatchSizeUsed).toBeGreaterThan(0);
      expect(metrics.connectionPoolEfficiency).toBeGreaterThanOrEqual(0);
      expect(metrics.throughputDocsPerSecond).toBeGreaterThan(0);
    });

    it('should track progress accurately', async () => {
      // Arrange
      const documents = Array(200).fill(null).map((_, i) => new Document({
        pageContent: `Progress doc ${i}`,
        metadata: { type: 'progress', index: i }
      }));

      const progressUpdates: BatchInsertProgress[] = [];
      const trackingCallback = (progress: BatchInsertProgress) => {
        progressUpdates.push({ ...progress });
      };

      const options: BatchInsertOptions = {
        progressCallback: trackingCallback,
        batchingStrategy: BatchingStrategy.FIXED_SIZE,
        fixedBatchSize: 20
      };

      // Act
      await batchVectorStore.batchInsert(documents, options);

      // Assert
      expect(progressUpdates.length).toBeGreaterThan(5);
      expect(progressUpdates[0].percentComplete).toBe(0);
      expect(progressUpdates[progressUpdates.length - 1].percentComplete).toBe(100);

      // Progress should be monotonically increasing
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i].percentComplete).toBeGreaterThanOrEqual(progressUpdates[i - 1].percentComplete);
      }
    });

    it('should optimize batch sizes based on content complexity', async () => {
      // Arrange
      const simpleDocuments = Array(100).fill(null).map((_, i) => new Document({
        pageContent: `Simple ${i}`,
        metadata: { type: 'simple', index: i }
      }));

      const complexDocuments = Array(100).fill(null).map((_, i) => new Document({
        pageContent: realIL2CPPComplexSample + ` Complex ${i}`,
        metadata: { type: 'complex', index: i }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        batchingStrategy: BatchingStrategy.CONTENT_AWARE,
        maxBatchSizeBytes: 100000
      };

      // Act
      const simpleResult = await batchVectorStore.batchInsert(simpleDocuments, options);
      const complexResult = await batchVectorStore.batchInsert(complexDocuments, options);

      // Assert
      // Simple documents should use larger batches than complex ones
      expect(simpleResult.metrics.averageBatchSizeUsed).toBeGreaterThan(
        complexResult.metrics.averageBatchSizeUsed
      );
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    it('should handle empty document arrays', async () => {
      // Arrange
      const documents: Document[] = [];
      const options: BatchInsertOptions = { progressCallback };

      // Act
      const result = await batchVectorStore.batchInsert(documents, options);

      // Assert
      expect(result.totalDocuments).toBe(0);
      expect(result.successfulInserts).toBe(0);
      expect(result.failedInserts).toBe(0);
    });

    it('should handle documents with very large content', async () => {
      // Arrange
      const largeContent = 'x'.repeat(1000000); // 1MB content
      const documents = [new Document({
        pageContent: largeContent,
        metadata: { type: 'large', size: largeContent.length }
      })];

      const options: BatchInsertOptions = {
        progressCallback,
        batchingStrategy: BatchingStrategy.CONTENT_AWARE
      };

      // Act
      const result = await batchVectorStore.batchInsert(documents, options);

      // Assert
      expect(result.successfulInserts).toBe(1);
      expect(result.metrics.averageBatchSizeUsed).toBe(1); // Should be in its own batch
    });

    it('should handle network timeouts gracefully', async () => {
      // Arrange
      // Reset the mock and set up to timeout
      mockSupabaseClient.upsert.mockReset();
      mockSupabaseClient.upsert.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Network timeout')), 200); // Longer than timeout
        });
      });

      const documents = Array(10).fill(null).map((_, i) => new Document({
        pageContent: `Timeout doc ${i}`,
        metadata: { type: 'timeout', index: i }
      }));

      const options: BatchInsertOptions = {
        progressCallback,
        maxRetries: 0, // No retries to speed up test
        retryDelayMs: 50,
        timeoutMs: 50, // Very short timeout
        continueOnError: false
      };

      // Act & Assert
      await expect(batchVectorStore.batchInsert(documents, options)).rejects.toThrow();
    });
  });

});
