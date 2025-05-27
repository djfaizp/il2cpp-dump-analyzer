/**
 * @fileoverview Search Metadata MCP Tool
 *
 * Provides comprehensive metadata search capabilities for IL2CPP dumps including:
 * - Basic metadata search with flexible filtering
 * - Assembly metadata search by name, version, culture, Unity version
 * - Type metadata search by namespace, generic parameters, constraints
 * - Build information search by platform, configuration
 * - Regex pattern matching and case-insensitive search
 * - Advanced filtering and result statistics
 *
 * This tool implements flexible metadata querying functionality as an MCP tool
 * following established patterns and TFD methodology.
 */

import { z } from 'zod';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ParameterValidator, ValidationResult } from '../../utils/parameter-validator';
import { MCPResponseFormatter, MCPResponse } from '../../utils/mcp-response-formatter';
import { MCPServerError, ErrorType } from '../error-types';
import { Document } from '@langchain/core/documents';

/**
 * Search metadata parameters schema
 */
const SearchMetadataParamsSchema = z.object({
  query: z.string().describe('Search query for metadata content'),
  search_type: z.enum(['all', 'assembly', 'type', 'build']).optional().describe('Type of metadata to search'),

  // Assembly-specific filters
  assembly_name: z.string().optional().describe('Filter by assembly name'),
  assembly_version: z.string().optional().describe('Filter by assembly version'),
  assembly_culture: z.string().optional().describe('Filter by assembly culture'),
  unity_version: z.string().optional().describe('Filter by Unity version'),
  platform: z.string().optional().describe('Filter by target platform'),
  configuration: z.string().optional().describe('Filter by build configuration'),

  // Type-specific filters
  namespace_filter: z.string().optional().describe('Filter by namespace'),
  include_generics: z.boolean().optional().describe('Include generic types in results'),
  monobehaviour_only: z.boolean().optional().describe('Search only MonoBehaviour types'),
  base_class_filter: z.string().optional().describe('Filter by base class'),

  // Search options
  use_regex: z.boolean().optional().describe('Use regex pattern matching'),
  case_sensitive: z.boolean().optional().describe('Case-sensitive search'),
  max_results: z.number().min(1).max(1000).optional().describe('Maximum number of results'),
  include_statistics: z.boolean().optional().describe('Include search statistics in response')
});

type SearchMetadataParams = z.infer<typeof SearchMetadataParamsSchema>;

/**
 * Search metadata result interface
 */
export interface SearchMetadataResult {
  results: Array<{
    content: string;
    metadata: Record<string, any>;
    relevanceScore?: number;
  }>;
  searchMetadata: {
    query: string;
    searchType: string;
    appliedFilters: Record<string, any>;
    useRegex: boolean;
    caseSensitive: boolean;
    totalResults: number;
    executionTime: number;
  };
  statistics?: {
    totalResults: number;
    resultsByType: Record<string, number>;
    resultsByNamespace: Record<string, number>;
    resultsByAssembly: Record<string, number>;
    averageRelevanceScore: number;
  };
}

/**
 * Search Metadata Tool Handler
 *
 * Provides flexible metadata search capabilities with advanced filtering options.
 */
export class SearchMetadataToolHandler extends BaseAnalysisToolHandler<SearchMetadataParams, SearchMetadataResult> {
  protected readonly toolName = 'search_metadata';

  constructor(context: ToolExecutionContext) {
    super({
      name: 'search_metadata',
      description: 'Search through extracted metadata with flexible filtering and advanced options',
      enableParameterValidation: true,
      enableResponseFormatting: true
    }, context);
  }

