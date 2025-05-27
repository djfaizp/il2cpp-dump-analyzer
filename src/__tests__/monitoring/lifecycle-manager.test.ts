/**
 * Tests for LifecycleManager - container lifecycle management
 */

import { LifecycleManager, LifecycleState } from '../../monitoring/lifecycle-manager';
import { HealthService } from '../../monitoring/health-service';
import { MetricsService } from '../../monitoring/metrics-service';

// Mock dependencies
jest.mock('../../monitoring/health-service');
jest.mock('../../monitoring/metrics-service');
jest.mock('fs/promises');

describe('LifecycleManager', () => {
  let lifecycleManager: LifecycleManager;
  let mockHealthService: jest.Mocked<HealthService>;
  let mockMetricsService: jest.Mocked<MetricsService>;

  beforeEach(() => {
    mockHealthService = {
      on: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      onShutdown: jest.fn(),
      getHealthStatus: jest.fn()
    } as any;

    mockMetricsService = {
      on: jest.fn(),
      start: jest.fn(),
      stop: jest.fn()
    } as any;

    lifecycleManager = new LifecycleManager({
      startupTimeout: 1000,
      shutdownTimeout: 500,
      healthCheckInterval: 100,
      restartPolicy: 'on-failure',
      maxRestarts: 3,
      restartDelay: 100,
      dependencyChecks: false  // Disable dependency checks for tests
    });
  });

  afterEach(async () => {
    await lifecycleManager.stop();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultManager = new LifecycleManager();
      expect(defaultManager).toBeDefined();
      expect(defaultManager.getState().phase).toBe('stopped');
    });

    it('should initialize with services', () => {
      lifecycleManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });

      expect(mockHealthService.on).toHaveBeenCalledWith('healthCheck', expect.any(Function));
      expect(mockHealthService.onShutdown).toHaveBeenCalled();
    });
  });

  describe('startup lifecycle', () => {
    beforeEach(() => {
      lifecycleManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });
    });

    it('should start successfully', async () => {
      const startPromise = lifecycleManager.start();

      expect(lifecycleManager.getState().phase).toBe('starting');

      await startPromise;

      expect(lifecycleManager.getState().phase).toBe('running');
      expect(mockHealthService.start).toHaveBeenCalled();
      expect(mockMetricsService.start).toHaveBeenCalled();
    });

    it('should emit started event', (done) => {
      lifecycleManager.on('started', () => {
        expect(lifecycleManager.getState().phase).toBe('running');
        done();
      });

      lifecycleManager.start();
    });

    it('should handle startup timeout', async () => {
      const slowManager = new LifecycleManager({
        startupTimeout: 50,
        dependencyChecks: false
      });

      slowManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });

      // Add a slow startup handler
      slowManager.onStartup(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      await expect(slowManager.start()).rejects.toThrow('Startup timeout');
      expect(slowManager.getState().phase).toBe('failed');
    });

    it('should execute startup handlers', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      lifecycleManager.onStartup(handler1);
      lifecycleManager.onStartup(handler2);

      await lifecycleManager.start();

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle startup handler failure', async () => {
      const failingHandler = jest.fn().mockRejectedValue(new Error('Startup failed'));
      lifecycleManager.onStartup(failingHandler);

      await expect(lifecycleManager.start()).rejects.toThrow('Startup failed');
      expect(lifecycleManager.getState().phase).toBe('failed');
    });
  });

  describe('shutdown lifecycle', () => {
    beforeEach(async () => {
      lifecycleManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });
      await lifecycleManager.start();
    });

    it('should stop gracefully', async () => {
      await lifecycleManager.stop();

      expect(lifecycleManager.getState().phase).toBe('stopped');
      expect(mockHealthService.stop).toHaveBeenCalled();
      expect(mockMetricsService.stop).toHaveBeenCalled();
    });

    it('should emit stopped event', (done) => {
      lifecycleManager.on('stopped', () => {
        expect(lifecycleManager.getState().phase).toBe('stopped');
        done();
      });

      lifecycleManager.stop();
    });

    it('should execute shutdown handlers', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      lifecycleManager.onShutdown(handler1);
      lifecycleManager.onShutdown(handler2);

      await lifecycleManager.stop();

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle shutdown timeout', async () => {
      const slowManager = new LifecycleManager({
        shutdownTimeout: 50,
        gracefulShutdown: true,
        dependencyChecks: false
      });

      slowManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });

      await slowManager.start();

      // Add slow shutdown handler
      slowManager.onShutdown(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Should complete despite timeout
      await slowManager.stop();
      expect(slowManager.getState().phase).toBe('stopped');
    });
  });

  describe('health monitoring integration', () => {
    beforeEach(async () => {
      lifecycleManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });
      await lifecycleManager.start();
    });

    it('should handle health status changes', () => {
      const healthCheckHandler = mockHealthService.on.mock.calls.find(
        call => call[0] === 'healthCheck'
      )?.[1];

      expect(healthCheckHandler).toBeDefined();

      // Simulate healthy status
      healthCheckHandler({ status: 'healthy' });
      expect(lifecycleManager.getState().isHealthy).toBe(true);

      // Simulate unhealthy status
      healthCheckHandler({ status: 'unhealthy' });
      expect(lifecycleManager.getState().isHealthy).toBe(false);
    });

    it('should emit health events', (done) => {
      let eventCount = 0;

      lifecycleManager.on('healthy', () => {
        eventCount++;
        if (eventCount === 2) done();
      });

      lifecycleManager.on('unhealthy', () => {
        eventCount++;
        if (eventCount === 2) done();
      });

      const healthCheckHandler = mockHealthService.on.mock.calls.find(
        call => call[0] === 'healthCheck'
      )?.[1];

      // Trigger health events
      healthCheckHandler({ status: 'unhealthy' });
      healthCheckHandler({ status: 'healthy' });
    });
  });

  describe('restart policies', () => {
    beforeEach(() => {
      lifecycleManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });
    });

    it('should restart on failure with on-failure policy', (done) => {
      lifecycleManager.on('restarting', (data) => {
        expect(data.attempt).toBe(1);
        expect(lifecycleManager.getState().restartCount).toBe(1);
        done();
      });

      // Simulate startup failure
      lifecycleManager.onStartup(async () => {
        throw new Error('Simulated failure');
      });

      lifecycleManager.start().catch(() => {
        // Expected to fail and trigger restart
      });
    });

    it('should not restart with never policy', async () => {
      const neverRestartManager = new LifecycleManager({
        restartPolicy: 'never',
        startupTimeout: 100,
        dependencyChecks: false
      });

      neverRestartManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });

      neverRestartManager.onStartup(async () => {
        throw new Error('Simulated failure');
      });

      await expect(neverRestartManager.start()).rejects.toThrow('Simulated failure');
      expect(neverRestartManager.getState().restartCount).toBe(0);
    });

    it('should respect max restart limit', async () => {
      const limitedManager = new LifecycleManager({
        restartPolicy: 'on-failure',
        maxRestarts: 2,
        restartDelay: 10,
        dependencyChecks: false
      });

      limitedManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });

      let restartAttempts = 0;
      limitedManager.on('restarting', () => {
        restartAttempts++;
      });

      limitedManager.on('maxRestartsReached', () => {
        expect(restartAttempts).toBe(2);
        expect(limitedManager.getState().restartCount).toBe(2);
      });

      // Simulate repeated failures
      limitedManager.onStartup(async () => {
        throw new Error('Persistent failure');
      });

      await limitedManager.start().catch(() => {});
    });

    it('should reset restart counter', () => {
      lifecycleManager.getState().restartCount = 3;
      lifecycleManager.resetRestartCounter();
      expect(lifecycleManager.getState().restartCount).toBe(0);
    });
  });

  describe('dependency checking', () => {
    beforeEach(() => {
      lifecycleManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });
    });

    it('should check dependencies during startup', async () => {
      const dependencyManager = new LifecycleManager({
        dependencyChecks: true,
        startupTimeout: 1000
      });

      dependencyManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });

      // Mock health service to return healthy database
      mockHealthService.getHealthStatus.mockResolvedValue({
        status: 'healthy',
        components: [
          { name: 'database', status: 'healthy', message: 'OK', lastCheck: new Date() }
        ]
      } as any);

      await dependencyManager.start();
      expect(dependencyManager.getState().phase).toBe('running');
    });

    it('should fail startup if required dependencies unhealthy', async () => {
      const dependencyManager = new LifecycleManager({
        dependencyChecks: true,
        startupTimeout: 1000
      });

      dependencyManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });

      // Mock health service to return unhealthy database
      mockHealthService.getHealthStatus.mockResolvedValue({
        status: 'unhealthy',
        components: [
          { name: 'database', status: 'unhealthy', message: 'Failed', lastCheck: new Date() }
        ]
      } as any);

      await expect(dependencyManager.start()).rejects.toThrow('Required dependencies are not healthy');
    });
  });

  describe('force restart', () => {
    beforeEach(async () => {
      lifecycleManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });
      await lifecycleManager.start();
    });

    it('should force restart with custom reason', (done) => {
      lifecycleManager.on('restarting', (data) => {
        expect(data.reason).toBe('manual trigger');
        done();
      });

      lifecycleManager.forceRestart('manual trigger');
    });
  });

  describe('state management', () => {
    it('should track lifecycle state correctly', async () => {
      lifecycleManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });

      expect(lifecycleManager.getState().phase).toBe('stopped');

      const startPromise = lifecycleManager.start();
      expect(lifecycleManager.getState().phase).toBe('starting');

      await startPromise;
      expect(lifecycleManager.getState().phase).toBe('running');

      const stopPromise = lifecycleManager.stop();
      expect(lifecycleManager.getState().phase).toBe('stopping');

      await stopPromise;
      expect(lifecycleManager.getState().phase).toBe('stopped');
    });

    it('should emit state change events', (done) => {
      let stateChanges = 0;

      lifecycleManager.on('stateChanged', (state: LifecycleState) => {
        stateChanges++;
        if (stateChanges === 2) {
          expect(state.phase).toBe('running');
          done();
        }
      });

      lifecycleManager.initialize({
        healthService: mockHealthService,
        metricsService: mockMetricsService
      });

      lifecycleManager.start();
    });

    it('should provide configuration access', () => {
      const config = lifecycleManager.getConfig();
      expect(config.restartPolicy).toBe('on-failure');
      expect(config.maxRestarts).toBe(3);
    });
  });
});
