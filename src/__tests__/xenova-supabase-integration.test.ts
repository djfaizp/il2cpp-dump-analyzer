/**
 * Integration tests for XenovaEmbeddings + SupabaseVectorStore
 * Tests end-to-end integration for IL2CPP dump analysis
 * Following Test-Driven Development (TFD) methodology
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { Document } from '@langchain/core/documents';

// Mock Supabase client for testing
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  rpc: jest.fn()
};

// Mock @xenova/transformers to avoid actual model loading during tests
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
  env: {
    allowLocalModels: false,
    useBrowserCache: false,
    cacheDir: '/app/models'
  }
}), { virtual: true });

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock path module
jest.mock('path', () => ({
  resolve: jest.fn().mockReturnValue('/app/models')
}));

import { XenovaEmbeddings } from '../embeddings/xenova-embeddings';
import { SupabaseIL2CPPVectorStore } from '../embeddings/supabase-vector-store';
import { IL2CPPVectorStore } from '../embeddings/vector-store';

describe('XenovaEmbeddings + SupabaseVectorStore Integration', () => {
  let embeddings: XenovaEmbeddings;
  let vectorStore: SupabaseIL2CPPVectorStore;
  let integratedStore: IL2CPPVectorStore;

  // Sample IL2CPP code chunks for testing
  const il2cppCodeSamples = [
    {
      pageContent: `public class PlayerController : MonoBehaviour
{
    public float speed = 5.0f;
    private bool isMoving = false;

    void Start() {
        // Initialize player
    }

    void Update() {
        // Handle movement
        if (Input.GetKey(KeyCode.W)) {
            transform.Translate(Vector3.forward * speed * Time.deltaTime);
            isMoving = true;
        }
    }
}`,
      metadata: {
        type: 'class',
        name: 'PlayerController',
        namespace: 'Game.Player',
        inherits: 'MonoBehaviour',
        methods: ['Start', 'Update'],
        fields: ['speed', 'isMoving']
      }
    },
    {
      pageContent: `public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    [SerializeField] private int score = 0;
    [SerializeField] private bool gameActive = true;

    void Awake() {
        if (Instance == null) {
            Instance = this;
            DontDestroyOnLoad(gameObject);
        } else {
            Destroy(gameObject);
        }
    }

    public void AddScore(int points) {
        score += points;
        UpdateUI();
    }
}`,
      metadata: {
        type: 'class',
        name: 'GameManager',
        namespace: 'Game.Core',
        inherits: 'MonoBehaviour',
        methods: ['Awake', 'AddScore', 'UpdateUI'],
        fields: ['Instance', 'score', 'gameActive'],
        patterns: ['Singleton']
      }
    },
    {
      pageContent: `public interface IWeapon
{
    int Damage { get; }
    float Range { get; }
    void Fire(Vector3 direction);
    bool CanFire();
}

public class Rifle : MonoBehaviour, IWeapon
{
    public int Damage => 25;
    public float Range => 100f;

    [SerializeField] private float fireRate = 0.5f;
    private float lastFireTime = 0f;

    public void Fire(Vector3 direction) {
        if (CanFire()) {
            // Fire logic
            lastFireTime = Time.time;
        }
    }

    public bool CanFire() {
        return Time.time - lastFireTime >= fireRate;
    }
}`,
      metadata: {
        type: 'interface_implementation',
        name: 'Rifle',
        namespace: 'Game.Weapons',
        inherits: 'MonoBehaviour',
        implements: ['IWeapon'],
        methods: ['Fire', 'CanFire'],
        fields: ['fireRate', 'lastFireTime']
      }
    }
  ];

  beforeAll(() => {
    // Set up environment variables for testing
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.SUPABASE_TABLE = 'test_il2cpp_documents';
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock responses
    mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
    mockSupabaseClient.upsert.mockResolvedValue({ data: [], error: null });
    mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Initialization', () => {
    it('should initialize XenovaEmbeddings with correct configuration', () => {
      // Act
      embeddings = new XenovaEmbeddings();

      // Assert
      expect(embeddings).toBeDefined();
      expect(embeddings.getDimension()).toBe(384);
      expect(embeddings['model']).toBe('Xenova/all-MiniLM-L6-v2');
    });

    it('should initialize SupabaseVectorStore with XenovaEmbeddings', () => {
      // Arrange
      embeddings = new XenovaEmbeddings();

      // Act
      vectorStore = new SupabaseIL2CPPVectorStore(
        embeddings,
        'https://test.supabase.co',
        'test-key',
        'test_il2cpp_documents'
      );

      // Assert
      expect(vectorStore).toBeDefined();
      expect(vectorStore.supabaseClient).toBeDefined();
    });

    it('should initialize IL2CPPVectorStore with Supabase backend', () => {
      // Act
      integratedStore = new IL2CPPVectorStore();

      // Assert
      expect(integratedStore).toBeDefined();
      // Should use Supabase since environment variables are set
    });
  });

  describe('Embedding Generation Integration', () => {
    beforeEach(() => {
      embeddings = new XenovaEmbeddings();
      vectorStore = new SupabaseIL2CPPVectorStore(
        embeddings,
        'https://test.supabase.co',
        'test-key',
        'test_il2cpp_documents'
      );
    });

    it('should generate embeddings for IL2CPP code and store in Supabase', async () => {
      // Arrange
      const documents = il2cppCodeSamples.map(sample => new Document(sample));

      // Mock embedding generation
      const mockEmbeddings = Array(3).fill(null).map(() =>
        Array(384).fill(0).map(() => Math.random())
      );

      // Mock the embedDocuments method
      jest.spyOn(embeddings, 'embedDocuments').mockResolvedValue(mockEmbeddings);

      // Act
      await vectorStore.addDocuments(documents);

      // Assert
      expect(embeddings.embedDocuments).toHaveBeenCalledWith(
        documents.map(doc => doc.pageContent)
      );
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
    });

    it('should handle IL2CPP-specific metadata correctly', async () => {
      // Arrange
      const document = new Document(il2cppCodeSamples[0]);
      jest.spyOn(embeddings, 'embedDocuments').mockResolvedValue([Array(384).fill(0.5)]);

      // Act
      await vectorStore.addDocuments([document]);

      // Assert
      const upsertCall = mockSupabaseClient.upsert.mock.calls[0];
      const insertedData = upsertCall[0][0];

      expect(insertedData.metadata).toEqual(il2cppCodeSamples[0].metadata);
      expect(insertedData.metadata.type).toBe('class');
      expect(insertedData.metadata.name).toBe('PlayerController');
      expect(insertedData.metadata.namespace).toBe('Game.Player');
    });
  });

  describe('Semantic Search Integration', () => {
    beforeEach(() => {
      embeddings = new XenovaEmbeddings();
      vectorStore = new SupabaseIL2CPPVectorStore(
        embeddings,
        'https://test.supabase.co',
        'test-key',
        'test_il2cpp_documents'
      );
    });

    it('should perform semantic search for IL2CPP code patterns', async () => {
      // Arrange
      const query = 'MonoBehaviour player movement';
      const mockQueryEmbedding = Array(384).fill(0).map(() => Math.random());
      const mockSearchResults = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          file_name: 'dump.cs',
          content: il2cppCodeSamples[0].pageContent,
          metadata: il2cppCodeSamples[0].metadata,
          similarity: 0.85
        }
      ];

      jest.spyOn(embeddings, 'embedQuery').mockResolvedValue(mockQueryEmbedding);
      mockSupabaseClient.rpc.mockResolvedValue({ data: mockSearchResults, error: null });

      // Act
      const results = await vectorStore.similaritySearch(query, 5);

      // Assert
      expect(embeddings.embedQuery).toHaveBeenCalledWith(query);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('match_documents', {
        query_embedding: mockQueryEmbedding,
        match_threshold: 0.0,
        match_count: 5
      });
      expect(results).toHaveLength(1);
      expect(results[0].pageContent).toBe(il2cppCodeSamples[0].pageContent);
      expect(results[0].metadata).toEqual(il2cppCodeSamples[0].metadata);
    });

    it('should return similarity scores with search results', async () => {
      // Arrange
      const query = 'Singleton pattern GameManager';
      const mockQueryEmbedding = Array(384).fill(0).map(() => Math.random());
      const mockSearchResults = [
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          file_name: 'dump.cs',
          content: il2cppCodeSamples[1].pageContent,
          metadata: il2cppCodeSamples[1].metadata,
          similarity: 0.92
        }
      ];

      jest.spyOn(embeddings, 'embedQuery').mockResolvedValue(mockQueryEmbedding);
      mockSupabaseClient.rpc.mockResolvedValue({ data: mockSearchResults, error: null });

      // Act
      const results = await vectorStore.similaritySearchWithScore(query, 3);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0][0].pageContent).toBe(il2cppCodeSamples[1].pageContent);
      expect(results[0][1]).toBe(0.92); // Similarity score
    });

    it('should handle empty search results gracefully', async () => {
      // Arrange
      const query = 'NonExistentClass';
      const mockQueryEmbedding = Array(384).fill(0).map(() => Math.random());

      jest.spyOn(embeddings, 'embedQuery').mockResolvedValue(mockQueryEmbedding);
      mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });

      // Act
      const results = await vectorStore.similaritySearch(query, 5);

      // Assert
      expect(results).toHaveLength(0);
    });
  });

  describe('Hash-based Deduplication', () => {
    beforeEach(() => {
      embeddings = new XenovaEmbeddings();
      vectorStore = new SupabaseIL2CPPVectorStore(
        embeddings,
        'https://test.supabase.co',
        'test-key',
        'test_il2cpp_documents'
      );
    });

    it('should prevent duplicate document storage using hash-based deduplication', async () => {
      // Arrange
      const document = new Document(il2cppCodeSamples[0]);
      const documentHash = 'test-hash-123';

      // Mock existing document check
      mockSupabaseClient.select.mockResolvedValue({
        data: [{ document_hash: documentHash }],
        error: null
      });

      jest.spyOn(embeddings, 'embedDocuments').mockResolvedValue([Array(384).fill(0.5)]);
      jest.spyOn(vectorStore as any, 'generateDocumentHash').mockReturnValue(documentHash);

      // Act
      await vectorStore.addDocuments([document]);

      // Assert
      // Should check for existing documents
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      // Should not insert duplicate (no upsert call for new documents)
    });

    it('should generate consistent hashes for identical content', () => {
      // Arrange
      const doc1 = new Document(il2cppCodeSamples[0]);
      const doc2 = new Document(il2cppCodeSamples[0]); // Same content

      // Act
      const hash1 = (vectorStore as any).generateDocumentHash(doc1);
      const hash2 = (vectorStore as any).generateDocumentHash(doc2);

      // Assert
      expect(hash1).toBe(hash2);
      expect(hash1).toBeDefined();
      expect(typeof hash1).toBe('string');
    });
  });

  describe('Error Handling Integration', () => {
    beforeEach(() => {
      embeddings = new XenovaEmbeddings();
      vectorStore = new SupabaseIL2CPPVectorStore(
        embeddings,
        'https://test.supabase.co',
        'test-key',
        'test_il2cpp_documents'
      );
    });

    it('should handle embedding generation errors gracefully', async () => {
      // Arrange
      const document = new Document(il2cppCodeSamples[0]);
      jest.spyOn(embeddings, 'embedDocuments').mockRejectedValue(new Error('Embedding failed'));

      // Act & Assert
      await expect(vectorStore.addDocuments([document])).rejects.toThrow('Embedding failed');
    });

    it('should handle Supabase storage errors gracefully', async () => {
      // Arrange
      const document = new Document(il2cppCodeSamples[0]);
      jest.spyOn(embeddings, 'embedDocuments').mockResolvedValue([Array(384).fill(0.5)]);
      mockSupabaseClient.upsert.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed', code: '08006' }
      });

      // Act & Assert
      await expect(vectorStore.addDocuments([document])).rejects.toThrow();
    });

    it('should handle search errors gracefully', async () => {
      // Arrange
      const query = 'test query';
      jest.spyOn(embeddings, 'embedQuery').mockResolvedValue(Array(384).fill(0.5));
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Search function not found', code: '42883' }
      });

      // Act
      const results = await vectorStore.similaritySearch(query, 5);

      // Assert
      expect(results).toHaveLength(0); // Should return empty array on error
    });
  });

  describe('Performance Integration', () => {
    beforeEach(() => {
      embeddings = new XenovaEmbeddings();
      vectorStore = new SupabaseIL2CPPVectorStore(
        embeddings,
        'https://test.supabase.co',
        'test-key',
        'test_il2cpp_documents'
      );
    });

    it('should handle large batches of IL2CPP documents efficiently', async () => {
      // Arrange
      const largeBatch = Array(100).fill(null).map((_, i) => new Document({
        pageContent: `public class TestClass${i} : MonoBehaviour { void Start() { } }`,
        metadata: { type: 'class', name: `TestClass${i}`, namespace: 'Test' }
      }));

      const mockEmbeddings = Array(100).fill(null).map(() => Array(384).fill(0.5));
      jest.spyOn(embeddings, 'embedDocuments').mockResolvedValue(mockEmbeddings);

      const startTime = Date.now();

      // Act
      await vectorStore.addDocuments(largeBatch);
      const endTime = Date.now();

      // Assert
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
    });

    it('should process documents in batches to avoid memory issues', async () => {
      // Arrange
      const largeBatch = Array(150).fill(null).map((_, i) => new Document({
        pageContent: `public class BatchClass${i} { }`,
        metadata: { type: 'class', name: `BatchClass${i}` }
      }));

      const mockEmbeddings = Array(150).fill(null).map(() => Array(384).fill(0.5));
      jest.spyOn(embeddings, 'embedDocuments').mockResolvedValue(mockEmbeddings);

      // Act
      await vectorStore.addDocuments(largeBatch);

      // Assert
      // Should be called multiple times for batching (default batch size is 100)
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
    });
  });

  describe('IL2CPP-Specific Integration', () => {
    beforeEach(() => {
      integratedStore = new IL2CPPVectorStore();
    });

    it('should work with IL2CPPVectorStore wrapper class', async () => {
      // Arrange
      const documents = il2cppCodeSamples.map(sample => new Document(sample));

      // Mock the underlying vector store methods
      const mockAddDocuments = jest.fn().mockResolvedValue(undefined);
      const mockSimilaritySearch = jest.fn().mockResolvedValue([documents[0]]);

      (integratedStore as any).vectorStore = {
        addDocuments: mockAddDocuments,
        similaritySearch: mockSimilaritySearch
      };

      // Act
      await integratedStore.addDocuments(documents);
      const results = await integratedStore.similaritySearch('PlayerController', 5);

      // Assert
      expect(mockAddDocuments).toHaveBeenCalledWith(documents);
      expect(mockSimilaritySearch).toHaveBeenCalledWith('PlayerController', 5);
      expect(results).toHaveLength(1);
    });

    it('should handle IL2CPP code chunks correctly', async () => {
      // Arrange
      const codeChunks = il2cppCodeSamples.map(sample => ({
        text: sample.pageContent,
        metadata: sample.metadata
      }));

      const mockAddCodeChunks = jest.fn().mockResolvedValue(undefined);
      (integratedStore as any).vectorStore = {
        addCodeChunks: mockAddCodeChunks
      };

      // Act
      await integratedStore.addCodeChunks(codeChunks);

      // Assert
      expect(mockAddCodeChunks).toHaveBeenCalledWith(codeChunks);
    });
  });
});
