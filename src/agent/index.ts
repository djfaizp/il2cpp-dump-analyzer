/**
 * @fileoverview Agentic MCP Enhancement System
 * Exports all agentic components for intelligent tool orchestration and workflow management
 */

// Core orchestrator
export { MCPOrchestrator } from './mcp-orchestrator';

// Enhanced context management
export { MCPContextManager } from './mcp-context-manager';

// Intelligent tool selection and execution
export { MCPToolSelector } from './mcp-tool-selector';

// Response synthesis and aggregation
export { MCPResponseSynthesizer } from './mcp-response-synthesizer';

// Performance optimization and intelligent caching
export { MCPPerformanceOptimizer } from './mcp-performance-optimizer';

// Type definitions
export * from './types';

// Re-export commonly used types for convenience
export type {
  OrchestratorConfig,
  TaskDecomposition,
  SubTask,
  WorkflowExecution,
  ToolExecutionResult,
  IntentAnalysis,
  ToolSelection,
  WorkflowContext,
  WorkflowMetrics,
  OrchestratorStats,
  AnalysisSession,
  ContextData,
  SessionCache,
  ContextRecommendation,
  SessionMetrics,
  ContextCompressionConfig,
  ToolSelectionCriteria,
  ToolSelectionResult,
  ToolCapabilityMap,
  ToolExecutionPlan,
  ToolQualityAssessment,
  ParallelExecutionResult,
  ExecutionTimeEstimate,
  LearningStatistics,
  ToolSelectorConfig,
  ResponseSynthesizerConfig,
  SynthesizedResponse,
  AggregatedResponse,
  WorkflowSynthesisResult,
  ResponseQualityAssessment,
  ResultCorrelation,
  SynthesisStrategy,
  ResponseCacheEntry,
  SynthesisStatistics,
  CacheEntry,
  PerformanceMetrics,
  CacheStats,
  LearningPattern,
  MCPExecutionContext,
  MCPToolResult,
  OptimizationStrategy
} from './types';
