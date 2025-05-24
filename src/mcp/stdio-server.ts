#!/usr/bin/env node

import { startMcpServer } from './mcp-sdk-server';
import { parseStdioArgs } from '../config/cli-config';

// Parse command-line arguments
const config = parseStdioArgs();

// Start the unified MCP server with stdio transport
startMcpServer({
  dumpFilePath: config.dumpFile,
  model: config.model,
  environment: 'production',
  logLevel: config.logLevel,
  hashFilePath: config.hashFile,
  forceReprocess: config.forceReprocess,
  progressCallback: (progress: number, message: string) => {
    console.log(`Progress: ${progress}% - ${message}`);
  }
});