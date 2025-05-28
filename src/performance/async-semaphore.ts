/**
 * AsyncSemaphore - Async concurrency control without busy-waiting
 * Provides efficient semaphore implementation for controlling concurrent operations
 */

/**
 * Cancellation token interface for async operations
 */
export interface CancellationToken {
  /** Set to true to cancel the operation */
  cancelled: boolean;
}

/**
 * Configuration options for AsyncSemaphore
 */
export interface AsyncSemaphoreOptions {
  /** Initial number of permits available */
  permits: number;
  /** Optional timeout in milliseconds for acquire operations */
  timeout?: number;
  /** Enable metrics collection (default: false) */
  enableMetrics?: boolean;
}

/**
 * Metrics for semaphore usage tracking
 */
export interface SemaphoreMetrics {
  /** Total number of acquire operations */
  totalAcquires: number;
  /** Total number of release operations */
  totalReleases: number;
  /** Current number of waiting acquire requests */
  currentWaiting: number;
  /** Peak number of waiting acquire requests */
  peakWaiting: number;
  /** Average wait time in milliseconds */
  averageWaitTimeMs: number;
  /** Number of timeout occurrences */
  timeouts: number;
  /** Number of cancellation occurrences */
  cancellations: number;
}

/**
 * Internal waiting request structure
 */
interface WaitingRequest {
  /** Promise resolve function */
  resolve: (value: void) => void;
  /** Promise reject function */
  reject: (error: Error) => void;
  /** Timeout handle for cleanup */
  timeoutId?: NodeJS.Timeout;
  /** Start time for metrics */
  startTime: number;
  /** Cancellation token reference */
  cancellationToken?: CancellationToken;
}

/**
 * AsyncSemaphore provides efficient concurrency control without busy-waiting
 *
 * Unlike busy-wait loops that poll repeatedly, this semaphore uses a queue-based
 * approach that only resolves waiting requests when permits become available.
 * This eliminates CPU waste and provides better performance characteristics.
 */
export class AsyncSemaphore {
  private permits: number;
  private readonly waitingQueue: WaitingRequest[] = [];
  private readonly options: Required<AsyncSemaphoreOptions>;
  private metrics?: SemaphoreMetrics;
  private disposed = false;

  /**
   * Create a new AsyncSemaphore
   * @param options Configuration options
   */
  constructor(options: AsyncSemaphoreOptions) {
    this.permits = options.permits;
    this.options = {
      permits: options.permits,
      timeout: options.timeout ?? 0,
      enableMetrics: options.enableMetrics ?? false
    };

    if (this.options.enableMetrics) {
      this.metrics = {
        totalAcquires: 0,
        totalReleases: 0,
        currentWaiting: 0,
        peakWaiting: 0,
        averageWaitTimeMs: 0,
        timeouts: 0,
        cancellations: 0
      };
    }
  }

  /**
   * Acquire a permit from the semaphore
   *
   * If permits are available, returns immediately.
   * Otherwise, queues the request and returns a Promise that resolves
   * when a permit becomes available.
   *
   * @param cancellationToken Optional cancellation token
   * @returns Promise that resolves when permit is acquired
   * @throws Error if timeout occurs, cancelled, or semaphore is disposed
   */
  public async acquire(cancellationToken?: CancellationToken): Promise<void> {
    if (this.disposed) {
      throw new Error('Semaphore disposed');
    }

    // Check for immediate cancellation
    if (cancellationToken?.cancelled) {
      if (this.metrics) {
        this.metrics.cancellations++;
      }
      throw new Error('Semaphore acquire cancelled');
    }

    // If permits available, acquire immediately
    if (this.permits > 0) {
      this.permits--;
      if (this.metrics) {
        this.metrics.totalAcquires++;
      }
      return;
    }

    // No permits available, queue the request
    return new Promise<void>((resolve, reject) => {
      const startTime = Date.now();
      const request: WaitingRequest = {
        resolve,
        reject,
        startTime,
        cancellationToken
      };

      // Set up timeout if specified
      if (this.options.timeout > 0) {
        request.timeoutId = setTimeout(() => {
          this.removeFromQueue(request);
          if (this.metrics) {
            this.metrics.timeouts++;
          }
          reject(new Error('Semaphore acquire timeout'));
        }, this.options.timeout);
      }

      // Add to waiting queue
      this.waitingQueue.push(request);

      // Update metrics
      if (this.metrics) {
        this.metrics.currentWaiting = this.waitingQueue.length;
        this.metrics.peakWaiting = Math.max(this.metrics.peakWaiting, this.waitingQueue.length);
      }

      // Set up cancellation monitoring if token provided
      if (cancellationToken) {
        // Use a more efficient approach - check periodically but less frequently
        const checkCancellation = () => {
          if (cancellationToken.cancelled) {
            this.removeFromQueue(request);
            if (this.metrics) {
              this.metrics.cancellations++;
            }
            reject(new Error('Semaphore acquire cancelled'));
          } else if (!this.disposed && this.waitingQueue.includes(request)) {
            // Only continue checking if request is still in queue
            setTimeout(checkCancellation, 50); // Check every 50ms instead of 10ms
          }
        };
        setTimeout(checkCancellation, 50);
      }
    });
  }

  /**
   * Release a permit back to the semaphore
   *
   * If there are waiting requests, immediately resolves the first one.
   * Otherwise, increments the permit count.
   */
  public release(): void {
    if (this.disposed) {
      return;
    }

    if (this.metrics) {
      this.metrics.totalReleases++;
    }

    // If there are waiting requests, resolve the first one
    if (this.waitingQueue.length > 0) {
      const request = this.waitingQueue.shift()!;

      // Clear timeout if set
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }

      // Update metrics
      if (this.metrics) {
        this.metrics.currentWaiting = this.waitingQueue.length;
        this.metrics.totalAcquires++;

        // Update average wait time
        const waitTime = Date.now() - request.startTime;
        const totalWaitTime = this.metrics.averageWaitTimeMs * (this.metrics.totalAcquires - 1) + waitTime;
        this.metrics.averageWaitTimeMs = totalWaitTime / this.metrics.totalAcquires;
      }

      // Resolve the waiting request
      request.resolve();
    } else {
      // No waiting requests, increment permit count
      this.permits++;
    }
  }

  /**
   * Get current semaphore metrics
   * @returns Metrics object if enabled, undefined otherwise
   */
  public getMetrics(): SemaphoreMetrics | undefined {
    return this.metrics ? { ...this.metrics } : undefined;
  }

  /**
   * Dispose the semaphore and reject all pending requests
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Reject all pending requests
    while (this.waitingQueue.length > 0) {
      const request = this.waitingQueue.shift()!;

      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }

      request.reject(new Error('Semaphore disposed'));
    }

    // Reset state
    this.permits = 0;
    if (this.metrics) {
      this.metrics.currentWaiting = 0;
    }
  }

  /**
   * Remove a specific request from the waiting queue
   * @param targetRequest Request to remove
   */
  private removeFromQueue(targetRequest: WaitingRequest): void {
    const index = this.waitingQueue.indexOf(targetRequest);
    if (index !== -1) {
      this.waitingQueue.splice(index, 1);

      if (targetRequest.timeoutId) {
        clearTimeout(targetRequest.timeoutId);
      }

      if (this.metrics) {
        this.metrics.currentWaiting = this.waitingQueue.length;
      }
    }
  }

  /**
   * Get current number of available permits
   */
  public getAvailablePermits(): number {
    return this.permits;
  }

  /**
   * Get current number of waiting requests
   */
  public getWaitingCount(): number {
    return this.waitingQueue.length;
  }
}
