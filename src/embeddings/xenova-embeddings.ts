import { Embeddings } from '@langchain/core/embeddings';
import * as path from 'path';

// We'll use dynamic import for the Xenova transformers package since it's an ESM module
let pipeline: any;
let env: any;
let transformers: any;

// This will be initialized in the constructor
async function loadTransformers() {
  try {
    // Use a more robust dynamic import approach
    const transformersModule = await import('@xenova/transformers');
    transformers = transformersModule;
    pipeline = transformersModule.pipeline;
    env = transformersModule.env;

    // Set environment variables for Xenova with proper Docker support
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    // Use absolute path with environment variable for Docker compatibility
    env.cacheDir = path.resolve(process.env.MODEL_CACHE_PATH || '/app/models');

    // Ensure cache directory exists and is writable
    const fs = await import('fs');
    try {
      await fs.promises.mkdir(env.cacheDir, { recursive: true });
      console.log(`✓ Xenova model cache directory ready: ${env.cacheDir}`);
    } catch (error) {
      console.warn(`Warning: Could not create model cache directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { pipeline, env, transformers };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to load @xenova/transformers:', errorMessage);

    // Provide more specific error guidance
    if (errorMessage.includes('experimental-vm-modules')) {
      console.error('Hint: Make sure Node.js is started with --experimental-vm-modules flag');
    }

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
   * Initialize the embedding pipeline with Docker-friendly error handling
   */
  private async initialize(): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Initializing Xenova embeddings model: ${this.model} (attempt ${attempt}/${maxRetries})`);

        // Load the transformers library
        await loadTransformers();

        // Initialize the pipeline with timeout for Docker environments
        console.log('Loading embedding model... This may take a few minutes on first run.');
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Model loading timeout')), 300000); // 5 minutes
        });

        const modelPromise = pipeline('feature-extraction', this.model);
        this.embeddingPipeline = await Promise.race([modelPromise, timeoutPromise]);

        console.log('✓ Xenova embeddings model initialized successfully');
        return; // Success, exit retry loop

      } catch (error) {
        console.error(`Failed to initialize Xenova embeddings model (attempt ${attempt}/${maxRetries}):`, error);

        if (attempt === maxRetries) {
          throw new Error(`Failed to initialize Xenova embeddings after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        console.log(`Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
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
    const totalTexts = texts.length;

    // Process in smaller batches to avoid memory issues and provide progress
    const batchSize = 5; // Reduced batch size for better memory management

    console.log(`Processing ${totalTexts} texts in batches of ${batchSize}...`);

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(totalTexts / batchSize);

      try {
        // Process batch with individual error handling
        const batchEmbeddings: number[][] = [];
        for (const text of batch) {
          try {
            const embedding = await this.embedQuery(text);
            batchEmbeddings.push(embedding);
          } catch (error) {
            console.error(`Failed to embed text (length: ${text.length}):`, error);
            // Use a zero vector as fallback
            batchEmbeddings.push(new Array(this.dimensions).fill(0));
          }
        }

        embeddings.push(...batchEmbeddings);

        // Progress reporting
        if (batchNumber % 10 === 0 || batchNumber === totalBatches) {
          const progress = Math.round((i + batch.length) / totalTexts * 100);
          console.log(`[${progress}%] Processed ${i + batch.length}/${totalTexts} embeddings (batch ${batchNumber}/${totalBatches})`);
        }

      } catch (error) {
        console.error(`Failed to process batch ${batchNumber}:`, error);
        // Add zero vectors for the entire failed batch
        for (let j = 0; j < batch.length; j++) {
          embeddings.push(new Array(this.dimensions).fill(0));
        }
      }
    }

    console.log(`✓ Completed embedding generation for ${totalTexts} texts`);
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
