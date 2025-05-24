import { IL2CPPField, IL2CPPMethod, IL2CPPParameter } from './enhanced-types';

/**
 * Advanced parser for additional IL2CPP constructs to reach 90% coverage
 */
export class AdvancedParser {

  /**
   * Parse properties from class body
   */
  public parseProperties(classBody: string): IL2CPPProperty[] {
    const properties: IL2CPPProperty[] = [];
    const lines = classBody.split('\n');

    // Look for property declarations
    const propertyRegex = /^\s*((?:\[.*?\]\s*)*)?\s*(public|private|protected|internal)?\s*(static)?\s*(virtual)?\s*(override)?\s*([^\s]+)\s+(\w+)\s*\{\s*(get|set|get;\s*set|set;\s*get).*?\}/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for property pattern
      if (line.includes('{') && (line.includes('get') || line.includes('set'))) {
        const match = line.match(propertyRegex);
        if (match) {
          const attributesStr = match[1] || '';
          const accessModifier = match[2] || 'private';
          const isStatic = !!match[3];
          const isVirtual = !!match[4];
          const isOverride = !!match[5];
          const type = match[6];
          const name = match[7];
          const accessors = match[8];

          const attributes = this.parseAttributes(attributesStr);

          properties.push({
            name,
            type,
            isPublic: accessModifier === 'public',
            isStatic,
            isVirtual,
            isOverride,
            hasGetter: accessors.includes('get'),
            hasSetter: accessors.includes('set'),
            attributes
          });
        }
      }
    }

    return properties;
  }

  /**
   * Parse events from class body
   */
  public parseEvents(classBody: string): IL2CPPEvent[] {
    const events: IL2CPPEvent[] = [];
    const lines = classBody.split('\n');

    // Look for event declarations
    const eventRegex = /^\s*((?:\[.*?\]\s*)*)?\s*(public|private|protected|internal)?\s*(static)?\s*event\s+([^\s]+)\s+(\w+);/;

    for (const line of lines) {
      const match = line.match(eventRegex);
      if (match) {
        const attributesStr = match[1] || '';
        const accessModifier = match[2] || 'private';
        const isStatic = !!match[3];
        const type = match[4];
        const name = match[5];

        const attributes = this.parseAttributes(attributesStr);

        events.push({
          name,
          type,
          isPublic: accessModifier === 'public',
          isStatic,
          attributes
        });
      }
    }

    return events;
  }

  /**
   * Parse constants from class body
   */
  public parseConstants(classBody: string): IL2CPPConstant[] {
    const constants: IL2CPPConstant[] = [];
    const lines = classBody.split('\n');

    // Look for constant declarations
    const constantRegex = /^\s*(public|private|protected|internal)?\s*const\s+([^\s]+)\s+(\w+)\s*=\s*([^;]+);/;

    for (const line of lines) {
      const match = line.match(constantRegex);
      if (match) {
        const accessModifier = match[1] || 'private';
        const type = match[2];
        const name = match[3];
        const value = match[4].trim();

        constants.push({
          name,
          type,
          value,
          isPublic: accessModifier === 'public'
        });
      }
    }

    return constants;
  }

  /**
   * Parse operators from class body
   */
  public parseOperators(classBody: string): IL2CPPOperator[] {
    const operators: IL2CPPOperator[] = [];
    const lines = classBody.split('\n');

    // Look for operator declarations
    const operatorRegex = /^\s*(public|private|protected|internal)?\s*static\s+([^\s]+)\s+operator\s*([^\s\(]+)\s*\(([^\)]*)\)/;

    for (const line of lines) {
      const match = line.match(operatorRegex);
      if (match) {
        const accessModifier = match[1] || 'public';
        const returnType = match[2];
        const operatorSymbol = match[3];
        const parametersStr = match[4];

        const parameters = this.parseParameters(parametersStr);

        operators.push({
          symbol: operatorSymbol,
          returnType,
          parameters,
          isPublic: accessModifier === 'public'
        });
      }
    }

    return operators;
  }

  /**
   * Parse indexers from class body
   */
  public parseIndexers(classBody: string): IL2CPPIndexer[] {
    const indexers: IL2CPPIndexer[] = [];
    const lines = classBody.split('\n');

    // Look for indexer declarations
    const indexerRegex = /^\s*(public|private|protected|internal)?\s*([^\s]+)\s+this\s*\[([^\]]+)\]\s*\{/;

    for (const line of lines) {
      const match = line.match(indexerRegex);
      if (match) {
        const accessModifier = match[1] || 'private';
        const returnType = match[2];
        const parametersStr = match[3];

        const parameters = this.parseParameters(parametersStr);

        indexers.push({
          returnType,
          parameters,
          isPublic: accessModifier === 'public'
        });
      }
    }

    return indexers;
  }

  /**
   * Parse destructors/finalizers from class body
   */
  public parseDestructors(classBody: string): IL2CPPDestructor[] {
    const destructors: IL2CPPDestructor[] = [];
    const lines = classBody.split('\n');

    // Look for destructor declarations
    const destructorRegex = /^\s*~(\w+)\s*\(\s*\)/;

    for (const line of lines) {
      const match = line.match(destructorRegex);
      if (match) {
        const className = match[1];

        destructors.push({
          className,
          name: `~${className}`
        });
      }
    }

    return destructors;
  }

  /**
   * Parse extension methods (static methods with 'this' parameter)
   */
  public parseExtensionMethods(methods: IL2CPPMethod[]): IL2CPPExtensionMethod[] {
    const extensionMethods: IL2CPPExtensionMethod[] = [];

    for (const method of methods) {
      if (method.isStatic && method.parameters.length > 0) {
        const firstParam = method.parameters[0];
        // Check if first parameter might be 'this' parameter (heuristic)
        if (firstParam.type && !firstParam.name.startsWith('_')) {
          extensionMethods.push({
            ...method,
            extendedType: firstParam.type,
            isExtensionMethod: true
          });
        }
      }
    }

    return extensionMethods;
  }

  /**
   * Parse partial class indicators
   */
  public parsePartialClasses(classDeclaration: string): boolean {
    return classDeclaration.includes('partial');
  }

  /**
   * Parse static constructors
   */
  public parseStaticConstructors(methods: IL2CPPMethod[]): IL2CPPMethod[] {
    return methods.filter(method => 
      method.name === '.cctor' || 
      (method.name === '.ctor' && method.isStatic)
    );
  }

  /**
   * Helper method to parse attributes
   */
  private parseAttributes(attributesStr: string): string[] {
    if (!attributesStr) return [];

    const attributes: string[] = [];
    const attrRegex = /\[(.*?)\]/g;
    let match;

    while ((match = attrRegex.exec(attributesStr)) !== null) {
      const attrContent = match[1].trim();
      attributes.push(attrContent);
    }

    return attributes;
  }

  /**
   * Helper method to parse parameters
   */
  private parseParameters(parametersStr: string): IL2CPPParameter[] {
    if (!parametersStr || parametersStr.trim() === '') {
      return [];
    }

    const parameters: IL2CPPParameter[] = [];
    const paramParts = parametersStr.split(',');

    for (const part of paramParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const lastSpaceIndex = trimmed.lastIndexOf(' ');
      if (lastSpaceIndex !== -1) {
        const type = trimmed.substring(0, lastSpaceIndex).trim();
        const name = trimmed.substring(lastSpaceIndex + 1).trim();
        parameters.push({ type, name });
      }
    }

    return parameters;
  }
}

// Additional type definitions for advanced constructs
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