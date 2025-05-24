#!/usr/bin/env node

const path = require('path');

// Load environment variables from .env file
try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
  console.log('✓ Environment variables loaded from .env file');
} catch (error) {
  // dotenv is optional, continue without it
  console.log('ℹ No .env file found or dotenv not available, using system environment variables');
}

// Set up the environment for the MCP server
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Import and start the unified MCP stdio server
async function startMcpServer() {
  try {
    // Import the compiled TypeScript modules
    const { startMcpServer } = require('../dist/mcp/mcp-sdk-server.js');

    // Get configuration from environment variables or defaults
    // Use current working directory instead of __dirname for dump file
    const dumpFilePath = process.env.DUMP_FILE_PATH || path.resolve(process.cwd(), 'dump.cs');
    const model = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
    const logLevel = process.env.LOG_LEVEL || 'info';

    console.log(`Starting IL2CPP MCP Server with dump file: ${dumpFilePath}`);
    console.log(`Using embedding model: ${model}`);

    // Start the unified MCP server with stdio transport
    await startMcpServer({
      dumpFilePath: dumpFilePath,
      model: model,
      environment: 'production',
      logLevel: logLevel,
      progressCallback: (progress, message) => {
        console.log(`[${progress}%] ${message}`);
      }
    });

  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Start the server
startMcpServer();