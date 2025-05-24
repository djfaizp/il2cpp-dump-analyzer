// Enhanced type definitions for IL2CPP parsing with support for delegates, nested types, and generics

// Base interface for all IL2CPP constructs
export interface IL2CPPConstruct {
  name: string;
  namespace: string;
  fullName: string;
  typeDefIndex: number;
  isNested: boolean;
  parentType?: string;
  isCompilerGenerated: boolean;
  accessModifier: 'public' | 'private' | 'internal' | 'protected';
  attributes: string[];
}

// Delegate-specific interface
export interface IL2CPPDelegate extends IL2CPPConstruct {
  returnType: string;
  parameters: IL2CPPParameter[];
  isMulticast: boolean;
  invokeMethod: IL2CPPMethod;
  constructorMethod: IL2CPPMethod;
  beginInvokeMethod?: IL2CPPMethod;
  endInvokeMethod?: IL2CPPMethod;
}

// Generic type interface
export interface IL2CPPGenericType extends IL2CPPConstruct {
  genericParameters: IL2CPPGenericParameter[];
  isGenericDefinition: boolean;
  isGenericInstance: boolean;
  genericArguments?: string[];
  instantiations: IL2CPPGenericInstantiation[];
  baseClass?: string;
  interfaces: string[];
  fields: IL2CPPField[];
  methods: IL2CPPMethod[];
}

// Generic parameter interface
export interface IL2CPPGenericParameter {
  name: string;
  position: number;
  constraints: string[];
  variance: 'in' | 'out' | 'none';
  hasReferenceTypeConstraint: boolean;
  hasValueTypeConstraint: boolean;
  hasDefaultConstructorConstraint: boolean;
}

// Generic instantiation tracking
export interface IL2CPPGenericInstantiation {
  typeArguments: string[];
  rva: string;
  offset: string;
  virtualAddress: string;
  methodName: string;
}

// Nested type interface
export interface IL2CPPNestedType extends IL2CPPConstruct {
  nestedLevel: number;
  typeKind: 'class' | 'struct' | 'enum' | 'interface' | 'delegate';
  compilerGeneratedType?: string;
  fields: IL2CPPField[];
  methods: IL2CPPMethod[];
  baseClass?: string;
  interfaces: string[];
}

// Enhanced method interface with generic support
export interface IL2CPPMethod {
  name: string;
  returnType: string;
  parameters: IL2CPPParameter[];
  isPublic: boolean;
  isStatic: boolean;
  isVirtual: boolean;
  isAbstract: boolean;
  isOverride: boolean;
  attributes: string[];
  rva: string;
  offset: string;
  slot?: string;
  isGeneric?: boolean;
  genericParameters?: IL2CPPGenericParameter[];
  genericInstantiations?: IL2CPPGenericInstantiation[];
}

// Enhanced field interface
export interface IL2CPPField {
  name: string;
  type: string;
  isPublic: boolean;
  isStatic: boolean;
  isReadOnly: boolean;
  attributes: string[];
  offset: string;
  isGeneric?: boolean;
}

// Parameter interface
export interface IL2CPPParameter {
  name: string;
  type: string;
  isGeneric?: boolean;
}

// Enhanced parse result
export interface EnhancedParseResult {
  classes: IL2CPPClass[];
  enums: IL2CPPEnum[];
  interfaces: IL2CPPInterface[];
  delegates: IL2CPPDelegate[];
  generics: IL2CPPGenericType[];
  nestedTypes: IL2CPPNestedType[];
  properties: IL2CPPProperty[];
  events: IL2CPPEvent[];
  constants: IL2CPPConstant[];
  operators: IL2CPPOperator[];
  indexers: IL2CPPIndexer[];
  destructors: IL2CPPDestructor[];
  extensionMethods: IL2CPPExtensionMethod[];
  statistics: ParseStatistics;
}

// Parse statistics
export interface ParseStatistics {
  totalConstructs: number;
  classCount: number;
  enumCount: number;
  interfaceCount: number;
  delegateCount: number;
  genericCount: number;
  nestedTypeCount: number;
  propertyCount: number;
  eventCount: number;
  constantCount: number;
  operatorCount: number;
  indexerCount: number;
  destructorCount: number;
  extensionMethodCount: number;
  compilerGeneratedCount: number;
  coveragePercentage: number;
}

// Re-export existing types for compatibility
export interface IL2CPPClass {
  name: string;
  namespace: string;
  fullName: string;
  baseClass?: string;
  interfaces: string[];
  fields: IL2CPPField[];
  methods: IL2CPPMethod[];
  isMonoBehaviour: boolean;
  typeDefIndex: number;
  isNested?: boolean;
  parentType?: string;
  isCompilerGenerated?: boolean;
  accessModifier?: string;
  attributes?: string[];
}

export interface IL2CPPEnum {
  name: string;
  namespace: string;
  fullName: string;
  values: { name: string; value: string }[];
  typeDefIndex: number;
  isNested?: boolean;
  parentType?: string;
  accessModifier?: string;
  attributes?: string[];
}

export interface IL2CPPInterface {
  name: string;
  namespace: string;
  fullName: string;
  methods: IL2CPPMethod[];
  typeDefIndex: number;
  isNested?: boolean;
  parentType?: string;
  accessModifier?: string;
  attributes?: string[];
}

// Additional advanced construct types
export interface IL2CPPProperty {
  name: string;
  type: string;
  isPublic: boolean;
  isStatic: boolean;
  isVirtual: boolean;
  isOverride: boolean;
  hasGetter: boolean;
  hasSetter: boolean;
  attributes: string[];
}

export interface IL2CPPEvent {
  name: string;
  type: string;
  isPublic: boolean;
  isStatic: boolean;
  attributes: string[];
}

export interface IL2CPPConstant {
  name: string;
  type: string;
  value: string;
  isPublic: boolean;
}

export interface IL2CPPOperator {
  symbol: string;
  returnType: string;
  parameters: IL2CPPParameter[];
  isPublic: boolean;
}

export interface IL2CPPIndexer {
  returnType: string;
  parameters: IL2CPPParameter[];
  isPublic: boolean;
}

export interface IL2CPPDestructor {
  className: string;
  name: string;
}

export interface IL2CPPExtensionMethod extends IL2CPPMethod {
  extendedType: string;
  isExtensionMethod: boolean;
}

// Class information for parsing
export interface ClassInfo {
  name: string;
  declaration: string;
  inheritance: string;
  body: string;
  startLine: number;
  endLine: number;
  accessModifier: string;
  typeDefIndex: number;
  attributes: string[];
}