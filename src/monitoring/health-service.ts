/**
 * Comprehensive health monitoring service for IL2CPP dump analyzer MCP system
 * Provides health checks, metrics collection, and lifecycle management
 */

import { EventEmitter } from 'events';
import { SupabaseConnectionManager } from '../database/connection-manager.js';
import { EnhancedSupabaseVectorStore } from '../database/enhanced-vector-store.js';
import { XenovaEmbeddings } from '../embeddings/xenova-embeddings.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  components: ComponentHealth[];
  metrics: HealthMetrics;
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  lastCheck: Date;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface HealthMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
    heapUsed: number;
    heapTotal: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  database: {
    connectionCount: number;
    activeQueries: number;
    avgResponseTime: number;
    errorRate: number;
  };
  embeddings: {
    modelLoaded: boolean;
    cacheSize: number;
    avgProcessingTime: number;
  };
  mcp: {
    activeConnections: number;
    totalRequests: number;
    avgResponseTime: number;
    errorRate: number;
  };
}

export interface HealthCheckConfig {
  interval: number;
  timeout: number;
  retries: number;
  gracefulShutdownTimeout: number;
  components: {
    database: boolean;
    vectorStore: boolean;
    embeddings: boolean;
    mcp: boolean;
  };
}

/**
 * Health monitoring service with comprehensive component checking
 */
export class HealthService extends EventEmitter {
  private config: HealthCheckConfig;
  private isRunning: boolean = false;
  private healthCheckInterval?: NodeJS.Timeout;
  private startTime: Date;
  private lastHealthStatus?: HealthStatus;
  private shutdownHandlers: Array<() => Promise<void>> = [];

  // Component instances
  private connectionManager?: SupabaseConnectionManager;
  private vectorStore?: EnhancedSupabaseVectorStore;
  private embeddings?: XenovaEmbeddings;

  // Metrics tracking
  private mcpMetrics = {
    activeConnections: 0,
    totalRequests: 0,
    responseTimeSum: 0,
    errorCount: 0
  };

  constructor(config?: Partial<HealthCheckConfig>) {
    super();

    this.config = {
      interval: 30000, // 30 seconds
      timeout: 10000,  // 10 seconds
      retries: 3,
      gracefulShutdownTimeout: 30000, // 30 seconds
      components: {
        database: true,
        vectorStore: true,
        embeddings: true,
        mcp: true
      },
      ...config
    };

    this.startTime = new Date();
    this.setupSignalHandlers();
  }

