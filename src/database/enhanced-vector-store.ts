import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { SupabaseClient } from '@supabase/supabase-js';
import { CodeChunk } from '../embeddings/chunker';
import { SupabaseConnectionManager } from './connection-manager';
import { RetryManager, CircuitBreaker } from './retry-manager';
import { DatabasePerformanceMonitor, measurePerformance } from './performance-monitor';
import crypto from 'crypto';

/**
 * Enhanced search options
 */
export interface EnhancedSearchOptions {
  /** Number of results to return */
  k?: number;
  /** Minimum similarity threshold */
  threshold?: number;
  /** Metadata filters */
  filters?: Record<string, any>;
  /** Enable hybrid search (vector + text) */
  hybridSearch?: boolean;
  /** Text search weight (for hybrid search) */
  textWeight?: number;
  /** Vector search weight (for hybrid search) */
  vectorWeight?: number;
  /** Cache results */
  useCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

/**
 * Search result with enhanced metadata
 */
export interface EnhancedSearchResult {
  document: Document;
  similarity: number;
  textScore?: number;
  combinedScore?: number;
  cached: boolean;
}

/**
 * Enhanced Supabase vector store with performance optimizations,
 * connection pooling, retry logic, and advanced search capabilities
 */
export class EnhancedSupabaseVectorStore {
  private connectionManager: SupabaseConnectionManager;
  private retryManager: RetryManager;
  private circuitBreaker: CircuitBreaker;
  private performanceMonitor: DatabasePerformanceMonitor;
  private dimensions: number;
  private isInitialized: boolean = false;

  constructor(
    private embeddings: Embeddings,
    private tableName: string = 'il2cpp_documents'
  ) {
    // Initialize connection manager
    this.connectionManager = SupabaseConnectionManager.getInstance();

    // Initialize retry manager for database operations
    this.retryManager = RetryManager.forDatabase({
      maxAttempts: 3,
      initialDelayMs: 500,
      maxDelayMs: 5000
    });

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(5, 60000);

    // Initialize performance monitor
    this.performanceMonitor = new DatabasePerformanceMonitor();

    // Get embedding dimensions
    this.dimensions = (embeddings as any).getDimension?.() || 384;

    console.log(`Enhanced Supabase vector store initialized with ${this.dimensions} dimensions`);
  }

  /**
   * Initialize the vector store
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.retryManager.execute(async () => {
      const client = this.connectionManager.getClient();

      // Verify table exists and is accessible
      const { error } = await client
        .from(this.tableName)
        .select('id')
        .limit(1);

      if (error && error.code === '42P01') {
        throw new Error(`Table ${this.tableName} does not exist. Please run the setup SQL commands.`);
      }

      this.isInitialized = true;
    }, 'vector_store_initialization');
  }

  /**
   * Add documents to the vector store with enhanced error handling
   */
  async addDocuments(documents: Document[]): Promise<void> {
    await this.initialize();

    if (documents.length === 0) return;

    return this.circuitBreaker.execute(async () => {
      return this.retryManager.execute(async () => {
        const client = this.connectionManager.getClient();

        // Generate embeddings for all documents
        const embeddings = await this.embeddings.embedDocuments(
          documents.map(doc => doc.pageContent)
        );

        // Process in batches to avoid memory issues
        const batchSize = 50;
        const totalBatches = Math.ceil(documents.length / batchSize);

        for (let i = 0; i < documents.length; i += batchSize) {
          const batch = documents.slice(i, i + batchSize);
          const batchEmbeddings = embeddings.slice(i, i + batchSize);
          const batchNumber = Math.floor(i / batchSize) + 1;

          // Prepare batch data with document hashes for deduplication
          const batchData = batch.map((doc, idx) => ({
            content: doc.pageContent,
            metadata: doc.metadata,
            embedding: batchEmbeddings[idx],
            document_hash: this.generateDocumentHash(doc)
          }));

          // Insert with conflict resolution
          const { error } = await client
            .from(this.tableName)
            .upsert(batchData, {
              onConflict: 'document_hash',
              ignoreDuplicates: true
            });

          if (error) {
            console.error(`Batch ${batchNumber}/${totalBatches} failed:`, error);
            throw error;
          }

          console.log(`Batch ${batchNumber}/${totalBatches}: Added ${batch.length} documents`);
        }

        // Clear related cache entries
        (this.performanceMonitor as any).clearCache('search_*');

        this.connectionManager.releaseClient();
      }, 'add_documents_batch');
    });
  }

