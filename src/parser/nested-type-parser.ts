import { IL2CPPNestedType, IL2CPPField, IL2CPPMethod, IL2CPPParameter } from './enhanced-types';

/**
 * Parser for IL2CPP nested types including compiler-generated types
 */
export class NestedTypeParser {

  /**
   * Parse nested types from class body
   */
  public parseNestedTypes(classBody: string, parentClassName: string, parentNamespace: string): IL2CPPNestedType[] {
    const nestedTypes: IL2CPPNestedType[] = [];
    const lines = classBody.split('\n');
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Look for nested type declarations
      const nestedMatch = this.matchNestedTypeDeclaration(line);
      if (nestedMatch) {
        const nestedTypeInfo = this.extractNestedTypeInfo(lines, i, parentClassName, parentNamespace);
        if (nestedTypeInfo) {
          nestedTypes.push(nestedTypeInfo.nestedType);
          i = nestedTypeInfo.endLine;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
    
    return nestedTypes;
  }

  /**
   * Match nested type declarations
   */
  private matchNestedTypeDeclaration(line: string): RegExpMatchArray | null {
    // Pattern for nested types: access_modifier [sealed] [static] type_kind ParentClass.NestedClass
    const nestedRegex = /^((?:\[.*?\]\s*)*)?\s*(public|private|internal|protected)?\s*(sealed|static)?\s*(class|struct|enum|interface)\s+([^:\s]+\.[^:\s]+)(?:\s*:\s*([^{\/]+))?(?:\s*\/\/\s*TypeDefIndex:\s*(\d+))?/;
    return line.match(nestedRegex);
  }

  /**
   * Extract nested type information including body
   */
  private extractNestedTypeInfo(lines: string[], startIndex: number, parentClassName: string, parentNamespace: string): { nestedType: IL2CPPNestedType; endLine: number } | null {
    const line = lines[startIndex].trim();
    const match = this.matchNestedTypeDeclaration(line);
    
    if (!match) return null;

    const attributesStr = match[1] || '';
    const accessModifier = match[2] || 'private';
    const modifiers = match[3] || '';
    const typeKind = match[4] as 'class' | 'struct' | 'enum' | 'interface';
    const fullName = match[5];
    const inheritance = match[6] || '';
    const typeDefIndex = parseInt(match[7] || '0');

    // Extract nested name from full name
    const nestedName = this.extractNestedName(fullName, parentClassName);
    if (!nestedName) return null;

    // Find the type body
    const bodyInfo = this.extractTypeBody(lines, startIndex);
    if (!bodyInfo) return null;

    // Parse attributes
    const attributes = this.parseAttributes(attributesStr);

    // Determine if compiler generated
    const isCompilerGenerated = this.isCompilerGenerated(attributes, nestedName);
    const compilerGeneratedType = isCompilerGenerated ? this.identifyCompilerGeneratedType(nestedName) : undefined;

    // Parse inheritance
    const baseClass = this.parseBaseClass(inheritance);
    const interfaces = this.parseInterfaces(inheritance);

    // Parse fields and methods
    const fields = this.parseFields(bodyInfo.body);
    const methods = this.parseMethods(bodyInfo.body);

    const nestedType: IL2CPPNestedType = {
      name: nestedName,
      namespace: parentNamespace,
      fullName,
      typeDefIndex,
      isNested: true,
      parentType: parentClassName,
      isCompilerGenerated,
      accessModifier: accessModifier as any,
      attributes,
      nestedLevel: this.calculateNestingLevel(fullName),
      typeKind,
      compilerGeneratedType,
      fields,
      methods,
      baseClass,
      interfaces
    };

    return {
      nestedType,
      endLine: bodyInfo.endLine
    };
  }

  /**
   * Extract nested type name from full name
   */
  private extractNestedName(fullName: string, parentClass: string): string | null {
    if (fullName.startsWith(parentClass + '.')) {
      return fullName.substring(parentClass.length + 1);
    }
    
    // Handle cases where the parent class name might be different
    const dotIndex = fullName.lastIndexOf('.');
    if (dotIndex > 0) {
      return fullName.substring(dotIndex + 1);
    }
    
    return null;
  }

  /**
   * Extract type body (everything between braces)
   */
  private extractTypeBody(lines: string[], startIndex: number): { body: string; endLine: number } | null {
    let braceCount = 0;
    let endLine = startIndex;

    // Find the opening brace
    while (endLine < lines.length && !lines[endLine].includes('{')) {
      endLine++;
    }

    if (endLine >= lines.length) return null;

    braceCount = 1;
    endLine++;

    // Find the matching closing brace
    while (endLine < lines.length && braceCount > 0) {
      const currentLine = lines[endLine];
      braceCount += (currentLine.match(/{/g) || []).length;
      braceCount -= (currentLine.match(/}/g) || []).length;
      endLine++;
    }

    if (braceCount !== 0) return null;

    const body = lines.slice(startIndex, endLine).join('\n');
    return { body, endLine };
  }

  /**
   * Calculate nesting level based on dots in full name
   */
  private calculateNestingLevel(fullName: string): number {
    return (fullName.match(/\./g) || []).length;
  }

  /**
   * Check if type is compiler generated
   */
  private isCompilerGenerated(attributes: string[], name: string): boolean {
    // Check for CompilerGenerated attribute
    if (attributes.some(attr => attr.includes('CompilerGenerated'))) {
      return true;
    }
    
    // Check for compiler-generated naming patterns
    return name.includes('<>') || 
           name.includes('__') ||
           /^[a-z]{2,3}$/.test(name) || // e.g., 'by', 'ca'
           name.includes('DisplayClass') ||
           name.includes('AnonymousType');
  }

  /**
   * Identify the type of compiler-generated class
   */
  private identifyCompilerGeneratedType(name: string): string {
    if (name.includes('<>c')) return 'anonymous_method_container';
    if (name.includes('DisplayClass')) return 'closure_class';
    if (name.includes('<>f__AnonymousType')) return 'anonymous_type';
    if (/^[a-z]{2,3}$/.test(name)) return 'lambda_container'; // e.g., 'by', 'ca'
    if (name.includes('__')) return 'compiler_helper';
    return 'unknown_generated';
  }

  /**
   * Parse base class from inheritance string
   */
  private parseBaseClass(inheritance: string): string | undefined {
    if (!inheritance) return undefined;

    const types = inheritance.split(',').map(t => t.trim());
    const firstType = types[0];
    
    if (firstType && !this.isInterface(firstType)) {
      return firstType;
    }

    return undefined;
  }

  /**
   * Parse interfaces from inheritance string
   */
  private parseInterfaces(inheritance: string): string[] {
    if (!inheritance) return [];

    const types = inheritance.split(',').map(t => t.trim());
    const interfaces: string[] = [];

    // If the first type is a base class, start from index 1
    const startIndex = this.parseBaseClass(inheritance) ? 1 : 0;

    for (let i = startIndex; i < types.length; i++) {
      if (this.isInterface(types[i])) {
        interfaces.push(types[i]);
      }
    }

    return interfaces;
  }

  /**
   * Check if a type name represents an interface
   */
  private isInterface(typeName: string): boolean {
    return typeName.startsWith('I') &&
           typeName.length > 1 &&
           typeName[1] === typeName[1].toUpperCase();
  }

  /**
   * Parse attributes from attribute string
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
   * Parse fields from type body
   */
  private parseFields(typeBody: string): IL2CPPField[] {
    const fields: IL2CPPField[] = [];
    const lines = typeBody.split('\n');

    const fieldRegex = /^\s*((?:\[.*?\]\s*)*)?\s*(public|private|protected|internal)?\s*(static)?\s*(readonly)?\s*([^\s]+)\s+([^\s;]+);(?:\s*\/\/\s*([0-9A-Fx]+))?/;

    for (const line of lines) {
      const match = line.match(fieldRegex);
      if (match) {
        const attributesStr = match[1] || '';
        const accessModifier = match[2] || 'private';
        const isStatic = !!match[3];
        const isReadOnly = !!match[4];
        const type = match[5];
        const name = match[6];
        const offset = match[7] || '';

        const attributes = this.parseAttributes(attributesStr);

        fields.push({
          name,
          type,
          isPublic: accessModifier === 'public',
          isStatic,
          isReadOnly,
          attributes,
          offset,
          isGeneric: this.isGenericType(type)
        });
      }
    }

    return fields;
  }

  /**
   * Parse methods from type body
   */
  private parseMethods(typeBody: string): IL2CPPMethod[] {
    const methods: IL2CPPMethod[] = [];
    const lines = typeBody.split('\n');

    const methodRegex = /^\s*((?:\[.*?\]\s*)*)?\s*(public|private|protected|internal)?\s*(static)?\s*(virtual)?\s*(override)?\s*(abstract)?\s*([^\s\(]+)\s+([^\s\(]+)\s*\(([^\)]*)\);(?:\s*\/\/\s*RVA:\s*([0-9A-Fx]+)\s*Offset:\s*([0-9A-Fx]+))?/;

    for (const line of lines) {
      const match = line.match(methodRegex);
      if (match) {
        const attributesStr = match[1] || '';
        const accessModifier = match[2] || 'private';
        const isStatic = !!match[3];
        const isVirtual = !!match[4];
        const isOverride = !!match[5];
        const isAbstract = !!match[6];
        const returnType = match[7];
        const name = match[8];
        const parametersStr = match[9] || '';
        const rva = match[10] || '';
        const offset = match[11] || '';

        const attributes = this.parseAttributes(attributesStr);
        const parameters = this.parseParameters(parametersStr);

        methods.push({
          name,
          returnType,
          parameters,
          isPublic: accessModifier === 'public',
          isStatic,
          isVirtual,
          isAbstract,
          isOverride,
          attributes,
          rva,
          offset,
          isGeneric: this.isGenericType(returnType) || parameters.some(p => this.isGenericType(p.type))
        });
      }
    }

    return methods;
  }

  /**
   * Parse method parameters
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
        parameters.push({ 
          type, 
          name,
          isGeneric: this.isGenericType(type)
        });
      }
    }

    return parameters;
  }

  /**
   * Check if a type is generic
   */
  private isGenericType(type: string): boolean {
    return type.includes('<') && type.includes('>');
  }
}