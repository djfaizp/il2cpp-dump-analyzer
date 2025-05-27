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
