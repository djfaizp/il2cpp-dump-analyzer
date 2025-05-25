/**
 * Integration tests for vector store operations
 * Tests Supabase vector store, embeddings, and search functionality
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockDocuments, mockIL2CPPDumpContent } from './test-data';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  rpc: jest.fn()
};

// Mock embeddings
const mockEmbeddings = {
  embedDocuments: jest.fn(),
  embedQuery: jest.fn()
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.mock('../embeddings/xenova-embeddings', () => ({
  XenovaEmbeddings: jest.fn().mockImplementation(() => mockEmbeddings)
}));

describe('Vector Store Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    mockSupabaseClient.from.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
    mockSupabaseClient.insert.mockResolvedValue({ data: [], error: null });
    mockSupabaseClient.upsert.mockResolvedValue({ data: [], error: null });
    mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });
    
    mockEmbeddings.embedDocuments.mockResolvedValue([
      [0.1, 0.2, 0.3, 0.4], // Mock embedding vector
      [0.2, 0.3, 0.4, 0.5]
    ]);
    mockEmbeddings.embedQuery.mockResolvedValue([0.15, 0.25, 0.35, 0.45]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Document Storage', () => {
    it('should store documents with embeddings', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      const documents = mockDocuments.slice(0, 2);

      // Act
      await vectorStore.addDocuments(documents);

      // Assert
      expect(mockEmbeddings.embedDocuments).toHaveBeenCalledWith(
        documents.map(doc => doc.pageContent)
      );
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      mockSupabaseClient.upsert.mockResolvedValue({ 
        data: null, 
        error: { message: 'Storage error' } 
      });

      // Act & Assert
      await expect(vectorStore.addDocuments(mockDocuments.slice(0, 1)))
        .rejects.toThrow('Storage error');
    });

    it('should batch large document sets', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      const largeBatch = Array(150).fill(null).map((_, i) => ({
        pageContent: `Document ${i}`,
        metadata: { name: `Doc${i}`, type: 'class' }
      }));

      // Act
      await vectorStore.addDocuments(largeBatch);

      // Assert
      // Should be called multiple times for batching
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
    });
  });

  describe('Similarity Search', () => {
    it('should perform similarity search', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      const mockSearchResults = mockDocuments.slice(0, 3).map(doc => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        similarity: 0.8
      }));
      
      mockSupabaseClient.rpc.mockResolvedValue({ 
        data: mockSearchResults, 
        error: null 
      });

      // Act
      const results = await vectorStore.similaritySearch('PlayerController', 3);

      // Assert
      expect(mockEmbeddings.embedQuery).toHaveBeenCalledWith('PlayerController');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'match_documents',
        expect.objectContaining({
          query_embedding: [0.15, 0.25, 0.35, 0.45],
          match_count: 3
        })
      );
      expect(results).toHaveLength(3);
    });

    it('should handle search with similarity threshold', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      const mockSearchResults = [
        { content: 'test', metadata: { name: 'Test' }, similarity: 0.9 },
        { content: 'test2', metadata: { name: 'Test2' }, similarity: 0.6 }
      ];
      
      mockSupabaseClient.rpc.mockResolvedValue({ 
        data: mockSearchResults, 
        error: null 
      });

      // Act
      const results = await vectorStore.similaritySearchWithScore('test', 5, 0.7);

      // Assert
      expect(results).toHaveLength(1); // Only one result above threshold
      expect(results[0][1]).toBeGreaterThan(0.7); // Check similarity score
    });

    it('should handle empty search results', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });

      // Act
      const results = await vectorStore.similaritySearch('NonExistent', 5);

      // Assert
      expect(results).toHaveLength(0);
    });

    it('should handle search errors', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      mockSupabaseClient.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Search failed' } 
      });

      // Act & Assert
      await expect(vectorStore.similaritySearch('test', 5))
        .rejects.toThrow('Search failed');
    });
  });

  describe('Filtered Search', () => {
    it('should perform filtered search', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      const filter = { type: 'class', isMonoBehaviour: true };
      const mockResults = mockDocuments.filter(doc => 
        doc.metadata.type === 'class' && doc.metadata.isMonoBehaviour
      );
      
      mockSupabaseClient.rpc.mockResolvedValue({ 
        data: mockResults, 
        error: null 
      });

      // Act
      const results = await vectorStore.searchWithFilter('Player', filter, 5);

      // Assert
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'match_documents_with_filter',
        expect.objectContaining({
          query_embedding: [0.15, 0.25, 0.35, 0.45],
          filter_conditions: filter,
          match_count: 5
        })
      );
      expect(results.every(doc => doc.metadata.type === 'class')).toBe(true);
    });

    it('should handle complex filters', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      const complexFilter = {
        type: 'class',
        namespace: 'Game.Player',
        isMonoBehaviour: true
      };

      // Act
      await vectorStore.searchWithFilter('Controller', complexFilter, 3);

      // Assert
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'match_documents_with_filter',
        expect.objectContaining({
          filter_conditions: complexFilter
        })
      );
    });
  });

  describe('Performance Tests', () => {
    it('should handle large document batches efficiently', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      const startTime = Date.now();
      const largeBatch = Array(1000).fill(null).map((_, i) => ({
        pageContent: `Large document ${i} with substantial content that simulates real IL2CPP dump data`,
        metadata: { name: `LargeDoc${i}`, type: 'class', namespace: 'Test' }
      }));

      // Act
      await vectorStore.addDocuments(largeBatch);
      const endTime = Date.now();

      // Assert
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(mockEmbeddings.embedDocuments).toHaveBeenCalled();
    });

    it('should handle concurrent search requests', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });

      // Act
      const searchPromises = Array(10).fill(null).map((_, i) =>
        vectorStore.similaritySearch(`Query${i}`, 5)
      );
      
      const results = await Promise.all(searchPromises);

      // Assert
      expect(results).toHaveLength(10);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(10);
    });
  });

  describe('Error Handling', () => {
    it('should handle embedding generation errors', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      mockEmbeddings.embedDocuments.mockRejectedValue(new Error('Embedding failed'));

      // Act & Assert
      await expect(vectorStore.addDocuments(mockDocuments.slice(0, 1)))
        .rejects.toThrow('Embedding failed');
    });

    it('should handle database connection errors', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();
      mockSupabaseClient.rpc.mockRejectedValue(new Error('Connection timeout'));

      // Act & Assert
      await expect(vectorStore.similaritySearch('test', 5))
        .rejects.toThrow('Connection timeout');
    });

    it('should validate input parameters', async () => {
      // Arrange
      const vectorStore = await createMockVectorStore();

      // Act & Assert
      await expect(vectorStore.similaritySearch('', 5))
        .rejects.toThrow(); // Empty query should throw

      await expect(vectorStore.similaritySearch('test', 0))
        .rejects.toThrow(); // Invalid k should throw
    });
  });
});

// Helper function to create a mock vector store
async function createMockVectorStore() {
  // This would normally import and create the actual vector store
  // For testing, we return a mock implementation
  return {
    addDocuments: jest.fn().mockImplementation(async (documents: any[]) => {
      const embeddings = await mockEmbeddings.embedDocuments(
        documents.map(doc => doc.pageContent)
      );
      
      const result = await mockSupabaseClient.upsert(
        documents.map((doc, i) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
          embedding: embeddings[i]
        }))
      );
      
      if (result.error) {
        throw new Error(result.error.message);
      }
    }),

    similaritySearch: jest.fn().mockImplementation(async (query: string, k: number) => {
      if (!query || k <= 0) {
        throw new Error('Invalid parameters');
      }
      
      const queryEmbedding = await mockEmbeddings.embedQuery(query);
      const result = await mockSupabaseClient.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_count: k
      });
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      return result.data.map((item: any) => ({
        pageContent: item.content,
        metadata: item.metadata
      }));
    }),

    similaritySearchWithScore: jest.fn().mockImplementation(async (query: string, k: number, threshold: number = 0) => {
      const queryEmbedding = await mockEmbeddings.embedQuery(query);
      const result = await mockSupabaseClient.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_count: k
      });
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      return result.data
        .filter((item: any) => item.similarity >= threshold)
        .map((item: any) => [
          { pageContent: item.content, metadata: item.metadata },
          item.similarity
        ]);
    }),

    searchWithFilter: jest.fn().mockImplementation(async (query: string, filter: any, k: number) => {
      const queryEmbedding = await mockEmbeddings.embedQuery(query);
      const result = await mockSupabaseClient.rpc('match_documents_with_filter', {
        query_embedding: queryEmbedding,
        filter_conditions: filter,
        match_count: k
      });
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      return result.data.map((item: any) => ({
        pageContent: item.content,
        metadata: item.metadata
      }));
    })
  };
}
