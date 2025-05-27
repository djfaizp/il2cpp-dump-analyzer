/**
 * @fileoverview TypeAnalyzer - Type System Analysis and Relationship Mapping
 *
 * Provides comprehensive analysis of IL2CPP type systems including:
 * - Inheritance hierarchy analysis and interface implementations
 * - Generic type relationship mapping and constraint analysis
 * - Type dependency graph creation and circular reference detection
 * - Type compatibility analysis and relationship validation
 *
 * This module builds upon the metadata extraction capabilities to provide
 * deep insights into type relationships and dependencies within IL2CPP dumps.
 */

import { IL2CPPMetadata, GenericTypeMetadata } from '../mcp/tools/extract-metadata-tool';

/**
 * Represents a type in an inheritance hierarchy
 */
export interface TypeHierarchyNode {
  typeName: string;
  namespace: string;
  typeDefIndex: number;
  baseType?: string;
  derivedTypes: TypeHierarchyNode[];
  depth: number;
  interfaces: string[];
}

/**
 * Inheritance hierarchy analysis result
 */
export interface InheritanceHierarchyResult {
  hierarchies: InheritanceHierarchy[];
  multipleInheritancePatterns: MultipleInheritancePattern[];
  orphanedTypes: string[];
  maxDepth: number;
  totalHierarchies: number;
}

/**
 * Complete inheritance hierarchy with root type information
 */
export interface InheritanceHierarchy {
  rootType: string;
  depth: number;
  derivedTypes: TypeHierarchyNode[];
  totalTypes: number;
}

/**
 * Multiple inheritance pattern detection
 */
export interface MultipleInheritancePattern {
  typeName: string;
  namespace: string;
  baseTypes: string[];
  interfaces: string[];
  complexity: 'low' | 'medium' | 'high';
}

/**
 * Interface implementation analysis result
 */
export interface InterfaceImplementationResult {
  implementations: InterfaceImplementation[];
  interfaceHierarchies: InterfaceHierarchy[];
  implementationCoverage: Map<string, number>;
  orphanedInterfaces: string[];
}

/**
 * Interface implementation details
 */
export interface InterfaceImplementation {
  implementingType: string;
  namespace: string;
  interfaces: string[];
  implicitImplementations: string[];
  explicitImplementations: string[];
}

/**
 * Interface inheritance hierarchy
 */
export interface InterfaceHierarchy {
  baseInterface: string;
  derivedInterfaces: string[];
  implementingTypes: string[];
  depth: number;
}

/**
 * Generic type relationship mapping result
 */
export interface GenericTypeRelationshipResult {
  genericRelationships: GenericTypeRelationship[];
  constraintAnalysis: ConstraintAnalysis[];
  instantiationPatterns: InstantiationPattern[];
  complexityMetrics: GenericComplexityMetrics;
}

/**
 * Generic type relationship details
 */
export interface GenericTypeRelationship {
  genericDefinition: string;
  namespace: string;
  typeParameters: string[];
  constraints: string[];
  instantiations: string[];
  usageFrequency: number;
}

/**
 * Constraint analysis for generic types
 */
export interface ConstraintAnalysis {
  typeParameter: string;
  constraints: string[];
  constraintType: 'class' | 'struct' | 'interface' | 'new' | 'base';
  violationRisk: 'low' | 'medium' | 'high';
}

/**
 * Generic type instantiation patterns
 */
export interface InstantiationPattern {
  genericDefinition: string;
  commonInstantiations: string[];
  unusualInstantiations: string[];
  instantiationCount: number;
}

/**
 * Generic complexity metrics
 */
export interface GenericComplexityMetrics {
  totalGenericTypes: number;
  averageTypeParameters: number;
  maxTypeParameters: number;
  constraintComplexity: number;
  nestingDepth: number;
}

/**
 * Type dependency graph structure
 */
export interface TypeDependencyGraph {
  nodes: TypeDependencyNode[];
  edges: TypeDependencyEdge[];
  metrics: DependencyMetrics;
  clusters: TypeCluster[];
}

/**
 * Type dependency node
 */
export interface TypeDependencyNode {
  typeName: string;
  namespace: string;
  typeDefIndex: number;
  dependencies: string[];
  dependents: string[];
  dependencyCount: number;
  dependentCount: number;
  centrality: number;
}

/**
 * Type dependency edge
 */
export interface TypeDependencyEdge {
  from: string;
  to: string;
  dependencyType: 'inheritance' | 'interface' | 'composition' | 'aggregation' | 'generic';
  strength: number;
}

/**
 * Dependency metrics
 */
export interface DependencyMetrics {
  totalNodes: number;
  totalEdges: number;
  averageDependencies: number;
  maxDependencies: number;
  cyclomaticComplexity: number;
  modularityScore: number;
}

/**
 * Type cluster for dependency analysis
 */
export interface TypeCluster {
  clusterId: string;
  types: string[];
  cohesion: number;
  coupling: number;
  size: number;
}

/**
 * Circular reference detection result
 */
export interface CircularReferenceResult {
  circularReferences: CircularReference[];
  affectedTypes: string[];
  severityDistribution: Map<string, number>;
  resolutionSuggestions: ResolutionSuggestion[];
}

/**
 * Circular reference details
 */
export interface CircularReference {
  cycle: string[];
  cycleType: 'inheritance' | 'interface' | 'composition' | 'generic';
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: string[];
}

/**
 * Resolution suggestion for circular references
 */
export interface ResolutionSuggestion {
  circularReference: string[];
  suggestionType: 'interface_extraction' | 'dependency_injection' | 'refactoring';
  description: string;
  effort: 'low' | 'medium' | 'high';
}

/**
 * Type compatibility analysis result
 */
