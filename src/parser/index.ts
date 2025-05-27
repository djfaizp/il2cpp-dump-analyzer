// Enhanced IL2CPP Parser - Main Export File

// Core enhanced parser
export { EnhancedIL2CPPParser } from './enhanced-il2cpp-parser';

// Original parser for backward compatibility
export { IL2CPPDumpParser } from './il2cpp-parser';

// Core types
export type {
  IL2CPPClass,
  IL2CPPField,
  IL2CPPMethod,
  IL2CPPParameter,
  IL2CPPEnum,
  IL2CPPInterface,
  EnhancedParseResult,
  ParseStatistics
} from './parser';

export {
  initializeParser,
  parseIL2CPPDump
} from './parser';

/**
 * Enhanced IL2CPP Parser Library
 *
 * This library provides comprehensive parsing capabilities for IL2CPP dump.cs files
 * with support for:
 *
 * - Real IL2CPP dump format parsing (TypeDefIndex, RVA/Offset)
 * - Attribute parsing and metadata extraction
 * - Generic types and nested classes
 * - MonoBehaviour detection
 * - Comprehensive error handling and statistics
 *
 * Usage Example:
 * ```typescript
 * import { EnhancedIL2CPPParser } from './parser';
 *
 * const parser = new EnhancedIL2CPPParser();
 * await parser.loadFile('dump.cs');
 * const result = parser.extractAllConstructs();
 *
 * console.log(`Found ${result.statistics.totalConstructs} constructs`);
 * console.log(`Classes: ${result.classes.length}`);
 * console.log(`Enums: ${result.enums.length}`);
 * console.log(`Interfaces: ${result.interfaces.length}`);
 * ```
 *
 * Key Features:
 *
 * 1. **Real Format Support**: Handles actual IL2CPP dump.cs format with
 *    TypeDefIndex, RVA, Offset, and image mappings.
 *
 * 2. **Attribute Parsing**: Extracts attributes like [Serializable],
 *    [CreateAssetMenu], [SerializeField], etc.
 *
 * 3. **Generic Support**: Parses generic methods and classes with
 *    constraint information.
 *
 * 4. **MonoBehaviour Detection**: Automatically identifies MonoBehaviour
 *    classes for Unity-specific analysis.
 *
 * 5. **Comprehensive Statistics**: Provides detailed parsing statistics
 *    and error reporting.
 */

// Import for internal use
import { EnhancedIL2CPPParser } from './enhanced-il2cpp-parser';

// Utility functions for common operations
export class IL2CPPParserUtils {
  /**
   * Quick parse function for simple use cases
   */
  static async quickParse(filePath: string) {
    const parser = new EnhancedIL2CPPParser();
    await parser.loadFile(filePath);
    return parser.extractAllConstructs();
  }

  /**
   * Get only classes from a dump file
   */
  static async extractClasses(filePath: string) {
    const result = await this.quickParse(filePath);
    return result.classes;
  }

  /**
   * Get only enums from a dump file
   */
  static async extractEnums(filePath: string) {
    const result = await this.quickParse(filePath);
    return result.enums;
  }

  /**
   * Get only interfaces from a dump file
   */
  static async extractInterfaces(filePath: string) {
    const result = await this.quickParse(filePath);
    return result.interfaces;
  }

  /**
   * Get only MonoBehaviour classes from a dump file
   */
  static async extractMonoBehaviours(filePath: string) {
    const result = await this.quickParse(filePath);
    return result.classes.filter(cls => cls.isMonoBehaviour);
  }

  /**
   * Get parsing statistics
   */
  static async getStatistics(filePath: string) {
    const result = await this.quickParse(filePath);
    return result.statistics;
  }

  /**
   * Get image mappings from dump file
   */
  static async getImageMappings(filePath: string) {
    const result = await this.quickParse(filePath);
    return result.imageMappings;
  }
}