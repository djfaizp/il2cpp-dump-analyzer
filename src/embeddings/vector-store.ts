import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from '@langchain/core/documents';
import { CodeChunk } from './chunker';
import { XenovaEmbeddings } from './xenova-embeddings';
import { SupabaseIL2CPPVectorStore } from './supabase-vector-store';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

/**
 * Vector store for IL2CPP code chunks
 */
export class IL2CPPVectorStore {
  private vectorStore: MemoryVectorStore | SupabaseIL2CPPVectorStore;
  private embeddings: XenovaEmbeddings;
  private useSupabase: boolean;
  private documentHashes: Set<string> = new Set(); // Track document hashes for in-memory deduplication
  private hashesFilePath: string;

  constructor(model?: string) {
    // Initialize the embeddings model
    const modelName = model || process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
    this.embeddings = new XenovaEmbeddings(modelName);

    // Check if Supabase configuration is available
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
    const supabaseTable = process.env.SUPABASE_TABLE || 'il2cpp_documents';

    // Use Supabase only if both URL and key are available
    this.useSupabase = !!(supabaseUrl && supabaseKey);

    // Set up the path for storing document hashes
    this.hashesFilePath = path.resolve(process.cwd(), 'document-hashes.json');

    // Load existing document hashes if available
    this.loadDocumentHashes();

    if (this.useSupabase) {
      console.log('Using Supabase vector store');
      this.vectorStore = new SupabaseIL2CPPVectorStore(
        this.embeddings,
        supabaseUrl!,
        supabaseKey!,
        supabaseTable
      );
    } else {
      console.log('Using in-memory vector store');
      // @ts-ignore - Type compatibility issue between different versions of LangChain
      this.vectorStore = new MemoryVectorStore(this.embeddings);
    }
  }

  /**
   * Load document hashes from file
   */
  private loadDocumentHashes(): void {
    try {
      if (fs.existsSync(this.hashesFilePath)) {
        const hashesData = fs.readFileSync(this.hashesFilePath, 'utf8');
        const hashes = JSON.parse(hashesData);

        if (Array.isArray(hashes)) {
          hashes.forEach(hash => this.documentHashes.add(hash));
          console.log(`Loaded ${hashes.length} document hashes from file`);
        }
      } else {
        console.log('No document hashes file found. Starting with empty set.');
      }
    } catch (error) {
      console.warn('Error loading document hashes:', error);
      console.log('Starting with empty document hashes set');
    }
  }

  /**
   * Save document hashes to file
   */
  private saveDocumentHashes(): void {
    try {
      const hashes = Array.from(this.documentHashes);
      fs.writeFileSync(this.hashesFilePath, JSON.stringify(hashes, null, 2), 'utf8');
      console.log(`Saved ${hashes.length} document hashes to file`);
    } catch (error) {
      console.error('Error saving document hashes:', error);
    }
  }

  /**
   * Generate a unique hash for a document based on its content and metadata
   * @param document Document to generate hash for
   * @returns SHA-256 hash of the document content and metadata
   */
  private generateDocumentHash(document: Document): string {
    // Create a string representation of the document that includes content and metadata
    const metadataStr = JSON.stringify(document.metadata || {});
    const contentToHash = `${document.pageContent}|${metadataStr}`;

    // Generate SHA-256 hash
    return crypto.createHash('sha256').update(contentToHash).digest('hex');
  }

  /**
   * Add documents to the vector store
   * @param documents Array of documents to add
   */
  public async addDocuments(documents: Document[]): Promise<void> {
    // Generate hashes for all documents for deduplication
    const documentHashes = documents.map(doc => this.generateDocumentHash(doc));

    if (this.useSupabase) {
      // For Supabase, we'll add document_hash to each document's metadata
      const documentsWithHashes = documents.map((doc, index) => {
        // Create a new document with the hash in metadata
        return new Document({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
            document_hash: documentHashes[index]
          }
        });
      });

      // Let Supabase store handle the documents
      await this.vectorStore.addDocuments(documentsWithHashes);
    } else {
      // For in-memory store, we need to handle deduplication ourselves
      const newDocuments: Document[] = [];
      const newHashes: string[] = [];

      // Filter out documents that already exist
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const hash = documentHashes[i];
        if (!this.documentHashes.has(hash)) {
          this.documentHashes.add(hash);
          newDocuments.push(doc);
          newHashes.push(hash);
        }
      }