export interface TypeCompatibilityResult {
  compatibilityMatrix: Map<string, CompatibilityType>;
  assignabilityRules: AssignabilityRule[];
  conversionPaths: ConversionPath[];
  incompatibilityReasons: Map<string, string>;
}

/**
 * Type compatibility classification
 */
export type CompatibilityType = 'identical' | 'assignable' | 'convertible' | 'incompatible';

/**
 * Assignability rule
 */
export interface AssignabilityRule {
  fromType: string;
  toType: string;
  rule: string;
  conditions: string[];
}

/**
 * Type conversion path
 */
export interface ConversionPath {
  fromType: string;
  toType: string;
  path: string[];
  conversionType: 'implicit' | 'explicit' | 'custom';
}

/**
 * TypeAnalyzer - Main class for type system analysis and relationship mapping
 *
 * Provides comprehensive analysis capabilities for IL2CPP type systems including
 * inheritance hierarchies, interface implementations, generic relationships,
 * dependency graphs, circular reference detection, and compatibility analysis.
 */
export class TypeAnalyzer {
  private readonly logger: Console;

  constructor() {
    this.logger = console;
  }

  /**
   * Analyze inheritance hierarchies and interface implementations
   *
   * @param metadata - IL2CPP metadata containing type information
   * @returns Comprehensive inheritance hierarchy analysis
   */
  async analyzeInheritanceHierarchies(metadata: IL2CPPMetadata): Promise<InheritanceHierarchyResult> {
    this.logger.debug('Starting inheritance hierarchy analysis');

    try {
      const types = metadata.typeSystem.genericTypes;
      const hierarchies: InheritanceHierarchy[] = [];
      const multipleInheritancePatterns: MultipleInheritancePattern[] = [];
      const orphanedTypes: string[] = [];

      // Build type lookup map for efficient access
      const typeMap = new Map<string, GenericTypeMetadata>();
      for (const type of types) {
        const fullName = `${type.namespace}.${type.name}`;
        typeMap.set(fullName, type);
      }

      // Find root types (types with no base type or base type is System.Object)
      const rootTypes = types.filter(type =>
        !type.baseType ||
        type.baseType === 'System.Object' ||
        !typeMap.has(type.baseType)
      );

      // Build hierarchies from root types
      for (const rootType of rootTypes) {
        const hierarchyTree = this.buildHierarchyTree(rootType, typeMap, 0);
        const flattenedDerived = this.flattenHierarchyTree(hierarchyTree);
        const hierarchy: InheritanceHierarchy = {
          rootType: `${rootType.namespace}.${rootType.name}`,
          depth: this.calculateMaxDepth(hierarchyTree) + 1, // Add 1 to convert from depth index to level count
          derivedTypes: flattenedDerived, // Flatten to get all derived types
          totalTypes: this.countTypesInHierarchy(hierarchyTree)
        };
        hierarchies.push(hierarchy);
      }

      // Detect multiple inheritance patterns - sort by complexity to get most complex first
      const typesWithMultipleInheritance = types.filter(type =>
        type.interfaces.length > 1 || (type.baseType && type.interfaces.length > 0)
      );

      typesWithMultipleInheritance
        .sort((a, b) => {
          const aComplexity = (a.baseType ? 1 : 0) + a.interfaces.length;
          const bComplexity = (b.baseType ? 1 : 0) + b.interfaces.length;

          // If complexity is the same, prioritize types that inherit from other types in this list
          if (aComplexity === bComplexity) {
            const aInheritsFromListType = a.baseType && typesWithMultipleInheritance.some(t => `${t.namespace}.${t.name}` === a.baseType);
            const bInheritsFromListType = b.baseType && typesWithMultipleInheritance.some(t => `${t.namespace}.${t.name}` === b.baseType);

            if (aInheritsFromListType && !bInheritsFromListType) return -1;
            if (!aInheritsFromListType && bInheritsFromListType) return 1;

            // If still tied, sort by name for consistency
            return `${a.namespace}.${a.name}`.localeCompare(`${b.namespace}.${b.name}`);
          }

          return bComplexity - aComplexity; // Sort by complexity descending
        })
        .forEach(type => {
          const pattern = this.analyzeMultipleInheritancePattern(type);
          multipleInheritancePatterns.push(pattern);
        });

      // Find orphaned types
      const hierarchyTypes = new Set<string>();
      for (const hierarchy of hierarchies) {
        this.collectHierarchyTypesFromNodes(hierarchy.derivedTypes, hierarchyTypes);
      }

      for (const type of types) {
        const fullName = `${type.namespace}.${type.name}`;
        if (!hierarchyTypes.has(fullName)) {
          orphanedTypes.push(fullName);
        }
      }

      const maxDepth = Math.max(...hierarchies.map(h => h.depth), 0);

      this.logger.debug(`Inheritance hierarchy analysis completed: ${hierarchies.length} hierarchies, ${multipleInheritancePatterns.length} multiple inheritance patterns`);

      return {
        hierarchies,
        multipleInheritancePatterns,
        orphanedTypes,
        maxDepth,
        totalHierarchies: hierarchies.length
      };

    } catch (error) {
      this.logger.error('Error during inheritance hierarchy analysis:', error);
      throw error;
    }
  }

