import { test, expect, describe } from 'bun:test';
import { ModelResolver } from '../../src/utils/model-resolver';

describe('ModelResolver', () => {
  const mockConfig = {
    services: {
      openai: {
        apiKey: 'test-key',
        models: ['o3-mini', 'gpt-4-turbo']
      },
      anthropic: {
        apiKey: 'test-key',
        models: ['claude-sonnet-4-20250514']
      },
      openrouter: {
        apiKey: 'test-key',
        models: ['google/gemini-2.5-pro-preview', 'minimax/minimax-m1']
      },
      default: {
        apiKey: '',
        service: 'openai'
      }
    },
    defaultService: 'openrouter'
  };

  test('should resolve OpenRouter models with multiple slashes correctly', async () => {
    const result = await ModelResolver.resolveModel('openrouter/google/gemini-2.5-pro-preview', mockConfig);
    
    expect(result.service).toBe('openrouter');
    expect(result.model).toBe('google/gemini-2.5-pro-preview');
    expect(result.fullName).toBe('openrouter/google/gemini-2.5-pro-preview');
  });

  test('should resolve bare OpenRouter model with slashes when default service is set', async () => {
    const result = await ModelResolver.resolveModel('google/gemini-2.5-pro-preview', mockConfig);
    
    expect(result.service).toBe('openrouter');
    expect(result.model).toBe('google/gemini-2.5-pro-preview');
    expect(result.fullName).toBe('openrouter/google/gemini-2.5-pro-preview');
  });

  test('should resolve simple model names correctly', async () => {
    const result = await ModelResolver.resolveModel('openai/o3-mini', mockConfig);
    
    expect(result.service).toBe('openai');
    expect(result.model).toBe('o3-mini');
    expect(result.fullName).toBe('openai/o3-mini');
  });

  test('should resolve bare model names to default service', async () => {
    const result = await ModelResolver.resolveModel('claude-sonnet-4-20250514', mockConfig);
    
    expect(result.service).toBe('anthropic');
    expect(result.model).toBe('claude-sonnet-4-20250514');
    expect(result.fullName).toBe('anthropic/claude-sonnet-4-20250514');
  });

  test('should handle model with multiple forward slashes in the model name', async () => {
    // Test case similar to the one that was failing
    const result = await ModelResolver.resolveModel('openrouter/minimax/minimax-m1', mockConfig);
    
    expect(result.service).toBe('openrouter');
    expect(result.model).toBe('minimax/minimax-m1');
    expect(result.fullName).toBe('openrouter/minimax/minimax-m1');
  });

  test('should throw error for non-existent service', async () => {
    expect(async () => {
      await ModelResolver.resolveModel('nonexistent/model', mockConfig);
    }).toThrow();
  });

  test('should throw error for non-existent model in service', async () => {
    expect(async () => {
      await ModelResolver.resolveModel('openai/non-existent-model', mockConfig);
    }).toThrow();
  });
});