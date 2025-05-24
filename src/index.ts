
import dotenv from 'dotenv';
import { initializeParser } from './parser/parser';
import { startMcpHttpServerComplete } from './mcp/mcp-sdk-server';
import { parseServerArgs } from './config/cli-config';

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Parse command-line arguments
    const config = parseServerArgs();
    
    // Initialize the IL2CPP parser
    await initializeParser();
    console.log('IL2CPP parser initialized');

    console.log(`Using dump file: ${config.dumpFile}`);

    // Start the MCP server with complete initialization
    await startMcpHttpServerComplete(
      config.port,
      config.host,
      {
        dumpFilePath: config.dumpFile,
        model: config.model,
        environment: 'production',
        logLevel: config.logLevel,
        hashFilePath: config.hashFile,
        forceReprocess: config.forceReprocess,
        progressCallback: (progress: number, message: string) => {
          console.log(`[${progress}%] ${message}`);
        }
      },
      {
        enableLogging: true,
        enableCors: true,
        maxSessions: 100
      }
    );

    console.log(`IL2CPP Dump Analyzer MCP server running at http://${config.host}:${config.port}/mcp`);
    console.log(`Health check available at http://${config.host}:${config.port}/health`);
    console.log('For GPT: Use this URL with the MCP tool');
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1);
  }
}

main();