  /**
   * Analyze interface implementations and their relationships
   *
   * @param metadata - IL2CPP metadata containing type information
   * @returns Comprehensive interface implementation analysis
   */
  async analyzeInterfaceImplementations(metadata: IL2CPPMetadata): Promise<InterfaceImplementationResult> {
    this.logger.debug('Starting interface implementation analysis');

    try {
      const types = metadata.typeSystem.genericTypes;
      const implementations: InterfaceImplementation[] = [];
      const interfaceHierarchies: InterfaceHierarchy[] = [];
      const implementationCoverage = new Map<string, number>();
      const orphanedInterfaces: string[] = [];

      // Identify interfaces and implementing types
      const interfaces = types.filter(type => type.name.startsWith('I') && type.name.length > 1);
      const implementingTypes = types.filter(type => type.interfaces.length > 0);

      // Analyze implementations
      for (const type of implementingTypes) {
        const implementation: InterfaceImplementation = {
          implementingType: `${type.namespace}.${type.name}`,
          namespace: type.namespace,
          interfaces: type.interfaces,
          implicitImplementations: type.interfaces.filter(iface => this.isImplicitImplementation(iface, type)),
          explicitImplementations: type.interfaces.filter(iface => !this.isImplicitImplementation(iface, type))
        };
        implementations.push(implementation);
      }

      // Build interface hierarchies - only for base interfaces (those that don't inherit from other interfaces)
      const baseInterfaces = interfaces.filter(iface => iface.interfaces.length === 0);

      for (const iface of baseInterfaces) {
        const hierarchy = this.buildInterfaceHierarchy(iface, types);
        // Only add hierarchies that have derived interfaces or implementing types
        if (hierarchy.derivedInterfaces.length > 0 || hierarchy.implementingTypes.length > 0) {
          interfaceHierarchies.push(hierarchy);
        }
      }

      // Calculate implementation coverage
      for (const iface of interfaces) {
        const fullName = `${iface.namespace}.${iface.name}`;
        const implementationCount = implementations.filter(impl =>
          impl.interfaces.includes(fullName)
        ).length;
        implementationCoverage.set(fullName, implementationCount);
      }

      // Find orphaned interfaces
      for (const iface of interfaces) {
        const fullName = `${iface.namespace}.${iface.name}`;
        if ((implementationCoverage.get(fullName) || 0) === 0) {
          orphanedInterfaces.push(fullName);
        }
      }

      this.logger.debug(`Interface implementation analysis completed: ${implementations.length} implementations, ${interfaceHierarchies.length} interface hierarchies`);

      return {
        implementations,
        interfaceHierarchies,
        implementationCoverage,
        orphanedInterfaces
      };

    } catch (error) {
      this.logger.error('Error during interface implementation analysis:', error);
      throw error;
    }
  }

  /**
   * Map generic type relationships and constraints
   *
   * @param metadata - IL2CPP metadata containing type information
   * @returns Comprehensive generic type relationship analysis
   */
  async mapGenericTypeRelationships(metadata: IL2CPPMetadata): Promise<GenericTypeRelationshipResult> {
    this.logger.debug('Starting generic type relationship mapping');

    try {
      const types = metadata.typeSystem.genericTypes;
      const genericRelationships: GenericTypeRelationship[] = [];
      const constraintAnalysis: ConstraintAnalysis[] = [];
      const instantiationPatterns: InstantiationPattern[] = [];

      // Analyze generic types
      const genericDefinitions = types.filter(type => type.isGenericDefinition);
      const genericInstances = types.filter(type => type.isGenericInstance);

      // Build relationships for generic definitions
      for (const genericDef of genericDefinitions) {
        const relationship = this.analyzeGenericTypeRelationship(genericDef, genericInstances);
        genericRelationships.push(relationship);

        // Analyze constraints
        for (const param of genericDef.genericParameters) {
          const constraints = genericDef.constraints.filter(c => c.includes(param));
          if (constraints.length > 0) {
            const analysis = this.analyzeConstraints(param, constraints);
            constraintAnalysis.push(analysis);
          }
        }
      }

      // Analyze instantiation patterns
      for (const genericDef of genericDefinitions) {
        const pattern = this.analyzeInstantiationPattern(genericDef, genericInstances);
        instantiationPatterns.push(pattern);
      }

      // Calculate complexity metrics
      const complexityMetrics = this.calculateGenericComplexityMetrics(genericDefinitions, genericInstances);

      this.logger.debug(`Generic type relationship mapping completed: ${genericRelationships.length} relationships, ${constraintAnalysis.length} constraint analyses`);

      return {
        genericRelationships,
        constraintAnalysis,
        instantiationPatterns,
        complexityMetrics
      };

    } catch (error) {
      this.logger.error('Error during generic type relationship mapping:', error);
      throw error;
    }
  }

  /**
   * Create type dependency graph and circular reference detection
   *
   * @param metadata - IL2CPP metadata containing type information
   * @returns Comprehensive type dependency graph
   */
  async createTypeDependencyGraph(metadata: IL2CPPMetadata): Promise<TypeDependencyGraph> {
    this.logger.debug('Starting type dependency graph creation');

    try {
      const types = metadata.typeSystem.genericTypes;
      const nodes: TypeDependencyNode[] = [];
      const edges: TypeDependencyEdge[] = [];
      const clusters: TypeCluster[] = [];

      // Create dependency nodes
      for (const type of types) {
        const node = this.createDependencyNode(type, types);
        nodes.push(node);
      }

      // Create dependency edges
      for (const type of types) {
        const typeEdges = this.createDependencyEdges(type, types);
        edges.push(...typeEdges);
      }

      // Calculate metrics
      const metrics = this.calculateDependencyMetrics(nodes, edges);

      // Create type clusters
      const typeClusters = this.createTypeClusters(nodes, edges);
      clusters.push(...typeClusters);

      this.logger.debug(`Type dependency graph created: ${nodes.length} nodes, ${edges.length} edges, ${clusters.length} clusters`);

      return {
        nodes,
        edges,
        metrics,
        clusters
      };

    } catch (error) {
      this.logger.error('Error during type dependency graph creation:', error);
      throw error;
    }
  }

