/**
 * Unit tests for XenovaEmbeddings class
 * Tests Xenova Transformers.js integration with comprehensive coverage
 * Following Test-Driven Development (TFD) methodology
 */

import { jest, describe, it, expect } from '@jest/globals';

// Mock @xenova/transformers to avoid actual model loading during tests
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
  env: {
    allowLocalModels: false,
    useBrowserCache: false,
    cacheDir: '/app/models'
  }
}), { virtual: true });

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock path module
jest.mock('path', () => ({
  resolve: jest.fn().mockReturnValue('/app/models')
}));

import { XenovaEmbeddings } from '../embeddings/xenova-embeddings';

// Simple test to verify XenovaEmbeddings class structure and basic functionality
describe('XenovaEmbeddings Basic Tests', () => {
  it('should be importable and have correct structure', () => {
    // Test class structure
    expect(XenovaEmbeddings).toBeDefined();
    expect(typeof XenovaEmbeddings).toBe('function');

    // Test that we can create an instance (without initializing)
    const embeddings = new XenovaEmbeddings();
    expect(embeddings).toBeDefined();
    expect(embeddings.getDimension()).toBe(384);
  });

  it('should have correct default model configuration', () => {
    const embeddings = new XenovaEmbeddings();

    // Test default configuration
    expect(embeddings['model']).toBe('Xenova/all-MiniLM-L6-v2');
    expect(embeddings.getDimension()).toBe(384);
  });

  it('should accept custom model configuration', () => {
    const customModel = 'Xenova/custom-model';
    const embeddings = new XenovaEmbeddings(customModel);

    expect(embeddings['model']).toBe(customModel);
    expect(embeddings.getDimension()).toBe(384);
  });

  it('should have preprocessText method that handles text correctly', () => {
    const embeddings = new XenovaEmbeddings();

    // Test text preprocessing
    const testText = '  Multiple   spaces   and   whitespace  ';
    const processed = embeddings['preprocessText'](testText);
    expect(processed).toBe('Multiple spaces and whitespace');

    // Test long text truncation
    const longText = 'a'.repeat(1000);
    const truncated = embeddings['preprocessText'](longText);
    expect(truncated).toHaveLength(512);
    expect(truncated).toBe('a'.repeat(512));

    // Test empty text
    const empty = embeddings['preprocessText']('');
    expect(empty).toBe('');

    // Test whitespace-only text
    const whitespace = embeddings['preprocessText']('   \n\t\r\n   ');
    expect(whitespace).toBe('');
  });

  it('should have correct class methods and properties', () => {
    const embeddings = new XenovaEmbeddings();

    // Test that required methods exist
    expect(typeof embeddings.embedQuery).toBe('function');
    expect(typeof embeddings.embedDocuments).toBe('function');
    expect(typeof embeddings.getDimension).toBe('function');
    expect(typeof embeddings['preprocessText']).toBe('function');

    // Test that properties are set correctly
    expect(embeddings['dimensions']).toBe(384);
    expect(embeddings['ready']).toBeInstanceOf(Promise);
  });
});
