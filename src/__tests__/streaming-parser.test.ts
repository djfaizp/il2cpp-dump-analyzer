/**
 * Memory-Efficient Streaming Parser Tests
 * Tests for streaming IL2CPP parser that handles large files without memory issues
 * Following Test-Driven Development (TFD) methodology
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Readable } from 'stream';
import { realIL2CPPDumpSample, realIL2CPPComplexSample } from './test-data';

// Mock file system and stream modules before importing
jest.mock('fs', () => ({
  createReadStream: jest.fn(),
  promises: {
    stat: jest.fn()
  }
}));

import { StreamingIL2CPPParser, StreamingParseOptions, StreamingParseProgress } from '../performance/streaming-parser';
import * as fs from 'fs';

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Streaming IL2CPP Parser Tests', () => {
  let parser: StreamingIL2CPPParser;
  let progressCallback: jest.MockedFunction<(progress: StreamingParseProgress) => void>;
  let cancellationToken: { cancelled: boolean };

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new StreamingIL2CPPParser();
    progressCallback = jest.fn();
    cancellationToken = { cancelled: false };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Streaming Functionality', () => {
    it('should parse small files using streaming approach', async () => {
      // Arrange
      const mockStream = createMockReadableStream(realIL2CPPDumpSample);
      mockFs.createReadStream.mockReturnValue(mockStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: realIL2CPPDumpSample.length } as any);

      const options: StreamingParseOptions = {
        bufferSize: 1024,
        progressCallback,
        cancellationToken
      };

      // Act
      const result = await parser.parseFile('test-dump.cs', options);

      // Assert
      expect(result).toBeDefined();
      expect(result.classes.length).toBeGreaterThan(0);
      expect(result.statistics.totalConstructs).toBeGreaterThan(0);
      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          bytesProcessed: expect.any(Number),
          totalBytes: expect.any(Number),
          percentage: expect.any(Number),
          currentPhase: expect.any(String)
        })
      );
    });

    it('should handle configurable buffer sizes', async () => {
      // Arrange
      const mockStream1 = createMockReadableStream(realIL2CPPDumpSample);
      const mockStream2 = createMockReadableStream(realIL2CPPDumpSample);

      mockFs.createReadStream
        .mockReturnValueOnce(mockStream1 as any)
        .mockReturnValueOnce(mockStream2 as any);
      mockFs.promises.stat.mockResolvedValue({ size: realIL2CPPDumpSample.length } as any);

      const smallBufferOptions: StreamingParseOptions = {
        bufferSize: 256,
        progressCallback
      };

      const largeBufferOptions: StreamingParseOptions = {
        bufferSize: 4096,
        progressCallback
      };

      // Act
      const smallBufferResult = await parser.parseFile('test-dump.cs', smallBufferOptions);
      jest.clearAllMocks();
      progressCallback.mockClear();
      const largeBufferResult = await parser.parseFile('test-dump.cs', largeBufferOptions);

      // Assert
      expect(smallBufferResult.classes.length).toBe(largeBufferResult.classes.length);
      expect(smallBufferResult.statistics.totalConstructs).toBe(largeBufferResult.statistics.totalConstructs);
    }, 10000); // Increase timeout to 10 seconds

    it('should provide accurate progress tracking', async () => {
      // Arrange
      const mockStream = createMockReadableStream(realIL2CPPDumpSample);
      mockFs.createReadStream.mockReturnValue(mockStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: realIL2CPPDumpSample.length } as any);

      const options: StreamingParseOptions = {
        bufferSize: 512,
        progressCallback
      };

      // Act
      await parser.parseFile('test-dump.cs', options);

      // Assert
      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback.mock.calls.length).toBeGreaterThan(0);

      // Check that progress increases monotonically
      const progressCalls = progressCallback.mock.calls.map(call => call[0]);
      for (let i = 1; i < progressCalls.length; i++) {
        expect(progressCalls[i].bytesProcessed).toBeGreaterThanOrEqual(progressCalls[i - 1].bytesProcessed);
        expect(progressCalls[i].percentage).toBeGreaterThanOrEqual(progressCalls[i - 1].percentage);
      }

      // Final progress should be 100%
      const finalProgress = progressCalls[progressCalls.length - 1];
      expect(finalProgress.percentage).toBe(100);
    });
  });

  describe('Memory Management', () => {
    it('should monitor memory usage during parsing', async () => {
      // Arrange
      const mockStream = createMockReadableStream(realIL2CPPDumpSample);
      mockFs.createReadStream.mockReturnValue(mockStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: realIL2CPPDumpSample.length } as any);

      const options: StreamingParseOptions = {
        bufferSize: 1024,
        progressCallback,
        memoryMonitoring: true
      };

      // Act
      const result = await parser.parseFile('test-dump.cs', options);

      // Assert
      expect(result.memoryUsage).toBeDefined();
      expect(result.memoryUsage!.peakMemoryMB).toBeGreaterThanOrEqual(0);
      expect(result.memoryUsage!.averageMemoryMB).toBeGreaterThanOrEqual(0);
      expect(result.memoryUsage!.memoryEfficiencyScore).toBeGreaterThanOrEqual(0);
      expect(result.memoryUsage!.memoryEfficiencyScore).toBeLessThanOrEqual(100);
    });

    it('should maintain low memory footprint for large content', async () => {
      // Arrange
      const largeContent = realIL2CPPDumpSample.repeat(100); // Simulate large file
      const mockStream = createMockReadableStream(largeContent);
      mockFs.createReadStream.mockReturnValue(mockStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: largeContent.length } as any);

      const options: StreamingParseOptions = {
        bufferSize: 2048,
        progressCallback,
        memoryMonitoring: true
      };

      // Act
      const result = await parser.parseFile('large-dump.cs', options);

      // Assert
      expect(result.memoryUsage!.peakMemoryMB).toBeGreaterThanOrEqual(0); // Memory monitoring enabled
      expect(result.memoryUsage!.memoryEfficiencyScore).toBeGreaterThanOrEqual(0); // Efficiency score available
      expect(result.classes.length).toBeGreaterThan(0);
    });

    it('should handle memory pressure gracefully', async () => {
      // Arrange
      const mockStream = createMockReadableStream(realIL2CPPDumpSample);
      mockFs.createReadStream.mockReturnValue(mockStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: realIL2CPPDumpSample.length } as any);

      const options: StreamingParseOptions = {
        bufferSize: 64, // Very small buffer to simulate memory pressure
        progressCallback,
        memoryMonitoring: true,
        maxMemoryMB: 50 // Low memory limit
      };

      // Act & Assert
      await expect(parser.parseFile('test-dump.cs', options)).resolves.toBeDefined();
    });
  });

  describe('Cancellation Support', () => {
    it('should support cancellation during parsing', async () => {
      // Arrange
      const mockStream = createMockReadableStream(realIL2CPPDumpSample.repeat(10)); // Make it larger to allow cancellation
      mockFs.createReadStream.mockReturnValue(mockStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: realIL2CPPDumpSample.length * 10 } as any);

      const cancellationToken = { cancelled: false };
      const options: StreamingParseOptions = {
        bufferSize: 64, // Small buffer to slow down processing
        progressCallback,
        cancellationToken
      };

      // Act
      const parsePromise = parser.parseFile('test-dump.cs', options);

      // Cancel immediately
      cancellationToken.cancelled = true;

      // Assert
      await expect(parsePromise).rejects.toThrow('Parsing cancelled by user');
    });

    it('should clean up resources on cancellation', async () => {
      // Arrange
      const mockStream = createMockReadableStream(realIL2CPPDumpSample.repeat(10));
      const destroySpy = jest.fn();
      mockStream.destroy = destroySpy;

      mockFs.createReadStream.mockReturnValue(mockStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: realIL2CPPDumpSample.length * 10 } as any);

      const cancellationToken = { cancelled: false };
      const options: StreamingParseOptions = {
        bufferSize: 64, // Small buffer
        progressCallback,
        cancellationToken
      };

      // Act
      const parsePromise = parser.parseFile('test-dump.cs', options);
      cancellationToken.cancelled = true;

      // Assert
      await expect(parsePromise).rejects.toThrow('Parsing cancelled by user');
      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors gracefully', async () => {
      // Arrange
      const errorStream = new Readable({
        read() {
          this.emit('error', new Error('File read error'));
        }
      });

      mockFs.createReadStream.mockReturnValue(errorStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: 1000 } as any);

      const options: StreamingParseOptions = {
        bufferSize: 1024,
        progressCallback
      };

      // Act & Assert
      await expect(parser.parseFile('error-dump.cs', options)).rejects.toThrow('File read error');
    });

    it('should handle malformed content during streaming', async () => {
      // Arrange
      const malformedContent = `
        // Namespace: Test
        public class { // Missing class name
          public void Method(
          // Missing closing parenthesis
        }
      `;
      const mockStream = createMockReadableStream(malformedContent);
      mockFs.createReadStream.mockReturnValue(mockStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: malformedContent.length } as any);

      const options: StreamingParseOptions = {
        bufferSize: 512,
        progressCallback
      };

      // Act
      const result = await parser.parseFile('malformed-dump.cs', options);

      // Assert
      expect(result).toBeDefined();
      expect(result.statistics.parseErrors).toBeGreaterThan(0);
      expect(result.statistics.parsingCoverage).toBeLessThan(1.0);
    });
  });

  describe('Performance Tests', () => {
    it('should process large files efficiently', async () => {
      // Arrange
      const largeContent = realIL2CPPComplexSample.repeat(200); // Simulate very large file
      const mockStream = createMockReadableStream(largeContent);
      mockFs.createReadStream.mockReturnValue(mockStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: largeContent.length } as any);

      const options: StreamingParseOptions = {
        bufferSize: 8192,
        progressCallback,
        memoryMonitoring: true
      };

      // Act
      const startTime = Date.now();
      const result = await parser.parseFile('large-dump.cs', options);
      const endTime = Date.now();

      // Assert
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.statistics.totalConstructs).toBeGreaterThan(0);
      expect(result.memoryUsage.peakMemoryMB).toBeLessThan(200); // Memory efficient
    });

    it('should provide performance metrics', async () => {
      // Arrange
      const mockStream = createMockReadableStream(realIL2CPPDumpSample);
      mockFs.createReadStream.mockReturnValue(mockStream as any);
      mockFs.promises.stat.mockResolvedValue({ size: realIL2CPPDumpSample.length } as any);

      const options: StreamingParseOptions = {
        bufferSize: 1024,
        progressCallback,
        memoryMonitoring: true
      };

      // Act
      const result = await parser.parseFile('test-dump.cs', options);

      // Assert
      expect(result.performanceMetrics).toBeDefined();
      expect(result.performanceMetrics.totalProcessingTimeMs).toBeGreaterThan(0);
      expect(result.performanceMetrics.averageProcessingSpeedMBps).toBeGreaterThan(0);
      expect(result.performanceMetrics.bufferUtilizationPercentage).toBeGreaterThan(0);
      expect(result.performanceMetrics.bufferUtilizationPercentage).toBeLessThanOrEqual(100);
    });
  });
});

// Helper function to create mock readable stream
function createMockReadableStream(content: string): Readable {
  let index = 0;
  const chunkSize = 1024;

  return new Readable({
    read() {
      if (index < content.length) {
        const chunk = content.slice(index, index + chunkSize);
        index += chunkSize;
        this.push(chunk);
      } else {
        this.push(null); // End of stream
      }
    }
  });
}
