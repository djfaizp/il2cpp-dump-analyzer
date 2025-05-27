/**
 * Integration tests for comprehensive monitoring system
 */

import { MonitoringIntegration } from '../../monitoring/monitoring-integration';
import { HealthService } from '../../monitoring/health-service';
import { MetricsService } from '../../monitoring/metrics-service';
import { LifecycleManager } from '../../monitoring/lifecycle-manager';
import { SupabaseConnectionManager } from '../../database/connection-manager';
import { EnhancedSupabaseVectorStore } from '../../database/enhanced-vector-store';
import { XenovaEmbeddings } from '../../embeddings/xenova-embeddings';

// Mock all dependencies
jest.mock('../../monitoring/health-service');
jest.mock('../../monitoring/metrics-service');
jest.mock('../../monitoring/lifecycle-manager');
jest.mock('../../database/connection-manager');
jest.mock('../../database/enhanced-vector-store');
jest.mock('../../embeddings/xenova-embeddings');

describe('MonitoringIntegration', () => {
  let monitoringIntegration: MonitoringIntegration;
  let mockHealthService: jest.Mocked<HealthService>;
  let mockMetricsService: jest.Mocked<MetricsService>;
  let mockLifecycleManager: jest.Mocked<LifecycleManager>;
  let mockConnectionManager: jest.Mocked<SupabaseConnectionManager>;
  let mockVectorStore: jest.Mocked<EnhancedSupabaseVectorStore>;
  let mockEmbeddings: jest.Mocked<XenovaEmbeddings>;

  beforeEach(() => {
    // Create mocks
    mockHealthService = {
      initialize: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      getHealthStatus: jest.fn(),
      getStats: jest.fn(),
      updateMCPMetrics: jest.fn(),
      on: jest.fn(),
      onShutdown: jest.fn()
    } as any;

    mockMetricsService = {
      initialize: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      recordMetric: jest.fn(),
      getPrometheusMetrics: jest.fn(),
      getMetricsSummary: jest.fn(),
      on: jest.fn()
    } as any;

    mockLifecycleManager = {
      initialize: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      getState: jest.fn(),
      getConfig: jest.fn(),
      forceRestart: jest.fn(),
      onStartup: jest.fn(),
      onShutdown: jest.fn(),
      on: jest.fn()
    } as any;

    mockConnectionManager = {} as any;
    mockVectorStore = {} as any;
    mockEmbeddings = {} as any;

    // Mock constructors
    (HealthService as jest.MockedClass<typeof HealthService>).mockImplementation(() => mockHealthService);
    (MetricsService as jest.MockedClass<typeof MetricsService>).mockImplementation(() => mockMetricsService);
    (LifecycleManager as jest.MockedClass<typeof LifecycleManager>).mockImplementation(() => mockLifecycleManager);

    monitoringIntegration = new MonitoringIntegration({
      enabled: true,
      healthChecks: {
        enabled: true,
        interval: 1000,
        timeout: 500
      },
      metrics: {
        enabled: true,
        exportInterval: 1000,
        prometheusEnabled: true
      },
      lifecycle: {
        enabled: true,
        restartPolicy: 'on-failure',
        maxRestarts: 3
      }
    });
  });

  afterEach(async () => {
    await monitoringIntegration.stop();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultIntegration = new MonitoringIntegration();
      expect(defaultIntegration).toBeDefined();
    });

    it('should initialize all monitoring services', async () => {
      await monitoringIntegration.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });

      expect(mockHealthService.initialize).toHaveBeenCalledWith({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });

      expect(mockMetricsService.initialize).toHaveBeenCalledWith(mockHealthService);

      expect(mockLifecycleManager.initialize).toHaveBeenCalledWith({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });
    });

    it('should setup event handlers between services', async () => {
      await monitoringIntegration.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });

      // Verify event handlers are set up
      expect(mockHealthService.on).toHaveBeenCalledWith('healthCheck', expect.any(Function));
      expect(mockMetricsService.on).toHaveBeenCalledWith('metricsExported', expect.any(Function));
      expect(mockLifecycleManager.on).toHaveBeenCalledWith('started', expect.any(Function));
      expect(mockLifecycleManager.on).toHaveBeenCalledWith('unhealthy', expect.any(Function));
    });

    it('should emit initialized event', (done) => {
      monitoringIntegration.on('initialized', () => {
        done();
      });

      monitoringIntegration.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });
    });
  });

  describe('lifecycle management', () => {
    beforeEach(async () => {
      await monitoringIntegration.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });
    });

    it('should start all monitoring services', async () => {
      await monitoringIntegration.start();

      expect(mockLifecycleManager.start).toHaveBeenCalled();
    });

    it('should stop all monitoring services', async () => {
      await monitoringIntegration.start();
      await monitoringIntegration.stop();

      expect(mockLifecycleManager.stop).toHaveBeenCalled();
    });

    it('should emit started and stopped events', async () => {
      const startedSpy = jest.fn();
      const stoppedSpy = jest.fn();

      monitoringIntegration.on('started', startedSpy);
      monitoringIntegration.on('stopped', stoppedSpy);

      await monitoringIntegration.start();
      await monitoringIntegration.stop();

      expect(startedSpy).toHaveBeenCalled();
      expect(stoppedSpy).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockHealthService.initialize.mockRejectedValue(new Error('Health service init failed'));

      await expect(monitoringIntegration.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      })).rejects.toThrow('Health service init failed');
    });

    it('should handle startup errors', async () => {
      await monitoringIntegration.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });

      mockLifecycleManager.start.mockRejectedValue(new Error('Startup failed'));

      await expect(monitoringIntegration.start()).rejects.toThrow('Startup failed');
    });
  });

  describe('health monitoring integration', () => {
    beforeEach(async () => {
      await monitoringIntegration.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });
    });

    it('should handle health status changes', () => {
      const healthCheckHandler = mockHealthService.on.mock.calls.find(
        call => call[0] === 'healthCheck'
      )?.[1];

      expect(healthCheckHandler).toBeDefined();

      const mockHealthStatus = {
        status: 'healthy',
        timestamp: new Date(),
        uptime: 60000,
        version: '1.0.0',
        components: [],
        metrics: {} as any
      };

      // Simulate health check event
      healthCheckHandler(mockHealthStatus);

      // Should emit health status changed event
      expect(monitoringIntegration.listenerCount('healthStatusChanged')).toBeGreaterThan(0);
    });

    it('should provide health status access', async () => {
      const mockHealthStatus = {
        status: 'healthy',
        timestamp: new Date(),
        uptime: 60000,
        version: '1.0.0',
        components: [],
        metrics: {} as any
      };

      mockHealthService.getHealthStatus.mockResolvedValue(mockHealthStatus);

      const status = await monitoringIntegration.getHealthStatus();
      expect(status).toEqual(mockHealthStatus);
      expect(mockHealthService.getHealthStatus).toHaveBeenCalled();
    });
  });

  describe('metrics integration', () => {
    beforeEach(async () => {
      await monitoringIntegration.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });
    });

    it('should handle metrics export events', () => {
      const metricsExportHandler = mockMetricsService.on.mock.calls.find(
        call => call[0] === 'metricsExported'
      )?.[1];

      expect(metricsExportHandler).toBeDefined();

      const mockMetricsData = {
        format: 'prometheus',
        data: 'metric_name 42',
        timestamp: new Date()
      };

      // Simulate metrics export event
      metricsExportHandler(mockMetricsData);

      // Should emit metrics exported event
      expect(monitoringIntegration.listenerCount('metricsExported')).toBeGreaterThan(0);
    });

    it('should provide Prometheus metrics access', () => {
      const mockPrometheusData = 'il2cpp_test_metric 42\n';
      mockMetricsService.getPrometheusMetrics.mockReturnValue(mockPrometheusData);

      const metrics = monitoringIntegration.getPrometheusMetrics();
      expect(metrics).toBe(mockPrometheusData);
      expect(mockMetricsService.getPrometheusMetrics).toHaveBeenCalled();
    });

    it('should record custom metrics', () => {
      const metric = {
        name: 'test_metric',
        value: 100,
        type: 'gauge' as const,
        labels: { service: 'test' }
      };

      monitoringIntegration.recordMetric(metric);
      expect(mockMetricsService.recordMetric).toHaveBeenCalledWith(metric);
    });

    it('should update MCP metrics', () => {
      const mcpMetrics = {
        activeConnections: 3,
        requestProcessed: true,
        responseTime: 150,
        error: false
      };

      monitoringIntegration.updateMCPMetrics(mcpMetrics);
      expect(mockHealthService.updateMCPMetrics).toHaveBeenCalledWith(mcpMetrics);
    });
  });

  describe('lifecycle integration', () => {
    beforeEach(async () => {
      await monitoringIntegration.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });
    });

    it('should handle application lifecycle events', () => {
      const lifecycleHandlers = mockLifecycleManager.on.mock.calls;

      expect(lifecycleHandlers.some(call => call[0] === 'started')).toBe(true);
      expect(lifecycleHandlers.some(call => call[0] === 'stopped')).toBe(true);
      expect(lifecycleHandlers.some(call => call[0] === 'restarting')).toBe(true);
      expect(lifecycleHandlers.some(call => call[0] === 'unhealthy')).toBe(true);
      expect(lifecycleHandlers.some(call => call[0] === 'healthy')).toBe(true);
    });

    it('should provide lifecycle state access', () => {
      const mockLifecycleState = {
        phase: 'running' as const,
        startTime: new Date(),
        restartCount: 0,
        isHealthy: true,
        dependencies: []
      };

      mockLifecycleManager.getState.mockReturnValue(mockLifecycleState);

      const state = monitoringIntegration.getLifecycleState();
      expect(state).toEqual(mockLifecycleState);
      expect(mockLifecycleManager.getState).toHaveBeenCalled();
    });

    it('should support force restart', async () => {
      await monitoringIntegration.forceRestart('test reason');
      expect(mockLifecycleManager.forceRestart).toHaveBeenCalledWith('test reason');
    });

    it('should register shutdown handlers', () => {
      const handler = jest.fn();
      monitoringIntegration.onShutdown(handler);
      expect(mockLifecycleManager.onShutdown).toHaveBeenCalledWith(handler);
    });

    it('should register startup handlers', () => {
      const handler = jest.fn();
      monitoringIntegration.onStartup(handler);
      expect(mockLifecycleManager.onStartup).toHaveBeenCalledWith(handler);
    });
  });

  describe('comprehensive status', () => {
    beforeEach(async () => {
      await monitoringIntegration.initialize({
        connectionManager: mockConnectionManager,
        vectorStore: mockVectorStore,
        embeddings: mockEmbeddings
      });
    });

    it('should provide comprehensive monitoring status', async () => {
      // Mock service states
      mockHealthService.getHealthStatus.mockResolvedValue({
        status: 'healthy',
        timestamp: new Date(),
        uptime: 60000,
        version: '1.0.0',
        components: [],
        metrics: {} as any
      });

      mockHealthService.getStats.mockReturnValue({
        isRunning: true,
        uptime: 60000,
        totalHealthChecks: 10
      });

      mockMetricsService.getMetricsSummary.mockReturnValue({
        totalMetrics: 50,
        metricTypes: 10,
        isRunning: true
      });

      mockLifecycleManager.getState.mockReturnValue({
        phase: 'running',
        startTime: new Date(),
        restartCount: 0,
        isHealthy: true,
        dependencies: []
      });

      const status = await monitoringIntegration.getStatus();

      expect(status.overall).toBe('healthy');
      expect(status.services.health).toBe(true);
      expect(status.services.metrics).toBe(true);
      expect(status.services.lifecycle).toBe(true);
      expect(status.uptime).toBeGreaterThan(0);
      expect(status.lastUpdate).toBeInstanceOf(Date);
    });
  });

  describe('configuration management', () => {
    it('should provide configuration access', () => {
      const config = monitoringIntegration.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.healthChecks.enabled).toBe(true);
      expect(config.metrics.enabled).toBe(true);
      expect(config.lifecycle.enabled).toBe(true);
    });

    it('should support configuration updates', () => {
      const updates = {
        healthChecks: {
          enabled: false,
          interval: 60000,
          timeout: 15000
        }
      };

      monitoringIntegration.updateConfig(updates);

      const config = monitoringIntegration.getConfig();
      expect(config.healthChecks.enabled).toBe(false);
      expect(config.healthChecks.interval).toBe(60000);
    });

    it('should emit config updated events', (done) => {
      monitoringIntegration.on('configUpdated', (config) => {
        expect(config.metrics.enabled).toBe(false);
        done();
      });

      monitoringIntegration.updateConfig({
        metrics: { enabled: false, exportInterval: 120000, prometheusEnabled: false }
      });
    });
  });
});
