
import dotenv from 'dotenv';
import path from 'path';
import { initializeParser } from './parser/parser';
import { IL2CPPIndexer } from './indexer/indexer';
import { initializeVectorStore, startMcpHttpServer } from './mcp/mcp-sdk-server.js';

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Initialize the IL2CPP parser
    await initializeParser();
    console.log('IL2CPP parser initialized');

    // Get the dump.cs file path
    const dumpFilePath = path.resolve(process.cwd(), 'dump.cs');
    console.log(`Using dump file: ${dumpFilePath}`);

    // Create and initialize the indexer with simple embeddings
    const indexer = new IL2CPPIndexer();
    console.log('Starting indexing process with simple embeddings...');

    // Index the dump file with progress updates
    const vectorStore = await indexer.indexFile(dumpFilePath, (progress, message) => {
      console.log(`[${progress}%] ${message}`);
    });

    console.log('Indexing complete!');

    // Initialize the MCP server with the vector store
    initializeVectorStore(vectorStore);

    // Start the MCP server
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    const host = process.env.HOST || 'localhost';

    await startMcpHttpServer(port, host);

    console.log(`IL2CPP Dump Analyzer MCP server running at http://${host}:${port}/mcp`);
    console.log('For GPT: Use this URL with the MCP tool');
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1);
  }
}

main();
