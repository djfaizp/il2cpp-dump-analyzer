import * as fs from 'fs';
import * as path from 'path';
import { EnhancedIL2CPPDumpParser } from '../parser/enhanced-il2cpp-parser';
import { IL2CPPCodeChunker, CodeChunk } from '../embeddings/chunker';
import { IL2CPPVectorStore } from '../embeddings/vector-store';
import { IL2CPPClass, IL2CPPEnum, IL2CPPInterface, EnhancedParseResult } from '../parser/enhanced-types';

/**
 * Manages the indexing process for IL2CPP dump files
 */
export class IL2CPPIndexer {
  private parser: EnhancedIL2CPPDumpParser;
  private chunker: IL2CPPCodeChunker;
  private vectorStore: IL2CPPVectorStore;

  constructor(
    private readonly chunkSize: number = 1000,
    private readonly chunkOverlap: number = 200
  ) {
    this.parser = new EnhancedIL2CPPDumpParser();
    this.chunker = new IL2CPPCodeChunker(chunkSize, chunkOverlap);
    this.vectorStore = new IL2CPPVectorStore();
  }

  /**
   * Index an IL2CPP dump file
   * @param filePath Path to the dump.cs file
   * @param progressCallback Optional callback for progress updates
   * @returns The vector store with indexed content
   */
  public async indexFile(
    filePath: string,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<IL2CPPVectorStore> {
    // Load and parse the file
    await this.parser.loadFile(filePath);

    if (progressCallback) {
      progressCallback(10, 'File loaded. Extracting classes...');
    }

    // Extract all entities using enhanced parser
    const result = this.parser.extractAllConstructs();

    if (progressCallback) {
      progressCallback(30, `Extracted ${result.statistics.totalConstructs} constructs (${result.statistics.coveragePercentage.toFixed(1)}% coverage). Creating chunks...`);
    }

    const classes = result.classes;
    const enums = result.enums;
    const delegates = result.delegates;
    const generics = result.generics;
    const nestedTypes = result.nestedTypes;

    if (progressCallback) {
      progressCallback(40, `Processing ${classes.length} classes, ${enums.length} enums, ${delegates.length} delegates, ${generics.length} generics, ${nestedTypes.length} nested types...`);
    }

    // Create chunks
    const chunks: CodeChunk[] = [];

    // Process classes in batches to avoid memory issues
    const classBatchSize = 100;
    for (let i = 0; i < classes.length; i += classBatchSize) {
      const batch = classes.slice(i, i + classBatchSize);
      const batchChunks = await this.processClassBatch(batch);
      chunks.push(...batchChunks);

      if (progressCallback) {
        const progress = 40 + Math.floor((i / classes.length) * 30);
        progressCallback(progress, `Processed ${i + batch.length}/${classes.length} classes...`);
      }
    }

    // Process enums
    for (const enumEntity of enums) {
      const enumChunks = await this.chunker.chunkEnum(enumEntity);
      chunks.push(...enumChunks);
    }

    // Process delegates as special classes
    for (const delegate of delegates) {
      const delegateAsClass: IL2CPPClass = {
        name: delegate.name,
        namespace: delegate.namespace,
        fullName: delegate.fullName,
        baseClass: 'MulticastDelegate',
        interfaces: [],
        fields: [],
        methods: [delegate.invokeMethod, delegate.constructorMethod].filter(Boolean),
        isMonoBehaviour: false,
        typeDefIndex: delegate.typeDefIndex
      };
      const delegateChunks = await this.chunker.chunkClass(delegateAsClass);
      chunks.push(...delegateChunks);
    }

    // Process generics as enhanced classes
    for (const generic of generics) {
      const genericAsClass: IL2CPPClass = {
        name: generic.name,
        namespace: generic.namespace,
        fullName: generic.fullName,
        baseClass: generic.baseClass,
        interfaces: generic.interfaces,
        fields: generic.fields,
        methods: generic.methods,
        isMonoBehaviour: false,
        typeDefIndex: generic.typeDefIndex
      };
      const genericChunks = await this.chunker.chunkClass(genericAsClass);
      chunks.push(...genericChunks);
    }

    // Process nested types as classes
    for (const nested of nestedTypes) {
      const nestedAsClass: IL2CPPClass = {
        name: nested.name,
        namespace: nested.namespace,
        fullName: nested.fullName,
        baseClass: nested.baseClass,
        interfaces: nested.interfaces,
        fields: nested.fields,
        methods: nested.methods,
        isMonoBehaviour: false,
        typeDefIndex: nested.typeDefIndex
      };
      const nestedChunks = await this.chunker.chunkClass(nestedAsClass);
      chunks.push(...nestedChunks);
    }

    if (progressCallback) {
      progressCallback(70, `Created ${chunks.length} chunks. Adding to vector store...`);
    }

    // Add chunks to vector store
    await this.vectorStore.addCodeChunks(chunks);

    if (progressCallback) {
      progressCallback(100, 'Indexing complete!');
    }

    return this.vectorStore;
  }

  /**
   * Process a batch of classes to create chunks
   * @param classes Batch of classes to process
   * @returns Array of code chunks
   */
  private async processClassBatch(classes: IL2CPPClass[]): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    for (const classEntity of classes) {
      const classChunks = await this.chunker.chunkClass(classEntity);
      chunks.push(...classChunks);
    }

    return chunks;
  }

  /**
   * Get the vector store instance
   * @returns Vector store instance
   */
  public getVectorStore(): IL2CPPVectorStore {
    return this.vectorStore;
  }
}
