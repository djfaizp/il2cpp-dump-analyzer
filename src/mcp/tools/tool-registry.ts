/**
 * Tool Registry
 * Central registry for all MCP tools with factory functions and metadata
 */

import { ToolExecutionContext } from '../base-tool-handler';

// Re-export for external use
export type { ToolExecutionContext };

// Import all tool factory functions
import { createSearchCodeTool } from './search-code-tool';
import { createFindMonoBehavioursTool } from './find-monobehaviours-tool';
import { createFindClassHierarchyTool } from './find-class-hierarchy-tool';
import { createFindEnumValuesTool } from './find-enum-values-tool';
import { createAnalyzeDependenciesTool } from './analyze-dependencies-tool';
import { createFindCrossReferencesTool } from './find-cross-references-tool';
import { createFindDesignPatternsTool } from './find-design-patterns-tool';
import { createGenerateClassWrapperTool } from './generate-class-wrapper-tool';
import { createGenerateMethodStubsTool } from './generate-method-stubs-tool';
import { createGenerateMonoBehaviourTemplateTool } from './generate-monobehaviour-template-tool';
import { createExtractMetadataTool } from './extract-metadata-tool';
import { createAnalyzeTypeHierarchiesTool } from './analyze-type-hierarchies-tool';
import { createAnalyzeGenericTypesTool } from './analyze-generic-types-tool';
import { createAnalyzeTypeDependenciesTool } from './analyze-type-dependencies-tool';
import { createAnalyzeTypeCompatibilityTool } from './analyze-type-compatibility-tool';
import { createAssemblyTrackerTool } from './assembly-tracker';
import { createSearchMetadataTool } from './search-metadata-tool';
import { createQueryMetadataTool } from './query-metadata-tool';
import { createAnalyzeAssetReferencesTool } from './analyze-asset-references-tool';
import { createFindUnusedAssetsTool } from './find-unused-assets-tool';
import { createAnalyzeAssetDependenciesTool } from './analyze-asset-dependencies-tool';

/**
 * Tool metadata interface
 */
export interface ToolMetadata {
  name: string;
  category: 'search' | 'analysis' | 'generation';
  description: string;
  complexity: 'simple' | 'medium' | 'complex';
  estimatedExecutionTime: string;
  requiredParameters: string[];
  optionalParameters: string[];
  outputFormat: string;
  examples: string[];
}

/**
 * Tool factory function type
 */
export type ToolFactory = (server: any, context: ToolExecutionContext) => any;

/**
 * Tool registry entry
 */
export interface ToolRegistryEntry {
  factory: ToolFactory;
  metadata: ToolMetadata;
}

/**
 * Complete tool registry with all refactored tools
 */
