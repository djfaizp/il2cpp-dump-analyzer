import {
  IL2CPPGenericType,
  IL2CPPGenericParameter,
  IL2CPPGenericInstantiation,
  IL2CPPField,
  IL2CPPMethod,
  IL2CPPParameter,
  ClassInfo
} from './enhanced-types';

/**
 * Parser for IL2CPP generic types and their instantiations
 */
export class GenericParser {

  /**
   * Parse a generic type from class information
   */
  public parseGenericType(classInfo: ClassInfo): IL2CPPGenericType | null {
    // Check if this is a generic type
    const genericMatch = classInfo.name.match(/^([^<]+)<(.+)>$/);
    if (!genericMatch) {
      return null;
    }

    const baseName = genericMatch[1];
    const typeParametersStr = genericMatch[2];

    // Parse type parameters
    const genericParameters = this.parseGenericParameters(typeParametersStr, classInfo.body);

    // Parse generic instantiations from comments
    const instantiations = this.parseGenericInstantiations(classInfo.body);

    // Parse inheritance
    const baseClass = this.parseBaseClass(classInfo.inheritance);
    const interfaces = this.parseInterfaces(classInfo.inheritance);

    // Parse fields and methods
    const fields = this.parseFields(classInfo.body);
    const methods = this.parseMethods(classInfo.body);

    return {
      name: baseName,
      namespace: this.extractNamespace(classInfo.declaration),
      fullName: classInfo.name,
      typeDefIndex: classInfo.typeDefIndex,
      isNested: classInfo.name.includes('.'),
      parentType: this.extractParentType(classInfo.name),
      isCompilerGenerated: this.isCompilerGenerated(classInfo.attributes),
      accessModifier: classInfo.accessModifier as any,
      attributes: classInfo.attributes,
      genericParameters,
      isGenericDefinition: true,
      isGenericInstance: false,
      instantiations,
      baseClass,
      interfaces,
      fields,
      methods
    };
  }

  /**
   * Parse generic parameters from type parameter string
   */
  private parseGenericParameters(parametersStr: string, classBody: string): IL2CPPGenericParameter[] {
    const parameters: IL2CPPGenericParameter[] = [];
    const paramNames = parametersStr.split(',').map(p => p.trim());

    paramNames.forEach((paramName, index) => {
      const constraints = this.extractConstraints(paramName, classBody);
      const variance = this.extractVariance(paramName, classBody);

      parameters.push({
        name: paramName,
        position: index,
        constraints,
        variance,
        hasReferenceTypeConstraint: constraints.includes('class'),
        hasValueTypeConstraint: constraints.includes('struct'),
        hasDefaultConstructorConstraint: constraints.includes('new()')
      });
    });

    return parameters;
  }

