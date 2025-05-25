/**
 * Simple test to verify Jest setup is working
 */

describe('Simple Jest Test', () => {
  test('basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });

  test('string operations', () => {
    expect('hello'.toUpperCase()).toBe('HELLO');
  });

  test('async operations', async () => {
    const result = await Promise.resolve('async test');
    expect(result).toBe('async test');
  });
});
