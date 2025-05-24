import * as fs from 'fs';
import * as path from 'path';
import { EnhancedIL2CPPDumpParser } from '../parser/enhanced-il2cpp-parser';
import { IL2CPPCodeChunker, CodeChunk } from '../embeddings/chunker';
import { IL2CPPVectorStore } from '../embeddings/vector-store';
import { IL2CPPClass, IL2CPPEnum, IL2CPPInterface, EnhancedParseResult } from '../parser/enhanced-types';
import { createHashManagerFromEnv } from '../utils/hash-manager-factory';
import { IHashManager } from '../utils/supabase-hash-manager';

/**
 * Manages the indexing process for IL2CPP dump files
 */
export class IL2CPPIndexer {
  private parser: EnhancedIL2CPPDumpParser;
  private chunker: IL2CPPCodeChunker;
  private vectorStore: IL2CPPVectorStore;
  private hashManager: IHashManager;

  constructor(
    private readonly chunkSize: number = 1000,
    private readonly chunkOverlap: number = 200,
    private readonly model?: string,
    hashFilePath?: string
  ) {
    this.parser = new EnhancedIL2CPPDumpParser();
    this.chunker = new IL2CPPCodeChunker(chunkSize, chunkOverlap);
    this.vectorStore = new IL2CPPVectorStore(model);
    this.hashManager = createHashManagerFromEnv(hashFilePath);
  }

  /**
   * Index an IL2CPP dump file
   * @param filePath Path to the dump.cs file
   * @param progressCallback Optional callback for progress updates
   * @param forceReprocess Force reprocessing even if file was already processed
   * @returns The vector store with indexed content
   */
  public async indexFile(
    filePath: string,
    progressCallback?: (progress: number, message: string) => void,
    forceReprocess: boolean = false
  ): Promise<IL2CPPVectorStore> {
    // Initialize hash manager if it supports async initialization
    if (this.hashManager.initialize) {
      await this.hashManager.initialize();
    }

    // Check if file was already processed (unless forced)
    let isProcessed = false;
    if (!forceReprocess) {
      if (this.hashManager.isFileProcessedAsync) {
        // Use async method for Supabase hash manager
        isProcessed = await this.hashManager.isFileProcessedAsync(filePath);
      } else {
        // Use sync method for local hash manager
        isProcessed = this.hashManager.isFileProcessed(filePath);
      }
    }

    if (isProcessed) {
      const hash = this.hashManager.getFileHash(filePath);
      const fileName = path.basename(filePath);
      if (progressCallback) {
        progressCallback(100, `Skipping duplicate file: ${fileName} (hash: ${hash.substring(0, 8)}...)`);
      }
      console.log(`Skipping already processed file: ${fileName} (hash: ${hash.substring(0, 8)}...)`);
      return this.vectorStore;
    }

    // Calculate and log file hash
    const fileHash = this.hashManager.getFileHash(filePath);
    const fileName = path.basename(filePath);
    console.log(`Processing file: ${fileName} (hash: ${fileHash.substring(0, 8)}...)`);

    if (progressCallback) {
      progressCallback(5, `Processing file: ${fileName} (hash: ${fileHash.substring(0, 8)}...)`);
    }

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

    // Mark file as processed
    this.hashManager.markFileAsProcessed(filePath);

    if (progressCallback) {
      progressCallback(100, `Indexing complete! File hash ${fileHash.substring(0, 8)}... saved to skip future duplicates.`);
    }

    console.log(`File processed and hash saved: ${fileName} (${fileHash.substring(0, 8)}...)`);
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

  /**
   * Get the hash manager instance
   * @returns Hash manager instance
   */
  public getHashManager(): IHashManager {
    return this.hashManager;
  }

  /**
   * Check if a file has been processed before
   * @param filePath Path to the dump.cs file
   * @returns true if file was already processed
   */
  public isFileProcessed(filePath: string): boolean {
    return this.hashManager.isFileProcessed(filePath);
  }

  /**
   * Check if a file has been processed before (async version)
   * @param filePath Path to the dump.cs file
   * @returns Promise that resolves to true if file was already processed
   */
  public async isFileProcessedAsync(filePath: string): Promise<boolean> {
    // Initialize hash manager if it supports async initialization
    if (this.hashManager.initialize) {
      await this.hashManager.initialize();
    }

    if (this.hashManager.isFileProcessedAsync) {
      return await this.hashManager.isFileProcessedAsync(filePath);
    } else {
      return this.hashManager.isFileProcessed(filePath);
    }
  }

  /**
   * Get the hash of a file
   * @param filePath Path to the dump.cs file
   * @returns SHA-256 hash of the file
   */
  public getFileHash(filePath: string): string {
    return this.hashManager.getFileHash(filePath);
  }

  /**
   * Remove a file from the processed list (to allow reprocessing)
   * @param filePath Path to the dump.cs file
   * @returns true if hash was removed
   */
  public removeFileFromProcessed(filePath: string): boolean {
    return this.hashManager.removeFileHash(filePath);
  }

  /**
   * Clear all processed file hashes
   */
  public clearAllProcessedFiles(): void {
    this.hashManager.clearAllHashes();
  }

  /**
   * Get information about processed files
   * @returns Object with hash storage info
   */
  public getProcessedFilesInfo(): { hashFilePath?: string; processedCount: number } {
    return this.hashManager.getInfo();
  }

  /**
   * Get all processed file hashes
   * @returns Array of all stored hashes
   */
  public getAllProcessedHashes(): string[] {
    return this.hashManager.getAllHashes();
  }
}
