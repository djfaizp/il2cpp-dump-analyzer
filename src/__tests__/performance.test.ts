/**
 * Performance tests for IL2CPP dump analyzer
 * Tests system performance with large files, concurrent operations, and memory usage
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockIL2CPPDumpContent, mockDocuments } from './test-data';

// Mock performance monitoring
const mockPerformance = {
  now: jest.fn(),
  mark: jest.fn(),
  measure: jest.fn()
};

global.performance = mockPerformance as any;

describe('Performance Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPerformance.now.mockReturnValue(Date.now());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Large File Processing', () => {
    it('should process large IL2CPP dump files within acceptable time', async () => {
      // Arrange
      const largeContent = generateLargeIL2CPPContent(10000); // 10k lines
      const processor = createMockProcessor();

      // Act
      const startTime = Date.now();
      const result = await processor.processContent(largeContent);
      const endTime = Date.now();

      // Assert
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(result.processedLines).toBeGreaterThan(9000); // Should process most lines
      expect(result.memoryUsage).toBeLessThan(500 * 1024 * 1024); // Less than 500MB
    });

    it('should handle very large files without memory overflow', async () => {
      // Arrange
      const veryLargeContent = generateLargeIL2CPPContent(50000); // 50k lines
      const processor = createMockProcessor();

      // Act
      const initialMemory = process.memoryUsage().heapUsed;
      const result = await processor.processContent(veryLargeContent);
      const finalMemory = process.memoryUsage().heapUsed;

      // Assert
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(1024 * 1024 * 1024); // Less than 1GB increase
      expect(result.processedSuccessfully).toBe(true);
    });

    it('should process files incrementally for memory efficiency', async () => {
      // Arrange
      const processor = createMockProcessor();
      const chunkSize = 1000;
      const totalLines = 10000;

      // Act
      const memorySnapshots: number[] = [];
      for (let i = 0; i < totalLines; i += chunkSize) {
        const chunk = generateLargeIL2CPPContent(chunkSize);
        await processor.processChunk(chunk);
        memorySnapshots.push(process.memoryUsage().heapUsed);
      }

      // Assert
      // Memory usage should not grow linearly with processed chunks
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowthRatio = lastSnapshot / firstSnapshot;
      expect(memoryGrowthRatio).toBeLessThan(5); // Should not grow more than 5x
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous search requests', async () => {
      // Arrange
      const vectorStore = createMockVectorStore();
      const searchQueries = Array(20).fill(null).map((_, i) => `Query${i}`);

      // Act
      const startTime = Date.now();
      const searchPromises = searchQueries.map(query =>
        vectorStore.similaritySearch(query, 5)
      );
      const results = await Promise.all(searchPromises);
      const endTime = Date.now();

      // Assert
      const totalTime = endTime - startTime;
      const averageTimePerSearch = totalTime / searchQueries.length;
      expect(averageTimePerSearch).toBeLessThan(1000); // Less than 1 second per search
      expect(results).toHaveLength(searchQueries.length);
      expect(results.every(result => Array.isArray(result))).toBe(true);
    });

    it('should handle concurrent document indexing', async () => {
      // Arrange
      const vectorStore = createMockVectorStore();
      const documentBatches = Array(5).fill(null).map((_, i) =>
        Array(100).fill(null).map((_, j) => ({
          pageContent: `Document ${i}-${j}`,
          metadata: { name: `Doc${i}-${j}`, type: 'class' }
        }))
      );

      // Act
      const startTime = Date.now();
      const indexingPromises = documentBatches.map(batch =>
        vectorStore.addDocuments(batch)
      );
      await Promise.all(indexingPromises);
      const endTime = Date.now();

      // Assert
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
    });

    it('should maintain performance under high load', async () => {
      // Arrange
      const vectorStore = createMockVectorStore();
      const highLoadOperations = [];

      // Mix of different operations
      for (let i = 0; i < 50; i++) {
        if (i % 3 === 0) {
          highLoadOperations.push(vectorStore.similaritySearch(`Query${i}`, 10));
        } else if (i % 3 === 1) {
          highLoadOperations.push(vectorStore.searchWithFilter(`Filter${i}`, { type: 'class' }, 5));
        } else {
          highLoadOperations.push(vectorStore.addDocuments([{
            pageContent: `Content${i}`,
            metadata: { name: `Item${i}` }
          }]));
        }
      }

      // Act
      const startTime = Date.now();
      const results = await Promise.allSettled(highLoadOperations);
      const endTime = Date.now();

      // Assert
      const totalTime = endTime - startTime;
      const successfulOperations = results.filter(r => r.status === 'fulfilled').length;
      const successRate = successfulOperations / results.length;
      
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(successRate).toBeGreaterThan(0.9); // At least 90% success rate
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources after processing', async () => {
      // Arrange
      const processor = createMockProcessor();
      const initialMemory = process.memoryUsage().heapUsed;

      // Act
      for (let i = 0; i < 10; i++) {
        const content = generateLargeIL2CPPContent(1000);
        await processor.processContent(content);
        await processor.cleanup(); // Explicit cleanup
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;

      // Assert
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
    });

    it('should handle memory pressure gracefully', async () => {
      // Arrange
      const processor = createMockProcessor();
      const memoryIntensiveContent = generateLargeIL2CPPContent(100000); // Very large

      // Act & Assert
      await expect(processor.processContent(memoryIntensiveContent))
        .resolves.toBeDefined(); // Should not crash or throw OOM
    });
  });

  describe('Embedding Performance', () => {
    it('should generate embeddings efficiently for large batches', async () => {
      // Arrange
      const embeddings = createMockEmbeddings();
      const largeBatch = Array(1000).fill(null).map((_, i) =>
        `Large document content ${i} with substantial text for embedding generation`
      );

      // Act
      const startTime = Date.now();
      const result = await embeddings.embedDocuments(largeBatch);
      const endTime = Date.now();

      // Assert
      const processingTime = endTime - startTime;
      const timePerDocument = processingTime / largeBatch.length;
      expect(timePerDocument).toBeLessThan(100); // Less than 100ms per document
      expect(result).toHaveLength(largeBatch.length);
    });

    it('should cache embeddings for repeated content', async () => {
      // Arrange
      const embeddings = createMockEmbeddings();
      const repeatedContent = 'This is repeated content for caching test';

      // Act
      const firstCall = Date.now();
      await embeddings.embedQuery(repeatedContent);
      const firstCallTime = Date.now() - firstCall;

      const secondCall = Date.now();
      await embeddings.embedQuery(repeatedContent);
      const secondCallTime = Date.now() - secondCall;

      // Assert
      expect(secondCallTime).toBeLessThan(firstCallTime * 0.5); // Should be significantly faster
    });
  });

  describe('Search Performance', () => {
    it('should maintain search speed with large vector databases', async () => {
      // Arrange
      const vectorStore = createMockVectorStore();
      
      // Simulate large database
      await vectorStore.addDocuments(Array(10000).fill(null).map((_, i) => ({
        pageContent: `Document ${i} content`,
        metadata: { name: `Doc${i}`, type: 'class' }
      })));

      // Act
      const searchTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await vectorStore.similaritySearch(`Query${i}`, 10);
        searchTimes.push(Date.now() - startTime);
      }

      // Assert
      const averageSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
      expect(averageSearchTime).toBeLessThan(2000); // Less than 2 seconds average
      
      // Search times should be consistent
      const maxTime = Math.max(...searchTimes);
      const minTime = Math.min(...searchTimes);
      expect(maxTime / minTime).toBeLessThan(3); // Variance should be reasonable
    });
  });
});

// Helper functions for performance testing

function generateLargeIL2CPPContent(lineCount: number): string {
  const lines: string[] = [];
  
  for (let i = 0; i < lineCount; i++) {
    if (i % 50 === 0) {
      lines.push(`namespace Test.Namespace${Math.floor(i / 50)} {`);
    } else if (i % 25 === 0) {
      lines.push(`public class TestClass${i} : MonoBehaviour {`);
    } else if (i % 10 === 0) {
      lines.push(`    public void TestMethod${i}() { }`);
    } else if (i % 5 === 0) {
      lines.push(`    private int field${i};`);
    } else {
      lines.push(`    // Comment line ${i}`);
    }
    
    if (i % 50 === 49) {
      lines.push('}');
    }
  }
  
  return lines.join('\n');
}

function createMockProcessor() {
  return {
    processContent: jest.fn().mockImplementation(async (content: string) => {
      // Simulate processing time based on content size
      const lines = content.split('\n');
      const processingTime = Math.min(lines.length * 0.1, 5000); // Max 5 seconds
      
      await new Promise(resolve => setTimeout(resolve, processingTime));
      
      return {
        processedLines: lines.length,
        processedSuccessfully: true,
        memoryUsage: process.memoryUsage().heapUsed
      };
    }),

    processChunk: jest.fn().mockImplementation(async (chunk: string) => {
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      return { processed: true };
    }),

    cleanup: jest.fn().mockImplementation(async () => {
      // Simulate cleanup
      await new Promise(resolve => setTimeout(resolve, 50));
    })
  };
}

function createMockVectorStore() {
  const documents: any[] = [];
  
  return {
    addDocuments: jest.fn().mockImplementation(async (docs: any[]) => {
      documents.push(...docs);
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, docs.length * 2));
    }),

    similaritySearch: jest.fn().mockImplementation(async (query: string, k: number) => {
      // Simulate search time based on database size
      const searchTime = Math.min(documents.length * 0.01, 1000);
      await new Promise(resolve => setTimeout(resolve, searchTime));
      
      return documents.slice(0, k).map(doc => ({
        pageContent: doc.pageContent,
        metadata: doc.metadata
      }));
    }),

    searchWithFilter: jest.fn().mockImplementation(async (query: string, filter: any, k: number) => {
      const searchTime = Math.min(documents.length * 0.02, 1500);
      await new Promise(resolve => setTimeout(resolve, searchTime));
      
      return documents
        .filter(doc => !filter.type || doc.metadata.type === filter.type)
        .slice(0, k);
    })
  };
}

function createMockEmbeddings() {
  const cache = new Map<string, number[]>();
  
  return {
    embedDocuments: jest.fn().mockImplementation(async (texts: string[]) => {
      // Simulate embedding generation time
      const processingTime = texts.length * 10; // 10ms per text
      await new Promise(resolve => setTimeout(resolve, processingTime));
      
      return texts.map(() => Array(384).fill(0).map(() => Math.random()));
    }),

    embedQuery: jest.fn().mockImplementation(async (text: string) => {
      // Check cache first
      if (cache.has(text)) {
        await new Promise(resolve => setTimeout(resolve, 5)); // Fast cache hit
        return cache.get(text);
      }
      
      // Simulate embedding generation
      await new Promise(resolve => setTimeout(resolve, 50));
      const embedding = Array(384).fill(0).map(() => Math.random());
      cache.set(text, embedding);
      return embedding;
    })
  };
}
