/**
 * Performance Monitoring and Bottleneck Detection
 * Comprehensive performance metrics collection, bottleneck detection, and optimization recommendations
 */

import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * Memory usage information
 */
export interface MemoryUsage {
  /** Heap memory used in bytes */
  heapUsed: number;
  /** Total heap memory in bytes */
  heapTotal: number;
  /** External memory used in bytes */
  external: number;
  /** Array buffers memory in bytes */
  arrayBuffers: number;
  /** RSS (Resident Set Size) in bytes */
  rss?: number;
}

/**
 * System memory information
 */
export interface SystemMemoryUsage {
  /** Total system memory in bytes */
  total: number;
  /** Free system memory in bytes */
  free: number;
  /** Used system memory in bytes */
  used: number;
  /** Memory usage percentage */
  percentage: number;
}

/**
 * Performance metrics for a single operation
 */
export interface PerformanceMetrics {
  /** Unique operation identifier */
  operationId: string;
  /** Name of the operation */
  operationName: string;
  /** Operation start time */
  startTime: Date;
  /** Operation end time */
  endTime: Date;
  /** Duration in milliseconds */
  duration: number;
  /** Memory usage during operation */
  memoryUsage?: MemoryUsage;
  /** CPU usage percentage during operation */
  cpuUsage?: number;
  /** Additional custom metrics */
  customMetrics?: Record<string, number>;
}

/**
 * System-wide performance metrics
 */
export interface SystemMetrics {
  /** CPU usage percentage */
  cpuUsage?: number;
  /** Memory usage information */
  memoryUsage: SystemMemoryUsage;
  /** Load average (Unix systems) */
  loadAverage?: number[];
  /** Number of active operations */
  activeOperations: number;
  /** Timestamp of metrics collection */
  timestamp: Date;
}

/**
 * Bottleneck detection result
 */
export interface BottleneckReport {
  /** Type of bottleneck */
  type: string;
  /** Severity score (0-100) */
  severity: number;
  /** Description of the bottleneck */
  description: string;
  /** Affected operations */
  affectedOperations: string[];
  /** Suggested resolution */
  suggestion?: string;
}

/**
 * Performance optimization recommendation
 */
export interface OptimizationRecommendation {
  /** Recommendation category */
  category: string;
  /** Description of the recommendation */
  description: string;
  /** Expected impact score (0-100) */
  impact: number;
  /** Implementation difficulty (1-5) */
  difficulty: number;
  /** Implementation details */
  implementation: string;
  /** Estimated improvement percentage */
  estimatedImprovement?: number;
}

/**
 * Performance thresholds for bottleneck detection
 */
export interface PerformanceThresholds {
  /** Maximum operation duration in milliseconds */
  maxOperationDuration: number;
  /** Maximum memory usage in bytes */
  maxMemoryUsage: number;
  /** Maximum CPU usage percentage */
  maxCpuUsage: number;
  /** Maximum concurrent operations */
  maxConcurrentOperations?: number;
}

/**
 * Performance regression detection result
 */
export interface PerformanceRegression {
  /** Operation name */
  operationName: string;
  /** Baseline duration */
  baselineDuration: number;
  /** Current duration */
  currentDuration: number;
  /** Regression percentage */
  regressionPercentage: number;
  /** Severity of regression */
  severity: number;
  /** Timestamp of detection */
  timestamp: Date;
}

/**
 * Monitoring configuration options
 */
export interface MonitoringOptions {
  /** Enable memory usage tracking */
  enableMemoryTracking: boolean;
  /** Enable CPU usage tracking */
  enableCpuTracking: boolean;
  /** Sampling interval in milliseconds */
  sampleInterval: number;
  /** Maximum number of metrics to keep in history */
  maxHistorySize: number;
  /** Enable performance regression detection */
  enableRegression: boolean;
}

/**
 * Complete bottleneck report with recommendations
 */
