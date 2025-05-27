/**
 * @fileoverview Unit tests for TypeAnalyzer - Type System Analysis and Relationship Mapping
 * Tests inheritance hierarchies, interface implementations, generic type relationships,
 * type dependency graphs, circular reference detection, and type compatibility analysis.
 *
 * Following TFD (Test-First Development) methodology as required by project guidelines.
 */

import { TypeAnalyzer } from '../metadata/type-analyzer';
import { IL2CPPMetadata, GenericTypeMetadata, AssemblyMetadata, BuildInformation, TypeSystemMetadata } from '../mcp/tools/extract-metadata-tool';

describe('TypeAnalyzer', () => {
  let typeAnalyzer: TypeAnalyzer;
  let mockMetadata: IL2CPPMetadata;

  beforeEach(() => {
    // Create comprehensive mock IL2CPP metadata for testing
    mockMetadata = createMockIL2CPPMetadata();
    typeAnalyzer = new TypeAnalyzer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Inheritance Hierarchy Analysis', () => {
    it('should analyze simple inheritance hierarchies correctly', async () => {
      // Arrange
      const metadata = createInheritanceTestMetadata();

      // Act
      const result = await typeAnalyzer.analyzeInheritanceHierarchies(metadata);

      // Assert
      expect(result.hierarchies).toBeDefined();
      expect(result.hierarchies.length).toBeGreaterThan(0);

      // Find the GameObject -> MonoBehaviour -> PlayerController hierarchy
      const playerHierarchy = result.hierarchies.find(h =>
        h.rootType === 'UnityEngine.GameObject' &&
        h.derivedTypes.some(d => `${d.namespace}.${d.typeName}` === 'Game.PlayerController')
      );

      expect(playerHierarchy).toBeDefined();
      expect(playerHierarchy!.depth).toBe(3);
      expect(playerHierarchy!.derivedTypes).toHaveLength(2);
    });

    it('should detect multiple inheritance patterns', async () => {
      // Arrange
      const metadata = createMultipleInheritanceTestMetadata();

      // Act
      const result = await typeAnalyzer.analyzeInheritanceHierarchies(metadata);

      // Assert
      expect(result.multipleInheritancePatterns).toBeDefined();
      expect(result.multipleInheritancePatterns.length).toBeGreaterThan(0);

      const pattern = result.multipleInheritancePatterns[0];
      expect(pattern.typeName).toBe('Game.NetworkedPlayerController');
      expect(pattern.baseTypes).toContain('Game.PlayerController');
      expect(pattern.interfaces).toContain('INetworkBehaviour');
    });

    it('should handle inheritance depth calculation', async () => {
      // Arrange
      const metadata = createDeepInheritanceTestMetadata();

      // Act
      const result = await typeAnalyzer.analyzeInheritanceHierarchies(metadata);

      // Assert
      const deepHierarchy = result.hierarchies.find(h => h.depth >= 5);
      expect(deepHierarchy).toBeDefined();
      expect(deepHierarchy!.depth).toBe(6);
      expect(deepHierarchy!.rootType).toBe('System.Object');
    });
  });

  describe('Interface Implementation Analysis', () => {
    it('should analyze interface implementations correctly', async () => {
      // Arrange
      const metadata = createInterfaceTestMetadata();

      // Act
      const result = await typeAnalyzer.analyzeInterfaceImplementations(metadata);

      // Assert
      expect(result.implementations).toBeDefined();
      expect(result.implementations.length).toBeGreaterThan(0);

      const playerImplementation = result.implementations.find(impl =>
        impl.implementingType === 'Game.PlayerController'
      );

      expect(playerImplementation).toBeDefined();
      expect(playerImplementation!.interfaces).toContain('IMovable');
      expect(playerImplementation!.interfaces).toContain('IDamageable');
    });

    it('should detect interface inheritance chains', async () => {
      // Arrange
      const metadata = createInterfaceInheritanceTestMetadata();

      // Act
      const result = await typeAnalyzer.analyzeInterfaceImplementations(metadata);

      // Assert
      expect(result.interfaceHierarchies).toBeDefined();
      const hierarchy = result.interfaceHierarchies.find(h => h.baseInterface === 'Game.IComponent');
      expect(hierarchy).toBeDefined();
      expect(hierarchy!.derivedInterfaces).toContain('Game.IMovable');
      expect(hierarchy!.derivedInterfaces).toContain('Game.IDamageable');
    });
  });

  describe('Generic Type Relationship Mapping', () => {
    it('should map generic type relationships correctly', async () => {
      // Arrange
      const metadata = createGenericTypeTestMetadata();

      // Act
      const result = await typeAnalyzer.mapGenericTypeRelationships(metadata);

      // Assert
      expect(result.genericRelationships).toBeDefined();
      expect(result.genericRelationships.length).toBeGreaterThan(0);

      const listRelationship = result.genericRelationships.find(rel =>
        rel.genericDefinition === 'System.Collections.Generic.List<T>'
      );

      expect(listRelationship).toBeDefined();
      expect(listRelationship!.instantiations).toContain('System.Collections.Generic.List<System.String>');
      expect(listRelationship!.constraints).toContain('T : class');
    });

    it('should analyze generic constraints properly', async () => {
      // Arrange
      const metadata = createConstrainedGenericTestMetadata();

      // Act
      const result = await typeAnalyzer.mapGenericTypeRelationships(metadata);

      // Assert
      const constrainedType = result.genericRelationships.find(rel =>
        rel.genericDefinition === 'Game.Repository<T>'
      );

      expect(constrainedType).toBeDefined();
      expect(constrainedType!.constraints).toContain('T : IEntity');
      expect(constrainedType!.constraints).toContain('T : new()');
    });
  });

  describe('Type Dependency Graph Creation', () => {
    it('should create comprehensive type dependency graphs', async () => {
      // Arrange
      const metadata = createDependencyTestMetadata();

      // Act
      const result = await typeAnalyzer.createTypeDependencyGraph(metadata);

      // Assert
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.edges.length).toBeGreaterThan(0);

      // Check for specific dependency relationships
      const playerNode = result.nodes.find(node => node.typeName === 'Game.PlayerController');
      expect(playerNode).toBeDefined();
      expect(playerNode!.dependencies).toContain('UnityEngine.MonoBehaviour');
      expect(playerNode!.dependencies).toContain('Game.IMovable');
    });

    it('should calculate dependency metrics correctly', async () => {
      // Arrange
      const metadata = createComplexDependencyTestMetadata();

      // Act
      const result = await typeAnalyzer.createTypeDependencyGraph(metadata);

      // Assert
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalNodes).toBeGreaterThan(0);
      expect(result.metrics.totalEdges).toBeGreaterThan(0);
      expect(result.metrics.averageDependencies).toBeGreaterThan(0);
      expect(result.metrics.maxDependencies).toBeGreaterThan(0);
    });
  });

  describe('Circular Reference Detection', () => {
    it('should detect circular dependencies in type relationships', async () => {
      // Arrange
      const metadata = createCircularDependencyTestMetadata();

      // Act
      const result = await typeAnalyzer.detectCircularReferences(metadata);

      // Assert
      expect(result.circularReferences).toBeDefined();
      expect(result.circularReferences.length).toBeGreaterThan(0);

      const circularRef = result.circularReferences[0];
      expect(circularRef.cycle).toBeDefined();
      expect(circularRef.cycle.length).toBeGreaterThanOrEqual(2);
      expect(circularRef.severity).toBeDefined();
    });

    it('should classify circular reference severity', async () => {
      // Arrange
      const metadata = createSeverityTestMetadata();

      // Act
      const result = await typeAnalyzer.detectCircularReferences(metadata);

      // Assert
      const highSeverityRef = result.circularReferences.find(ref => ref.severity === 'high');
      const lowSeverityRef = result.circularReferences.find(ref => ref.severity === 'low');

      expect(highSeverityRef).toBeDefined();
      expect(lowSeverityRef).toBeDefined();
      expect(highSeverityRef!.cycle.length).toBeLessThan(lowSeverityRef!.cycle.length);
    });
  });

  describe('Type Compatibility Analysis', () => {
    it('should analyze type compatibility correctly', async () => {
      // Arrange
      const metadata = createCompatibilityTestMetadata();

      // Act
      const result = await typeAnalyzer.analyzeTypeCompatibility(metadata);

      // Assert
      expect(result.compatibilityMatrix).toBeDefined();
      expect(result.compatibilityMatrix.size).toBeGreaterThan(0);

      // Check specific compatibility relationships
      const playerToMonoBehaviour = result.compatibilityMatrix.get('Game.PlayerController->UnityEngine.MonoBehaviour');
      expect(playerToMonoBehaviour).toBe('assignable');

      const stringToInt = result.compatibilityMatrix.get('System.String->System.Int32');
      expect(stringToInt).toBe('incompatible');
    });

    it('should handle generic type compatibility', async () => {
      // Arrange
      const metadata = createGenericCompatibilityTestMetadata();

      // Act
      const result = await typeAnalyzer.analyzeTypeCompatibility(metadata);

      // Assert
      const listCompatibility = result.compatibilityMatrix.get('System.Collections.Generic.List<System.String>->System.Collections.Generic.IEnumerable<System.String>');
      expect(listCompatibility).toBe('assignable');

      const incompatibleGeneric = result.compatibilityMatrix.get('System.Collections.Generic.List<System.String>->System.Collections.Generic.List<System.Int32>');
      expect(incompatibleGeneric).toBe('incompatible');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty metadata gracefully', async () => {
      // Arrange
      const emptyMetadata = createEmptyMetadata();

      // Act & Assert
      await expect(typeAnalyzer.analyzeInheritanceHierarchies(emptyMetadata)).resolves.toBeDefined();
      await expect(typeAnalyzer.analyzeInterfaceImplementations(emptyMetadata)).resolves.toBeDefined();
      await expect(typeAnalyzer.mapGenericTypeRelationships(emptyMetadata)).resolves.toBeDefined();
    });

    it('should handle malformed type definitions', async () => {
      // Arrange
      const malformedMetadata = createMalformedMetadata();

      // Act & Assert
      await expect(typeAnalyzer.createTypeDependencyGraph(malformedMetadata)).resolves.toBeDefined();
      await expect(typeAnalyzer.detectCircularReferences(malformedMetadata)).resolves.toBeDefined();
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle large type systems efficiently', async () => {
      // Arrange
      const largeMetadata = createLargeTypeSystemMetadata();
      const startTime = Date.now();

      // Act
      const result = await typeAnalyzer.analyzeInheritanceHierarchies(largeMetadata);

      // Assert
      const executionTime = Date.now() - startTime;
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.hierarchies.length).toBeGreaterThan(100);
    });
  });
});

