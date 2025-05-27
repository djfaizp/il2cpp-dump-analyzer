# IL2CPP Dump Analyzer MCP Configuration Files

This directory contains multiple MCP configuration files for different use cases:

## Configuration Files

### 1. `mcp.json` (Main Configuration)
**Recommended for most users**
- ✅ **Local development setup**
- ✅ **No external dependencies** (no Supabase required)
- ✅ **In-memory vector store**
- ✅ **File-based hash management**

```json
{
  "mcpServers": {
    "il2cpp-dump-analyzer": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "DUMP_FILE_PATH": "./dump.cs",
        "EMBEDDING_MODEL": "Xenova/all-MiniLM-L6-v2",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### 2. `mcp-local-simple.json` (Minimal Configuration)
**For basic local testing**
- Identical to `mcp.json` but with explicit naming
- Good for testing and development

### 3. `mcp-config-complete.json` (Full Configuration)
**For advanced users and production**
- Includes metadata and capability definitions
- Schema validation support
- Global settings and timeout configuration

### 4. `mcp-local.json` (Legacy Supabase Local)
**For local Supabase development**
- Requires local Supabase instance
- Uses Docker Supabase setup
- More complex but supports persistence

## Quick Start

1. **Copy the main configuration:**
   ```bash
   cp mcp.json ~/.config/mcp/mcp.json
   ```

2. **Or use with Claude Desktop:**
   - Copy `mcp.json` content to your Claude Desktop MCP configuration
   - Ensure the working directory is set to your project root

3. **Test the configuration:**
   ```bash
   npm run build
   npm run start
   ```

## Environment Variables

The MCP configuration uses these key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DUMP_FILE_PATH` | `./dump.cs` | Path to your IL2CPP dump file |
| `EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Embedding model for semantic search |
| `LOG_LEVEL` | `info` | Logging level (error, warn, info, debug) |
| `CHUNK_SIZE` | `1000` | Text chunk size for processing |
| `CHUNK_OVERLAP` | `200` | Overlap between chunks |
| `MAX_SEARCH_RESULTS` | `50` | Maximum search results returned |

## Available MCP Tools

The IL2CPP Dump Analyzer provides these MCP tools:

1. **`search_il2cpp_code`** - Semantic search through IL2CPP code
2. **`analyze_class_hierarchy`** - Analyze class inheritance and relationships
3. **`find_design_patterns`** - Detect common design patterns
4. **`generate_class_wrapper`** - Generate C# wrapper classes
5. **`generate_method_stubs`** - Generate method stubs and interfaces
6. **`extract_public_api`** - Extract public API documentation

## Troubleshooting

### Common Issues:

1. **"Command not found" error:**
   - Ensure you've run `npm run build` first
   - Check that `dist/index.js` exists

2. **"File not found" error:**
   - Verify `DUMP_FILE_PATH` points to your actual dump.cs file
   - Use absolute paths if relative paths don't work

3. **Memory issues:**
   - Reduce `CHUNK_SIZE` for large files
   - Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096`

4. **Slow startup:**
   - First run downloads the embedding model (normal)
   - Subsequent runs use cached model and processed files

### Performance Tips:

- Keep processed files cache (`./processed_files.json`)
- Use SSD storage for model cache directory
- Increase `CHUNK_SIZE` for better context (uses more memory)
- Set `FORCE_REPROCESS=false` to skip re-processing unchanged files

## Support

For issues and questions:
- GitHub Issues: https://github.com/djfaizp/il2cpp-dump-analyzer/issues
- Documentation: https://github.com/djfaizp/il2cpp-dump-analyzer#readme
