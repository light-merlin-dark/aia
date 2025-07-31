import { describe, it, expect, jest, beforeEach, afterEach } from 'bun:test';
import OpenRouterPlugin from '../index';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('OpenRouter Plugin', () => {
  let plugin: typeof OpenRouterPlugin;
  let mockContext: any;

  beforeEach(() => {
    // Reset the plugin state
    plugin = OpenRouterPlugin;
    
    mockContext = {
      services: {
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }
      },
      pluginConfig: {
        apiKey: 'test-api-key'
      }
    };

    // Clear mocks
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('metadata', () => {
    it('should have correct plugin metadata', () => {
      expect(plugin.name).toBe('openrouter');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBe('OpenRouter multi-model AI provider');
    });
  });

  describe('listModels', () => {
    it('should return empty array by default', () => {
      const models = plugin.listModels();
      expect(models).toEqual([]);
    });
  });

  describe('onLoad', () => {
    it('should initialize with API key from config', async () => {
      await plugin.onLoad(mockContext);
      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'OpenRouter plugin loaded successfully'
      );
    });

    it('should throw error if no API key is provided', async () => {
      mockContext.pluginConfig = {};
      delete process.env.OPENROUTER_API_KEY;
      
      await expect(plugin.onLoad(mockContext)).rejects.toThrow(
        'OpenRouter API key not configured'
      );
    });

    it('should use environment variable if config API key not provided', async () => {
      process.env.OPENROUTER_API_KEY = 'env-api-key';
      mockContext.pluginConfig = {};
      
      // Should not throw an error
      await plugin.onLoad(mockContext);
      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'OpenRouter plugin loaded successfully'
      );
    });

    it('should use custom base URL if provided', async () => {
      mockContext.pluginConfig.baseURL = 'https://custom.openrouter.ai';
      await plugin.onLoad(mockContext);
      
      // The baseURL should be stored internally
      expect(mockContext.services.logger.info).toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      // Reset plugin to fresh state
      plugin = OpenRouterPlugin;
      await plugin.onLoad(mockContext);
    });

    it('should execute prompt successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Test response' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          },
          model: 'openai/gpt-4-turbo-preview'
        })
      });

      const response = await plugin.execute({
        model: 'openai/gpt-4-turbo-preview',
        prompt: 'Test prompt'
      });

      expect(response.content).toBe('Test response');
      expect(response.model).toBe('openai/gpt-4-turbo-preview');
      expect(response.provider).toBe('openrouter');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      });
      expect(response.metadata?.modelUsed).toBe('openai/gpt-4-turbo-preview');
    });

    it('should include proper headers in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Test' } }]
        })
      });

      await plugin.execute({
        model: 'anthropic/claude-3-opus',
        prompt: 'Test prompt'
      });

      expect(mockFetch).toHaveBeenCalled();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toMatch(/https:\/\/.*openrouter\.ai.*\/chat\/completions/);
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer test-api-key');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['HTTP-Referer']).toBeDefined();
      expect(options.headers['X-Title']).toBeDefined();
    });

    it('should handle system prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Test' } }]
        })
      });

      await plugin.execute({
        model: 'openai/gpt-4',
        prompt: 'Test prompt',
        systemPrompt: 'You are a helpful assistant'
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Test prompt' }
      ]);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({
          error: { message: 'Rate limit exceeded' }
        })
      });

      const response = await plugin.execute({
        model: 'openai/gpt-4',
        prompt: 'Test prompt'
      });

      expect(response.isError).toBe(true);
      expect(response.error).toBe('Rate limit exceeded');
      expect(response.content).toBe('');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const response = await plugin.execute({
        model: 'openai/gpt-4',
        prompt: 'Test prompt'
      });

      expect(response.isError).toBe(true);
      expect(response.error).toBe('Network error');
      expect(response.content).toBe('');
    });

    it('should handle missing response data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] })
      });

      const response = await plugin.execute({
        model: 'openai/gpt-4',
        prompt: 'Test prompt'
      });

      expect(response.isError).toBe(true);
      expect(response.error).toBe('No response from OpenRouter');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      expect(plugin.validateConfig({
        apiKey: 'test-key',
        baseURL: 'https://api.openrouter.ai',
        siteUrl: 'https://mysite.com',
        siteName: 'My Site'
      })).toBe(true);
    });

    it('should validate empty config', () => {
      expect(plugin.validateConfig({})).toBe(true);
    });

    it('should reject invalid config', () => {
      expect(plugin.validateConfig(null)).toBe(false);
      expect(plugin.validateConfig('invalid')).toBe(false);
      expect(plugin.validateConfig({ apiKey: 123 })).toBe(false);
      expect(plugin.validateConfig({ siteUrl: 123 })).toBe(false);
    });
  });

  describe('isModelAvailable', () => {
    it('should return true for known models', () => {
      expect(plugin.isModelAvailable('openai/gpt-4')).toBe(true);
      expect(plugin.isModelAvailable('anthropic/claude-3-opus')).toBe(true);
    });

    it('should return true for valid model format', () => {
      expect(plugin.isModelAvailable('provider/model-name')).toBe(true);
      expect(plugin.isModelAvailable('some-provider/some-model-v2')).toBe(true);
    });

    it('should return false for invalid model format', () => {
      expect(plugin.isModelAvailable('invalid-model')).toBe(false);
      expect(plugin.isModelAvailable('no-slash')).toBe(false);
      expect(plugin.isModelAvailable('/invalid')).toBe(false);
      expect(plugin.isModelAvailable('invalid/')).toBe(false);
    });
  });

  describe('getRequiredEnvVars', () => {
    it('should return required environment variables', () => {
      const vars = plugin.getRequiredEnvVars();
      expect(vars).toContain('OPENROUTER_API_KEY');
    });
  });

  describe('fetchAvailableModels', () => {
    beforeEach(async () => {
      await plugin.onLoad(mockContext);
    });

    it('should fetch models from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'openai/gpt-4', name: 'GPT-4' },
            { id: 'anthropic/claude-3', name: 'Claude 3' }
          ]
        })
      });

      const models = await plugin.fetchAvailableModels();
      
      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({ id: 'openai/gpt-4', name: 'GPT-4' });
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const models = await plugin.fetchAvailableModels();
      
      expect(models).toEqual([]);
      expect(mockContext.services.logger.error).toHaveBeenCalled();
    });
  });
});