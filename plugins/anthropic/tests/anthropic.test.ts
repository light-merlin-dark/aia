import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnthropicPlugin from '../index';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  
  return {
    default: vi.fn().mockImplementation(() => ({
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
      expect(plugin.name).toBe('anthropic');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBe('Anthropic Claude models provider');
    });
  });

  describe('listModels', () => {
    it('should return available models', () => {
      const models = plugin.listModels();
      expect(models).toContain('claude-3-opus-20240229');
      expect(models).toContain('claude-3-sonnet-20240229');
      expect(models).toContain('claude-3-haiku-20240307');
      expect(models).toContain('claude-2.1');
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
      
      await expect(plugin.onLoad(mockContext)).resolves.not.toThrow();
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await plugin.onLoad(mockContext);
    });

    it('should execute prompt successfully', async () => {
      const mockAnthropic = await import('@anthropic-ai/sdk');
      const mockCreate = (mockAnthropic as any).__mockCreate;
      
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
        model: 'claude-3-opus-20240229',
        prompt: 'Test prompt'
      });

      expect(response.content).toBe('Test response line 1\nTest response line 2');
      expect(response.model).toBe('claude-3-opus-20240229');
      expect(response.provider).toBe('anthropic');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      });
      expect(response.metadata?.messageId).toBe('msg_123');
    });

    it('should handle system prompt', async () => {
      const mockAnthropic = await import('@anthropic-ai/sdk');
      const mockCreate = (mockAnthropic as any).__mockCreate;
      
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
      const mockAnthropic = await import('@anthropic-ai/sdk');
      const mockCreate = (mockAnthropic as any).__mockCreate;
      
      const error = new Error('API Error');
      (error as any).status = 429;
      (error as any).type = 'rate_limit_error';
      mockCreate.mockRejectedValueOnce(error);

      const response = await plugin.execute({
        model: 'claude-3-opus-20240229',
        prompt: 'Test prompt'
      });

      expect(response.isError).toBe(true);
      expect(response.error).toBe('API Error');
      expect(response.content).toBe('');
      expect(response.metadata?.statusCode).toBe(429);
      expect(response.metadata?.errorType).toBe('rate_limit_error');
    });

    it('should use default max tokens if not specified', async () => {
      const mockAnthropic = await import('@anthropic-ai/sdk');
      const mockCreate = (mockAnthropic as any).__mockCreate;
      
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Test' }],
        usage: { input_tokens: 10, output_tokens: 20 }
      });

      await plugin.execute({
        model: 'claude-3-opus-20240229',
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
    it('should return true for available models', () => {
      expect(plugin.isModelAvailable('claude-3-opus-20240229')).toBe(true);
      expect(plugin.isModelAvailable('claude-2.1')).toBe(true);
    });

    it('should support shorthand model names', () => {
      expect(plugin.isModelAvailable('claude-3-opus')).toBe(true);
      expect(plugin.isModelAvailable('claude-3-sonnet')).toBe(true);
      expect(plugin.isModelAvailable('claude-3-haiku')).toBe(true);
    });

    it('should return false for unavailable models', () => {
      expect(plugin.isModelAvailable('claude-4')).toBe(false);
      expect(plugin.isModelAvailable('invalid-model')).toBe(false);
    });
  });

  describe('getRequiredEnvVars', () => {
    it('should return required environment variables', () => {
      const vars = plugin.getRequiredEnvVars();
      expect(vars).toContain('ANTHROPIC_API_KEY');
    });
  });
});