export interface CompleteBottleneckReport {
  /** List of detected bottlenecks */
  bottlenecks: BottleneckReport[];
  /** Optimization recommendations */
  recommendations: OptimizationRecommendation[];
  /** Summary statistics */
  summary: {
    totalBottlenecks: number;
    criticalBottlenecks: number;
    averageSeverity: number;
  };
  /** Report timestamp */
  timestamp: Date;
}

/**
 * Performance data export format
 */
export interface PerformanceDataExport {
  /** All collected metrics */
  metrics: PerformanceMetrics[];
  /** System metrics history */
  systemMetrics: SystemMetrics[];
  /** Current configuration */
  configuration: MonitoringOptions;
  /** Baselines for regression testing */
  baselines: Record<string, PerformanceMetrics[]>;
  /** Export timestamp */
  timestamp: Date;
}

/**
 * Performance monitoring and bottleneck detection system
 */
export class PerformanceMonitor {
  private readonly DEFAULT_THRESHOLDS: PerformanceThresholds = {
    maxOperationDuration: 1000, // 1 second
    maxMemoryUsage: 512 * 1024 * 1024, // 512MB
    maxCpuUsage: 80 // 80%
  };

  private readonly DEFAULT_OPTIONS: MonitoringOptions = {
    enableMemoryTracking: true,
    enableCpuTracking: true,
    sampleInterval: 1000, // 1 second
    maxHistorySize: 1000,
    enableRegression: true
  };

  private activeOperations = new Map<string, { name: string; startTime: Date; startMemory?: MemoryUsage }>();
  private metricsHistory: PerformanceMetrics[] = [];
  private systemMetricsHistory: SystemMetrics[] = [];
  private thresholds: PerformanceThresholds = { ...this.DEFAULT_THRESHOLDS };
  private options: MonitoringOptions = { ...this.DEFAULT_OPTIONS };
  private baselines = new Map<string, PerformanceMetrics[]>();
  private cpuUsageHistory: number[] = [];

  /**
   * Start monitoring a new operation
   * @param operationName Name of the operation to monitor
   * @returns Unique operation identifier
   */
  public startOperation(operationName: string): string {
    const operationId = uuidv4();
    const startTime = new Date();
    const startMemory = this.options.enableMemoryTracking ? this.getMemoryUsage() : undefined;

    this.activeOperations.set(operationId, {
      name: operationName,
      startTime,
      startMemory
    });

    return operationId;
  }

  /**
   * End monitoring an operation and collect metrics
   * @param operationId Operation identifier from startOperation
   * @returns Performance metrics for the operation
   */
  public endOperation(operationId: string): PerformanceMetrics {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const endTime = new Date();
    const duration = endTime.getTime() - operation.startTime.getTime();
    const endMemory = this.options.enableMemoryTracking ? this.getMemoryUsage() : undefined;

    const metrics: PerformanceMetrics = {
      operationId,
      operationName: operation.name,
      startTime: operation.startTime,
      endTime,
      duration,
      memoryUsage: endMemory,
      cpuUsage: this.options.enableCpuTracking ? this.getCurrentCpuUsage() : undefined
    };

    this.activeOperations.delete(operationId);
    this.addToHistory(metrics);

    return metrics;
  }

  /**
   * Get current system metrics
   * @returns Current system performance metrics
   */
  public getSystemMetrics(): SystemMetrics {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const systemMetrics: SystemMetrics = {
      cpuUsage: this.options.enableCpuTracking ? this.getCurrentCpuUsage() : undefined,
      memoryUsage: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        percentage: (usedMem / totalMem) * 100
      },
      loadAverage: os.loadavg(),
      activeOperations: this.activeOperations.size,
      timestamp: new Date()
    };

    this.systemMetricsHistory.push(systemMetrics);
    this.trimSystemMetricsHistory();

