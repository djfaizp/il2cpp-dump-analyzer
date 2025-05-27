/**
 * Extract Metadata Tool Implementation
 * Extracts assembly metadata, version information, and compilation flags from IL2CPP dumps
 * Implements comprehensive metadata parsing with validation and error handling
 */

import { z } from 'zod';
import * as fs from 'fs';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';

/**
 * Assembly metadata information extracted from IL2CPP dumps
 */
export interface AssemblyMetadata {
  name: string;
  version: string;
  culture: string;
  publicKeyToken: string;
  imageName: string;
  imageIndex: number;
  dependencies?: string[];
}

/**
 * Build and compilation information
 */
export interface BuildInformation {
  unityVersion?: string;
  il2cppVersion?: string;
  buildConfiguration?: string;
  targetPlatform?: string;
  scriptingBackend?: string;
  buildFlags?: string[];
}

/**
 * Generic type metadata
 */
export interface GenericTypeMetadata {
  name: string;
  namespace: string;
  typeDefIndex: number;
  genericParameters: string[];
  constraints: string[];
  baseType?: string;
  interfaces: string[];
  isGenericDefinition: boolean;
  isGenericInstance: boolean;
}

/**
 * Type system metadata
 */
export interface TypeSystemMetadata {
  totalTypes: number;
  genericTypes: GenericTypeMetadata[];
}

/**
 * Validation results for metadata extraction
 */
export interface MetadataValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Processing statistics
 */
export interface MetadataStatistics {
  totalAssemblies: number;
  totalTypes: number;
  totalMethods: number;
  totalFields: number;
  processingTime: number;
  memoryUsage: number;
  validationErrors: number;
  validationWarnings: number;
}

/**
 * Complete metadata extraction result
 */
export interface IL2CPPMetadata {
  assemblies: AssemblyMetadata[];
  buildInfo: BuildInformation;
  typeSystem: TypeSystemMetadata;
  validationResults: MetadataValidationResult;
  statistics: MetadataStatistics;
  extractionDate: Date;
  sourceFile?: string;
}

/**
 * Extract metadata tool parameters interface
 */
interface ExtractMetadataParams {
  content?: string;
  file_path?: string;
  include_generic_instantiations?: boolean;
  include_method_signatures?: boolean;
  include_field_offsets?: boolean;
  validate_structure?: boolean;
  enable_performance_tracking?: boolean;
  max_processing_time?: number;
}

/**
 * Extract Metadata Tool Handler
 * Provides comprehensive IL2CPP metadata extraction capabilities
 */
export class ExtractMetadataToolHandler extends BaseAnalysisToolHandler<ExtractMetadataParams, IL2CPPMetadata> {
  private extractionStartTime: number = 0;
  private content: string = '';
  private lines: string[] = [];

  constructor(context: ToolExecutionContext) {
    super({
      name: 'extract_metadata',
      description: 'Extract assembly metadata, version information, and compilation flags from IL2CPP dumps',
      enableParameterValidation: true,
      enableResponseFormatting: true,
      maxExecutionTime: 60000
    }, context);
  }

  /**
   * Validate extract metadata specific parameters
   */
  protected async validateParameters(params: ExtractMetadataParams): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate that either content or file_path is provided
    if (!params.content && !params.file_path) {
      errors.push('Either content or file_path parameter is required');
    }

    if (params.content && params.file_path) {
      warnings.push('Both content and file_path provided, content will be used');
    }

    // Validate file_path if provided
    if (params.file_path && !params.content) {
      try {
        if (!fs.existsSync(params.file_path)) {
          errors.push(`File not found: ${params.file_path}`);
        }
      } catch (error) {
        errors.push(`Invalid file path: ${params.file_path}`);
      }
    }

