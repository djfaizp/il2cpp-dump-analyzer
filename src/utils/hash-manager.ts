import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IHashManager } from './supabase-hash-manager';

/**
 * Manages file hashes to prevent duplicate processing of dump.cs files
 */
export class HashManager implements IHashManager {
  private hashFilePath: string;
  private processedHashes: Set<string>;

  constructor(hashFilePath?: string) {
    // Default to storing hashes in a .processed_dumps file in the current directory
    this.hashFilePath = hashFilePath || path.join(process.cwd(), '.processed_dumps');
    this.processedHashes = new Set();
    this.loadHashes();
  }

  /**
   * Calculate SHA-256 hash of a file
   * @param filePath Path to the file
   * @returns SHA-256 hash as hex string
   */
  public calculateFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  /**
   * Check if a file has already been processed
   * @param filePath Path to the dump.cs file
   * @returns true if file was already processed, false otherwise
   */
  public isFileProcessed(filePath: string): boolean {
    const hash = this.calculateFileHash(filePath);
    return this.processedHashes.has(hash);
  }

  /**
   * Mark a file as processed by storing its hash
   * @param filePath Path to the dump.cs file
   * @returns The hash that was stored
   */
  public markFileAsProcessed(filePath: string): string {
    const hash = this.calculateFileHash(filePath);
    this.processedHashes.add(hash);
    this.saveHashes();
    return hash;
  }

  /**
   * Get the hash of a file without marking it as processed
   * @param filePath Path to the dump.cs file
   * @returns The SHA-256 hash of the file
   */
  public getFileHash(filePath: string): string {
    return this.calculateFileHash(filePath);
  }

  /**
   * Remove a hash from the processed list (useful for reprocessing)
   * @param filePath Path to the dump.cs file
   * @returns true if hash was removed, false if it wasn't found
   */
  public removeFileHash(filePath: string): boolean {
    const hash = this.calculateFileHash(filePath);
    const wasRemoved = this.processedHashes.delete(hash);
    if (wasRemoved) {
      this.saveHashes();
    }
    return wasRemoved;
  }

  /**
   * Clear all processed hashes
   */
  public clearAllHashes(): void {
    this.processedHashes.clear();
    this.saveHashes();
  }

  /**
   * Get all processed hashes
   * @returns Array of all stored hashes
   */
  public getAllHashes(): string[] {
    return Array.from(this.processedHashes);
  }

  /**
   * Get the number of processed files
   * @returns Count of processed files
   */
  public getProcessedCount(): number {
    return this.processedHashes.size;
  }

  /**
   * Load hashes from the storage file
   */
  private loadHashes(): void {
    try {
      if (fs.existsSync(this.hashFilePath)) {
        const content = fs.readFileSync(this.hashFilePath, 'utf8');
        const hashes = content.split('\n').filter(line => line.trim() !== '');
        this.processedHashes = new Set(hashes);
      }
    } catch (error) {
      console.warn(`Warning: Could not load hash file ${this.hashFilePath}:`, error);
      this.processedHashes = new Set();
    }
  }

  /**
   * Save hashes to the storage file
   */
  private saveHashes(): void {
    try {
      const content = Array.from(this.processedHashes).join('\n');
      fs.writeFileSync(this.hashFilePath, content, 'utf8');
    } catch (error) {
      console.error(`Error: Could not save hash file ${this.hashFilePath}:`, error);
    }
  }

  /**
   * Get information about the hash storage
   * @returns Object with hash file path and count
   */
  public getInfo(): { hashFilePath: string; processedCount: number } {
    return {
      hashFilePath: this.hashFilePath,
      processedCount: this.getProcessedCount()
    };
  }
}