
import dotenv from 'dotenv';
import { initializeParser } from './parser/parser';
import { startMcpServer } from './mcp/mcp-sdk-server';
import { parseStdioArgs } from './config/cli-config';

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Parse command-line arguments for stdio transport
    const config = parseStdioArgs();

    // Initialize the IL2CPP parser
    await initializeParser();
    console.log('IL2CPP parser initialized');

    console.log(`Using dump file: ${config.dumpFile}`);

    // Start the MCP server with stdio transport
    await startMcpServer({
      dumpFilePath: config.dumpFile,
      model: config.model,
      environment: 'production',
      logLevel: config.logLevel,
      hashFilePath: config.hashFile,
      forceReprocess: config.forceReprocess,
      progressCallback: (progress: number, message: string) => {
        console.log(`[${progress}%] ${message}`);
      }
    });

    console.log('IL2CPP Dump Analyzer MCP server started with stdio transport');
    console.log('Server is ready to accept MCP requests via stdio');
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1);
  }
}

main();
