import * as fs from 'fs';
import * as path from 'path';
import { IL2CPPClass, IL2CPPEnum, IL2CPPField, IL2CPPInterface, IL2CPPMethod, IL2CPPParameter } from './parser';

/**
 * Specialized parser for IL2CPP dump.cs files that handles the specific format
 * and patterns found in IL2CPP decompiled code.
 */
export class IL2CPPDumpParser {
  private content: string = '';
  protected lines: string[] = [];
  private imageMap: Map<number, string> = new Map();

  /**
   * Load and parse an IL2CPP dump.cs file
   * @param filePath Path to the dump.cs file
   */
  public async loadFile(filePath: string): Promise<void> {
    this.content = fs.readFileSync(filePath, 'utf8');
    this.lines = this.content.split('\n');

    // Parse the image map (DLL references) at the beginning of the file
    this.parseImageMap();
  }

  /**
   * Parse the image map at the beginning of the file
   * These are the DLL references in the format:
   * // Image 0: holo-game.dll - 0
   */
  private parseImageMap(): void {
    const imageRegex = /\/\/ Image (\d+): ([^-]+) - (\d+)/;

    for (const line of this.lines) {
      const match = line.match(imageRegex);
      if (match) {
        const imageIndex = parseInt(match[1]);
        const imageName = match[2].trim();
        const offset = parseInt(match[3]);
        this.imageMap.set(imageIndex, imageName);
      } else if (line.trim().startsWith('// Namespace:')) {
        // Stop once we reach the first namespace declaration
        break;
      }
    }
  }

  /**
   * Extract all classes from the IL2CPP dump
   */
  public extractClasses(): IL2CPPClass[] {
    const classes: IL2CPPClass[] = [];
    const classRegex = /^(public|internal|private|protected)?\s*(class|struct|sealed class|static class|abstract class)\s+(\w+)(?:\s*:\s*([^{]+))?\s*\/\/\s*TypeDefIndex:\s*(\d+)/;

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

      // Look for class declarations
      const classMatch = line.match(classRegex);
      if (classMatch) {
        const accessModifier = classMatch[1] || 'internal';
        const classType = classMatch[2];
        const className = classMatch[3];
        const inheritance = classMatch[4] || '';
        const typeDefIndex = parseInt(classMatch[5]);

        // Find the class body (everything between the opening and closing braces)
        let braceCount = 0;
        let startLine = i;
        let endLine = i;

        // Find the opening brace
        while (endLine < this.lines.length && !this.lines[endLine].includes('{')) {
          endLine++;
        }

        if (endLine < this.lines.length) {
          braceCount = 1;
          endLine++;

          // Find the matching closing brace
          while (endLine < this.lines.length && braceCount > 0) {
            const currentLine = this.lines[endLine];
            braceCount += (currentLine.match(/{/g) || []).length;
            braceCount -= (currentLine.match(/}/g) || []).length;
            endLine++;
          }

          // Extract the class body
          const classBody = this.lines.slice(startLine, endLine).join('\n');

          // Parse inheritance
          const baseClass = this.parseBaseClass(inheritance);
          const interfaces = this.parseInterfaces(inheritance);

          // Parse fields and methods
          const fields = this.parseFields(classBody);
          const methods = this.parseMethods(classBody);

          // Determine if this is a MonoBehaviour
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
            typeDefIndex,
            attributes: []
          });

          i = endLine;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }

    return classes;
  }

