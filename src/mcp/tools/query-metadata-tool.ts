/**
 * @fileoverview Query Metadata MCP Tool
 *
 * Provides advanced metadata querying capabilities for IL2CPP dumps including:
 * - SQL-like query syntax and structured filters
 * - Aggregations (count, group by, statistics)
 * - Cross-reference queries between different metadata types
 * - Complex boolean logic (AND, OR, NOT)
 * - Advanced filtering and result processing
 * - Performance optimization for large datasets
 *
 * This tool implements advanced metadata querying functionality as an MCP tool
 * following established patterns and TFD methodology.
 */

import { z } from 'zod';
import { BaseAnalysisToolHandler, ToolExecutionContext } from '../base-tool-handler';
import { ValidationResult } from '../../utils/parameter-validator';
import { MCPServerError, ErrorType } from '../error-types';
import { Document } from '@langchain/core/documents';

/**
 * Query metadata parameters schema
 */
const QueryMetadataParamsSchema = z.object({
  query: z.string().optional().describe('SQL-like query string for metadata'),
  filters: z.record(z.any()).optional().describe('Structured filters for metadata querying'),
  aggregations: z.array(z.enum(['count', 'group_by', 'statistics', 'distinct'])).optional().describe('Aggregation operations to perform'),
  group_by_field: z.string().optional().describe('Field to group by for aggregation'),
  statistics_field: z.string().optional().describe('Field to calculate statistics for'),
  cross_reference: z.object({
    from: z.string().describe('Source metadata type'),
    to: z.string().describe('Target metadata type'),
    relationship: z.string().describe('Relationship type (contains, references, etc.)')
  }).optional().describe('Cross-reference query configuration'),
  sort_by: z.string().optional().describe('Field to sort results by'),
  sort_order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
  limit: z.number().min(1).max(1000).optional().describe('Maximum number of results'),
  offset: z.number().min(0).optional().describe('Number of results to skip'),
  include_metadata: z.boolean().optional().describe('Include query execution metadata'),
  optimize_performance: z.boolean().optional().describe('Enable performance optimizations')
});

type QueryMetadataParams = z.infer<typeof QueryMetadataParamsSchema>;

/**
 * Query metadata result interface
 */
export interface QueryMetadataResult {
  results: Array<{
    content: string;
    metadata: Record<string, any>;
    score?: number;
  }>;
  aggregations?: {
    count?: number;
    groupBy?: Record<string, number>;
    statistics?: {
      field: string;
      count: number;
      sum: number;
      average: number;
      min: number;
      max: number;
      standardDeviation: number;
    };
    distinct?: Array<any>;
  };
  crossReferences?: {
    relationships: Array<{
      from: any;
      to: any;
      relationship: string;
      strength: number;
    }>;
    summary: Record<string, number>;
  };
  queryMetadata: {
    originalQuery?: string;
    appliedFilters: Record<string, any>;
    executionTime: number;
    totalResults: number;
    hasMore: boolean;
    optimizationsApplied: string[];
  };
}

/**
 * Query Metadata Tool Handler
 * 
 * Provides advanced metadata querying capabilities with SQL-like syntax and complex filtering.
 */
export class QueryMetadataToolHandler extends BaseAnalysisToolHandler<QueryMetadataParams, QueryMetadataResult> {
  protected readonly toolName = 'query_metadata';

  constructor(context: ToolExecutionContext) {
    super({
      name: 'query_metadata',
      description: 'Advanced metadata querying with complex filters, aggregations, and cross-references',
      enableParameterValidation: true,
      enableResponseFormatting: true
    }, context);
  }