  /**
   * Parse generic instantiations from method comments
   */
  private parseGenericInstantiations(classBody: string): IL2CPPGenericInstantiation[] {
    const instantiations: IL2CPPGenericInstantiation[] = [];

    // Look for GenericInstMethod comments
    const instantiationRegex = /\/\*\s*GenericInstMethod\s*:\s*([\s\S]*?)\*\//g;

    let match;
    while ((match = instantiationRegex.exec(classBody)) !== null) {
      const content = match[1];
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('|-RVA:')) {
          const instMatch = trimmed.match(/\|-RVA:\s*(0x[0-9A-F]+)\s+Offset:\s*(0x[0-9A-F]+)\s+VA:\s*(0x[0-9A-F]+)\s*\|\s*-([^<]+)<([^>]+)>/);
          if (instMatch) {
            const rva = instMatch[1];
            const offset = instMatch[2];
            const virtualAddress = instMatch[3];
            const methodName = instMatch[4];
            const typeArgumentsStr = instMatch[5];

            const typeArguments = typeArgumentsStr.split(',').map(t => t.trim());

            instantiations.push({
              typeArguments,
              rva,
              offset,
              virtualAddress,
              methodName
            });
          }
        }
      }
    }

    return instantiations;
  }

  /**
   * Extract constraints for a generic parameter
   */
  private extractConstraints(paramName: string, classBody: string): string[] {
    // For now, return empty array as constraints are not explicitly shown in IL2CPP dumps
    // In a full implementation, this would analyze the class body for constraint usage
    return [];
  }

  /**
   * Extract variance for a generic parameter
   */
  private extractVariance(paramName: string, classBody: string): 'in' | 'out' | 'none' {
    // For now, return 'none' as variance is not explicitly shown in IL2CPP dumps
    // In a full implementation, this would analyze the parameter usage
    return 'none';
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
   * Parse fields from class body
   */
  private parseFields(classBody: string): IL2CPPField[] {
    const fields: IL2CPPField[] = [];
    const lines = classBody.split('\n');

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
   * Parse methods from class body
   */
  private parseMethods(classBody: string): IL2CPPMethod[] {
    const methods: IL2CPPMethod[] = [];
    const lines = classBody.split('\n');

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();

      // Look for method declarations
      const methodMatch = this.matchMethodDeclaration(line);
      if (methodMatch) {
        const method = this.parseMethodFromMatch(methodMatch, lines, i);
        if (method) {
          methods.push(method);
        }
      }
      i++;
    }

    return methods;
  }

  /**
   * Match method declarations including generic methods
   */
  private matchMethodDeclaration(line: string): RegExpMatchArray | null {
    // Enhanced regex to handle generic methods
    const methodRegex = /^\s*((?:\[.*?\]\s*)*)?\s*(public|private|protected|internal)?\s*(static)?\s*(virtual)?\s*(override)?\s*(abstract)?\s*([^\s\(]+)\s+([^\s\(]+)\s*\(([^\)]*)\)\s*\{\s*\}(?:\s*\/\/.*)?$/;
    return line.match(methodRegex);
  }

  /**
   * Parse method from regex match
   */
  private parseMethodFromMatch(match: RegExpMatchArray, lines: string[], lineIndex: number): IL2CPPMethod | null {
    const attributesStr = match[1] || '';
    const accessModifier = match[2] || 'private';
    const isStatic = !!match[3];
    const isVirtual = !!match[4];
    const isOverride = !!match[5];
    const isAbstract = !!match[6];
    const returnType = match[7];
    const name = match[8];
    const parametersStr = match[9] || '';

    const attributes = this.parseAttributes(attributesStr);
    const parameters = this.parseParameters(parametersStr);

    // Extract RVA and offset from previous line if available
    let rva = '';
    let offset = '';
    let slot = '';

    if (lineIndex > 0) {
      const prevLine = lines[lineIndex - 1].trim();
      const rvaMatch = prevLine.match(/RVA:\s*(0x[0-9A-F]+|(-1))\s+Offset:\s*(0x[0-9A-F]+|(-1))(?:\s+VA:\s*0x[0-9A-F]+)?(?:\s+Slot:\s*(\d+))?/);
      if (rvaMatch) {
        rva = rvaMatch[1];
        offset = rvaMatch[3];
        slot = rvaMatch[5] || '';
      }
    }

    // Check for generic instantiations in following lines
    const genericInstantiations = this.parseMethodGenericInstantiations(lines, lineIndex);

    return {
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
      slot: slot ? parseInt(slot, 10) : undefined,
      isGeneric: this.isGenericType(returnType) || parameters.some(p => this.isGenericType(p.type)),
      genericInstantiations: genericInstantiations.length > 0 ? genericInstantiations : undefined
    };
  }

  /**
   * Parse generic instantiations for a specific method
   */
  private parseMethodGenericInstantiations(lines: string[], startIndex: number): IL2CPPGenericInstantiation[] {
    const instantiations: IL2CPPGenericInstantiation[] = [];
    let i = startIndex + 1;

    // Look for GenericInstMethod comment block
    while (i < lines.length) {
      const line = lines[i].trim();

      if (line.startsWith('/*') && line.includes('GenericInstMethod')) {
        // Found start of generic instantiation block
        i++;
        while (i < lines.length && !lines[i].includes('*/')) {
          const instLine = lines[i].trim();
          if (instLine.startsWith('|-RVA:')) {
            const instMatch = instLine.match(/\|-RVA:\s*(0x[0-9A-F]+)\s+Offset:\s*(0x[0-9A-F]+)\s+VA:\s*(0x[0-9A-F]+)\s*\|\s*-([^<]+)<([^>]+)>/);
            if (instMatch) {
              const rva = instMatch[1];
              const offset = instMatch[2];
              const virtualAddress = instMatch[3];
              const methodName = instMatch[4];
              const typeArgumentsStr = instMatch[5];

              const typeArguments = typeArgumentsStr.split(',').map(t => t.trim());

              instantiations.push({
                typeArguments,
                rva,
                offset,
                virtualAddress,
                methodName
              });
            }
          }
          i++;
        }
        break;
      } else if (line === '' || line.startsWith('//')) {
        // Skip empty lines and comments
        i++;
      } else {
        // Hit another declaration, stop looking
        break;
      }
    }

    return instantiations;
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
   * Check if a type is generic
   */
  private isGenericType(type: string): boolean {
    return type.includes('<') && type.includes('>');
  }

  /**
   * Extract namespace from declaration
   */
  private extractNamespace(declaration: string): string {
    // For now, return empty string as namespace is tracked separately
    return '';
  }

  /**
   * Extract parent type from nested generic type name
   */
  private extractParentType(fullName: string): string | undefined {
    const dotIndex = fullName.lastIndexOf('.');
    if (dotIndex > 0) {
      return fullName.substring(0, dotIndex);
    }
    return undefined;
  }

  /**
   * Check if the type is compiler generated
   */
  private isCompilerGenerated(attributes: string[]): boolean {
    return attributes.some(attr => attr.includes('CompilerGenerated'));
  }
}