    // Validate max_processing_time
    if (params.max_processing_time !== undefined) {
      if (params.max_processing_time < 1000 || params.max_processing_time > 300000) {
        adjustedValues.max_processing_time = Math.max(1000, Math.min(300000, params.max_processing_time));
        warnings.push(`max_processing_time adjusted to ${adjustedValues.max_processing_time}ms (valid range: 1000-300000)`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }

  /**
   * Execute the core metadata extraction logic
   */
  protected async executeCore(params: ExtractMetadataParams): Promise<IL2CPPMetadata> {
    return await this.performAnalysis(async () => {
      this.extractionStartTime = Date.now();

      // Load content
      await this.loadContent(params);

      // Validate content
      if (!this.content || this.content.trim().length === 0) {
        throw new Error('IL2CPP dump content is empty or invalid');
      }

      this.lines = this.content.split('\n');

      // Extract all metadata components
      const assemblies = this.extractAssemblyMetadata();
      const buildInfo = this.extractBuildInformation();
      const typeSystem = this.extractTypeSystemMetadata();

      // Validate extracted metadata
      const validationResults = this.validateMetadata(assemblies, typeSystem);

      // Calculate statistics
      const statistics = this.calculateStatistics(assemblies, typeSystem, validationResults);

      // Check processing time limit
      const processingTime = Date.now() - this.extractionStartTime;
      const maxTime = params.max_processing_time || 60000;
      if (processingTime > maxTime) {
        throw new Error(`Metadata extraction exceeded time limit: ${processingTime}ms > ${maxTime}ms`);
      }

      return {
        assemblies,
        buildInfo,
        typeSystem,
        validationResults,
        statistics,
        extractionDate: new Date(),
        sourceFile: params.file_path
      };
    });
  }

  /**
   * Load content from parameters
   */
  private async loadContent(params: ExtractMetadataParams): Promise<void> {
    try {
      if (params.content) {
        this.content = params.content;
      } else if (params.file_path) {
        this.content = await fs.promises.readFile(params.file_path, 'utf-8');
      }
    } catch (error) {
      throw new Error(`Failed to load IL2CPP dump: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract assembly metadata from image mappings
   */
  private extractAssemblyMetadata(): AssemblyMetadata[] {
    const assemblies: AssemblyMetadata[] = [];
    const imageRegex = /\/\/ Image (\d+): (.+?) - Assembly: (.+?), Version=(.+?), Culture=(.+?), PublicKeyToken=(.+?)$/;

    for (const line of this.lines) {
      const trimmedLine = line.trim();
      const match = trimmedLine.match(imageRegex);

      if (match) {
        const [, imageIndexStr, imageName, assemblyName, version, culture, publicKeyToken] = match;

        assemblies.push({
          name: assemblyName.trim(),
          version: version.trim(),
          culture: culture.trim(),
          publicKeyToken: publicKeyToken.trim(),
          imageName: imageName.trim(),
          imageIndex: parseInt(imageIndexStr),
          dependencies: []
        });
      }
    }

    return assemblies;
  }

  /**
   * Extract build and compilation information
   */
  private extractBuildInformation(): BuildInformation {
    const buildInfo: BuildInformation = {};

    for (const line of this.lines) {
      const trimmedLine = line.trim();

      // Unity version
      const unityMatch = trimmedLine.match(/\/\/ Generated by Unity IL2CPP v(.+?)$/);
      if (unityMatch) {
        buildInfo.unityVersion = unityMatch[1].trim();
        buildInfo.il2cppVersion = unityMatch[1].trim();
      }

      // Build configuration
      const configMatch = trimmedLine.match(/\/\/ Build Configuration: (.+?)$/);
      if (configMatch) {
        buildInfo.buildConfiguration = configMatch[1].trim();
      }

      // Target platform
      const platformMatch = trimmedLine.match(/\/\/ Target Platform: (.+?)$/);
      if (platformMatch) {
        buildInfo.targetPlatform = platformMatch[1].trim();
      }

      // Scripting backend
      const backendMatch = trimmedLine.match(/\/\/ Scripting Backend: (.+?)$/);
      if (backendMatch) {
        buildInfo.scriptingBackend = backendMatch[1].trim();
      }
    }

    return buildInfo;
  }

  /**
   * Extract type system metadata including generics and constraints
   */
  private extractTypeSystemMetadata(): TypeSystemMetadata {
    const genericTypes: GenericTypeMetadata[] = [];
    let totalTypes = 0;

    let currentNamespace = '';

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i].trim();

      // Track namespace declarations
      if (line.startsWith('// Namespace:')) {
        currentNamespace = line.substring('// Namespace:'.length).trim();
        continue;
      }

      // Count all types with TypeDefIndex
      if (line.includes('TypeDefIndex:')) {
        totalTypes++;

        // Look for generic type declarations
        if (line.includes('<') && line.includes('>')) {
          const typeDefMatch = line.match(/TypeDefIndex:\s*(\d+)/);
          const typeDefIndex = typeDefMatch ? parseInt(typeDefMatch[1]) : 0;

          // Extract generic type information
          const beforeComment = line.split('//')[0].trim();
          const genericMatch = beforeComment.match(/(class|interface|struct)\s+([^<\s]+)<([^>]+)>/);

          if (genericMatch) {
            const [, , typeName, genericParams] = genericMatch;
            const parameters = genericParams.split(',').map(p => p.trim());

            // Look for constraints in following lines
            const constraints: string[] = [];
            let j = i + 1;
            while (j < this.lines.length && this.lines[j].trim().startsWith('//')) {
              const constraintLine = this.lines[j].trim();
              if (constraintLine.includes('where ')) {
                constraints.push(constraintLine.replace('//', '').trim());
              }
              j++;
            }

            // Extract base type and interfaces
            const inheritanceMatch = beforeComment.match(/:\s*(.+?)(?:\s*\/\/|$)/);
            const inheritance = inheritanceMatch ? inheritanceMatch[1].trim() : '';
            const parts = inheritance.split(',').map(p => p.trim()).filter(p => p.length > 0);

            const baseType = parts.length > 0 && !parts[0].startsWith('I') ? parts[0] : undefined;
            const interfaces = parts.filter(p => p.startsWith('I') || p !== baseType);

            genericTypes.push({
              name: `${typeName}<${genericParams}>`,
              namespace: currentNamespace,
              typeDefIndex,
              genericParameters: parameters,
              constraints,
              baseType,
              interfaces,
              isGenericDefinition: true,
              isGenericInstance: false
            });
          }
        }
      }
    }

    return {
      totalTypes,
      genericTypes
    };
  }

  /**
   * Validate extracted metadata for consistency and completeness
   */
  private validateMetadata(assemblies: AssemblyMetadata[], typeSystem: TypeSystemMetadata): MetadataValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Validate assemblies
    if (assemblies.length === 0) {
      errors.push('No assembly metadata found in IL2CPP dump');
    }

    for (const assembly of assemblies) {
      if (!assembly.name || assembly.name.trim().length === 0) {
        errors.push(`Assembly at index ${assembly.imageIndex} has empty name`);
      }
      if (!assembly.version || !assembly.version.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        warnings.push(`Assembly ${assembly.name} has invalid version format: ${assembly.version}`);
      }
    }

    // Validate type system
    if (typeSystem.totalTypes === 0) {
      warnings.push('No types found in IL2CPP dump');
    }

    // Check for missing assembly information
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i].trim();
      if (line.startsWith('// Image ') && !line.includes('Assembly:')) {
        const imageMatch = line.match(/\/\/ Image (\d+): (.+?) -/);
        if (imageMatch) {
          errors.push(`Missing assembly information for image ${imageMatch[1]}`);
        }
      }

      // Check for classes without TypeDefIndex
      if (line.includes('class ') && !line.includes('TypeDefIndex:')) {
        const classMatch = line.match(/class\s+([^\s{:]+)/);
        if (classMatch) {
          warnings.push(`Class ${classMatch[1]} missing TypeDefIndex`);
        }
      }
    }

    // Performance suggestions
    if (typeSystem.genericTypes.length > 1000) {
      suggestions.push('Large number of generic types detected. Consider enabling selective processing for better performance.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Calculate processing statistics
   */
  private calculateStatistics(
    assemblies: AssemblyMetadata[],
    typeSystem: TypeSystemMetadata,
    validationResults: MetadataValidationResult
  ): MetadataStatistics {
    const processingTime = Date.now() - this.extractionStartTime;
    const memoryUsage = process.memoryUsage().heapUsed;

    return {
      totalAssemblies: assemblies.length,
      totalTypes: typeSystem.totalTypes,
      totalMethods: 0, // Will be calculated in future iterations
      totalFields: 0,  // Will be calculated in future iterations
      processingTime,
      memoryUsage,
      validationErrors: validationResults.errors.length,
      validationWarnings: validationResults.warnings.length
    };
  }

  /**
   * Format the metadata extraction response
   */
  protected formatResponse(result: IL2CPPMetadata, warnings: string[] = []): MCPResponse {
    const allWarnings = [...warnings, ...result.validationResults.warnings];

    // Create comprehensive response data
    const responseData = {
      metadata: result,
      summary: {
        assemblies: result.assemblies.length,
        types: result.typeSystem.totalTypes,
        genericTypes: result.typeSystem.genericTypes.length,
        processingTime: result.statistics.processingTime,
        memoryUsage: Math.round(result.statistics.memoryUsage / 1024 / 1024 * 100) / 100, // MB
        isValid: result.validationResults.isValid
      },
      validation: result.validationResults
    };

    let response = MCPResponseFormatter.formatAnalysisResults(
      responseData,
      this.config.name,
      { extractionDate: result.extractionDate.toISOString() },
      result.statistics.processingTime
    );

    if (allWarnings.length > 0) {
      response = MCPResponseFormatter.addWarnings(response, allWarnings);
    }

    return MCPResponseFormatter.addExecutionTiming(response, this.startTime, this.config.name);
  }
}

/**
 * Zod schema for extract metadata tool parameters
 */
export const extractMetadataSchema = z.object({
  content: z.string().optional().describe("IL2CPP dump content as string"),
  file_path: z.string().optional().describe("Path to IL2CPP dump file"),
  include_generic_instantiations: z.boolean().optional().default(true).describe("Include generic type instantiations"),
  include_method_signatures: z.boolean().optional().default(true).describe("Include method signature analysis"),
  include_field_offsets: z.boolean().optional().default(true).describe("Include field offset information"),
  validate_structure: z.boolean().optional().default(true).describe("Enable metadata structure validation"),
  enable_performance_tracking: z.boolean().optional().default(true).describe("Enable performance monitoring"),
  max_processing_time: z.number().min(1000).max(300000).optional().default(60000).describe("Maximum processing time in milliseconds")
});

/**
 * Factory function to create and register the extract metadata tool
 */
export function createExtractMetadataTool(server: any, context: ToolExecutionContext) {
  const handler = new ExtractMetadataToolHandler(context);

  server.tool(
    "extract_metadata",
    extractMetadataSchema,
    async (params: ExtractMetadataParams) => {
      return await handler.execute(params);
    }
  );

  return handler;
}
