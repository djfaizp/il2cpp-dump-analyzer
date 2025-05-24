#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'start';

if (command === 'start') {
  // Start the MCP server
  console.log('Starting IL2CPP Dump Analyzer MCP Server...');
  
  // Path to the compiled JavaScript file
  const serverPath = path.join(__dirname, '..', 'dist', 'index.js');
  
  // Spawn the server process
  const server = spawn('node', [serverPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: process.env.PORT || '3000',
      HOST: process.env.HOST || 'localhost'
    }
  });
  
  // Handle process events
  server.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
  
  server.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    process.exit(code);
  });
  
  // Handle termination signals
  process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    server.kill('SIGTERM');
  });
} else if (command === 'help') {
  console.log(`
IL2CPP Dump Analyzer MCP Server

Usage:
  il2cpp-mcp start     Start the MCP server
  il2cpp-mcp help      Show this help message

Environment Variables:
  PORT                 Port to listen on (default: 3000)
  HOST                 Host to bind to (default: localhost)
  `);
} else {
  console.error(`Unknown command: ${command}`);
  console.log('Use "il2cpp-mcp help" to see available commands');
  process.exit(1);
}