// Helper functions to create test data
function createMockIL2CPPMetadata(): IL2CPPMetadata {
  return {
    assemblies: [],
    buildInfo: {},
    typeSystem: { totalTypes: 0, genericTypes: [] },
    validationResults: { isValid: true, errors: [], warnings: [], suggestions: [] },
    statistics: { totalAssemblies: 0, totalTypes: 0, totalMethods: 0, totalFields: 0, processingTime: 0, memoryUsage: 0, validationErrors: 0, validationWarnings: 0 },
    extractionDate: new Date()
  };
}

function createInheritanceTestMetadata(): IL2CPPMetadata {
  const metadata = createMockIL2CPPMetadata();
  metadata.typeSystem.genericTypes = [
    {
      name: 'GameObject',
      namespace: 'UnityEngine',
      typeDefIndex: 1,
      genericParameters: [],
      constraints: [],
      baseType: 'System.Object',
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    },
    {
      name: 'MonoBehaviour',
      namespace: 'UnityEngine',
      typeDefIndex: 2,
      genericParameters: [],
      constraints: [],
      baseType: 'UnityEngine.GameObject',
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    },
    {
      name: 'PlayerController',
      namespace: 'Game',
      typeDefIndex: 3,
      genericParameters: [],
      constraints: [],
      baseType: 'UnityEngine.MonoBehaviour',
      interfaces: ['IMovable', 'IDamageable'],
      isGenericDefinition: false,
      isGenericInstance: false
    }
  ];
  return metadata;
}

