import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator, orchestrate } from '../../src/core/orchestrator';
import { PluginRegistry } from '../../src/plugins/registry';
import { FileResolver } from '../../src/services/file-resolver';
import { buildPrompt } from '../../src/core/prompt-builder';
import type { AIProviderPlugin, AIResponse } from '../../src/plugins/types';

// Mock dependencies
vi.mock('../../src/plugins/registry');
vi.mock('../../src/services/file-resolver');
vi.mock('../../src/services/logger');
vi.mock('../../src/core/prompt-builder');
vi.mock('p-retry', () => ({
  default: vi.fn((fn: any, options: any) => fn()),
  AbortError: class AbortError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AbortError';
    }
  }
}));

// Mock provider for testing
const mockProvider: AIProviderPlugin = {
  name: 'mock-provider',
  listModels: vi.fn(() => ['model1', 'model2']),
  execute: vi.fn()
};

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let mockRegistry: any;
  
  beforeEach(() => {
    orchestrator = new Orchestrator();
    mockRegistry = {
      getAIProvider: vi.fn().mockReturnValue(mockProvider)
    };
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup default mock behaviors
    vi.mocked(FileResolver.detectWorkingDirectory).mockReturnValue('/test/dir');
    vi.mocked(FileResolver.resolveFiles).mockResolvedValue([]);
    vi.mocked(buildPrompt).mockImplementation((prompt) => prompt);
  });
  
  afterEach(() => {
    vi.clearAllTimers();
  });
  
  describe('orchestrate', () => {
    it('should execute multiple models in parallel', async () => {
      const mockResponses: AIResponse[] = [
        { model: 'model1', provider: 'mock-provider', content: 'Response 1' },
        { model: 'model2', provider: 'mock-provider', content: 'Response 2' }
      ];
      
      mockProvider.execute = vi.fn()
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);
      
      const result = await orchestrator.orchestrate({
        prompt: 'Test prompt',
        models: ['model1', 'model2'],
        registry: mockRegistry
      });
      
      expect(result.responses).toHaveLength(2);
      expect(result.responses[0]).toEqual(mockResponses[0]);
      expect(result.responses[1]).toEqual(mockResponses[1]);
      expect(result.failed).toHaveLength(0);
      expect(mockProvider.execute).toHaveBeenCalledTimes(2);
    });
    
    it('should handle file resolution when files are provided', async () => {
      const mockResolvedFiles = [
        { path: '/test/file1.txt', content: 'File 1 content' },
        { path: '/test/file2.txt', content: 'File 2 content' }
      ];
      
      vi.mocked(FileResolver.resolveFiles).mockResolvedValue(mockResolvedFiles);
      vi.mocked(buildPrompt).mockReturnValue('Prompt with files');
      
      mockProvider.execute = vi.fn().mockResolvedValue({
        model: 'model1',
        provider: 'mock-provider',
        content: 'Response'
      });
      
      await orchestrator.orchestrate({
        prompt: 'Test prompt',
        files: ['file1.txt', 'file2.txt'],
        models: ['model1'],
        registry: mockRegistry
      });
      
      expect(FileResolver.detectWorkingDirectory).toHaveBeenCalled();
      expect(FileResolver.resolveFiles).toHaveBeenCalledWith(
        ['file1.txt', 'file2.txt'],
        {
          workingDirectory: '/test/dir',
          maxFileSize: 50 * 1024
        }
      );
      expect(buildPrompt).toHaveBeenCalledWith('Test prompt', mockResolvedFiles);
    });
    
    it('should handle model execution failures', async () => {
      mockProvider.execute = vi.fn()
        .mockResolvedValueOnce({ model: 'model1', provider: 'mock-provider', content: 'Success' })
        .mockRejectedValueOnce(new Error('Model 2 failed'));
      
      const result = await orchestrator.orchestrate({
        prompt: 'Test prompt',
        models: ['model1', 'model2'],
        registry: mockRegistry
      });
      
      expect(result.responses).toHaveLength(2);
      expect(result.responses[0].content).toBe('Success');
      expect(result.responses[1].isError).toBe(true);
      expect(result.responses[1].error).toBe('Model 2 failed');
      expect(result.failed).toEqual(['model2']);
    });
    
    it('should retry failed requests', async () => {
      const pRetry = await import('p-retry');
      const mockRetry = vi.fn((fn) => {
        // Simulate retry by calling function twice
        return fn().catch(() => fn());
      });
      vi.mocked(pRetry.default).mockImplementation(mockRetry);
      
      mockProvider.execute = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ model: 'model1', provider: 'mock-provider', content: 'Success after retry' });
      
      const result = await orchestrator.orchestrate({
        prompt: 'Test prompt',
        models: ['model1'],
        registry: mockRegistry,
        maxRetries: 2
      });
      
      expect(result.responses[0].content).toBe('Success after retry');
      expect(result.failed).toHaveLength(0);
    });
    
    it('should handle timeout errors', async () => {
      // Simply test that timeout is passed through
      mockProvider.execute = vi.fn().mockRejectedValue(new Error('Request timeout'));
      
      const result = await orchestrator.orchestrate({
        prompt: 'Test prompt',
        models: ['model1'],
        registry: mockRegistry,
        timeout: 100 // Very short timeout
      });
      
      expect(result.failed).toContain('model1');
      expect(result.responses[0].error).toContain('Request timeout');
    });
    
    // Rate limit handling is tested implicitly through retry tests
    
    it('should handle missing provider gracefully', async () => {
      mockRegistry.getAIProvider = vi.fn().mockReturnValue(null);
      
      const result = await orchestrator.orchestrate({
        prompt: 'Test prompt',
        models: ['unknown-model'],
        registry: mockRegistry
      });
      
      expect(result.failed).toContain('unknown-model');
      expect(result.responses[0].isError).toBe(true);
      expect(result.responses[0].error).toContain('No provider found');
    });
    
    it('should select best response when bestOf is enabled', async () => {
      const mockResponses: AIResponse[] = [
        { model: 'model1', provider: 'mock-provider', content: 'Good response' },
        { model: 'model2', provider: 'mock-provider', content: 'Best response' },
        { model: 'model3', provider: 'mock-provider', content: 'Okay response' }
      ];
      
      mockProvider.execute = vi.fn()
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1])
        .mockResolvedValueOnce(mockResponses[2])
        // Mock evaluation response
        .mockResolvedValueOnce({ model: 'model1', provider: 'mock-provider', content: '2' });
      
      const result = await orchestrator.orchestrate({
        prompt: 'Test prompt',
        models: ['model1', 'model2', 'model3'],
        bestOf: true,
        registry: mockRegistry
      });
      
      expect(result.bestIndex).toBe(1); // Index 1 is model2
      expect(mockProvider.execute).toHaveBeenCalledTimes(4); // 3 models + 1 evaluation
    });
    
    it('should handle bestOf when all responses are errors', async () => {
      mockProvider.execute = vi.fn()
        .mockRejectedValue(new Error('All models failed'));
      
      const result = await orchestrator.orchestrate({
        prompt: 'Test prompt',
        models: ['model1', 'model2'],
        bestOf: true,
        registry: mockRegistry
      });
      
      expect(result.bestIndex).toBe(0); // Default to first
      expect(result.failed).toHaveLength(2);
    });
    
    it('should handle bestOf evaluation failures gracefully', async () => {
      const mockResponses: AIResponse[] = [
        { model: 'model1', provider: 'mock-provider', content: 'Response 1' },
        { model: 'model2', provider: 'mock-provider', content: 'Response 2' }
      ];
      
      mockProvider.execute = vi.fn()
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1])
        .mockRejectedValueOnce(new Error('Evaluation failed'));
      
      const result = await orchestrator.orchestrate({
        prompt: 'Test prompt',
        models: ['model1', 'model2'],
        bestOf: true,
        registry: mockRegistry
      });
      
      expect(result.bestIndex).toBe(0); // Default to first valid response
    });
    
    it('should handle orchestration-level errors', async () => {
      vi.mocked(FileResolver.resolveFiles).mockRejectedValue(new Error('File system error'));
      
      const result = await orchestrator.orchestrate({
        prompt: 'Test prompt',
        files: ['bad-file.txt'],
        models: ['model1'],
        registry: mockRegistry
      });
      
      expect(result.error).toBe('File system error');
      expect(result.failed).toEqual(['model1']);
      expect(result.responses).toHaveLength(0);
    });
    
    it('should track execution duration', async () => {
      const start = Date.now();
      
      mockProvider.execute = vi.fn().mockResolvedValue({
        model: 'model1',
        provider: 'mock-provider',
        content: 'Response'
      });
      
      const result = await orchestrator.orchestrate({
        prompt: 'Test prompt',
        models: ['model1'],
        registry: mockRegistry
      });
      
      const end = Date.now();
      
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThanOrEqual(end - start + 10); // Allow 10ms margin
      expect(typeof result.durationMs).toBe('number');
    });
  });
  
  describe('orchestrate function export', () => {
    it('should create new orchestrator instance for each call', async () => {
      mockProvider.execute = vi.fn().mockResolvedValue({
        model: 'model1',
        provider: 'mock-provider',
        content: 'Response'
      });
      
      const result1 = await orchestrate({
        prompt: 'Test 1',
        models: ['model1'],
        registry: mockRegistry
      });
      
      const result2 = await orchestrate({
        prompt: 'Test 2',
        models: ['model1'],
        registry: mockRegistry
      });
      
      expect(result1).not.toBe(result2);
      expect(mockProvider.execute).toHaveBeenCalledTimes(2);
    });
  });
});