    return systemMetrics;
  }

  /**
   * Set performance thresholds for bottleneck detection
   * @param thresholds Performance thresholds
   */
  public setThresholds(thresholds: PerformanceThresholds): void {
    this.thresholds = { ...thresholds };
  }

  /**
   * Configure monitoring options
   * @param options Monitoring configuration
   */
  public configure(options: MonitoringOptions): void {
    this.options = { ...options };
  }

  /**
   * Get current configuration
   * @returns Current monitoring configuration
   */
  public getConfiguration(): MonitoringOptions {
    return { ...this.options };
  }

  /**
   * Get metrics history
   * @returns Array of all collected metrics
   */
  public getMetricsHistory(): PerformanceMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Clear performance history
   */
  public clearHistory(): void {
    this.metricsHistory = [];
    this.systemMetricsHistory = [];
    this.cpuUsageHistory = [];
  }

  /**
   * Get current memory usage
   * @returns Memory usage information
   */
  private getMemoryUsage(): MemoryUsage {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss
    };
  }

  /**
   * Get current CPU usage (simplified estimation)
   * @returns CPU usage percentage
   */
  private getCurrentCpuUsage(): number {
    // Simplified CPU usage calculation
    // In a real implementation, you might use more sophisticated methods
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    this.cpuUsageHistory.push(usage);
    if (this.cpuUsageHistory.length > 10) {
      this.cpuUsageHistory.shift();
    }

    return usage;
  }

  /**
   * Add metrics to history and trim if necessary
   * @param metrics Performance metrics to add
   */
  private addToHistory(metrics: PerformanceMetrics): void {
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.options.maxHistorySize) {
      this.metricsHistory.shift();
    }
  }

  /**
   * Trim system metrics history to configured size
   */
  private trimSystemMetricsHistory(): void {
    if (this.systemMetricsHistory.length > this.options.maxHistorySize) {
      this.systemMetricsHistory.shift();
    }
  }

  /**
   * Detect performance bottlenecks based on current thresholds
   * @returns Array of detected bottlenecks
   */
  public detectBottlenecks(): BottleneckReport[] {
    const bottlenecks: BottleneckReport[] = [];

    // Analyze operation duration bottlenecks
    const slowOperations = this.metricsHistory.filter(
      m => m.duration > this.thresholds.maxOperationDuration
    );

    if (slowOperations.length > 0) {
      const avgDuration = slowOperations.reduce((sum, m) => sum + m.duration, 0) / slowOperations.length;
      const severity = Math.min(100, (avgDuration / this.thresholds.maxOperationDuration) * 50);

      bottlenecks.push({
        type: 'slow_operation',
        severity,
        description: `${slowOperations.length} operations exceeded duration threshold (${this.thresholds.maxOperationDuration}ms)`,
        affectedOperations: [...new Set(slowOperations.map(m => m.operationName))],
        suggestion: 'Consider optimizing slow operations or increasing concurrency'
      });
    }

    // Analyze memory usage bottlenecks
    const highMemoryOperations = this.metricsHistory.filter(
      m => m.memoryUsage && m.memoryUsage.heapUsed > this.thresholds.maxMemoryUsage
    );

    if (highMemoryOperations.length > 0) {
      const avgMemory = highMemoryOperations.reduce(
        (sum, m) => sum + (m.memoryUsage?.heapUsed || 0), 0
      ) / highMemoryOperations.length;
      const severity = Math.min(100, (avgMemory / this.thresholds.maxMemoryUsage) * 60);

      bottlenecks.push({
        type: 'high_memory_usage',
        severity,
        description: `${highMemoryOperations.length} operations exceeded memory threshold (${Math.round(this.thresholds.maxMemoryUsage / 1024 / 1024)}MB)`,
        affectedOperations: [...new Set(highMemoryOperations.map(m => m.operationName))],
        suggestion: 'Implement memory optimization or increase available memory'
      });
    }

    // Analyze CPU usage bottlenecks
    if (this.cpuUsageHistory.length > 0) {
      const avgCpuUsage = this.cpuUsageHistory.reduce((sum, cpu) => sum + cpu, 0) / this.cpuUsageHistory.length;
      if (avgCpuUsage > this.thresholds.maxCpuUsage) {
        const severity = Math.min(100, (avgCpuUsage / this.thresholds.maxCpuUsage) * 70);

        bottlenecks.push({
          type: 'high_cpu_usage',
          severity,
          description: `Average CPU usage (${avgCpuUsage.toFixed(1)}%) exceeded threshold (${this.thresholds.maxCpuUsage}%)`,
          affectedOperations: ['system_wide'],
          suggestion: 'Optimize CPU-intensive operations or scale horizontally'
        });
      }
    }

    // Analyze concurrent operations bottleneck
    if (this.thresholds.maxConcurrentOperations && this.activeOperations.size > this.thresholds.maxConcurrentOperations) {
      bottlenecks.push({
        type: 'high_concurrency',
        severity: Math.min(100, (this.activeOperations.size / this.thresholds.maxConcurrentOperations) * 40),
        description: `Too many concurrent operations (${this.activeOperations.size}/${this.thresholds.maxConcurrentOperations})`,
        affectedOperations: Array.from(this.activeOperations.values()).map(op => op.name),
        suggestion: 'Implement operation queuing or increase concurrency limits'
      });
    }

    return bottlenecks.sort((a, b) => b.severity - a.severity);
  }

  /**
   * Generate comprehensive bottleneck report with recommendations
   * @returns Complete bottleneck report
   */
  public generateBottleneckReport(): CompleteBottleneckReport {
    const bottlenecks = this.detectBottlenecks();
    const recommendations = this.getOptimizationRecommendations();

    const criticalBottlenecks = bottlenecks.filter(b => b.severity >= 70);
    const averageSeverity = bottlenecks.length > 0
      ? bottlenecks.reduce((sum, b) => sum + b.severity, 0) / bottlenecks.length
      : 0;

    return {
      bottlenecks,
      recommendations,
      summary: {
        totalBottlenecks: bottlenecks.length,
        criticalBottlenecks: criticalBottlenecks.length,
        averageSeverity
      },
      timestamp: new Date()
    };
  }

  /**
   * Generate optimization recommendations based on performance data
   * @returns Array of optimization recommendations
   */
  public getOptimizationRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // Analyze operation patterns for recommendations
    const operationStats = this.analyzeOperationPatterns();

    // Recommend chunked processing for large operations
    const largeOperations = Object.entries(operationStats)
      .filter(([_, stats]) => stats.avgDuration > this.thresholds.maxOperationDuration * 0.8)
      .sort(([_, a], [__, b]) => b.avgDuration - a.avgDuration);

    if (largeOperations.length > 0) {
      recommendations.push({
        category: 'Processing Optimization',
        description: 'Implement chunked processing for large operations',
        impact: 85,
        difficulty: 3,
        implementation: 'Break large operations into smaller chunks and process them incrementally',
        estimatedImprovement: 60
      });
    }

    // Recommend caching for frequently repeated operations
    const frequentOperations = Object.entries(operationStats)
      .filter(([_, stats]) => stats.count > 5)
      .sort(([_, a], [__, b]) => b.count - a.count);

    if (frequentOperations.length > 0) {
      recommendations.push({
        category: 'Caching',
        description: 'Implement intelligent caching for frequent operations',
        impact: 70,
        difficulty: 2,
        implementation: 'Add result caching with TTL and LRU eviction policies',
        estimatedImprovement: 45
      });
    }

    // Recommend parallel processing
    if (this.metricsHistory.length > 10) {
      const sequentialOperations = this.metricsHistory.filter(m =>
        m.operationName.includes('parsing') || m.operationName.includes('processing')
      );

      if (sequentialOperations.length > 3) {
        recommendations.push({
          category: 'Concurrency',
          description: 'Implement parallel processing for independent operations',
          impact: 75,
          difficulty: 4,
          implementation: 'Use worker threads or async processing for CPU-intensive tasks',
          estimatedImprovement: 50
        });
      }
    }

    // Recommend memory optimization
    const highMemoryOps = this.metricsHistory.filter(m =>
      m.memoryUsage && m.memoryUsage.heapUsed > this.thresholds.maxMemoryUsage * 0.7
    );

    if (highMemoryOps.length > 0) {
      recommendations.push({
        category: 'Memory Optimization',
        description: 'Optimize memory usage for large data processing',
        impact: 65,
        difficulty: 3,
        implementation: 'Implement streaming processing and garbage collection optimization',
        estimatedImprovement: 40
      });
    }

    return recommendations.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Analyze operation patterns for optimization insights
   * @returns Operation statistics
   */
  private analyzeOperationPatterns(): Record<string, { count: number; avgDuration: number; totalDuration: number }> {
    const stats: Record<string, { count: number; totalDuration: number; avgDuration: number }> = {};

    this.metricsHistory.forEach(metric => {
      if (!stats[metric.operationName]) {
        stats[metric.operationName] = { count: 0, totalDuration: 0, avgDuration: 0 };
      }

      stats[metric.operationName].count++;
      stats[metric.operationName].totalDuration += metric.duration;
      stats[metric.operationName].avgDuration =
        stats[metric.operationName].totalDuration / stats[metric.operationName].count;
    });

    return stats;
  }

  /**
   * Save current metrics as baseline for regression testing
   * @param baselineName Name of the baseline
   */
  public saveBaseline(baselineName: string): void {
    if (!this.options.enableRegression) {
      return;
    }

    this.baselines.set(baselineName, [...this.metricsHistory]);
  }

  /**
   * Detect performance regressions compared to baseline
   * @param baselineName Name of the baseline to compare against
   * @returns Array of detected regressions
   */
  public detectRegressions(baselineName: string): PerformanceRegression[] {
    if (!this.options.enableRegression) {
      return [];
    }

    const baseline = this.baselines.get(baselineName);
    if (!baseline) {
      return [];
    }

    const regressions: PerformanceRegression[] = [];
    const currentStats = this.analyzeOperationPatterns();
    const baselineStats = this.analyzeBaselinePatterns(baseline);

    Object.entries(currentStats).forEach(([operationName, currentStat]) => {
      const baselineStat = baselineStats[operationName];
      if (!baselineStat) {
        return; // New operation, not a regression
      }

      const regressionPercentage = ((currentStat.avgDuration - baselineStat.avgDuration) / baselineStat.avgDuration) * 100;

      // Consider it a regression if performance degraded by more than 20%
      if (regressionPercentage > 20) {
        const severity = Math.min(100, regressionPercentage / 2); // Scale severity

        regressions.push({
          operationName,
          baselineDuration: baselineStat.avgDuration,
          currentDuration: currentStat.avgDuration,
          regressionPercentage,
          severity,
          timestamp: new Date()
        });
      }
    });

    return regressions.sort((a, b) => b.severity - a.severity);
  }

  /**
   * Analyze baseline patterns for regression comparison
   * @param baseline Baseline metrics
   * @returns Baseline operation statistics
   */
  private analyzeBaselinePatterns(baseline: PerformanceMetrics[]): Record<string, { count: number; avgDuration: number; totalDuration: number }> {
    const stats: Record<string, { count: number; totalDuration: number; avgDuration: number }> = {};

    baseline.forEach(metric => {
      if (!stats[metric.operationName]) {
        stats[metric.operationName] = { count: 0, totalDuration: 0, avgDuration: 0 };
      }

      stats[metric.operationName].count++;
      stats[metric.operationName].totalDuration += metric.duration;
      stats[metric.operationName].avgDuration =
        stats[metric.operationName].totalDuration / stats[metric.operationName].count;
    });

    return stats;
  }

  /**
   * Export all performance data
   * @returns Complete performance data export
   */
  public exportData(): PerformanceDataExport {
    return {
      metrics: [...this.metricsHistory],
      systemMetrics: [...this.systemMetricsHistory],
      configuration: { ...this.options },
      baselines: Object.fromEntries(this.baselines.entries()),
      timestamp: new Date()
    };
  }
}
