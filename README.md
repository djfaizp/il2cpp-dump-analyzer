# IL2CPP Dump Analyzer Agentic RAG MCP System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue)](https://www.typescriptlang.org/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-purple)](https://modelcontextprotocol.io/)
[![Docker Support](https://img.shields.io/badge/Docker-Supported-blue)](https://www.docker.com/)

A cutting-edge **Agentic Retrieval-Augmented Generation (RAG)** system for analyzing IL2CPP dump.cs files from Unity games. This system implements the Model Context Protocol (MCP) server specification with **intelligent agentic capabilities** that provide automated task orchestration, context-aware analysis, and enhanced workflow execution within the MCP framework.

## 🚀 Key Features

### 🤖 Agentic Intelligence Layer
- **Intelligent MCP Tool Orchestration**: Automatically selects and chains MCP tools for complex analysis tasks
- **Context-Aware Processing**: Preserves analysis context and results across multiple MCP tool calls
- **Smart Task Decomposition**: Breaks complex IL2CPP analysis requests into manageable subtasks
- **Result Synthesis**: Intelligently aggregates and correlates results from multiple MCP tools
- **Adaptive Caching**: Implements smart caching strategies that learn from usage patterns
- **Performance Optimization**: Monitors and optimizes agentic workflows for speed and efficiency

### 🔍 Advanced IL2CPP Analysis
- **Semantic Code Processing**: Specialized IL2CPPCodeChunker preserves code context and meaning
- **Vector-Powered Search**: Uses Xenova's Transformers.js with all-MiniLM-L6-v2 model (384-dimensional embeddings)
- **Supabase Vector Database**: High-performance vector search with pgvector extension
- **Hash-based Change Detection**: Intelligent change detection to avoid reprocessing unchanged files
- **Metadata Extraction**: Comprehensive assembly metadata, version tracking, and compilation analysis

### 🛠️ Comprehensive Tool Suite (21 MCP Tools)
- **Search Tools (3)**: Semantic code search, metadata search, and advanced querying
- **Analysis Tools (15)**: MonoBehaviour discovery, class hierarchies, design patterns, dependencies, and asset analysis
- **Generation Tools (3)**: C# wrapper generation, method stubs, and Unity MonoBehaviour templates

### 🔌 MCP Integration Excellence
- **Official MCP SDK**: Full compliance with Model Context Protocol specification v1.12.0
- **Multiple Transports**: Stdio, HTTP, and Server-Sent Events (SSE) support
- **Robust Validation**: Zod schemas ensure comprehensive parameter validation
- **Advanced Error Handling**: Intelligent error recovery with detailed logging and retry mechanisms
- **Resource Management**: Efficient memory usage and connection pooling

## Prerequisites

- **Node.js 18.x or higher**
- **TypeScript** (for development)
- **Supabase account** (required for vector database storage)
- **IL2CPP dump.cs file** from a Unity game

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/il2cpp-dump-analyzer-mcp.git
   cd il2cpp-dump-analyzer-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Supabase database:**
   - Create a new Supabase project at [supabase.com](https://supabase.com)
   - Run the SQL commands in `supabase-setup.sql` in the Supabase SQL editor
   - This creates the required tables with pgvector extension for vector storage

4. **Configure environment variables:**
   ```bash
   cp simple.env .env
   ```

   Update the `.env` file with your configuration:
   ```env
   # Core Configuration
   NODE_ENV=production
   DUMP_FILE_PATH=./dump.cs
   EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
   LOG_LEVEL=info

   # Supabase Configuration (Required)
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_anon_key
   SUPABASE_TABLE_NAME=il2cpp_documents

   # MCP Server Configuration
   MCP_SERVER_PORT=3000
   MCP_SERVER_HOST=0.0.0.0
   ```

5. **Build the project:**
   ```bash
   npm run build
   ```

## Usage
### Environment Variables

All available environment variables including agentic configuration:

```env
# Core Configuration
NODE_ENV=production|development|test
DUMP_FILE_PATH=./dump.cs
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
LOG_LEVEL=error|warn|info|debug

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_or_service_key
SUPABASE_TABLE_NAME=il2cpp_documents

# MCP Server Configuration
MCP_SERVER_PORT=3000
MCP_SERVER_HOST=0.0.0.0

# Agentic Configuration
AGENTIC_MODE=true                    # Enable intelligent tool orchestration
CONTEXT_CACHE_SIZE=1000             # Maximum cached contexts
TOOL_CHAIN_MAX_DEPTH=5              # Maximum tool chaining depth
INTELLIGENT_CACHING=true            # Enable smart result caching
CONTEXT_PERSISTENCE=true            # Enable context persistence across calls
PERFORMANCE_OPTIMIZATION=true      # Enable performance learning and optimization
ADAPTIVE_BATCHING=true              # Enable adaptive request batching
```

### Quick Start

1. **Place your IL2CPP dump.cs file** in the root directory (or specify path in `.env`)

2. **Start the MCP server:**
   ```bash
   npm start
   ```

3. **The server will automatically:**
   - Parse the IL2CPP dump.cs file
   - Extract classes, methods, enums, and interfaces
   - Generate semantic embeddings using Xenova Transformers.js
   - Store vectors in Supabase with hash-based change detection
   - Start the MCP server with stdio transport

4. **Connect with MCP clients:**
   - **Claude Desktop**: Add to MCP configuration
   - **Other MCP clients**: Use stdio transport connection

### MCP Client Configuration

#### Claude Desktop Configuration

Add to your Claude Desktop MCP configuration file:

```json
{
  "mcpServers": {
    "il2cpp-analyzer": {
      "command": "node",
      "args": ["./bin/il2cpp-mcp-stdio.js"],
      "cwd": "/path/to/il2cpp-dump-analyzer-mcp"
    }
  }
}
```

#### Alternative: Direct Node.js Execution

```bash
# Run the MCP server directly
node ./bin/il2cpp-mcp-stdio.js

# Or use npm script
npm run mcp:stdio
```

## 🛠️ MCP Tools and Resources

The server provides **21 comprehensive MCP tools** organized into three categories for IL2CPP analysis and code generation:

### 🔍 Search Tools (3 tools)

#### 1. `search_code` - Semantic Code Search
Advanced semantic search through IL2CPP code with intelligent filtering.

**Parameters:**
- `query` (string, required): The search query
- `filter_type` (string, optional): Filter by entity type (`class`, `method`, `enum`, `interface`)
- `filter_namespace` (string, optional): Filter by namespace
- `filter_monobehaviour` (boolean, optional): Filter to only MonoBehaviour classes
- `top_k` (number, optional, default: 5): Number of results to return

**Example:**
```typescript
// Find all Player-related classes with semantic search
search_code({ query: "Player movement controller", filter_type: "class", top_k: 10 })
```

#### 2. `search_metadata` - Metadata Search
Search through extracted metadata with flexible filtering and advanced options.

**Parameters:**
- `query` (string, required): Search query
- `search_type` (string, optional): Type of search (`assembly`, `type`, `method`, `field`)
- `assembly_name` (string, optional): Filter by assembly name
- `unity_version` (string, optional): Filter by Unity version
- `use_regex` (boolean, optional): Enable regex pattern matching
- `max_results` (number, optional): Maximum results to return

#### 3. `query_metadata` - Advanced Metadata Querying
Complex metadata queries with aggregations and cross-references.

**Parameters:**
- `filters` (object, optional): Complex filtering criteria
- `aggregations` (array, optional): Aggregation operations (`count`, `group_by`, `statistics`)
- `cross_reference` (object, optional): Cross-reference analysis configuration

### 🔬 Analysis Tools (15 tools)

#### 4. `find_monobehaviours` - Unity Component Discovery
Find and analyze MonoBehaviour classes for Unity component analysis.

**Parameters:**
- `query` (string, optional): Optional search query to filter MonoBehaviours
- `top_k` (number, optional, default: 10): Number of results to return

#### 5. `find_class_hierarchy` - Class Inheritance Analysis
Analyze class inheritance relationships and structure with detailed metadata.

**Parameters:**
- `class_name` (string, required): The name of the class to analyze
- `include_methods` (boolean, optional, default: true): Include methods in the output

#### 6. `find_enum_values` - Enum Definition Extraction
Extract enum definitions and their values with type information.

**Parameters:**
- `enum_name` (string, required): The name of the enum to find values for

#### 7. `analyze_dependencies` - Dependency Mapping
Comprehensive dependency analysis with circular dependency detection.

**Parameters:**
- `class_name` (string, required): Target class to analyze dependencies for
- `analysis_type` (enum, optional): Type of analysis (`incoming`, `outgoing`, `bidirectional`, `circular`)
- `depth` (number, optional, default: 3): How deep to traverse dependency chains (1-5)
- `include_system_types` (boolean, optional): Include Unity/System dependencies

#### 8. `find_cross_references` - Cross-Reference Analysis
Find all references to specific code entities across the codebase.

**Parameters:**
- `target_name` (string, required): Name of the target entity
- `target_type` (enum, required): Type of entity (`class`, `method`, `field`, `property`, `event`)
- `reference_type` (enum, optional): Type of references (`usage`, `inheritance`, `implementation`)
- `max_results` (number, optional): Maximum number of references to return

#### 9. `find_design_patterns` - Design Pattern Detection
Detect common design patterns with confidence scoring and examples.

**Parameters:**
- `pattern_types` (array, required): Array of patterns to detect (`singleton`, `observer`, `factory`, `strategy`, etc.)
- `confidence_threshold` (number, optional): Minimum confidence level (0.1-1.0)
- `include_partial_matches` (boolean, optional): Include partial pattern implementations

#### 10. `extract_metadata` - Assembly Metadata Extraction
Extract comprehensive assembly metadata, version information, and compilation flags.

**Parameters:**
- `content` (string, optional): IL2CPP dump content
- `file_path` (string, optional): Path to IL2CPP dump file
- `include_generic_instantiations` (boolean, optional): Include generic type instantiations
- `validate_structure` (boolean, optional): Validate extracted metadata structure

#### 11. `analyze_type_hierarchies` - Type System Analysis
Analyze complex type hierarchies including generics and constraints.

**Parameters:**
- `type_name` (string, required): Target type to analyze
- `include_constraints` (boolean, optional): Include generic constraints
- `max_depth` (number, optional): Maximum hierarchy depth to analyze

#### 12. `analyze_generic_types` - Generic Type Analysis
Specialized analysis of generic types and their instantiations.

**Parameters:**
- `type_name` (string, required): Generic type to analyze
- `include_instantiations` (boolean, optional): Include all instantiations
- `constraint_analysis` (boolean, optional): Analyze type constraints

#### 13. `analyze_type_dependencies` - Type Dependency Analysis
Analyze dependencies between types with detailed relationship mapping.

**Parameters:**
- `type_name` (string, required): Target type for dependency analysis
- `dependency_type` (enum, optional): Type of dependencies to analyze
- `include_indirect` (boolean, optional): Include indirect dependencies

#### 14. `analyze_type_compatibility` - Type Compatibility Analysis
Analyze type compatibility and conversion possibilities.

**Parameters:**
- `source_type` (string, required): Source type name
- `target_type` (string, required): Target type name
- `include_implicit_conversions` (boolean, optional): Include implicit conversions

#### 15. `track_assembly_metadata` - Assembly Version Tracking
Track assembly metadata changes and version comparisons.

**Parameters:**
- `tracking_id` (string, required): Unique tracking identifier
- `comparison_mode` (enum, optional): Comparison mode (`full`, `incremental`, `diff`)
- `include_dependencies` (boolean, optional): Include dependency tracking

#### 16. `analyze_asset_references` - Asset Reference Analysis
Analyze asset references and dependencies within IL2CPP code.

**Parameters:**
- `asset_type` (string, optional): Type of assets to analyze
- `include_missing_references` (boolean, optional): Include missing asset references
- `reference_depth` (number, optional): Depth of reference analysis

#### 17. `find_unused_assets` - Unused Asset Detection
Find potentially unused assets based on IL2CPP code analysis.

**Parameters:**
- `asset_types` (array, optional): Types of assets to check for usage
- `exclude_patterns` (array, optional): Patterns to exclude from analysis
- `confidence_threshold` (number, optional): Confidence threshold for unused detection

#### 18. `analyze_asset_dependencies` - Asset Dependency Analysis
Comprehensive analysis of asset dependencies and circular references.

**Parameters:**
- `include_circular_dependencies` (boolean, optional): Include circular dependency detection
- `asset_type_filter` (array, optional): Filter by specific asset types
- `dependency_depth` (number, optional): Maximum dependency depth to analyze

### ⚙️ Generation Tools (3 tools)

#### 19. `generate_class_wrapper` - C# Class Wrapper Generation
Generate C# wrapper classes from IL2CPP class definitions with full type fidelity.

**Parameters:**
- `class_name` (string, required): Name of the IL2CPP class to generate wrapper for
- `include_methods` (boolean, optional): Include method implementations
- `include_properties` (boolean, optional): Include property implementations
- `generate_interfaces` (boolean, optional): Generate interface definitions
- `custom_namespace` (string, optional): Custom namespace for generated code
- `unity_version` (string, optional): Target Unity version

**Example:**
```typescript
// Generate comprehensive wrapper for Player class
generate_class_wrapper({
  class_name: "Player",
  include_methods: true,
  generate_interfaces: true,
  custom_namespace: "Game.Wrappers"
})
```

#### 20. `generate_method_stubs` - Method Stub Generation
Generate method stubs and interfaces from IL2CPP class definitions.

**Parameters:**
- `class_name` (string, required): Name of the IL2CPP class to generate method stubs for
- `method_filter` (string, optional): Regex pattern to match specific methods
- `include_documentation` (boolean, optional): Include XML documentation comments
- `include_error_handling` (boolean, optional): Include error handling and validation
- `generate_async` (boolean, optional): Generate async/await patterns where applicable

#### 21. `generate_monobehaviour_template` - Unity MonoBehaviour Template Generation
Generate Unity-ready MonoBehaviour scripts with common patterns and lifecycle methods.

**Parameters:**
- `class_name` (string, required): Name of the IL2CPP MonoBehaviour class
- `template_type` (string, optional): Template type (`basic`, `ui`, `gameplay`, `system`)
- `include_lifecycle_methods` (boolean, optional): Include Unity lifecycle methods
- `include_unity_events` (boolean, optional): Include UnityEvent implementations
- `include_serialized_fields` (boolean, optional): Include SerializeField attributes

## 🤖 Agentic Workflows and Usage Examples

### Intelligent Tool Orchestration

The agentic layer automatically chains tools for complex analysis tasks:

```typescript
// Example: Comprehensive Player class analysis
// The system automatically orchestrates multiple tools:

1. search_code({ query: "Player", filter_type: "class" })
2. find_class_hierarchy({ class_name: "Player" })
3. analyze_dependencies({ class_name: "Player", analysis_type: "bidirectional" })
4. find_design_patterns({ pattern_types: ["singleton", "observer"] })
5. generate_class_wrapper({ class_name: "Player", include_methods: true })

// All executed intelligently with context preservation
```

### Context-Aware Analysis

```typescript
// Example: MonoBehaviour ecosystem analysis
// The agent maintains context across tool calls:

1. find_monobehaviours({ query: "Enemy" })
   // Context: Found EnemyController, EnemyAI, EnemyHealth

2. analyze_dependencies({ class_name: "EnemyController" })
   // Context: Uses previous results to analyze dependencies

3. find_cross_references({ target_name: "EnemyController", target_type: "class" })
   // Context: Correlates with dependency analysis

4. generate_monobehaviour_template({ class_name: "EnemyController" })
   // Context: Uses all previous analysis for optimal template generation
```

### Smart Caching and Performance

The agentic system implements intelligent caching:
- **Result Caching**: Frequently accessed analysis results are cached
- **Context Persistence**: Analysis context is preserved across sessions
- **Performance Learning**: The system learns from usage patterns to optimize future requests
- **Adaptive Batching**: Related tool calls are automatically batched for efficiency

### Resources

The server exposes resources through the MCP resource system:

- `il2cpp://{query}`: Retrieves code snippets matching the query with intelligent ranking
  - Query parameters:
    - `top_k`: Number of results to return (default: 5)
    - `filter_type`: Filter by entity type (class, method, enum, interface)
    - `filter_namespace`: Filter by namespace
    - `filter_monobehaviour`: Filter to only include MonoBehaviour classes
    - `context_aware`: Enable context-aware result ranking (default: true)

## Development

### Development Mode

1. **Run in development mode:**
   ```bash
   npm run dev
   ```

2. **Run tests:**
   ```bash
   npm test
   npm run test:watch    # Watch mode
   npm run test:coverage # With coverage
   ```

3. **Lint and format code:**
   ```bash
   npm run lint
   npm run format
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

### Testing

The project includes comprehensive Jest testing infrastructure with agentic component coverage:

- **Unit Tests**: All MCP tools, agentic components, and core functionality
- **Integration Tests**: Vector store operations, Supabase integration, and tool orchestration
- **Performance Tests**: Large file processing, embedding generation, and agentic workflow optimization
- **Agentic Tests**: Context management, tool selection, and intelligent orchestration
- **Error Handling Tests**: Edge cases, error scenarios, and recovery mechanisms

Run specific test suites:
```bash
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:performance # Performance tests only
npm run test:mcp-tools   # MCP tool-specific tests
npm run test             # Full test suite including agentic components
```

### Agentic Component Testing

```bash
# Test agentic orchestration
npm run test -- --testPathPattern=agent

# Test intelligent tool selection
npm run test -- --testPathPattern=mcp-tool-selector

# Test context management
npm run test -- --testPathPattern=mcp-context-manager
```


## Project Structure

```
src/
├── __tests__/              # Test files and test utilities
│   ├── setup.ts           # Jest test setup
│   ├── test-data.ts       # Mock IL2CPP data for testing
│   ├── agent/             # Agentic component tests
│   ├── integration/       # Integration tests
│   ├── mcp/               # MCP tool tests
│   └── *.test.ts          # Individual test files
├── agent/                 # Agentic Intelligence Layer
│   ├── mcp-orchestrator.ts # Intelligent tool orchestration
│   ├── mcp-context-manager.ts # Context management and persistence
│   ├── mcp-performance-optimizer.ts # Performance optimization
│   ├── mcp-response-synthesizer.ts # Multi-tool result synthesis
│   ├── mcp-tool-selector.ts # AI-driven tool selection
│   ├── types.ts           # Agentic type definitions
│   └── index.ts           # Agent exports
├── config/                 # Configuration utilities
├── database/              # Database connection and management
│   ├── connection-manager.ts # Database connection pooling
│   ├── enhanced-vector-store.ts # Enhanced vector operations
│   └── performance-monitor.ts # Database performance monitoring
├── embeddings/            # Embedding generation and vector storage
│   ├── chunker.ts         # IL2CPP-specific code chunking
│   ├── xenova-embeddings.ts # Xenova Transformers.js integration
│   ├── supabase-vector-store.ts # Supabase vector store implementation
│   └── vector-store.ts    # Main vector store interface
├── generator/             # Code generation infrastructure
│   ├── types.ts           # TypeScript interfaces for code generation
│   ├── base-generator.ts  # Abstract base class for generators
│   ├── template-engine.ts # Template engine integration
│   ├── class-wrapper-generator.ts # C# class wrapper generator
│   ├── method-stub-generator.ts # Method stub generator
│   ├── monobehaviour-generator.ts # Unity MonoBehaviour template generator
│   └── index.ts           # Generator exports
├── indexer/               # File indexing and processing
│   └── indexer.ts         # Main indexing logic with hash management
├── mcp/                   # MCP server implementation
│   ├── mcp-sdk-server.ts  # Main MCP server with all tools
│   ├── stdio-server.ts    # Stdio transport server
│   ├── tools/             # MCP tool implementations (21 tools)
│   │   ├── search-code-tool.ts # Semantic code search
│   │   ├── find-monobehaviours-tool.ts # MonoBehaviour discovery
│   │   ├── analyze-dependencies-tool.ts # Dependency analysis
│   │   ├── generate-class-wrapper-tool.ts # Code generation
│   │   ├── tool-registry.ts # Tool registration and metadata
│   │   └── ... (18 more tools)
│   └── types.ts           # MCP type definitions
├── metadata/              # Metadata analysis and extraction
│   └── type-analyzer.ts   # Advanced type analysis
├── monitoring/            # System monitoring and health
│   ├── health-service.ts  # Health monitoring
│   ├── metrics-service.ts # Performance metrics
│   └── lifecycle-manager.ts # Component lifecycle management
├── parser/                # IL2CPP dump file parsing
│   ├── il2cpp-parser.ts   # Main parser implementation
│   ├── enhanced-il2cpp-parser.ts # Enhanced parser with metadata
│   ├── advanced-parser.ts # Advanced parsing capabilities
│   └── index.ts           # Parser exports
├── performance/           # Performance optimization
│   ├── chunked-processor.ts # Chunked processing for large files
│   ├── batch-vector-store.ts # Batch vector operations
│   └── streaming-parser.ts # Streaming parser for memory efficiency
├── transport/             # Transport layer implementations
│   ├── http-transport.ts  # HTTP transport
│   ├── transport-factory.ts # Transport factory
│   └── index.ts           # Transport exports
└── utils/                 # Utility functions
    ├── hash-manager.ts    # File hash management
    ├── supabase-hash-manager.ts # Supabase-based hash storage
    ├── mcp-response-formatter.ts # Response formatting
    └── parameter-validator.ts # Parameter validation

bin/
└── il2cpp-mcp-stdio.js    # Executable MCP server binary

examples/                   # Code generation examples and documentation
├── README.md              # Examples overview
├── class-wrapper-example.md # Class wrapper generation examples
├── method-stubs-example.md # Method stub generation examples
└── monobehaviour-template-example.md # MonoBehaviour template examples

supabase-setup.sql          # Supabase database schema
```

## 🏗️ Architecture

### Foundation Layer
1. **Enhanced IL2CPP Parser**: Advanced parsing with metadata extraction and type analysis
2. **Semantic Code Chunker**: Context-preserving chunking with IL2CPP-specific optimizations
3. **Xenova Embeddings Engine**: 384-dimensional embeddings using Transformers.js all-MiniLM-L6-v2
4. **Supabase Vector Store**: High-performance vector search with pgvector extension
5. **Hash-based Change Detection**: Intelligent file change tracking and incremental processing

### Agentic Intelligence Layer
6. **MCP Tool Orchestrator**: Intelligent tool selection and workflow automation
7. **Context Manager**: Persistent context across tool calls with smart compression
8. **Performance Optimizer**: Real-time performance monitoring and optimization
9. **Response Synthesizer**: Multi-tool result aggregation and correlation
10. **Tool Selector**: AI-driven tool selection based on task requirements

### MCP Server Layer
11. **MCP SDK Server**: Official MCP TypeScript SDK implementation with 21 specialized tools
12. **Transport Layer**: Multi-transport support (stdio, HTTP, SSE) with connection pooling
13. **Validation Engine**: Comprehensive Zod schema validation with error recovery
14. **Resource Manager**: Efficient memory management and connection handling

### Data Flow with Agentic Enhancement

1. **Input Processing**: IL2CPP dump.cs file with intelligent preprocessing
2. **Agentic Analysis**: Smart task decomposition and tool selection
3. **Parallel Processing**: Concurrent parsing, chunking, and embedding generation
4. **Vector Storage**: Optimized storage in Supabase with intelligent indexing
5. **Context-Aware Retrieval**: Smart caching and context-aware search
6. **Multi-Tool Orchestration**: Automated tool chaining for complex analysis
7. **Result Synthesis**: Intelligent aggregation and correlation of results
8. **Adaptive Learning**: Performance optimization based on usage patterns

## MCP SDK Integration

This project uses the official Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk`) for full MCP compliance:

### Key Features
- **Standardized Protocol**: Full MCP specification compliance
- **Resource Templates**: Expose IL2CPP data through MCP resources
- **Tool Definitions**: Comprehensive parameter validation using Zod schemas
- **Stdio Transport**: Optimized for desktop applications and command-line tools
- **Error Handling**: Robust error management with detailed logging
- **Session Management**: Stateful interactions with MCP clients

### Transport Configuration
The server uses **stdio transport only** for optimal compatibility with:
- Claude Desktop
- Command-line MCP clients
- Desktop applications
- Development tools

## Performance Considerations

- **Incremental Processing**: Hash-based change detection avoids reprocessing
- **Efficient Chunking**: Semantic-aware chunking preserves code meaning
- **Vector Optimization**: 384-dimensional embeddings balance quality and performance
- **Database Indexing**: Optimized Supabase queries with proper indexing
- **Memory Management**: Streaming processing for large dump files

## Troubleshooting

### Common Issues

1. **Supabase Connection Errors**
   - Verify `SUPABASE_URL` and `SUPABASE_KEY` in `.env`
   - Ensure pgvector extension is enabled
   - Check network connectivity

2. **Embedding Generation Slow**
   - First run downloads the model (~90MB)
   - Subsequent runs use cached model
   - Consider using faster hardware for large files

3. **MCP Client Connection Issues**
   - Verify stdio transport configuration
   - Check file permissions on `bin/il2cpp-mcp-stdio.js`
   - Ensure Node.js is in PATH

4. **Memory Issues with Large Files**
   - Increase Node.js memory limit: `node --max-old-space-size=4096`
   - Consider chunking very large dump files

5. **Code Generation Issues**
   - **Class Not Found**: Ensure the class exists in the IL2CPP dump and is properly indexed
   - **Invalid Generated Code**: Check Unity version compatibility and namespace conflicts
   - **Missing Dependencies**: Verify all required using statements are included
   - **Type Resolution Errors**: Ensure IL2CPP dump contains complete type information

6. **MonoBehaviour Generation Issues**
   - **Not a MonoBehaviour**: Verify the target class inherits from MonoBehaviour
   - **Missing Unity Methods**: Check Unity version compatibility for lifecycle methods
   - **Serialization Issues**: Ensure fields are properly marked as serializable

## 🐳 Docker Support

The IL2CPP Dump Analyzer MCP system includes comprehensive Docker support for easy deployment and development.

### Quick Start with Docker

1. **Setup Environment**:
   ```bash
   # Linux/macOS
   ./docker-setup.sh

   # Windows PowerShell
   .\docker-setup.ps1
   ```

2. **Start Production Environment**:
   ```bash
   docker-compose --env-file .env.docker up -d
   ```

3. **Start Development Environment**:
   ```bash
   docker-compose -f docker-compose.dev.yml --env-file .env.docker.dev up -d
   ```

### Docker Architecture

The system uses a multi-container architecture:
- **IL2CPP MCP Server**: Main application container with Xenova embeddings
- **Supabase Database**: PostgreSQL with pgvector extension
- **Supabase REST API**: PostgREST API gateway
- **Kong Gateway**: API gateway and routing (production)
- **Supabase Studio**: Database management UI (development)

### Recent Docker Improvements

✅ **Fixed Xenova Model Loading**: Proper path resolution and timeout handling
✅ **Enhanced Memory Management**: Increased limits for model loading (4GB)
✅ **Improved Startup Times**: Extended health check periods (5 minutes)
✅ **Better Error Handling**: Retry logic and graceful failure recovery
✅ **Volume Optimization**: Named volumes for better cross-platform compatibility

### Troubleshooting

If you encounter Docker issues, see [DOCKER-TROUBLESHOOTING.md](./DOCKER-TROUBLESHOOTING.md) for detailed solutions.

## 🤝 Contributing

We welcome contributions to the IL2CPP Dump Analyzer Agentic RAG MCP System! Please follow these guidelines:

### Development Guidelines

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-agentic-feature`
3. **Follow Test-Driven Development (TFD)**: Write tests before implementing features
4. **Add comprehensive tests**: Include unit, integration, and agentic component tests
5. **Run the full test suite**: `npm test`
6. **Test agentic components**: `npm run test -- --testPathPattern=agent`
7. **Commit your changes**: `git commit -m 'Add amazing agentic feature'`
8. **Push to the branch**: `git push origin feature/amazing-agentic-feature`
9. **Open a Pull Request**

### Agentic Development Guidelines

When contributing to agentic components:

- **Context Preservation**: Ensure context is properly managed across tool calls
- **Performance Optimization**: Consider performance implications of intelligent workflows
- **Tool Orchestration**: Design workflows that intelligently chain MCP tools
- **Error Recovery**: Implement robust error handling and recovery mechanisms
- **Adaptive Learning**: Consider how the system can learn from usage patterns

### Code Quality Standards

- **TypeScript Strict Mode**: Maintain full TypeScript compliance
- **JSDoc Documentation**: Document all functions with comprehensive JSDoc comments
- **Zod Validation**: Use Zod schemas for all input validation
- **MCP Compliance**: Ensure all MCP tools follow the official specification
- **Agentic Patterns**: Follow established patterns for agentic component development

## License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the MCP specification and agentic framework foundation
- [Xenova/Transformers.js](https://github.com/xenova/transformers.js) for client-side embeddings and AI capabilities
- [Supabase](https://supabase.com/) for vector database infrastructure and real-time capabilities
- [TypeScript](https://www.typescriptlang.org/) for type safety and development experience
- Unity Technologies for IL2CPP technology and game development innovation
- The open-source community for continuous inspiration and collaboration

---

**Built with ❤️ for the Unity game development and reverse engineering community**

*Empowering developers with intelligent IL2CPP analysis through agentic AI and the Model Context Protocol*
