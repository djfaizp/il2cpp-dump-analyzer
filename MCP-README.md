# IL2CPP Dump Analyzer MCP Tools Documentation

A comprehensive Model Context Protocol (MCP) server for analyzing IL2CPP dump.cs files from Unity games. This system provides a specialized RAG (Retrieval-Augmented Generation) system with 6 advanced MCP tools that enable AI assistants to understand and analyze Unity game code structures.

## Overview

The IL2CPP Dump Analyzer MCP system provides deep analysis capabilities for Unity IL2CPP dump files through the Model Context Protocol. It uses advanced semantic embeddings, vector search, and specialized parsing to offer comprehensive code analysis tools.

### Key Features

- **Semantic Code Analysis**: Advanced parsing with context preservation
- **Vector-based Search**: High-performance similarity search using Xenova embeddings
- **Supabase Integration**: Scalable vector database with pgvector extension
- **MCP Compliance**: Full Model Context Protocol specification compliance
- **Stdio Transport**: Optimized for desktop applications and command-line tools
- **Comprehensive Toolset**: 6 specialized analysis tools for different use cases

### Supported Analysis Types

- **MonoBehaviour Discovery**: Find and analyze Unity component classes
- **Class Hierarchy Analysis**: Understand inheritance relationships and dependencies
- **Cross-Reference Analysis**: Track usage patterns and relationships between entities
- **Design Pattern Detection**: Identify common design patterns with confidence scoring
- **Dependency Mapping**: Analyze coupling, circular dependencies, and architectural insights
- **Enum Value Extraction**: Access enum definitions and their values

## Installation & Setup

### Prerequisites

- Node.js 18.x or higher
- Supabase account (required for vector storage)
- IL2CPP dump.cs file from a Unity game

### Installation

1. **Clone and install:**
   ```bash
   git clone https://github.com/yourusername/il2cpp-dump-analyzer-mcp.git
   cd il2cpp-dump-analyzer-mcp
   npm install
   npm run build
   ```

2. **Configure environment:**
   ```bash
   cp simple.env .env
   # Edit .env with your Supabase credentials
   ```

3. **Set up Supabase:**
   - Create a Supabase project
   - Run the SQL in `supabase-setup.sql`
   - Update `.env` with your Supabase URL and key

### MCP Client Configuration

#### Claude Desktop

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "il2cpp-analyzer": {
      "command": "node",
      "args": ["./bin/il2cpp-mcp-stdio.js"],
      "cwd": "/path/to/il2cpp-dump-analyzer-mcp",
      "env": {
        "DUMP_FILE_PATH": "/path/to/your/dump.cs"
      }
    }
  }
}
```

#### Direct Execution

```bash
# Start the MCP server with stdio transport
node ./bin/il2cpp-mcp-stdio.js

