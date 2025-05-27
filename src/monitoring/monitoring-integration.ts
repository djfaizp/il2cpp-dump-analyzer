/**
 * Monitoring integration service for IL2CPP dump analyzer MCP system
 * Coordinates health monitoring, metrics collection, and lifecycle management
 */

import { EventEmitter } from 'events';
import { HealthService } from './health-service';
import { MetricsService } from './metrics-service';
import { LifecycleManager } from './lifecycle-manager';
import { SupabaseConnectionManager } from '../database/connection-manager';
import { EnhancedSupabaseVectorStore } from '../database/enhanced-vector-store';
import { XenovaEmbeddings } from '../embeddings/xenova-embeddings';

export interface MonitoringConfig {
  enabled: boolean;
  healthChecks: {
    enabled: boolean;
    interval: number;
    timeout: number;
  };
  metrics: {
    enabled: boolean;
    exportInterval: number;
    prometheusEnabled: boolean;
  };
  lifecycle: {
    enabled: boolean;
    restartPolicy: 'never' | 'on-failure' | 'always';
    maxRestarts: number;
  };
  alerts: {
    enabled: boolean;
    webhookUrl?: string;
    emailEnabled: boolean;
  };
}

export interface MonitoringStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    health: boolean;
    metrics: boolean;
    lifecycle: boolean;
  };
  uptime: number;
  lastUpdate: Date;
}

/**
 * Comprehensive monitoring integration service
 */
export class MonitoringIntegration extends EventEmitter {
  private config: MonitoringConfig;
  private healthService!: HealthService;
  private metricsService!: MetricsService;
  private lifecycleManager!: LifecycleManager;

  private isInitialized: boolean = false;
  private isRunning: boolean = false;
  private startTime: Date;

  constructor(config?: Partial<MonitoringConfig>) {
    super();

    this.config = {
      enabled: true,
      healthChecks: {
        enabled: true,
        interval: 30000,
        timeout: 10000
      },
      metrics: {
        enabled: true,
        exportInterval: 60000,
        prometheusEnabled: true
      },
      lifecycle: {
        enabled: true,
        restartPolicy: 'on-failure',
        maxRestarts: 5
      },
      alerts: {
        enabled: false,
        emailEnabled: false
      },
      ...config
    };

    this.startTime = new Date();
    this.initializeServices();
  }

