# Unity IL2CPP Dump Analyzer: Agentic RAG System

A specialized Retrieval-Augmented Generation (RAG) system for analyzing IL2CPP dump.cs files from Unity games. This system implements the Model Context Protocol (MCP) server specification using the official MCP TypeScript SDK to enable standardized interactions with LLM clients like Claude and GPT.

## Features

- **IL2CPP Dump File Processing**: Parse and analyze IL2CPP dump.cs files (C# code decompiled from Unity IL2CPP builds)
- **Advanced Embeddings**: Uses Xenova's Transformers.js with the all-MiniLM-L6-v2 model for high-quality embeddings
- **Knowledge Retrieval System**: Integrate with Context7 as the knowledge retrieval engine
- **Agent Architecture**: Parse natural language queries about game mechanics or code structure
- **Official MCP SDK Integration**: Uses the Model Context Protocol TypeScript SDK for full MCP compliance

## Prerequisites

- Node.js 18.x or higher
- Supabase account (optional, for vector database storage)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/il2cpp-dump-analyzer.git
   cd il2cpp-dump-analyzer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on the example (optional):
   ```bash
   cp .env.example .env
   ```

4. Customize settings in the `.env` file:
   ```
   # Server configuration
   PORT=3000
   HOST=localhost

   # Embedding model configuration
   EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

   # Vector database configuration (for Supabase)
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   SUPABASE_TABLE=il2cpp_documents
   ```

5. Set up Supabase (optional, for vector database storage):
   - Create a new Supabase project
   - Run the SQL commands in `supabase-setup.sql` in the Supabase SQL editor
   - Update the `.env` file with your Supabase URL and API key

## Usage

1. Place your IL2CPP dump.cs file in the root directory of the project.

2. Build and start the server:
   ```bash
   npm run build
   npm start
   ```

3. The server will:
   - Parse the dump.cs file
   - Create chunks and embeddings
   - Start an MCP-compliant server

4. Use the MCP server URL with compatible LLM clients:
   - For Claude: Use the URL as a Context7 knowledge source
   - For GPT: Use the URL with the MCP tool

## MCP Resources and Tools

The server exposes IL2CPP dump data through the Model Context Protocol using the official MCP TypeScript SDK.

### Resources

- `il2cpp://{query}`: Retrieves code snippets matching the query
  - Query parameters:
    - `top_k`: Number of results to return (default: 5)
    - `filter_type`: Filter by entity type (class, method, enum, interface)
    - `filter_namespace`: Filter by namespace
    - `filter_monobehaviour`: Filter to only include MonoBehaviour classes

### Tools

The MCP server provides the following tools:

1. `search_code`: Search for code in the IL2CPP dump
   - Parameters:
     - `query`: The search query (required)
     - `filter_type`: Filter by entity type (optional)
     - `top_k`: Number of results to return (optional, default: 5)

2. `find_monobehaviours`: Find MonoBehaviour classes in the IL2CPP dump
   - Parameters:
     - `query`: Optional search query to filter MonoBehaviours
     - `top_k`: Number of results to return (optional, default: 10)

### Example Usage with Context7

When using Claude with Context7, simply add the MCP server URL as a knowledge source:

```
http://localhost:3000/mcp
```

Context7 will automatically handle the MCP protocol communication.

## Development

1. Run in development mode:
   ```bash
   npm run dev
   ```

2. Test the Xenova embeddings and Supabase integration:
   ```bash
   npx ts-node src/test-xenova-supabase.ts
   ```

3. Run tests:
   ```bash
   npm test
   ```

4. Lint the code:
   ```bash
   npm run lint
   ```

## Project Structure

- `src/parser/`: IL2CPP dump file parsing
- `src/embeddings/`: Chunking and embedding generation
  - `xenova-embeddings.ts`: Embeddings using Xenova's Transformers.js
  - `supabase-vector-store.ts`: Vector store using Supabase
  - `vector-store.ts`: Main vector store implementation
  - `chunker.ts`: Code chunking logic
- `src/indexer/`: Indexing and processing logic
- `src/mcp/`: MCP server implementation
  - `server.ts`: Legacy custom MCP server implementation
  - `mcp-sdk-server.ts`: New MCP server using the official TypeScript SDK
  - `types.ts`: MCP type definitions
- `supabase-setup.sql`: SQL setup for Supabase vector database

## MCP SDK Integration

This project uses the official Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk`) to implement a fully compliant MCP server. The SDK provides:

- Standardized server implementation with protocol compliance
- Resource templates for exposing IL2CPP data
- Tool definitions with parameter validation using Zod
- Support for multiple transport options (HTTP and stdio)
- Session management for stateful interactions

## License

MIT
