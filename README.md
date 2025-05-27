# Unity IL2CPP Dump Analyzer MCP System

A specialized Retrieval-Augmented Generation (RAG) system for analyzing IL2CPP dump.cs files from Unity games. This system implements the Model Context Protocol (MCP) server specification using the official MCP TypeScript SDK to enable standardized interactions with LLM clients like Claude Desktop, GPT, and other MCP-compatible tools.

## Features

### Core Capabilities
- **IL2CPP Dump File Processing**: Parse and analyze IL2CPP dump.cs files (C# code decompiled from Unity IL2CPP builds)
- **Semantic Code Chunking**: Specialized IL2CPPCodeChunker preserves code context and meaning
- **Advanced Embeddings**: Uses Xenova's Transformers.js with the all-MiniLM-L6-v2 model (384-dimensional embeddings)
- **Supabase Vector Database**: High-performance vector search with pgvector extension
- **Hash-based Change Detection**: Avoid reprocessing unchanged files for efficiency

### Advanced Analysis Tools
- **MonoBehaviour Discovery**: Find and analyze Unity component classes
- **Class Hierarchy Analysis**: Explore inheritance relationships and dependencies
- **Cross-Reference Analysis**: Track usage patterns and relationships between code entities
- **Design Pattern Detection**: Identify common design patterns (Singleton, Observer, Factory, etc.)
- **Dependency Mapping**: Analyze incoming/outgoing dependencies and circular references
- **Enum Value Extraction**: Retrieve enum definitions and their values

### Code Generation Tools
- **Class Wrapper Generation**: Generate C# wrapper classes from IL2CPP class definitions
- **Method Stub Generation**: Create method stubs with proper signatures and basic implementation
- **MonoBehaviour Template Generation**: Generate Unity-ready MonoBehaviour scripts with lifecycle methods

### MCP Integration
- **Official MCP SDK**: Full compliance with Model Context Protocol specification
- **Stdio Transport**: Optimized for command-line tools and desktop applications
- **Comprehensive Tool Suite**: 6 specialized MCP tools for IL2CPP analysis
- **Input Validation**: Zod schemas ensure robust parameter validation
- **Error Handling**: Comprehensive error management with detailed logging

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

## MCP Tools and Resources

The server provides 10 comprehensive MCP tools for IL2CPP analysis and code generation:

### 1. `search_code` - General Code Search
Search for code entities with advanced filtering capabilities.

**Parameters:**
- `query` (string, required): The search query
- `filter_type` (string, optional): Filter by entity type (`class`, `method`, `enum`, `interface`)
- `filter_namespace` (string, optional): Filter by namespace
- `filter_monobehaviour` (boolean, optional): Filter to only MonoBehaviour classes
- `top_k` (number, optional, default: 5): Number of results to return

**Example:**
```typescript
// Find all Player-related classes
search_code({ query: "Player", filter_type: "class", top_k: 10 })
```

### 2. `find_monobehaviours` - Unity Component Discovery
Find MonoBehaviour classes for Unity component analysis.

**Parameters:**
- `query` (string, optional): Optional search query to filter MonoBehaviours
- `top_k` (number, optional, default: 10): Number of results to return

**Example:**
```typescript
// Find all MonoBehaviour classes related to "Enemy"
find_monobehaviours({ query: "Enemy", top_k: 5 })
```

### 3. `find_class_hierarchy` - Class Inheritance Analysis
Analyze class inheritance relationships and structure.

**Parameters:**
- `class_name` (string, required): The name of the class to analyze
- `include_methods` (boolean, optional, default: true): Include methods in the output

**Example:**
```typescript
// Analyze the Player class hierarchy
find_class_hierarchy({ class_name: "Player", include_methods: true })
```

### 4. `find_enum_values` - Enum Definition Extraction
Extract enum definitions and their values.

**Parameters:**
- `enum_name` (string, required): The name of the enum to find values for

**Example:**
```typescript
// Get values for GameState enum
find_enum_values({ enum_name: "GameState" })
```

### 5. `analyze_dependencies` - Dependency Mapping
Analyze class dependencies and relationships.

**Parameters:**
- `class_name` (string, required): Target class to analyze dependencies for
- `analysis_type` (enum, optional, default: "bidirectional"): Type of analysis (`incoming`, `outgoing`, `bidirectional`, `circular`)
- `depth` (number, optional, default: 3): How deep to traverse dependency chains (1-5)
- `include_system_types` (boolean, optional, default: false): Include Unity/System dependencies

**Example:**
```typescript
// Analyze all dependencies for Player class
analyze_dependencies({
  class_name: "Player",
  analysis_type: "bidirectional",
  depth: 2
})
```

### 6. `find_cross_references` - Cross-Reference Analysis
Find all references to a specific code entity.

**Parameters:**
- `target_name` (string, required): Name of the target entity
- `target_type` (enum, required): Type of entity (`class`, `method`, `field`, `property`, `event`, `enum`, `interface`)
- `reference_type` (enum, optional, default: "all"): Type of references (`usage`, `inheritance`, `implementation`, `declaration`, `all`)
- `include_nested` (boolean, optional, default: true): Include references within nested types
- `include_system_types` (boolean, optional, default: false): Include references from Unity/System types
- `max_results` (number, optional, default: 50): Maximum number of references (1-200)

**Example:**
```typescript
// Find all usages of the Transform class
find_cross_references({
  target_name: "Transform",
  target_type: "class",
  reference_type: "usage",
  max_results: 100
})
```

### 7. `find_design_patterns` - Design Pattern Detection
Detect common design patterns in the codebase.

**Parameters:**
- `pattern_types` (array, required): Array of patterns to detect (`singleton`, `observer`, `factory`, `strategy`, `command`, `state`, `decorator`, `adapter`, `facade`, `proxy`, `builder`, `template_method`, `chain_of_responsibility`, `mediator`, `memento`, `visitor`, `flyweight`, `composite`, `bridge`, `abstract_factory`, `prototype`, `iterator`)
- `confidence_threshold` (number, optional, default: 0.7): Minimum confidence level (0.1-1.0)
- `include_partial_matches` (boolean, optional, default: true): Include partial pattern implementations
- `namespace_scope` (string, optional): Limit search to specific namespace pattern
- `exclude_unity_patterns` (boolean, optional, default: false): Exclude Unity-specific patterns
- `max_results_per_pattern` (number, optional, default: 10): Maximum results per pattern (1-50)

**Example:**
```typescript
// Detect Singleton and Observer patterns
find_design_patterns({
  pattern_types: ["singleton", "observer"],
  confidence_threshold: 0.8,
  include_partial_matches: false
})
```

### 8. `generate_class_wrapper` - C# Class Wrapper Generation
Generate C# wrapper classes from IL2CPP class definitions with full type fidelity.

**Parameters:**
- `class_name` (string, required): Name of the IL2CPP class to generate wrapper for
- `include_documentation` (boolean, optional, default: true): Include XML documentation comments
- `include_unity_attributes` (boolean, optional, default: true): Include Unity-specific attributes
- `include_serialization` (boolean, optional, default: true): Include serialization attributes
- `custom_namespace` (string, optional): Custom namespace for generated code
- `unity_version` (string, optional): Target Unity version (e.g., '2021.3.0')
- `additional_usings` (array, optional): Additional using statements to include

**Example:**
```typescript
// Generate wrapper for Player class
generate_class_wrapper({
  class_name: "Player",
  include_documentation: true,
  include_unity_attributes: true,
  unity_version: "2022.3.0",
  additional_usings: ["System.Collections.Generic"]
})
```

### 9. `generate_method_stubs` - Method Stub Generation
Generate method stubs with correct signatures and basic implementation from IL2CPP methods.

**Parameters:**
- `class_name` (string, required): Name of the IL2CPP class to generate method stubs for
- `method_filter` (string, optional): Optional regex pattern to match specific methods
- `include_documentation` (boolean, optional, default: true): Include XML documentation comments
- `include_error_handling` (boolean, optional, default: true): Include error handling and validation
- `generate_async` (boolean, optional, default: false): Generate async/await patterns where applicable
- `custom_namespace` (string, optional): Custom namespace for generated code
- `unity_version` (string, optional): Target Unity version
- `additional_usings` (array, optional): Additional using statements to include

**Example:**
```typescript
// Generate method stubs for Player class
generate_method_stubs({
  class_name: "Player",
  method_filter: "Move.*",
  include_error_handling: true,
  generate_async: false
})
```

### 10. `generate_monobehaviour_template` - Unity MonoBehaviour Template Generation
Generate Unity-ready MonoBehaviour scripts with proper lifecycle methods and serialization.

**Parameters:**
- `class_name` (string, required): Name of the IL2CPP MonoBehaviour class to generate template for
- `include_documentation` (boolean, optional, default: true): Include XML documentation comments
- `include_unity_attributes` (boolean, optional, default: true): Include Unity-specific attributes (SerializeField, etc.)
- `include_serialization` (boolean, optional, default: true): Include serialization attributes
- `custom_namespace` (string, optional): Custom namespace for generated code
- `unity_version` (string, optional): Target Unity version (e.g., '2021.3.0')
- `additional_usings` (array, optional): Additional using statements to include

**Example:**
```typescript
// Generate MonoBehaviour template for EnemyController
generate_monobehaviour_template({
  class_name: "EnemyController",
  include_unity_attributes: true,
  unity_version: "2022.3.0",
  custom_namespace: "Game.Enemies"
})
```

### Resources

The server also exposes resources through the MCP resource system:

- `il2cpp://{query}`: Retrieves code snippets matching the query
  - Query parameters:
    - `top_k`: Number of results to return (default: 5)
    - `filter_type`: Filter by entity type (class, method, enum, interface)
    - `filter_namespace`: Filter by namespace
    - `filter_monobehaviour`: Filter to only include MonoBehaviour classes

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

The project includes comprehensive Jest testing infrastructure:

- **Unit tests**: All MCP tools and core functionality
- **Integration tests**: Vector store operations and Supabase integration
- **Performance tests**: Large file processing and embedding generation
- **Error handling tests**: Edge cases and error scenarios

Run specific test suites:
```bash
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:performance # Performance tests only
```

### Environment Variables

All available environment variables:

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
```

## Project Structure

```
src/
├── __tests__/              # Test files and test utilities
│   ├── setup.ts           # Jest test setup
│   ├── test-data.ts       # Mock IL2CPP data for testing
│   └── *.test.ts          # Individual test files
├── config/                 # Configuration utilities
├── database/              # Database connection and management
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
│   └── types.ts           # MCP type definitions
├── parser/                # IL2CPP dump file parsing
│   ├── il2cpp-parser.ts   # Main parser implementation
│   ├── enhanced-il2cpp-parser.ts # Enhanced parser with metadata
│   └── index.ts           # Parser exports
└── utils/                 # Utility functions
    ├── hash-manager.ts    # File hash management
    └── supabase-hash-manager.ts # Supabase-based hash storage

bin/
└── il2cpp-mcp-stdio.js    # Executable MCP server binary

examples/                   # Code generation examples and documentation
├── README.md              # Examples overview
├── class-wrapper-example.md # Class wrapper generation examples
├── method-stubs-example.md # Method stub generation examples
└── monobehaviour-template-example.md # MonoBehaviour template examples

supabase-setup.sql          # Supabase database schema
```

## Architecture

### Core Components

1. **IL2CPP Parser**: Extracts classes, methods, enums, and interfaces from dump files
2. **Semantic Chunker**: Preserves code context while creating manageable chunks
3. **Xenova Embeddings**: Generates 384-dimensional embeddings using Transformers.js
4. **Supabase Vector Store**: High-performance vector search with pgvector
5. **MCP Server**: Official SDK implementation with 10 specialized tools
6. **Hash Manager**: Efficient change detection to avoid reprocessing
7. **Code Generators**: Generate C# code from IL2CPP definitions with full type fidelity

### Data Flow

1. **Input**: IL2CPP dump.cs file
2. **Parsing**: Extract code entities with metadata
3. **Chunking**: Create semantic chunks preserving context
4. **Embedding**: Generate vectors using all-MiniLM-L6-v2
5. **Storage**: Store in Supabase with hash-based deduplication
6. **Analysis**: MCP tools provide advanced analysis capabilities
7. **Generation**: Code generators create C# implementations from IL2CPP definitions

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

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the MCP specification
- [Xenova/Transformers.js](https://github.com/xenova/transformers.js) for client-side embeddings
- [Supabase](https://supabase.com/) for vector database infrastructure
- Unity Technologies for IL2CPP technology
