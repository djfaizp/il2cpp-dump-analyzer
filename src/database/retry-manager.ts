/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Initial delay between retries in milliseconds */
  initialDelayMs?: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs?: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier?: number;
  /** Jitter factor to add randomness to delays (0-1) */
  jitterFactor?: number;
  /** Function to determine if an error should trigger a retry */
  shouldRetry?: (error: any, attempt: number) => boolean;
  /** Callback for retry attempts */
  onRetry?: (error: any, attempt: number, delay: number) => void;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  shouldRetry: (error: any, attempt: number) => {
    // Retry on network errors, timeouts, and specific database errors
    if (error?.code) {
      const retryableCodes = [
        'PGRST301', // Connection timeout
        'PGRST302', // Connection error
        '08000',    // Connection exception
        '08003',    // Connection does not exist
        '08006',    // Connection failure
        '53300',    // Too many connections
        '57P01',    // Admin shutdown
        '57P02',    // Crash shutdown
        '57P03',    // Cannot connect now
      ];
      return retryableCodes.includes(error.code);
    }

    // Retry on network-related errors
    if (error?.message) {
      const retryableMessages = [
        'network error',
        'timeout',
        'connection refused',
        'connection reset',
        'temporary failure',
        'service unavailable'
      ];
      const message = error.message.toLowerCase();
      return retryableMessages.some(msg => message.includes(msg));
    }

    return false;
  },
  onRetry: (error: any, attempt: number, delay: number) => {
    console.warn(`Retry attempt ${attempt} after ${delay}ms due to error:`, error?.message || error);
  }
};

/**
 * Enhanced retry manager with exponential backoff and jitter
 */
export class RetryManager {
  private config: Required<RetryConfig>;

  constructor(config: RetryConfig = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'database operation'
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        // Log successful retry if this wasn't the first attempt
        if (attempt > 1) {
          console.log(`${operationName} succeeded on attempt ${attempt}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;

        // Check if we should retry this error
        if (!this.config.shouldRetry(error, attempt)) {
          console.error(`${operationName} failed with non-retryable error:`, error);
          throw error;
        }

        // Don't retry if this was the last attempt
        if (attempt === this.config.maxAttempts) {
          console.error(`${operationName} failed after ${attempt} attempts:`, error);
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        
        // Call retry callback
        this.config.onRetry(error, attempt, delay);

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff: initialDelay * (backoffMultiplier ^ (attempt - 1))
    const exponentialDelay = this.config.initialDelayMs * 
      Math.pow(this.config.backoffMultiplier, attempt - 1);

    // Apply maximum delay limit
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterFactor * Math.random();
    
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry manager with database-specific configuration
   */
  static forDatabase(customConfig: Partial<RetryConfig> = {}): RetryManager {
    const databaseConfig: RetryConfig = {
      maxAttempts: 3,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
      jitterFactor: 0.2,
      shouldRetry: (error: any, attempt: number) => {
        // Database-specific retry logic
        if (error?.code) {
          const retryableCodes = [
            'PGRST301', // Connection timeout
            'PGRST302', // Connection error
            '23505',    // Unique violation (for upsert operations)
            '40001',    // Serialization failure
            '40P01',    // Deadlock detected
            '53300',    // Too many connections
            '57P03',    // Cannot connect now
          ];
          return retryableCodes.includes(error.code);
        }

        // Retry on specific error messages
        if (error?.message) {
          const message = error.message.toLowerCase();
          const retryablePatterns = [
            'connection',
            'timeout',
            'network',
            'temporary',
            'unavailable',
            'overloaded'
          ];
          return retryablePatterns.some(pattern => message.includes(pattern));
        }

        return false;
      },
      onRetry: (error: any, attempt: number, delay: number) => {
        console.warn(`Database operation retry ${attempt}/${customConfig.maxAttempts || 3} ` +
          `after ${delay}ms. Error: ${error?.message || error}`);
      },
      ...customConfig
    };

    return new RetryManager(databaseConfig);
  }

  /**
   * Create a retry manager for vector operations
   */
  static forVectorOperations(customConfig: Partial<RetryConfig> = {}): RetryManager {
    const vectorConfig: RetryConfig = {
      maxAttempts: 5,
      initialDelayMs: 1000,
      maxDelayMs: 8000,
      backoffMultiplier: 1.5,
      jitterFactor: 0.3,
      shouldRetry: (error: any, attempt: number) => {
        // Vector-specific retry logic
        if (error?.message) {
          const message = error.message.toLowerCase();
          const retryablePatterns = [
            'embedding',
            'vector',
            'dimension',
            'similarity',
            'index',
            'timeout',
            'connection'
          ];
          return retryablePatterns.some(pattern => message.includes(pattern));
        }
        return false;
      },
      onRetry: (error: any, attempt: number, delay: number) => {
        console.warn(`Vector operation retry ${attempt}/${customConfig.maxAttempts || 5} ` +
          `after ${delay}ms. Error: ${error?.message || error}`);
      },
      ...customConfig
    };

    return new RetryManager(vectorConfig);
  }
}

/**
 * Utility function to wrap any async function with retry logic
 */
export function withRetry<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  config?: RetryConfig
): (...args: T) => Promise<R> {
  const retryManager = new RetryManager(config);
  
  return async (...args: T): Promise<R> => {
    return retryManager.execute(
      () => fn(...args),
      fn.name || 'anonymous function'
    );
  };
}

/**
 * Circuit breaker pattern for database operations
 */
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold: number = 5,
    private timeoutMs: number = 60000,
    private monitoringPeriodMs: number = 10000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  getState(): string {
    return this.state;
  }

  getStats(): { failures: number; state: string; lastFailureTime: number } {
    return {
      failures: this.failures,
      state: this.state,
      lastFailureTime: this.lastFailureTime
    };
  }
}
