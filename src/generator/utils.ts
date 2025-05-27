/**
 * Utility functions for IL2CPP code generation
 * Provides common functionality for naming conventions, formatting, and validation
 */

import {
  FileNamingConvention,
  CodeStyleOptions,
  ValidationResult,
  SyntaxError as GenerationSyntaxError,
  TypeResolver,
  GenerationUtils
} from './types';

/**
 * Implementation of GenerationUtils interface
 */
export class CodeGenerationUtils implements GenerationUtils {

  /**
   * Convert string to specified naming convention
   */
  toNamingConvention(str: string, convention: FileNamingConvention): string {
    // Handle camelCase and PascalCase input by splitting on capital letters
    const splitOnCaps = str.replace(/([a-z])([A-Z])/g, '$1 $2');

    // Clean the input string and split into words
    const cleaned = splitOnCaps.replace(/[^a-zA-Z0-9]/g, ' ').trim();
    const words = cleaned.split(/\s+/).filter(word => word.length > 0);

    if (words.length === 0) return str;

    switch (convention) {
      case FileNamingConvention.PASCAL_CASE:
        return words.map(word => this.capitalize(word)).join('');

      case FileNamingConvention.CAMEL_CASE:
        return words[0].toLowerCase() + words.slice(1).map(word => this.capitalize(word)).join('');

      case FileNamingConvention.SNAKE_CASE:
        return words.map(word => word.toLowerCase()).join('_');

      case FileNamingConvention.KEBAB_CASE:
        return words.map(word => word.toLowerCase()).join('-');

      default:
        return str;
    }
  }

  /**
   * Generate XML documentation comment
   */
  generateXmlDoc(description: string, parameters?: string[], returns?: string): string {
    let xmlDoc = '/// <summary>\n';
    xmlDoc += `/// ${description}\n`;
    xmlDoc += '/// </summary>\n';

    if (parameters && parameters.length > 0) {
      for (const param of parameters) {
        xmlDoc += `/// <param name="${param}">Parameter description</param>\n`;
      }
    }

    if (returns) {
      xmlDoc += `/// <returns>${returns}</returns>\n`;
    }

    return xmlDoc;
  }

