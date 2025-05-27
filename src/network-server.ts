#!/usr/bin/env node

/**
 * Network MCP Server for IL2CPP Dump Analyzer
 * Starts the MCP server with HTTP/WebSocket transport for remote access
 */

import { startMcpServer } from './mcp/mcp-sdk-server';
import { parseStdioArgs } from './config/cli-config';
import {
  TransportType,
  loadTransportConfig,
  validateTransportConfig,
  printTransportConfigSummary
} from './transport';

async function main() {
  try {
    console.log('🚀 Starting IL2CPP MCP Server with Network Transport...\n');

    // Parse command-line arguments
    const cliConfig = parseStdioArgs();

    // Load transport configuration from environment
    const transportConfig = loadTransportConfig();

    // Override with HTTP transport if not specified
    if (transportConfig.type === TransportType.STDIO) {
      transportConfig.type = TransportType.SSE; // Use SSE for better compatibility
      transportConfig.host = transportConfig.host || '0.0.0.0'; // Listen on all interfaces
      transportConfig.port = transportConfig.port || 3000;
      transportConfig.enableCors = transportConfig.enableCors ?? true;
      transportConfig.enableLogging = transportConfig.enableLogging ?? true; // Enable logging for debugging
    }

    // Validate transport configuration
    const validation = validateTransportConfig(transportConfig);
    if (!validation.valid) {
      console.error('❌ Invalid transport configuration:');
      validation.errors.forEach(error => console.error(`   - ${error}`));
      process.exit(1);
    }

    // Print configuration summary
    printTransportConfigSummary(transportConfig);

    // Start the MCP server with network transport
    await startMcpServer({
      dumpFilePath: cliConfig.dumpFile,
      model: cliConfig.model,
      environment: 'production',
      logLevel: cliConfig.logLevel,
      hashFilePath: cliConfig.hashFile,
      forceReprocess: cliConfig.forceReprocess,
      transportConfig,
      progressCallback: (progress: number, message: string) => {
        console.log(`[${progress}%] ${message}`);
      }
    });

    // Log success message
    const protocol = transportConfig.enableSsl ? 'https' : 'http';
    const url = `${protocol}://${transportConfig.host}:${transportConfig.port}`;

    console.log('\n✅ IL2CPP MCP Server started successfully!');
    console.log(`🌐 Server URL: ${url}`);
    console.log(`🔧 Transport: ${transportConfig.type}`);

    if (transportConfig.apiKey) {
      console.log('🔐 Authentication: API key required');
      console.log('   Add header: X-API-Key: your_api_key');
    } else {
      console.log('⚠️  Authentication: Open access (no API key)');
    }

    console.log('\n📡 MCP Endpoints:');
    console.log(`   GET  ${url}/          - SSE stream for MCP communication`);
    console.log(`   POST ${url}/          - Send MCP messages`);
    console.log(`   DELETE ${url}/        - Terminate session`);

    console.log('\n🧪 Test with curl:');
    const authHeader = transportConfig.apiKey ? ` -H "X-API-Key: ${transportConfig.apiKey}"` : '';
    console.log(`   curl -X POST ${url}${authHeader} \\`);
    console.log(`        -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`);

    console.log('\n🔗 MCP Client Configuration (Claude Desktop):');
    console.log('   {');
    console.log('     "mcpServers": {');
    console.log('       "il2cpp-analyzer-remote": {');
    console.log(`         "url": "${url}",`);
    console.log('         "description": "Remote IL2CPP Dump Analyzer"');
    if (transportConfig.apiKey) {
      console.log('         "headers": {');
      console.log(`           "X-API-Key": "${transportConfig.apiKey}"`);
      console.log('         }');
    }
    console.log('       }');
    console.log('     }');
    console.log('   }');

    console.log('\n⏹️  Press Ctrl+C to stop the server');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down server...');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down server...');
      process.exit(0);
    });

    // Keep the process alive with a simple interval
    const keepAliveInterval = setInterval(() => {
      // This keeps the Node.js event loop active
    }, 30000); // Every 30 seconds

    // Clean up on shutdown
    const cleanup = () => {
      clearInterval(keepAliveInterval);
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

  } catch (error) {
    console.error('❌ Failed to start network MCP server:', error);
    process.exit(1);
  }
}

// Start the server
main();
