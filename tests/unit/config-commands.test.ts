import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configSetCommand } from '../../src/cli/commands/config-set';
import { configGetCommand } from '../../src/cli/commands/config-get';
import { configListCommand } from '../../src/cli/commands/config-list';
import { configAddModelCommand } from '../../src/cli/commands/config-add-model';
import { configSetDefaultCommand } from '../../src/cli/commands/config-set-default';
import { configRemoveCommand } from '../../src/cli/commands/config-remove';
import { ConfigManager } from '../../src/config/manager';
import prompts from 'prompts';
import type { RuntimeContext } from '../../src/cli/types';
import type { AIAdvisorConfig } from '../../src/config/manager';

// Mock dependencies
vi.mock('../../src/config/manager');
vi.mock('../../src/services/logger');
vi.mock('prompts');

// Mock console output
const originalConsoleLog = console.log;
let consoleOutput: string[] = [];

describe('Config Commands', () => {
  let mockContext: RuntimeContext;
  let mockConfigManager: any;
  let mockConfig: AIAdvisorConfig;
  
  beforeEach(() => {
    vi.clearAllMocks();
    consoleOutput = [];
    console.log = vi.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });
    
    mockContext = {
      workingDir: '/test/dir',
      timestamp: new Date()
    };
    
    mockConfig = {
      services: {
        openai: { 
          apiKey: 'test-openai-key',
          models: ['gpt-4', 'gpt-3.5-turbo']
        },
        anthropic: { 
          apiKey: 'test-anthropic-key',
          models: ['claude-3-opus-20240229']
        },
        openrouter: {
          apiKey: 'test-openrouter-key',
          models: ['google/gemini-pro']
        }
      },
      defaultModel: 'gpt-4',
      defaultModels: ['gpt-4'],
      plugins: {
        enabled: ['openai', 'anthropic'],
        disabled: []
      },
      maxRetries: 2,
      timeout: 60000
    };
    
    mockConfigManager = {
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      saveConfig: vi.fn().mockResolvedValue(undefined)
    };
    
    vi.mocked(ConfigManager.getInstance).mockReturnValue(mockConfigManager);
  });
  
  afterEach(() => {
    console.log = originalConsoleLog;
  });
  
  describe('config-set', () => {
    it('should set API key', async () => {
      const result = await configSetCommand.execute(
        ['openai', 'apiKey', 'sk-new-key-123'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.services.openai.apiKey).toBe('sk-new-key-123');
      expect(mockConfigManager.saveConfig).toHaveBeenCalledWith(mockConfig);
      expect(consoleOutput.join('')).toContain('Configuration updated: openai.apiKey = ***');
    });
    
    it('should add model to service', async () => {
      const result = await configSetCommand.execute(
        ['openai', 'model', 'gpt-4-turbo'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.services.openai.models).toContain('gpt-4-turbo');
      expect(mockConfigManager.saveConfig).toHaveBeenCalled();
    });
    
    it('should set endpoint', async () => {
      const result = await configSetCommand.execute(
        ['openai', 'endpoint', 'https://custom.api.com'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.services.openai.endpoint).toBe('https://custom.api.com');
    });
    
    it('should set default service', async () => {
      const result = await configSetCommand.execute(
        ['openai', 'default', 'true'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.defaultModel).toBe('gpt-4');
      expect(mockConfig.defaultModels).toEqual(['gpt-4', 'gpt-3.5-turbo']);
    });
    
    it('should create service if not exists', async () => {
      const result = await configSetCommand.execute(
        ['newservice', 'apiKey', 'new-key'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.services.newservice).toBeDefined();
      expect(mockConfig.services.newservice.apiKey).toBe('new-key');
    });
    
    it('should handle missing arguments', async () => {
      const result = await configSetCommand.execute(
        ['openai'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Missing required arguments');
      expect(consoleOutput.join('')).toContain('Missing required arguments');
    });
    
    it('should handle unknown key', async () => {
      const result = await configSetCommand.execute(
        ['openai', 'unknownKey', 'value'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown configuration key');
    });
  });
  
  describe('config-get', () => {
    it('should get specific key value', async () => {
      const result = await configGetCommand.execute(
        ['openai', 'models'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('')).toContain('openai.models:');
      expect(consoleOutput.join('')).toContain('gpt-4, gpt-3.5-turbo');
    });
    
    it('should mask API key', async () => {
      const result = await configGetCommand.execute(
        ['openai', 'apiKey'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('')).toContain('***');
      expect(consoleOutput.join('')).not.toContain('test-openai-key');
    });
    
    it('should show all service config', async () => {
      const result = await configGetCommand.execute(
        ['openai'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('')).toContain('openai configuration:');
      expect(consoleOutput.join('')).toContain('API Key:');
      expect(consoleOutput.join('')).toContain('Models:');
      expect(consoleOutput.join('')).toContain('Default:');
    });
    
    it('should handle missing service', async () => {
      const result = await configGetCommand.execute(
        ['nonexistent'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(false);
      expect(consoleOutput.join('')).toContain("Service 'nonexistent' not configured");
    });
    
    it('should handle missing arguments', async () => {
      const result = await configGetCommand.execute(
        [],
        {},
        mockContext
      );
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Service name required');
    });
  });
  
  describe('config-list', () => {
    it('should list all configuration', async () => {
      const result = await configListCommand.execute(
        [],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('')).toContain('AI Advisor Configuration');
      expect(consoleOutput.join('')).toContain('openai (default)');
      expect(consoleOutput.join('')).toContain('anthropic');
      expect(consoleOutput.join('')).toContain('openrouter');
      expect(consoleOutput.join('')).toContain('Default Model: gpt-4');
    });
    
    it('should show pricing if configured', async () => {
      mockConfig.services.openai.pricing = {
        'gpt-4': {
          inputCostPerMillion: 10,
          outputCostPerMillion: 30
        }
      };
      
      const result = await configListCommand.execute(
        [],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('')).toContain('Pricing:');
      expect(consoleOutput.join('')).toContain('gpt-4: $10/M in, $30/M out');
    });
  });
  
  describe('config-add-model', () => {
    it('should add model to existing service', async () => {
      const result = await configAddModelCommand.execute(
        ['openai', 'gpt-4-turbo'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.services.openai.models).toContain('gpt-4-turbo');
      expect(consoleOutput.join('')).toContain("Added model 'gpt-4-turbo' to openai");
    });
    
    it('should set as default if first model', async () => {
      mockConfig.services.newservice = { apiKey: 'key' };
      mockConfig.defaultModel = undefined;
      
      const result = await configAddModelCommand.execute(
        ['newservice', 'model-1'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.defaultModel).toBe('model-1');
      expect(consoleOutput.join('')).toContain('set as default');
    });
    
    it('should handle duplicate model', async () => {
      const result = await configAddModelCommand.execute(
        ['openai', 'gpt-4'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('')).toContain("Model 'gpt-4' already configured");
    });
    
    it('should handle missing service', async () => {
      const result = await configAddModelCommand.execute(
        ['nonexistent', 'model'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(false);
      expect(consoleOutput.join('')).toContain("Service 'nonexistent' not configured");
    });
  });
  
  describe('config-set-default', () => {
    it('should set default model', async () => {
      const result = await configSetDefaultCommand.execute(
        ['claude-3-opus-20240229'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.defaultModel).toBe('claude-3-opus-20240229');
      expect(consoleOutput.join('')).toContain('Default model set to: claude-3-opus-20240229');
    });
    
    it('should handle model with service prefix', async () => {
      const result = await configSetDefaultCommand.execute(
        ['anthropic/claude-3-opus-20240229'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.defaultModel).toBe('claude-3-opus-20240229');
    });
    
    it('should enable plugin if needed', async () => {
      mockConfig.plugins!.enabled = ['openai'];
      
      const result = await configSetDefaultCommand.execute(
        ['claude-3-opus-20240229'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.plugins!.enabled).toContain('anthropic');
    });
    
    it('should handle unknown model', async () => {
      const result = await configSetDefaultCommand.execute(
        ['unknown-model'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(false);
      expect(consoleOutput.join('')).toContain("Model 'unknown-model' not found");
      expect(consoleOutput.join('')).toContain('Available models:');
    });
  });
  
  describe('config-remove', () => {
    it('should remove service after confirmation', async () => {
      vi.mocked(prompts).mockResolvedValue({ confirm: true });
      
      const result = await configRemoveCommand.execute(
        ['openai'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.services.openai).toBeUndefined();
      expect(consoleOutput.join('')).toContain("Service 'openai' removed");
    });
    
    it('should clear default if removed service had it', async () => {
      vi.mocked(prompts).mockResolvedValue({ confirm: true });
      
      const result = await configRemoveCommand.execute(
        ['openai'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.defaultModel).toBeUndefined();
      expect(consoleOutput.join('')).toContain('Default model cleared');
    });
    
    it('should cancel if not confirmed', async () => {
      vi.mocked(prompts).mockResolvedValue({ confirm: false });
      
      const result = await configRemoveCommand.execute(
        ['openai'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(mockConfig.services.openai).toBeDefined();
      expect(consoleOutput.join('')).toContain('Cancelled');
    });
    
    it('should handle missing service', async () => {
      const result = await configRemoveCommand.execute(
        ['nonexistent'],
        {},
        mockContext
      );
      
      expect(result.success).toBe(false);
      expect(consoleOutput.join('')).toContain("Service 'nonexistent' not found");
    });
  });
});