  /**
   * Execute metadata search with comprehensive filtering and statistics
   */
  protected async executeCore(params: SearchMetadataParams): Promise<SearchMetadataResult> {
    const startTime = Date.now();

    this.context.logger.debug('Starting metadata search', {
      query: params.query,
      searchType: params.search_type || 'all',
      filters: this.extractFilters(params)
    });

    // Validate regex pattern if specified
    if (params.use_regex) {
      this.validateRegexPattern(params.query);
    }

    // Build search filter
    const filter = this.buildSearchFilter(params);
    const maxResults = params.max_results || 50;

    // Execute search
    const documents = await this.context.vectorStore.searchWithFilter(
      params.query,
      filter,
      maxResults
    );

    this.context.logger.debug(`Found ${documents.length} metadata documents`);

    // Apply additional filtering if needed
    const filteredDocuments = this.applyAdditionalFiltering(documents, params);

    // Calculate statistics if requested
    let statistics: SearchMetadataResult['statistics'] | undefined;
    if (params.include_statistics) {
      statistics = this.calculateSearchStatistics(filteredDocuments);
    }

    const executionTime = Date.now() - startTime;

    const result: SearchMetadataResult = {
      results: filteredDocuments.map(doc => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        relevanceScore: this.calculateRelevanceScore(doc, params.query)
      })),
      searchMetadata: {
        query: params.query,
        searchType: params.search_type || 'all',
        appliedFilters: filter,
        useRegex: params.use_regex || false,
        caseSensitive: params.case_sensitive !== false, // Default to true
        totalResults: filteredDocuments.length,
        executionTime
      },
      statistics
    };

    this.context.logger.debug('Metadata search completed', {
      totalResults: result.results.length,
      executionTime,
      hasStatistics: !!statistics
    });

    return result;
  }

  /**
   * Extract filters from parameters
   */
  private extractFilters(params: SearchMetadataParams): Record<string, any> {
    const filters: Record<string, any> = {};

    // Add search type filter
    if (params.search_type && params.search_type !== 'all') {
      filters.type = params.search_type;
    }

    return filters;
  }

  /**
   * Build comprehensive search filter from parameters
   */
  private buildSearchFilter(params: SearchMetadataParams): Record<string, any> {
    const filter: Record<string, any> = {};

    // Search type filter
    if (params.search_type && params.search_type !== 'all') {
      filter.type = params.search_type;
    }

    // Assembly-specific filters
    if (params.assembly_name) filter.name = params.assembly_name;
    if (params.assembly_version) filter.version = params.assembly_version;
    if (params.assembly_culture) filter.culture = params.assembly_culture;
    if (params.unity_version) filter.unityVersion = params.unity_version;
    if (params.platform) filter.platform = params.platform;
    if (params.configuration) filter.configuration = params.configuration;

    // Type-specific filters
    if (params.namespace_filter) filter.namespace = params.namespace_filter;
    if (params.monobehaviour_only) filter.isMonoBehaviour = true;
    if (params.base_class_filter) filter.baseClass = params.base_class_filter;

    return filter;
  }

  /**
   * Apply additional filtering that can't be done at the vector store level
   */
  private applyAdditionalFiltering(documents: Document[], params: SearchMetadataParams): Document[] {
    let filtered = documents;

    // Generic types filtering
    if (params.include_generics === false) {
      filtered = filtered.filter(doc => !doc.metadata.genericParameters || doc.metadata.genericParameters.length === 0);
    } else if (params.include_generics === true) {
      filtered = filtered.filter(doc => doc.metadata.genericParameters && doc.metadata.genericParameters.length > 0);
    }

    // Regex filtering (if not handled by vector store)
    if (params.use_regex) {
      const regex = new RegExp(params.query, params.case_sensitive === false ? 'i' : '');
      filtered = filtered.filter(doc =>
        regex.test(doc.pageContent) ||
        regex.test(doc.metadata.name || '') ||
        regex.test(doc.metadata.namespace || '')
      );
    }

    // Case-sensitive filtering (if not handled by vector store)
    if (params.case_sensitive === false && !params.use_regex) {
      const lowerQuery = params.query.toLowerCase();
      filtered = filtered.filter(doc =>
        doc.pageContent.toLowerCase().includes(lowerQuery) ||
        (doc.metadata.name || '').toLowerCase().includes(lowerQuery) ||
        (doc.metadata.namespace || '').toLowerCase().includes(lowerQuery)
      );
    }

    return filtered;
  }

  /**
   * Validate regex pattern
   */
  private validateRegexPattern(pattern: string): void {
    try {
      new RegExp(pattern);
    } catch (error) {
      throw new MCPServerError(
        `Invalid regex pattern: ${pattern}. ${error instanceof Error ? error.message : 'Unknown regex error'}`,
        ErrorType.VALIDATION_ERROR
      );
    }
  }

  /**
   * Calculate relevance score for a document
   */
  private calculateRelevanceScore(doc: Document, query: string): number {
    if (!query) return 1.0;

    const content = doc.pageContent.toLowerCase();
    const queryLower = query.toLowerCase();
    const name = (doc.metadata.name || '').toLowerCase();
    const namespace = (doc.metadata.namespace || '').toLowerCase();

    let score = 0;

    // Exact name match gets highest score
    if (name === queryLower) score += 1.0;
    else if (name.includes(queryLower)) score += 0.8;

    // Namespace match
    if (namespace.includes(queryLower)) score += 0.6;

    // Content match
    if (content.includes(queryLower)) score += 0.4;

    // Normalize score to 0-1 range
    return Math.min(score, 1.0);
  }

  /**
   * Calculate comprehensive search statistics
   */
  private calculateSearchStatistics(documents: Document[]): SearchMetadataResult['statistics'] {
    const resultsByType: Record<string, number> = {};
    const resultsByNamespace: Record<string, number> = {};
    const resultsByAssembly: Record<string, number> = {};
    let totalRelevanceScore = 0;

    for (const doc of documents) {
      // Count by type
      const type = doc.metadata.type || 'unknown';
      resultsByType[type] = (resultsByType[type] || 0) + 1;

      // Count by namespace
      const namespace = doc.metadata.namespace || 'global';
      resultsByNamespace[namespace] = (resultsByNamespace[namespace] || 0) + 1;

      // Count by assembly
      const assembly = doc.metadata.assembly || 'unknown';
      resultsByAssembly[assembly] = (resultsByAssembly[assembly] || 0) + 1;

      // Sum relevance scores
      totalRelevanceScore += doc.metadata.relevanceScore || 0;
    }

    return {
      totalResults: documents.length,
      resultsByType,
      resultsByNamespace,
      resultsByAssembly,
      averageRelevanceScore: documents.length > 0 ? totalRelevanceScore / documents.length : 0
    };
  }

  /**
   * Validate search parameters
   */
  protected async validateParameters(params: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate query parameter
    if (params.query === undefined || params.query === null) {
      errors.push('query parameter is required');
    } else if (typeof params.query !== 'string') {
      errors.push('query must be a string');
    }

    // Validate search_type
    if (params.search_type !== undefined) {
      const validSearchTypes = ['all', 'assembly', 'type', 'build'];
      if (!validSearchTypes.includes(params.search_type)) {
        errors.push(`search_type must be one of: ${validSearchTypes.join(', ')}`);
      }
    }

    // Validate max_results
    if (params.max_results !== undefined) {
      if (typeof params.max_results !== 'number' || params.max_results < 1 || params.max_results > 1000) {
        adjustedValues.max_results = Math.max(1, Math.min(1000, params.max_results || 50));
        warnings.push(`max_results adjusted to ${adjustedValues.max_results} (valid range: 1-1000)`);
      }
    }

    // Validate boolean parameters
    const booleanParams = ['include_generics', 'monobehaviour_only', 'use_regex', 'case_sensitive', 'include_statistics'];
    for (const param of booleanParams) {
      if (params[param] !== undefined && typeof params[param] !== 'boolean') {
        errors.push(`${param} must be a boolean`);
      }
    }

    // Validate string parameters
    const stringParams = ['assembly_name', 'assembly_version', 'assembly_culture', 'unity_version', 'platform', 'configuration', 'namespace_filter', 'base_class_filter'];
    for (const param of stringParams) {
      if (params[param] !== undefined && typeof params[param] !== 'string') {
        errors.push(`${param} must be a string`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      adjustedValues
    };
  }
}

/**
 * Create and register the search metadata tool
 */
export function createSearchMetadataTool(server: any, context: ToolExecutionContext): void {
  const handler = new SearchMetadataToolHandler(context);

  server.tool(
    {
      name: 'search_metadata',
      description: 'Search through extracted metadata with flexible filtering and advanced options',
      inputSchema: SearchMetadataParamsSchema
    },
    async (params: SearchMetadataParams) => {
      return handler.execute(params);
    }
  );
}
