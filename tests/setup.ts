// Test setup file for Bun
import { beforeAll, afterAll } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';

// Suppress console logs during tests
beforeAll(() => {
  // You can add global test setup here if needed
});

afterAll(() => {
  // You can add global test cleanup here if needed
});