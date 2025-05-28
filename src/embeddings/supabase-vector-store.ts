import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { CodeChunk } from './chunker';
import crypto from 'crypto';

/**
 * Vector store for IL2CPP code chunks using Supabase
 */
export class SupabaseIL2CPPVectorStore {
  private embeddings: Embeddings;
  public supabaseClient: SupabaseClient;
  private tableName: string;
  private dimensions: number;

  /**
   * Initialize the Supabase vector store
   * @param embeddings Embeddings instance to use
   * @param supabaseUrl Supabase URL
   * @param supabaseKey Supabase API key
   * @param tableName Table name for vector storage
   */
  constructor(
    embeddings: Embeddings,
    supabaseUrl: string,
    supabaseKey: string,
    tableName: string = 'il2cpp_documents'
  ) {
    this.embeddings = embeddings;
    this.tableName = tableName;

    // Get the dimensions from the embeddings model
    this.dimensions = (embeddings as any).getDimension?.() || 384;

    // Create Supabase client with Docker-compatible configuration
    this.supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      // Remove problematic header overrides for Docker networking
      global: {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    });

    console.log(`Initialized Supabase vector store with dimensions: ${this.dimensions}`);

    // Initialize the table structure
    this.initializeTable().catch(error => {
      console.error('Error initializing Supabase table:', error);
    });
  }

  /**
   * Initialize the Supabase table with the correct schema
   * This ensures the document_hash column exists for deduplication
   */
  private async initializeTable(): Promise<void> {
    try {
      // Check if the table exists
      const { error: checkError } = await this.supabaseClient
        .from(this.tableName)
        .select('id')
        .limit(1);

      // If the table doesn't exist, we'll need to rely on Supabase's auto-creation
      // when we first insert data, since we may not have direct SQL execution privileges
      if (checkError && checkError.code === '42P01') {
        console.log(`Table ${this.tableName} doesn't exist. It will be created automatically on first insert.`);
        // We'll add document_hash when inserting data
      }
    } catch (error) {
      console.warn('Error checking table structure:', error);
      console.log('Will attempt to use table as-is or it will be created on first insert');
    }
  }

  /**
   * Create a new instance of the vector store from texts
   * @param texts Array of texts
   * @param metadatas Array of metadata objects
   * @param embeddings Embeddings instance
   * @param supabaseUrl Supabase URL
   * @param supabaseKey Supabase API key
   * @param tableName Table name
   * @returns New SupabaseIL2CPPVectorStore instance
   */
  static async fromTexts(
    texts: string[],
    metadatas: Record<string, any>[],
    embeddings: Embeddings,
    supabaseUrl: string,
    supabaseKey: string,
    tableName: string = 'il2cpp_documents'
  ): Promise<SupabaseIL2CPPVectorStore> {
    // Create the vector store instance
    const vectorStore = new SupabaseIL2CPPVectorStore(
      embeddings,
      supabaseUrl,
      supabaseKey,
      tableName
    );

    // Create documents from texts and metadata
    const documents = texts.map((text, index) => {
      return new Document({
        pageContent: text,
        metadata: metadatas[index] || {},
      });
    });

    // Add documents to the vector store
    await vectorStore.addDocuments(documents);

    return vectorStore;
  }

  /**
   * Add documents to the vector store with enhanced batch processing and progress reporting
   * @param documents Array of documents to add
   * @param progressCallback Optional callback for progress updates
   */
  public async addDocuments(
    documents: Document[],
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    try {
      // Generate document hashes for deduplication
      const documentHashes = documents.map(doc => this.generateDocumentHash(doc));

      // Track which documents to add
      let newDocuments = [...documents];
      let existingCount = 0;

      try {
        // Check which documents already exist in the database
        const existingDocuments = new Set<string>();

        // Query in batches to avoid overwhelming the database
        const hashBatchSize = 100;
        for (let i = 0; i < documentHashes.length; i += hashBatchSize) {
          const hashBatch = documentHashes.slice(i, i + hashBatchSize);

          // Check for existing documents with these hashes
          const { data, error } = await this.supabaseClient
            .from(this.tableName)
            .select('document_hash')
            .in('document_hash', hashBatch);

          if (error) {
            if (error.code === '42P01') {
              // Table doesn't exist yet, so no documents exist
              console.log(`Table ${this.tableName} doesn't exist yet. All documents will be added.`);
              break;
            } else {
              console.warn('Error checking for existing documents:', error);
            }
          } else if (data && data.length > 0) {
            // Add existing hashes to the set
            data.forEach(item => existingDocuments.add(item.document_hash));
          }
        }

        if (existingDocuments.size > 0) {
          // Filter out documents that already exist
          const filteredDocuments: Document[] = [];

          documents.forEach((doc, index) => {
            const hash = documentHashes[index];
            if (!existingDocuments.has(hash)) {
              filteredDocuments.push(doc);
            }
          });

          existingCount = documents.length - filteredDocuments.length;
          newDocuments = filteredDocuments;
        }
      } catch (error) {
        console.warn('Error during deduplication check:', error);
        console.log('Will proceed with adding all documents and rely on unique constraint');
      }

      // If all documents already exist, we're done
      if (newDocuments.length === 0) {
        console.log(`All ${documents.length} documents already exist in the database. Skipping insertion.`);
        return;
      }

      if (existingCount > 0) {
        console.log(`Found ${existingCount} existing documents. Adding ${newDocuments.length} new documents.`);
      } else {
        console.log(`Adding all ${newDocuments.length} documents to the database.`);
      }

      if (progressCallback) {
        progressCallback(10, 'Generating embeddings for documents...');
      }

      // Generate embeddings for documents
      const texts = newDocuments.map(doc => doc.pageContent);
      const embeddings = await this.embeddings.embedDocuments(texts);

      if (progressCallback) {
        progressCallback(20, `Preparing to insert ${newDocuments.length} documents...`);
      }

      // Verify embedding format
      if (embeddings.length > 0) {
        const firstEmbedding = embeddings[0];
        console.log(`Embedding type: ${typeof firstEmbedding}, isArray: ${Array.isArray(firstEmbedding)}`);
        console.log(`First embedding length: ${firstEmbedding.length}`);
        console.log(`First few values: ${firstEmbedding.slice(0, 5)}`);

        // Ensure embeddings are arrays of numbers
        const validatedEmbeddings = embeddings.map(emb => {
          if (typeof emb === 'object' && !Array.isArray(emb)) {
            // Convert object to array if needed
            return Object.values(emb).map(val => Number(val));
          }
          return emb;
        });

        // Use validated embeddings
        embeddings.splice(0, embeddings.length, ...validatedEmbeddings as number[][]);
      }

      // Enhanced batch processing with larger batch size and better error handling
      const batchSize = this.calculateOptimalBatchSize(newDocuments.length);
      const totalBatches = Math.ceil(newDocuments.length / batchSize);

      console.log(`Adding ${newDocuments.length} documents to Supabase in ${totalBatches} batches (batch size: ${batchSize})`);

      if (progressCallback) {
        progressCallback(25, `Starting batch insertion: ${totalBatches} batches of ${batchSize} documents each`);
      }

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * batchSize;
        const endIdx = Math.min(startIdx + batchSize, newDocuments.length);
        const batch = newDocuments.slice(startIdx, endIdx);
        const batchEmbeddings = embeddings.slice(startIdx, endIdx);
        const batchHashes = batch.map(doc => this.generateDocumentHash(doc));

        // Calculate progress for this batch
        const batchProgress = 25 + Math.floor((batchIndex / totalBatches) * 70);

        if (progressCallback) {
          progressCallback(
            batchProgress,
            `Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} documents)...`
          );
        }

        // Process batch with retry logic
        await this.processBatchWithRetry(
          batch,
          batchEmbeddings,
          batchHashes,
          batchIndex,
          totalBatches
        );
      }

      if (progressCallback) {
        progressCallback(100, `Successfully inserted ${newDocuments.length} documents to vector store`);
      }

      console.log(`Successfully completed insertion of ${newDocuments.length} documents in ${totalBatches} batches`);
    } catch (error) {
      console.error('Error adding documents to Supabase:', error);
      if (progressCallback) {
        progressCallback(-1, `Error during insertion: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      throw error;
    }
  }

  /**
   * Add code chunks to the vector store
   * @param chunks Array of code chunks to add
   * @param progressCallback Optional callback for progress updates
   */
  public async addCodeChunks(
    chunks: CodeChunk[],
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    const documents = chunks.map(chunk => new Document({
      pageContent: chunk.text,
      metadata: chunk.metadata
    }));

    await this.addDocuments(documents, progressCallback);
  }

  /**
   * Search for similar documents based on a query string
   * @param query Query string
   * @param k Number of results to return
   * @returns Array of documents with similarity scores
   */
  public async similaritySearch(
    query: string,
    k: number = 5
  ): Promise<Document[]> {
    // Get results with scores
    const results = await this.similaritySearchWithScore(query, k);

    // Return just the documents
    return results.map(([doc]) => doc);
  }

  /**
   * Search for similar documents with scores
   * @param query Query string
   * @param k Number of results to return
   * @returns Array of documents with similarity scores
   */
  public async similaritySearchWithScore(
    query: string,
    k: number = 5
  ): Promise<[Document, number][]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // Search for similar documents using the match_documents function
      const { data, error } = await this.supabaseClient.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.0, // Return all results and filter by k
        match_count: k
      });

      if (error) {
        console.error('Error searching for similar documents:', error);
        return [];
      }

      // Convert results to documents with scores
      return (data || []).map((item: any) => {
        const doc = new Document({
          pageContent: item.content,
          metadata: item.metadata
        });

        return [doc, item.similarity];
      });
    } catch (error) {
      console.error('Error in similarity search:', error);
      return [];
    }
  }

  /**
   * Get the total number of documents in the vector store
   * @returns Number of documents
   */
  public async getDocumentCount(): Promise<number> {
    try {
      const { count, error } = await this.supabaseClient
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error('Error getting document count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error in getDocumentCount:', error);
      return 0;
    }
  }

  /**
   * Delete all documents from the vector store
   */
  public async deleteAll(): Promise<void> {
    try {
      const { error } = await this.supabaseClient
        .from(this.tableName)
        .delete()
        .neq('id', 0); // Delete all rows

      if (error) {
        console.error('Error deleting all documents:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in deleteAll:', error);
      throw error;
    }
  }

  /**
   * Get the dimensionality of the embeddings
   * @returns The number of dimensions in the embedding vectors
   */
  public getDimension(): number {
    return this.dimensions;
  }

  /**
   * Generate a unique hash for a document based on its content and metadata
   * @param document Document to generate hash for
   * @returns SHA-256 hash of the document content and metadata
   */
  private generateDocumentHash(document: Document): string {
    // Create a stable string representation of metadata (sorted keys)
    const metadataStr = this.serializeMetadataStably(document.metadata || {});
    const contentToHash = `${document.pageContent}|${metadataStr}`;

    // Generate SHA-256 hash
    return crypto.createHash('sha256').update(contentToHash).digest('hex');
  }

  /**
   * Serialize metadata with stable key ordering to ensure consistent hashing
   * @param metadata Metadata object to serialize
   * @returns Stable JSON string representation
   */
  private serializeMetadataStably(metadata: Record<string, any>): string {
    // Sort keys to ensure consistent ordering
    const sortedKeys = Object.keys(metadata).sort();
    const sortedMetadata: Record<string, any> = {};

    sortedKeys.forEach(key => {
      sortedMetadata[key] = metadata[key];
    });

    return JSON.stringify(sortedMetadata);
  }

  /**
   * Calculate optimal batch size based on document count and system constraints
   * @param documentCount Total number of documents to process
   * @returns Optimal batch size for processing
   */
  private calculateOptimalBatchSize(documentCount: number): number {
    // Base batch size for small datasets
    if (documentCount <= 1000) {
      return 50;
    }

    // Medium batch size for medium datasets
    if (documentCount <= 10000) {
      return 100;
    }

    // Large batch size for large datasets (like 300k+ chunks)
    if (documentCount <= 100000) {
      return 200;
    }

    // Very large batch size for massive datasets
    return 300;
  }

  /**
   * Process a batch with retry logic and comprehensive error handling
   * @param batch Documents in this batch
   * @param batchEmbeddings Embeddings for this batch
   * @param batchHashes Hashes for this batch
   * @param batchIndex Current batch index
   * @param totalBatches Total number of batches
   */
  private async processBatchWithRetry(
    batch: Document[],
    batchEmbeddings: number[][],
    batchHashes: string[],
    batchIndex: number,
    totalBatches: number,
    maxRetries: number = 3
  ): Promise<void> {
    const batchData = batch.map((doc, i) => ({
      content: doc.pageContent,
      metadata: doc.metadata,
      embedding: batchEmbeddings[i],
      document_hash: batchHashes[i]
    }));

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Batch operation timeout')), 30000); // 30 second timeout
        });

        const insertPromise = this.supabaseClient
          .from(this.tableName)
          .upsert(batchData, { onConflict: 'document_hash', ignoreDuplicates: true });

        const { error } = await Promise.race([insertPromise, timeoutPromise]) as any;

        if (error) {
          await this.handleBatchError(error, batch, batchEmbeddings, batchIndex, totalBatches, attempt);
        } else {
          console.log(`Batch ${batchIndex + 1}/${totalBatches}: Successfully added ${batch.length} documents`);
          return; // Success, exit retry loop
        }
      } catch (error) {
        console.error(`Batch ${batchIndex + 1}/${totalBatches}, Attempt ${attempt}/${maxRetries}: Error:`, error);

        if (attempt === maxRetries) {
          throw new Error(`Failed to process batch ${batchIndex + 1} after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`Retrying batch ${batchIndex + 1} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Handle batch insertion errors with fallback strategies
   * @param error The error that occurred
   * @param batch Documents in this batch
   * @param batchEmbeddings Embeddings for this batch
   * @param batchIndex Current batch index
   * @param totalBatches Total number of batches
   * @param attempt Current attempt number
   */
  private async handleBatchError(
    error: any,
    batch: Document[],
    batchEmbeddings: number[][],
    batchIndex: number,
    totalBatches: number,
    attempt: number
  ): Promise<void> {
    if (error.code === '42703') { // undefined_column error
      console.log(`Column 'document_hash' doesn't exist yet. Trying regular insert...`);

      // Try without document_hash for the first batch
      if (batchIndex === 0) {
        const simpleBatchData = batch.map((doc, i) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
          embedding: batchEmbeddings[i]
        }));

        const { error: insertError } = await this.supabaseClient
          .from(this.tableName)
          .insert(simpleBatchData);

        if (insertError) {
          throw insertError;
        } else {
          console.log(`Batch ${batchIndex + 1}/${totalBatches}: Successfully added ${batch.length} documents (without hash)`);
        }
      } else {
        throw error; // For subsequent batches, this shouldn't happen
      }
    } else if (error.code === '23505') { // unique_violation
      console.warn(`Batch ${batchIndex + 1}/${totalBatches}: Duplicate key violation, some documents already exist`);
      // This is not a fatal error, continue processing
    } else {
      console.error(`Batch ${batchIndex + 1}/${totalBatches}, Attempt ${attempt}: Error inserting documents:`,
        JSON.stringify(error, null, 2));
      throw error; // Re-throw for retry logic
    }
  }
}
