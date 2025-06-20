import { describe, it, expect, jest, mock, beforeEach } from 'bun:test';
import AnthropicPlugin from '../index';

// Mock Anthropic SDK
let mockCreate: any;

mock.module('@anthropic-ai/sdk', () => {
  mockCreate = jest.fn();
  
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate
      }
    })),
    __mockCreate: mockCreate
  };
});

describe('Anthropic Plugin', () => {
  let plugin: typeof AnthropicPlugin;
  let mockContext: any;

  beforeEach(() => {
    // Reset the plugin state
    plugin = AnthropicPlugin;
    
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
      expect(plugin.name).toBe('anthropic');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBe('Anthropic Claude models provider');
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
        'Anthropic plugin loaded successfully'
      );
    });

    it('should throw error if no API key is provided', async () => {
      mockContext.pluginConfig = {};
      delete process.env.ANTHROPIC_API_KEY;
      
      await expect(plugin.onLoad(mockContext)).rejects.toThrow(
        'Anthropic API key not configured'
      );
    });

    it('should use environment variable if config API key not provided', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-api-key';
      mockContext.pluginConfig = {};
      
      // Should not throw an error
      await plugin.onLoad(mockContext);
      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Anthropic plugin loaded successfully'
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
        id: 'msg_123',
        content: [
          { type: 'text', text: 'Test response line 1' },
          { type: 'text', text: 'Test response line 2' }
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 20
        }
      });

      const response = await plugin.execute({
        model: 'test-model',
        prompt: 'Test prompt'
      });

      expect(response.content).toBe('Test response line 1\nTest response line 2');
      expect(response.model).toBe('test-model');
      expect(response.provider).toBe('anthropic');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      });
      expect(response.metadata?.messageId).toBe('msg_123');
    });

    it('should handle system prompt', async () => {
      // Use the mockCreate from module scope
      
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 10, output_tokens: 20 }
      });

      await plugin.execute({
        model: 'claude-3-sonnet-20240229',
        prompt: 'Test prompt',
        systemPrompt: 'You are a helpful assistant'
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant',
          messages: [{ role: 'user', content: 'Test prompt' }]
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      // Use the mockCreate from module scope
      
      const error = new Error('API Error');
      (error as any).status = 429;
      (error as any).type = 'rate_limit_error';
      mockCreate.mockRejectedValueOnce(error);

      const response = await plugin.execute({
        model: 'test-model',
        prompt: 'Test prompt'
      });

      expect(response.isError).toBe(true);
      expect(response.error).toBe('API Error');
      expect(response.content).toBe('');
      expect(response.metadata?.statusCode).toBe(429);
      expect(response.metadata?.errorType).toBe('rate_limit_error');
    });

    it('should use default max tokens if not specified', async () => {
      // Use the mockCreate from module scope
      
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Test' }],
        usage: { input_tokens: 10, output_tokens: 20 }
      });

      await plugin.execute({
        model: 'test-model',
        prompt: 'Test prompt'
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 4096
        })
      );
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      expect(plugin.validateConfig({
        apiKey: 'test-key',
        baseURL: 'https://api.anthropic.com'
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
      expect(plugin.isModelAvailable('claude-3-opus-20240229')).toBe(false);
      expect(plugin.isModelAvailable('claude-2.1')).toBe(false);
      expect(plugin.isModelAvailable('claude-4')).toBe(false);
      expect(plugin.isModelAvailable('invalid-model')).toBe(false);
    });

    it('should still support shorthand mapping logic (returns false without configured models)', () => {
      expect(plugin.isModelAvailable('claude-3-opus')).toBe(false);
      expect(plugin.isModelAvailable('claude-3-sonnet')).toBe(false);
      expect(plugin.isModelAvailable('claude-3-haiku')).toBe(false);
    });
  });

  describe('getRequiredEnvVars', () => {
    it('should return required environment variables', () => {
      const vars = plugin.getRequiredEnvVars();
      expect(vars).toContain('ANTHROPIC_API_KEY');
    });
  });
});