  /**
   * Initialize monitoring services
   */
  private initializeServices(): void {
    // Initialize health service
    this.healthService = new HealthService({
      interval: this.config.healthChecks.interval,
      timeout: this.config.healthChecks.timeout,
      components: {
        database: true,
        vectorStore: true,
        embeddings: true,
        mcp: true
      }
    });

    // Initialize metrics service
    this.metricsService = new MetricsService({
      enabled: this.config.metrics.enabled,
      exportInterval: this.config.metrics.exportInterval,
      prometheusEnabled: this.config.metrics.prometheusEnabled
    });

    // Initialize lifecycle manager
    this.lifecycleManager = new LifecycleManager({
      restartPolicy: this.config.lifecycle.restartPolicy,
      maxRestarts: this.config.lifecycle.maxRestarts,
      healthCheckInterval: this.config.healthChecks.interval
    });

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers between services
   */
  private setupEventHandlers(): void {
    // Health service events
    this.healthService.on('healthCheck', (status) => {
      this.emit('healthStatusChanged', status);

      // Log significant health changes
      if (status.status !== 'healthy') {
        console.warn(`Health status: ${status.status}`, {
          components: status.components.filter((c: any) => c.status !== 'healthy')
        });
      }
    });

    this.healthService.on('started', () => {
      console.log('Health monitoring started');
    });

    this.healthService.on('stopped', () => {
      console.log('Health monitoring stopped');
    });

    // Metrics service events
    this.metricsService.on('metricsExported', (data) => {
      this.emit('metricsExported', data);
    });

    this.metricsService.on('started', () => {
      console.log('Metrics collection started');
    });

    this.metricsService.on('stopped', () => {
      console.log('Metrics collection stopped');
    });

    // Lifecycle manager events
    this.lifecycleManager.on('started', () => {
      console.log('Application lifecycle started');
      this.emit('applicationStarted');
    });

    this.lifecycleManager.on('stopped', () => {
      console.log('Application lifecycle stopped');
      this.emit('applicationStopped');
    });

    this.lifecycleManager.on('restarting', (data) => {
      console.log(`Application restarting: ${data.reason} (attempt ${data.attempt})`);
      this.emit('applicationRestarting', data);
    });

    this.lifecycleManager.on('unhealthy', (status) => {
      console.error('Application became unhealthy:', status);
      this.emit('applicationUnhealthy', status);

      // Trigger alerts if enabled
      if (this.config.alerts.enabled) {
        this.sendAlert('unhealthy', status);
      }
    });

    this.lifecycleManager.on('healthy', (status) => {
      console.log('Application became healthy');
      this.emit('applicationHealthy', status);
    });
  }

  /**
   * Initialize monitoring with application components
   */
  async initialize(components: {
    connectionManager?: SupabaseConnectionManager;
    vectorStore?: EnhancedSupabaseVectorStore;
    embeddings?: XenovaEmbeddings;
  }): Promise<void> {
    if (this.isInitialized) {
      console.warn('Monitoring integration already initialized');
      return;
    }

    console.log('Initializing monitoring integration...');

    try {
      // Initialize health service with components
      await this.healthService.initialize(components);

      // Initialize metrics service with health service
      this.metricsService.initialize(this.healthService);

      // Initialize lifecycle manager with services
      this.lifecycleManager.initialize({
        healthService: this.healthService,
        metricsService: this.metricsService
      });

      this.isInitialized = true;
      console.log('Monitoring integration initialized successfully');
      this.emit('initialized');

    } catch (error) {
      console.error('Failed to initialize monitoring integration:', error);
      throw error;
    }
  }

  /**
   * Start all monitoring services
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Monitoring integration not initialized');
    }

    if (this.isRunning) {
      console.warn('Monitoring integration already running');
      return;
    }

    console.log('Starting monitoring integration...');

    try {
      // Start lifecycle manager (which will start other services)
      await this.lifecycleManager.start();

      this.isRunning = true;
      console.log('Monitoring integration started successfully');
      this.emit('started');

    } catch (error) {
      console.error('Failed to start monitoring integration:', error);
      throw error;
    }
  }

  /**
   * Stop all monitoring services
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.warn('Monitoring integration not running');
      return;
    }

    console.log('Stopping monitoring integration...');

    try {
      // Stop lifecycle manager (which will stop other services)
      await this.lifecycleManager.stop();

      this.isRunning = false;
      console.log('Monitoring integration stopped successfully');
      this.emit('stopped');

    } catch (error) {
      console.error('Failed to stop monitoring integration:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive monitoring status
   */
  async getStatus(): Promise<MonitoringStatus> {
    const healthStatus = await this.healthService.getHealthStatus();
    const metricsStatus = this.metricsService.getMetricsSummary();
    const lifecycleStatus = this.lifecycleManager.getState();

    return {
      overall: healthStatus.status,
      services: {
        health: this.healthService.getStats().isRunning,
        metrics: metricsStatus.isRunning,
        lifecycle: lifecycleStatus.phase === 'running'
      },
      uptime: Date.now() - this.startTime.getTime(),
      lastUpdate: new Date()
    };
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    return this.healthService.getHealthStatus();
  }

  /**
   * Get metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    return this.metricsService.getPrometheusMetrics();
  }

  /**
   * Get lifecycle state
   */
  getLifecycleState() {
    return this.lifecycleManager.getState();
  }

  /**
   * Force application restart
   */
  async forceRestart(reason: string = 'manual trigger'): Promise<void> {
    console.log(`Force restart requested: ${reason}`);
    await this.lifecycleManager.forceRestart(reason);
  }

  /**
   * Update MCP metrics
   */
  updateMCPMetrics(metrics: {
    activeConnections?: number;
    requestProcessed?: boolean;
    responseTime?: number;
    error?: boolean;
  }): void {
    this.healthService.updateMCPMetrics(metrics);
  }

  /**
   * Record custom metric
   */
  recordMetric(metric: {
    name: string;
    value: number;
    labels?: Record<string, string>;
    type: 'counter' | 'gauge' | 'histogram' | 'summary';
    help?: string;
  }): void {
    this.metricsService.recordMetric(metric);
  }

  /**
   * Send alert notification
   */
  private async sendAlert(type: string, data: any): Promise<void> {
    try {
      const alert = {
        type,
        timestamp: new Date().toISOString(),
        service: 'il2cpp-dump-analyzer-mcp',
        data,
        severity: type === 'unhealthy' ? 'critical' : 'warning'
      };

      // Log alert
      console.warn('ALERT:', alert);

      // Send webhook if configured
      if (this.config.alerts.webhookUrl) {
        await this.sendWebhookAlert(alert);
      }

      this.emit('alertSent', alert);

    } catch (error) {
      console.error('Failed to send alert:', error);
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: any): Promise<void> {
    if (!this.config.alerts.webhookUrl) {
      return;
    }

    try {
      const response = await fetch(this.config.alerts.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'IL2CPP-MCP-Monitor/1.0'
        },
        body: JSON.stringify(alert)
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }

      console.log('Alert webhook sent successfully');

    } catch (error) {
      console.error('Failed to send webhook alert:', error);
    }
  }

  /**
   * Register shutdown handler
   */
  onShutdown(handler: () => Promise<void>): void {
    this.lifecycleManager.onShutdown(handler);
  }

  /**
   * Register startup handler
   */
  onStartup(handler: () => Promise<void>): void {
    this.lifecycleManager.onStartup(handler);
  }

  /**
   * Get monitoring configuration
   */
  getConfig(): MonitoringConfig {
    return { ...this.config };
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(updates: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('Monitoring configuration updated');
    this.emit('configUpdated', this.config);
  }
}
