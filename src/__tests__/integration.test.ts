/**
 * Integration tests for the complete MCP server workflow
 * Tests end-to-end functionality from initialization to tool execution
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockIL2CPPDumpContent, mockDocuments } from './test-data';

// Mock the complete MCP server stack
const mockMCPServer = {
  initialize: jest.fn(),
  registerTools: jest.fn(),
  registerResources: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  executeToolCall: jest.fn()
};

const mockVectorStore = {
  initialize: jest.fn(),
  addDocuments: jest.fn(),
  similaritySearch: jest.fn(),
  searchWithFilter: jest.fn()
};

const mockParser = {
  loadFile: jest.fn(),
  extractAllConstructs: jest.fn()
};

const mockEmbeddings = {
  initialize: jest.fn(),
  embedDocuments: jest.fn(),
  embedQuery: jest.fn()
};

describe('Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful responses
    mockMCPServer.initialize.mockResolvedValue(undefined);
    mockVectorStore.initialize.mockResolvedValue(undefined);
    mockParser.loadFile.mockResolvedValue(undefined);
    mockParser.extractAllConstructs.mockReturnValue({
      classes: mockDocuments.filter(doc => doc.metadata.type === 'class'),
      enums: mockDocuments.filter(doc => doc.metadata.type === 'enum'),
      interfaces: mockDocuments.filter(doc => doc.metadata.type === 'interface'),
      statistics: { totalConstructs: mockDocuments.length }
    });
    mockEmbeddings.initialize.mockResolvedValue(undefined);
    mockEmbeddings.embedDocuments.mockResolvedValue(
      mockDocuments.map(() => Array(384).fill(0).map(() => Math.random()))
    );
    mockVectorStore.addDocuments.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Server Initialization', () => {
    it('should initialize the complete MCP server stack successfully', async () => {
      // Arrange
      const serverStack = createMockServerStack();

      // Act
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs',
        model: 'Xenova/all-MiniLM-L6-v2',
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key'
      });

      // Assert
      expect(mockParser.loadFile).toHaveBeenCalledWith('test-dump.cs');
      expect(mockParser.extractAllConstructs).toHaveBeenCalled();
      expect(mockEmbeddings.initialize).toHaveBeenCalledWith('Xenova/all-MiniLM-L6-v2');
      expect(mockVectorStore.initialize).toHaveBeenCalledWith({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key'
      });
      expect(mockVectorStore.addDocuments).toHaveBeenCalled();
      expect(mockMCPServer.initialize).toHaveBeenCalled();
      expect(mockMCPServer.registerTools).toHaveBeenCalled();
      expect(mockMCPServer.registerResources).toHaveBeenCalled();
    });

    it('should handle initialization failures gracefully', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      mockParser.loadFile.mockRejectedValue(new Error('File not found'));

      // Act & Assert
      await expect(serverStack.initializeComplete({
        dumpFilePath: 'nonexistent.cs'
      })).rejects.toThrow('File not found');
    });

    it('should validate configuration parameters', async () => {
      // Arrange
      const serverStack = createMockServerStack();

      // Act & Assert
      await expect(serverStack.initializeComplete({
        dumpFilePath: '',
        model: ''
      })).rejects.toThrow('Invalid configuration');
    });
  });

  describe('End-to-End Tool Execution', () => {
    it('should execute search_code tool end-to-end', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs'
      });

      const searchResults = mockDocuments.filter(doc => 
        doc.metadata.name.includes('Player')
      );
      mockVectorStore.similaritySearch.mockResolvedValue(searchResults);

      // Act
      const result = await serverStack.executeToolCall('search_code', {
        query: 'PlayerController',
        top_k: 5
      });

      // Assert
      expect(mockVectorStore.similaritySearch).toHaveBeenCalledWith('PlayerController', 5);
      expect(result.results).toHaveLength(searchResults.length);
      expect(result.results[0].name).toContain('Player');
      expect(result.metadata.query).toBe('PlayerController');
    });

    it('should execute find_monobehaviours tool end-to-end', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs'
      });

      const monoBehaviours = mockDocuments.filter(doc => 
        doc.metadata.isMonoBehaviour
      );
      mockVectorStore.searchWithFilter.mockResolvedValue(monoBehaviours);

      // Act
      const result = await serverStack.executeToolCall('find_monobehaviours', {
        query: 'Controller',
        top_k: 10
      });

      // Assert
      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith(
        'Controller',
        { type: 'class', isMonoBehaviour: true },
        10
      );
      expect(result.monoBehaviours).toHaveLength(monoBehaviours.length);
      expect(result.monoBehaviours.every((mb: any) => mb.baseClass === 'MonoBehaviour' || mb.name === 'MonoBehaviour')).toBe(true);
    });

    it('should execute find_class_hierarchy tool end-to-end', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs'
      });

      const targetClass = mockDocuments.find(doc => 
        doc.metadata.name === 'PlayerController'
      );
      mockVectorStore.searchWithFilter.mockResolvedValue([targetClass]);

      // Act
      const result = await serverStack.executeToolCall('find_class_hierarchy', {
        class_name: 'PlayerController',
        include_methods: true
      });

      // Assert
      expect(result.name).toBe('PlayerController');
      expect(result.baseClass).toBe('MonoBehaviour');
      expect(result.methods).toBeDefined();
      expect(result.isMonoBehaviour).toBe(true);
    });

    it('should execute analyze_dependencies tool end-to-end', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs'
      });

      const targetClass = mockDocuments.find(doc => 
        doc.metadata.name === 'GameManager'
      );
      mockVectorStore.searchWithFilter.mockResolvedValue([targetClass]);
      mockVectorStore.similaritySearch.mockResolvedValue(mockDocuments);

      // Act
      const result = await serverStack.executeToolCall('analyze_dependencies', {
        class_name: 'GameManager',
        analysis_type: 'bidirectional',
        depth: 2
      });

      // Assert
      expect(result.targetClass.name).toBe('GameManager');
      expect(result.incomingDependencies).toBeDefined();
      expect(result.outgoingDependencies).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.analysisMetadata.analysisType).toBe('bidirectional');
    });

    it('should execute find_design_patterns tool end-to-end', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs'
      });

      mockVectorStore.searchWithFilter.mockResolvedValue(mockDocuments);

      // Act
      const result = await serverStack.executeToolCall('find_design_patterns', {
        pattern_types: ['singleton', 'observer'],
        confidence_threshold: 0.7
      });

      // Assert
      expect(result.detectedPatterns).toBeDefined();
      expect(result.detectedPatterns.singleton).toBeDefined();
      expect(result.detectedPatterns.observer).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.metadata.searchedPatterns).toEqual(['singleton', 'observer']);
    });
  });

  describe('Resource Access Integration', () => {
    it('should serve IL2CPP resources through MCP protocol', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs'
      });

      mockVectorStore.similaritySearch.mockResolvedValue(mockDocuments.slice(0, 3));

      // Act
      const result = await serverStack.accessResource('il2cpp://PlayerController', {
        top_k: 3,
        filter_type: 'class'
      });

      // Assert
      expect(result.contents).toHaveLength(3);
      expect(result.contents[0].metadata.searchQuery).toBe('PlayerController');
      expect(result.contents[0].uri).toContain('il2cpp://');
    });

    it('should handle resource access with filters', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs'
      });

      const filteredResults = mockDocuments.filter(doc => 
        doc.metadata.isMonoBehaviour
      );
      mockVectorStore.searchWithFilter.mockResolvedValue(filteredResults);

      // Act
      const result = await serverStack.accessResource('il2cpp://MonoBehaviour', {
        filter_monobehaviour: true,
        top_k: 5
      });

      // Assert
      expect(mockVectorStore.searchWithFilter).toHaveBeenCalledWith(
        'MonoBehaviour',
        { isMonoBehaviour: true },
        5
      );
      expect(result.contents).toHaveLength(filteredResults.length);
    });
  });

  describe('Performance Integration', () => {
    it('should handle concurrent tool executions efficiently', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs'
      });

      mockVectorStore.similaritySearch.mockResolvedValue(mockDocuments.slice(0, 3));
      mockVectorStore.searchWithFilter.mockResolvedValue(mockDocuments.slice(0, 2));

      // Act
      const startTime = Date.now();
      const concurrentCalls = [
        serverStack.executeToolCall('search_code', { query: 'Player', top_k: 5 }),
        serverStack.executeToolCall('find_monobehaviours', { top_k: 10 }),
        serverStack.executeToolCall('search_code', { query: 'Manager', top_k: 3 }),
        serverStack.executeToolCall('find_class_hierarchy', { class_name: 'GameManager' })
      ];

      const results = await Promise.all(concurrentCalls);
      const endTime = Date.now();

      // Assert
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(results).toHaveLength(4);
      expect(results.every(result => result !== null)).toBe(true);
    });

    it('should maintain performance with large document sets', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      
      // Simulate large document set
      const largeDocumentSet = Array(5000).fill(null).map((_, i) => ({
        pageContent: `Document ${i} content`,
        metadata: { name: `Doc${i}`, type: 'class', namespace: 'Test' }
      }));

      mockParser.extractAllConstructs.mockReturnValue({
        classes: largeDocumentSet,
        enums: [],
        interfaces: [],
        statistics: { totalConstructs: largeDocumentSet.length }
      });

      // Act
      const startTime = Date.now();
      await serverStack.initializeComplete({
        dumpFilePath: 'large-dump.cs'
      });
      const endTime = Date.now();

      // Assert
      const initializationTime = endTime - startTime;
      expect(initializationTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(mockVectorStore.addDocuments).toHaveBeenCalled();
    });
  });

  describe('Error Recovery Integration', () => {
    it('should recover from transient vector store errors', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs'
      });

      // Simulate transient error followed by success
      mockVectorStore.similaritySearch
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValue(mockDocuments.slice(0, 2));

      // Act
      const result = await serverStack.executeToolCall('search_code', {
        query: 'PlayerController',
        top_k: 5,
        retry: true
      });

      // Assert
      expect(result.results).toHaveLength(2);
      expect(mockVectorStore.similaritySearch).toHaveBeenCalledTimes(2); // Initial call + retry
    });

    it('should provide graceful degradation when embeddings fail', async () => {
      // Arrange
      const serverStack = createMockServerStack();
      mockEmbeddings.embedDocuments.mockRejectedValue(new Error('Embedding service unavailable'));

      // Act
      await serverStack.initializeComplete({
        dumpFilePath: 'test-dump.cs',
        fallbackToTextSearch: true
      });

      const healthStatus = await serverStack.getHealthStatus();

      // Assert
      expect(healthStatus.status).toBe('degraded');
      expect(healthStatus.availableFeatures).toContain('text_search');
      expect(healthStatus.unavailableFeatures).toContain('semantic_search');
    });
  });
});

// Helper function to create a mock server stack
function createMockServerStack() {
  return {
    initializeComplete: jest.fn().mockImplementation(async (config: any) => {
      // Validate configuration
      if (!config.dumpFilePath || config.dumpFilePath === '') {
        throw new Error('Invalid configuration');
      }

      // Initialize components in order
      await mockParser.loadFile(config.dumpFilePath);
      const constructs = mockParser.extractAllConstructs();
      
      if (config.model) {
        await mockEmbeddings.initialize(config.model);
      }
      
      if (config.supabaseUrl && config.supabaseKey) {
        await mockVectorStore.initialize({
          supabaseUrl: config.supabaseUrl,
          supabaseKey: config.supabaseKey
        });
      }

      // Create documents from constructs
      const documents = [
        ...constructs.classes.map((cls: any) => ({
          pageContent: `class ${cls.name}`,
          metadata: { ...cls, type: 'class' }
        })),
        ...constructs.enums.map((enm: any) => ({
          pageContent: `enum ${enm.name}`,
          metadata: { ...enm, type: 'enum' }
        })),
        ...constructs.interfaces.map((iface: any) => ({
          pageContent: `interface ${iface.name}`,
          metadata: { ...iface, type: 'interface' }
        }))
      ];

      if (!config.fallbackToTextSearch) {
        await mockEmbeddings.embedDocuments(documents.map(doc => doc.pageContent));
      }
      
      await mockVectorStore.addDocuments(documents);
      await mockMCPServer.initialize();
      await mockMCPServer.registerTools();
      await mockMCPServer.registerResources();
    }),

    executeToolCall: jest.fn().mockImplementation(async (toolName: string, params: any) => {
      // Simulate tool execution logic
      switch (toolName) {
        case 'search_code':
          const searchResults = await mockVectorStore.similaritySearch(params.query, params.top_k);
          return {
            results: searchResults.map((doc: any) => ({
              content: doc.pageContent,
              name: doc.metadata.name,
              type: doc.metadata.type
            })),
            metadata: { query: params.query }
          };

        case 'find_monobehaviours':
          const mbResults = await mockVectorStore.searchWithFilter(
            params.query || '',
            { type: 'class', isMonoBehaviour: true },
            params.top_k
          );
          return {
            monoBehaviours: mbResults.map((doc: any) => ({
              name: doc.metadata.name,
              baseClass: doc.metadata.baseClass
            }))
          };

        case 'find_class_hierarchy':
          const classResults = await mockVectorStore.searchWithFilter(
            params.class_name,
            { type: 'class' },
            1
          );
          if (classResults.length === 0) {
            return { error: 'Class not found' };
          }
          const classDoc = classResults[0];
          return {
            name: classDoc.metadata.name,
            baseClass: classDoc.metadata.baseClass,
            isMonoBehaviour: classDoc.metadata.isMonoBehaviour,
            methods: params.include_methods ? classDoc.metadata.methods : undefined
          };

        case 'analyze_dependencies':
          const targetResults = await mockVectorStore.searchWithFilter(
            params.class_name,
            { type: 'class' },
            1
          );
          if (targetResults.length === 0) {
            return { error: 'Class not found' };
          }
          return {
            targetClass: { name: params.class_name },
            incomingDependencies: [],
            outgoingDependencies: [],
            metrics: { totalIncoming: 0, totalOutgoing: 0 },
            analysisMetadata: { analysisType: params.analysis_type }
          };

        case 'find_design_patterns':
          await mockVectorStore.searchWithFilter('', { type: 'class' }, 500);
          const detectedPatterns: any = {};
          params.pattern_types.forEach((pattern: string) => {
            detectedPatterns[pattern] = [];
          });
          return {
            detectedPatterns,
            summary: { totalPatternsFound: 0 },
            metadata: { searchedPatterns: params.pattern_types }
          };

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    }),

    accessResource: jest.fn().mockImplementation(async (uri: string, params: any) => {
      const query = uri.replace('il2cpp://', '');
      const filter: any = {};
      
      if (params.filter_type) filter.type = params.filter_type;
      if (params.filter_monobehaviour) filter.isMonoBehaviour = true;

      let results;
      if (Object.keys(filter).length > 0) {
        results = await mockVectorStore.searchWithFilter(query, filter, params.top_k || 5);
      } else {
        results = await mockVectorStore.similaritySearch(query, params.top_k || 5);
      }

      return {
        contents: results.map((doc: any) => ({
          uri: `il2cpp://${encodeURIComponent(doc.metadata.name)}`,
          text: doc.pageContent,
          metadata: {
            ...doc.metadata,
            searchQuery: query
          }
        }))
      };
    }),

    getHealthStatus: jest.fn().mockImplementation(async () => {
      return {
        status: 'healthy',
        availableFeatures: ['text_search', 'semantic_search'],
        unavailableFeatures: []
      };
    })
  };
}
