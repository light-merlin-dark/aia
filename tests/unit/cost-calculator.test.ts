import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '@/core/orchestrator';
import { PluginRegistry } from '@/plugins/registry';
import { AIProviderPlugin, AIResponse } from '@/plugins/types';
import * as configManager from '@/config/manager';

// Mock the config manager
vi.mock('@/config/manager', () => ({
  getConfig: vi.fn()
}));

// Mock the tokenizer - let the actual implementation work
vi.mock('@/core/tokenizer', async () => {
  const actual = await vi.importActual('@/core/tokenizer');
  return actual;
});

describe('Orchestrator Cost Calculation', () => {
  let orchestrator: Orchestrator;
  let mockRegistry: PluginRegistry;
  let mockProvider: AIProviderPlugin;

  beforeEach(() => {
    vi.clearAllMocks();
    
    orchestrator = new Orchestrator();
    
    // Create mock provider
    mockProvider = {
      name: 'openai',
      version: '1.0.0',
      description: 'Test provider',
      listModels: () => ['gpt-4-turbo', 'gpt-3.5-turbo'],
      execute: vi.fn()
    };

    // Create mock registry
    mockRegistry = {
      getAIProvider: vi.fn().mockReturnValue(mockProvider),
      getEnabledPlugins: () => [mockProvider],
      getAllPlugins: () => [mockProvider],
      isEnabled: () => true
    } as any;
  });

  it('should calculate costs when pricing is configured', async () => {
    // Mock config with pricing
    vi.mocked(configManager.getConfig).mockResolvedValue({
      services: {
        openai: {
          apiKey: 'test-key',
          models: ['gpt-4-turbo'],
          pricing: {
            'gpt-4-turbo': {
              inputCostPerMillion: 10.0,
              outputCostPerMillion: 30.0
            }
          }
        }
      },
      defaultModel: 'gpt-4-turbo',
      defaultModels: ['gpt-4-turbo']
    });

    // Mock provider response with usage data
    const mockResponse: AIResponse = {
      model: 'gpt-4-turbo',
      provider: 'openai',
      content: 'This is a test response',
      usage: {
        promptTokens: 150,
        completionTokens: 75,
        totalTokens: 225
      }
    };

    vi.mocked(mockProvider.execute).mockResolvedValue(mockResponse);

    // Execute orchestration
    const result = await orchestrator.orchestrate({
      prompt: 'Test prompt',
      models: ['gpt-4-turbo'],
      registry: mockRegistry
    });

    // Verify cost calculation
    expect(result.costs).toBeDefined();
    expect(result.costs).toHaveLength(1);
    expect(result.costs![0].model).toBe('gpt-4-turbo');
    expect(result.costs![0].provider).toBe('openai');
    expect(result.costs![0].inputTokens).toBe(150);
    expect(result.costs![0].outputTokens).toBe(75);
    expect(result.costs![0].inputCost).toBeCloseTo(0.0015);  // 150 * 10 / 1M
    expect(result.costs![0].outputCost).toBeCloseTo(0.00225); // 75 * 30 / 1M
    expect(result.costs![0].totalCost).toBeCloseTo(0.00375);
    expect(result.totalCost).toBeCloseTo(0.00375);
  });

  it('should not calculate costs when pricing not configured', async () => {
    // Mock config without pricing
    vi.mocked(configManager.getConfig).mockResolvedValue({
      services: {
        openai: {
          apiKey: 'test-key',
          models: ['gpt-4-turbo']
          // No pricing configured
        }
      },
      defaultModel: 'gpt-4-turbo',
      defaultModels: ['gpt-4-turbo']
    });

    // Mock provider response
    const mockResponse: AIResponse = {
      model: 'gpt-4-turbo',
      provider: 'openai',
      content: 'Test response',
      usage: {
        promptTokens: 150,
        completionTokens: 75,
        totalTokens: 225
      }
    };

    vi.mocked(mockProvider.execute).mockResolvedValue(mockResponse);

    // Execute orchestration
    const result = await orchestrator.orchestrate({
      prompt: 'Test prompt',
      models: ['gpt-4-turbo'],
      registry: mockRegistry
    });

    // Verify no costs calculated
    expect(result.costs).toEqual([]);
    expect(result.totalCost).toBe(0);
  });

  it('should calculate costs for multiple models', async () => {
    // Mock config with pricing for multiple models
    vi.mocked(configManager.getConfig).mockResolvedValue({
      services: {
        openai: {
          apiKey: 'test-key',
          models: ['gpt-4-turbo', 'gpt-3.5-turbo'],
          pricing: {
            'gpt-4-turbo': {
              inputCostPerMillion: 10.0,
              outputCostPerMillion: 30.0
            },
            'gpt-3.5-turbo': {
              inputCostPerMillion: 0.5,
              outputCostPerMillion: 1.5
            }
          }
        }
      }
    });

    // Mock multiple responses
    const responses: AIResponse[] = [
      {
        model: 'gpt-4-turbo',
        provider: 'openai',
        content: 'Response 1',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      },
      {
        model: 'gpt-3.5-turbo',
        provider: 'openai',
        content: 'Response 2',
        usage: { promptTokens: 100, completionTokens: 60, totalTokens: 160 }
      }
    ];

    // Mock execute to return different responses
    vi.mocked(mockProvider.execute)
      .mockResolvedValueOnce(responses[0])
      .mockResolvedValueOnce(responses[1]);

    // Execute orchestration
    const result = await orchestrator.orchestrate({
      prompt: 'Test prompt',
      models: ['gpt-4-turbo', 'gpt-3.5-turbo'],
      registry: mockRegistry
    });

    // Verify costs for both models
    expect(result.costs).toHaveLength(2);
    
    // GPT-4 costs
    expect(result.costs![0]).toMatchObject({
      model: 'gpt-4-turbo',
      inputCost: 0.001,   // 100 * 10 / 1M
      outputCost: 0.0015  // 50 * 30 / 1M
    });
    
    // GPT-3.5 costs
    expect(result.costs![1]).toMatchObject({
      model: 'gpt-3.5-turbo',
      inputCost: 0.00005,  // 100 * 0.5 / 1M
      outputCost: 0.00009  // 60 * 1.5 / 1M
    });

    // Total cost
    expect(result.totalCost).toBeCloseTo(0.001 + 0.0015 + 0.00005 + 0.00009);
  });

  it('should estimate tokens when usage data not provided', async () => {
    // Mock config with pricing
    vi.mocked(configManager.getConfig).mockResolvedValue({
      services: {
        openai: {
          apiKey: 'test-key',
          pricing: {
            'gpt-4-turbo': {
              inputCostPerMillion: 10.0,
              outputCostPerMillion: 30.0
            }
          }
        }
      }
    });

    // Mock response without usage data
    const mockResponse: AIResponse = {
      model: 'gpt-4-turbo',
      provider: 'openai',
      content: 'This is a test response without usage data'
      // No usage field
    };

    vi.mocked(mockProvider.execute).mockResolvedValue(mockResponse);

    const prompt = 'Test prompt for token estimation';
    
    // Execute orchestration
    const result = await orchestrator.orchestrate({
      prompt,
      models: ['gpt-4-turbo'],
      registry: mockRegistry
    });

    // Verify estimated costs
    expect(result.costs).toHaveLength(1);
    expect(result.costs![0]).toMatchObject({
      model: 'gpt-4-turbo',
      provider: 'openai',
      // Estimated tokens based on text length / 4
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(mockResponse.content.length / 4)
    });
  });

  it('should handle failed responses gracefully', async () => {
    // Mock config with pricing
    vi.mocked(configManager.getConfig).mockResolvedValue({
      services: {
        openai: {
          apiKey: 'test-key',
          pricing: {
            'gpt-4-turbo': {
              inputCostPerMillion: 10.0,
              outputCostPerMillion: 30.0
            }
          }
        }
      }
    });

    // Mock provider to throw error
    vi.mocked(mockProvider.execute).mockRejectedValue(new Error('API Error'));

    // Execute orchestration
    const result = await orchestrator.orchestrate({
      prompt: 'Test prompt',
      models: ['gpt-4-turbo'],
      registry: mockRegistry
    });

    // Verify no costs for failed response
    expect(result.failed).toContain('gpt-4-turbo');
    expect(result.costs).toEqual([]);
    expect(result.totalCost).toBe(0);
  });
});