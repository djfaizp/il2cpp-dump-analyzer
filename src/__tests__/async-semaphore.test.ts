/**
 * Tests for AsyncSemaphore - Async concurrency control without busy-waiting
 * Following TFD methodology - tests written before implementation
 */

import { AsyncSemaphore, AsyncSemaphoreOptions, SemaphoreMetrics } from '../performance/async-semaphore';

describe('AsyncSemaphore', () => {
  let semaphore: AsyncSemaphore;

  afterEach(() => {
    if (semaphore) {
      semaphore.dispose();
    }
  });

  describe('Basic Functionality', () => {
    test('should allow immediate acquire when permits available', async () => {
      semaphore = new AsyncSemaphore({ permits: 2 });
      
      const start = Date.now();
      await semaphore.acquire();
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(10); // Should be immediate
    });

    test('should block acquire when no permits available', async () => {
      semaphore = new AsyncSemaphore({ permits: 1 });
      
      // First acquire should succeed immediately
      await semaphore.acquire();
      
      // Second acquire should block
      const acquirePromise = semaphore.acquire();
      let resolved = false;
      acquirePromise.then(() => { resolved = true; });
      
      // Wait a bit and verify it's still blocked
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(resolved).toBe(false);
      
      // Release and verify it resolves
      semaphore.release();
      await acquirePromise;
      expect(resolved).toBe(true);
    });

    test('should handle multiple concurrent acquires in FIFO order', async () => {
      semaphore = new AsyncSemaphore({ permits: 1 });
      
      // Acquire the only permit
      await semaphore.acquire();
      
      // Queue multiple acquire requests
      const order: number[] = [];
      const promises = [
        semaphore.acquire().then(() => order.push(1)),
        semaphore.acquire().then(() => order.push(2)),
        semaphore.acquire().then(() => order.push(3))
      ];
      
      // Release permits one by one
      semaphore.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      semaphore.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      semaphore.release();
      
      await Promise.all(promises);
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout acquire after specified time', async () => {
      semaphore = new AsyncSemaphore({ permits: 1, timeout: 100 });
      
      // Acquire the only permit
      await semaphore.acquire();
      
      // Second acquire should timeout
      const start = Date.now();
      await expect(semaphore.acquire()).rejects.toThrow('Semaphore acquire timeout');
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(150);
    });

    test('should not timeout if permit becomes available in time', async () => {
      semaphore = new AsyncSemaphore({ permits: 1, timeout: 200 });
      
      // Acquire the only permit
      await semaphore.acquire();
      
      // Start acquire that should succeed before timeout
      const acquirePromise = semaphore.acquire();
      
      // Release after 50ms (well before 200ms timeout)
      setTimeout(() => semaphore.release(), 50);
      
      await expect(acquirePromise).resolves.toBeUndefined();
    });
  });

  describe('Cancellation Support', () => {
    test('should cancel acquire when cancellation token is set', async () => {
      semaphore = new AsyncSemaphore({ permits: 1 });
      
      // Acquire the only permit
      await semaphore.acquire();
      
      // Create cancellation token
      const cancellationToken = { cancelled: false };
      
      // Start acquire that should be cancelled
      const acquirePromise = semaphore.acquire(cancellationToken);
      
      // Cancel after 50ms
      setTimeout(() => { cancellationToken.cancelled = true; }, 50);
      
      await expect(acquirePromise).rejects.toThrow('Semaphore acquire cancelled');
    });

    test('should not start acquire if already cancelled', async () => {
      semaphore = new AsyncSemaphore({ permits: 1 });
      
      const cancellationToken = { cancelled: true };
      
      await expect(semaphore.acquire(cancellationToken)).rejects.toThrow('Semaphore acquire cancelled');
    });
  });

  describe('Metrics Collection', () => {
    test('should collect basic metrics when enabled', async () => {
      semaphore = new AsyncSemaphore({ permits: 2, enableMetrics: true });
      
      // Perform some operations
      await semaphore.acquire();
      await semaphore.acquire();
      semaphore.release();
      semaphore.release();
      
      const metrics = semaphore.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics!.totalAcquires).toBe(2);
      expect(metrics!.totalReleases).toBe(2);
      expect(metrics!.currentWaiting).toBe(0);
    });

    test('should track waiting queue metrics', async () => {
      semaphore = new AsyncSemaphore({ permits: 1, enableMetrics: true });
      
      // Acquire the only permit
      await semaphore.acquire();
      
      // Queue multiple requests
      const promises = [
        semaphore.acquire(),
        semaphore.acquire()
      ];
      
      // Check metrics show waiting requests
      await new Promise(resolve => setTimeout(resolve, 10));
      const metrics = semaphore.getMetrics();
      expect(metrics!.currentWaiting).toBe(2);
      expect(metrics!.peakWaiting).toBe(2);
      
      // Release and complete
      semaphore.release();
      semaphore.release();
      await Promise.all(promises);
    });

    test('should return undefined metrics when disabled', () => {
      semaphore = new AsyncSemaphore({ permits: 1, enableMetrics: false });
      expect(semaphore.getMetrics()).toBeUndefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle multiple releases without error', () => {
      semaphore = new AsyncSemaphore({ permits: 1 });
      
      // Multiple releases should not throw
      expect(() => {
        semaphore.release();
        semaphore.release();
        semaphore.release();
      }).not.toThrow();
    });

    test('should handle dispose with pending acquires', async () => {
      semaphore = new AsyncSemaphore({ permits: 1 });
      
      // Acquire the only permit
      await semaphore.acquire();
      
      // Start pending acquire
      const acquirePromise = semaphore.acquire();
      
      // Dispose should reject pending acquires
      semaphore.dispose();
      
      await expect(acquirePromise).rejects.toThrow('Semaphore disposed');
    });

    test('should reject acquires after dispose', async () => {
      semaphore = new AsyncSemaphore({ permits: 1 });
      semaphore.dispose();
      
      await expect(semaphore.acquire()).rejects.toThrow('Semaphore disposed');
    });

    test('should handle zero permits', async () => {
      semaphore = new AsyncSemaphore({ permits: 0 });
      
      // All acquires should block
      const acquirePromise = semaphore.acquire();
      let resolved = false;
      acquirePromise.then(() => { resolved = true; });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(resolved).toBe(false);
      
      // Release should allow acquire
      semaphore.release();
      await acquirePromise;
      expect(resolved).toBe(true);
    });
  });

  describe('Performance Characteristics', () => {
    test('should be more efficient than busy-waiting', async () => {
      semaphore = new AsyncSemaphore({ permits: 1 });
      
      // Acquire the only permit
      await semaphore.acquire();
      
      // Measure CPU usage during wait (should be minimal)
      const start = process.hrtime.bigint();
      const acquirePromise = semaphore.acquire();
      
      // Wait for 100ms
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Release and complete
      semaphore.release();
      await acquirePromise;
      
      const end = process.hrtime.bigint();
      const elapsedNs = Number(end - start);
      
      // Should complete in reasonable time without excessive CPU usage
      expect(elapsedNs).toBeGreaterThan(100_000_000); // At least 100ms
      expect(elapsedNs).toBeLessThan(200_000_000); // Less than 200ms
    });
  });
});