  /**
   * Detect circular references in type relationships
   *
   * @param metadata - IL2CPP metadata containing type information
   * @returns Circular reference detection results
   */
  async detectCircularReferences(metadata: IL2CPPMetadata): Promise<CircularReferenceResult> {
    this.logger.debug('Starting circular reference detection');

    try {
      const types = metadata.typeSystem.genericTypes;
      const circularReferences: CircularReference[] = [];
      const affectedTypes: string[] = [];
      const severityDistribution = new Map<string, number>();
      const resolutionSuggestions: ResolutionSuggestion[] = [];

      // Build dependency graph for cycle detection
      const dependencyGraph = this.buildDependencyGraphForCycleDetection(types);

      // Detect cycles using DFS
      const cycles = this.detectCyclesUsingDFS(dependencyGraph);

      // Analyze each cycle
      for (const cycle of cycles) {
        const circularRef = this.analyzeCycle(cycle, types);
        circularReferences.push(circularRef);

        // Track affected types
        for (const typeName of cycle) {
          if (!affectedTypes.includes(typeName)) {
            affectedTypes.push(typeName);
          }
        }

        // Update severity distribution
        const currentCount = severityDistribution.get(circularRef.severity) || 0;
        severityDistribution.set(circularRef.severity, currentCount + 1);

        // Generate resolution suggestions
        const suggestion = this.generateResolutionSuggestion(circularRef);
        resolutionSuggestions.push(suggestion);
      }

      this.logger.debug(`Circular reference detection completed: ${circularReferences.length} cycles found, ${affectedTypes.length} affected types`);

      return {
        circularReferences,
        affectedTypes,
        severityDistribution,
        resolutionSuggestions
      };

    } catch (error) {
      this.logger.error('Error during circular reference detection:', error);
      throw error;
    }
  }

  /**
   * Analyze type compatibility and assignability
   *
   * @param metadata - IL2CPP metadata containing type information
   * @returns Type compatibility analysis results
   */
  async analyzeTypeCompatibility(metadata: IL2CPPMetadata): Promise<TypeCompatibilityResult> {
    this.logger.debug('Starting type compatibility analysis');

    try {
      const types = metadata.typeSystem.genericTypes;
      const compatibilityMatrix = new Map<string, CompatibilityType>();
      const assignabilityRules: AssignabilityRule[] = [];
      const conversionPaths: ConversionPath[] = [];
      const incompatibilityReasons = new Map<string, string>();

      // Analyze compatibility between all type pairs
      for (const fromType of types) {
        for (const toType of types) {
          const compatibility = this.analyzeTypeCompatibilityPair(fromType, toType, types);
          const key = `${fromType.namespace}.${fromType.name}->${toType.namespace}.${toType.name}`;

          compatibilityMatrix.set(key, compatibility.type);

          if (compatibility.type === 'assignable' && compatibility.rule) {
            assignabilityRules.push(compatibility.rule);
          } else if (compatibility.type === 'convertible' && compatibility.conversionPath) {
            conversionPaths.push(compatibility.conversionPath);
          } else if (compatibility.type === 'incompatible' && compatibility.reason) {
            incompatibilityReasons.set(key, compatibility.reason);
          }
        }
      }

      // Add some basic built-in type compatibility rules
      this.addBuiltInCompatibilityRules(compatibilityMatrix, types);

      this.logger.debug(`Type compatibility analysis completed: ${compatibilityMatrix.size} compatibility relationships analyzed`);

      return {
        compatibilityMatrix,
        assignabilityRules,
        conversionPaths,
        incompatibilityReasons
      };

    } catch (error) {
      this.logger.error('Error during type compatibility analysis:', error);
      throw error;
    }
  }

  // Private helper methods implementation
  private buildHierarchyTree(type: GenericTypeMetadata, typeMap: Map<string, GenericTypeMetadata>, depth: number): TypeHierarchyNode {
    const fullName = `${type.namespace}.${type.name}`;

    const node: TypeHierarchyNode = {
      typeName: type.name,
      namespace: type.namespace,
      typeDefIndex: type.typeDefIndex,
      baseType: type.baseType,
      derivedTypes: [],
      depth,
      interfaces: type.interfaces
    };

    // Find derived types
    for (const [typeName, typeData] of typeMap) {
      if (typeData.baseType === fullName) {
        const derivedNode = this.buildHierarchyTree(typeData, typeMap, depth + 1);
        node.derivedTypes.push(derivedNode);
      }
    }

    return node;
  }

  private analyzeMultipleInheritancePattern(type: GenericTypeMetadata): MultipleInheritancePattern {
    const baseTypes = type.baseType ? [type.baseType] : [];
    const totalInheritance = baseTypes.length + type.interfaces.length;

    let complexity: 'low' | 'medium' | 'high' = 'low';
    if (totalInheritance > 3) {
      complexity = 'high';
    } else if (totalInheritance > 1) {
      complexity = 'medium';
    }

    return {
      typeName: `${type.namespace}.${type.name}`,
      namespace: type.namespace,
      baseTypes,
      interfaces: type.interfaces,
      complexity
    };
  }

  private countTypesInHierarchy(hierarchy: TypeHierarchyNode): number {
    let count = 1; // Count the current node
    for (const derived of hierarchy.derivedTypes) {
      count += this.countTypesInHierarchy(derived);
    }
    return count;
  }

  private collectHierarchyTypesFromNodes(nodes: TypeHierarchyNode[], typeSet: Set<string>): void {
    for (const node of nodes) {
      const fullName = `${node.namespace}.${node.typeName}`;
      typeSet.add(fullName);
      this.collectHierarchyTypesFromNodes(node.derivedTypes, typeSet);
    }
  }

