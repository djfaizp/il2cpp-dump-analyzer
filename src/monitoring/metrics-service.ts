/**
 * Metrics collection and export service for IL2CPP dump analyzer MCP system
 * Provides Prometheus-compatible metrics export and monitoring dashboards
 */

import { EventEmitter } from 'events';
import { HealthService, HealthStatus } from './health-service.js';

export interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: Date;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help?: string;
}

export interface PrometheusMetric {
  name: string;
  type: string;
  help: string;
  values: Array<{
    value: number;
    labels?: Record<string, string>;
  }>;
}

export interface MetricsConfig {
  enabled: boolean;
  exportInterval: number;
  retentionPeriod: number;
  prometheusEnabled: boolean;
  prometheusPort?: number;
  customMetrics: boolean;
}

/**
 * Metrics collection and export service
 */
export class MetricsService extends EventEmitter {
  private config: MetricsConfig;
  private metrics: Map<string, MetricValue[]> = new Map();
  private exportInterval?: NodeJS.Timeout;
  private healthService?: HealthService;
  private isRunning: boolean = false;

  // Built-in metric definitions
  private readonly builtInMetrics = {
    // System metrics
    'il2cpp_memory_usage_bytes': {
      type: 'gauge',
      help: 'Memory usage in bytes'
    },
    'il2cpp_cpu_usage_percent': {
      type: 'gauge',
      help: 'CPU usage percentage'
    },
    'il2cpp_uptime_seconds': {
      type: 'counter',
      help: 'Application uptime in seconds'
    },
    
    // Database metrics
    'il2cpp_database_connections_active': {
      type: 'gauge',
      help: 'Number of active database connections'
    },
    'il2cpp_database_queries_total': {
      type: 'counter',
      help: 'Total number of database queries'
    },
    'il2cpp_database_query_duration_seconds': {
      type: 'histogram',
      help: 'Database query duration in seconds'
    },
    'il2cpp_database_errors_total': {
      type: 'counter',
      help: 'Total number of database errors'
    },
    
    // Vector store metrics
    'il2cpp_vector_store_documents_total': {
      type: 'gauge',
      help: 'Total number of documents in vector store'
    },
    'il2cpp_vector_store_search_duration_seconds': {
      type: 'histogram',
      help: 'Vector search duration in seconds'
    },
    'il2cpp_vector_store_cache_hits_total': {
      type: 'counter',
      help: 'Total number of cache hits'
    },
    'il2cpp_vector_store_cache_misses_total': {
      type: 'counter',
      help: 'Total number of cache misses'
    },
    
    // Embeddings metrics
    'il2cpp_embeddings_generation_duration_seconds': {
      type: 'histogram',
      help: 'Embeddings generation duration in seconds'
    },
    'il2cpp_embeddings_cache_size_bytes': {
      type: 'gauge',
      help: 'Embeddings cache size in bytes'
    },
    
    // MCP server metrics
    'il2cpp_mcp_requests_total': {
      type: 'counter',
      help: 'Total number of MCP requests'
    },
    'il2cpp_mcp_request_duration_seconds': {
      type: 'histogram',
      help: 'MCP request duration in seconds'
    },
    'il2cpp_mcp_errors_total': {
      type: 'counter',
      help: 'Total number of MCP errors'
    },
    'il2cpp_mcp_active_connections': {
      type: 'gauge',
      help: 'Number of active MCP connections'
    },
    
    // Health check metrics
    'il2cpp_health_check_status': {
      type: 'gauge',
      help: 'Health check status (1=healthy, 0.5=degraded, 0=unhealthy)'
    },
    'il2cpp_health_check_duration_seconds': {
      type: 'histogram',
      help: 'Health check duration in seconds'
    }
  };

  constructor(config?: Partial<MetricsConfig>) {
    super();
    
    this.config = {
      enabled: true,
      exportInterval: 60000, // 1 minute
      retentionPeriod: 3600000, // 1 hour
      prometheusEnabled: true,
      prometheusPort: 9090,
      customMetrics: true,
      ...config
    };
  }

