/**
 * Real dump.cs Test Setup Utility
 * Provides infrastructure for testing MCP tools with actual dump.cs content
 * Uses existing Enhanced IL2CPP Parser, IL2CPP Code Chunker, and Vector Store
 */

import * as fs from 'fs';
import * as path from 'path';
import { Document } from '@langchain/core/documents';
import { EnhancedIL2CPPParser } from '../../parser/enhanced-il2cpp-parser';
import { IL2CPPCodeChunker } from '../../embeddings/chunker';
import { XenovaEmbeddings } from '../../embeddings/xenova-embeddings';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';

/**
 * Mock embeddings for testing that doesn't require actual model loading
 */
class MockEmbeddings {
  async initialize(): Promise<void> {
    // Mock initialization - no actual model loading
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    // Return mock embeddings - simple hash-based vectors for testing
    return texts.map(text => this.createMockEmbedding(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.createMockEmbedding(text);
  }

  private createMockEmbedding(text: string): number[] {
    // Create a simple deterministic embedding based on text content
    const embedding = new Array(384).fill(0);
    for (let i = 0; i < text.length && i < 384; i++) {
      embedding[i] = (text.charCodeAt(i) % 256) / 256;
    }
    return embedding;
  }
}
import { IL2CPPClass, IL2CPPEnum, IL2CPPInterface } from '../../parser/enhanced-types';

/**
 * Real data test configuration
 */
export interface RealDataTestConfig {
  dumpFilePath?: string;
  useCache?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
  maxDocuments?: number;
  useDirectContent?: boolean;
  dumpContent?: string;
}

/**
 * Real data test context
 */
export interface RealDataTestContext {
  vectorStore: MemoryVectorStore;
  parser: EnhancedIL2CPPParser;
  chunker: IL2CPPCodeChunker;
  embeddings: MockEmbeddings | XenovaEmbeddings;
  documents: Document[];
  classes: IL2CPPClass[];
  enums: IL2CPPEnum[];
  interfaces: IL2CPPInterface[];
  monoBehaviours: IL2CPPClass[];
}

/**
 * Cache for parsed dump.cs data to avoid re-parsing in every test
 */
let cachedTestContext: RealDataTestContext | null = null;
let cacheKey: string | null = null;

/**
 * Setup real data test environment using actual dump.cs file
 */
export async function setupRealDataTest(config: RealDataTestConfig = {}): Promise<RealDataTestContext> {
  const {
    dumpFilePath = path.join(process.cwd(), 'dump.cs'),
    useCache = true,
    chunkSize = 1000,
    chunkOverlap = 200,
    maxDocuments = 1000,
    useDirectContent = false,
    dumpContent = ''
  } = config;

  // Generate cache key based on configuration
  const currentCacheKey = useDirectContent
    ? `direct-content-${chunkSize}-${chunkOverlap}-${maxDocuments}-${dumpContent.length}`
    : `${dumpFilePath}-${chunkSize}-${chunkOverlap}-${maxDocuments}`;

  // Return cached context if available and cache is enabled
  if (useCache && cachedTestContext && cacheKey === currentCacheKey) {
    return cachedTestContext;
  }

  console.log('Setting up real data test environment...');

  // Initialize components
  const parser = new EnhancedIL2CPPParser();
  const chunker = new IL2CPPCodeChunker(chunkSize, chunkOverlap);

  // Use mock embeddings for testing to avoid Xenova loading issues
  const embeddings = new MockEmbeddings();
  await embeddings.initialize();

  // Load and parse dump.cs
  console.log('Loading and parsing dump.cs...');

  let parseResult;
  try {
    if (useDirectContent && dumpContent) {
      console.log('Using direct content, length:', dumpContent.length);
      parser.loadContent(dumpContent);
      console.log('Content loaded successfully');
    } else {
      // Verify dump.cs file exists
      if (!fs.existsSync(dumpFilePath)) {
        throw new Error(`dump.cs file not found at: ${dumpFilePath}`);
      }

      console.log('Dump file path:', dumpFilePath);
      console.log('File exists:', fs.existsSync(dumpFilePath));
      await parser.loadFile(dumpFilePath);
      console.log('File loaded successfully');
    }

    parseResult = parser.extractAllConstructs();
    console.log('Parsing completed successfully');
  } catch (error) {
    console.error('Error during parsing:', error);
    throw error;
  }

  console.log(`Parsed ${parseResult.statistics.totalConstructs} constructs from dump.cs`);
  console.log(`Classes: ${parseResult.classes.length}, Enums: ${parseResult.enums.length}, Interfaces: ${parseResult.interfaces.length}`);

  // Create chunks from parsed entities
  console.log('Creating semantic chunks...');
  const allChunks: Document[] = [];

  // Chunk classes (limit to maxDocuments to avoid overwhelming tests)
  const classesToProcess = parseResult.classes.slice(0, Math.floor(maxDocuments * 0.7));
  for (const classEntity of classesToProcess) {
    const chunks = await chunker.chunkClass(classEntity);
    for (const chunk of chunks) {
      allChunks.push(new Document({
        pageContent: chunk.text,
        metadata: chunk.metadata
      }));
    }
  }

  // Chunk enums
  const enumsToProcess = parseResult.enums.slice(0, Math.floor(maxDocuments * 0.2));
  for (const enumEntity of enumsToProcess) {
    const chunks = await chunker.chunkEnum(enumEntity);
    for (const chunk of chunks) {
      allChunks.push(new Document({
        pageContent: chunk.text,
        metadata: chunk.metadata
      }));
    }
  }

  // Chunk interfaces
  const interfacesToProcess = parseResult.interfaces.slice(0, Math.floor(maxDocuments * 0.1));
  for (const interfaceEntity of interfacesToProcess) {
    const chunks = await chunker.chunkInterface(interfaceEntity);
    for (const chunk of chunks) {
      allChunks.push(new Document({
        pageContent: chunk.text,
        metadata: chunk.metadata
      }));
    }
  }

  console.log(`Created ${allChunks.length} semantic chunks`);

  // Create vector store and add documents
  console.log('Creating vector store and adding documents...');
  // @ts-ignore - Type compatibility issue between different versions of LangChain
  const vectorStore = new MemoryVectorStore(embeddings);

  // Add documents in batches to avoid memory issues
  const batchSize = 50;
  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batch = allChunks.slice(i, i + batchSize);
    await vectorStore.addDocuments(batch);
    console.log(`Added batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allChunks.length / batchSize)}`);
  }

  // Filter MonoBehaviours
  const monoBehaviours = parseResult.classes.filter(cls => cls.isMonoBehaviour);

  console.log(`Found ${monoBehaviours.length} MonoBehaviour classes`);

  // Create test context
  const testContext: RealDataTestContext = {
    vectorStore,
    parser,
    chunker,
    embeddings,
    documents: allChunks,
    classes: parseResult.classes,
    enums: parseResult.enums,
    interfaces: parseResult.interfaces,
    monoBehaviours
  };

  // Cache the context if caching is enabled
  if (useCache) {
    cachedTestContext = testContext;
    cacheKey = currentCacheKey;
  }

  console.log('Real data test environment setup complete!');
  return testContext;
}

/**
 * Clear cached test context (useful for testing different configurations)
 */
export function clearTestCache(): void {
  cachedTestContext = null;
  cacheKey = null;
}

/**
 * Get statistics about the real data test environment
 */
export function getTestDataStatistics(context: RealDataTestContext): Record<string, any> {
  return {
    totalDocuments: context.documents.length,
    totalClasses: context.classes.length,
    totalEnums: context.enums.length,
    totalInterfaces: context.interfaces.length,
    totalMonoBehaviours: context.monoBehaviours.length,
    namespaces: [...new Set(context.classes.map(cls => cls.namespace).filter(Boolean))],
    classTypes: context.classes.reduce((acc, cls) => {
      const type = cls.isMonoBehaviour ? 'MonoBehaviour' : cls.isStruct ? 'Struct' : 'Class';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };
}

/**
 * Helper functions for finding specific entities in real data
 */

/**
 * Find a class by name in the real data
 */
export function findClassByName(context: RealDataTestContext, className: string): IL2CPPClass | undefined {
  return context.classes.find(cls =>
    cls.name === className ||
    cls.fullName === className ||
    cls.name.toLowerCase() === className.toLowerCase()
  );
}

/**
 * Find an enum by name in the real data
 */
export function findEnumByName(context: RealDataTestContext, enumName: string): IL2CPPEnum | undefined {
  return context.enums.find(enm =>
    enm.name === enumName ||
    enm.fullName === enumName ||
    enm.name.toLowerCase() === enumName.toLowerCase()
  );
}

/**
 * Find MonoBehaviours by name pattern
 */
export function findMonoBehavioursByPattern(context: RealDataTestContext, pattern: string): IL2CPPClass[] {
  const lowerPattern = pattern.toLowerCase();
  return context.monoBehaviours.filter(mb =>
    mb.name.toLowerCase().includes(lowerPattern) ||
    mb.fullName.toLowerCase().includes(lowerPattern)
  );
}

/**
 * Find classes by namespace
 */
export function findClassesByNamespace(context: RealDataTestContext, namespace: string): IL2CPPClass[] {
  return context.classes.filter(cls => cls.namespace === namespace);
}

/**
 * Get sample entities for testing (returns a few real entities for test validation)
 */
export function getSampleEntities(context: RealDataTestContext): {
  sampleClass: IL2CPPClass | undefined;
  sampleEnum: IL2CPPEnum | undefined;
  sampleMonoBehaviour: IL2CPPClass | undefined;
  sampleInterface: IL2CPPInterface | undefined;
} {
  return {
    sampleClass: context.classes[0],
    sampleEnum: context.enums[0],
    sampleMonoBehaviour: context.monoBehaviours[0],
    sampleInterface: context.interfaces[0]
  };
}

/**
 * Create a mock vector store interface that uses the real data
 * This allows existing tests to work with real data without major changes
 */
export function createRealDataVectorStore(context: RealDataTestContext) {
  return {
    similaritySearch: async (query: string, k: number = 5): Promise<Document[]> => {
      return await context.vectorStore.similaritySearch(query, k);
    },

    searchWithFilter: async (query: string, filter: Record<string, any>, k: number = 5): Promise<Document[]> => {
      // Perform similarity search first
      const results = await context.vectorStore.similaritySearch(query, k * 2); // Get more results to filter

      // Apply filters
      const filteredResults = results.filter(doc => {
        const metadata = doc.metadata;

        // Apply type filter
        if (filter.type && metadata.type !== filter.type) {
          return false;
        }

        // Apply namespace filter
        if (filter.namespace && metadata.namespace !== filter.namespace) {
          return false;
        }

        // Apply MonoBehaviour filter
        if (filter.isMonoBehaviour && !metadata.isMonoBehaviour) {
          return false;
        }

        return true;
      });

      // Return limited results
      return filteredResults.slice(0, k);
    },

    addDocuments: async (documents: Document[]): Promise<void> => {
      await context.vectorStore.addDocuments(documents);
    }
  };
}
