import * as fs from 'fs';
import {
  IL2CPPClass,
  IL2CPPEnum,
  IL2CPPInterface,
  IL2CPPField,
  IL2CPPMethod,
  IL2CPPParameter,
  EnhancedParseResult,
  ParseStatistics,
  IL2CPPDelegate,
  IL2CPPGenericType,
  IL2CPPNestedType,
  IL2CPPProperty,
  IL2CPPEvent,
  IL2CPPConstant,
  IL2CPPOperator,
  IL2CPPIndexer,
  IL2CPPDestructor,
  IL2CPPExtensionMethod
} from './enhanced-types';

/**
 * Enhanced IL2CPP Dump Parser
 * Handles real IL2CPP dump format with comprehensive parsing capabilities
 * Supports TypeDefIndex, RVA/Offset, attributes, generic types, and nested classes
 */
export class EnhancedIL2CPPParser {
  private content: string = '';
  private lines: string[] = [];
  private imageMappings: Map<number, string> = new Map();
  private parseErrors: string[] = [];
  private loaded: boolean = false;

  /**
   * Load and parse an IL2CPP dump.cs file
   * @param filePath Path to the dump.cs file
   */
  public async loadFile(filePath: string): Promise<void> {
    try {
      console.log('Reading file:', filePath);
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      console.log('File content type:', typeof fileContent);
      console.log('File content length:', fileContent ? fileContent.length : 'undefined');
      console.log('First 100 chars:', fileContent ? fileContent.substring(0, 100) : 'undefined');

      this.content = fileContent;
      this.lines = this.content.split('\n');
      this.parseErrors = [];
      this.loaded = true;

      // Parse the image map at the beginning of the file
      this.parseImageMappings();
    } catch (error) {
      console.error('Error in loadFile:', error);
      this.parseErrors.push(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Load content directly from string (useful for testing)
   * @param content IL2CPP dump content as string
   */
  public loadContent(content: string): void {
    this.content = content;
    this.lines = this.content.split('\n');
    this.parseErrors = [];
    this.loaded = true;

    // Parse the image map at the beginning of the file
    this.parseImageMappings();
  }

  /**
   * Check if the parser has loaded content
   */
  public isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Reset the parser to a clean state for reuse
   * Clears all loaded content and internal state
   */
  public reset(): void {
    this.content = '';
    this.lines = [];
    this.imageMappings.clear();
    this.parseErrors = [];
    this.loaded = false;
  }

  /**
   * Extract all IL2CPP constructs from the loaded content
   */
  public extractAllConstructs(): EnhancedParseResult {
    if (!this.loaded) {
      throw new Error('Parser not loaded. Call loadFile() first.');
    }

    const classes = this.extractClasses();
    const enums = this.extractEnums();
    const interfaces = this.extractInterfaces();

    // For now, return empty arrays for advanced constructs
    // These will be implemented in future iterations
    const delegates: IL2CPPDelegate[] = [];
    const generics: IL2CPPGenericType[] = [];
    const nestedTypes: IL2CPPNestedType[] = [];
    const properties: IL2CPPProperty[] = [];
    const events: IL2CPPEvent[] = [];
    const constants: IL2CPPConstant[] = [];
    const operators: IL2CPPOperator[] = [];
    const indexers: IL2CPPIndexer[] = [];
    const destructors: IL2CPPDestructor[] = [];
    const extensionMethods: IL2CPPExtensionMethod[] = [];

    const statistics = this.calculateStatistics(
      classes,
      enums,
      interfaces,
      delegates,
      generics,
      nestedTypes,
      properties,
      events,
      constants,
      operators,
      indexers,
      destructors,
      extensionMethods
    );

    return {
      classes,
      enums,
      interfaces,
      delegates,
      generics,
      nestedTypes,
      properties,
      events,
      constants,
      operators,
      indexers,
      destructors,
      extensionMethods,
      imageMappings: this.imageMappings,
      statistics
    };
  }

  /**
   * Parse image mappings from the beginning of the file
   * Format: // Image 0: holo-game.dll - 0
   */
  private parseImageMappings(): void {
    const imageRegex = /\/\/ Image (\d+): (.+?) - (\d+)/;

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const trimmedLine = line.trim();
      const match = trimmedLine.match(imageRegex);
      if (match) {
        const imageIndex = parseInt(match[1]);
        const imageName = match[2].trim();
        this.imageMappings.set(imageIndex, imageName);
      } else if (trimmedLine.startsWith('// Namespace:')) {
        // Stop once we reach the first namespace declaration
        break;
      }
    }

  }

  /**
   * Extract all classes from the IL2CPP dump
   */
  private extractClasses(): IL2CPPClass[] {
    const classes: IL2CPPClass[] = [];

    let currentNamespace = '';
    let i = 0;

    while (i < this.lines.length) {
      const line = this.lines[i].trim();
      // Track namespace declarations
      if (line.startsWith('// Namespace:')) {
        currentNamespace = line.substring('// Namespace:'.length).trim();
        i++;
        continue;
      }

      // Look for class/struct declarations with TypeDefIndex
      // Real format: [Serializable] public struct CustomAttackAnimOverrideConfig.OverrideConfig // TypeDefIndex: 5
      if (line.includes('TypeDefIndex:') && /\b(class|struct|interface)\b/.test(line)) {
        try {
          // Extract TypeDefIndex
          const typeDefMatch = line.match(/TypeDefIndex:\s*(\d+)/);
          const typeDefIndex = typeDefMatch ? parseInt(typeDefMatch[1]) : 0;

          // Look for attributes on preceding lines
          let attributesStr = '';
          let attributeLineIndex = i - 1;
          while (attributeLineIndex >= 0) {
            const prevLine = this.lines[attributeLineIndex].trim();
            if (prevLine.startsWith('[') && prevLine.endsWith(']')) {
              attributesStr = prevLine + ' ' + attributesStr;
              attributeLineIndex--;
            } else if (prevLine === '' || prevLine.startsWith('// Namespace:')) {
              // Stop at empty lines or namespace declarations
              break;
            } else {
              break;
            }
          }

          // Also check for attributes on the same line (inline attributes)
          const inlineAttributeMatch = line.match(/^((?:\[.*?\]\s*)*)/);
          if (inlineAttributeMatch && inlineAttributeMatch[1]) {
            attributesStr = inlineAttributeMatch[1] + ' ' + attributesStr;
          }

          // Parse class declaration - handle the format before the TypeDefIndex comment
          const beforeComment = line.split('//')[0].trim();
          const classMatch = beforeComment.match(/(public|internal|private|protected)?\s*(sealed\s+)?(static\s+)?(abstract\s+)?(class|struct|interface)\s+([^\s:]+)(?:\s*:\s*(.+))?/);

          if (classMatch) {
            const accessModifier = classMatch[1] || 'internal';
            const classType = classMatch[5];
            const className = classMatch[6];
            const inheritance = classMatch[7] ? classMatch[7].trim() : '';

            // Find the class body
            const { startLine, endLine } = this.findClassBody(i);

            if (endLine > startLine) {
              const classBody = this.lines.slice(startLine, endLine).join('\n');

              // Parse class components
              const attributes = this.parseAttributes(attributesStr);
              const baseClass = this.parseBaseClass(inheritance);
              const interfaces = this.parseInterfaces(inheritance);
              const fields = this.parseFields(classBody);
              const methods = this.parseMethods(classBody);

              // Determine class properties
              const isStruct = classType === 'struct';
              const isMonoBehaviour = inheritance.includes('MonoBehaviour');

              classes.push({
                name: className,
                namespace: currentNamespace,
                fullName: currentNamespace ? `${currentNamespace}.${className}` : className,
                baseClass,
                interfaces,
                fields,
                methods,
                isMonoBehaviour,
                isStruct,
                typeDefIndex,
                attributes
              });

              i = endLine;
            } else {
              i++;
            }
          } else {
            i++;
          }
        } catch (error) {
          this.parseErrors.push(`Error parsing class at line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          i++;
        }
      } else {
        // Check for malformed class declarations (class/struct/interface without TypeDefIndex)
        if (/\b(class|struct|interface)\b/.test(line) && !line.includes('TypeDefIndex:')) {
          // This might be a malformed class declaration
          const beforeComment = line.split('//')[0].trim();
          const malformedMatch = beforeComment.match(/(public|internal|private|protected)?\s*(sealed\s+)?(static\s+)?(abstract\s+)?(class|struct|interface)\s*([^\s:]*)/);

          if (malformedMatch) {
            const className = malformedMatch[6];
            if (!className || className.includes('{') || className.includes('}')) {
              this.parseErrors.push(`Malformed class declaration at line ${i + 1}: missing or invalid class name`);
            }
          }
        }

        // Check for malformed method declarations
        if (line.includes('(') && !line.includes(')') && !line.includes('//')) {
          this.parseErrors.push(`Malformed method declaration at line ${i + 1}: missing closing parenthesis`);
        }

        i++;
      }
    }

    return classes;
  }

  /**
   * Extract all enums from the IL2CPP dump
   */
  private extractEnums(): IL2CPPEnum[] {
    const enums: IL2CPPEnum[] = [];

    let currentNamespace = '';
    let i = 0;

    while (i < this.lines.length) {
      const line = this.lines[i].trim();

      // Track namespace declarations
      if (line.startsWith('// Namespace:')) {
        currentNamespace = line.substring('// Namespace:'.length).trim();
        i++;
        continue;
      }

      // Look for enum declarations with TypeDefIndex
      // Real format: public enum CameraFacingBillboardWithConstraints.LockAxis // TypeDefIndex: 7
      if (line.includes('TypeDefIndex:') && /\benum\b/.test(line)) {
        try {
          // Extract TypeDefIndex
          const typeDefMatch = line.match(/TypeDefIndex:\s*(\d+)/);
          const typeDefIndex = typeDefMatch ? parseInt(typeDefMatch[1]) : 0;

          // Parse enum declaration - handle the format before the TypeDefIndex comment
          const beforeComment = line.split('//')[0].trim();
          const enumMatch = beforeComment.match(/(public|internal|private|protected)?\s*enum\s+([^\s]+)/);

          if (enumMatch) {
            const enumName = enumMatch[2];

            // Find the enum body
            const { startLine, endLine } = this.findClassBody(i);

            if (endLine > startLine) {
              const enumBody = this.lines.slice(startLine, endLine).join('\n');
              const values = this.parseEnumValues(enumBody);

              enums.push({
                name: enumName,
                namespace: currentNamespace,
                fullName: currentNamespace ? `${currentNamespace}.${enumName}` : enumName,
                values,
                typeDefIndex
              });

              i = endLine;
            } else {
              i++;
            }
          } else {
            i++;
          }
        } catch (error) {
          this.parseErrors.push(`Error parsing enum at line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          i++;
        }
      } else {
        i++;
      }
    }

    return enums;
  }

  /**
   * Extract all interfaces from the IL2CPP dump
   */
  private extractInterfaces(): IL2CPPInterface[] {
    const interfaces: IL2CPPInterface[] = [];
    const interfaceRegex = /^(public|internal|private|protected)?\s*interface\s+([^\s{]+)\s*\/\/\s*TypeDefIndex:\s*(\d+)/;

    let currentNamespace = '';
    let i = 0;

    while (i < this.lines.length) {
      const line = this.lines[i].trim();

      // Track namespace declarations
      if (line.startsWith('// Namespace:')) {
        currentNamespace = line.substring('// Namespace:'.length).trim();
        i++;
        continue;
      }

      // Look for interface declarations
      const interfaceMatch = line.match(interfaceRegex);
      if (interfaceMatch) {
        try {
          const interfaceName = interfaceMatch[2];
          const typeDefIndex = parseInt(interfaceMatch[3]);

          // Find the interface body
          const { startLine, endLine } = this.findClassBody(i);

          if (endLine > startLine) {
            const interfaceBody = this.lines.slice(startLine, endLine).join('\n');
            const methods = this.parseMethods(interfaceBody);

            interfaces.push({
              name: interfaceName,
              namespace: currentNamespace,
              fullName: currentNamespace ? `${currentNamespace}.${interfaceName}` : interfaceName,
              methods,
              typeDefIndex
            });

            i = endLine;
          } else {
            i++;
          }
        } catch (error) {
          this.parseErrors.push(`Error parsing interface at line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          i++;
        }
      } else {
        i++;
      }
    }

    return interfaces;
  }

  /**
   * Find the body of a class/enum/interface by matching braces
   */
  private findClassBody(startIndex: number): { startLine: number; endLine: number } {
    let braceCount = 0;
    let startLine = startIndex;
    let endLine = startIndex;

    // Find the opening brace
    while (endLine < this.lines.length && !this.lines[endLine].includes('{')) {
      endLine++;
    }

    if (endLine < this.lines.length) {
      const openingLine = this.lines[endLine];

      // Check if both opening and closing braces are on the same line (e.g., "{}")
      const openBraces = (openingLine.match(/{/g) || []).length;
      const closeBraces = (openingLine.match(/}/g) || []).length;

      if (openBraces === closeBraces && openBraces > 0) {
        // Both braces on same line - this is an empty class body
        return { startLine, endLine: endLine + 1 };
      }

      // Normal case: braces on separate lines
      braceCount = openBraces;
      endLine++;

      // Find the matching closing brace
      while (endLine < this.lines.length && braceCount > 0) {
        const currentLine = this.lines[endLine];
        braceCount += (currentLine.match(/{/g) || []).length;
        braceCount -= (currentLine.match(/}/g) || []).length;
        endLine++;
      }
    }

    return { startLine, endLine };
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
      // Extract the attribute name (before any parentheses or parameters)
      const attrName = attrContent.split('(')[0].trim();
      attributes.push(attrName);
    }

    return attributes;
  }

  /**
   * Parse base class from inheritance string
   */
  private parseBaseClass(inheritance: string): string | undefined {
    if (!inheritance) return undefined;

    const parts = inheritance.split(',').map(p => p.trim());
    if (parts.length > 0) {
      const baseClass = parts[0];
      // Filter out interface names (typically start with 'I' and are capitalized)
      if (!baseClass.match(/^I[A-Z]/)) {
        return baseClass;
      }
    }

    return undefined;
  }

  /**
   * Parse interfaces from inheritance string
   */
  private parseInterfaces(inheritance: string): string[] {
    if (!inheritance) return [];

    const parts = inheritance.split(',').map(p => p.trim());
    // Skip the first part if it's a base class, return the rest as interfaces
    return parts.slice(1);
  }

  /**
   * Parse fields from class body
   */
  private parseFields(classBody: string): IL2CPPField[] {
    const fields: IL2CPPField[] = [];
    const lines = classBody.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Skip comments, empty lines, and method declarations
      if (trimmedLine.startsWith('//') || !trimmedLine || trimmedLine.includes('(') || trimmedLine.includes('RVA:')) continue;

      // Field regex for real IL2CPP format: public float pixelScale; // 0x20
      const fieldRegex = /^(public|private|protected|internal)?\s*(static\s+)?(readonly\s+)?([^;]+?)\s+([^;\s]+);\s*\/\/\s*(0x[0-9A-Fa-f]+)/;
      const match = trimmedLine.match(fieldRegex);

      if (match) {
        try {
          // Look for attributes on preceding lines
          let attributesStr = '';
          let attributeLineIndex = i - 1;
          while (attributeLineIndex >= 0) {
            const prevLine = lines[attributeLineIndex].trim();
            if (prevLine.startsWith('[') && prevLine.endsWith(']')) {
              attributesStr = prevLine + ' ' + attributesStr;
              attributeLineIndex--;
            } else if (prevLine === '' || prevLine.startsWith('//')) {
              // Stop at empty lines or comments
              break;
            } else {
              break;
            }
          }

          const accessModifier = match[1] || 'private';
          const isStatic = !!match[2];
          const isReadOnly = !!match[3];
          const fieldType = match[4].trim();
          const fieldName = match[5];
          const offset = match[6];

          const attributes = this.parseAttributes(attributesStr);

          fields.push({
            name: fieldName,
            type: fieldType,
            isPublic: accessModifier === 'public',
            isPrivate: accessModifier === 'private',
            isStatic,
            isReadOnly,
            attributes,
            offset
          });
        } catch (error) {
          this.parseErrors.push(`Error parsing field: ${trimmedLine}`);
        }
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Look for RVA comment lines that indicate method declarations
      // Real format: // RVA: 0x5BE44A0 Offset: 0x5BE34A0 VA: 0x5BE44A0
      const rvaRegex = /^\/\/\s*RVA:\s*(0x[0-9A-Fa-f]+)\s*Offset:\s*(0x[0-9A-Fa-f]+)\s*VA:\s*(0x[0-9A-Fa-f]+)(?:\s*Slot:\s*(\d+))?/;
      const rvaMatch = trimmedLine.match(rvaRegex);

      if (rvaMatch) {
        const rva = rvaMatch[1];
        const offset = rvaMatch[2];
        const slot = rvaMatch[4] ? parseInt(rvaMatch[4]) : undefined;

        // Look for the method declaration on the next line
        if (i + 1 < lines.length) {
          const methodLine = lines[i + 1].trim();

          // Real format: public void .ctor() { }
          // Real format: private void LateUpdate() { }
          // Real format: public T GetComponent<T>() where T : Component { }
          const methodRegex = /^(public|private|protected|internal)?\s*(override\s+)?(static\s+)?(virtual\s+)?(abstract\s+)?([^(]+?)\s+([^(]+)\((.*?)\)\s*(?:where\s+(.+?))?\s*\{/;
          const methodMatch = methodLine.match(methodRegex);

          if (methodMatch) {
            try {
              const accessModifier = methodMatch[1] || 'private';
              const isOverride = !!methodMatch[2];
              const isStatic = !!methodMatch[3];
              const isVirtual = !!methodMatch[4];
              const isAbstract = !!methodMatch[5];
              const returnType = methodMatch[6].trim();
              let methodName = methodMatch[7];
              const parametersStr = methodMatch[8];
              const whereClause = methodMatch[9];

              // Parse generic constraints
              let isGeneric = false;
              let genericConstraints = '';
              if (methodName.includes('<') && methodName.includes('>')) {
                isGeneric = true;
                // Extract the base method name (without generic type parameters)
                methodName = methodName.split('<')[0];
                if (whereClause) {
                  genericConstraints = `where ${whereClause}`;
                }
              }

              const parameters = this.parseParameters(parametersStr);

              methods.push({
                name: methodName,
                returnType,
                parameters,
                isPublic: accessModifier === 'public',
                isPrivate: accessModifier === 'private',
                isStatic,
                isVirtual,
                isAbstract,
                isOverride,
                isGeneric,
                genericConstraints,
                slot,
                attributes: [], // Would need to parse method attributes
                rva,
                offset
              });
            } catch (error) {
              this.parseErrors.push(`Error parsing method: ${methodLine}`);
            }
          }
        }
      }
    }

    return methods;
  }

  /**
   * Parse method parameters
   */
  private parseParameters(parametersStr: string): IL2CPPParameter[] {
    if (!parametersStr || parametersStr.trim() === '') return [];

    const parameters: IL2CPPParameter[] = [];
    const paramParts = parametersStr.split(',');

    for (const part of paramParts) {
      const trimmed = part.trim();
      if (trimmed) {
        const paramRegex = /^([^=]+?)(\s*=\s*(.+))?$/;
        const match = trimmed.match(paramRegex);

        if (match) {
          const typeAndName = match[1].trim();
          const defaultValue = match[3];

          // Split type and name
          const parts = typeAndName.split(/\s+/);
          if (parts.length >= 2) {
            const type = parts.slice(0, -1).join(' ');
            const name = parts[parts.length - 1];

            parameters.push({
              name,
              type
            });
          }
        }
      }
    }

    return parameters;
  }

  /**
   * Parse enum values from enum body
   */
  private parseEnumValues(enumBody: string): Array<{ name: string; value: string }> {
    const values: Array<{ name: string; value: string }> = [];
    const lines = enumBody.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip comments and empty lines
      if (trimmedLine.startsWith('//') || !trimmedLine) continue;

      // Enum value regex: public const EnumType VALUE_NAME = value;
      const enumValueRegex = /^public\s+const\s+[^=]+\s+([^=\s]+)\s*=\s*([^;]+);/;
      const match = trimmedLine.match(enumValueRegex);

      if (match) {
        const name = match[1];
        const value = match[2].trim();
        values.push({ name, value });
      }
    }

    return values;
  }

  /**
   * Calculate comprehensive parsing statistics
   */
  private calculateStatistics(
    classes: IL2CPPClass[],
    enums: IL2CPPEnum[],
    interfaces: IL2CPPInterface[],
    delegates: IL2CPPDelegate[],
    generics: IL2CPPGenericType[],
    nestedTypes: IL2CPPNestedType[],
    properties: IL2CPPProperty[],
    events: IL2CPPEvent[],
    constants: IL2CPPConstant[],
    operators: IL2CPPOperator[],
    indexers: IL2CPPIndexer[],
    destructors: IL2CPPDestructor[],
    extensionMethods: IL2CPPExtensionMethod[]
  ): ParseStatistics {
    const totalConstructs = classes.length + enums.length + interfaces.length +
                           delegates.length + generics.length + nestedTypes.length +
                           properties.length + events.length + constants.length +
                           operators.length + indexers.length + destructors.length +
                           extensionMethods.length;

    const methodCount = classes.reduce((sum, cls) => sum + cls.methods.length, 0) +
                      interfaces.reduce((sum, iface) => sum + iface.methods.length, 0) +
                      generics.reduce((sum, gen) => sum + gen.methods.length, 0) +
                      nestedTypes.reduce((sum, nested) => sum + nested.methods.length, 0) +
                      extensionMethods.length;

    const fieldCount = classes.reduce((sum, cls) => sum + cls.fields.length, 0) +
                      generics.reduce((sum, gen) => sum + gen.fields.length, 0) +
                      nestedTypes.reduce((sum, nested) => sum + nested.fields.length, 0);

    const totalLines = this.lines.length;
    const processedLines = totalLines - this.parseErrors.length;
    const parsingCoverage = totalLines > 0 ? processedLines / totalLines : 0;
    const coveragePercentage = parsingCoverage * 100;

    // Count compiler generated types
    const compilerGeneratedCount = classes.filter(c => c.isCompilerGenerated).length +
                                 delegates.filter(d => d.isCompilerGenerated).length +
                                 generics.filter(g => g.isCompilerGenerated).length +
                                 nestedTypes.filter(n => n.isCompilerGenerated).length;

    return {
      totalConstructs,
      classCount: classes.length,
      enumCount: enums.length,
      interfaceCount: interfaces.length,
      delegateCount: delegates.length,
      genericCount: generics.length,
      nestedTypeCount: nestedTypes.length,
      propertyCount: properties.length,
      eventCount: events.length,
      constantCount: constants.length,
      operatorCount: operators.length,
      indexerCount: indexers.length,
      destructorCount: destructors.length,
      extensionMethodCount: extensionMethods.length,
      compilerGeneratedCount,
      coveragePercentage,
      methodCount,
      fieldCount,
      parseErrors: this.parseErrors.length,
      parsingCoverage
    };
  }
}
