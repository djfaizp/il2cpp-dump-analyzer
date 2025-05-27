/**
 * Container lifecycle management for IL2CPP dump analyzer MCP system
 * Handles startup, shutdown, health monitoring, and restart policies
 */

import { EventEmitter } from 'events';
import { HealthService, HealthStatus } from './health-service.js';
import { MetricsService } from './metrics-service.js';

export interface LifecycleConfig {
  startupTimeout: number;
  shutdownTimeout: number;
  healthCheckInterval: number;
  restartPolicy: 'never' | 'on-failure' | 'always' | 'unless-stopped';
  maxRestarts: number;
  restartDelay: number;
  dependencyChecks: boolean;
  gracefulShutdown: boolean;
}

export interface LifecycleState {
  phase: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
  startTime?: Date;
  lastRestart?: Date;
  restartCount: number;
  isHealthy: boolean;
  dependencies: DependencyStatus[];
}

export interface DependencyStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  required: boolean;
  checkUrl?: string;
  timeout: number;
}

/**
 * Container lifecycle management service
 */
export class LifecycleManager extends EventEmitter {
  private config: LifecycleConfig;
  private state: LifecycleState;
  private healthService?: HealthService;
  private metricsService?: MetricsService;

  private startupTimer?: NodeJS.Timeout;
  private shutdownTimer?: NodeJS.Timeout;
  private restartTimer?: NodeJS.Timeout;
  private dependencyCheckInterval?: NodeJS.Timeout;

  private shutdownHandlers: Array<() => Promise<void>> = [];
  private startupHandlers: Array<() => Promise<void>> = [];

  constructor(config?: Partial<LifecycleConfig>) {
    super();

    this.config = {
      startupTimeout: 60000, // 1 minute
      shutdownTimeout: 30000, // 30 seconds
      healthCheckInterval: 30000, // 30 seconds
      restartPolicy: 'on-failure',
      maxRestarts: 5,
      restartDelay: 5000, // 5 seconds
      dependencyChecks: true,
      gracefulShutdown: true,
      ...config
    };

    this.state = {
      phase: 'stopped',
      restartCount: 0,
      isHealthy: false,
      dependencies: this.initializeDependencies()
    };

    this.setupSignalHandlers();
  }

  /**
   * Initialize dependency definitions
   */
  private initializeDependencies(): DependencyStatus[] {
    return [
      {
        name: 'supabase-db',
        status: 'unknown',
        lastCheck: new Date(),
        required: true,
        timeout: 5000
      },
      {
        name: 'supabase-rest',
        status: 'unknown',
        lastCheck: new Date(),
        required: true,
        checkUrl: process.env.SUPABASE_URL,
        timeout: 5000
      },
      {
        name: 'xenova-models',
        status: 'unknown',
        lastCheck: new Date(),
        required: false,
        timeout: 10000
      }
    ];
  }

  /**
   * Initialize lifecycle manager with services
   */
  initialize(services: {
    healthService: HealthService;
    metricsService: MetricsService;
  }): void {
    this.healthService = services.healthService;
    this.metricsService = services.metricsService;

    // Listen to health status changes
    this.healthService.on('healthCheck', (status: HealthStatus) => {
      this.handleHealthStatusChange(status);
    });

    // Register shutdown handlers for services
    this.healthService.onShutdown(async () => {
      console.log('Shutting down health service...');
      this.healthService?.stop();
    });

    this.metricsService.on('started', () => {
      console.log('Metrics service started');
    });

    console.log('Lifecycle manager initialized');
  }

  /**
   * Start the application lifecycle
   */
  async start(): Promise<void> {
    if (this.state.phase === 'running' || this.state.phase === 'starting') {
      console.warn('Application is already starting or running');
      return;
    }

    console.log('Starting application lifecycle...');
    this.setState({ phase: 'starting', startTime: new Date() });

    try {
      // Set startup timeout
      const startupPromise = this.executeStartup();
      const timeoutPromise = new Promise<never>((_, reject) => {
        this.startupTimer = setTimeout(() => {
          reject(new Error(`Startup timeout after ${this.config.startupTimeout}ms`));
        }, this.config.startupTimeout);
      });

      await Promise.race([startupPromise, timeoutPromise]);

      // Clear startup timer
      if (this.startupTimer) {
        clearTimeout(this.startupTimer);
        this.startupTimer = undefined;
      }

      this.setState({ phase: 'running', isHealthy: true });
      console.log('Application started successfully');
      this.emit('started');

    } catch (error) {
      console.error('Application startup failed:', error);
      this.setState({ phase: 'failed' });
      this.emit('startupFailed', error);

      // Handle restart policy
      await this.handleRestartPolicy(error);
    }
  }

