import { describe, it, expect, vi, beforeEach } from 'vitest';
import OpenAIPlugin from '../index';

// Mock OpenAI
vi.mock('openai', () => {
  const mockCreate = vi.fn();
  
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate
        }
      }
    })),
    __mockCreate: mockCreate
  };
});

describe('OpenAI Plugin', () => {
  let plugin: typeof OpenAIPlugin;
  let mockContext: any;

  beforeEach(() => {
    // Reset the plugin state
    plugin = OpenAIPlugin;
    
    mockContext = {
      services: {
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        }
      },
      pluginConfig: {
        apiKey: 'test-api-key'
      }
    };

    // Clear mocks
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('should have correct plugin metadata', () => {
      expect(plugin.name).toBe('openai');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBe('OpenAI GPT models provider');
    });
  });

  describe('listModels', () => {
    it('should return available models', () => {
      const models = plugin.listModels();
      expect(models).toContain('gpt-4-turbo');
      expect(models).toContain('gpt-4');
      expect(models).toContain('gpt-3.5-turbo');
    });
  });

  describe('onLoad', () => {
    it('should initialize with API key from config', async () => {
      await plugin.onLoad(mockContext);
      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'OpenAI plugin loaded successfully'
      );
    });

    it('should throw error if no API key is provided', async () => {
      mockContext.pluginConfig = {};
      delete process.env.OPENAI_API_KEY;
      
      await expect(plugin.onLoad(mockContext)).rejects.toThrow(
        'OpenAI API key not configured'
      );
    });

    it('should use environment variable if config API key not provided', async () => {
      process.env.OPENAI_API_KEY = 'env-api-key';
      mockContext.pluginConfig = {};
      
      await expect(plugin.onLoad(mockContext)).resolves.not.toThrow();
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await plugin.onLoad(mockContext);
    });

    it('should execute prompt successfully', async () => {
      const mockOpenAI = await import('openai');
      const mockCreate = (mockOpenAI as any).__mockCreate;
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: { content: 'Test response' },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      });

      const response = await plugin.execute({
        model: 'gpt-4',
        prompt: 'Test prompt'
      });

      expect(response.content).toBe('Test response');
      expect(response.model).toBe('gpt-4');
      expect(response.provider).toBe('openai');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      });
    });

    it('should handle system prompt', async () => {
      const mockOpenAI = await import('openai');
      const mockCreate = (mockOpenAI as any).__mockCreate;
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: { content: 'Test response' },
          finish_reason: 'stop'
        }]
      });

      await plugin.execute({
        model: 'gpt-4',
        prompt: 'Test prompt',
        systemPrompt: 'You are a helpful assistant'
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Test prompt' }
          ]
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      const mockOpenAI = await import('openai');
      const mockCreate = (mockOpenAI as any).__mockCreate;
      
      mockCreate.mockRejectedValueOnce(new Error('API Error'));

      const response = await plugin.execute({
        model: 'gpt-4',
        prompt: 'Test prompt'
      });

      expect(response.isError).toBe(true);
      expect(response.error).toBe('API Error');
      expect(response.content).toBe('');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      expect(plugin.validateConfig({
        apiKey: 'test-key',
        organization: 'test-org',
        baseURL: 'https://api.openai.com'
      })).toBe(true);
    });

    it('should validate empty config', () => {
      expect(plugin.validateConfig({})).toBe(true);
    });

    it('should reject invalid config', () => {
      expect(plugin.validateConfig(null)).toBe(false);
      expect(plugin.validateConfig('invalid')).toBe(false);
      expect(plugin.validateConfig({ apiKey: 123 })).toBe(false);
    });
  });

  describe('isModelAvailable', () => {
    it('should return true for available models', () => {
      expect(plugin.isModelAvailable('gpt-4')).toBe(true);
      expect(plugin.isModelAvailable('gpt-3.5-turbo')).toBe(true);
    });

    it('should return false for unavailable models', () => {
      expect(plugin.isModelAvailable('gpt-5')).toBe(false);
      expect(plugin.isModelAvailable('invalid-model')).toBe(false);
    });
  });

  describe('getRequiredEnvVars', () => {
    it('should return required environment variables', () => {
      const vars = plugin.getRequiredEnvVars();
      expect(vars).toContain('OPENAI_API_KEY');
    });
  });
});