/**
 * Parser Pool Tests
 * Tests for object pooling of EnhancedIL2CPPParser instances
 * Following Test-Driven Development (TFD) methodology
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ParserPool } from '../performance/parser-pool';
import { EnhancedIL2CPPParser } from '../parser/enhanced-il2cpp-parser';
import { realIL2CPPDumpSample } from './test-data';

describe('Parser Pool Tests', () => {
  let parserPool: ParserPool;

  beforeEach(() => {
    jest.clearAllMocks();
    parserPool = new ParserPool();
  });

  afterEach(() => {
    jest.clearAllMocks();
    parserPool.dispose();
  });

  describe('Basic Pool Functionality', () => {
    it('should create parser pool with default configuration', () => {
      // Arrange & Act
      const pool = new ParserPool();

      // Assert
      expect(pool).toBeDefined();
      expect(pool.getPoolSize()).toBe(0);
      expect(pool.getMaxPoolSize()).toBe(10); // Default max size
      expect(pool.getActiveCount()).toBe(0);
    });

    it('should create parser pool with custom configuration', () => {
      // Arrange & Act
      const pool = new ParserPool({
        maxPoolSize: 5,
        initialPoolSize: 2,
        enableMetrics: true
      });

      // Assert
      expect(pool.getMaxPoolSize()).toBe(5);
      expect(pool.getPoolSize()).toBe(2); // Initial parsers created
      expect(pool.getActiveCount()).toBe(0);
    });

    it('should acquire parser from pool', async () => {
      // Arrange
      const pool = new ParserPool({ initialPoolSize: 2 });

      // Act
      const parser = await pool.acquire();

      // Assert
      expect(parser).toBeInstanceOf(EnhancedIL2CPPParser);
      expect(pool.getActiveCount()).toBe(1);
      expect(pool.getPoolSize()).toBe(1); // One less in pool
    });

    it('should release parser back to pool', async () => {
      // Arrange
      const pool = new ParserPool({ initialPoolSize: 2 });
      const parser = await pool.acquire();

      // Act
      await pool.release(parser);

      // Assert
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getPoolSize()).toBe(2); // Back to original size
    });

    it('should reuse released parsers', async () => {
      // Arrange
      const pool = new ParserPool({ initialPoolSize: 1 });
      const parser1 = await pool.acquire();
      await pool.release(parser1);

      // Act
      const parser2 = await pool.acquire();

      // Assert
      expect(parser2).toBe(parser1); // Same instance reused
      expect(pool.getActiveCount()).toBe(1);
      expect(pool.getPoolSize()).toBe(0);
    });
  });

  describe('Pool Size Management', () => {
    it('should create new parser when pool is empty', async () => {
      // Arrange
      const pool = new ParserPool({ initialPoolSize: 0, maxPoolSize: 5 });

      // Act
      const parser = await pool.acquire();

      // Assert
      expect(parser).toBeInstanceOf(EnhancedIL2CPPParser);
      expect(pool.getActiveCount()).toBe(1);
      expect(pool.getPoolSize()).toBe(0);
    });

    it('should respect maximum pool size', async () => {
      // Arrange
      const pool = new ParserPool({ maxPoolSize: 2 });
      const parser1 = await pool.acquire();
      const parser2 = await pool.acquire();

      // Act
      const parser3 = await pool.acquire();

      // Assert
      expect(pool.getActiveCount()).toBe(3);
      expect(pool.getMaxPoolSize()).toBe(2);
      // Third parser should be created even though pool is at max
      expect(parser3).toBeInstanceOf(EnhancedIL2CPPParser);
    });

    it('should not exceed max pool size when releasing parsers', async () => {
      // Arrange
      const pool = new ParserPool({ maxPoolSize: 2 });
      const parsers = [
        await pool.acquire(),
        await pool.acquire(),
        await pool.acquire()
      ];

      // Act - Release all parsers
      for (const parser of parsers) {
        await pool.release(parser);
      }

      // Assert
      expect(pool.getPoolSize()).toBeLessThanOrEqual(2);
      expect(pool.getActiveCount()).toBe(0);
    });
  });

  describe('Parser Reset Functionality', () => {
    it('should reset parser state when released', async () => {
      // Arrange
      const pool = new ParserPool();
      const parser = await pool.acquire();

      // Load content into parser
      parser.loadContent(realIL2CPPDumpSample);
      expect(parser.isLoaded()).toBe(true);

      // Act
      await pool.release(parser);

      // Assert - Parser should be reset
      expect(parser.isLoaded()).toBe(false);
    });

    it('should handle parser reset errors gracefully', async () => {
      // Arrange
      const pool = new ParserPool();
      const parser = await pool.acquire();

      // Mock reset to throw error
      const originalReset = parser.reset;
      parser.reset = jest.fn().mockImplementation(() => {
        throw new Error('Reset failed');
      });

      // Act & Assert - Should not throw
      await expect(pool.release(parser)).resolves.not.toThrow();

      // Restore original method
      parser.reset = originalReset;
    });
  });

  describe('Concurrency and Thread Safety', () => {
    it('should handle concurrent acquire operations', async () => {
      // Arrange
      const pool = new ParserPool({ maxPoolSize: 3 });
      const acquirePromises: Promise<EnhancedIL2CPPParser>[] = [];

      // Act - Acquire multiple parsers concurrently
      for (let i = 0; i < 5; i++) {
        acquirePromises.push(pool.acquire());
      }

      const parsers = await Promise.all(acquirePromises);

      // Assert
      expect(parsers).toHaveLength(5);
      expect(pool.getActiveCount()).toBe(5);
      parsers.forEach(parser => {
        expect(parser).toBeInstanceOf(EnhancedIL2CPPParser);
      });

      // All parsers should be unique instances
      const uniqueParsers = new Set(parsers);
      expect(uniqueParsers.size).toBe(5);
    });

    it('should handle concurrent release operations', async () => {
      // Arrange
      const pool = new ParserPool({ maxPoolSize: 3 });
      const parsers = await Promise.all([
        pool.acquire(),
        pool.acquire(),
        pool.acquire()
      ]);

      // Act - Release all parsers concurrently
      const releasePromises = parsers.map(parser => pool.release(parser));
      await Promise.all(releasePromises);

      // Assert
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getPoolSize()).toBeLessThanOrEqual(3);
    });
  });

  describe('Performance Metrics', () => {
    it('should collect performance metrics when enabled', async () => {
      // Arrange
      const pool = new ParserPool({ enableMetrics: true });

      // Act
      const parser = await pool.acquire();
      await pool.release(parser);
      const metrics = pool.getMetrics();

      // Assert
      expect(metrics).toBeDefined();
      expect(metrics.totalAcquires).toBe(1);
      expect(metrics.totalReleases).toBe(1);
      expect(metrics.currentActive).toBe(0);
      expect(metrics.currentPoolSize).toBe(1);
      expect(metrics.peakActive).toBe(1);
    });

    it('should track peak active count', async () => {
      // Arrange
      const pool = new ParserPool({ enableMetrics: true });

      // Act
      const parser1 = await pool.acquire();
      const parser2 = await pool.acquire();
      const parser3 = await pool.acquire();

      await pool.release(parser1);
      await pool.release(parser2);
      await pool.release(parser3);

      const metrics = pool.getMetrics();

      // Assert
      expect(metrics.peakActive).toBe(3);
      expect(metrics.currentActive).toBe(0);
    });

    it('should not collect metrics when disabled', async () => {
      // Arrange
      const pool = new ParserPool({ enableMetrics: false });

      // Act
      const parser = await pool.acquire();
      await pool.release(parser);
      const metrics = pool.getMetrics();

      // Assert
      expect(metrics.totalAcquires).toBe(0);
      expect(metrics.totalReleases).toBe(0);
    });
  });

  describe('Resource Management', () => {
    it('should dispose all parsers when pool is disposed', async () => {
      // Arrange
      const pool = new ParserPool({ initialPoolSize: 3 });
      const parser = await pool.acquire();

      // Act
      pool.dispose();

      // Assert
      expect(pool.getPoolSize()).toBe(0);
      expect(pool.getActiveCount()).toBe(0);
    });

    it('should handle disposal gracefully with active parsers', async () => {
      // Arrange
      const pool = new ParserPool({ initialPoolSize: 2 });
      const parser1 = await pool.acquire();
      const parser2 = await pool.acquire();

      // Act & Assert - Should not throw
      expect(() => pool.dispose()).not.toThrow();
      expect(pool.getPoolSize()).toBe(0);
      expect(pool.getActiveCount()).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle parser creation errors', async () => {
      // Arrange
      const pool = new ParserPool();

      // Mock the createParser method to throw an error
      const originalCreateParser = (pool as any).createParser;
      (pool as any).createParser = jest.fn().mockImplementation(() => {
        throw new Error('Parser creation failed');
      });

      // Act & Assert
      await expect(pool.acquire()).rejects.toThrow('Failed to acquire parser: Parser creation failed');

      // Restore
      (pool as any).createParser = originalCreateParser;
    });

    it('should handle invalid parser release', async () => {
      // Arrange
      const pool = new ParserPool();
      const invalidParser = {} as EnhancedIL2CPPParser;

      // Act & Assert - Should not throw
      await expect(pool.release(invalidParser)).resolves.not.toThrow();
    });
  });
});
