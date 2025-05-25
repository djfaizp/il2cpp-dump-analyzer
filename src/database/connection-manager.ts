import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  /** Maximum number of connections in the pool */
  maxConnections?: number;
  /** Minimum number of connections to maintain */
  minConnections?: number;
  /** Connection idle timeout in milliseconds */
  idleTimeoutMs?: number;
  /** Connection acquisition timeout in milliseconds */
  acquireTimeoutMs?: number;
  /** Enable connection health checks */
  enableHealthChecks?: boolean;
  /** Health check interval in milliseconds */
  healthCheckIntervalMs?: number;
}

/**
 * Connection pool statistics
 */
export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalAcquired: number;
  totalReleased: number;
  totalCreated: number;
  totalDestroyed: number;
}

/**
 * Enhanced Supabase connection manager with pooling and health monitoring
 */
export class SupabaseConnectionManager {
  private static instance: SupabaseConnectionManager;
  private client: SupabaseClient | null = null;
  private config: ConnectionPoolConfig;
  private stats: PoolStats;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isHealthy: boolean = true;
  private lastHealthCheck: Date | null = null;

  private constructor(
    private supabaseUrl: string,
    private supabaseKey: string,
    config: ConnectionPoolConfig = {}
  ) {
    this.config = {
      maxConnections: 10,
      minConnections: 2,
      idleTimeoutMs: 30000,
      acquireTimeoutMs: 10000,
      enableHealthChecks: true,
      healthCheckIntervalMs: 60000,
      ...config
    };

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      totalAcquired: 0,
      totalReleased: 0,
      totalCreated: 0,
      totalDestroyed: 0
    };

    this.initialize();
  }

  /**
   * Get singleton instance of connection manager
   */
  public static getInstance(
    supabaseUrl?: string,
    supabaseKey?: string,
    config?: ConnectionPoolConfig
  ): SupabaseConnectionManager {
    if (!SupabaseConnectionManager.instance) {
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase URL and key are required for first initialization');
      }
      SupabaseConnectionManager.instance = new SupabaseConnectionManager(
        supabaseUrl,
        supabaseKey,
        config
      );
    }
    return SupabaseConnectionManager.instance;
  }

  /**
   * Initialize the connection manager
   */
  private async initialize(): Promise<void> {
    try {
      // Create the primary client with optimized settings
      this.client = createClient(this.supabaseUrl, this.supabaseKey, {
        auth: {
          persistSession: false, // Disable session persistence for server-side usage
          autoRefreshToken: false
        },
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'x-client-info': 'il2cpp-dump-analyzer-mcp'
          }
        }
      });

      this.stats.totalCreated++;
      this.stats.totalConnections++;

      // Start health checks if enabled
      if (this.config.enableHealthChecks) {
        this.startHealthChecks();
      }

      console.log('Supabase connection manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Supabase connection manager:', error);
      throw error;
    }
  }

  /**
   * Get a database client
   */
  public getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('Connection manager not initialized');
    }

    if (!this.isHealthy) {
      throw new Error('Database connection is unhealthy');
    }

    this.stats.totalAcquired++;
    this.stats.activeConnections++;

    return this.client;
  }

  /**
   * Release a database client (for compatibility with pooling patterns)
   */
  public releaseClient(): void {
    this.stats.totalReleased++;
    if (this.stats.activeConnections > 0) {
      this.stats.activeConnections--;
    }
  }

  /**
   * Start health check monitoring
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckIntervalMs!);

    // Perform initial health check
    this.performHealthCheck();
  }

  /**
   * Perform a health check on the database connection
   */
  private async performHealthCheck(): Promise<void> {
    try {
      if (!this.client) {
        this.isHealthy = false;
        return;
      }

      // Simple health check query
      const { error } = await this.client
        .from('il2cpp_documents')
        .select('id')
        .limit(1);

      this.isHealthy = !error;
      this.lastHealthCheck = new Date();

      if (error) {
        console.warn('Database health check failed:', error);
      }
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = new Date();
      console.warn('Database health check error:', error);
    }
  }

  /**
   * Get connection pool statistics
   */
  public getStats(): PoolStats {
    return { ...this.stats };
  }

  /**
   * Get health status
   */
  public getHealthStatus(): {
    isHealthy: boolean;
    lastHealthCheck: Date | null;
    stats: PoolStats;
  } {
    return {
      isHealthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck,
      stats: this.getStats()
    };
  }

  /**
   * Cleanup and close connections
   */
  public async cleanup(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Note: Supabase client doesn't have explicit close method
    // but we can mark it as cleaned up
    this.client = null;
    this.stats.totalDestroyed++;
    this.stats.totalConnections = 0;
    this.stats.activeConnections = 0;

    console.log('Supabase connection manager cleaned up');
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  public static reset(): void {
    if (SupabaseConnectionManager.instance) {
      SupabaseConnectionManager.instance.cleanup();
      SupabaseConnectionManager.instance = null as any;
    }
  }
}

/**
 * Factory function to create connection manager from environment variables
 */
export function createConnectionManager(config?: ConnectionPoolConfig): SupabaseConnectionManager {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
  }

  return SupabaseConnectionManager.getInstance(supabaseUrl, supabaseKey, config);
}
