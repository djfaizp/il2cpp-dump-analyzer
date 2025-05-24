import { Embeddings } from '@langchain/core/embeddings';

// We'll use dynamic import for the Xenova transformers package since it's an ESM module
let pipeline: any;
let env: any;
let transformers: any;

// This will be initialized in the constructor
async function loadTransformers() {
  try {
    transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    env = transformers.env;

    // Set environment variables for Xenova
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    env.cacheDir = './models'; // Cache models locally for faster loading

    return { pipeline, env, transformers };
  } catch (error) {
    console.error('Failed to load @xenova/transformers:', error);
    throw error;
  }
}

/**
 * Embeddings implementation using Xenova's Transformers.js with the all-MiniLM-L6-v2 model
 */
export class XenovaEmbeddings extends Embeddings {
  private model: string;
  private embeddingPipeline: any;
  private dimensions: number;
  private ready: Promise<void>;

  /**
   * Initialize the Xenova embeddings model
   * @param model Model name to use, defaults to 'Xenova/all-MiniLM-L6-v2'
   */
  constructor(model: string = 'Xenova/all-MiniLM-L6-v2') {
    super({});
    this.model = model;
    this.dimensions = 384; // all-MiniLM-L6-v2 produces 384-dimensional embeddings
    this.ready = this.initialize();
  }

  /**
   * Initialize the embedding pipeline
   */
  private async initialize(): Promise<void> {
    try {
      console.log(`Initializing Xenova embeddings model: ${this.model}`);

      // Load the transformers library
      await loadTransformers();

      // Initialize the pipeline
      this.embeddingPipeline = await pipeline('feature-extraction', this.model);
      console.log('Xenova embeddings model initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Xenova embeddings model:', error);
      throw error;
    }
  }

  /**
   * Create embeddings for an array of texts
   * @param texts Array of texts to embed
   * @returns Promise resolving to a 2D array of embeddings
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    await this.ready;

    const embeddings: number[][] = [];

    // Process in batches to improve performance
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.embedQuery(text));
      const batchEmbeddings = await Promise.all(batchPromises);
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  /**
   * Create an embedding for a single query text
   * @param text Text to embed
   * @returns Promise resolving to an embedding vector
   */
  async embedQuery(text: string): Promise<number[]> {
    await this.ready;

    try {
      // Preprocess text for better embeddings
      const processedText = this.preprocessText(text);

      // Generate embedding using the Xenova model
      const result = await this.embeddingPipeline(processedText, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the embedding vector and ensure it's an array of numbers
      // Explicitly cast to number[] to fix type issues
      const embedding = Array.from(result.data).map(val => Number(val)) as number[];
      return embedding;
    } catch (error) {
      console.error('Error generating embedding with Xenova model:', error);
      throw error;
    }
  }

  /**
   * Preprocess text before embedding to improve quality
   * @param text Text to preprocess
   * @returns Processed text
   */
  private preprocessText(text: string): string {
    // Remove excessive whitespace
    let processed = text.replace(/\s+/g, ' ').trim();

    // Limit text length to avoid token limits
    const maxLength = 512;
    if (processed.length > maxLength) {
      processed = processed.substring(0, maxLength);
    }

    return processed;
  }

  /**
   * Get the dimensionality of the embeddings
   * @returns The number of dimensions in the embedding vectors
   */
  getDimension(): number {
    return this.dimensions;
  }
}
