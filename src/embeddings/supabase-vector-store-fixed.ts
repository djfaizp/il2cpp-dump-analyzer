import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { CodeChunk } from './chunker';
import crypto from 'crypto';

/**
 * Vector store for IL2CPP code chunks using Supabase
 * Fixed version with improved error handling and consistency
 */
export class SupabaseIL2CPPVectorStore {
  private embeddings: Embeddings;
  public supabaseClient: SupabaseClient;
  private tableName: string;
  private dimensions: number;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

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

    // Get the dimensions from the embeddings model with fallback
    this.dimensions = this.getDimensionsFromEmbeddings(embeddings);

    // Create Supabase client
    this.supabaseClient = createClient(supabaseUrl, supabaseKey);

    console.log(`Initialized Supabase vector store with dimensions: ${this.dimensions}`);
  }

  /**
   * Get dimensions from embeddings instance with proper fallback
   */
  private getDimensionsFromEmbeddings(embeddings: Embeddings): number {
    // Try different ways to get dimensions
    if (typeof (embeddings as any).getDimension === 'function') {
      return (embeddings as any).getDimension();
    }
    
    if ((embeddings as any).dimensions) {
      return (embeddings as any).dimensions;
    }

    // Default to 384 for all-MiniLM-L6-v2 model
    console.warn('Could not determine embedding dimensions, defaulting to 384');
    return 384;
  }

  /**
   * Ensure the vector store is properly initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.initializeTable();
    await this.initializationPromise;
    this.isInitialized = true;
  }

  /**
   * Initialize the Supabase table with the correct schema
   */
  private async initializeTable(): Promise<void> {
    try {
      // First, check if the table exists and get its structure
      const { data: tableInfo, error: tableError } = await this.supabaseClient
        .from(this.tableName)
        .select('id, content, metadata, embedding, document_hash')
        .limit(1);

      if (tableError) {
        if (tableError.code === '42P01') {
          console.log(`Table ${this.tableName} doesn't exist. Please run the SQL setup commands.`);
          console.log('You can find the setup commands in supabase-setup.sql');
          throw new Error(`Table ${this.tableName} does not exist. Please run the setup SQL commands.`);
        } else {
          console.warn('Error checking table structure:', tableError);
          throw tableError;
        }
      }

      console.log(`Table ${this.tableName} exists and is accessible.`);
    } catch (error) {
      console.error('Error initializing table:', error);
      throw error;
    }
  }

  /**
   * Create a new instance of the vector store from texts
   */
  static async fromTexts(
    texts: string[],
    metadatas: Record<string, any>[],
    embeddings: Embeddings,
    supabaseUrl: string,
    supabaseKey: string,
    tableName: string = 'il2cpp_documents'
  ): Promise<SupabaseIL2CPPVectorStore> {
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
   * Add documents to the vector store with improved error handling
   */
  public async addDocuments(documents: Document[]): Promise<void> {
    if (!documents || documents.length === 0) {
      console.log('No documents to add.');
      return;
    }

    await this.ensureInitialized();

    try {
      console.log(`Processing ${documents.length} documents for insertion...`);

      // Generate document hashes for deduplication
      const documentHashes = documents.map(doc => this.generateDocumentHash(doc));

      // Check for existing documents
      const { newDocuments, existingCount } = await this.filterExistingDocuments(
        documents, 
        documentHashes
      );

      if (newDocuments.length === 0) {
        console.log(`All ${documents.length} documents already exist in the database. Skipping insertion.`);
        return;
      }

      if (existingCount > 0) {
        console.log(`Found ${existingCount} existing documents. Adding ${newDocuments.length} new documents.`);
      } else {
        console.log(`Adding all ${newDocuments.length} documents to the database.`);
      }

      // Generate embeddings for new documents
      const embeddings = await this.generateEmbeddings(newDocuments);

      // Insert documents in batches
      await this.insertDocumentsBatch(newDocuments, embeddings, documentHashes);

      console.log(`Successfully added ${newDocuments.length} documents to the vector store.`);
    } catch (error) {
      console.error('Error adding documents to Supabase:', error);
      throw error;
    }
  }

  /**
   * Filter out documents that already exist in the database
   */
  private async filterExistingDocuments(
    documents: Document[], 
    documentHashes: string[]
  ): Promise<{ newDocuments: Document[], existingCount: number }> {
    try {
      const existingDocuments = new Set<string>();

      // Query in batches to avoid overwhelming the database
      const hashBatchSize = 100;
      for (let i = 0; i < documentHashes.length; i += hashBatchSize) {
        const hashBatch = documentHashes.slice(i, i + hashBatchSize);

        const { data, error } = await this.supabaseClient
          .from(this.tableName)
          .select('document_hash')
          .in('document_hash', hashBatch);

        if (error) {
          console.warn('Error checking for existing documents:', error);
          // Continue without deduplication if there's an error
          break;
        }

        if (data && data.length > 0) {
          data.forEach(item => existingDocuments.add(item.document_hash));
        }
      }

      // Filter out existing documents
      const newDocuments: Document[] = [];
      documents.forEach((doc, index) => {
        const hash = documentHashes[index];
        if (!existingDocuments.has(hash)) {
          newDocuments.push(doc);
        }
      });

      return {
        newDocuments,
        existingCount: documents.length - newDocuments.length
      };
    } catch (error) {
      console.warn('Error during deduplication check:', error);
      console.log('Proceeding without deduplication');
      return { newDocuments: documents, existingCount: 0 };
    }
  }

  /**
   * Generate embeddings for documents with proper validation
   */
  private async generateEmbeddings(documents: Document[]): Promise<number[][]> {
    const texts = documents.map(doc => doc.pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);

    // Validate embeddings
    if (embeddings.length !== documents.length) {
      throw new Error(`Embedding count mismatch: expected ${documents.length}, got ${embeddings.length}`);
    }

    // Validate each embedding
    const validatedEmbeddings = embeddings.map((embedding, index) => {
      const validatedEmbedding = this.validateEmbedding(embedding, index);
      
      if (validatedEmbedding.length !== this.dimensions) {
        throw new Error(
          `Embedding dimension mismatch for document ${index}: expected ${this.dimensions}, got ${validatedEmbedding.length}`
        );
      }

      return validatedEmbedding;
    });

    return validatedEmbeddings;
  }

  /**
   * Validate and normalize a single embedding
   */
  private validateEmbedding(embedding: any, index: number): number[] {
    let validatedEmbedding: number[];

    if (Array.isArray(embedding)) {
      validatedEmbedding = embedding.map(val => Number(val));
    } else if (typeof embedding === 'object' && embedding !== null) {
      // Handle case where embedding is an object (e.g., from some models)
      validatedEmbedding = Object.values(embedding).map(val => Number(val));
    } else {
      throw new Error(`Invalid embedding format for document ${index}: ${typeof embedding}`);
    }

    // Check for NaN values
    if (validatedEmbedding.some(val => isNaN(val))) {
      throw new Error(`Embedding contains NaN values for document ${index}`);
    }

    return validatedEmbedding;
  }

  /**
   * Insert documents in batches with proper error handling
   */
  private async insertDocumentsBatch(
    documents: Document[], 
    embeddings: number[][], 
    allHashes: string[]
  ): Promise<void> {
    const batchSize = 20;
    const totalBatches = Math.ceil(documents.length / batchSize);

    console.log(`Inserting ${documents.length} documents in ${totalBatches} batches`);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min(startIdx + batchSize, documents.length);
      
      const batch = documents.slice(startIdx, endIdx);
      const batchEmbeddings = embeddings.slice(startIdx, endIdx);
      const batchHashes = batch.map(doc => this.generateDocumentHash(doc));

      await this.insertSingleBatch(batch, batchEmbeddings, batchHashes, batchIndex + 1, totalBatches);
    }
  }

  /**
   * Insert a single batch of documents
   */
  private async insertSingleBatch(
    batch: Document[], 
    batchEmbeddings: number[][], 
    batchHashes: string[],
    batchNumber: number,
    totalBatches: number
  ): Promise<void> {
    const batchData = batch.map((doc, i) => ({
      content: doc.pageContent,
      metadata: doc.metadata || {},
      embedding: batchEmbeddings[i],
      document_hash: batchHashes[i]
    }));

    try {
      // Use upsert with conflict resolution
      const { error } = await this.supabaseClient
        .from(this.tableName)
        .upsert(batchData, { 
          onConflict: 'document_hash',
          ignoreDuplicates: true 
        });

      if (error) {
        // Handle specific error cases
        if (error.code === '23505') {
          console.warn(`Batch ${batchNumber}/${totalBatches}: Some documents already exist (duplicate key)`);
        } else {
          console.error(`Batch ${batchNumber}/${totalBatches}: Error inserting documents:`, error);
          throw error;
        }
      } else {
        console.log(`Batch ${batchNumber}/${totalBatches}: Successfully inserted ${batch.length} documents`);
      }
    } catch (error) {
      console.error(`Batch ${batchNumber}/${totalBatches}: Failed to insert documents:`, error);
      throw error;
    }
  }

  /**
   * Add code chunks to the vector store
   */
  public async addCodeChunks(chunks: CodeChunk[]): Promise<void> {
    const documents = chunks.map(chunk => new Document({
      pageContent: chunk.text,
      metadata: chunk.metadata
    }));

    await this.addDocuments(documents);
  }

  /**
   * Search for similar documents based on a query string
   */
  public async similaritySearch(
    query: string,
    k: number = 5
  ): Promise<Document[]> {
    const results = await this.similaritySearchWithScore(query, k);
    return results.map(([doc]) => doc);
  }

  /**
   * Search for similar documents with scores
   */
  public async similaritySearchWithScore(
    query: string,
    k: number = 5
  ): Promise<[Document, number][]> {
    await this.ensureInitialized();

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddings.embedQuery(query);
      
      // Validate query embedding
      const validatedQueryEmbedding = this.validateEmbedding(queryEmbedding, -1);

      if (validatedQueryEmbedding.length !== this.dimensions) {
        throw new Error(
          `Query embedding dimension mismatch: expected ${this.dimensions}, got ${validatedQueryEmbedding.length}`
        );
      }

      // Search for similar documents using the match_documents function
      const { data, error } = await this.supabaseClient.rpc('match_documents', {
        query_embedding: validatedQueryEmbedding,
        match_threshold: 0.0,
        match_count: k
      });

      if (error) {
        console.error('Error searching for similar documents:', error);
        if (error.code === '42883') {
          throw new Error('The match_documents function does not exist. Please run the SQL setup commands.');
        }
        throw error;
      }

      // Convert results to documents with scores
      return (data || []).map((item: any) => {
        const doc = new Document({
          pageContent: item.content,
          metadata: item.metadata || {}
        });

        return [doc, item.similarity || 0];
      });
    } catch (error) {
      console.error('Error in similarity search:', error);
      throw error;
    }
  }

  /**
   * Get the total number of documents in the vector store
   */
  public async getDocumentCount(): Promise<number> {
    await this.ensureInitialized();

    try {
      const { count, error } = await this.supabaseClient
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error('Error getting document count:', error);
        throw error;
      }

      return count || 0;
    } catch (error) {
      console.error('Error in getDocumentCount:', error);
      throw error;
    }
  }

  /**
   * Delete all documents from the vector store
   */
  public async deleteAll(): Promise<void> {
    await this.ensureInitialized();

    try {
      const { error } = await this.supabaseClient
        .from(this.tableName)
        .delete()
        .neq('id', 0); // Delete all rows

      if (error) {
        console.error('Error deleting all documents:', error);
        throw error;
      }

      console.log('Successfully deleted all documents from the vector store.');
    } catch (error) {
      console.error('Error in deleteAll:', error);
      throw error;
    }
  }

  /**
   * Get the dimensionality of the embeddings
   */
  public getDimension(): number {
    return this.dimensions;
  }

  /**
   * Generate a unique hash for a document based on its content and metadata
   */
  private generateDocumentHash(document: Document): string {
    // Create a deterministic string representation
    const metadataStr = JSON.stringify(document.metadata || {}, Object.keys(document.metadata || {}).sort());
    const contentToHash = `${document.pageContent}|${metadataStr}`;

    // Generate SHA-256 hash
    return crypto.createHash('sha256').update(contentToHash, 'utf8').digest('hex');
  }

  /**
   * Check if the vector store is properly configured and accessible
   */
  public async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      await this.ensureInitialized();
      
      // Try to get document count as a health check
      const count = await this.getDocumentCount();
      
      return {
        healthy: true,
        message: `Vector store is healthy. Contains ${count} documents.`
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Vector store health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}