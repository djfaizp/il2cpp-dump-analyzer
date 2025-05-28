/**
 * Performance Monitoring and Bottleneck Detection Tests
 * Tests for comprehensive performance metrics collection, bottleneck detection, and optimization recommendations
 * Following Test-Driven Development (TFD) methodology
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { realIL2CPPDumpSample, realIL2CPPComplexSample } from './test-data';

import {
  PerformanceMonitor,
  PerformanceMetrics,
  BottleneckReport,
  OptimizationRecommendation,
  PerformanceThresholds,
  MonitoringOptions
} from '../performance/performance-monitor';

describe('Performance Monitoring Tests', () => {
  let monitor: PerformanceMonitor;
  let mockConsoleWarn: jest.SpiedFunction<typeof console.warn>;
  let mockConsoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();
    monitor = new PerformanceMonitor();
    mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('Basic Performance Metrics Collection', () => {
    it('should collect basic performance metrics for operations', async () => {
      // Arrange
      const operationName = 'test_operation';

      // Act
      const operationId = monitor.startOperation(operationName);
      await new Promise(resolve => setTimeout(resolve, 10)); // Simulate work
      const metrics = monitor.endOperation(operationId);

      // Assert
      expect(metrics).toBeDefined();
      expect(metrics.operationName).toBe(operationName);
      expect(metrics.duration).toBeGreaterThan(0);
      expect(metrics.startTime).toBeInstanceOf(Date);
      expect(metrics.endTime).toBeInstanceOf(Date);
      expect(metrics.memoryUsage).toBeDefined();
      expect(metrics.memoryUsage.heapUsed).toBeGreaterThan(0);
    });

    it('should track multiple concurrent operations', async () => {
      // Arrange
      const operation1 = 'parsing_operation';
      const operation2 = 'embedding_operation';

      // Act
      const id1 = monitor.startOperation(operation1);
      const id2 = monitor.startOperation(operation2);

      await new Promise(resolve => setTimeout(resolve, 5));
      const metrics1 = monitor.endOperation(id1);

      await new Promise(resolve => setTimeout(resolve, 5));
      const metrics2 = monitor.endOperation(id2);

      // Assert
      expect(metrics1.operationName).toBe(operation1);
      expect(metrics2.operationName).toBe(operation2);
      expect(metrics1.operationId).not.toBe(metrics2.operationId);
      expect(metrics2.duration).toBeGreaterThan(metrics1.duration);
    });

    it('should collect system resource metrics', () => {
      // Act
      const systemMetrics = monitor.getSystemMetrics();

      // Assert
      expect(systemMetrics).toBeDefined();
      expect(systemMetrics.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.memoryUsage).toBeDefined();
      expect(systemMetrics.memoryUsage.total).toBeGreaterThan(0);
      expect(systemMetrics.memoryUsage.free).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Bottleneck Detection', () => {
    it('should detect slow operations as bottlenecks', async () => {
      // Arrange
      const thresholds: PerformanceThresholds = {
        maxOperationDuration: 50, // 50ms threshold
        maxMemoryUsage: 100 * 1024 * 1024, // 100MB
        maxCpuUsage: 80
      };
      monitor.setThresholds(thresholds);

      // Act - Create a slow operation
      const operationId = monitor.startOperation('slow_operation');
      await new Promise(resolve => setTimeout(resolve, 60)); // Exceed threshold
      monitor.endOperation(operationId);

      const bottlenecks = monitor.detectBottlenecks();

      // Assert
      expect(bottlenecks).toBeDefined();
      expect(bottlenecks.length).toBeGreaterThan(0);
      expect(bottlenecks[0].type).toBe('slow_operation');
      expect(bottlenecks[0].severity).toBeGreaterThan(0);
      expect(bottlenecks[0].description).toContain('exceeded duration threshold');
    });

    it('should detect memory usage bottlenecks', async () => {
      // Arrange
      const thresholds: PerformanceThresholds = {
        maxOperationDuration: 1000,
        maxMemoryUsage: 1, // Very low threshold to trigger
        maxCpuUsage: 100
      };
      monitor.setThresholds(thresholds);

      // Act
      const operationId = monitor.startOperation('memory_intensive_operation');
      // Simulate memory usage by creating large objects
      const largeArray = new Array(1000).fill('test data');
      monitor.endOperation(operationId);

      const bottlenecks = monitor.detectBottlenecks();

      // Assert
      expect(bottlenecks).toBeDefined();
      expect(bottlenecks.some(b => b.type.includes('memory'))).toBe(true);
    });

    it('should generate bottleneck reports with recommendations', () => {
      // Arrange
      const thresholds: PerformanceThresholds = {
        maxOperationDuration: 10,
        maxMemoryUsage: 50 * 1024 * 1024,
        maxCpuUsage: 70
      };
      monitor.setThresholds(thresholds);

      // Act - Create multiple operations to trigger bottlenecks
      for (let i = 0; i < 3; i++) {
        const id = monitor.startOperation(`operation_${i}`);
        // Simulate work
        const start = Date.now();
        while (Date.now() - start < 15) {} // Busy wait to exceed threshold
        monitor.endOperation(id);
      }

      const report = monitor.generateBottleneckReport();

      // Assert
      expect(report).toBeDefined();
      expect(report.bottlenecks.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.summary).toBeDefined();
      expect(report.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Performance Optimization Recommendations', () => {
    it('should generate optimization recommendations for slow operations', () => {
      // Arrange
      monitor.setThresholds({
        maxOperationDuration: 20,
        maxMemoryUsage: 100 * 1024 * 1024,
        maxCpuUsage: 80
      });

      // Act - Create slow operations
      for (let i = 0; i < 2; i++) {
        const id = monitor.startOperation('il2cpp_parsing');
        const start = Date.now();
        while (Date.now() - start < 25) {} // Exceed threshold
        monitor.endOperation(id);
      }

      const recommendations = monitor.getOptimizationRecommendations();

      // Assert
      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].category).toBeDefined();
      expect(recommendations[0].description).toBeDefined();
      expect(recommendations[0].impact).toBeGreaterThan(0);
      expect(recommendations[0].implementation).toBeDefined();
    });

    it('should prioritize recommendations by impact', () => {
      // Arrange
      monitor.setThresholds({
        maxOperationDuration: 10,
        maxMemoryUsage: 10 * 1024 * 1024,
        maxCpuUsage: 50
      });

      // Act - Create various performance issues
      const operations = ['parsing', 'embedding', 'vector_search', 'chunking'];
      operations.forEach(op => {
        const id = monitor.startOperation(op);
        const start = Date.now();
        while (Date.now() - start < 15) {} // Create bottleneck
        monitor.endOperation(id);
      });

      const recommendations = monitor.getOptimizationRecommendations();

      // Assert
      expect(recommendations.length).toBeGreaterThan(1);
      // Recommendations should be sorted by impact (highest first)
      for (let i = 1; i < recommendations.length; i++) {
        expect(recommendations[i].impact).toBeLessThanOrEqual(recommendations[i - 1].impact);
      }
    });
  });

  describe('Performance Regression Testing', () => {
    it('should detect performance regressions between runs', () => {
      // Arrange - Establish baseline
      const baselineId = monitor.startOperation('baseline_operation');
      const start = Date.now();
      while (Date.now() - start < 10) {} // 10ms baseline
      monitor.endOperation(baselineId);

      monitor.saveBaseline('test_baseline');

      // Act - Create regression
      const regressionId = monitor.startOperation('baseline_operation');
      const start2 = Date.now();
      while (Date.now() - start2 < 25) {} // 25ms - significant regression
      monitor.endOperation(regressionId);

      const regressions = monitor.detectRegressions('test_baseline');

      // Assert
      expect(regressions).toBeDefined();
      expect(regressions.length).toBeGreaterThan(0);
      expect(regressions[0].operationName).toBe('baseline_operation');
      expect(regressions[0].regressionPercentage).toBeGreaterThan(50); // Should be ~150% increase
      expect(regressions[0].severity).toBeGreaterThan(0);
    });

    it('should handle missing baseline gracefully', () => {
      // Act
      const regressions = monitor.detectRegressions('nonexistent_baseline');

      // Assert
      expect(regressions).toBeDefined();
      expect(regressions.length).toBe(0);
    });
  });

  describe('Monitoring Configuration', () => {
    it('should support custom monitoring options', () => {
      // Arrange
      const options: MonitoringOptions = {
        enableMemoryTracking: true,
        enableCpuTracking: true,
        sampleInterval: 100,
        maxHistorySize: 500,
        enableRegression: true
      };

      // Act
      monitor.configure(options);
      const config = monitor.getConfiguration();

      // Assert
      expect(config).toEqual(options);
    });

    it('should disable tracking when configured', () => {
      // Arrange
      const options: MonitoringOptions = {
        enableMemoryTracking: false,
        enableCpuTracking: false,
        sampleInterval: 1000,
        maxHistorySize: 100,
        enableRegression: false
      };

      // Act
      monitor.configure(options);
      const operationId = monitor.startOperation('test_operation');
      const metrics = monitor.endOperation(operationId);

      // Assert
      expect(metrics.memoryUsage).toBeUndefined();
      expect(monitor.getSystemMetrics().cpuUsage).toBeUndefined();
    });
  });

  describe('Performance Data Export', () => {
    it('should export performance data in JSON format', () => {
      // Arrange
      const operationId = monitor.startOperation('export_test');
      monitor.endOperation(operationId);

      // Act
      const exportData = monitor.exportData();

      // Assert
      expect(exportData).toBeDefined();
      expect(exportData.metrics).toBeDefined();
      expect(exportData.metrics.length).toBeGreaterThan(0);
      expect(exportData.systemMetrics).toBeDefined();
      expect(exportData.configuration).toBeDefined();
      expect(exportData.timestamp).toBeInstanceOf(Date);
    });

    it('should clear performance history when requested', () => {
      // Arrange
      const operationId = monitor.startOperation('clear_test');
      monitor.endOperation(operationId);
      expect(monitor.getMetricsHistory().length).toBeGreaterThan(0);

      // Act
      monitor.clearHistory();

      // Assert
      expect(monitor.getMetricsHistory().length).toBe(0);
    });
  });
});