  /**
   * Execute startup sequence
   */
  private async executeStartup(): Promise<void> {
    console.log('Executing startup sequence...');

    // Check dependencies first
    if (this.config.dependencyChecks) {
      await this.checkDependencies();

      const requiredDepsHealthy = this.state.dependencies
        .filter(dep => dep.required)
        .every(dep => dep.status === 'healthy');

      if (!requiredDepsHealthy) {
        throw new Error('Required dependencies are not healthy');
      }
    }

    // Execute startup handlers
    for (const [index, handler] of this.startupHandlers.entries()) {
      try {
        console.log(`Executing startup handler ${index + 1}/${this.startupHandlers.length}`);
        await handler();
      } catch (error) {
        throw new Error(`Startup handler ${index + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Start services
    if (this.healthService) {
      this.healthService.start();
    }

    if (this.metricsService) {
      this.metricsService.start();
    }

    // Start dependency monitoring
    if (this.config.dependencyChecks) {
      this.startDependencyMonitoring();
    }
  }

  /**
   * Stop the application lifecycle
   */
  async stop(): Promise<void> {
    if (this.state.phase === 'stopped' || this.state.phase === 'stopping') {
      console.warn('Application is already stopping or stopped');
      return;
    }

    console.log('Stopping application lifecycle...');
    this.setState({ phase: 'stopping' });

    try {
      if (this.config.gracefulShutdown) {
        await this.executeGracefulShutdown();
      } else {
        await this.executeImmediateShutdown();
      }

      this.setState({ phase: 'stopped', isHealthy: false });
      console.log('Application stopped successfully');
      this.emit('stopped');

    } catch (error) {
      console.error('Application shutdown failed:', error);
      this.setState({ phase: 'failed' });
      this.emit('shutdownFailed', error);
    }
  }

  /**
   * Execute graceful shutdown
   */
  private async executeGracefulShutdown(): Promise<void> {
    console.log('Executing graceful shutdown...');

    const shutdownPromise = this.executeShutdownSequence();
    const timeoutPromise = new Promise<never>((_, reject) => {
      this.shutdownTimer = setTimeout(() => {
        reject(new Error(`Shutdown timeout after ${this.config.shutdownTimeout}ms`));
      }, this.config.shutdownTimeout);
    });

    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
    } finally {
      if (this.shutdownTimer) {
        clearTimeout(this.shutdownTimer);
        this.shutdownTimer = undefined;
      }
    }
  }

  /**
   * Execute shutdown sequence
   */
  private async executeShutdownSequence(): Promise<void> {
    // Stop dependency monitoring
    this.stopDependencyMonitoring();

    // Stop services
    if (this.metricsService) {
      this.metricsService.stop();
    }

    if (this.healthService) {
      this.healthService.stop();
    }

    // Execute shutdown handlers
    for (const [index, handler] of this.shutdownHandlers.entries()) {
      try {
        console.log(`Executing shutdown handler ${index + 1}/${this.shutdownHandlers.length}`);
        await Promise.race([
          handler(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Handler timeout')), 5000)
          )
        ]);
      } catch (error) {
        console.error(`Shutdown handler ${index + 1} failed:`, error);
      }
    }
  }

  /**
   * Execute immediate shutdown
   */
  private async executeImmediateShutdown(): Promise<void> {
    console.log('Executing immediate shutdown...');

    // Stop all timers
    this.stopDependencyMonitoring();

    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
    }

    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
    }

    // Force stop services
    this.metricsService?.stop();
    this.healthService?.stop();
  }

  /**
   * Handle health status changes
   */
  private handleHealthStatusChange(status: HealthStatus): void {
    const wasHealthy = this.state.isHealthy;
    const isHealthy = status.status === 'healthy';

    this.setState({ isHealthy });

    // Handle health status transitions
    if (wasHealthy && !isHealthy) {
      console.warn('Application became unhealthy');
      this.emit('unhealthy', status);

      // Consider restart based on policy
      if (this.config.restartPolicy === 'on-failure' || this.config.restartPolicy === 'always') {
        this.scheduleRestart('health check failure');
      }
    } else if (!wasHealthy && isHealthy) {
      console.log('Application became healthy');
      this.emit('healthy', status);
    }
  }

  /**
   * Handle restart policy
   */
  private async handleRestartPolicy(error: any): Promise<void> {
    if (this.config.restartPolicy === 'never') {
      console.log('Restart policy is "never", not restarting');
      return;
    }

    if (this.state.restartCount >= this.config.maxRestarts) {
      console.error(`Maximum restart attempts (${this.config.maxRestarts}) reached`);
      this.emit('maxRestartsReached');
      return;
    }

    if (this.config.restartPolicy === 'on-failure' || this.config.restartPolicy === 'always') {
      this.scheduleRestart(error);
    }
  }

  /**
   * Schedule a restart
   */
  private scheduleRestart(reason: any): void {
    if (this.restartTimer) {
      return; // Restart already scheduled
    }

    console.log(`Scheduling restart in ${this.config.restartDelay}ms due to: ${reason}`);

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = undefined;
      await this.restart(reason);
    }, this.config.restartDelay);
  }

  /**
   * Restart the application
   */
  private async restart(reason: any): Promise<void> {
    console.log(`Restarting application (attempt ${this.state.restartCount + 1}/${this.config.maxRestarts})`);

    this.setState({
      restartCount: this.state.restartCount + 1,
      lastRestart: new Date()
    });

    this.emit('restarting', { reason, attempt: this.state.restartCount });

    try {
      await this.stop();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
      await this.start();
    } catch (error) {
      console.error('Restart failed:', error);
      this.emit('restartFailed', error);
    }
  }

  /**
   * Check dependencies health
   */
  private async checkDependencies(): Promise<void> {
    console.log('Checking dependencies...');

    const checkPromises = this.state.dependencies.map(async (dep) => {
      try {
        const isHealthy = await this.checkDependency(dep);
        dep.status = isHealthy ? 'healthy' : 'unhealthy';
        dep.lastCheck = new Date();
      } catch (error) {
        console.warn(`Dependency check failed for ${dep.name}:`, error);
        dep.status = 'unhealthy';
        dep.lastCheck = new Date();
      }
    });

    await Promise.all(checkPromises);

    const healthyCount = this.state.dependencies.filter(d => d.status === 'healthy').length;
    console.log(`Dependencies: ${healthyCount}/${this.state.dependencies.length} healthy`);
  }

  /**
   * Check individual dependency
   */
  private async checkDependency(dep: DependencyStatus): Promise<boolean> {
    // Implement specific dependency checks based on type
    switch (dep.name) {
      case 'supabase-db':
        return this.checkDatabaseDependency(dep);
      case 'supabase-rest':
        return this.checkRestApiDependency(dep);
      case 'xenova-models':
        return this.checkModelsDependency(dep);
      default:
        return true; // Unknown dependencies are considered healthy
    }
  }

  /**
   * Check database dependency
   */
  private async checkDatabaseDependency(dep: DependencyStatus): Promise<boolean> {
    try {
      // Use health service to check database if available
      if (this.healthService) {
        const status = await this.healthService.getHealthStatus();
        const dbComponent = status.components.find(c => c.name === 'database');
        return dbComponent?.status === 'healthy';
      }
      return true;
    } catch (error) {
      console.warn(`Database dependency check failed:`, error);
      return false;
    }
  }

  /**
   * Check REST API dependency
   */
  private async checkRestApiDependency(dep: DependencyStatus): Promise<boolean> {
    if (!dep.checkUrl) {
      return true;
    }

    try {
      // Simple HTTP health check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), dep.timeout);

      const response = await fetch(`${dep.checkUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'IL2CPP-MCP-HealthCheck/1.0' }
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn(`REST API dependency check failed:`, error);
      return false;
    }
  }

  /**
   * Check models dependency (Xenova models availability)
   */
  private async checkModelsDependency(dep: DependencyStatus): Promise<boolean> {
    try {
      // Check if model cache directory exists and is accessible
      const fs = await import('fs/promises');
      const modelCachePath = process.env.MODEL_CACHE_PATH || '/app/models';

      await fs.access(modelCachePath);
      return true;
    } catch (error) {
      console.warn(`Models dependency check failed:`, error);
      return false;
    }
  }

  /**
   * Start dependency monitoring
   */
  private startDependencyMonitoring(): void {
    if (this.dependencyCheckInterval) {
      return;
    }

    console.log('Starting dependency monitoring...');
    this.dependencyCheckInterval = setInterval(async () => {
      await this.checkDependencies();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop dependency monitoring
   */
  private stopDependencyMonitoring(): void {
    if (this.dependencyCheckInterval) {
      clearInterval(this.dependencyCheckInterval);
      this.dependencyCheckInterval = undefined;
      console.log('Dependency monitoring stopped');
    }
  }

  /**
   * Setup signal handlers
   */
  private setupSignalHandlers(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;

    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`Received ${signal}, initiating graceful shutdown...`);
        await this.stop();
        process.exit(0);
      });
    });
  }

  /**
   * Update lifecycle state
   */
  private setState(updates: Partial<LifecycleState>): void {
    this.state = { ...this.state, ...updates };
    this.emit('stateChanged', this.state);
  }

  /**
   * Register startup handler
   */
  onStartup(handler: () => Promise<void>): void {
    this.startupHandlers.push(handler);
  }

  /**
   * Register shutdown handler
   */
  onShutdown(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Get current lifecycle state
   */
  getState(): LifecycleState {
    return { ...this.state };
  }

  /**
   * Get lifecycle configuration
   */
  getConfig(): LifecycleConfig {
    return { ...this.config };
  }

  /**
   * Force restart (manual trigger)
   */
  async forceRestart(reason: string = 'manual trigger'): Promise<void> {
    console.log(`Force restart requested: ${reason}`);
    await this.restart(reason);
  }

  /**
   * Reset restart counter
   */
  resetRestartCounter(): void {
    this.setState({ restartCount: 0 });
    console.log('Restart counter reset');
  }
}