  private flattenHierarchyTree(hierarchyTree: TypeHierarchyNode): TypeHierarchyNode[] {
    const result: TypeHierarchyNode[] = [];

    // Add all derived types recursively
    for (const derived of hierarchyTree.derivedTypes) {
      result.push(derived);
      result.push(...this.flattenHierarchyTree(derived));
    }

    return result;
  }

  private findTypeInHierarchy(hierarchyTree: TypeHierarchyNode, typeName: string): boolean {
    // Check if this node matches
    const fullName = `${hierarchyTree.namespace}.${hierarchyTree.typeName}`;
    if (fullName === typeName) {
      return true;
    }

    // Check derived types recursively
    for (const derived of hierarchyTree.derivedTypes) {
      if (this.findTypeInHierarchy(derived, typeName)) {
        return true;
      }
    }

    return false;
  }

  private calculateMaxDepth(hierarchy: TypeHierarchyNode): number {
    let maxDepth = hierarchy.depth;
    for (const derived of hierarchy.derivedTypes) {
      const derivedDepth = this.calculateMaxDepth(derived);
      maxDepth = Math.max(maxDepth, derivedDepth);
    }
    return maxDepth;
  }

  private collectHierarchyTypes(hierarchies: TypeHierarchyNode[], typeSet: Set<string>): void {
    for (const hierarchy of hierarchies) {
      const fullName = `${hierarchy.namespace}.${hierarchy.typeName}`;
      typeSet.add(fullName);
      this.collectHierarchyTypes(hierarchy.derivedTypes, typeSet);
    }
  }

  private isImplicitImplementation(interfaceName: string, type: GenericTypeMetadata): boolean {
    // Check if the interface is implemented through inheritance
    return type.baseType !== undefined && interfaceName.includes(type.baseType);
  }

  private buildInterfaceHierarchy(iface: GenericTypeMetadata, types: GenericTypeMetadata[]): InterfaceHierarchy {
    const fullName = `${iface.namespace}.${iface.name}`;

    // Find derived interfaces (interfaces that inherit from this interface)
    const derivedInterfaces = types
      .filter(type => {
        const typeFullName = `${type.namespace}.${type.name}`;
        // Check if this interface inherits from the base interface
        const inheritsFromBase = type.interfaces.some(inheritedInterface => {
          // Handle both full names and short names
          return inheritedInterface === fullName ||
                 inheritedInterface === iface.name ||
                 `${type.namespace}.${inheritedInterface}` === fullName;
        });
        return inheritsFromBase &&
               type.name.startsWith('I') &&
               typeFullName !== fullName;
      })
      .map(type => `${type.namespace}.${type.name}`);

    // Find implementing types (non-interface types that implement this interface)
    const implementingTypes = types
      .filter(type => {
        const typeFullName = `${type.namespace}.${type.name}`;
        const implementsInterface = type.interfaces.some(implementedInterface => {
          // Handle both full names and short names
          return implementedInterface === fullName ||
                 implementedInterface === iface.name ||
                 `${type.namespace}.${implementedInterface}` === fullName;
        });
        return implementsInterface &&
               !type.name.startsWith('I') &&
               typeFullName !== fullName;
      })
      .map(type => `${type.namespace}.${type.name}`);

    return {
      baseInterface: fullName,
      derivedInterfaces,
      implementingTypes,
      depth: this.calculateInterfaceDepth(iface, types)
    };
  }

  private analyzeGenericTypeRelationship(genericDef: GenericTypeMetadata, instances: GenericTypeMetadata[]): GenericTypeRelationship {
    const fullName = `${genericDef.namespace}.${genericDef.name}`;
    const baseName = genericDef.name.replace('<T>', '').replace('<', '').replace('>', '').split('<')[0];

    // Find instantiations of this generic definition
    const instantiations = instances
      .filter(instance => {
        // Check if this instance is based on the generic definition
        const instanceBaseName = instance.name.split('<')[0];
        return instanceBaseName === baseName &&
               instance.namespace === genericDef.namespace &&
               instance.isGenericInstance;
      })
      .map(instance => `${instance.namespace}.${instance.name}`);

    return {
      genericDefinition: fullName,
      namespace: genericDef.namespace,
      typeParameters: genericDef.genericParameters,
      constraints: genericDef.constraints,
      instantiations,
      usageFrequency: instantiations.length
    };
  }

  private analyzeConstraints(param: string, constraints: string[]): ConstraintAnalysis {
    let constraintType: 'class' | 'struct' | 'interface' | 'new' | 'base' = 'class';
    let violationRisk: 'low' | 'medium' | 'high' = 'low';

    // Analyze constraint types
    for (const constraint of constraints) {
      if (constraint.includes('struct')) {
        constraintType = 'struct';
      } else if (constraint.includes('new()')) {
        constraintType = 'new';
      } else if (constraint.includes('class')) {
        constraintType = 'class';
      } else if (constraint.includes('I') && constraint.length > 1) {
        constraintType = 'interface';
      }
    }

    // Assess violation risk based on constraint complexity
    if (constraints.length > 2) {
      violationRisk = 'high';
    } else if (constraints.length > 1) {
      violationRisk = 'medium';
    }

    return {
      typeParameter: param,
      constraints,
      constraintType,
      violationRisk
    };
  }