  /**
   * Initialize health service with component dependencies
   */
  async initialize(components: {
    connectionManager?: SupabaseConnectionManager;
    vectorStore?: EnhancedSupabaseVectorStore;
    embeddings?: XenovaEmbeddings;
  }): Promise<void> {
    this.connectionManager = components.connectionManager;
    this.vectorStore = components.vectorStore;
    this.embeddings = components.embeddings;

    console.log('Health service initialized with components:', {
      database: !!this.connectionManager,
      vectorStore: !!this.vectorStore,
      embeddings: !!this.embeddings
    });
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Health service is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting health monitoring with ${this.config.interval}ms interval`);

    // Perform initial health check
    this.performHealthCheck();

    // Schedule periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.interval);

    this.emit('started');
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    console.log('Health monitoring stopped');
    this.emit('stopped');
  }

  /**
   * Get current health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    if (this.lastHealthStatus &&
        Date.now() - this.lastHealthStatus.timestamp.getTime() < 5000) {
      // Return cached status if less than 5 seconds old
      return this.lastHealthStatus;
    }

    return this.performHealthCheck();
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    const components: ComponentHealth[] = [];

    try {
      // Check database health
      if (this.config.components.database && this.connectionManager) {
        components.push(await this.checkDatabaseHealth());
      }

      // Check vector store health
      if (this.config.components.vectorStore && this.vectorStore) {
        components.push(await this.checkVectorStoreHealth());
      }

      // Check embeddings health
      if (this.config.components.embeddings && this.embeddings) {
        components.push(await this.checkEmbeddingsHealth());
      }

      // Check MCP server health
      if (this.config.components.mcp) {
        components.push(await this.checkMCPHealth());
      }

      // Determine overall status
      const overallStatus = this.determineOverallStatus(components);

      // Collect metrics
      const metrics = await this.collectMetrics();

      const healthStatus: HealthStatus = {
        status: overallStatus,
        timestamp: new Date(),
        uptime: Date.now() - this.startTime.getTime(),
        version: process.env.npm_package_version || '1.0.0',
        components,
        metrics
      };

      this.lastHealthStatus = healthStatus;

      // Emit health status event
      this.emit('healthCheck', healthStatus);

      // Log health status changes
      if (this.lastHealthStatus?.status !== overallStatus) {
        console.log(`Health status changed to: ${overallStatus}`);
      }

      return healthStatus;

    } catch (error) {
      console.error('Health check failed:', error);

      const errorStatus: HealthStatus = {
        status: 'unhealthy',
        timestamp: new Date(),
        uptime: Date.now() - this.startTime.getTime(),
        version: process.env.npm_package_version || '1.0.0',
        components: [{
          name: 'health-service',
          status: 'unhealthy',
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          lastCheck: new Date()
        }],
        metrics: await this.collectMetrics()
      };

      this.emit('healthCheck', errorStatus);
      return errorStatus;
    }
  }

  /**
   * Check database connection health
   */
  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      if (!this.connectionManager) {
        return {
          name: 'database',
          status: 'unhealthy',
          message: 'Database connection manager not initialized',
          lastCheck: new Date()
        };
      }

      const healthStatus = this.connectionManager.getHealthStatus();
      const responseTime = Date.now() - startTime;

      return {
        name: 'database',
        status: healthStatus.isHealthy ? 'healthy' : 'unhealthy',
        message: healthStatus.isHealthy ? 'Database connection healthy' : 'Database connection issues',
        lastCheck: new Date(),
        responseTime,
        details: {
          connectionStats: healthStatus.stats,
          lastHealthCheck: healthStatus.lastHealthCheck
        }
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        message: `Database health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastCheck: new Date(),
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check vector store health
   */
  private async checkVectorStoreHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      if (!this.vectorStore) {
        return {
          name: 'vector-store',
          status: 'unhealthy',
          message: 'Vector store not initialized',
          lastCheck: new Date()
        };
      }

      const healthStatus = await this.vectorStore.getHealthStatus();
      const responseTime = Date.now() - startTime;

      return {
        name: 'vector-store',
        status: healthStatus.isHealthy ? 'healthy' : 'degraded',
        message: healthStatus.isHealthy ? 'Vector store healthy' : 'Vector store issues detected',
        lastCheck: new Date(),
        responseTime,
        details: {
          performanceStats: healthStatus.performanceStats,
          cacheStats: healthStatus.cacheStats,
          circuitBreakerStats: healthStatus.circuitBreakerStats
        }
      };
    } catch (error) {
      return {
        name: 'vector-store',
        status: 'unhealthy',
        message: `Vector store health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastCheck: new Date(),
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check embeddings model health
   */
  private async checkEmbeddingsHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      if (!this.embeddings) {
        return {
          name: 'embeddings',
          status: 'unhealthy',
          message: 'Embeddings service not initialized',
          lastCheck: new Date()
        };
      }

      // Test embeddings with a simple query
      await this.embeddings.embedQuery('health check test');
      const responseTime = Date.now() - startTime;

      return {
        name: 'embeddings',
        status: 'healthy',
        message: 'Embeddings model healthy',
        lastCheck: new Date(),
        responseTime,
        details: {
          modelName: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384
        }
      };
    } catch (error) {
      return {
        name: 'embeddings',
        status: 'unhealthy',
        message: `Embeddings health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastCheck: new Date(),
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check MCP server health
   */
  private async checkMCPHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Basic MCP health check - verify process is running
      const responseTime = Date.now() - startTime;

      return {
        name: 'mcp-server',
        status: 'healthy',
        message: 'MCP server healthy',
        lastCheck: new Date(),
        responseTime,
        details: {
          transport: 'stdio',
          activeConnections: this.mcpMetrics.activeConnections,
          totalRequests: this.mcpMetrics.totalRequests
        }
      };
    } catch (error) {
      return {
        name: 'mcp-server',
        status: 'unhealthy',
        message: `MCP server health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastCheck: new Date(),
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Determine overall health status from component statuses
   */
  private determineOverallStatus(components: ComponentHealth[]): 'healthy' | 'degraded' | 'unhealthy' {
    if (components.length === 0) {
      return 'unhealthy';
    }

    const unhealthyCount = components.filter(c => c.status === 'unhealthy').length;
    const degradedCount = components.filter(c => c.status === 'degraded').length;

    if (unhealthyCount > 0) {
      return 'unhealthy';
    } else if (degradedCount > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Collect system and application metrics
   */
  private async collectMetrics(): Promise<HealthMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      memory: {
        used: memUsage.rss,
        total: memUsage.rss + memUsage.heapTotal,
        percentage: (memUsage.rss / (memUsage.rss + memUsage.heapTotal)) * 100,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      },
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
      },
      database: await this.getDatabaseMetrics(),
      embeddings: await this.getEmbeddingsMetrics(),
      mcp: this.getMCPMetrics()
    };
  }

  /**
   * Get database-specific metrics
   */
  private async getDatabaseMetrics(): Promise<HealthMetrics['database']> {
    if (!this.connectionManager) {
      return {
        connectionCount: 0,
        activeQueries: 0,
        avgResponseTime: 0,
        errorRate: 0
      };
    }

    const stats = this.connectionManager.getStats();
    return {
      connectionCount: stats.totalConnections,
      activeQueries: stats.activeConnections,
      avgResponseTime: 0, // TODO: Implement from performance monitor
      errorRate: 0 // TODO: Implement from performance monitor
    };
  }

  /**
   * Get embeddings-specific metrics
   */
  private async getEmbeddingsMetrics(): Promise<HealthMetrics['embeddings']> {
    return {
      modelLoaded: !!this.embeddings,
      cacheSize: 0, // TODO: Implement cache size tracking
      avgProcessingTime: 0 // TODO: Implement from performance monitor
    };
  }

  /**
   * Get MCP server metrics
   */
  private getMCPMetrics(): HealthMetrics['mcp'] {
    const avgResponseTime = this.mcpMetrics.totalRequests > 0
      ? this.mcpMetrics.responseTimeSum / this.mcpMetrics.totalRequests
      : 0;

    const errorRate = this.mcpMetrics.totalRequests > 0
      ? this.mcpMetrics.errorCount / this.mcpMetrics.totalRequests
      : 0;

    return {
      activeConnections: this.mcpMetrics.activeConnections,
      totalRequests: this.mcpMetrics.totalRequests,
      avgResponseTime,
      errorRate
    };
  }

  /**
   * Update MCP metrics (called by MCP server)
   */
  updateMCPMetrics(metrics: {
    activeConnections?: number;
    requestProcessed?: boolean;
    responseTime?: number;
    error?: boolean;
  }): void {
    if (metrics.activeConnections !== undefined) {
      this.mcpMetrics.activeConnections = metrics.activeConnections;
    }

    if (metrics.requestProcessed) {
      this.mcpMetrics.totalRequests++;

      if (metrics.responseTime !== undefined) {
        this.mcpMetrics.responseTimeSum += metrics.responseTime;
      }

      if (metrics.error) {
        this.mcpMetrics.errorCount++;
      }
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;

    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`Received ${signal}, initiating graceful shutdown...`);
        await this.gracefulShutdown();
        process.exit(0);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      await this.gracefulShutdown();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      await this.gracefulShutdown();
      process.exit(1);
    });
  }

  /**
   * Perform graceful shutdown
   */
  private async gracefulShutdown(): Promise<void> {
    console.log('Starting graceful shutdown...');
    this.emit('shutdown');

    // Stop health monitoring
    this.stop();

    // Execute shutdown handlers
    const shutdownPromises = this.shutdownHandlers.map(async (handler, index) => {
      try {
        console.log(`Executing shutdown handler ${index + 1}/${this.shutdownHandlers.length}`);
        await Promise.race([
          handler(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Shutdown handler timeout')), 5000)
          )
        ]);
      } catch (error) {
        console.error(`Shutdown handler ${index + 1} failed:`, error);
      }
    });

    try {
      await Promise.all(shutdownPromises);
      console.log('Graceful shutdown completed');
    } catch (error) {
      console.error('Some shutdown handlers failed:', error);
    }
  }

  /**
   * Register a shutdown handler
   */
  onShutdown(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Get health service statistics
   */
  getStats(): {
    isRunning: boolean;
    uptime: number;
    lastHealthCheck?: Date;
    totalHealthChecks: number;
  } {
    return {
      isRunning: this.isRunning,
      uptime: Date.now() - this.startTime.getTime(),
      lastHealthCheck: this.lastHealthStatus?.timestamp,
      totalHealthChecks: this.listenerCount('healthCheck')
    };
  }
}