export const TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  search_code: {
    factory: createSearchCodeTool,
    metadata: {
      name: 'search_code',
      category: 'search',
      description: 'Search through IL2CPP code with semantic search and filtering',
      complexity: 'simple',
      estimatedExecutionTime: '1-3 seconds',
      requiredParameters: ['query'],
      optionalParameters: ['filter_type', 'filter_namespace', 'filter_monobehaviour', 'top_k'],
      outputFormat: 'JSON with search results and metadata',
      examples: [
        'search_code("Player")',
        'search_code("Enemy", filter_type="class", top_k=10)',
        'search_code("Update", filter_monobehaviour=true)'
      ]
    }
  },

  find_monobehaviours: {
    factory: createFindMonoBehavioursTool,
    metadata: {
      name: 'find_monobehaviours',
      category: 'search',
      description: 'Find MonoBehaviour classes for Unity component analysis',
      complexity: 'simple',
      estimatedExecutionTime: '1-2 seconds',
      requiredParameters: [],
      optionalParameters: ['query', 'top_k'],
      outputFormat: 'JSON with MonoBehaviour classes and metadata',
      examples: [
        'find_monobehaviours()',
        'find_monobehaviours("Player")',
        'find_monobehaviours(top_k=20)'
      ]
    }
  },

  find_class_hierarchy: {
    factory: createFindClassHierarchyTool,
    metadata: {
      name: 'find_class_hierarchy',
      category: 'analysis',
      description: 'Analyze class inheritance relationships and structure',
      complexity: 'medium',
      estimatedExecutionTime: '2-5 seconds',
      requiredParameters: ['class_name'],
      optionalParameters: ['include_methods'],
      outputFormat: 'JSON with hierarchy information and methods',
      examples: [
        'find_class_hierarchy("Player")',
        'find_class_hierarchy("Enemy", include_methods=false)',
        'find_class_hierarchy("GameManager")'
      ]
    }
  },

  find_enum_values: {
    factory: createFindEnumValuesTool,
    metadata: {
      name: 'find_enum_values',
      category: 'analysis',
      description: 'Extract enum values and their numeric assignments',
      complexity: 'simple',
      estimatedExecutionTime: '1-2 seconds',
      requiredParameters: ['enum_name'],
      optionalParameters: [],
      outputFormat: 'JSON with enum values and assignments',
      examples: [
        'find_enum_values("GameState")',
        'find_enum_values("PlayerType")',
        'find_enum_values("WeaponCategory")'
      ]
    }
  },

  analyze_dependencies: {
    factory: createAnalyzeDependenciesTool,
    metadata: {
      name: 'analyze_dependencies',
      category: 'analysis',
      description: 'Analyze class dependencies and relationships',
      complexity: 'complex',
      estimatedExecutionTime: '5-15 seconds',
      requiredParameters: ['class_name'],
      optionalParameters: ['analysis_type', 'depth', 'include_system_types'],
      outputFormat: 'JSON with dependency graph and metrics',
      examples: [
        'analyze_dependencies("Player")',
        'analyze_dependencies("GameManager", analysis_type="bidirectional", depth=2)',
        'analyze_dependencies("Enemy", include_system_types=true)'
      ]
    }
  },

  find_cross_references: {
    factory: createFindCrossReferencesTool,
    metadata: {
      name: 'find_cross_references',
      category: 'analysis',
      description: 'Find cross-references and usage patterns in IL2CPP code',
      complexity: 'complex',
      estimatedExecutionTime: '3-10 seconds',
      requiredParameters: ['target_name', 'target_type'],
      optionalParameters: ['reference_type', 'max_results', 'include_nested', 'include_system_types'],
      outputFormat: 'JSON with cross-references and usage statistics',
      examples: [
        'find_cross_references("Player", "class")',
        'find_cross_references("Update", "method", max_results=20)',
        'find_cross_references("IEnemy", "interface", reference_type="implementation")'
      ]
    }
  },

  find_design_patterns: {
    factory: createFindDesignPatternsTool,
    metadata: {
      name: 'find_design_patterns',
      category: 'analysis',
      description: 'Detect common design patterns in IL2CPP code',
      complexity: 'complex',
      estimatedExecutionTime: '10-30 seconds',
      requiredParameters: ['pattern_types'],
      optionalParameters: ['confidence_threshold', 'include_partial_matches', 'namespace_scope', 'exclude_unity_patterns', 'max_results_per_pattern'],
      outputFormat: 'JSON with detected patterns and confidence scores',
      examples: [
        'find_design_patterns(["singleton", "observer"])',
        'find_design_patterns(["factory", "strategy"], confidence_threshold=0.8)',
        'find_design_patterns(["singleton"], namespace_scope="Game")'
      ]
    }
  },

  generate_class_wrapper: {
    factory: createGenerateClassWrapperTool,
    metadata: {
      name: 'generate_class_wrapper',
      category: 'generation',
      description: 'Generate C# wrapper classes from IL2CPP class definitions',
      complexity: 'medium',
      estimatedExecutionTime: '3-8 seconds',
      requiredParameters: ['class_name'],
      optionalParameters: ['include_methods', 'include_properties', 'include_events', 'generate_interfaces', 'custom_namespace', 'unity_version', 'additional_usings'],
      outputFormat: 'JSON with generated C# code and metadata',
      examples: [
        'generate_class_wrapper("Player")',
        'generate_class_wrapper("Enemy", include_methods=true, custom_namespace="Game.Wrappers")',
        'generate_class_wrapper("GameManager", generate_interfaces=true)'
      ]
    }
  },

  generate_method_stubs: {
    factory: createGenerateMethodStubsTool,
    metadata: {
      name: 'generate_method_stubs',
      category: 'generation',
      description: 'Generate method stubs and interfaces from IL2CPP class definitions',
      complexity: 'medium',
      estimatedExecutionTime: '2-6 seconds',
      requiredParameters: ['class_name'],
      optionalParameters: ['method_filter', 'include_documentation', 'include_error_handling', 'generate_async', 'custom_namespace', 'unity_version', 'additional_usings'],
      outputFormat: 'JSON with generated method stubs and metadata',
      examples: [
        'generate_method_stubs("Player")',
        'generate_method_stubs("Enemy", method_filter="^Get.*", include_documentation=true)',
        'generate_method_stubs("GameManager", generate_async=true)'
      ]
    }
  },

  generate_monobehaviour_template: {
    factory: createGenerateMonoBehaviourTemplateTool,
    metadata: {
      name: 'generate_monobehaviour_template',
      category: 'generation',
      description: 'Generate Unity MonoBehaviour templates with common patterns',
      complexity: 'medium',
      estimatedExecutionTime: '2-5 seconds',
      requiredParameters: ['class_name'],
      optionalParameters: ['template_type', 'include_lifecycle_methods', 'include_unity_events', 'include_serialized_fields', 'include_gizmos', 'custom_namespace', 'unity_version', 'additional_usings'],
      outputFormat: 'JSON with generated MonoBehaviour template and metadata',
      examples: [
        'generate_monobehaviour_template("PlayerController")',
        'generate_monobehaviour_template("UIManager", template_type="ui", include_unity_events=true)',
        'generate_monobehaviour_template("GameManager", template_type="manager")'
      ]
    }
  },

  extract_metadata: {
    factory: createExtractMetadataTool,
    metadata: {
      name: 'extract_metadata',
      category: 'analysis',
      description: 'Extract assembly metadata, version information, and compilation flags from IL2CPP dumps',
      complexity: 'medium',
      estimatedExecutionTime: '3-10 seconds',
      requiredParameters: [],
      optionalParameters: ['content', 'file_path', 'include_generic_instantiations', 'include_method_signatures', 'include_field_offsets', 'validate_structure', 'enable_performance_tracking', 'max_processing_time'],
      outputFormat: 'JSON with comprehensive metadata analysis and validation results',
      examples: [
        'extract_metadata(content="// IL2CPP dump content...")',
        'extract_metadata(file_path="/path/to/dump.cs")',
        'extract_metadata(file_path="/path/to/dump.cs", max_processing_time=30000, validate_structure=true)'
      ]
    }
  },

  analyze_type_hierarchies: {
    factory: createAnalyzeTypeHierarchiesTool,
    metadata: {
      name: 'analyze_type_hierarchies',
      category: 'analysis',
      description: 'Analyze inheritance hierarchies and interface implementations in IL2CPP dumps',
      complexity: 'medium',
      estimatedExecutionTime: '2-8 seconds',
      requiredParameters: [],
      optionalParameters: ['target_type', 'include_interfaces', 'max_depth', 'namespace_filter'],
      outputFormat: 'JSON with inheritance hierarchies, multiple inheritance patterns, and orphaned types',
      examples: [
        'analyze_type_hierarchies()',
        'analyze_type_hierarchies(target_type="GameObject", include_interfaces=true)',
        'analyze_type_hierarchies(namespace_filter="UnityEngine", max_depth=3)'
      ]
    }
  },

  analyze_generic_types: {
    factory: createAnalyzeGenericTypesTool,
    metadata: {
      name: 'analyze_generic_types',
      category: 'analysis',
      description: 'Analyze generic type relationships, constraints, and instantiations in IL2CPP dumps',
      complexity: 'medium',
      estimatedExecutionTime: '2-6 seconds',
      requiredParameters: [],
      optionalParameters: ['target_type', 'include_constraints', 'include_instantiations', 'complexity_threshold'],
      outputFormat: 'JSON with generic type definitions, constraint relationships, and complexity metrics',
      examples: [
        'analyze_generic_types()',
        'analyze_generic_types(target_type="List<T>", include_constraints=true)',
        'analyze_generic_types(include_instantiations=true, complexity_threshold=2)'
      ]
    }
  },

  analyze_type_dependencies: {
    factory: createAnalyzeTypeDependenciesTool,
    metadata: {
      name: 'analyze_type_dependencies',
      category: 'analysis',
      description: 'Analyze type dependency graphs, circular references, and dependency clusters in IL2CPP dumps',
      complexity: 'medium',
      estimatedExecutionTime: '3-10 seconds',
      requiredParameters: [],
      optionalParameters: ['target_type', 'include_circular_detection', 'max_depth', 'include_system_types'],
      outputFormat: 'JSON with dependency nodes, edges, clusters, and metrics',
      examples: [
        'analyze_type_dependencies()',
        'analyze_type_dependencies(target_type="GameObject", include_circular_detection=true)',
        'analyze_type_dependencies(max_depth=5, include_system_types=false)'
      ]
    }
  },

  analyze_type_compatibility: {
    factory: createAnalyzeTypeCompatibilityTool,
    metadata: {
      name: 'analyze_type_compatibility',
      category: 'analysis',
      description: 'Analyze type compatibility, assignability rules, and conversion paths in IL2CPP dumps',
      complexity: 'medium',
      estimatedExecutionTime: '2-8 seconds',
      requiredParameters: [],
      optionalParameters: ['from_type', 'to_type', 'include_conversion_paths', 'include_implicit_conversions'],
      outputFormat: 'JSON with compatibility analysis, assignability rules, and conversion paths',
      examples: [
        'analyze_type_compatibility(from_type="string", to_type="object")',
        'analyze_type_compatibility(from_type="int", to_type="long", include_conversion_paths=true)',
        'analyze_type_compatibility(include_implicit_conversions=true)'
      ]
    }
  },

  track_assembly_metadata: {
    factory: createAssemblyTrackerTool,
    metadata: {
      name: 'track_assembly_metadata',
      category: 'analysis',
      description: 'Track assembly metadata, version changes, and dependency analysis for IL2CPP dumps',
      complexity: 'medium',
      estimatedExecutionTime: '3-10 seconds',
      requiredParameters: ['tracking_id'],
      optionalParameters: ['content', 'file_path', 'comparison_mode', 'compare_with', 'include_dependencies', 'enable_caching', 'enable_performance_tracking', 'max_cache_size'],
      outputFormat: 'JSON with assembly tracking results, version comparison, and dependency analysis',
      examples: [
        'track_assembly_metadata(tracking_id="build-v1-0-0", content="// IL2CPP dump...")',
        'track_assembly_metadata(tracking_id="build-v1-1-0", file_path="/path/to/dump.cs", compare_with="build-v1-0-0")',
        'track_assembly_metadata(tracking_id="build-v2-0-0", comparison_mode="versions_only", include_dependencies=true)'
      ]
    }
  },

  search_metadata: {
    factory: createSearchMetadataTool,
    metadata: {
      name: 'search_metadata',
      category: 'search',
      description: 'Search through extracted metadata with flexible filtering and advanced options',
      complexity: 'simple',
      estimatedExecutionTime: '1-3 seconds',
      requiredParameters: ['query'],
      optionalParameters: ['search_type', 'assembly_name', 'assembly_version', 'assembly_culture', 'unity_version', 'platform', 'configuration', 'namespace_filter', 'include_generics', 'monobehaviour_only', 'base_class_filter', 'use_regex', 'case_sensitive', 'max_results', 'include_statistics'],
      outputFormat: 'JSON with search results, metadata, and optional statistics',
      examples: [
        'search_metadata("Assembly-CSharp")',
        'search_metadata("Player", search_type="type", namespace_filter="Game.Player")',
        'search_metadata("Unity", search_type="assembly", unity_version="2022.3.15f1", include_statistics=true)'
      ]
    }
  },

  query_metadata: {
    factory: createQueryMetadataTool,
    metadata: {
      name: 'query_metadata',
      category: 'analysis',
      description: 'Advanced metadata querying with complex filters, aggregations, and cross-references',
      complexity: 'medium',
      estimatedExecutionTime: '2-5 seconds',
      requiredParameters: [],
      optionalParameters: ['query', 'filters', 'aggregations', 'group_by_field', 'statistics_field', 'cross_reference', 'sort_by', 'sort_order', 'limit', 'offset', 'include_metadata', 'optimize_performance'],
      outputFormat: 'JSON with query results, aggregations, cross-references, and execution metadata',
      examples: [
        'query_metadata(query="SELECT * FROM metadata WHERE type = \\"class\\"")',
        'query_metadata(filters={type: "class", isMonoBehaviour: true}, aggregations=["count", "group_by"], group_by_field="namespace")',
        'query_metadata(filters={}, cross_reference={from: "assembly", to: "class", relationship: "contains"})'
      ]
    }
  },

  analyze_asset_references: {
    factory: createAnalyzeAssetReferencesTool,
    metadata: {
      name: 'analyze_asset_references',
      category: 'analysis',
      description: 'Analyze Unity asset references and dependencies in IL2CPP code',
      complexity: 'medium',
      estimatedExecutionTime: '3-10 seconds',
      requiredParameters: [],
      optionalParameters: ['namespace_filter', 'asset_type_filter', 'loading_method_filter', 'include_editor_assets', 'include_optimization_recommendations', 'max_results'],
      outputFormat: 'JSON with asset references, usage patterns, dependencies, and optimization recommendations',
      examples: [
        'analyze_asset_references()',
        'analyze_asset_references(asset_type_filter=["Texture", "Audio"], namespace_filter="Game.UI")',
        'analyze_asset_references(loading_method_filter=["Resources.Load"], include_optimization_recommendations=true)'
      ]
    }
  },

  find_unused_assets: {
    factory: createFindUnusedAssetsTool,
    metadata: {
      name: 'find_unused_assets',
      category: 'analysis',
      description: 'Find potentially unused Unity assets for optimization',
      complexity: 'medium',
      estimatedExecutionTime: '5-15 seconds',
      requiredParameters: [],
      optionalParameters: ['asset_type_filter', 'exclude_editor_assets', 'confidence_threshold', 'include_potential_references', 'namespace_scope', 'max_results'],
      outputFormat: 'JSON with unused assets, confidence scores, and removal recommendations',
      examples: [
        'find_unused_assets()',
        'find_unused_assets(asset_type_filter=["Texture", "Audio"], confidence_threshold=0.9)',
        'find_unused_assets(exclude_editor_assets=true, include_potential_references=false)'
      ]
    }
  },

  analyze_asset_dependencies: {
    factory: createAnalyzeAssetDependenciesTool,
    metadata: {
      name: 'analyze_asset_dependencies',
      category: 'analysis',
      description: 'Analyze Unity asset dependency graphs and relationships',
      complexity: 'complex',
      estimatedExecutionTime: '5-20 seconds',
      requiredParameters: [],
      optionalParameters: ['target_asset', 'dependency_type', 'max_depth', 'include_circular_dependencies', 'asset_type_filter', 'namespace_scope', 'max_results'],
      outputFormat: 'JSON with dependency graph, circular dependencies, and optimization recommendations',
      examples: [
        'analyze_asset_dependencies()',
        'analyze_asset_dependencies(target_asset="player_texture", dependency_type="both", max_depth=3)',
        'analyze_asset_dependencies(include_circular_dependencies=true, asset_type_filter=["Texture", "Material"])'
      ]
    }
  }
};

