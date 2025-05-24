#!/usr/bin/env node

import dotenv from 'dotenv';
import { createHashManagerFromEnv } from './hash-manager-factory';
import { IHashManager } from './supabase-hash-manager';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

/**
 * CLI utility for managing processed dump file hashes
 */

const argv = yargs(hideBin(process.argv))
  .command('list', 'List all processed file hashes', {}, async (args) => {
    const hashManager = createHashManagerFromEnv(args.hashFile as string);

    // Wait for initialization if it's a Supabase hash manager
    if ('initialize' in hashManager) {
      await (hashManager as any).initialize();
    }

    const info = hashManager.getInfo();
    const hashes = hashManager.getAllHashes();

    console.log(`Hash storage: ${info.hashFilePath || 'Supabase database'}`);
    console.log(`Processed files: ${info.processedCount}`);
    console.log('');

    if (hashes.length === 0) {
      console.log('No files have been processed yet.');
    } else {
      console.log('Processed file hashes:');
      hashes.forEach((hash, index) => {
        console.log(`${index + 1}. ${hash}`);
      });
    }
  })
  .command('clear', 'Clear all processed file hashes', {}, async (args) => {
    const hashManager = createHashManagerFromEnv(args.hashFile as string);
    const info = hashManager.getInfo();

    console.log(`Clearing all hashes from: ${info.hashFilePath || 'Supabase database'}`);

    if ('clearAllHashesAsync' in hashManager) {
      await (hashManager as any).clearAllHashesAsync();
    } else {
      hashManager.clearAllHashes();
    }

    console.log('All processed file hashes have been cleared.');
  })
  .command('check <file>', 'Check if a file has been processed', {
    file: {
      describe: 'Path to the dump.cs file to check',
      type: 'string',
      demandOption: true
    }
  }, async (args) => {
    const hashManager = createHashManagerFromEnv(args.hashFile as string);
    const filePath = args.file as string;

    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    let isProcessed = hashManager.isFileProcessed(filePath);

    // For Supabase, also check the database
    if ('isFileProcessedAsync' in hashManager) {
      isProcessed = await (hashManager as any).isFileProcessedAsync(filePath);
    }

    const hash = hashManager.getFileHash(filePath);
    const fileName = path.basename(filePath);

    console.log(`File: ${fileName}`);
    console.log(`Path: ${filePath}`);
    console.log(`Hash: ${hash}`);
    console.log(`Processed: ${isProcessed ? 'Yes' : 'No'}`);
  })
  .command('remove <file>', 'Remove a file from the processed list', {
    file: {
      describe: 'Path to the dump.cs file to remove',
      type: 'string',
      demandOption: true
    }
  }, async (args) => {
    const hashManager = createHashManagerFromEnv(args.hashFile as string);
    const filePath = args.file as string;

    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const fileName = path.basename(filePath);
    const hash = hashManager.getFileHash(filePath);

    let wasRemoved: boolean;
    if ('removeFileHashAsync' in hashManager) {
      wasRemoved = await (hashManager as any).removeFileHashAsync(filePath);
    } else {
      wasRemoved = hashManager.removeFileHash(filePath);
    }

    if (wasRemoved) {
      console.log(`Removed ${fileName} (hash: ${hash.substring(0, 8)}...) from processed list.`);
      console.log('The file will be reprocessed on next run.');
    } else {
      console.log(`File ${fileName} was not in the processed list.`);
    }
  })
  .command('add <file>', 'Add a file to the processed list without processing', {
    file: {
      describe: 'Path to the dump.cs file to add',
      type: 'string',
      demandOption: true
    }
  }, async (args) => {
    const hashManager = createHashManagerFromEnv(args.hashFile as string);
    const filePath = args.file as string;

    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const fileName = path.basename(filePath);

    let hash: string;
    if ('markFileAsProcessedAsync' in hashManager) {
      hash = await (hashManager as any).markFileAsProcessedAsync(filePath);
    } else {
      hash = hashManager.markFileAsProcessed(filePath);
    }

    console.log(`Added ${fileName} (hash: ${hash.substring(0, 8)}...) to processed list.`);
    console.log('The file will be skipped on future runs unless forced.');
  })
  .option('hash-file', {
    type: 'string',
    description: 'Path to hash file (default: .processed_dumps)',
    global: true
  })
  .help()
  .alias('help', 'h')
  .demandCommand(1, 'You need to specify a command')
  .parse();