  /**
   * Extract all enums from the IL2CPP dump
   */
  public extractEnums(): IL2CPPEnum[] {
    const enums: IL2CPPEnum[] = [];
    const enumRegex = /^(public|internal|private|protected)?\s*enum\s+(\w+)(?:\s*:\s*([^{]+))?\s*\/\/\s*TypeDefIndex:\s*(\d+)/;

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

      // Look for enum declarations
      const enumMatch = line.match(enumRegex);
      if (enumMatch) {
        const enumName = enumMatch[2];
        const typeDefIndex = parseInt(enumMatch[4]);

        // Find the enum body
        let braceCount = 0;
        let startLine = i;
        let endLine = i;

        // Find the opening brace
        while (endLine < this.lines.length && !this.lines[endLine].includes('{')) {
          endLine++;
        }

        if (endLine < this.lines.length) {
          braceCount = 1;
          endLine++;

          // Find the matching closing brace
          while (endLine < this.lines.length && braceCount > 0) {
            const currentLine = this.lines[endLine];
            braceCount += (currentLine.match(/{/g) || []).length;
            braceCount -= (currentLine.match(/}/g) || []).length;
            endLine++;
          }

          // Extract the enum body
          const enumBody = this.lines.slice(startLine, endLine).join('\n');

          // Parse enum values
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
    }

    return enums;
  }

  // Helper methods for parsing class components
  protected parseBaseClass(inheritance: string): string | undefined {
    if (!inheritance) return undefined;

    // In C#, the first type after the colon is the base class (if any)
    const types = inheritance.split(',').map(t => t.trim());

    // Check if the first type is an interface (starts with I and has PascalCase)
    const firstType = types[0];
    if (firstType && !this.isInterface(firstType)) {
      return firstType;
    }

    return undefined;
  }

  protected parseInterfaces(inheritance: string): string[] {
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

  protected isInterface(typeName: string): boolean {
    // Heuristic: interfaces in C# typically start with 'I' and use PascalCase
    return typeName.startsWith('I') &&
           typeName.length > 1 &&
           typeName[1] === typeName[1].toUpperCase();
  }

  /**
   * Parse fields from the class body
   * @param classBody The full class body text
   * @returns Array of parsed IL2CPP fields
   */
  protected parseFields(classBody: string): IL2CPPField[] {
    const fields: IL2CPPField[] = [];
    const lines = classBody.split('\n');

    // Regular expression to match field declarations in IL2CPP dump
    // Format: [attributes] [access_modifier] [static] [readonly] type name; // offset
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

        // Parse attributes
        const attributes = this.parseAttributes(attributesStr);

        fields.push({
          name,
          type,
          isPublic: accessModifier === 'public',
          isStatic,
          isReadOnly,
          attributes,
          offset
        });
      }
    }

    return fields;
  }

  /**
   * Parse methods from the class body
   * @param classBody The full class body text
   * @returns Array of parsed IL2CPP methods
   */
  protected parseMethods(classBody: string): IL2CPPMethod[] {
    const methods: IL2CPPMethod[] = [];
    const lines = classBody.split('\n');

    // Regular expression to match method declarations in IL2CPP dump
    // Format: [attributes] [access_modifier] [static] [virtual] [override] [abstract] return_type name(parameters); // RVA: offset
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

        // Parse attributes and parameters
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
          offset
        });
      }
    }

    return methods;
  }

  /**
   * Parse enum values from the enum body
   * @param enumBody The full enum body text
   * @returns Array of enum value pairs
   */
  protected parseEnumValues(enumBody: string): { name: string; value: string }[] {
    const values: { name: string; value: string }[] = [];
    const lines = enumBody.split('\n');

    // Regular expression to match enum value declarations
    // Format: public const EnumName VALUE = value;
    const enumValueRegex = /^\s*public\s+const\s+\w+\s+(\w+)\s*=\s*([^;]+);/;

    for (const line of lines) {
      const match = line.match(enumValueRegex);
      if (match) {
        const name = match[1];
        const value = match[2].trim();
        values.push({ name, value });
      }
    }

    return values;
  }

  /**
   * Parse attributes from attribute string
   * @param attributesStr String containing attributes in square brackets
   * @returns Array of attribute names
   */
  protected parseAttributes(attributesStr: string): string[] {
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
   * Parse method parameters
   * @param parametersStr String containing method parameters
   * @returns Array of parsed parameters
   */
  protected parseParameters(parametersStr: string): IL2CPPParameter[] {
    if (!parametersStr) return [];

    const parameters: IL2CPPParameter[] = [];
    const paramParts = parametersStr.split(',');

    for (const part of paramParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Split by last space to separate type and name
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