function createMultipleInheritanceTestMetadata(): IL2CPPMetadata {
  const metadata = createInheritanceTestMetadata();
  metadata.typeSystem.genericTypes.push({
    name: 'NetworkedPlayerController',
    namespace: 'Game',
    typeDefIndex: 4,
    genericParameters: [],
    constraints: [],
    baseType: 'Game.PlayerController',
    interfaces: ['INetworkBehaviour', 'ISerializable'],
    isGenericDefinition: false,
    isGenericInstance: false
  });
  return metadata;
}

function createDeepInheritanceTestMetadata(): IL2CPPMetadata {
  const metadata = createMockIL2CPPMetadata();
  const types = [
    { name: 'Object', namespace: 'System', baseType: undefined },
    { name: 'Component', namespace: 'UnityEngine', baseType: 'System.Object' },
    { name: 'Behaviour', namespace: 'UnityEngine', baseType: 'UnityEngine.Component' },
    { name: 'MonoBehaviour', namespace: 'UnityEngine', baseType: 'UnityEngine.Behaviour' },
    { name: 'BaseController', namespace: 'Game', baseType: 'UnityEngine.MonoBehaviour' },
    { name: 'PlayerController', namespace: 'Game', baseType: 'Game.BaseController' }
  ];

  metadata.typeSystem.genericTypes = types.map((type, index) => ({
    name: type.name,
    namespace: type.namespace,
    typeDefIndex: index + 1,
    genericParameters: [],
    constraints: [],
    baseType: type.baseType,
    interfaces: [],
    isGenericDefinition: false,
    isGenericInstance: false
  }));

  return metadata;
}

