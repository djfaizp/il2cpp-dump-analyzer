#!/usr/bin/env node

const path = require('path');

// Set up the environment for the MCP server
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Import and start the MCP stdio server
async function startMcpServer() {
  try {
    // Import the compiled TypeScript modules
    const { EnhancedIL2CPPDumpParser } = require('../dist/parser/enhanced-il2cpp-parser.js');
    const { IL2CPPIndexer } = require('../dist/indexer/indexer.js');
    const { startMcpStdioServer, initializeVectorStore } = require('../dist/mcp/mcp-sdk-server.js');
    
    // Get the dump.cs file path
    const dumpFilePath = path.resolve(__dirname, '..', 'dump.cs');
    
    // Create and initialize the indexer with enhanced parser
    const indexer = new IL2CPPIndexer();
    
    // Index the dump file
    const vectorStore = await indexer.indexFile(dumpFilePath);
    
    // Initialize the MCP server with the vector store
    initializeVectorStore(vectorStore);
    
    // Start the MCP stdio server
    await startMcpStdioServer();
    
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Start the server
startMcpServer();