  /**
   * Format code according to style options
   */
  formatCode(code: string, style: CodeStyleOptions): string {
    let formatted = code;

    // Handle line endings
    formatted = formatted.replace(/\r?\n/g, style.lineEnding);

    // Handle indentation
    const lines = formatted.split(style.lineEnding);
    let indentLevel = 0;
    const indentString = style.indentation === 'spaces'
      ? ' '.repeat(style.indentSize)
      : '\t'.repeat(style.indentSize);

    const formattedLines = lines.map(line => {
      const trimmed = line.trim();

      // Decrease indent for closing braces
      if (trimmed.startsWith('}')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      // Apply indentation
      const indentedLine = trimmed.length > 0
        ? indentString.repeat(indentLevel) + trimmed
        : '';

      // Increase indent for opening braces
      if (trimmed.endsWith('{')) {
        indentLevel++;
      }

      return indentedLine;
    });

    formatted = formattedLines.join(style.lineEnding);

    // Handle brace style
    if (style.braceStyle === 'new_line') {
      formatted = formatted.replace(/\s*{\s*/g, style.lineEnding + '{' + style.lineEnding);
    } else {
      formatted = formatted.replace(/\s*{\s*/g, ' {' + style.lineEnding);
    }

    // Handle line length (basic implementation)
    if (style.maxLineLength > 0) {
      const wrappedLines = formatted.split(style.lineEnding).map(line => {
        if (line.length <= style.maxLineLength) {
          return line;
        }
        // Simple line wrapping - could be enhanced
        return this.wrapLine(line, style.maxLineLength, indentString);
      });
      formatted = wrappedLines.join(style.lineEnding);
    }

    return formatted;
  }

  /**
   * Validate generated C# code syntax (basic implementation)
   */
  validateCSharpSyntax(code: string): ValidationResult {
    const errors: GenerationSyntaxError[] = [];
    const warnings: string[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for basic syntax issues
      this.checkBraceBalance(line, lineNumber, errors);
      this.checkSemicolons(line, lineNumber, errors);
      this.checkKeywords(line, lineNumber, warnings);
      this.checkNamingConventions(line, lineNumber, warnings);
    }

    // Check overall brace balance
    this.checkOverallBraceBalance(code, errors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Capitalize first letter of a word
   */
  private capitalize(word: string): string {
    if (word.length === 0) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  /**
   * Wrap long lines
   */
  private wrapLine(line: string, maxLength: number, indentString: string): string {
    if (line.length <= maxLength) return line;

    // Find good break points (after commas, before operators, etc.)
    const breakPoints = [',', '&&', '||', '+', '-', '*', '/', '='];
    let bestBreak = -1;

    for (let i = maxLength - 1; i >= maxLength / 2; i--) {
      const char = line.charAt(i);
      if (breakPoints.includes(char)) {
        bestBreak = i + 1;
        break;
      }
    }

    if (bestBreak === -1) {
      bestBreak = maxLength;
    }

    const firstPart = line.substring(0, bestBreak).trimEnd();
    const secondPart = line.substring(bestBreak).trimStart();

    if (secondPart.length === 0) {
      return firstPart;
    }

    return firstPart + '\n' + indentString + secondPart;
  }

  /**
   * Check brace balance in a line
   */
  private checkBraceBalance(line: string, lineNumber: number, errors: GenerationSyntaxError[]): void {
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;

    // This is a simple check - more sophisticated parsing would be needed for production
    if (openBraces > 1 || closeBraces > 1) {
      errors.push({
        message: 'Multiple braces on single line may indicate syntax error',
        line: lineNumber,
        column: line.indexOf('{') !== -1 ? line.indexOf('{') + 1 : line.indexOf('}') + 1,
        severity: 'warning'
      });
    }
  }

  /**
   * Check for missing semicolons
   */
  private checkSemicolons(line: string, lineNumber: number, errors: GenerationSyntaxError[]): void {
    const trimmed = line.trim();

    // Lines that should end with semicolon
    const shouldEndWithSemicolon = /^(var|int|string|bool|float|double|decimal|public|private|protected|internal)\s+.*[^{};]$/.test(trimmed);

    if (shouldEndWithSemicolon && !trimmed.endsWith(';') && !trimmed.endsWith('{')) {
      errors.push({
        message: 'Statement may be missing semicolon',
        line: lineNumber,
        column: trimmed.length,
        severity: 'error'
      });
    }
  }

  /**
   * Check for C# keyword usage
   */
  private checkKeywords(line: string, lineNumber: number, warnings: string[]): void {
    const csharpKeywords = [
      'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked',
      'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else',
      'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for',
      'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is',
      'lock', 'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override',
      'params', 'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte',
      'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch',
      'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe',
      'ushort', 'using', 'virtual', 'void', 'volatile', 'while'
    ];

    // Check for potential keyword misuse (basic check)
    const words = line.split(/\s+/);
    for (const word of words) {
      const cleanWord = word.replace(/[^a-zA-Z]/g, '');
      if (csharpKeywords.includes(cleanWord.toLowerCase()) && cleanWord !== cleanWord.toLowerCase()) {
        warnings.push(`Line ${lineNumber}: Potential keyword casing issue: ${cleanWord}`);
      }
    }
  }

  /**
   * Check naming conventions
   */
  private checkNamingConventions(line: string, lineNumber: number, warnings: string[]): void {
    // Check for PascalCase class names
    const classMatch = line.match(/class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (classMatch) {
      const className = classMatch[1];
      if (!/^[A-Z][a-zA-Z0-9]*$/.test(className)) {
        warnings.push(`Line ${lineNumber}: Class name '${className}' should use PascalCase`);
      }
    }

    // Check for camelCase method names
    const methodMatch = line.match(/(public|private|protected|internal)\s+.*\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    if (methodMatch) {
      const methodName = methodMatch[2];
      if (!/^[A-Z][a-zA-Z0-9]*$/.test(methodName)) {
        warnings.push(`Line ${lineNumber}: Method name '${methodName}' should use PascalCase`);
      }
    }
  }

  /**
   * Check overall brace balance in code
   */
  private checkOverallBraceBalance(code: string, errors: GenerationSyntaxError[]): void {
    let braceCount = 0;
    let lineNumber = 1;

    for (const char of code) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount < 0) {
          errors.push({
            message: 'Unmatched closing brace',
            line: lineNumber,
            column: 1,
            severity: 'error'
          });
          return;
        }
      } else if (char === '\n') {
        lineNumber++;
      }
    }

    if (braceCount > 0) {
      errors.push({
        message: `${braceCount} unmatched opening brace(s)`,
        line: lineNumber,
        column: 1,
        severity: 'error'
      });
    }
  }
}

/**
 * Implementation of TypeResolver interface for IL2CPP types
 */
export class IL2CPPTypeResolver implements TypeResolver {
  private typeMap: Map<string, string> = new Map();
  private unityTypes: Set<string> = new Set();

  constructor() {
    this.initializeTypeMappings();
    this.initializeUnityTypes();
  }

  /**
   * Resolve IL2CPP type to C# type
   */
  resolveType(il2cppType: string): string {
    // Handle generic types
    if (il2cppType.includes('<') && il2cppType.includes('>')) {
      return this.resolveGenericType(il2cppType, []);
    }

    // Handle array types
    if (il2cppType.endsWith('[]')) {
      const baseType = il2cppType.slice(0, -2);
      return `${this.resolveType(baseType)}[]`;
    }

    // Direct mapping
    return this.typeMap.get(il2cppType) || il2cppType;
  }

  /**
   * Check if type is Unity-specific
   */
  isUnityType(type: string): boolean {
    return this.unityTypes.has(type) || type.startsWith('Unity.');
  }

  /**
   * Get using statements for type
   */
  getUsingsForType(type: string): string[] {
    const usings: string[] = [];

    if (this.isUnityType(type)) {
      usings.push('using UnityEngine;');
    }

    if (type.includes('System.')) {
      usings.push('using System;');
    }

    if (type.includes('Collections')) {
      usings.push('using System.Collections.Generic;');
    }

    return [...new Set(usings)]; // Remove duplicates
  }

  /**
   * Resolve generic type parameters
   */
  resolveGenericType(type: string, genericArgs: string[]): string {
    // Basic generic type resolution
    const baseType = type.split('<')[0];
    const resolvedBase = this.resolveType(baseType);

    if (genericArgs.length > 0) {
      const resolvedArgs = genericArgs.map(arg => this.resolveType(arg));
      return `${resolvedBase}<${resolvedArgs.join(', ')}>`;
    }

    return type;
  }

  /**
   * Initialize IL2CPP to C# type mappings
   */
  private initializeTypeMappings(): void {
    // Basic type mappings
    this.typeMap.set('System.Void', 'void');
    this.typeMap.set('System.Boolean', 'bool');
    this.typeMap.set('System.Byte', 'byte');
    this.typeMap.set('System.SByte', 'sbyte');
    this.typeMap.set('System.Int16', 'short');
    this.typeMap.set('System.UInt16', 'ushort');
    this.typeMap.set('System.Int32', 'int');
    this.typeMap.set('System.UInt32', 'uint');
    this.typeMap.set('System.Int64', 'long');
    this.typeMap.set('System.UInt64', 'ulong');
    this.typeMap.set('System.Single', 'float');
    this.typeMap.set('System.Double', 'double');
    this.typeMap.set('System.Decimal', 'decimal');
    this.typeMap.set('System.Char', 'char');
    this.typeMap.set('System.String', 'string');
    this.typeMap.set('System.Object', 'object');
  }

  /**
   * Initialize Unity-specific types
   */
  private initializeUnityTypes(): void {
    const unityTypes = [
      'GameObject', 'Transform', 'Component', 'MonoBehaviour', 'ScriptableObject',
      'Vector2', 'Vector3', 'Vector4', 'Quaternion', 'Color', 'Rect', 'Bounds',
      'Camera', 'Light', 'Renderer', 'MeshRenderer', 'SkinnedMeshRenderer',
      'Collider', 'BoxCollider', 'SphereCollider', 'CapsuleCollider', 'MeshCollider',
      'Rigidbody', 'Rigidbody2D', 'AudioSource', 'AudioClip', 'Texture', 'Texture2D',
      'Material', 'Shader', 'Mesh', 'Animation', 'Animator', 'AnimationClip'
    ];

    unityTypes.forEach(type => this.unityTypes.add(type));
  }
}