function createInterfaceTestMetadata(): IL2CPPMetadata {
  const metadata = createInheritanceTestMetadata();
  metadata.typeSystem.genericTypes.push(
    {
      name: 'IMovable',
      namespace: 'Game',
      typeDefIndex: 5,
      genericParameters: [],
      constraints: [],
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    },
    {
      name: 'IDamageable',
      namespace: 'Game',
      typeDefIndex: 6,
      genericParameters: [],
      constraints: [],
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    }
  );
  return metadata;
}

function createInterfaceInheritanceTestMetadata(): IL2CPPMetadata {
  const metadata = createInterfaceTestMetadata();
  metadata.typeSystem.genericTypes.push(
    {
      name: 'IComponent',
      namespace: 'Game',
      typeDefIndex: 7,
      genericParameters: [],
      constraints: [],
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    }
  );

  // Update existing interfaces to inherit from IComponent
  const movable = metadata.typeSystem.genericTypes.find(t => t.name === 'IMovable');
  const damageable = metadata.typeSystem.genericTypes.find(t => t.name === 'IDamageable');
  if (movable) movable.interfaces = ['IComponent'];
  if (damageable) damageable.interfaces = ['IComponent'];

  return metadata;
}

function createGenericTypeTestMetadata(): IL2CPPMetadata {
  const metadata = createMockIL2CPPMetadata();
  metadata.typeSystem.genericTypes = [
    {
      name: 'List<T>',
      namespace: 'System.Collections.Generic',
      typeDefIndex: 1,
      genericParameters: ['T'],
      constraints: ['T : class'],
      interfaces: ['IEnumerable<T>'],
      isGenericDefinition: true,
      isGenericInstance: false
    },
    {
      name: 'List<System.String>',
      namespace: 'System.Collections.Generic',
      typeDefIndex: 2,
      genericParameters: [],
      constraints: [],
      interfaces: ['IEnumerable<System.String>'],
      isGenericDefinition: false,
      isGenericInstance: true
    }
  ];
  return metadata;
}

