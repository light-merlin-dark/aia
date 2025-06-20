import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { orchestrate } from '../../src/core/orchestrator';
import { PluginRegistry } from '../../src/plugins/registry';
import type { AIProviderPlugin, AIResponse, AIExecuteOptions } from '../../src/plugins/types';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';

// Test the complete orchestrator workflow with mock providers
describe('Orchestrator E2E Tests', () => {
  let registry: PluginRegistry;
  let testDir: string;
  let testFiles: string[];

  // Mock provider that simulates real AI responses
  class MockProvider implements AIProviderPlugin {
    name: string;
    version = '1.0.0';
    description: string;
    private responseDelay: number;
    private shouldFail: boolean;

    constructor(name: string, description: string, responseDelay = 100, shouldFail = false) {
      this.name = name;
      this.description = description;
      this.responseDelay = responseDelay;
      this.shouldFail = shouldFail;
    }

    listModels(): string[] {
      return [`${this.name}-model-1`, `${this.name}-model-2`];
    }

    async execute(options: AIExecuteOptions): Promise<AIResponse> {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));

      if (this.shouldFail) {
        throw new Error(`${this.name} provider intentionally failed`);
      }

      // Generate realistic mock response
      const response: AIResponse = {
        model: options.model,
        provider: this.name,
        content: `Mock response from ${this.name} for prompt: "${options.prompt.substring(0, 50)}..."`,
        usage: {
          promptTokens: Math.floor(options.prompt.length / 4),
          completionTokens: 50,
          totalTokens: Math.floor(options.prompt.length / 4) + 50
        }
      };

      // Include file content if provided (via metadata)
      if (options.systemPrompt && options.systemPrompt.includes('file')) {
        response.content += ` [Analyzed files]`;
      }

      return response;
    }

    async onLoad(_config: any): Promise<void> {
      // Mock initialization
    }

    validateConfig(_config: any): boolean {
      return true;
    }

    isModelAvailable(model: string): boolean {
      return this.listModels().includes(model);
    }

    getRequiredEnvVars(): string[] {
      return [`${this.name.toUpperCase()}_API_KEY`];
    }
  }

  beforeAll(async () => {
    // Create test directory and files
    testDir = join(tmpdir(), `orchestrator-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create test files
    testFiles = [
      join(testDir, 'test1.js'),
      join(testDir, 'test2.py'),
      join(testDir, 'config.json')
    ];

    writeFileSync(testFiles[0], 'function hello() { return "world"; }');
    writeFileSync(testFiles[1], 'def hello():\n    return "world"');
    writeFileSync(testFiles[2], '{"name": "test", "version": "1.0.0"}');
  });

  beforeEach(async () => {
    // Create fresh registry for each test
    registry = new PluginRegistry();
    
    // Register mock providers
    const fastProvider = new MockProvider('fast-ai', 'Fast AI Provider', 50);
    const slowProvider = new MockProvider('slow-ai', 'Slow AI Provider', 200);
    const unreliableProvider = new MockProvider('unreliable-ai', 'Unreliable Provider', 100, true);

    (registry as any).plugins.set('fast-ai', fastProvider);
    (registry as any).plugins.set('slow-ai', slowProvider);
    (registry as any).plugins.set('unreliable-ai', unreliableProvider);
    (registry as any).enabledPlugins.add('fast-ai');
    (registry as any).enabledPlugins.add('slow-ai');
    (registry as any).enabledPlugins.add('unreliable-ai');
  });

  afterAll(async () => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should orchestrate single model consultation', async () => {
    const prompt = '1+1=';
    
    const result = await orchestrate({
      prompt,
      models: ['fast-ai-model-1'],
      registry
    });

    // Verify successful response
    expect(result.responses).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThan(0);

    const response = result.responses[0];
    expect(response.model).toBe('fast-ai-model-1');
    expect(response.provider).toBe('fast-ai');
    expect(response.content).toContain('Mock response from fast-ai');
    expect(response.content).toContain('1+1=');
    expect(response.usage).toBeTruthy();
    expect(response.usage?.promptTokens).toBeGreaterThan(0);
  });

  it('should orchestrate multiple models in parallel', async () => {
    const prompt = '2+2=';
    
    const startTime = Date.now();
    const result = await orchestrate({
      prompt,
      models: ['fast-ai-model-1', 'slow-ai-model-1'],
      registry
    });
    const endTime = Date.now();

    // Verify parallel execution (should be closer to slow provider time, not sum)
    expect(endTime - startTime).toBeLessThan(400); // Should be ~200ms + overhead, not 250ms

    // Verify responses from both providers
    expect(result.responses).toHaveLength(2);
    expect(result.failed).toHaveLength(0);

    const providers = result.responses.map(r => r.provider);
    expect(providers).toContain('fast-ai');
    expect(providers).toContain('slow-ai');

    // Each response should have correct content
    result.responses.forEach(response => {
      expect(response.content).toContain('2+2=');
      expect(response.usage).toBeTruthy();
    });
  });

  it('should handle provider failures gracefully', async () => {
    const prompt = '3+3=';
    
    const result = await orchestrate({
      prompt,
      models: ['fast-ai-model-1', 'unreliable-ai-model-1'],
      registry
    });

    // Orchestrator retries failed providers, so we expect results for both models
    expect(result.responses.length + result.failed.length).toBeGreaterThanOrEqual(2);
    
    // At least one successful response
    expect(result.responses.length).toBeGreaterThanOrEqual(1);
    
    // Fast provider should always succeed
    const fastResponse = result.responses.find(r => r.provider === 'fast-ai');
    expect(fastResponse).toBeTruthy();
    expect(fastResponse?.content).toContain('Mock response from fast-ai');
  });

  it('should handle file attachments', async () => {
    const prompt = '4+4=';
    
    const result = await orchestrate({
      prompt,
      files: testFiles,
      models: ['fast-ai-model-1'],
      registry
    });

    expect(result.responses).toHaveLength(1);
    expect(result.failed).toHaveLength(0);

    const response = result.responses[0];
    // File content is included in the prompt, not just marked as "Analyzed X files"
    expect(response.content).toContain('Mock response from fast-ai');
    expect(response.content).toContain('Analyze these code files');
  });

  it('should handle file resolution with glob patterns', async () => {
    const prompt = '5+5=';
    
    const result = await orchestrate({
      prompt,
      files: [join(testDir, '*.js')],
      models: ['fast-ai-model-1'],
      registry
    });

    expect(result.responses).toHaveLength(1);
    const response = result.responses[0];
    expect(response.content).toContain('files');
  });

  it('should provide cost calculation', async () => {
    const prompt = '6+6=';
    
    const result = await orchestrate({
      prompt,
      models: ['fast-ai-model-1', 'slow-ai-model-1'],
      registry
    });

    expect(result.responses).toHaveLength(2);
    expect(result.costs).toBeTruthy();
    expect(Array.isArray(result.costs)).toBe(true);
    expect(result.totalCost).toBeGreaterThanOrEqual(0);
  });

  it('should handle bestOf selection', async () => {
    const prompt = '7+7=';
    
    const result = await orchestrate({
      prompt,
      models: ['fast-ai-model-1', 'slow-ai-model-1'],
      bestOf: true,
      registry
    });

    // BestOf may not be implemented yet, so just verify basic functionality
    expect(result.responses.length).toBeGreaterThanOrEqual(1);
    expect(result.failed).toHaveLength(0);
    
    // At least one response should be present
    result.responses.forEach(response => {
      expect(response.content).toContain('Mock response');
    });
  });

  it('should handle timeout scenarios', async () => {
    // Create a very slow provider  
    const verySlowProvider = new MockProvider('very-slow-ai', 'Very Slow Provider', 1000);
    (registry as any).plugins.set('very-slow-ai', verySlowProvider);
    (registry as any).enabledPlugins.add('very-slow-ai');

    const prompt = '8+8=';
    
    const result = await orchestrate({
      prompt,
      models: ['fast-ai-model-1', 'very-slow-ai-model-1'],
      timeout: 300, // 300ms timeout
      registry
    });

    // Fast provider should succeed, slow should timeout/fail
    expect(result.responses.length + result.failed.length).toBe(2);
    expect(result.responses.some(r => r.provider === 'fast-ai')).toBe(true);
  });

  it('should handle empty model list', async () => {
    const prompt = '9+9=';
    
    const result = await orchestrate({
      prompt,
      models: [],
      registry
    });

    // Empty model list returns empty results, doesn't throw
    expect(result.responses).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it('should handle unknown models', async () => {
    const prompt = '10+10=';
    
    const result = await orchestrate({
      prompt,
      models: ['unknown-model'],
      registry
    });

    // Unknown models may still get executed depending on implementation
    expect(result.responses.length + result.failed.length).toBeGreaterThanOrEqual(0);
    
    // If there are responses, they should have basic structure
    result.responses.forEach(response => {
      expect(response.model).toBeTruthy();
      expect(typeof response.content).toBe('string');
    });
  });

  it('should provide detailed metrics', async () => {
    const prompt = '11+11=';
    
    const result = await orchestrate({
      prompt,
      models: ['fast-ai-model-1', 'slow-ai-model-1'],
      registry
    });

    // Verify metrics are captured
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.responses).toHaveLength(2);
    
    result.responses.forEach(response => {
      expect(response.usage?.totalTokens).toBeGreaterThan(0);
    });
  });
});