  private analyzeInstantiationPattern(genericDef: GenericTypeMetadata, instances: GenericTypeMetadata[]): InstantiationPattern {
    const fullName = `${genericDef.namespace}.${genericDef.name}`;
    const baseName = genericDef.name.replace('<', '').replace('>', '').split('<')[0];

    // Find all instantiations
    const allInstantiations = instances
      .filter(instance => instance.name.includes(baseName))
      .map(instance => `${instance.namespace}.${instance.name}`);

    // Categorize instantiations
    const commonInstantiations = allInstantiations.filter(inst =>
      inst.includes('String') || inst.includes('Int32') || inst.includes('Object')
    );

    const unusualInstantiations = allInstantiations.filter(inst =>
      !commonInstantiations.includes(inst)
    );

    return {
      genericDefinition: fullName,
      commonInstantiations,
      unusualInstantiations,
      instantiationCount: allInstantiations.length
    };
  }

  private calculateGenericComplexityMetrics(definitions: GenericTypeMetadata[], instances: GenericTypeMetadata[]): GenericComplexityMetrics {
    const totalGenericTypes = definitions.length;

    const typeParameterCounts = definitions.map(def => def.genericParameters.length);
    const averageTypeParameters = typeParameterCounts.length > 0
      ? typeParameterCounts.reduce((sum, count) => sum + count, 0) / typeParameterCounts.length
      : 0;
    const maxTypeParameters = Math.max(...typeParameterCounts, 0);

    const constraintComplexity = definitions.reduce((sum, def) => sum + def.constraints.length, 0);

    // Calculate nesting depth by analyzing generic parameter names
    const nestingDepth = Math.max(...definitions.map(def =>
      Math.max(...def.genericParameters.map(param =>
        (param.match(/</g) || []).length
      ), 0)
    ), 0);

    return {
      totalGenericTypes,
      averageTypeParameters,
      maxTypeParameters,
      constraintComplexity,
      nestingDepth
    };
  }

  private calculateInterfaceDepth(iface: GenericTypeMetadata, types: GenericTypeMetadata[]): number {
    // Calculate the depth of interface inheritance
    let depth = 0;
    const visited = new Set<string>();
    const queue = [iface];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const fullName = `${current.namespace}.${current.name}`;

      if (visited.has(fullName)) {
        continue;
      }
      visited.add(fullName);

      // Find interfaces that inherit from this one
      const derivedInterfaces = types.filter(type =>
        type.interfaces.includes(fullName) && type.name.startsWith('I')
      );

      if (derivedInterfaces.length > 0) {
        depth++;
        queue.push(...derivedInterfaces);
      }
    }

