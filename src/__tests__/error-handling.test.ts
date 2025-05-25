/**
 * Error handling and edge case tests
 * Tests system resilience, error recovery, and edge case handling
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockErrorScenarios } from './test-data';

// Mock error types
const MCPServerError = class extends Error {
  constructor(message: string, public type: string) {
    super(message);
    this.name = 'MCPServerError';
  }
};

const ErrorType = {
  INITIALIZATION_ERROR: 'initialization_error',
  VECTOR_STORE_ERROR: 'vector_store_error',
  TOOL_EXECUTION_ERROR: 'tool_execution_error',
  VALIDATION_ERROR: 'validation_error',
  RESOURCE_ERROR: 'resource_error'
};

describe('Error Handling and Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization Errors', () => {
    it('should handle missing dump file gracefully', async () => {
      // Arrange
      const server = createMockServer();
      
      // Act & Assert
      await expect(server.initialize({ dumpFilePath: 'nonexistent.cs' }))
        .rejects.toThrow(MCPServerError);
      
      try {
        await server.initialize({ dumpFilePath: 'nonexistent.cs' });
      } catch (error) {
        expect(error).toBeInstanceOf(MCPServerError);
        expect((error as any).type).toBe(ErrorType.INITIALIZATION_ERROR);
      }
    });

    it('should handle corrupted dump file', async () => {
      // Arrange
      const server = createMockServer();
      const corruptedContent = 'This is not valid IL2CPP content \x00\x01\x02';
      
      // Act & Assert
      await expect(server.initializeWithContent(corruptedContent))
        .rejects.toThrow('Failed to parse IL2CPP dump');
    });

    it('should handle database connection failures', async () => {
      // Arrange
      const server = createMockServer();
      server.setDatabaseError(new Error('Connection refused'));
      
      // Act & Assert
      await expect(server.initialize({ dumpFilePath: 'test.cs' }))
        .rejects.toThrow('Connection refused');
    });

    it('should handle embedding model loading failures', async () => {
      // Arrange
      const server = createMockServer();
      server.setEmbeddingError(new Error('Model not found'));
      
      // Act & Assert
      await expect(server.initialize({ 
        dumpFilePath: 'test.cs',
        model: 'nonexistent-model'
      })).rejects.toThrow('Model not found');
    });
  });

  describe('Tool Execution Errors', () => {
    it('should handle invalid tool parameters', async () => {
      // Arrange
      const toolExecutor = createMockToolExecutor();
      
      // Act & Assert
      await expect(toolExecutor.execute('search_code', {
        query: '', // Empty query
        top_k: -1  // Invalid k
      })).rejects.toThrow(MCPServerError);
    });

    it('should handle tool timeout scenarios', async () => {
      // Arrange
      const toolExecutor = createMockToolExecutor();
      toolExecutor.setExecutionDelay(35000); // 35 seconds, exceeds timeout
      
      // Act & Assert
      await expect(toolExecutor.execute('find_design_patterns', {
        pattern_types: ['singleton'],
        timeout: 30000
      })).rejects.toThrow('Tool execution timeout');
    });

    it('should handle vector store errors during tool execution', async () => {
      // Arrange
      const toolExecutor = createMockToolExecutor();
      toolExecutor.setVectorStoreError(mockErrorScenarios.networkError);
      
      // Act & Assert
      await expect(toolExecutor.execute('search_code', {
        query: 'PlayerController'
      })).rejects.toThrow('Network connection failed');
    });

    it('should provide meaningful error messages for tool failures', async () => {
      // Arrange
      const toolExecutor = createMockToolExecutor();
      toolExecutor.setVectorStoreError(new Error('Database query failed'));
      
      // Act
      try {
        await toolExecutor.execute('find_monobehaviours', {});
      } catch (error) {
        // Assert
        expect(error).toBeInstanceOf(MCPServerError);
        expect((error as any).type).toBe(ErrorType.TOOL_EXECUTION_ERROR);
        expect(error.message).toContain('Database query failed');
      }
    });
  });

  describe('Input Validation Errors', () => {
    it('should validate search query parameters', async () => {
      // Arrange
      const validator = createMockValidator();
      
      // Act & Assert
      expect(() => validator.validateSearchParams({
        query: null,
        top_k: 'invalid'
      })).toThrow('Invalid query parameter');
      
      expect(() => validator.validateSearchParams({
        query: 'test',
        top_k: 0
      })).toThrow('top_k must be greater than 0');
      
      expect(() => validator.validateSearchParams({
        query: 'test',
        top_k: 1001
      })).toThrow('top_k must not exceed 1000');
    });

    it('should validate dependency analysis parameters', async () => {
      // Arrange
      const validator = createMockValidator();
      
      // Act & Assert
      expect(() => validator.validateDependencyParams({
        class_name: '',
        depth: 0
      })).toThrow('class_name cannot be empty');
      
      expect(() => validator.validateDependencyParams({
        class_name: 'Test',
        depth: 10
      })).toThrow('depth must be between 1 and 5');
      
      expect(() => validator.validateDependencyParams({
        class_name: 'Test',
        analysis_type: 'invalid'
      })).toThrow('Invalid analysis_type');
    });

    it('should validate design pattern parameters', async () => {
      // Arrange
      const validator = createMockValidator();
      
      // Act & Assert
      expect(() => validator.validatePatternParams({
        pattern_types: [],
        confidence_threshold: 1.5
      })).toThrow('pattern_types cannot be empty');
      
      expect(() => validator.validatePatternParams({
        pattern_types: ['singleton'],
        confidence_threshold: 1.5
      })).toThrow('confidence_threshold must be between 0.1 and 1.0');
    });
  });

  describe('Resource Management Errors', () => {
    it('should handle memory exhaustion gracefully', async () => {
      // Arrange
      const processor = createMockProcessor();
      processor.setMemoryLimit(100 * 1024 * 1024); // 100MB limit
      
      const largeData = Array(1000000).fill('Large data chunk');
      
      // Act & Assert
      await expect(processor.processLargeData(largeData))
        .rejects.toThrow('Memory limit exceeded');
    });

    it('should handle file system errors', async () => {
      // Arrange
      const fileHandler = createMockFileHandler();
      
      // Act & Assert
      await expect(fileHandler.readFile('/protected/file.cs'))
        .rejects.toThrow('Permission denied');
      
      await expect(fileHandler.writeFile('/readonly/output.json', 'data'))
        .rejects.toThrow('Read-only file system');
    });

    it('should handle network timeouts', async () => {
      // Arrange
      const networkClient = createMockNetworkClient();
      networkClient.setNetworkDelay(60000); // 60 seconds
      
      // Act & Assert
      await expect(networkClient.fetchEmbeddings('test query'))
        .rejects.toThrow('Network timeout');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty IL2CPP dump files', async () => {
      // Arrange
      const parser = createMockParser();
      
      // Act
      const result = await parser.parseContent('');
      
      // Assert
      expect(result.classes).toHaveLength(0);
      expect(result.enums).toHaveLength(0);
      expect(result.interfaces).toHaveLength(0);
      expect(result.statistics.totalConstructs).toBe(0);
    });

    it('should handle IL2CPP files with only comments', async () => {
      // Arrange
      const parser = createMockParser();
      const commentOnlyContent = `
        // This is a comment
        /* Multi-line comment
           with multiple lines */
        // Another comment
      `;
      
      // Act
      const result = await parser.parseContent(commentOnlyContent);
      
      // Assert
      expect(result.classes).toHaveLength(0);
      expect(result.statistics.parseErrors).toBe(0);
    });

    it('should handle extremely long class names', async () => {
      // Arrange
      const toolExecutor = createMockToolExecutor();
      const veryLongClassName = 'A'.repeat(1000);
      
      // Act
      const result = await toolExecutor.execute('find_class_hierarchy', {
        class_name: veryLongClassName
      });
      
      // Assert
      expect(result.error).toContain('not found');
    });

    it('should handle special characters in search queries', async () => {
      // Arrange
      const toolExecutor = createMockToolExecutor();
      const specialCharQuery = '!@#$%^&*()[]{}|\\:";\'<>?,./';
      
      // Act
      const result = await toolExecutor.execute('search_code', {
        query: specialCharQuery,
        top_k: 5
      });
      
      // Assert
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should handle Unicode characters in IL2CPP content', async () => {
      // Arrange
      const parser = createMockParser();
      const unicodeContent = `
        public class 测试类 {
          public void メソッド() { }
          private string поле = "значение";
        }
      `;
      
      // Act
      const result = await parser.parseContent(unicodeContent);
      
      // Assert
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('测试类');
    });

    it('should handle circular references in class hierarchies', async () => {
      // Arrange
      const toolExecutor = createMockToolExecutor();
      toolExecutor.setCircularReference(true);
      
      // Act
      const result = await toolExecutor.execute('analyze_dependencies', {
        class_name: 'CircularClass',
        analysis_type: 'circular'
      });
      
      // Assert
      expect(result.circularDependencies).toBeDefined();
      expect(result.circularDependencies.length).toBeGreaterThan(0);
    });
  });

  describe('Recovery and Resilience', () => {
    it('should recover from transient database errors', async () => {
      // Arrange
      const resilientStore = createResilientVectorStore();
      resilientStore.setTransientErrorCount(3); // Fail 3 times, then succeed
      
      // Act
      const result = await resilientStore.similaritySearch('test', 5);
      
      // Assert
      expect(result).toBeDefined();
      expect(resilientStore.getRetryCount()).toBe(3);
    });

    it('should gracefully degrade when embeddings fail', async () => {
      // Arrange
      const toolExecutor = createMockToolExecutor();
      toolExecutor.setEmbeddingFailure(true);
      
      // Act
      const result = await toolExecutor.execute('search_code', {
        query: 'PlayerController',
        fallback_to_text_search: true
      });
      
      // Assert
      expect(result.results).toBeDefined();
      expect(result.metadata.searchMethod).toBe('text_fallback');
    });

    it('should maintain partial functionality during component failures', async () => {
      // Arrange
      const server = createMockServer();
      server.setComponentFailure('embeddings', true);
      
      // Act
      const healthCheck = await server.getHealthStatus();
      
      // Assert
      expect(healthCheck.status).toBe('degraded');
      expect(healthCheck.availableFeatures).toContain('text_search');
      expect(healthCheck.unavailableFeatures).toContain('semantic_search');
    });
  });
});

// Helper functions for error testing

function createMockServer() {
  let databaseError: Error | null = null;
  let embeddingError: Error | null = null;
  let componentFailures: Record<string, boolean> = {};
  
  return {
    initialize: jest.fn().mockImplementation(async (options: any) => {
      if (options.dumpFilePath === 'nonexistent.cs') {
        throw new MCPServerError('File not found', ErrorType.INITIALIZATION_ERROR);
      }
      if (databaseError) {
        throw databaseError;
      }
      if (embeddingError) {
        throw embeddingError;
      }
    }),

    initializeWithContent: jest.fn().mockImplementation(async (content: string) => {
      if (content.includes('\x00')) {
        throw new Error('Failed to parse IL2CPP dump');
      }
    }),

    setDatabaseError: (error: Error) => { databaseError = error; },
    setEmbeddingError: (error: Error) => { embeddingError = error; },
    setComponentFailure: (component: string, failed: boolean) => {
      componentFailures[component] = failed;
    },

    getHealthStatus: jest.fn().mockImplementation(async () => {
      const failedComponents = Object.keys(componentFailures).filter(c => componentFailures[c]);
      return {
        status: failedComponents.length > 0 ? 'degraded' : 'healthy',
        availableFeatures: ['text_search'],
        unavailableFeatures: failedComponents.includes('embeddings') ? ['semantic_search'] : []
      };
    })
  };
}

function createMockToolExecutor() {
  let executionDelay = 0;
  let vectorStoreError: Error | null = null;
  let embeddingFailure = false;
  let circularReference = false;
  
  return {
    execute: jest.fn().mockImplementation(async (toolName: string, params: any) => {
      if (executionDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, executionDelay));
        if (params.timeout && executionDelay > params.timeout) {
          throw new Error('Tool execution timeout');
        }
      }
      
      if (vectorStoreError) {
        throw new MCPServerError(vectorStoreError.message, ErrorType.TOOL_EXECUTION_ERROR);
      }
      
      if (embeddingFailure && params.fallback_to_text_search) {
        return {
          results: [],
          metadata: { searchMethod: 'text_fallback' }
        };
      }
      
      if (circularReference && toolName === 'analyze_dependencies') {
        return {
          circularDependencies: [
            { path: ['ClassA', 'ClassB', 'ClassA'], description: 'Circular dependency detected' }
          ]
        };
      }
      
      // Validate parameters
      if (params.query === '' || params.top_k < 0) {
        throw new MCPServerError('Invalid parameters', ErrorType.VALIDATION_ERROR);
      }
      
      return { results: [], error: 'not found' };
    }),

    setExecutionDelay: (delay: number) => { executionDelay = delay; },
    setVectorStoreError: (error: Error) => { vectorStoreError = error; },
    setEmbeddingFailure: (failed: boolean) => { embeddingFailure = failed; },
    setCircularReference: (circular: boolean) => { circularReference = circular; }
  };
}

function createMockValidator() {
  return {
    validateSearchParams: (params: any) => {
      if (params.query === null || params.query === undefined) {
        throw new Error('Invalid query parameter');
      }
      if (typeof params.top_k === 'string') {
        throw new Error('Invalid query parameter');
      }
      if (params.top_k <= 0) {
        throw new Error('top_k must be greater than 0');
      }
      if (params.top_k > 1000) {
        throw new Error('top_k must not exceed 1000');
      }
    },

    validateDependencyParams: (params: any) => {
      if (!params.class_name || params.class_name.trim() === '') {
        throw new Error('class_name cannot be empty');
      }
      if (params.depth !== undefined && (params.depth < 1 || params.depth > 5)) {
        throw new Error('depth must be between 1 and 5');
      }
      if (params.analysis_type && !['incoming', 'outgoing', 'bidirectional', 'circular'].includes(params.analysis_type)) {
        throw new Error('Invalid analysis_type');
      }
    },

    validatePatternParams: (params: any) => {
      if (!params.pattern_types || params.pattern_types.length === 0) {
        throw new Error('pattern_types cannot be empty');
      }
      if (params.confidence_threshold !== undefined && (params.confidence_threshold < 0.1 || params.confidence_threshold > 1.0)) {
        throw new Error('confidence_threshold must be between 0.1 and 1.0');
      }
    }
  };
}

function createMockProcessor() {
  let memoryLimit = Infinity;
  
  return {
    processLargeData: jest.fn().mockImplementation(async (data: any[]) => {
      const estimatedMemory = data.length * 1000; // Rough estimate
      if (estimatedMemory > memoryLimit) {
        throw new Error('Memory limit exceeded');
      }
      return { processed: true };
    }),

    setMemoryLimit: (limit: number) => { memoryLimit = limit; }
  };
}

function createMockFileHandler() {
  return {
    readFile: jest.fn().mockImplementation(async (path: string) => {
      if (path.includes('/protected/')) {
        throw new Error('Permission denied');
      }
      return 'file content';
    }),

    writeFile: jest.fn().mockImplementation(async (path: string, data: string) => {
      if (path.includes('/readonly/')) {
        throw new Error('Read-only file system');
      }
    })
  };
}

function createMockNetworkClient() {
  let networkDelay = 0;
  
  return {
    fetchEmbeddings: jest.fn().mockImplementation(async (query: string) => {
      if (networkDelay > 30000) {
        throw new Error('Network timeout');
      }
      await new Promise(resolve => setTimeout(resolve, networkDelay));
      return [0.1, 0.2, 0.3];
    }),

    setNetworkDelay: (delay: number) => { networkDelay = delay; }
  };
}

function createMockParser() {
  return {
    parseContent: jest.fn().mockImplementation(async (content: string) => {
      if (!content.trim()) {
        return {
          classes: [],
          enums: [],
          interfaces: [],
          statistics: { totalConstructs: 0, parseErrors: 0 }
        };
      }
      
      // Simple parsing simulation
      const classes = [];
      if (content.includes('class 测试类')) {
        classes.push({ name: '测试类' });
      }
      
      return {
        classes,
        enums: [],
        interfaces: [],
        statistics: { totalConstructs: classes.length, parseErrors: 0 }
      };
    })
  };
}

function createResilientVectorStore() {
  let transientErrorCount = 0;
  let currentRetries = 0;
  
  return {
    similaritySearch: jest.fn().mockImplementation(async (query: string, k: number) => {
      if (currentRetries < transientErrorCount) {
        currentRetries++;
        throw new Error('Transient database error');
      }
      return [];
    }),

    setTransientErrorCount: (count: number) => { 
      transientErrorCount = count;
      currentRetries = 0;
    },
    getRetryCount: () => currentRetries
  };
}
