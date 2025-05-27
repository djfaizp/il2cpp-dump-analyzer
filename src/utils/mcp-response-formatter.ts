/**
 * MCP Response Formatting Utilities
 * Standardizes response formatting across all MCP tools to eliminate duplication
 */

import { Document } from '@langchain/core/documents';

/**
 * Standard MCP response structure
 */
export interface MCPResponse {
  content: Array<{
    type: 'text' | 'resource';
    text?: string;
    uri?: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Search result metadata interface
 */
export interface SearchResultMetadata {
  searchQuery?: string;
  appliedFilters?: Record<string, any>;
  resultCount: number;
  totalTime?: number;
  adjustedParameters?: Record<string, any>;
  warnings?: string[];
}

/**
 * Tool execution metadata interface
 */
export interface ToolExecutionMetadata {
  toolName: string;
  executionTime: number;
  parametersUsed: Record<string, any>;
  warnings?: string[];
  adjustments?: Record<string, any>;
}

/**
 * MCP response formatting utilities
 */
export class MCPResponseFormatter {
  /**
   * Format a simple text response
   */
  static formatTextResponse(
    content: string | object,
    metadata?: Record<string, any>
  ): MCPResponse {
    const text = typeof content === 'string' ? content : this.safeJsonStringify(content, 2);
    
    return {
      content: [{
        type: 'text',
        text,
        ...(metadata && { metadata })
      }]
    };
  }

  /**
   * Format search results from vector store
   */
  static formatSearchResults(
    results: Document[],
    searchQuery: string,
    appliedFilters: Record<string, any> = {},
    metadata: Partial<SearchResultMetadata> = {}
  ): MCPResponse {
    const searchMetadata: SearchResultMetadata = {
      searchQuery,
      appliedFilters,
      resultCount: results.length,
      ...metadata
    };

    if (results.length === 0) {
      return this.formatTextResponse({
        message: 'No results found',
        searchQuery,
        appliedFilters,
        suggestions: [
          'Try using different search terms',
          'Remove or adjust filters',
          'Use broader search criteria',
          'Check spelling and syntax'
        ]
      }, searchMetadata);
    }

    // Format results with consistent structure
    const formattedResults = results.map((doc, index) => ({
      rank: index + 1,
      name: doc.metadata.name || 'Unknown',
      fullName: doc.metadata.fullName || doc.metadata.name || 'Unknown',
      type: doc.metadata.type || 'unknown',
      namespace: doc.metadata.namespace || 'global',
      content: doc.pageContent,
      metadata: {
        ...doc.metadata,
        relevanceScore: doc.metadata.score || 0
      }
    }));

    return this.formatTextResponse({
      summary: {
        totalResults: results.length,
        searchQuery,
        appliedFilters
      },
      results: formattedResults,
      metadata: searchMetadata
    });
  }

  /**
   * Format error response with consistent structure
   */
  static formatErrorResponse(
    error: Error | string,
    toolName: string,
    parameters?: Record<string, any>
  ): MCPResponse {
    const errorMessage = error instanceof Error ? error.message : error;
    
    return this.formatTextResponse({
      error: true,
      message: errorMessage,
      toolName,
      parameters,
      timestamp: new Date().toISOString(),
      suggestions: [
        'Check parameter values and types',
        'Verify required parameters are provided',
        'Review tool documentation for correct usage',
        'Try with simpler parameters first'
      ]
    });
  }

  /**
   * Format analysis results with summary and details
   */
  static formatAnalysisResults(
    analysis: any,
    toolName: string,
    parameters: Record<string, any>,
    executionTime?: number
  ): MCPResponse {
    const metadata: ToolExecutionMetadata = {
      toolName,
      executionTime: executionTime || 0,
      parametersUsed: parameters
    };

    return this.formatTextResponse(analysis, metadata);
  }

  /**
   * Format generation results (for code generation tools)
   */
  static formatGenerationResults(
    generatedCode: string,
    metadata: {
      className?: string;
      fileName?: string;
      language?: string;
      warnings?: string[];
      statistics?: Record<string, any>;
    }
  ): MCPResponse {
    return this.formatTextResponse({
      success: true,
      generatedCode,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        codeLength: generatedCode.length,
        lineCount: generatedCode.split('\n').length
      }
    });
  }

  /**
   * Format list results with pagination info
   */
  static formatListResults(
    items: any[],
    pagination: {
      offset?: number;
      limit?: number;
      total?: number;
      hasMore?: boolean;
    } = {},
    metadata: Record<string, any> = {}
  ): MCPResponse {
    return this.formatTextResponse({
      items,
      pagination: {
        count: items.length,
        ...pagination
      },
      metadata
    });
  }

  /**
   * Format resource response for MCP resource handlers
   */
  static formatResourceResponse(
    results: Document[],
    resourceUri: string,
    queryString?: string,
    filter?: Record<string, any>
  ): { contents: Array<{ uri: string; text: string; metadata: any }> } {
    return {
      contents: results.map(doc => ({
        uri: `il2cpp://${encodeURIComponent(doc.metadata.fullName || doc.metadata.name)}`,
        text: doc.pageContent,
        metadata: {
          ...doc.metadata,
          searchQuery: queryString,
          appliedFilters: filter,
          resultCount: results.length,
          resourceUri
        }
      }))
    };
  }

  /**
   * Format validation results with errors and warnings
   */
  static formatValidationResults(
    isValid: boolean,
    errors: string[] = [],
    warnings: string[] = [],
    data?: any
  ): MCPResponse {
    return this.formatTextResponse({
      valid: isValid,
      errors,
      warnings,
      ...(data && { data })
    });
  }

  /**
   * Format pattern detection results
   */
  static formatPatternResults(
    detectedPatterns: Record<string, any[]>,
    summary: {
      totalPatternsFound: number;
      patternTypeCount: number;
      architecturalInsights: string[];
    },
    metadata: Record<string, any>
  ): MCPResponse {
    return this.formatTextResponse({
      detectedPatterns,
      summary,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Safe JSON stringify with circular reference handling
   */
  static safeJsonStringify(obj: any, indent: number = 0): string {
    try {
      const seen = new WeakSet();
      return JSON.stringify(obj, (key, val) => {
        if (val != null && typeof val === 'object') {
          if (seen.has(val)) {
            return '[Circular Reference]';
          }
          seen.add(val);
        }
        return val;
      }, indent);
    } catch (error) {
      return `[JSON Stringify Error: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
  }

  /**
   * Add execution timing to response
   */
  static addExecutionTiming<T extends MCPResponse>(
    response: T,
    startTime: number,
    toolName: string
  ): T {
    const executionTime = Date.now() - startTime;
    
    if (response.content[0] && response.content[0].metadata) {
      response.content[0].metadata.executionTime = executionTime;
      response.content[0].metadata.toolName = toolName;
    }
    
    return response;
  }

  /**
   * Add warnings to response
   */
  static addWarnings<T extends MCPResponse>(
    response: T,
    warnings: string[]
  ): T {
    if (warnings.length > 0 && response.content[0]) {
      if (!response.content[0].metadata) {
        response.content[0].metadata = {};
      }
      response.content[0].metadata.warnings = warnings;
    }
    
    return response;
  }

  /**
   * Create a standardized "not found" response
   */
  static formatNotFoundResponse(
    searchTerm: string,
    searchType: string = 'item'
  ): MCPResponse {
    return this.formatTextResponse({
      found: false,
      message: `${searchType} '${searchTerm}' not found`,
      searchTerm,
      searchType,
      suggestions: [
        'Check the spelling of the search term',
        'Try using a partial name or pattern',
        'Use the search_code tool to explore available items',
        'Verify the item exists in the loaded IL2CPP dump'
      ]
    });
  }
}