  /**
   * Enhanced similarity search with caching and performance monitoring
   */
  async similaritySearch(
    query: string,
    options: EnhancedSearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    await this.initialize();

    const {
      k = 5,
      threshold = 0.0,
      filters = {},
      hybridSearch = false,
      textWeight = 0.3,
      vectorWeight = 0.7,
      useCache = true,
      cacheTtlMs = 300000 // 5 minutes
    } = options;

    // Generate cache key
    const cacheKey = this.generateCacheKey('search', query, options);

    // Try cache first if enabled
    if (useCache) {
      const cached = (this.performanceMonitor as any).getCached(cacheKey) as EnhancedSearchResult[] | null;
      if (cached) {
        return cached.map((result: EnhancedSearchResult) => ({ ...result, cached: true }));
      }
    }

    return this.circuitBreaker.execute(async () => {
      return this.retryManager.execute(async () => {
        const client = this.connectionManager.getClient();

        // Generate query embedding
        const queryEmbedding = await this.embeddings.embedQuery(query);

        let results: any[];

        if (hybridSearch) {
          // Use hybrid search function
          const { data, error } = await client.rpc('hybrid_search', {
            query_text: query,
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: k,
            text_weight: textWeight,
            vector_weight: vectorWeight
          });

          if (error) throw error;
          results = data || [];
        } else if (Object.keys(filters).length > 0) {
          // Use filtered search function
          const { data, error } = await client.rpc('match_documents_filtered', {
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: k,
            filter_metadata: filters
          });

          if (error) throw error;
          results = data || [];
        } else {
          // Use standard search function
          const { data, error } = await client.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: k
          });

          if (error) throw error;
          results = data || [];
        }

        // Convert to enhanced search results
        const enhancedResults: EnhancedSearchResult[] = results.map(row => ({
          document: new Document({
            pageContent: row.content,
            metadata: row.metadata
          }),
          similarity: row.similarity || row.vector_score,
          textScore: row.text_score,
          combinedScore: row.combined_score,
          cached: false
        }));

        // Cache results if enabled
        if (useCache) {
          (this.performanceMonitor as any).cache(cacheKey, enhancedResults, cacheTtlMs);
        }

        this.connectionManager.releaseClient();
        return enhancedResults;
      }, 'similarity_search_query');
    });
  }

  /**
   * Add code chunks with metadata enhancement
   */
  async addCodeChunks(chunks: CodeChunk[]): Promise<void> {
    const documents = chunks.map(chunk => new Document({
      pageContent: chunk.text,
      metadata: {
        ...chunk.metadata,
        chunk_type: 'il2cpp_code',
        added_at: new Date().toISOString()
      }
    }));

    await this.addDocuments(documents);
  }

  /**
   * Get database statistics and health information
   */
  async getHealthStatus(): Promise<{
    isHealthy: boolean;
    connectionStats: any;
    performanceStats: any;
    cacheStats: any;
    circuitBreakerStats: any;
  }> {
    const connectionHealth = this.connectionManager.getHealthStatus();
    const performanceStats = this.performanceMonitor.getStats();
    const cacheStats = this.performanceMonitor.getCacheStats();
    const circuitBreakerStats = this.circuitBreaker.getStats();

    return {
      isHealthy: connectionHealth.isHealthy && this.circuitBreaker.getState() !== 'OPEN',
      connectionStats: connectionHealth,
      performanceStats,
      cacheStats,
      circuitBreakerStats
    };
  }

  /**
   * Generate document hash for deduplication
   */
  private generateDocumentHash(document: Document): string {
    const content = document.pageContent + JSON.stringify(document.metadata);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate cache key for search operations
   */
  private generateCacheKey(operation: string, query: string, options: any): string {
    const optionsHash = crypto.createHash('md5')
      .update(JSON.stringify(options))
      .digest('hex');
    return `${operation}_${crypto.createHash('md5').update(query).digest('hex')}_${optionsHash}`;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    (this.performanceMonitor as any).clearCache();
  }

  /**
   * Export performance metrics
   */
  exportMetrics(): string {
    return this.performanceMonitor.exportMetrics();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.connectionManager.cleanup();
  }
}