  /**
   * Initialize metrics service with health service integration
   */
  initialize(healthService: HealthService): void {
    this.healthService = healthService;
    
    // Listen to health check events
    this.healthService.on('healthCheck', (status: HealthStatus) => {
      this.recordHealthMetrics(status);
    });
    
    console.log('Metrics service initialized');
  }

  /**
   * Start metrics collection
   */
  start(): void {
    if (!this.config.enabled || this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log(`Starting metrics collection with ${this.config.exportInterval}ms interval`);
    
    // Start periodic metrics export
    this.exportInterval = setInterval(() => {
      this.exportMetrics();
      this.cleanupOldMetrics();
    }, this.config.exportInterval);

    this.emit('started');
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.exportInterval) {
      clearInterval(this.exportInterval);
      this.exportInterval = undefined;
    }

    console.log('Metrics collection stopped');
    this.emit('stopped');
  }

  /**
   * Record a metric value
   */
  recordMetric(metric: Omit<MetricValue, 'timestamp'>): void {
    if (!this.config.enabled) {
      return;
    }

    const metricWithTimestamp: MetricValue = {
      ...metric,
      timestamp: new Date()
    };

    const existing = this.metrics.get(metric.name) || [];
    existing.push(metricWithTimestamp);
    this.metrics.set(metric.name, existing);

    this.emit('metricRecorded', metricWithTimestamp);
  }

  /**
   * Record health check metrics from health status
   */
  private recordHealthMetrics(status: HealthStatus): void {
    // Overall health status
    const healthValue = status.status === 'healthy' ? 1 : 
                       status.status === 'degraded' ? 0.5 : 0;
    
    this.recordMetric({
      name: 'il2cpp_health_check_status',
      value: healthValue,
      type: 'gauge',
      labels: { status: status.status }
    });

    // Uptime
    this.recordMetric({
      name: 'il2cpp_uptime_seconds',
      value: status.uptime / 1000,
      type: 'counter'
    });

    // Memory metrics
    this.recordMetric({
      name: 'il2cpp_memory_usage_bytes',
      value: status.metrics.memory.used,
      type: 'gauge',
      labels: { type: 'rss' }
    });

    this.recordMetric({
      name: 'il2cpp_memory_usage_bytes',
      value: status.metrics.memory.heapUsed,
      type: 'gauge',
      labels: { type: 'heap_used' }
    });

    this.recordMetric({
      name: 'il2cpp_memory_usage_bytes',
      value: status.metrics.memory.heapTotal,
      type: 'gauge',
      labels: { type: 'heap_total' }
    });

    // CPU metrics
    this.recordMetric({
      name: 'il2cpp_cpu_usage_percent',
      value: status.metrics.cpu.usage,
      type: 'gauge'
    });

    // Database metrics
    this.recordMetric({
      name: 'il2cpp_database_connections_active',
      value: status.metrics.database.connectionCount,
      type: 'gauge'
    });

    // MCP metrics
    this.recordMetric({
      name: 'il2cpp_mcp_requests_total',
      value: status.metrics.mcp.totalRequests,
      type: 'counter'
    });

    this.recordMetric({
      name: 'il2cpp_mcp_active_connections',
      value: status.metrics.mcp.activeConnections,
      type: 'gauge'
    });

    // Component health metrics
    status.components.forEach(component => {
      const componentHealthValue = component.status === 'healthy' ? 1 :
                                  component.status === 'degraded' ? 0.5 : 0;
      
      this.recordMetric({
        name: 'il2cpp_component_health_status',
        value: componentHealthValue,
        type: 'gauge',
        labels: { 
          component: component.name,
          status: component.status
        }
      });

      if (component.responseTime !== undefined) {
        this.recordMetric({
          name: 'il2cpp_component_response_time_seconds',
          value: component.responseTime / 1000,
          type: 'histogram',
          labels: { component: component.name }
        });
      }
    });
  }

