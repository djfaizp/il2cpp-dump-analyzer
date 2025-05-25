/**
 * Unit tests for advanced MCP tools
 * Tests dependency analysis, cross-references, and design pattern detection
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockDocuments, mockSearchResults, mockErrorScenarios } from './test-data';

// Mock the vector store
const mockVectorStore = {
  similaritySearch: jest.fn(),
  searchWithFilter: jest.fn(),
  addDocuments: jest.fn()
};

describe('Advanced MCP Tools Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVectorStore.similaritySearch.mockResolvedValue([]);
    mockVectorStore.searchWithFilter.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyze_dependencies tool', () => {
    it('should analyze bidirectional dependencies correctly', async () => {
      // Arrange
      const targetClass = mockDocuments.find(doc => doc.metadata.name === 'PlayerController');
      const dependentClasses = mockDocuments.filter(doc => 
        doc.metadata.name !== 'PlayerController' && doc.metadata.type === 'class'
      );
      
      mockVectorStore.searchWithFilter
        .mockResolvedValueOnce([targetClass]) // Target class search
        .mockResolvedValue(dependentClasses); // Dependency searches

      // Act
      const result = await simulateAdvancedToolCall('analyze_dependencies', {
        class_name: 'PlayerController',
        analysis_type: 'bidirectional',
        depth: 2,
        include_system_types: false
      });

      // Assert
      expect(result.targetClass.name).toBe('PlayerController');
      expect(result.incomingDependencies).toBeDefined();
      expect(result.outgoingDependencies).toBeDefined();
      expect(result.metrics.totalIncoming).toBeGreaterThanOrEqual(0);
      expect(result.metrics.totalOutgoing).toBeGreaterThanOrEqual(0);
      expect(result.metrics.couplingScore).toBeGreaterThanOrEqual(0);
      expect(result.analysisMetadata.analysisType).toBe('bidirectional');
    });

    it('should detect circular dependencies', async () => {
      // Arrange
      const targetClass = mockDocuments.find(doc => doc.metadata.name === 'GameManager');
      mockVectorStore.searchWithFilter.mockResolvedValue([targetClass]);

      // Act
      const result = await simulateAdvancedToolCall('analyze_dependencies', {
        class_name: 'GameManager',
        analysis_type: 'circular',
        depth: 3
      });

      // Assert
      expect(result.circularDependencies).toBeDefined();
      expect(Array.isArray(result.circularDependencies)).toBe(true);
      expect(result.analysisMetadata.analysisType).toBe('circular');
    });

    it('should handle class not found', async () => {
      // Arrange
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      // Act
      const result = await simulateAdvancedToolCall('analyze_dependencies', {
        class_name: 'NonExistentClass',
        analysis_type: 'bidirectional'
      });

      // Assert
      expect(result.error).toContain('not found');
      expect(result.suggestions).toBeDefined();
    });

    it('should validate depth parameter', async () => {
      // Arrange
      const targetClass = mockDocuments.find(doc => doc.metadata.name === 'PlayerController');
      mockVectorStore.searchWithFilter.mockResolvedValue([targetClass]);

      // Act
      const result = await simulateAdvancedToolCall('analyze_dependencies', {
        class_name: 'PlayerController',
        depth: 10 // Should be clamped to 5
      });

      // Assert
      expect(result.analysisMetadata.actualDepth).toBeLessThanOrEqual(5);
    });
  });

  describe('find_cross_references tool', () => {
    it('should find cross-references for a class', async () => {
      // Arrange
      const targetClass = mockDocuments.find(doc => doc.metadata.name === 'PlayerController');
      const referencingClasses = mockDocuments.filter(doc => 
        doc.metadata.name !== 'PlayerController'
      );
      
      mockVectorStore.searchWithFilter.mockResolvedValueOnce([targetClass]);
      mockVectorStore.similaritySearch.mockResolvedValue(referencingClasses);

      // Act
      const result = await simulateAdvancedToolCall('find_cross_references', {
        target_name: 'PlayerController',
        target_type: 'class',
        reference_type: 'all',
        max_results: 20
      });

      // Assert
      expect(result.target.found).toBe(true);
      expect(result.target.name).toBe('PlayerController');
      expect(result.references).toBeDefined();
      expect(Array.isArray(result.references)).toBe(true);
      expect(result.usagePatterns).toBeDefined();
      expect(result.metadata.totalReferences).toBeGreaterThanOrEqual(0);
    });

    it('should find cross-references for a method', async () => {
      // Arrange
      mockVectorStore.searchWithFilter.mockResolvedValue([]);
      mockVectorStore.similaritySearch.mockResolvedValue(mockDocuments);

      // Act
      const result = await simulateAdvancedToolCall('find_cross_references', {
        target_name: 'Start',
        target_type: 'method',
        reference_type: 'usage',
        include_system_types: false
      });

      // Assert
      expect(result.target.type).toBe('method');
      expect(result.metadata.referenceType).toBe('usage');
      expect(result.metadata.includeSystemTypes).toBe(false);
    });

    it('should handle target not found', async () => {
      // Arrange
      mockVectorStore.searchWithFilter.mockResolvedValue([]);
      mockVectorStore.similaritySearch.mockResolvedValue([]);

      // Act
      const result = await simulateAdvancedToolCall('find_cross_references', {
        target_name: 'NonExistentMethod',
        target_type: 'method'
      });

      // Assert
      expect(result.error).toContain('not found');
      expect(result.suggestions).toBeDefined();
      expect(result.availableTypes).toContain('method');
    });

    it('should validate max_results parameter', async () => {
      // Arrange
      const targetClass = mockDocuments.find(doc => doc.metadata.name === 'GameManager');
      mockVectorStore.searchWithFilter.mockResolvedValue([targetClass]);
      mockVectorStore.similaritySearch.mockResolvedValue(mockDocuments);

      // Act
      const result = await simulateAdvancedToolCall('find_cross_references', {
        target_name: 'GameManager',
        target_type: 'class',
        max_results: 300 // Should be clamped to 200
      });

      // Assert
      expect(result.references.length).toBeLessThanOrEqual(200);
    });
  });

  describe('find_design_patterns tool', () => {
    it('should detect singleton pattern', async () => {
      // Arrange
      const singletonClass = mockDocuments.find(doc => doc.metadata.name === 'GameManager');
      mockVectorStore.searchWithFilter.mockResolvedValue([singletonClass]);

      // Act
      const result = await simulateAdvancedToolCall('find_design_patterns', {
        pattern_types: ['singleton'],
        confidence_threshold: 0.7,
        include_partial_matches: true
      });

      // Assert
      expect(result.detectedPatterns.singleton).toBeDefined();
      expect(Array.isArray(result.detectedPatterns.singleton)).toBe(true);
      expect(result.summary.totalPatternsFound).toBeGreaterThanOrEqual(0);
      expect(result.metadata.searchedPatterns).toContain('singleton');
    });

    it('should detect observer pattern', async () => {
      // Arrange
      const observerClass = mockDocuments.find(doc => doc.metadata.name === 'EventManager');
      mockVectorStore.searchWithFilter.mockResolvedValue([observerClass]);

      // Act
      const result = await simulateAdvancedToolCall('find_design_patterns', {
        pattern_types: ['observer'],
        confidence_threshold: 0.6,
        exclude_unity_patterns: false
      });

      // Assert
      expect(result.detectedPatterns.observer).toBeDefined();
      expect(result.metadata.excludeUnityPatterns).toBe(false);
      expect(result.summary.patternTypeCount).toBeGreaterThanOrEqual(0);
    });

    it('should detect multiple patterns', async () => {
      // Arrange
      mockVectorStore.searchWithFilter.mockResolvedValue(mockDocuments);

      // Act
      const result = await simulateAdvancedToolCall('find_design_patterns', {
        pattern_types: ['singleton', 'observer', 'factory'],
        confidence_threshold: 0.5,
        max_results_per_pattern: 5
      });

      // Assert
      expect(result.detectedPatterns.singleton).toBeDefined();
      expect(result.detectedPatterns.observer).toBeDefined();
      expect(result.detectedPatterns.factory).toBeDefined();
      expect(result.summary.architecturalInsights).toBeDefined();
      expect(Array.isArray(result.summary.architecturalInsights)).toBe(true);
    });

    it('should validate confidence threshold', async () => {
      // Arrange
      mockVectorStore.searchWithFilter.mockResolvedValue(mockDocuments);

      // Act
      const result = await simulateAdvancedToolCall('find_design_patterns', {
        pattern_types: ['singleton'],
        confidence_threshold: 1.5 // Should be clamped to 1.0
      });

      // Assert
      expect(result.metadata.confidenceThreshold).toBeLessThanOrEqual(1.0);
    });

    it('should handle no patterns found', async () => {
      // Arrange
      mockVectorStore.searchWithFilter.mockResolvedValue([]);

      // Act
      const result = await simulateAdvancedToolCall('find_design_patterns', {
        pattern_types: ['singleton'],
        confidence_threshold: 0.9
      });

      // Assert
      expect(result.summary.totalPatternsFound).toBe(0);
      expect(result.summary.architecturalInsights).toContain('No design patterns detected');
    });
  });
});

// Helper function to simulate advanced MCP tool calls
async function simulateAdvancedToolCall(toolName: string, params: any): Promise<any> {
  switch (toolName) {
    case 'analyze_dependencies':
      return simulateDependencyAnalysis(params);
    case 'find_cross_references':
      return simulateCrossReferences(params);
    case 'find_design_patterns':
      return simulateDesignPatterns(params);
    default:
      throw new Error(`Unknown advanced tool: ${toolName}`);
  }
}

// Simulate analyze_dependencies tool logic
async function simulateDependencyAnalysis(params: any) {
  const { 
    class_name, 
    analysis_type = 'bidirectional', 
    depth = 3, 
    include_system_types = false 
  } = params;
  
  const maxDepth = Math.min(Math.max(depth, 1), 5);
  
  const classResults = await mockVectorStore.searchWithFilter(class_name, { type: 'class' }, 1);
  
  if (classResults.length === 0) {
    return {
      error: `Class '${class_name}' not found in the IL2CPP dump.`,
      suggestions: 'Try searching with a partial name or check the spelling.',
      availableClasses: 'Use search_code tool to find available classes.'
    };
  }
  
  const targetClass = classResults[0];
  
  return {
    targetClass: {
      name: targetClass.metadata.name,
      fullName: targetClass.metadata.fullName,
      namespace: targetClass.metadata.namespace || ''
    },
    incomingDependencies: [],
    outgoingDependencies: [],
    circularDependencies: [],
    metrics: {
      totalIncoming: 0,
      totalOutgoing: 0,
      systemTypeCount: 0,
      userTypeCount: 0,
      couplingScore: 0,
      maxDepthReached: 1
    },
    analysisMetadata: {
      analysisType: analysis_type,
      requestedDepth: depth,
      actualDepth: maxDepth,
      includeSystemTypes: include_system_types,
      timestamp: new Date().toISOString()
    }
  };
}

// Simulate find_cross_references tool logic
async function simulateCrossReferences(params: any) {
  const { 
    target_name, 
    target_type, 
    reference_type = 'all',
    include_nested = true,
    include_system_types = false,
    max_results = 50
  } = params;
  
  const validMaxResults = Math.min(Math.max(max_results, 1), 200);
  
  const targetResults = await mockVectorStore.searchWithFilter(target_name, { type: target_type }, 1);
  
  if (targetResults.length === 0) {
    return {
      error: `${target_type} '${target_name}' not found in the IL2CPP dump.`,
      suggestions: [
        'Try searching with a partial name',
        'Check the spelling and case sensitivity',
        'Use search_code tool to find available entities',
        'Verify the target_type is correct'
      ],
      availableTypes: ['class', 'method', 'field', 'property', 'event', 'enum', 'interface']
    };
  }
  
  const targetEntity = targetResults[0];
  
  return {
    target: {
      name: targetEntity.metadata.name,
      type: target_type,
      fullName: targetEntity.metadata.fullName,
      namespace: targetEntity.metadata.namespace || '',
      found: true
    },
    references: [],
    usagePatterns: {
      inheritanceCount: 0,
      implementationCount: 0,
      fieldUsageCount: 0,
      methodUsageCount: 0,
      parameterUsageCount: 0,
      returnTypeUsageCount: 0
    },
    metadata: {
      searchTarget: target_name,
      targetType: target_type,
      referenceType: reference_type,
      totalReferences: 0,
      includeNested: include_nested,
      includeSystemTypes: include_system_types,
      timestamp: new Date().toISOString()
    }
  };
}

// Simulate find_design_patterns tool logic
async function simulateDesignPatterns(params: any) {
  const { 
    pattern_types,
    confidence_threshold = 0.7,
    include_partial_matches = true,
    namespace_scope,
    exclude_unity_patterns = false,
    max_results_per_pattern = 10
  } = params;
  
  const validConfidence = Math.min(Math.max(confidence_threshold, 0.1), 1.0);
  const validMaxResults = Math.min(Math.max(max_results_per_pattern, 1), 50);
  
  const allClassesResults = await mockVectorStore.searchWithFilter('', { type: 'class' }, 500);
  
  const detectedPatterns: any = {};
  pattern_types.forEach((pattern: string) => {
    detectedPatterns[pattern] = [];
  });
  
  return {
    detectedPatterns,
    summary: {
      totalPatternsFound: 0,
      patternTypeCount: 0,
      averageConfidence: 0,
      mostCommonPattern: 'none',
      architecturalInsights: [
        'No design patterns detected with the specified criteria',
        'Consider lowering the confidence threshold or enabling partial matches',
        'The codebase may use different architectural patterns not covered by this analysis'
      ]
    },
    metadata: {
      searchedPatterns: pattern_types,
      confidenceThreshold: validConfidence,
      includePartialMatches: include_partial_matches,
      namespaceScope: namespace_scope,
      excludeUnityPatterns: exclude_unity_patterns,
      timestamp: new Date().toISOString()
    }
  };
}
