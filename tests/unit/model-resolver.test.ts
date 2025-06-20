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
    defaultService: 'openrouter',
    defaultModel: 'claude-sonnet-4-20250514'
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

  test('should maintain strict service/model hierarchy - REGRESSION TEST', async () => {
    // This test ensures the specific bug that caused google/gemini-2.5-pro-preview 
    // to be treated as service 'google' with model 'gemini-2.5-pro-preview' 
    // instead of searching for the full model name in configured services
    
    const result = await ModelResolver.resolveModel('google/gemini-2.5-pro-preview', mockConfig);
    
    // Should resolve to openrouter service since that's where the model is configured
    expect(result.service).toBe('openrouter');
    expect(result.model).toBe('google/gemini-2.5-pro-preview');
    expect(result.fullName).toBe('openrouter/google/gemini-2.5-pro-preview');
  });

  test('should properly resolve default models with strict hierarchy', async () => {
    // Test that default model resolution finds the correct service
    const models = ModelResolver.getDefaultModels(mockConfig);
    
    // Since defaultModel is 'claude-sonnet-4-20250514' (bare model), 
    // it should find it in anthropic service and return fully qualified name
    expect(models).toContain('anthropic/claude-sonnet-4-20250514');
    expect(models.length).toBe(1);
  });

  test('should fallback to default service when no explicit default model', async () => {
    // Test config without defaultModel but with defaultService
    const configWithoutDefaultModel = {
      ...mockConfig,
      defaultModel: undefined
    };
    
    const models = ModelResolver.getDefaultModels(configWithoutDefaultModel);
    
    // Should use first model from default service (openrouter)
    expect(models).toContain('openrouter/google/gemini-2.5-pro-preview');
    expect(models.length).toBe(1);
  });
});