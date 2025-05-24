import { HashManager } from './hash-manager';
import { SupabaseHashManager, IHashManager } from './supabase-hash-manager';

/**
 * Configuration for hash manager creation
 */
export interface HashManagerConfig {
  /** Path to local hash file (for local storage) */
  hashFilePath?: string;
  /** Supabase URL (for Supabase storage) */
  supabaseUrl?: string;
  /** Supabase API key (for Supabase storage) */
  supabaseKey?: string;
  /** Supabase table name for file hashes */
  supabaseTable?: string;
  /** Force use of local storage even if Supabase is configured */
  forceLocal?: boolean;
}

/**
 * Factory function to create the appropriate hash manager based on configuration
 * @param config Configuration object
 * @returns Hash manager instance (either local or Supabase-backed)
 */
export function createHashManager(config: HashManagerConfig = {}): IHashManager {
  // Check if Supabase configuration is available and not forced to use local
  const useSupabase = !config.forceLocal && 
                     config.supabaseUrl && 
                     config.supabaseKey;

  if (useSupabase) {
    console.log('Using Supabase hash manager for file hash storage');
    return new SupabaseHashManager(
      config.supabaseUrl!,
      config.supabaseKey!,
      config.supabaseTable || 'file_hashes'
    );
  } else {
    console.log('Using local file hash manager for file hash storage');
    return new HashManager(config.hashFilePath);
  }
}

/**
 * Create hash manager from environment variables
 * @param hashFilePath Optional path to local hash file
 * @returns Hash manager instance
 */
export function createHashManagerFromEnv(hashFilePath?: string): IHashManager {
  const config: HashManagerConfig = {
    hashFilePath,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY,
    supabaseTable: process.env.SUPABASE_FILE_HASHES_TABLE || 'file_hashes'
  };

  return createHashManager(config);
}
