/**
 * Basic test to verify Jest setup is working correctly
 */

import { describe, it, expect } from '@jest/globals';

describe('Basic Jest Setup', () => {
  it('should run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have access to test utilities', () => {
    expect(global.testUtils).toBeDefined();
    expect(typeof global.testUtils.createMockDocument).toBe('function');
    expect(typeof global.testUtils.createMockVectorStore).toBe('function');
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  it('should have proper TypeScript support', () => {
    interface TestInterface {
      name: string;
      value: number;
    }

    const testObj: TestInterface = {
      name: 'test',
      value: 42
    };

    expect(testObj.name).toBe('test');
    expect(testObj.value).toBe(42);
  });
});
