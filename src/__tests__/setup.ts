/**
 * Jest test setup file
 * Configures global test environment, mocks, and utilities
 */

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_KEY = 'test-key';
process.env.DUMP_FILE_PATH = './test-dump.cs';
process.env.EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

// Mock console methods to reduce test output noise
const originalConsole = { ...console };

beforeAll(() => {
  // Mock console methods but keep error for debugging
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.debug = jest.fn();
});

afterAll(() => {
  // Restore console methods
  Object.assign(console, originalConsole);
});

// Global test timeout
jest.setTimeout(30000);

// Mock external dependencies that are not available in test environment
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(() => Promise.resolve({
    encode: jest.fn(() => Promise.resolve([0.1, 0.2, 0.3, 0.4]))
  })),
  env: {
    allowLocalModels: true,
    allowRemoteModels: false
  }
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        data: [],
        error: null
      }),
      insert: jest.fn().mockReturnValue({
        data: [],
        error: null
      }),
      upsert: jest.fn().mockReturnValue({
        data: [],
        error: null
      }),
      delete: jest.fn().mockReturnValue({
        data: [],
        error: null
      })
    }),
    rpc: jest.fn(() => Promise.resolve({
      data: [],
      error: null
    }))
  })
}));

// Mock file system operations - but allow actual file reading for tests
const actualFs = jest.requireActual('fs');
jest.mock('fs', () => ({
  ...(actualFs as any),
  writeFileSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn()
  }
}));

// Global test utilities
global.testUtils = {
  createMockDocument: (metadata: any = {}) => ({
    pageContent: 'test content',
    metadata: {
      name: 'TestClass',
      type: 'class',
      namespace: 'Test.Namespace',
      fullName: 'Test.Namespace.TestClass',
      ...metadata
    }
  }),

  createMockVectorStore: () => ({
    similaritySearch: jest.fn(() => Promise.resolve([])),
    searchWithFilter: jest.fn(() => Promise.resolve([])),
    addDocuments: jest.fn(() => Promise.resolve(undefined))
  }),

  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
};

// Type declarations for global test utilities
declare global {
  var testUtils: {
    createMockDocument: (metadata?: any) => any;
    createMockVectorStore: () => any;
    delay: (ms: number) => Promise<void>;
  };
}
