import { describe, it, expect, jest, mock, beforeEach } from 'bun:test';
import OpenAIPlugin from '../index';

// Mock OpenAI
let mockCreate: any;

mock.module('openai', () => {
  mockCreate = jest.fn();
  
  return {
    default: jest.fn().mockImplementation(() => ({
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
  });

  describe('metadata', () => {
    it('should have correct plugin metadata', () => {
      expect(plugin.name).toBe('openai');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBe('OpenAI GPT models provider');
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
      
      // Should not throw an error
      await plugin.onLoad(mockContext);
      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'OpenAI plugin loaded successfully'
      );
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await plugin.onLoad(mockContext);
    });

    it('should execute prompt successfully', async () => {
      // Use the mockCreate from module scope
      
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
        model: 'test-model',
        prompt: 'Test prompt'
      });

      expect(response.content).toBe('Test response');
      expect(response.model).toBe('test-model');
      expect(response.provider).toBe('openai');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      });
    });

    it('should handle system prompt', async () => {
      // Use the mockCreate from module scope
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: { content: 'Test response' },
          finish_reason: 'stop'
        }]
      });

      await plugin.execute({
        model: 'test-model',
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
      // Use the mockCreate from module scope
      
      mockCreate.mockRejectedValueOnce(new Error('API Error'));

      const response = await plugin.execute({
        model: 'test-model',
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
    it('should return false for any model by default (no models configured)', () => {
      expect(plugin.isModelAvailable('test-model-1')).toBe(false);
      expect(plugin.isModelAvailable('test-model-2')).toBe(false);
      expect(plugin.isModelAvailable('test-model-3')).toBe(false);
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