#!/usr/bin/env node

import path from 'path';
import { EnhancedIL2CPPDumpParser } from '../parser/enhanced-il2cpp-parser';
import { IL2CPPIndexer } from '../indexer/indexer';
import { startMcpStdioServer, initializeVectorStore } from './mcp-sdk-server';

// Set up the environment for the MCP server
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Import and start the MCP stdio server
async function startMcpServer() {
  try {
    
    // Get the dump.cs file path (resolve relative to project root)
    const currentDir = __dirname;
    const projectRoot = path.resolve(currentDir, '..', '..');
    const dumpFilePath = path.join(projectRoot, 'dump.cs');
    
    console.log(`Loading dump file from: ${dumpFilePath}`);
    
    // Create and initialize the indexer with enhanced parser
    const indexer = new IL2CPPIndexer();
    
    // Index the dump file
    console.log('Indexing dump file...');
    const vectorStore = await indexer.indexFile(dumpFilePath);
    console.log('Indexing complete');
    
    // Initialize the MCP server with the vector store
    initializeVectorStore(vectorStore);
    
    // Start the MCP stdio server
    console.log('Starting MCP stdio server...');
    await startMcpStdioServer();
    
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Start the server
startMcpServer();