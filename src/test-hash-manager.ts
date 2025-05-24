#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { HashManager } from './utils/hash-manager';

/**
 * Simple test script for the HashManager functionality
 */

async function testHashManager() {
  console.log('Testing HashManager functionality...\n');

  // Create a temporary test file
  const testFilePath = path.join(__dirname, '..', 'test-dump.cs');
  const testContent = `// Test IL2CPP dump file
// Image 0: test-game.dll - 0

// Namespace: TestNamespace
public class TestClass
{
    public int testField; // 0x10
    public void TestMethod(); // RVA: 0x1000 Offset: 0x1000
}
`;

  try {
    // Write test file
    fs.writeFileSync(testFilePath, testContent, 'utf8');
    console.log(`✓ Created test file: ${testFilePath}`);

    // Create hash manager with temporary hash file
    const tempHashFile = path.join(__dirname, '..', '.test-hashes');
    const hashManager = new HashManager(tempHashFile);

    // Test 1: Check if file is not processed initially
    console.log('\n--- Test 1: Initial state ---');
    const isProcessedInitially = hashManager.isFileProcessed(testFilePath);
    console.log(`File processed initially: ${isProcessedInitially}`);
    console.log(`Expected: false, Actual: ${isProcessedInitially} ${isProcessedInitially === false ? '✓' : '✗'}`);

    // Test 2: Get file hash
    console.log('\n--- Test 2: Calculate hash ---');
    const fileHash = hashManager.getFileHash(testFilePath);
    console.log(`File hash: ${fileHash}`);
    console.log(`Hash length: ${fileHash.length} ${fileHash.length === 64 ? '✓' : '✗'}`);

    // Test 3: Mark file as processed
    console.log('\n--- Test 3: Mark as processed ---');
    const markedHash = hashManager.markFileAsProcessed(testFilePath);
    console.log(`Marked hash: ${markedHash}`);
    console.log(`Hashes match: ${fileHash === markedHash ? '✓' : '✗'}`);

    // Test 4: Check if file is now processed
    console.log('\n--- Test 4: Check processed state ---');
    const isProcessedNow = hashManager.isFileProcessed(testFilePath);
    console.log(`File processed now: ${isProcessedNow}`);
    console.log(`Expected: true, Actual: ${isProcessedNow} ${isProcessedNow === true ? '✓' : '✗'}`);

    // Test 5: Get info
    console.log('\n--- Test 5: Get info ---');
    const info = hashManager.getInfo();
    console.log(`Hash file path: ${info.hashFilePath}`);
    console.log(`Processed count: ${info.processedCount}`);
    console.log(`Expected count: 1, Actual: ${info.processedCount} ${info.processedCount === 1 ? '✓' : '✗'}`);

    // Test 6: Get all hashes
    console.log('\n--- Test 6: Get all hashes ---');
    const allHashes = hashManager.getAllHashes();
    console.log(`All hashes count: ${allHashes.length}`);
    console.log(`Contains our hash: ${allHashes.includes(fileHash) ? '✓' : '✗'}`);

    // Test 7: Remove hash
    console.log('\n--- Test 7: Remove hash ---');
    const wasRemoved = hashManager.removeFileHash(testFilePath);
    console.log(`Hash removed: ${wasRemoved ? '✓' : '✗'}`);
    const isProcessedAfterRemoval = hashManager.isFileProcessed(testFilePath);
    console.log(`File processed after removal: ${isProcessedAfterRemoval}`);
    console.log(`Expected: false, Actual: ${isProcessedAfterRemoval} ${isProcessedAfterRemoval === false ? '✓' : '✗'}`);

    // Test 8: Test persistence
    console.log('\n--- Test 8: Test persistence ---');
    hashManager.markFileAsProcessed(testFilePath);
    const newHashManager = new HashManager(tempHashFile);
    const isProcessedByNewInstance = newHashManager.isFileProcessed(testFilePath);
    console.log(`File processed by new instance: ${isProcessedByNewInstance}`);
    console.log(`Persistence works: ${isProcessedByNewInstance === true ? '✓' : '✗'}`);

    // Test 9: Clear all hashes
    console.log('\n--- Test 9: Clear all hashes ---');
    newHashManager.clearAllHashes();
    const countAfterClear = newHashManager.getProcessedCount();
    console.log(`Count after clear: ${countAfterClear}`);
    console.log(`Expected: 0, Actual: ${countAfterClear} ${countAfterClear === 0 ? '✓' : '✗'}`);

    console.log('\n--- Test Results ---');
    console.log('All tests completed! Check the ✓/✗ marks above for results.');

  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
        console.log(`\n✓ Cleaned up test file: ${testFilePath}`);
      }
      
      const tempHashFile = path.join(__dirname, '..', '.test-hashes');
      if (fs.existsSync(tempHashFile)) {
        fs.unlinkSync(tempHashFile);
        console.log(`✓ Cleaned up test hash file: ${tempHashFile}`);
      }
    } catch (cleanupError) {
      console.warn('Cleanup warning:', cleanupError);
    }
  }
}

// Run the test
testHashManager().catch(console.error);