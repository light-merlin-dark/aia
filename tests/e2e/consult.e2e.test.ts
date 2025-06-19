import { describe, it, expect, beforeEach } from 'bun:test';
import { orchestrate } from '../../src/core/orchestrator';
import { PluginRegistry } from '../../src/plugins/registry';
import type { AIProviderPlugin, AIResponse, AIExecuteOptions } from '../../src/plugins/types';

// This is an E2E test using mock AI providers
// Run with: bun test tests/e2e/consult.e2e.test.ts

// Mock AI provider that simulates real responses
class MockAIProvider implements AIProviderPlugin {
  name: string;
  version = '1.0.0';
  description: string;
  private models: string[];

  constructor(name: string, models: string[]) {
    this.name = name;
    this.description = `Mock ${name} provider`;
    this.models = models;
  }

  listModels(): string[] {
    return this.models;
  }

  async execute(options: AIExecuteOptions): Promise<AIResponse> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Generate response based on prompt content
    let content = '';
    const prompt = options.prompt.toLowerCase();
    
    if (prompt.includes('2 + 2')) {
      content = '4';
    } else if (prompt.includes('color') && prompt.includes('sky')) {
      content = 'blue';
    } else if (prompt.includes('analyze') && prompt.includes('code')) {
      content = 'This Python code defines a Fibonacci function that calculates Fibonacci numbers recursively. The function returns the nth Fibonacci number.';
    } else {
      content = `Mock response from ${this.name} for: ${options.prompt.substring(0, 50)}...`;
    }

    return {
      model: options.model,
      provider: this.name,
      content,
      usage: {
        promptTokens: Math.floor(options.prompt.length / 4),
        completionTokens: Math.floor(content.length / 4),
        totalTokens: Math.floor((options.prompt.length + content.length) / 4)
      }
    };
  }

  async onLoad(_config: any): Promise<void> {}
  validateConfig(_config: any): boolean { return true; }
  isModelAvailable(model: string): boolean { return this.models.includes(model); }
  getRequiredEnvVars(): string[] { return []; }
}

describe('AI Advisor E2E Tests', () => {
  let registry: PluginRegistry;
  
  beforeEach(async () => {
    // Create fresh registry with mock providers
    registry = new PluginRegistry();
    
    // Create mock providers
    const openaiMock = new MockAIProvider('openai', ['gpt-3.5-turbo', 'gpt-4']);
    const anthropicMock = new MockAIProvider('anthropic', ['claude-3-haiku-20240307', 'claude-3-opus-20240229']);
    
    // Register mock providers
    (registry as any).plugins.set('openai', openaiMock);
    (registry as any).plugins.set('anthropic', anthropicMock);
    (registry as any).enabledPlugins.add('openai');
    (registry as any).enabledPlugins.add('anthropic');
  });
  
  it('should consult AI without file attachments', async () => {
    const prompt = 'What is 2 + 2? Reply with just the number.';
    
    // Use a single model to minimize costs
    const result = await orchestrate({
      prompt,
      models: ['gpt-3.5-turbo'], // Using cheaper model for tests
      registry
    });
    
    // Verify response structure
    expect(result.responses).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(result.responses[0].model).toBe('gpt-3.5-turbo');
    expect(result.responses[0].provider).toBe('openai');
    expect(result.responses[0].content).toBeTruthy();
    expect(result.responses[0].isError).toBeUndefined();
    
    // The response should contain "4"
    expect(result.responses[0].content).toMatch(/4/);
  });
  
  it('should handle orchestration with multiple models', async () => {
    const prompt = 'What color is the sky? Reply with one word.';
    
    // Test with multiple models (keep costs low)
    const result = await orchestrate({
      prompt,
      models: ['gpt-3.5-turbo', 'claude-3-haiku-20240307'],
      registry
    });
    
    // Should have responses from both models
    expect(result.responses.length).toBeGreaterThan(0);
    
    // Verify each response has proper structure
    result.responses.forEach(response => {
      expect(response.model).toBeTruthy();
      expect(response.provider).toBeTruthy();
      expect(response.content).toBeTruthy();
      expect(response.isError).toBeUndefined();
    });
    
    // Should contain "blue" in at least one response
    const hasBlue = result.responses.some(r => 
      r.content.toLowerCase().includes('blue')
    );
    expect(hasBlue).toBe(true);
  });
  
  it('should handle file attachments', async () => {
    const prompt = 'Analyze this code and tell me what it does.';
    
    const result = await orchestrate({
      prompt,
      files: ['tests/data/sample_code.py'],
      models: ['gpt-3.5-turbo'],
      registry
    });
    
    // Verify response structure
    expect(result.responses).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(result.responses[0].content).toBeTruthy();
    
    // Should mention something about the code
    expect(result.responses[0].content.toLowerCase()).toMatch(/code|function|python/);
  });
  
});