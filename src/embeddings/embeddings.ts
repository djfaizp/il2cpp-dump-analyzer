import { CodeChunk } from './chunker';
import { Document } from '@langchain/core/documents';
import { XenovaEmbeddings } from './xenova-embeddings';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Manages the creation and storage of embeddings for IL2CPP code chunks
 */
export class IL2CPPEmbeddingManager {
  private embeddings: XenovaEmbeddings;

  constructor() {
    // Initialize the embeddings model
    const modelName = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
    this.embeddings = new XenovaEmbeddings(modelName);
  }

  /**
   * Convert code chunks to LangChain documents with embeddings
   * @param chunks Array of code chunks
   * @returns Array of documents with embeddings
   */
  public async createEmbeddings(chunks: CodeChunk[]): Promise<Document[]> {
    // Convert chunks to documents
    const documents = chunks.map(chunk => new Document({
      pageContent: chunk.text,
      metadata: chunk.metadata
    }));

    // Create embeddings for all documents
    await this.embeddings.embedDocuments(
      documents.map(doc => doc.pageContent)
    );

    return documents;
  }

  /**
   * Create an embedding for a query string
   * @param query Query string
   * @returns Embedding vector
   */
  public async createQueryEmbedding(query: string): Promise<number[]> {
    return this.embeddings.embedQuery(query);
  }

  /**
   * Find similar documents to a query
   * @param query Query string
   * @param documents Array of documents to search
   * @param k Number of results to return
   * @returns Array of documents with similarity scores
   */
  public async findSimilarDocuments(
    query: string,
    documents: Document[],
    k: number = 5
  ): Promise<Array<[Document, number]>> {
    const queryEmbedding = await this.createQueryEmbedding(query);
    const documentEmbeddings = await this.embeddings.embedDocuments(
      documents.map(doc => doc.pageContent)
    );

    // Calculate similarity scores
    const similarities: Array<[Document, number]> = [];
    for (let i = 0; i < documents.length; i++) {
      const similarity = this.cosineSimilarity(queryEmbedding, documentEmbeddings[i]);
      similarities.push([documents[i], similarity]);
    }

    // Sort by similarity (descending)
    similarities.sort((a, b) => b[1] - a[1]);

    // Return top k results
    return similarities.slice(0, k);
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param a First vector
   * @param b Second vector
   * @returns Cosine similarity score
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get the dimensionality of the embeddings
   * @returns The number of dimensions in the embedding vectors
   */
  public getDimension(): number {
    return this.embeddings.getDimension();
  }
}
