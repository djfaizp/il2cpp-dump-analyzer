import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';

export interface ServerConfig {
  port: number;
  host: string;
  dumpFile: string;
  model: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  hashFile?: string;
  forceReprocess: boolean;
}

export interface StdioConfig {
  dumpFile: string;
  model: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  hashFile?: string;
  forceReprocess: boolean;
}

export function parseServerArgs(): ServerConfig {
  const args = yargs(hideBin(process.argv))
    .option('port', {
      alias: 'p',
      type: 'number',
      default: process.env.PORT ? parseInt(process.env.PORT) : 3000,
      description: 'Server port'
    })
    .option('host', {
      alias: 'h',
      type: 'string',
      default: process.env.HOST || 'localhost',
      description: 'Server host'
    })
    .option('dump-file', {
      alias: 'd',
      type: 'string',
      default: path.resolve(process.cwd(), 'dump.cs'),
      description: 'Path to IL2CPP dump.cs file'
    })
    .option('model', {
      alias: 'm',
      type: 'string',
      default: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
      description: 'Embedding model to use'
    })
    .option('log-level', {
      alias: 'l',
      type: 'string',
      default: process.env.LOG_LEVEL || 'info',
      choices: ['debug', 'info', 'warn', 'error'],
      description: 'Logging level'
    })
    .option('hash-file', {
      type: 'string',
      description: 'Path to file for storing processed dump hashes (default: .processed_dumps)'
    })
    .option('force-reprocess', {
      alias: 'f',
      type: 'boolean',
      default: false,
      description: 'Force reprocessing even if file was already processed'
    })
    .help()
    .alias('help', 'help')
    .parseSync();

  return {
    port: args.port,
    host: args.host,
    dumpFile: args['dump-file'],
    model: args.model,
    logLevel: args['log-level'] as 'debug' | 'info' | 'warn' | 'error',
    hashFile: args['hash-file'],
    forceReprocess: args['force-reprocess']
  };
}

export function parseStdioArgs(): StdioConfig {
  const args = yargs(hideBin(process.argv))
    .option('dump-file', {
      alias: 'd',
      type: 'string',
      default: (() => {
        const currentDir = __dirname;
        const projectRoot = path.resolve(currentDir, '..', '..');
        return path.join(projectRoot, 'dump.cs');
      })(),
      description: 'Path to IL2CPP dump.cs file'
    })
    .option('model', {
      alias: 'm',
      type: 'string',
      default: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
      description: 'Embedding model to use'
    })
    .option('log-level', {
      alias: 'l',
      type: 'string',
      default: process.env.LOG_LEVEL || 'info',
      choices: ['debug', 'info', 'warn', 'error'],
      description: 'Logging level'
    })
    .option('hash-file', {
      type: 'string',
      description: 'Path to file for storing processed dump hashes (default: .processed_dumps)'
    })
    .option('force-reprocess', {
      alias: 'f',
      type: 'boolean',
      default: false,
      description: 'Force reprocessing even if file was already processed'
    })
    .help()
    .alias('help', 'help')
    .parseSync();

  return {
    dumpFile: args['dump-file'],
    model: args.model,
    logLevel: args['log-level'] as 'debug' | 'info' | 'warn' | 'error',
    hashFile: args['hash-file'],
    forceReprocess: args['force-reprocess']
  };
}