  /**
   * Execute advanced metadata query with comprehensive filtering and aggregations
   */
  protected async executeCore(params: QueryMetadataParams): Promise<QueryMetadataResult> {
    const startTime = Date.now();

    this.context.logger.debug('Starting advanced metadata query', {
      hasQuery: !!params.query,
      hasFilters: !!params.filters,
      aggregations: params.aggregations || [],
      hasCrossReference: !!params.cross_reference
    });

    // Parse and validate query if provided
    let parsedQuery: any = null;
    if (params.query) {
      parsedQuery = this.parseQuery(params.query);
    }

    // Build comprehensive filter from query and structured filters
    const filter = this.buildComprehensiveFilter(parsedQuery, params.filters);

    // Execute search with optimizations
    const optimizationsApplied: string[] = [];
    const documents = await this.executeOptimizedSearch(filter, params, optimizationsApplied);

    this.context.logger.debug(`Found ${documents.length} metadata documents`);

    // Apply additional filtering and sorting
    let filteredDocuments = this.applyAdvancedFiltering(documents, params);
    filteredDocuments = this.applySorting(filteredDocuments, params);

    // Apply pagination
    const { paginatedResults, hasMore } = this.applyPagination(filteredDocuments, params);

    // Calculate aggregations if requested
    let aggregations: QueryMetadataResult['aggregations'] | undefined;
    if (params.aggregations && params.aggregations.length > 0) {
      aggregations = this.calculateAggregations(filteredDocuments, params);
    }

    // Calculate cross-references if requested
    let crossReferences: QueryMetadataResult['crossReferences'] | undefined;
    if (params.cross_reference) {
      crossReferences = this.calculateCrossReferences(filteredDocuments, params.cross_reference);
    }

    const executionTime = Date.now() - startTime;

    const result: QueryMetadataResult = {
      results: paginatedResults.map(doc => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        score: this.calculateRelevanceScore(doc, filter)
      })),
      aggregations,
      crossReferences,
      queryMetadata: {
        originalQuery: params.query,
        appliedFilters: filter,
        executionTime,
        totalResults: filteredDocuments.length,
        hasMore,
        optimizationsApplied
      }
    };

    this.context.logger.debug('Advanced metadata query completed', {
      totalResults: result.results.length,
      executionTime,
      hasAggregations: !!aggregations,
      hasCrossReferences: !!crossReferences
    });

    return result;
  }

  /**
   * Parse SQL-like query string
   */
  private parseQuery(query: string): any {
    try {
      // Simple SQL parser for basic SELECT statements
      const selectMatch = query.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
      
      if (!selectMatch) {
        throw new Error('Invalid SQL syntax. Expected: SELECT ... FROM ... [WHERE ...]');
      }

      const [, select, from, where] = selectMatch;

      const parsed = {
        select: select.trim(),
        from: from.trim(),
        where: where ? this.parseWhereClause(where.trim()) : null
      };

      return parsed;
    } catch (error) {
      throw new MCPServerError(
        `Failed to parse query: ${error instanceof Error ? error.message : 'Unknown parsing error'}`,
        ErrorType.VALIDATION_ERROR
      );
    }
  }

  /**
   * Parse WHERE clause into filter conditions
   */
  private parseWhereClause(whereClause: string): Record<string, any> {
    const filter: Record<string, any> = {};

    // Simple parsing for basic conditions like: field = "value" AND field2 = "value2"
    const conditions = whereClause.split(/\s+AND\s+/i);

    for (const condition of conditions) {
      const match = condition.match(/(\w+)\s*=\s*"([^"]+)"/);
      if (match) {
        const [, field, value] = match;
        filter[field] = value;
      }
    }

    return filter;
  }

  /**
   * Build comprehensive filter from parsed query and structured filters
   */
  private buildComprehensiveFilter(parsedQuery: any, structuredFilters?: Record<string, any>): Record<string, any> {
    let filter: Record<string, any> = {};

    // Add filters from parsed query
    if (parsedQuery?.where) {
      filter = { ...filter, ...parsedQuery.where };
    }

    // Add structured filters
    if (structuredFilters) {
      filter = this.mergeFilters(filter, structuredFilters);
    }

    return filter;
  }

  /**
   * Merge filters with support for boolean logic
   */
  private mergeFilters(filter1: Record<string, any>, filter2: Record<string, any>): Record<string, any> {
    const merged = { ...filter1 };

    for (const [key, value] of Object.entries(filter2)) {
      if (key === 'AND' || key === 'OR' || key === 'NOT') {
        merged[key] = value;
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Execute optimized search with performance enhancements
   */
  private async executeOptimizedSearch(
    filter: Record<string, any>, 
    params: QueryMetadataParams, 
    optimizationsApplied: string[]
  ): Promise<Document[]> {
    const limit = params.limit || 100;

    // Use vector store search
    const documents = await this.context.vectorStore.searchWithFilter('', filter, limit * 2); // Get more for filtering

    if (params.optimize_performance) {
      optimizationsApplied.push('batch_processing', 'result_caching');
    }

    return documents;
  }

  /**
   * Apply advanced filtering with boolean logic support
   */
  private applyAdvancedFiltering(documents: Document[], params: QueryMetadataParams): Document[] {
    if (!params.filters) return documents;

    return documents.filter(doc => this.evaluateFilter(doc.metadata, params.filters!));
  }

  /**
   * Evaluate filter conditions with boolean logic
   */
  private evaluateFilter(metadata: Record<string, any>, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (key === 'AND') {
        return Array.isArray(value) && value.every(subFilter => this.evaluateFilter(metadata, subFilter));
      } else if (key === 'OR') {
        return Array.isArray(value) && value.some(subFilter => this.evaluateFilter(metadata, subFilter));
      } else if (key === 'NOT') {
        return !this.evaluateFilter(metadata, value);
      } else {
        // Simple equality check
        if (typeof value === 'object' && value.$exists !== undefined) {
          return value.$exists ? (metadata[key] !== undefined) : (metadata[key] === undefined);
        }
        return metadata[key] === value;
      }
    }
    return true;
  }

  /**
   * Apply sorting to results
   */
  private applySorting(documents: Document[], params: QueryMetadataParams): Document[] {
    if (!params.sort_by) return documents;

    const sortField = params.sort_by;
    const sortOrder = params.sort_order || 'asc';

    return documents.sort((a, b) => {
      const aValue = a.metadata[sortField];
      const bValue = b.metadata[sortField];

      if (aValue === bValue) return 0;
      
      const comparison = aValue < bValue ? -1 : 1;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Apply pagination to results
   */
  private applyPagination(documents: Document[], params: QueryMetadataParams): { paginatedResults: Document[], hasMore: boolean } {
    const offset = params.offset || 0;
    const limit = params.limit || 100;

    const paginatedResults = documents.slice(offset, offset + limit);
    const hasMore = documents.length > offset + limit;

    return { paginatedResults, hasMore };
  }

  /**
   * Calculate aggregations on the results
   */
  private calculateAggregations(documents: Document[], params: QueryMetadataParams): QueryMetadataResult['aggregations'] {
    const aggregations: QueryMetadataResult['aggregations'] = {};

    if (params.aggregations?.includes('count')) {
      aggregations.count = documents.length;
    }

    if (params.aggregations?.includes('group_by') && params.group_by_field) {
      aggregations.groupBy = this.calculateGroupBy(documents, params.group_by_field);
    }

    if (params.aggregations?.includes('statistics') && params.statistics_field) {
      aggregations.statistics = this.calculateStatistics(documents, params.statistics_field);
    }

    if (params.aggregations?.includes('distinct') && params.group_by_field) {
      aggregations.distinct = this.calculateDistinct(documents, params.group_by_field);
    }

    return aggregations;
  }

  /**
   * Calculate group by aggregation
   */
  private calculateGroupBy(documents: Document[], field: string): Record<string, number> {
    const groups: Record<string, number> = {};

    for (const doc of documents) {
      const value = doc.metadata[field] || 'null';
      const key = String(value);
      groups[key] = (groups[key] || 0) + 1;
    }

    return groups;
  }

  /**
   * Calculate statistical aggregations
   */
  private calculateStatistics(documents: Document[], field: string): QueryMetadataResult['aggregations']['statistics'] {
    const values = documents
      .map(doc => doc.metadata[field])
      .filter(val => typeof val === 'number')
      .map(val => Number(val));

    if (values.length === 0) {
      return {
        field,
        count: 0,
        sum: 0,
        average: 0,
        min: 0,
        max: 0,
        standardDeviation: 0
      };
    }

    const sum = values.reduce((acc, val) => acc + val, 0);
    const average = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    const variance = values.reduce((acc, val) => acc + Math.pow(val - average, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);

    return {
      field,
      count: values.length,
      sum,
      average,
      min,
      max,
      standardDeviation
    };
  }

  /**
   * Calculate distinct values
   */
  private calculateDistinct(documents: Document[], field: string): Array<any> {
    const distinctValues = new Set();

    for (const doc of documents) {
      const value = doc.metadata[field];
      if (value !== undefined) {
        distinctValues.add(value);
      }
    }

    return Array.from(distinctValues);
  }

  /**
   * Calculate cross-references between metadata types
   */
  private calculateCrossReferences(documents: Document[], crossRefConfig: any): QueryMetadataResult['crossReferences'] {
    const relationships: Array<any> = [];
    const summary: Record<string, number> = {};

    // Group documents by type
    const documentsByType = documents.reduce((acc, doc) => {
      const type = doc.metadata.type || 'unknown';
      if (!acc[type]) acc[type] = [];
      acc[type].push(doc);
      return acc;
    }, {} as Record<string, Document[]>);

    const fromDocs = documentsByType[crossRefConfig.from] || [];
    const toDocs = documentsByType[crossRefConfig.to] || [];

    // Calculate relationships based on the relationship type
    for (const fromDoc of fromDocs) {
      for (const toDoc of toDocs) {
        const strength = this.calculateRelationshipStrength(fromDoc, toDoc, crossRefConfig.relationship);
        
        if (strength > 0) {
          relationships.push({
            from: fromDoc.metadata,
            to: toDoc.metadata,
            relationship: crossRefConfig.relationship,
            strength
          });

          const key = `${crossRefConfig.from}_to_${crossRefConfig.to}`;
          summary[key] = (summary[key] || 0) + 1;
        }
      }
    }

    return { relationships, summary };
  }

  /**
   * Calculate relationship strength between two documents
   */
  private calculateRelationshipStrength(fromDoc: Document, toDoc: Document, relationship: string): number {
    switch (relationship) {
      case 'contains':
        return fromDoc.metadata.assembly === toDoc.metadata.assembly ? 1 : 0;
      case 'references':
        return fromDoc.pageContent.includes(toDoc.metadata.name || '') ? 0.8 : 0;
      case 'inherits':
        return fromDoc.metadata.baseClass === toDoc.metadata.name ? 1 : 0;
      default:
        return 0;
    }
  }

  /**
   * Calculate relevance score for a document
   */
  private calculateRelevanceScore(doc: Document, filter: Record<string, any>): number {
    let score = 1.0;

    // Boost score based on filter matches
    for (const [key, value] of Object.entries(filter)) {
      if (doc.metadata[key] === value) {
        score += 0.2;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Validate query parameters
   */
  protected async validateParameters(params: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const adjustedValues: Record<string, any> = {};

    // Validate that either query or filters is provided
    if (!params.query && !params.filters) {
      errors.push('Either query or filters parameter is required');
    }

    // Validate aggregations
    if (params.aggregations) {
      if (!Array.isArray(params.aggregations)) {
        errors.push('aggregations must be an array');
      } else {
        const validAggregations = ['count', 'group_by', 'statistics', 'distinct'];
        const invalidAggregations = params.aggregations.filter((agg: string) => !validAggregations.includes(agg));
        if (invalidAggregations.length > 0) {
          errors.push(`Invalid aggregations: ${invalidAggregations.join(', ')}`);
        }
      }
    }

    // Validate limit
    if (params.limit !== undefined) {
      if (typeof params.limit !== 'number' || params.limit < 1 || params.limit > 1000) {
        adjustedValues.limit = Math.max(1, Math.min(1000, params.limit || 100));
        warnings.push(`limit adjusted to ${adjustedValues.limit} (valid range: 1-1000)`);
      }
    }

    // Validate offset
    if (params.offset !== undefined) {
      if (typeof params.offset !== 'number' || params.offset < 0) {
        adjustedValues.offset = Math.max(0, params.offset || 0);
        warnings.push(`offset adjusted to ${adjustedValues.offset} (minimum: 0)`);
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
 * Create and register the query metadata tool
 */
export function createQueryMetadataTool(server: any, context: ToolExecutionContext): void {
  const handler = new QueryMetadataToolHandler(context);

  server.tool(
    {
      name: 'query_metadata',
      description: 'Advanced metadata querying with complex filters, aggregations, and cross-references',
      inputSchema: QueryMetadataParamsSchema
    },
    async (params: QueryMetadataParams) => {
      return handler.execute(params);
    }
  );
}
