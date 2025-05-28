import { Document } from '@langchain/core/documents';
import { SupabaseIL2CPPVectorStore } from '../embeddings/supabase-vector-store';
import { IL2CPPVectorStore } from '../embeddings/vector-store';
import { XenovaEmbeddings } from '../embeddings/xenova-embeddings';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  rpc: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
};

// Mock XenovaEmbeddings
const mockEmbeddings = {
  embedDocuments: jest.fn(),
  embedQuery: jest.fn(),
  initialize: jest.fn(),
};

describe('Enhanced Vector Store Batch Processing', () => {
  let vectorStore: SupabaseIL2CPPVectorStore;
  let il2cppVectorStore: IL2CPPVectorStore;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create vector store with mocked dependencies
    vectorStore = new SupabaseIL2CPPVectorStore(
      mockEmbeddings as any,
      'https://test.supabase.co',
      'test-key',
      'test_table'
    );
    
    // Replace the Supabase client with our mock
    (vectorStore as any).supabaseClient = mockSupabaseClient;

    // Create IL2CPP vector store
    il2cppVectorStore = new IL2CPPVectorStore();
    (il2cppVectorStore as any).vectorStore = vectorStore;
    (il2cppVectorStore as any).useSupabase = true;
  });

  describe('Batch Size Optimization', () => {
    it('should calculate optimal batch size for small datasets', () => {
      const batchSize = (vectorStore as any).calculateOptimalBatchSize(500);
      expect(batchSize).toBe(50);
    });

    it('should calculate optimal batch size for medium datasets', () => {
      const batchSize = (vectorStore as any).calculateOptimalBatchSize(5000);
      expect(batchSize).toBe(100);
    });

    it('should calculate optimal batch size for large datasets', () => {
      const batchSize = (vectorStore as any).calculateOptimalBatchSize(50000);
      expect(batchSize).toBe(200);
    });

    it('should calculate optimal batch size for massive datasets (300k+ chunks)', () => {
      const batchSize = (vectorStore as any).calculateOptimalBatchSize(300000);
      expect(batchSize).toBe(300);
    });
  });

  describe('Progress Reporting', () => {
    it('should report progress during document addition', async () => {
      // Arrange
      const documents = Array(100).fill(null).map((_, i) => new Document({
        pageContent: `Test document ${i}`,
        metadata: { id: i, type: 'test' }
      }));

      const progressUpdates: Array<{ progress: number; message: string }> = [];
      const progressCallback = (progress: number, message: string) => {
        progressUpdates.push({ progress, message });
      };

      // Mock successful operations
      mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
      mockEmbeddings.embedDocuments.mockResolvedValue(
        Array(100).fill(null).map(() => Array(384).fill(0.5))
      );
      mockSupabaseClient.upsert.mockResolvedValue({ error: null });

      // Act
      await vectorStore.addDocuments(documents, progressCallback);

      // Assert
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0].progress).toBe(10);
      expect(progressUpdates[0].message).toContain('Generating embeddings');
      expect(progressUpdates[progressUpdates.length - 1].progress).toBe(100);
      expect(progressUpdates[progressUpdates.length - 1].message).toContain('Successfully inserted');
    });

    it('should report progress through IL2CPP vector store', async () => {
      // Arrange
      const chunks = Array(50).fill(null).map((_, i) => ({
        text: `Test chunk ${i}`,
        metadata: { id: i, type: 'class' }
      }));

      const progressUpdates: Array<{ progress: number; message: string }> = [];
      const progressCallback = (progress: number, message: string) => {
        progressUpdates.push({ progress, message });
      };

      // Mock successful operations
      mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
      mockEmbeddings.embedDocuments.mockResolvedValue(
        Array(50).fill(null).map(() => Array(384).fill(0.5))
      );
      mockSupabaseClient.upsert.mockResolvedValue({ error: null });

      // Act
      await il2cppVectorStore.addCodeChunks(chunks, progressCallback);

      // Assert
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates.some(update => update.message.includes('Generating embeddings'))).toBe(true);
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should retry failed batch operations', async () => {
      // Arrange
      const documents = [new Document({
        pageContent: 'Test document',
        metadata: { id: 1, type: 'test' }
      })];

      mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
      mockEmbeddings.embedDocuments.mockResolvedValue([Array(384).fill(0.5)]);
      
      // Mock first call to fail, second to succeed
      mockSupabaseClient.upsert
        .mockResolvedValueOnce({ error: { code: 'NETWORK_ERROR', message: 'Network timeout' } })
        .mockResolvedValueOnce({ error: null });

      // Act & Assert
      await expect(vectorStore.addDocuments(documents)).resolves.not.toThrow();
      expect(mockSupabaseClient.upsert).toHaveBeenCalledTimes(2);
    });

    it('should handle timeout errors with retry', async () => {
      // Arrange
      const documents = [new Document({
        pageContent: 'Test document',
        metadata: { id: 1, type: 'test' }
      })];

      mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
      mockEmbeddings.embedDocuments.mockResolvedValue([Array(384).fill(0.5)]);
      
      // Mock timeout scenario
      mockSupabaseClient.upsert.mockImplementation(() => 
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100))
      );

      // Act & Assert
      await expect(vectorStore.addDocuments(documents)).rejects.toThrow();
    });

    it('should handle duplicate key violations gracefully', async () => {
      // Arrange
      const documents = [new Document({
        pageContent: 'Test document',
        metadata: { id: 1, type: 'test' }
      })];

      mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
      mockEmbeddings.embedDocuments.mockResolvedValue([Array(384).fill(0.5)]);
      mockSupabaseClient.upsert.mockResolvedValue({ 
        error: { code: '23505', message: 'duplicate key value violates unique constraint' } 
      });

      // Act & Assert
      await expect(vectorStore.addDocuments(documents)).resolves.not.toThrow();
    });
  });

  describe('Large Dataset Processing', () => {
    it('should handle large datasets efficiently', async () => {
      // Arrange - Simulate 1000 documents (smaller than real 300k for test performance)
      const documents = Array(1000).fill(null).map((_, i) => new Document({
        pageContent: `Large dataset document ${i}`,
        metadata: { id: i, type: 'class', namespace: `Namespace${Math.floor(i / 100)}` }
      }));

      const progressUpdates: Array<{ progress: number; message: string }> = [];
      const progressCallback = (progress: number, message: string) => {
        progressUpdates.push({ progress, message });
      };

      // Mock successful operations
      mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
      mockEmbeddings.embedDocuments.mockResolvedValue(
        Array(1000).fill(null).map(() => Array(384).fill(0.5))
      );
      mockSupabaseClient.upsert.mockResolvedValue({ error: null });

      // Act
      const startTime = Date.now();
      await vectorStore.addDocuments(documents, progressCallback);
      const endTime = Date.now();

      // Assert
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(progressUpdates.length).toBeGreaterThan(5); // Should have multiple progress updates
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
      
      // Verify batch size optimization was used
      const batchSize = (vectorStore as any).calculateOptimalBatchSize(1000);
      expect(batchSize).toBe(100); // Should use medium batch size for 1000 documents
    });

    it('should use appropriate batch size for massive datasets', () => {
      // Test the batch size calculation for 306,846 chunks (real scenario)
      const batchSize = (vectorStore as any).calculateOptimalBatchSize(306846);
      expect(batchSize).toBe(300); // Should use largest batch size
      
      // Calculate expected number of batches
      const expectedBatches = Math.ceil(306846 / 300);
      expect(expectedBatches).toBe(1023); // Much better than 15,342 batches with size 20
    });
  });

  describe('Error Recovery', () => {
    it('should report errors through progress callback', async () => {
      // Arrange
      const documents = [new Document({
        pageContent: 'Test document',
        metadata: { id: 1, type: 'test' }
      })];

      let errorReported = false;
      const progressCallback = (progress: number, message: string) => {
        if (progress === -1) {
          errorReported = true;
          expect(message).toContain('Error during insertion');
        }
      };

      mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
      mockEmbeddings.embedDocuments.mockRejectedValue(new Error('Embedding generation failed'));

      // Act & Assert
      await expect(vectorStore.addDocuments(documents, progressCallback)).rejects.toThrow();
      expect(errorReported).toBe(true);
    });
  });
});
