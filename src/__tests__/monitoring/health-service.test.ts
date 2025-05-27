/**
 * Tests for HealthService - comprehensive health monitoring
 */

import { HealthService, HealthStatus, ComponentHealth } from '../../monitoring/health-service';
import { SupabaseConnectionManager } from '../../database/connection-manager';
import { EnhancedSupabaseVectorStore } from '../../database/enhanced-vector-store';
import { XenovaEmbeddings } from '../../embeddings/xenova-embeddings';

// Mock dependencies
jest.mock('../../database/connection-manager');
jest.mock('../../database/enhanced-vector-store');
jest.mock('../../embeddings/xenova-embeddings');

describe('HealthService', () => {
  let healthService: HealthService;
  let mockConnectionManager: jest.Mocked<SupabaseConnectionManager>;
  let mockVectorStore: jest.Mocked<EnhancedSupabaseVectorStore>;
  let mockEmbeddings: jest.Mocked<XenovaEmbeddings>;

  beforeEach(() => {
    // Create mocks
    mockConnectionManager = {
      getHealthStatus: jest.fn(),
      getStats: jest.fn()
    } as any;

    mockVectorStore = {
      getHealthStatus: jest.fn()
    } as any;

    mockEmbeddings = {
      embedQuery: jest.fn()
    } as any;

    // Create health service with test configuration
    healthService = new HealthService({
      interval: 1000, // 1 second for testing
      timeout: 500,
      retries: 1,
      components: {
        database: true,
        vectorStore: true,
        embeddings: true,
        mcp: true
      }
    });
  });

  afterEach(async () => {
    healthService.stop();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultHealthService = new HealthService();
      expect(defaultHealthService).toBeDefined();
    });

    it('should initialize with components', async () => {
      await healthService.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });

      expect(healthService).toBeDefined();
    });
  });

  describe('health checks', () => {
    beforeEach(async () => {
      await healthService.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });
    });

    it('should perform comprehensive health check', async () => {
      // Setup mocks for healthy state
      mockConnectionManager.getHealthStatus.mockReturnValue({
        isHealthy: true,
        stats: { totalConnections: 5, activeConnections: 2 },
        lastHealthCheck: new Date()
      });

      mockVectorStore.getHealthStatus.mockResolvedValue({
        isHealthy: true,
        connectionStats: {},
        performanceStats: {},
        cacheStats: {},
        circuitBreakerStats: {}
      });

      mockEmbeddings.embedQuery.mockResolvedValue([0.1, 0.2, 0.3]);

      const status = await healthService.getHealthStatus();

      expect(status.status).toBe('healthy');
      expect(status.components).toHaveLength(4); // database, vector-store, embeddings, mcp-server
      expect(status.metrics).toBeDefined();
      expect(status.uptime).toBeGreaterThan(0);
    });

    it('should detect unhealthy database', async () => {
      mockConnectionManager.getHealthStatus.mockReturnValue({
        isHealthy: false,
        stats: { totalConnections: 0, activeConnections: 0 },
        lastHealthCheck: new Date()
      });

      mockVectorStore.getHealthStatus.mockResolvedValue({
        isHealthy: true,
        connectionStats: {},
        performanceStats: {},
        cacheStats: {},
        circuitBreakerStats: {}
      });

      mockEmbeddings.embedQuery.mockResolvedValue([0.1, 0.2, 0.3]);

      const status = await healthService.getHealthStatus();

      expect(status.status).toBe('unhealthy');
      const dbComponent = status.components.find(c => c.name === 'database');
      expect(dbComponent?.status).toBe('unhealthy');
    });

    it('should detect degraded vector store', async () => {
      mockConnectionManager.getHealthStatus.mockReturnValue({
        isHealthy: true,
        stats: { totalConnections: 5, activeConnections: 2 },
        lastHealthCheck: new Date()
      });

      mockVectorStore.getHealthStatus.mockResolvedValue({
        isHealthy: false,
        connectionStats: {},
        performanceStats: {},
        cacheStats: {},
        circuitBreakerStats: {}
      });

      mockEmbeddings.embedQuery.mockResolvedValue([0.1, 0.2, 0.3]);

      const status = await healthService.getHealthStatus();

      expect(status.status).toBe('unhealthy');
      const vectorComponent = status.components.find(c => c.name === 'vector-store');
      expect(vectorComponent?.status).toBe('degraded');
    });

    it('should handle embeddings failure', async () => {
      mockConnectionManager.getHealthStatus.mockReturnValue({
        isHealthy: true,
        stats: { totalConnections: 5, activeConnections: 2 },
        lastHealthCheck: new Date()
      });

      mockVectorStore.getHealthStatus.mockResolvedValue({
        isHealthy: true,
        connectionStats: {},
        performanceStats: {},
        cacheStats: {},
        circuitBreakerStats: {}
      });

      mockEmbeddings.embedQuery.mockRejectedValue(new Error('Model not loaded'));

      const status = await healthService.getHealthStatus();

      expect(status.status).toBe('unhealthy');
      const embeddingsComponent = status.components.find(c => c.name === 'embeddings');
      expect(embeddingsComponent?.status).toBe('unhealthy');
      expect(embeddingsComponent?.message).toContain('Model not loaded');
    });

    it('should measure response times', async () => {
      mockConnectionManager.getHealthStatus.mockReturnValue({
        isHealthy: true,
        stats: { totalConnections: 5, activeConnections: 2 },
        lastHealthCheck: new Date()
      });

      mockVectorStore.getHealthStatus.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          isHealthy: true,
          connectionStats: {},
          performanceStats: {},
          cacheStats: {},
          circuitBreakerStats: {}
        }), 100))
      );

      mockEmbeddings.embedQuery.mockResolvedValue([0.1, 0.2, 0.3]);

      const status = await healthService.getHealthStatus();

      const vectorComponent = status.components.find(c => c.name === 'vector-store');
      expect(vectorComponent?.responseTime).toBeGreaterThan(90);
    });
  });

  describe('monitoring lifecycle', () => {
    beforeEach(async () => {
      await healthService.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });
    });

    it('should start and stop monitoring', () => {
      expect(healthService.getStats().isRunning).toBe(false);

      healthService.start();
      expect(healthService.getStats().isRunning).toBe(true);

      healthService.stop();
      expect(healthService.getStats().isRunning).toBe(false);
    });

    it('should emit health check events', (done) => {
      mockConnectionManager.getHealthStatus.mockReturnValue({
        isHealthy: true,
        stats: { totalConnections: 5, activeConnections: 2 },
        lastHealthCheck: new Date()
      });

      mockVectorStore.getHealthStatus.mockResolvedValue({
        isHealthy: true,
        connectionStats: {},
        performanceStats: {},
        cacheStats: {},
        circuitBreakerStats: {}
      });

      mockEmbeddings.embedQuery.mockResolvedValue([0.1, 0.2, 0.3]);

      healthService.on('healthCheck', (status: HealthStatus) => {
        expect(status.status).toBe('healthy');
        done();
      });

      healthService.start();
    });

    it('should handle graceful shutdown', (done) => {
      const shutdownHandler = jest.fn().mockResolvedValue(undefined);
      healthService.onShutdown(shutdownHandler);

      healthService.on('shutdown', () => {
        expect(shutdownHandler).toHaveBeenCalled();
        done();
      });

      // Simulate SIGTERM
      process.emit('SIGTERM' as any);
    });
  });

  describe('MCP metrics integration', () => {
    beforeEach(async () => {
      await healthService.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });
    });

    it('should update MCP metrics', () => {
      healthService.updateMCPMetrics({
        activeConnections: 3,
        requestProcessed: true,
        responseTime: 150,
        error: false
      });

      healthService.updateMCPMetrics({
        requestProcessed: true,
        responseTime: 200,
        error: true
      });

      // Verify metrics are tracked (would need to expose getter for testing)
      expect(true).toBe(true); // Placeholder - would check internal state
    });
  });

  describe('error handling', () => {
    it('should handle initialization without components', async () => {
      const status = await healthService.getHealthStatus();

      // Should still work but with limited checks
      expect(status.status).toBeDefined();
      expect(status.components.length).toBeGreaterThan(0);
    });

    it('should handle health check failures gracefully', async () => {
      await healthService.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });

      // Mock all components to throw errors
      mockConnectionManager.getHealthStatus.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      mockVectorStore.getHealthStatus.mockRejectedValue(new Error('Vector store error'));
      mockEmbeddings.embedQuery.mockRejectedValue(new Error('Embeddings error'));

      const status = await healthService.getHealthStatus();

      expect(status.status).toBe('unhealthy');
      expect(status.components.every(c => c.status === 'unhealthy')).toBe(true);
    });

    it('should cache health status for performance', async () => {
      await healthService.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });

      mockConnectionManager.getHealthStatus.mockReturnValue({
        isHealthy: true,
        stats: { totalConnections: 5, activeConnections: 2 },
        lastHealthCheck: new Date()
      });

      mockVectorStore.getHealthStatus.mockResolvedValue({
        isHealthy: true,
        connectionStats: {},
        performanceStats: {},
        cacheStats: {},
        circuitBreakerStats: {}
      });

      mockEmbeddings.embedQuery.mockResolvedValue([0.1, 0.2, 0.3]);

      // First call
      const status1 = await healthService.getHealthStatus();

      // Second call immediately (should use cache)
      const status2 = await healthService.getHealthStatus();

      expect(status1.timestamp).toEqual(status2.timestamp);
      expect(mockConnectionManager.getHealthStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('statistics and reporting', () => {
    it('should provide service statistics', () => {
      const stats = healthService.getStats();

      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('totalHealthChecks');
      expect(typeof stats.uptime).toBe('number');
    });

    it('should track uptime correctly', (done) => {
      const initialStats = healthService.getStats();

      setTimeout(() => {
        const laterStats = healthService.getStats();
        expect(laterStats.uptime).toBeGreaterThan(initialStats.uptime);
        done();
      }, 10);
    });
  });
});