# Or use npm script
npm start
```

## Environment Configuration

Required environment variables:

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

## MCP Tools Reference

The IL2CPP Dump Analyzer provides 6 comprehensive MCP tools for different analysis scenarios:

### 1. search_code - General Code Search

**Purpose**: Search for code entities with advanced filtering capabilities.

**Parameters**:
- `query` (string, required): The search query
- `filter_type` (string, optional): Filter by entity type (`class`, `method`, `enum`, `interface`)
- `filter_namespace` (string, optional): Filter by namespace
- `filter_monobehaviour` (boolean, optional): Filter to only MonoBehaviour classes
- `top_k` (number, optional, default: 5): Number of results to return

**Response**: Returns matching code entities with metadata including content, name, namespace, type, and inheritance information.

**Example**:
```typescript
search_code({
  query: "Player",
  filter_type: "class",
  top_k: 10
})
```

### 2. find_monobehaviours - Unity Component Discovery

**Purpose**: Find MonoBehaviour classes for Unity component analysis.

**Parameters**:
- `query` (string, optional): Optional search query to filter MonoBehaviours
- `top_k` (number, optional, default: 10): Number of results to return

**Response**: Returns MonoBehaviour classes with their methods, inheritance, and Unity-specific metadata.

**Example**:
```typescript
find_monobehaviours({
  query: "Enemy",
  top_k: 5
})
```

### 3. find_class_hierarchy - Class Inheritance Analysis

**Purpose**: Analyze class inheritance relationships and structure.

**Parameters**:
- `class_name` (string, required): The name of the class to analyze
- `include_methods` (boolean, optional, default: true): Whether to include methods in the output

**Response**: Returns detailed class hierarchy information including base classes, interfaces, and optionally methods with their signatures.

**Example**:
```typescript
find_class_hierarchy({
  class_name: "Player",
  include_methods: true
})
```

### 4. find_enum_values - Enum Definition Extraction

**Purpose**: Extract enum definitions and their values.

**Parameters**:
- `enum_name` (string, required): The name of the enum to find values for

**Response**: Returns enum definition with all values and their numeric assignments.

**Example**:
```typescript
find_enum_values({
  enum_name: "GameState"
})
```

### 5. analyze_dependencies - Dependency Mapping

**Purpose**: Analyze class dependencies and relationships with coupling metrics.

**Parameters**:
- `class_name` (string, required): Target class to analyze dependencies for
- `analysis_type` (enum, optional, default: "bidirectional"): Type of analysis
  - `"incoming"`: Classes that depend on the target
  - `"outgoing"`: Classes the target depends on
  - `"bidirectional"`: Both incoming and outgoing
  - `"circular"`: Focus on circular dependency detection
- `depth` (number, optional, default: 3): How deep to traverse dependency chains (1-5)
- `include_system_types` (boolean, optional, default: false): Include Unity/System dependencies

**Response**: Returns comprehensive dependency analysis with coupling metrics, circular dependency detection, and architectural insights.

**Example**:
```typescript
analyze_dependencies({
  class_name: "Player",
  analysis_type: "bidirectional",
  depth: 2,
  include_system_types: false
})
```

### 6. find_cross_references - Cross-Reference Analysis

**Purpose**: Find all references to a specific code entity across the codebase.

**Parameters**:
- `target_name` (string, required): Name of the target entity to find references for
- `target_type` (enum, required): Type of entity (`class`, `method`, `field`, `property`, `event`, `enum`, `interface`)
- `reference_type` (enum, optional, default: "all"): Type of references to find
  - `"usage"`: General usage references
  - `"inheritance"`: Inheritance relationships
  - `"implementation"`: Interface implementations
  - `"declaration"`: Declaration references
  - `"all"`: All reference types
- `include_nested` (boolean, optional, default: true): Include references within nested types
- `include_system_types` (boolean, optional, default: false): Include references from Unity/System types
- `max_results` (number, optional, default: 50): Maximum number of references to return (1-200)

**Response**: Returns detailed cross-reference analysis with usage patterns, context information, and relationship details.

**Example**:
```typescript
find_cross_references({
  target_name: "Transform",
  target_type: "class",
  reference_type: "usage",
  max_results: 100
})
```

### 7. find_design_patterns - Design Pattern Detection

**Purpose**: Detect and analyze common design patterns in the codebase.

**Parameters**:
- `pattern_types` (array, required): Array of design patterns to detect. Supported patterns:
  - Creational: `singleton`, `factory`, `abstract_factory`, `builder`, `prototype`
  - Structural: `adapter`, `bridge`, `composite`, `decorator`, `facade`, `flyweight`, `proxy`
  - Behavioral: `observer`, `strategy`, `command`, `state`, `template_method`, `chain_of_responsibility`, `mediator`, `memento`, `visitor`, `iterator`
- `confidence_threshold` (number, optional, default: 0.7): Minimum confidence level (0.1-1.0)
- `include_partial_matches` (boolean, optional, default: true): Include partial pattern implementations
- `namespace_scope` (string, optional): Limit search to specific namespace pattern
- `exclude_unity_patterns` (boolean, optional, default: false): Exclude Unity-specific pattern implementations
- `max_results_per_pattern` (number, optional, default: 10): Maximum results per pattern type (1-50)

**Response**: Returns design pattern analysis with confidence scores, implementation details, evidence, and architectural insights.

**Example**:
```typescript
find_design_patterns({
  pattern_types: ["singleton", "observer", "factory"],
  confidence_threshold: 0.8,
  include_partial_matches: false
})
```

## Response Format

All tools return responses in the following MCP-compliant format:

```typescript
{
  content: [
    {
      type: "text",
      text: string  // JSON-formatted response data
    }
  ]
}
```

The `text` field contains a JSON string with the tool-specific response structure, including:
- Main result data
- Metadata (timestamps, query parameters, result counts)
- Error information (if applicable)

## Error Handling

The MCP server provides comprehensive error handling:

- **Validation Errors**: Invalid parameters are caught with detailed error messages
- **Not Found Errors**: When entities are not found, helpful suggestions are provided
- **System Errors**: Database and processing errors are handled gracefully
- **Timeout Handling**: Long-running operations have appropriate timeouts

## Performance Considerations

- **Incremental Processing**: Hash-based change detection avoids reprocessing unchanged files
- **Vector Search Optimization**: Efficient similarity search with configurable result limits
- **Memory Management**: Streaming processing for large dump files
- **Caching**: Embedding models and processed data are cached for performance

## Requirements

- Node.js 18.x or higher
- Supabase account with pgvector extension
- IL2CPP dump.cs file from a Unity game
- Minimum 4GB RAM for large dump files
- Internet connection for initial model download (~90MB)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues, feature requests, or contributions, please visit the [GitHub repository](https://github.com/yourusername/il2cpp-dump-analyzer-mcp).