/**
 * Register all tools with the MCP server
 */
export function registerAllTools(server: any, context: ToolExecutionContext): void {
  console.log('🔧 Registering refactored MCP tools...');

  let registeredCount = 0;
  const startTime = Date.now();

  for (const [toolName, entry] of Object.entries(TOOL_REGISTRY)) {
    try {
      console.log(`  📝 Registering ${toolName} (${entry.metadata.category})...`);
      entry.factory(server, context);
      registeredCount++;
    } catch (error) {
      console.error(`  ❌ Failed to register ${toolName}:`, error);
    }
  }

  const endTime = Date.now();
  console.log(`✅ Successfully registered ${registeredCount}/${Object.keys(TOOL_REGISTRY).length} tools in ${endTime - startTime}ms`);

  // Log tool summary by category
  const categories = Object.values(TOOL_REGISTRY).reduce((acc, entry) => {
    acc[entry.metadata.category] = (acc[entry.metadata.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('📊 Tool Summary:');
  Object.entries(categories).forEach(([category, count]) => {
    console.log(`  ${category}: ${count} tools`);
  });
}

/**
 * Get tool metadata by name
 */
export function getToolMetadata(toolName: string): ToolMetadata | null {
  const entry = TOOL_REGISTRY[toolName];
  return entry ? entry.metadata : null;
}

/**
 * Get all tools by category
 */
export function getToolsByCategory(category: 'search' | 'analysis' | 'generation'): string[] {
  return Object.entries(TOOL_REGISTRY)
    .filter(([, entry]) => entry.metadata.category === category)
    .map(([name]) => name);
}

/**
 * Get tool usage examples
 */
export function getToolExamples(toolName: string): string[] {
  const entry = TOOL_REGISTRY[toolName];
  return entry ? entry.metadata.examples : [];
}

/**
 * Validate tool exists
 */
export function isValidTool(toolName: string): boolean {
  return toolName in TOOL_REGISTRY;
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
  return Object.keys(TOOL_REGISTRY);
}

/**
 * Get tools by complexity
 */
export function getToolsByComplexity(complexity: 'simple' | 'medium' | 'complex'): string[] {
  return Object.entries(TOOL_REGISTRY)
    .filter(([, entry]) => entry.metadata.complexity === complexity)
    .map(([name]) => name);
}

/**
 * Tool registry statistics
 */
export function getRegistryStatistics() {
  const tools = Object.values(TOOL_REGISTRY);

  return {
    totalTools: tools.length,
    byCategory: {
      search: tools.filter(t => t.metadata.category === 'search').length,
      analysis: tools.filter(t => t.metadata.category === 'analysis').length,
      generation: tools.filter(t => t.metadata.category === 'generation').length
    },
    byComplexity: {
      simple: tools.filter(t => t.metadata.complexity === 'simple').length,
      medium: tools.filter(t => t.metadata.complexity === 'medium').length,
      complex: tools.filter(t => t.metadata.complexity === 'complex').length
    },
    averageParameterCount: tools.reduce((sum, t) =>
      sum + t.metadata.requiredParameters.length + t.metadata.optionalParameters.length, 0
    ) / tools.length
  };
}
