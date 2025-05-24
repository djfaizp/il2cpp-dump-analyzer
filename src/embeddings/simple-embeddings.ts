import { Embeddings } from '@langchain/core/embeddings';
import * as crypto from 'crypto';
import cosineSimilarity from 'compute-cosine-similarity';

/**
 * A simple embedding implementation that uses TF-IDF like approach
 * with cosine similarity for retrieval.
 *
 * This is a lightweight alternative that doesn't require external models
 * or native dependencies.
 */
export class SimpleEmbeddings extends Embeddings {
  private vocabulary: Map<string, number> = new Map();
  private documentVectors: Map<string, number[]> = new Map();
  private dimensions: number = 300; // Fixed dimension size

  constructor() {
    super({});
  }

  /**
   * Create embeddings for an array of texts
   * @param texts Array of texts to embed
   * @returns Promise resolving to a 2D array of embeddings
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    // Build vocabulary from all texts
    this.buildVocabulary(texts);

    // Create vectors for each text
    const vectors: number[][] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const vector = this.textToVector(text);

      // Store the vector for future similarity calculations
      const docId = this.getDocumentId(text);
      this.documentVectors.set(docId, vector);

      vectors.push(vector);
    }

    return vectors;
  }

  /**
   * Create an embedding for a single query text
   * @param text Text to embed
   * @returns Promise resolving to an embedding vector
   */
  async embedQuery(text: string): Promise<number[]> {
    return this.textToVector(text);
  }

  /**
   * Get the dimensionality of the embeddings
   * @returns The number of dimensions in the embedding vectors
   */
  getDimension(): number {
    return this.dimensions;
  }

  /**
   * Find the most similar documents to a query
   * @param query Query text
   * @param k Number of results to return
   * @returns Array of document IDs and similarity scores
   */
  async findSimilarDocuments(query: string, k: number = 5): Promise<Array<[string, number]>> {
    const queryVector = await this.embedQuery(query);
    const results: Array<[string, number]> = [];

    // Calculate similarity with each document
    for (const [docId, docVector] of this.documentVectors.entries()) {
      const similarity = cosineSimilarity(queryVector, docVector) || 0;
      results.push([docId, similarity]);
    }

    // Sort by similarity (descending)
    results.sort((a, b) => b[1] - a[1]);

    // Return top k results
    return results.slice(0, k);
  }

  /**
   * Build vocabulary from texts
   * @param texts Array of texts
   */
  private buildVocabulary(texts: string[]): void {
    const allWords = new Set<string>();

    // Collect all unique words
    for (const text of texts) {
      const words = this.tokenize(text);
      for (const word of words) {
        allWords.add(word);
      }
    }

    // Assign index to each word
    let index = 0;
    for (const word of allWords) {
      this.vocabulary.set(word, index);
      index++;
    }
  }

  /**
   * Convert text to vector
   * @param text Input text
   * @returns Vector representation
   */
  private textToVector(text: string): number[] {
    const words = this.tokenize(text);
    const wordCounts = new Map<string, number>();

    // Count word frequencies
    for (const word of words) {
      const count = wordCounts.get(word) || 0;
      wordCounts.set(word, count + 1);
    }

    // Create a sparse vector
    const sparseVector = new Map<number, number>();

    for (const [word, count] of wordCounts.entries()) {
      const index = this.vocabulary.get(word);
      if (index !== undefined) {
        // TF-IDF like weighting
        const tf = count / words.length;
        const idf = Math.log(1 + this.vocabulary.size / (1 + this.getDocumentFrequency(word)));
        sparseVector.set(index, tf * idf);
      }
    }

    // Convert sparse vector to fixed-size vector using hashing
    return this.hashVector(sparseVector);
  }

  /**
   * Tokenize text into words
   * @param text Input text
   * @returns Array of tokens
   */
  private tokenize(text: string): string[] {
    // Simple tokenization: lowercase, remove punctuation, split by whitespace
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  /**
   * Get document frequency for a word
   * @param word Word to check
   * @returns Number of documents containing the word
   */
  private getDocumentFrequency(word: string): number {
    // For simplicity, assume each word appears in one document
    return 1;
  }

  /**
   * Generate a unique ID for a document
   * @param text Document text
   * @returns Unique ID
   */
  private getDocumentId(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  /**
   * Convert sparse vector to fixed-size vector using hashing
   * @param sparseVector Sparse vector
   * @returns Fixed-size vector
   */
  private hashVector(sparseVector: Map<number, number>): number[] {
    const vector = new Array(this.dimensions).fill(0);

    for (const [index, value] of sparseVector.entries()) {
      // Use multiple hash functions to distribute values
      for (let i = 0; i < 3; i++) {
        const hashedIndex = (index * (i + 1)) % this.dimensions;
        vector[hashedIndex] += value;
      }
    }

    // Normalize the vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }
}