  /**
   * Get current metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    if (!this.config.prometheusEnabled) {
      return '';
    }

    const prometheusMetrics: PrometheusMetric[] = [];
    
    // Group metrics by name
    for (const [metricName, values] of this.metrics.entries()) {
      if (values.length === 0) continue;

      const latestValues = this.getLatestMetricValues(values);
      const metricDef = this.builtInMetrics[metricName as keyof typeof this.builtInMetrics];
      
      prometheusMetrics.push({
        name: metricName,
        type: metricDef?.type || 'gauge',
        help: metricDef?.help || `${metricName} metric`,
        values: latestValues.map(v => ({
          value: v.value,
          labels: v.labels
        }))
      });
    }

    return this.formatPrometheusOutput(prometheusMetrics);
  }

  /**
   * Get latest metric values (deduplicated by labels)
   */
  private getLatestMetricValues(values: MetricValue[]): MetricValue[] {
    const latestByLabels = new Map<string, MetricValue>();
    
    values.forEach(value => {
      const labelKey = JSON.stringify(value.labels || {});
      const existing = latestByLabels.get(labelKey);
      
      if (!existing || value.timestamp > existing.timestamp) {
        latestByLabels.set(labelKey, value);
      }
    });
    
    return Array.from(latestByLabels.values());
  }

  /**
   * Format metrics in Prometheus exposition format
   */
  private formatPrometheusOutput(metrics: PrometheusMetric[]): string {
    let output = '';
    
    metrics.forEach(metric => {
      // Add metric metadata
      output += `# HELP ${metric.name} ${metric.help}\n`;
      output += `# TYPE ${metric.name} ${metric.type}\n`;
      
      // Add metric values
      metric.values.forEach(value => {
        const labelsStr = value.labels ? 
          '{' + Object.entries(value.labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',') + '}' : '';
        
        output += `${metric.name}${labelsStr} ${value.value}\n`;
      });
      
      output += '\n';
    });
    
    return output;
  }

  /**
   * Export metrics (can be extended for different export targets)
   */
  private exportMetrics(): void {
    if (!this.config.enabled) {
      return;
    }

    const prometheusMetrics = this.getPrometheusMetrics();
    
    this.emit('metricsExported', {
      format: 'prometheus',
      data: prometheusMetrics,
      timestamp: new Date()
    });

    // Log metrics summary
    const totalMetrics = Array.from(this.metrics.values())
      .reduce((sum, values) => sum + values.length, 0);
    
    console.log(`Exported ${totalMetrics} metrics across ${this.metrics.size} metric types`);
  }

  /**
   * Clean up old metrics based on retention period
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - this.config.retentionPeriod);
    
    for (const [metricName, values] of this.metrics.entries()) {
      const filteredValues = values.filter(v => v.timestamp > cutoffTime);
      
      if (filteredValues.length !== values.length) {
        this.metrics.set(metricName, filteredValues);
      }
    }
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    totalMetrics: number;
    metricTypes: number;
    oldestMetric?: Date;
    newestMetric?: Date;
    isRunning: boolean;
  } {
    let oldestMetric: Date | undefined;
    let newestMetric: Date | undefined;
    let totalMetrics = 0;

    for (const values of this.metrics.values()) {
      totalMetrics += values.length;
      
      values.forEach(value => {
        if (!oldestMetric || value.timestamp < oldestMetric) {
          oldestMetric = value.timestamp;
        }
        if (!newestMetric || value.timestamp > newestMetric) {
          newestMetric = value.timestamp;
        }
      });
    }

    return {
      totalMetrics,
      metricTypes: this.metrics.size,
      oldestMetric,
      newestMetric,
      isRunning: this.isRunning
    };
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    console.log('All metrics cleared');
    this.emit('metricsCleared');
  }
}