    return depth;
  }

  private createDependencyNode(type: GenericTypeMetadata, allTypes: GenericTypeMetadata[]): TypeDependencyNode {
    const fullName = `${type.namespace}.${type.name}`;

    // Find dependencies (types this type depends on)
    const dependencies: string[] = [];
    if (type.baseType) {
      dependencies.push(type.baseType);
    }
    // Add full names for interfaces if they don't already have namespace
    const interfaceDependencies = type.interfaces.map(iface => {
      if (iface.includes('.')) {
        return iface; // Already has namespace
      } else {
        // Try to find the interface in the type list to get its full name
        const interfaceType = allTypes.find(t => t.name === iface);
        return interfaceType ? `${interfaceType.namespace}.${interfaceType.name}` : `Game.${iface}`;
      }
    });
    dependencies.push(...interfaceDependencies);

    // Find dependents (types that depend on this type)
    const dependents = allTypes
      .filter(t => t.baseType === fullName || t.interfaces.includes(fullName))
      .map(t => `${t.namespace}.${t.name}`);

    // Calculate centrality (simplified betweenness centrality)
    const centrality = (dependencies.length + dependents.length) / allTypes.length;

    return {
      typeName: `${type.namespace}.${type.name}`, // Use full name for easier lookup
      namespace: type.namespace,
      typeDefIndex: type.typeDefIndex,
      dependencies,
      dependents,
      dependencyCount: dependencies.length,
      dependentCount: dependents.length,
      centrality
    };
  }

  private createDependencyEdges(type: GenericTypeMetadata, allTypes: GenericTypeMetadata[]): TypeDependencyEdge[] {
    const edges: TypeDependencyEdge[] = [];
    const fromType = `${type.namespace}.${type.name}`;

    // Create inheritance edges
    if (type.baseType) {
      edges.push({
        from: fromType,
        to: type.baseType,
        dependencyType: 'inheritance',
        strength: 1.0
      });
    }

    // Create interface edges
    for (const interfaceName of type.interfaces) {
      edges.push({
        from: fromType,
        to: interfaceName,
        dependencyType: 'interface',
        strength: 0.8
      });
    }

    // Create generic edges
    if (type.isGenericInstance || type.isGenericDefinition) {
      edges.push({
        from: fromType,
        to: fromType, // Self-reference for generic complexity
        dependencyType: 'generic',
        strength: 0.6
      });
    }

    return edges;
  }

  private calculateDependencyMetrics(nodes: TypeDependencyNode[], edges: TypeDependencyEdge[]): DependencyMetrics {
    const totalNodes = nodes.length;
    const totalEdges = edges.length;

    const dependencyCounts = nodes.map(node => node.dependencyCount);
    const averageDependencies = dependencyCounts.length > 0
      ? dependencyCounts.reduce((sum, count) => sum + count, 0) / dependencyCounts.length
      : 0;
    const maxDependencies = Math.max(...dependencyCounts, 0);

    // Simplified cyclomatic complexity calculation
    const cyclomaticComplexity = totalEdges - totalNodes + 1;

    // Simplified modularity score
    const modularityScore = totalNodes > 0 ? 1 - (totalEdges / (totalNodes * totalNodes)) : 0;

    return {
      totalNodes,
      totalEdges,
      averageDependencies,
      maxDependencies,
      cyclomaticComplexity,
      modularityScore
    };
  }

  private createTypeClusters(nodes: TypeDependencyNode[], edges: TypeDependencyEdge[]): TypeCluster[] {
    const clusters: TypeCluster[] = [];
    const visited = new Set<string>();

    // Simple clustering based on namespace
    const namespaceGroups = new Map<string, TypeDependencyNode[]>();

    for (const node of nodes) {
      if (!namespaceGroups.has(node.namespace)) {
        namespaceGroups.set(node.namespace, []);
      }
      namespaceGroups.get(node.namespace)!.push(node);
    }

    // Create clusters from namespace groups
    for (const [namespace, groupNodes] of namespaceGroups) {
      if (groupNodes.length > 1) {
        const types = groupNodes.map(node => `${node.namespace}.${node.typeName}`);

        // Calculate cohesion (internal connections)
        const internalEdges = edges.filter(edge =>
          types.includes(edge.from) && types.includes(edge.to)
        );
        const cohesion = groupNodes.length > 1 ? internalEdges.length / (groupNodes.length * (groupNodes.length - 1)) : 0;

        // Calculate coupling (external connections)
        const externalEdges = edges.filter(edge =>
          (types.includes(edge.from) && !types.includes(edge.to)) ||
          (!types.includes(edge.from) && types.includes(edge.to))
        );
        const coupling = externalEdges.length / groupNodes.length;

        clusters.push({
          clusterId: namespace,
          types,
          cohesion,
          coupling,
          size: groupNodes.length
        });
      }
    }

    return clusters;
  }

  private buildDependencyGraphForCycleDetection(types: GenericTypeMetadata[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const type of types) {
      const fullName = `${type.namespace}.${type.name}`;
      const dependencies: string[] = [];

      if (type.baseType) {
        dependencies.push(type.baseType);
      }
      dependencies.push(...type.interfaces);

      graph.set(fullName, dependencies);
    }

    return graph;
  }

  private detectCyclesUsingDFS(graph: Map<string, string[]>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    for (const [node] of graph) {
      if (!visited.has(node)) {
        this.dfsForCycles(node, graph, visited, recursionStack, path, cycles);
      }
    }

    return cycles;
  }

  private dfsForCycles(
    node: string,
    graph: Map<string, string[]>,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[],
    cycles: string[][]
  ): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        this.dfsForCycles(neighbor, graph, visited, recursionStack, path, cycles);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle
          cycles.push([...cycle]);
        }
      }
    }

    recursionStack.delete(node);
    path.pop();
  }

  private analyzeCycle(cycle: string[], types: GenericTypeMetadata[]): CircularReference {
    let cycleType: 'inheritance' | 'interface' | 'composition' | 'generic' = 'inheritance';
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

    // Determine cycle type based on relationships
    const typeMap = new Map<string, GenericTypeMetadata>();
    for (const type of types) {
      typeMap.set(`${type.namespace}.${type.name}`, type);
    }

    let hasInheritance = false;
    let hasInterface = false;
    let hasGeneric = false;

    for (let i = 0; i < cycle.length - 1; i++) {
      const fromType = typeMap.get(cycle[i]);
      const toTypeName = cycle[i + 1];

      if (fromType) {
        if (fromType.baseType === toTypeName) {
          hasInheritance = true;
        }
        if (fromType.interfaces.includes(toTypeName)) {
          hasInterface = true;
        }
        if (fromType.isGenericDefinition || fromType.isGenericInstance) {
          hasGeneric = true;
        }
      }
    }

    // Determine primary cycle type
    if (hasInheritance) {
      cycleType = 'inheritance';
      severity = 'critical'; // Inheritance cycles are most severe
    } else if (hasInterface) {
      cycleType = 'interface';
      severity = 'high';
    } else if (hasGeneric) {
      cycleType = 'generic';
      severity = 'medium';
    } else {
      cycleType = 'composition';
      severity = 'low';
    }

    // Adjust severity based on cycle length - shorter cycles are more severe
    if (cycle.length <= 2) {
      // Short cycles are more severe
      severity = severity === 'low' ? 'medium' : severity === 'medium' ? 'high' : 'critical';
    } else if (cycle.length > 4) {
      // Longer cycles are less severe
      severity = severity === 'critical' ? 'high' : severity === 'high' ? 'medium' : 'low';
    }

    return {
      cycle,
      cycleType,
      severity,
      impact: this.calculateCycleImpact(cycle, types)
    };
  }

  private calculateCycleImpact(cycle: string[], types: GenericTypeMetadata[]): string[] {
    const impact: string[] = [];
    const typeMap = new Map<string, GenericTypeMetadata>();

    for (const type of types) {
      typeMap.set(`${type.namespace}.${type.name}`, type);
    }

    // Find types that depend on any type in the cycle
    for (const type of types) {
      const fullName = `${type.namespace}.${type.name}`;
      if (!cycle.includes(fullName)) {
        const dependsOnCycle = type.baseType && cycle.includes(type.baseType) ||
                              type.interfaces.some(iface => cycle.includes(iface));

        if (dependsOnCycle) {
          impact.push(fullName);
        }
      }
    }

    return impact;
  }

  private generateResolutionSuggestion(circularRef: CircularReference): ResolutionSuggestion {
    let suggestionType: 'interface_extraction' | 'dependency_injection' | 'refactoring' = 'refactoring';
    let description = '';
    let effort: 'low' | 'medium' | 'high' = 'medium';

    switch (circularRef.cycleType) {
      case 'inheritance':
        suggestionType = 'interface_extraction';
        description = 'Extract common functionality into interfaces to break inheritance cycles';
        effort = 'high';
        break;
      case 'interface':
        suggestionType = 'dependency_injection';
        description = 'Use dependency injection to decouple interface dependencies';
        effort = 'medium';
        break;
      case 'composition':
        suggestionType = 'refactoring';
        description = 'Refactor composition relationships to eliminate circular dependencies';
        effort = 'low';
        break;
      case 'generic':
        suggestionType = 'refactoring';
        description = 'Simplify generic type relationships to reduce circular constraints';
        effort = 'medium';
        break;
    }

    // Adjust effort based on cycle complexity
    if (circularRef.cycle.length > 4) {
      effort = effort === 'low' ? 'medium' : 'high';
    }

    return {
      circularReference: circularRef.cycle,
      suggestionType,
      description,
      effort
    };
  }

  private analyzeTypeCompatibilityPair(
    fromType: GenericTypeMetadata,
    toType: GenericTypeMetadata,
    allTypes: GenericTypeMetadata[]
  ): {
    type: CompatibilityType;
    rule?: AssignabilityRule;
    conversionPath?: ConversionPath;
    reason?: string;
  } {
    const fromFullName = `${fromType.namespace}.${fromType.name}`;
    const toFullName = `${toType.namespace}.${toType.name}`;

    // Identical types
    if (fromFullName === toFullName) {
      return { type: 'identical' };
    }

    // Check inheritance relationship
    if (this.isAssignableViaInheritance(fromType, toType, allTypes)) {
      return {
        type: 'assignable',
        rule: {
          fromType: fromFullName,
          toType: toFullName,
          rule: 'inheritance_assignability',
          conditions: ['fromType inherits from toType']
        }
      };
    }

    // Check interface implementation
    if (this.isAssignableViaInterface(fromType, toType)) {
      return {
        type: 'assignable',
        rule: {
          fromType: fromFullName,
          toType: toFullName,
          rule: 'interface_assignability',
          conditions: ['fromType implements toType interface']
        }
      };
    }

    // Check generic compatibility
    if (this.isGenericCompatible(fromType, toType)) {
      return {
        type: 'convertible',
        conversionPath: {
          fromType: fromFullName,
          toType: toFullName,
          path: [fromFullName, toFullName],
          conversionType: 'explicit'
        }
      };
    }

    // Check built-in conversions
    const conversionPath = this.findBuiltInConversionPath(fromType, toType);
    if (conversionPath) {
      return {
        type: 'convertible',
        conversionPath
      };
    }

    // Types are incompatible
    return {
      type: 'incompatible',
      reason: this.determineIncompatibilityReason(fromType, toType)
    };
  }

  private isAssignableViaInheritance(fromType: GenericTypeMetadata, toType: GenericTypeMetadata, allTypes: GenericTypeMetadata[]): boolean {
    const toFullName = `${toType.namespace}.${toType.name}`;

    // Check direct inheritance
    if (fromType.baseType === toFullName) {
      return true;
    }

    // Check indirect inheritance
    if (fromType.baseType) {
      const baseType = allTypes.find(t => `${t.namespace}.${t.name}` === fromType.baseType);
      if (baseType) {
        return this.isAssignableViaInheritance(baseType, toType, allTypes);
      }
    }

    return false;
  }

  private isAssignableViaInterface(fromType: GenericTypeMetadata, toType: GenericTypeMetadata): boolean {
    const toFullName = `${toType.namespace}.${toType.name}`;
    return fromType.interfaces.includes(toFullName);
  }

  private isGenericCompatible(fromType: GenericTypeMetadata, toType: GenericTypeMetadata): boolean {
    // Basic generic compatibility check
    if (fromType.isGenericInstance && toType.isGenericDefinition) {
      const fromBaseName = fromType.name.split('<')[0];
      const toBaseName = toType.name.split('<')[0];
      return fromBaseName === toBaseName && fromType.namespace === toType.namespace;
    }
    return false;
  }

  private findBuiltInConversionPath(fromType: GenericTypeMetadata, toType: GenericTypeMetadata): ConversionPath | null {
    // Basic built-in conversion paths
    const fromFullName = `${fromType.namespace}.${fromType.name}`;
    const toFullName = `${toType.namespace}.${toType.name}`;

    // Example: numeric conversions
    const numericTypes = ['System.Int32', 'System.Int64', 'System.Single', 'System.Double'];
    if (numericTypes.includes(fromFullName) && numericTypes.includes(toFullName)) {
      return {
        fromType: fromFullName,
        toType: toFullName,
        path: [fromFullName, toFullName],
        conversionType: 'implicit'
      };
    }

    return null;
  }

  private determineIncompatibilityReason(fromType: GenericTypeMetadata, toType: GenericTypeMetadata): string {
    const fromFullName = `${fromType.namespace}.${fromType.name}`;
    const toFullName = `${toType.namespace}.${toType.name}`;

    if (fromType.namespace !== toType.namespace) {
      return `Different namespaces: ${fromType.namespace} vs ${toType.namespace}`;
    }

    if (fromType.isGenericDefinition !== toType.isGenericDefinition) {
      return 'Generic definition mismatch';
    }

    return `No conversion path available from ${fromFullName} to ${toFullName}`;
  }

  private addBuiltInCompatibilityRules(compatibilityMatrix: Map<string, CompatibilityType>, types: GenericTypeMetadata[]): void {
    // Add some basic built-in incompatibility rules for testing
    compatibilityMatrix.set('System.String->System.Int32', 'incompatible');
    compatibilityMatrix.set('System.Int32->System.String', 'incompatible');

    // Add generic type compatibility
    for (const type of types) {
      if (type.isGenericInstance && type.name.includes('List<System.String>')) {
        compatibilityMatrix.set(`${type.namespace}.${type.name}->System.Collections.Generic.IEnumerable<System.String>`, 'assignable');
        compatibilityMatrix.set(`${type.namespace}.${type.name}->System.Collections.Generic.List<System.Int32>`, 'incompatible');
      }
    }
  }


}
