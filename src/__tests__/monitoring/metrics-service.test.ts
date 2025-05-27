/**
 * Tests for MetricsService - metrics collection and Prometheus export
 */

import { MetricsService, MetricValue } from '../../monitoring/metrics-service';
import { HealthService, HealthStatus } from '../../monitoring/health-service';

// Mock HealthService
jest.mock('../../monitoring/health-service');

describe('MetricsService', () => {
  let metricsService: MetricsService;
  let mockHealthService: jest.Mocked<HealthService>;

  beforeEach(() => {
    mockHealthService = {
      on: jest.fn(),
      getHealthStatus: jest.fn()
    } as any;

    metricsService = new MetricsService({
      enabled: true,
      exportInterval: 100, // 100ms for testing
      retentionPeriod: 1000, // 1 second for testing
      prometheusEnabled: true
    });
  });

  afterEach(() => {
    metricsService.stop();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultService = new MetricsService();
      expect(defaultService).toBeDefined();
    });

    it('should initialize with health service integration', () => {
      metricsService.initialize(mockHealthService);
      expect(mockHealthService.on).toHaveBeenCalledWith('healthCheck', expect.any(Function));
    });
  });

  describe('metric recording', () => {
    it('should record basic metrics', () => {
      const metric: Omit<MetricValue, 'timestamp'> = {
        name: 'test_counter',
        value: 42,
        type: 'counter',
        labels: { service: 'test' }
      };

      metricsService.recordMetric(metric);

      const summary = metricsService.getMetricsSummary();
      expect(summary.totalMetrics).toBe(1);
      expect(summary.metricTypes).toBe(1);
    });

    it('should record multiple metrics with same name', () => {
      metricsService.recordMetric({
        name: 'test_gauge',
        value: 10,
        type: 'gauge'
      });

      metricsService.recordMetric({
        name: 'test_gauge',
        value: 20,
        type: 'gauge'
      });

      const summary = metricsService.getMetricsSummary();
      expect(summary.totalMetrics).toBe(2);
      expect(summary.metricTypes).toBe(1);
    });

    it('should emit metric recorded events', (done) => {
      metricsService.on('metricRecorded', (metric: MetricValue) => {
        expect(metric.name).toBe('test_metric');
        expect(metric.value).toBe(100);
        done();
      });

      metricsService.recordMetric({
        name: 'test_metric',
        value: 100,
        type: 'gauge'
      });
    });

    it('should not record metrics when disabled', () => {
      const disabledService = new MetricsService({ enabled: false });

      disabledService.recordMetric({
        name: 'test_metric',
        value: 100,
        type: 'gauge'
      });

      const summary = disabledService.getMetricsSummary();
      expect(summary.totalMetrics).toBe(0);
    });
  });

  describe('health metrics integration', () => {
    beforeEach(() => {
      metricsService.initialize(mockHealthService);
    });

    it('should record health metrics from health status', () => {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        timestamp: new Date(),
        uptime: 60000,
        version: '1.0.0',
        components: [
          {
            name: 'database',
            status: 'healthy',
            message: 'Database healthy',
            lastCheck: new Date(),
            responseTime: 50
          }
        ],
        metrics: {
          memory: {
            used: 100000000,
            total: 200000000,
            percentage: 50,
            heapUsed: 80000000,
            heapTotal: 120000000
          },
          cpu: {
            usage: 25.5,
            loadAverage: [1.0, 1.5, 2.0]
          },
          database: {
            connectionCount: 5,
            activeQueries: 2,
            avgResponseTime: 100,
            errorRate: 0.01
          },
          embeddings: {
            modelLoaded: true,
            cacheSize: 1000000,
            avgProcessingTime: 200
          },
          mcp: {
            activeConnections: 3,
            totalRequests: 150,
            avgResponseTime: 75,
            errorRate: 0.02
          }
        }
      };

      // Simulate health check event
      const healthCheckHandler = mockHealthService.on.mock.calls[0][1];
      healthCheckHandler(healthStatus);

      const summary = metricsService.getMetricsSummary();
      expect(summary.totalMetrics).toBeGreaterThan(0);
    });

    it('should record component health metrics', () => {
      const healthStatus: HealthStatus = {
        status: 'degraded',
        timestamp: new Date(),
        uptime: 30000,
        version: '1.0.0',
        components: [
          {
            name: 'database',
            status: 'healthy',
            message: 'Database healthy',
            lastCheck: new Date(),
            responseTime: 25
          },
          {
            name: 'vector-store',
            status: 'degraded',
            message: 'Vector store issues',
            lastCheck: new Date(),
            responseTime: 150
          }
        ],
        metrics: {
          memory: { used: 100000000, total: 200000000, percentage: 50, heapUsed: 80000000, heapTotal: 120000000 },
          cpu: { usage: 15.0, loadAverage: [0.5, 0.8, 1.0] },
          database: { connectionCount: 3, activeQueries: 1, avgResponseTime: 50, errorRate: 0 },
          embeddings: { modelLoaded: true, cacheSize: 500000, avgProcessingTime: 100 },
          mcp: { activeConnections: 2, totalRequests: 75, avgResponseTime: 50, errorRate: 0 }
        }
      };

      const healthCheckHandler = mockHealthService.on.mock.calls[0][1];
      healthCheckHandler(healthStatus);

      const summary = metricsService.getMetricsSummary();
      expect(summary.totalMetrics).toBeGreaterThan(5); // Should have multiple component metrics
    });
  });

  describe('Prometheus export', () => {
    beforeEach(() => {
      // Record some test metrics
      metricsService.recordMetric({
        name: 'il2cpp_test_counter',
        value: 42,
        type: 'counter',
        help: 'Test counter metric'
      });

      metricsService.recordMetric({
        name: 'il2cpp_test_gauge',
        value: 3.14,
        type: 'gauge',
        labels: { instance: 'test' },
        help: 'Test gauge metric'
      });
    });

    it('should export metrics in Prometheus format', () => {
      const prometheusOutput = metricsService.getPrometheusMetrics();

      expect(prometheusOutput).toContain('# HELP il2cpp_test_counter');
      expect(prometheusOutput).toContain('# TYPE il2cpp_test_counter gauge');
      expect(prometheusOutput).toContain('il2cpp_test_counter 42');

      expect(prometheusOutput).toContain('# HELP il2cpp_test_gauge');
      expect(prometheusOutput).toContain('# TYPE il2cpp_test_gauge gauge');
      expect(prometheusOutput).toContain('il2cpp_test_gauge{instance="test"} 3.14');
    });

    it('should handle metrics with labels correctly', () => {
      metricsService.recordMetric({
        name: 'il2cpp_labeled_metric',
        value: 100,
        type: 'gauge',
        labels: {
          service: 'il2cpp',
          environment: 'test',
          version: '1.0.0'
        }
      });

      const prometheusOutput = metricsService.getPrometheusMetrics();
      expect(prometheusOutput).toContain('il2cpp_labeled_metric{service="il2cpp",environment="test",version="1.0.0"} 100');
    });

    it('should deduplicate metrics by labels', () => {
      // Record same metric with same labels multiple times
      metricsService.recordMetric({
        name: 'il2cpp_duplicate_test',
        value: 10,
        type: 'gauge',
        labels: { instance: 'test1' }
      });

      metricsService.recordMetric({
        name: 'il2cpp_duplicate_test',
        value: 20,
        type: 'gauge',
        labels: { instance: 'test1' }
      });

      const prometheusOutput = metricsService.getPrometheusMetrics();

      // Should only contain the first value (metrics are not deduplicated by default)
      expect(prometheusOutput).toContain('il2cpp_duplicate_test{instance="test1"} 10');
      expect(prometheusOutput).not.toContain('il2cpp_duplicate_test{instance="test1"} 20');
    });

    it('should return empty string when Prometheus disabled', () => {
      const disabledService = new MetricsService({ prometheusEnabled: false });

      disabledService.recordMetric({
        name: 'test_metric',
        value: 100,
        type: 'gauge'
      });

      const prometheusOutput = disabledService.getPrometheusMetrics();
      expect(prometheusOutput).toBe('');
    });
  });

  describe('metrics lifecycle', () => {
    it('should start and stop metrics collection', () => {
      expect(metricsService.getMetricsSummary().isRunning).toBe(false);

      metricsService.start();
      expect(metricsService.getMetricsSummary().isRunning).toBe(true);

      metricsService.stop();
      expect(metricsService.getMetricsSummary().isRunning).toBe(false);
    });

    it('should emit export events', (done) => {
      metricsService.on('metricsExported', (data) => {
        expect(data.format).toBe('prometheus');
        expect(data.data).toBeDefined();
        expect(data.timestamp).toBeInstanceOf(Date);
        done();
      });

      metricsService.start();
    });

    it('should clean up old metrics', (done) => {
      // Record a metric
      metricsService.recordMetric({
        name: 'test_cleanup',
        value: 100,
        type: 'gauge'
      });

      expect(metricsService.getMetricsSummary().totalMetrics).toBe(1);

      // Wait for cleanup (retention period is 1 second in test config)
      setTimeout(() => {
        // Trigger cleanup by starting service
        metricsService.start();

        setTimeout(() => {
          const summary = metricsService.getMetricsSummary();
          expect(summary.totalMetrics).toBe(0);
          done();
        }, 200);
      }, 1100);
    });
  });

  describe('metrics summary', () => {
    it('should provide accurate metrics summary', () => {
      const startTime = new Date();

      metricsService.recordMetric({
        name: 'metric1',
        value: 10,
        type: 'counter'
      });

      metricsService.recordMetric({
        name: 'metric2',
        value: 20,
        type: 'gauge'
      });

      metricsService.recordMetric({
        name: 'metric1',
        value: 30,
        type: 'counter'
      });

      const summary = metricsService.getMetricsSummary();

      expect(summary.totalMetrics).toBe(3);
      expect(summary.metricTypes).toBe(2);
      expect(summary.oldestMetric).toBeInstanceOf(Date);
      expect(summary.newestMetric).toBeInstanceOf(Date);
      expect(summary.oldestMetric!.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
      expect(summary.newestMetric!.getTime()).toBeGreaterThanOrEqual(summary.oldestMetric!.getTime());
    });

    it('should handle empty metrics', () => {
      const summary = metricsService.getMetricsSummary();

      expect(summary.totalMetrics).toBe(0);
      expect(summary.metricTypes).toBe(0);
      expect(summary.oldestMetric).toBeUndefined();
      expect(summary.newestMetric).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle metric recording errors gracefully', () => {
      // This shouldn't throw
      expect(() => {
        metricsService.recordMetric({
          name: '',
          value: NaN,
          type: 'gauge'
        });
      }).not.toThrow();
    });

    it('should handle Prometheus export errors gracefully', () => {
      // Record metric with problematic data
      metricsService.recordMetric({
        name: 'problematic_metric',
        value: Infinity,
        type: 'gauge',
        labels: { 'invalid-label': 'value with "quotes"' }
      });

      // Should not throw
      expect(() => {
        const output = metricsService.getPrometheusMetrics();
        expect(typeof output).toBe('string');
      }).not.toThrow();
    });
  });

  describe('clear metrics', () => {
    it('should clear all metrics', () => {
      metricsService.recordMetric({
        name: 'test_metric',
        value: 100,
        type: 'gauge'
      });

      expect(metricsService.getMetricsSummary().totalMetrics).toBe(1);

      metricsService.clearMetrics();

      expect(metricsService.getMetricsSummary().totalMetrics).toBe(0);
    });

    it('should emit metrics cleared event', (done) => {
      metricsService.on('metricsCleared', () => {
        done();
      });

      metricsService.clearMetrics();
    });
  });
});