function createConstrainedGenericTestMetadata(): IL2CPPMetadata {
  const metadata = createGenericTypeTestMetadata();
  metadata.typeSystem.genericTypes.push({
    name: 'Repository<T>',
    namespace: 'Game',
    typeDefIndex: 3,
    genericParameters: ['T'],
    constraints: ['T : IEntity', 'T : new()'],
    interfaces: [],
    isGenericDefinition: true,
    isGenericInstance: false
  });
  return metadata;
}

function createDependencyTestMetadata(): IL2CPPMetadata {
  return createInheritanceTestMetadata();
}

function createComplexDependencyTestMetadata(): IL2CPPMetadata {
  const metadata = createDependencyTestMetadata();
  // Add more complex dependencies
  for (let i = 0; i < 10; i++) {
    metadata.typeSystem.genericTypes.push({
      name: `TestClass${i}`,
      namespace: 'Test',
      typeDefIndex: 10 + i,
      genericParameters: [],
      constraints: [],
      baseType: i > 0 ? `Test.TestClass${i-1}` : 'System.Object',
      interfaces: [`ITest${i}`],
      isGenericDefinition: false,
      isGenericInstance: false
    });
  }
  return metadata;
}

function createCircularDependencyTestMetadata(): IL2CPPMetadata {
  const metadata = createMockIL2CPPMetadata();
  metadata.typeSystem.genericTypes = [
    {
      name: 'ClassA',
      namespace: 'Test',
      typeDefIndex: 1,
      genericParameters: [],
      constraints: [],
      baseType: 'Test.ClassB',
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    },
    {
      name: 'ClassB',
      namespace: 'Test',
      typeDefIndex: 2,
      genericParameters: [],
      constraints: [],
      baseType: 'Test.ClassA',
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    }
  ];
  return metadata;
}

function createSeverityTestMetadata(): IL2CPPMetadata {
  const metadata = createCircularDependencyTestMetadata();
  // Add a longer circular dependency chain (lower severity)
  metadata.typeSystem.genericTypes.push(
    {
      name: 'ClassC',
      namespace: 'Test',
      typeDefIndex: 3,
      genericParameters: [],
      constraints: [],
      baseType: 'Test.ClassD',
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    },
    {
      name: 'ClassD',
      namespace: 'Test',
      typeDefIndex: 4,
      genericParameters: [],
      constraints: [],
      baseType: 'Test.ClassE',
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    },
    {
      name: 'ClassE',
      namespace: 'Test',
      typeDefIndex: 5,
      genericParameters: [],
      constraints: [],
      baseType: 'Test.ClassC',
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    }
  );
  return metadata;
}

function createCompatibilityTestMetadata(): IL2CPPMetadata {
  return createInheritanceTestMetadata();
}

function createGenericCompatibilityTestMetadata(): IL2CPPMetadata {
  return createGenericTypeTestMetadata();
}

function createEmptyMetadata(): IL2CPPMetadata {
  return createMockIL2CPPMetadata();
}

function createMalformedMetadata(): IL2CPPMetadata {
  const metadata = createMockIL2CPPMetadata();
  metadata.typeSystem.genericTypes = [
    {
      name: '',
      namespace: '',
      typeDefIndex: -1,
      genericParameters: [],
      constraints: [],
      interfaces: [],
      isGenericDefinition: false,
      isGenericInstance: false
    }
  ];
  return metadata;
}

function createLargeTypeSystemMetadata(): IL2CPPMetadata {
  const metadata = createMockIL2CPPMetadata();
  metadata.typeSystem.genericTypes = [];

  // Create 200 types for performance testing
  for (let i = 0; i < 200; i++) {
    metadata.typeSystem.genericTypes.push({
      name: `LargeTestClass${i}`,
      namespace: 'LargeTest',
      typeDefIndex: i + 1,
      genericParameters: [],
      constraints: [],
      baseType: i > 0 ? `LargeTest.LargeTestClass${Math.floor(i/2)}` : 'System.Object',
      interfaces: [`ILargeTest${i % 10}`],
      isGenericDefinition: false,
      isGenericInstance: false
    });
  }

  return metadata;
}