      if (newDocuments.length === 0) {
        console.log(`All ${documents.length} documents already exist in memory. Skipping insertion.`);
        return;
      }

      console.log(`Found ${documents.length - newDocuments.length} existing documents. Adding ${newDocuments.length} new documents to memory.`);

      // Add only new documents to the vector store
      await this.vectorStore.addDocuments(newDocuments);

      // Save the updated document hashes to file
      this.saveDocumentHashes();
    }
  }

  /**
   * Add code chunks to the vector store
   * @param chunks Array of code chunks to add
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
   * @param query Query string
   * @param k Number of results to return
   * @returns Array of documents with similarity scores
   */
  public async similaritySearch(
    query: string,
    k: number = 5
  ): Promise<Document[]> {
    return this.vectorStore.similaritySearch(query, k);
  }

  /**
   * Search for similar documents based on a query string with scores
   * @param query Query string
   * @param k Number of results to return
   * @returns Array of documents with similarity scores
   */
  public async similaritySearchWithScore(
    query: string,
    k: number = 5
  ): Promise<[Document, number][]> {
    return this.vectorStore.similaritySearchWithScore(query, k);
  }

  /**
   * Search for similar documents based on a vector
   * @param embedding Embedding vector
   * @param k Number of results to return
   * @returns Array of documents with similarity scores
   */
  public async similaritySearchVectorWithScore(
    embedding: number[],
    k: number = 5
  ): Promise<[Document, number][]> {
    if (this.useSupabase) {
      // For Supabase, we need to use a different approach
      try {
        // Cast to Supabase store type
        const { data, error } = await (this.vectorStore as SupabaseIL2CPPVectorStore).supabaseClient.rpc('match_documents', {
          query_embedding: embedding,
          match_threshold: 0.0,
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
        console.error('Error in similarity search vector with score:', error);
        return [];
      }
    } else {
      // For memory store, use the built-in method
      return (this.vectorStore as MemoryVectorStore).similaritySearchVectorWithScore(embedding, k);
    }
  }

  /**
   * Filter search results based on metadata
   * @param query Query string
   * @param filter Metadata filter
   * @param k Number of results to return
   * @returns Array of documents matching the filter
   */
  public async searchWithFilter(
    query: string,
    filter: Record<string, any>,
    k: number = 5
  ): Promise<Document[]> {
    // Create a filter function that checks if document metadata matches the filter
    const filterFn = (doc: Document) => {
      for (const [key, value] of Object.entries(filter)) {
        if (doc.metadata[key] !== value) {
          return false;
        }
      }
      return true;
    };

    return this.vectorStore.similaritySearch(query, k, filterFn);
  }

  /**
   * Get the total number of documents in the vector store
   * @returns Number of documents
   */
  public async getDocumentCount(): Promise<number> {
    if (this.useSupabase) {
      // Use the Supabase method to get the count
      return (this.vectorStore as SupabaseIL2CPPVectorStore).getDocumentCount();
    } else {
      // This is a workaround since MemoryVectorStore doesn't expose a direct way to get the count
      const allDocs = await this.vectorStore.similaritySearch('', 10000);
      return allDocs.length;
    }
  }

  /**
   * Delete all documents from the vector store
   */
  public async deleteAll(): Promise<void> {
    if (this.useSupabase) {
      await (this.vectorStore as SupabaseIL2CPPVectorStore).deleteAll();
    } else {
      // For memory store, we can't delete documents, so we create a new store
      // @ts-ignore - Type compatibility issue between different versions of LangChain
      this.vectorStore = new MemoryVectorStore(this.embeddings);

      // Clear the document hashes
      this.documentHashes.clear();

      // Delete the hashes file if it exists
      if (fs.existsSync(this.hashesFilePath)) {
        fs.unlinkSync(this.hashesFilePath);
      }

      console.log('Cleared in-memory vector store and document hashes');
    }
  }

  /**
   * Check if the vector store is using Supabase
   * @returns True if using Supabase, false otherwise
   */
  public isUsingSupabase(): boolean {
    return this.useSupabase;
  }
}
