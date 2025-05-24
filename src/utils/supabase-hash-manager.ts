import * as fs from 'fs';
import * as crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Interface for hash managers to ensure compatibility
 */
export interface IHashManager {
  calculateFileHash(filePath: string): string;
  isFileProcessed(filePath: string): boolean;
  markFileAsProcessed(filePath: string): string;
  getFileHash(filePath: string): string;
  removeFileHash(filePath: string): boolean;
  clearAllHashes(): void;
  getAllHashes(): string[];
  getProcessedCount(): number;
  getInfo(): { hashFilePath?: string; processedCount: number };
  // Optional async methods for better Supabase support
  initialize?(): Promise<void>;
  isFileProcessedAsync?(filePath: string): Promise<boolean>;
}

/**
 * Manages file hashes in Supabase to prevent duplicate processing of dump.cs files
 */
export class SupabaseHashManager implements IHashManager {
  private supabaseClient: SupabaseClient;
  private tableName: string;
  private processedHashes: Set<string> = new Set(); // Cache for performance
  private isInitialized: boolean = false;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    tableName: string = 'file_hashes'
  ) {
    this.supabaseClient = createClient(supabaseUrl, supabaseKey);
    this.tableName = tableName;
  }

  /**
   * Initialize the hash manager by loading existing hashes from Supabase
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Loading file hashes from Supabase...');
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .select('hash_value');

      if (error) {
        console.warn(`Warning: Could not load hashes from Supabase table ${this.tableName}:`, error);
        // Continue with empty cache - table might not exist yet
      } else if (data) {
        data.forEach(row => this.processedHashes.add(row.hash_value));
        console.log(`Loaded ${data.length} file hashes from Supabase`);
      }

      this.isInitialized = true;
    } catch (error) {
      console.warn('Warning: Could not initialize Supabase hash manager:', error);
      this.isInitialized = true; // Continue with empty cache
    }
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
   * @deprecated Use isFileProcessedAsync for proper async handling
   */
  public isFileProcessed(filePath: string): boolean {
    // For synchronous compatibility, we can only check the cache
    // If not initialized, we assume the file hasn't been processed
    if (!this.isInitialized) {
      console.warn('SupabaseHashManager not initialized. Use isFileProcessedAsync() or call initialize() first.');
      return false;
    }

    const hash = this.calculateFileHash(filePath);
    return this.processedHashes.has(hash);
  }

  /**
   * Async version that checks both cache and database
   */
  public async isFileProcessedAsync(filePath: string): Promise<boolean> {
    await this.initialize();

    const hash = this.calculateFileHash(filePath);

    // Check cache first
    if (this.processedHashes.has(hash)) {
      return true;
    }

    // Check database as fallback
    try {
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .select('id')
        .eq('file_path', filePath)
        .eq('hash_value', hash)
        .limit(1);

      if (error) {
        console.warn('Error checking if file was processed:', error);
        return false;
      }

      const isProcessed = data && data.length > 0;
      if (isProcessed) {
        // Update cache
        this.processedHashes.add(hash);
      }

      return isProcessed;
    } catch (error) {
      console.warn('Error checking if file was processed:', error);
      return false;
    }
  }

  /**
   * Mark a file as processed by storing its hash
   * @param filePath Path to the dump.cs file
   * @returns The hash that was stored
   */
  public markFileAsProcessed(filePath: string): string {
    const hash = this.calculateFileHash(filePath);

    // Fire and forget async operation
    this.markFileAsProcessedAsync(filePath).catch(error => {
      console.error('Error in async markFileAsProcessed:', error);
    });

    // Update cache immediately for synchronous behavior
    this.processedHashes.add(hash);

    return hash;
  }

  /**
   * Async version of markFileAsProcessed
   */
  public async markFileAsProcessedAsync(filePath: string): Promise<string> {
    await this.initialize();

    const hash = this.calculateFileHash(filePath);

    try {
      // Use upsert to handle both insert and update cases
      const { error } = await this.supabaseClient
        .from(this.tableName)
        .upsert({
          file_path: filePath,
          hash_value: hash
        }, {
          onConflict: 'file_path'
        });

      if (error) {
        console.error('Error marking file as processed:', error);
        throw error;
      }

      // Update cache
      this.processedHashes.add(hash);

      return hash;
    } catch (error) {
      console.error('Error marking file as processed:', error);
      throw error;
    }
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

    // Fire and forget async operation
    this.removeFileHashAsync(filePath).catch(error => {
      console.error('Error in async removeFileHash:', error);
    });

    // Update cache immediately for synchronous behavior
    return this.processedHashes.delete(hash);
  }

  /**
   * Async version of removeFileHash
   */
  public async removeFileHashAsync(filePath: string): Promise<boolean> {
    await this.initialize();

    const hash = this.calculateFileHash(filePath);

    try {
      const { error } = await this.supabaseClient
        .from(this.tableName)
        .delete()
        .eq('file_path', filePath);

      if (error) {
        console.error('Error removing file hash:', error);
        return false;
      }

      // Update cache
      this.processedHashes.delete(hash);

      return true;
    } catch (error) {
      console.error('Error removing file hash:', error);
      return false;
    }
  }

  /**
   * Clear all processed hashes
   */
  public clearAllHashes(): void {
    // Fire and forget async operation
    this.clearAllHashesAsync().catch(error => {
      console.error('Error in async clearAllHashes:', error);
    });

    // Clear cache immediately for synchronous behavior
    this.processedHashes.clear();
  }

  /**
   * Async version of clearAllHashes
   */
  public async clearAllHashesAsync(): Promise<void> {
    await this.initialize();

    try {
      const { error } = await this.supabaseClient
        .from(this.tableName)
        .delete()
        .neq('id', 0); // Delete all rows

      if (error) {
        console.error('Error clearing all hashes:', error);
        throw error;
      }

      // Clear cache
      this.processedHashes.clear();
    } catch (error) {
      console.error('Error clearing all hashes:', error);
      throw error;
    }
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
   * Get information about the hash storage
   * @returns Object with table name and count
   */
  public getInfo(): { hashFilePath?: string; processedCount: number } {
    return {
      hashFilePath: `Supabase table: ${this.tableName}`,
      processedCount: this.getProcessedCount()
    };
  }
}
