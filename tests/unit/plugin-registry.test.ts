import { describe, it, expect, jest, mock, beforeEach, afterEach } from 'bun:test';
import { PluginRegistry, resetPluginRegistry } from '../../src/plugins/registry';

// Mock the loader
let mockLoader: any;

mock.module('../../src/plugins/loader', () => {
  mockLoader = {
    loadPlugins: jest.fn(),
    getPlugin: jest.fn(),
    reloadPlugin: jest.fn(),
    getAIProviderPlugins: jest.fn()
  };
  
  return {
    PluginLoader: jest.fn().mockImplementation(() => mockLoader),
    __mockLoader: mockLoader
  };
});

// Mock the logger
mock.module('../../src/services/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })),
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

describe('PluginRegistry with new loader', () => {
  let registry: PluginRegistry;

  beforeEach(async () => {
    // Reset the registry singleton
    resetPluginRegistry();
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create registry instance
    registry = new PluginRegistry();
  });

  afterEach(() => {
    resetPluginRegistry();
  });

  describe('initialize', () => {
    it('should load plugins using the loader', async () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin'
      };

      mockLoader.loadPlugins.mockResolvedValueOnce([
        { plugin: mockPlugin, path: '/path/to/plugin' }
      ]);

      await registry.initialize({});

      expect(mockLoader.loadPlugins).toHaveBeenCalled();
    });

    it('should register successfully loaded plugins', async () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin'
      };

      mockLoader.loadPlugins.mockResolvedValueOnce([
        { plugin: mockPlugin, path: '/path/to/plugin' }
      ]);

      await registry.initialize({});

      expect(registry.getPlugin('test-plugin')).toBe(mockPlugin);
    });

    it('should handle plugin load errors', async () => {
      mockLoader.loadPlugins.mockResolvedValueOnce([
        { 
          plugin: { name: 'error-plugin', version: '0.0.0', description: 'Failed' },
          path: '/path/to/error',
          error: new Error('Load failed')
        }
      ]);

      await registry.initialize({});

      // Should not register failed plugins
      expect(registry.getPlugin('error-plugin')).toBeUndefined();
    });

    it('should enable plugins based on services config', async () => {
      const mockPlugin = {
        name: 'openai',
        version: '1.0.0',
        description: 'OpenAI plugin',
        onLoad: jest.fn()
      };

      mockLoader.loadPlugins.mockResolvedValueOnce([
        { plugin: mockPlugin, path: '/path/to/openai' }
      ]);

      await registry.initialize({
        services: {
          openai: { apiKey: 'test-key' }
        }
      });

      expect(registry.isEnabled('openai')).toBe(true);
      expect(mockPlugin.onLoad).toHaveBeenCalled();
    });

    it('should respect disabled plugins list', async () => {
      const mockPlugin = {
        name: 'openai',
        version: '1.0.0',
        description: 'OpenAI plugin'
      };

      mockLoader.loadPlugins.mockResolvedValueOnce([
        { plugin: mockPlugin, path: '/path/to/openai' }
      ]);

      await registry.initialize({
        services: {
          openai: { apiKey: 'test-key' }
        },
        plugins: {
          disabled: ['openai']
        }
      });

      expect(registry.isEnabled('openai')).toBe(false);
    });
  });

  describe('reloadPlugin', () => {
    it('should reload a plugin', async () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        onUnload: jest.fn()
      };

      const updatedPlugin = {
        name: 'test-plugin',
        version: '1.1.0',
        description: 'Updated plugin'
      };

      mockLoader.loadPlugins.mockResolvedValueOnce([
        { plugin: mockPlugin, path: '/path/to/plugin' }
      ]);

      await registry.initialize({});
      await registry.enable('test-plugin');

      // Mock the reload
      mockLoader.reloadPlugin.mockResolvedValueOnce(undefined);
      mockLoader.getPlugin.mockReturnValueOnce(updatedPlugin);

      await registry.reloadPlugin('test-plugin');

      expect(mockPlugin.onUnload).toHaveBeenCalled();
      expect(mockLoader.reloadPlugin).toHaveBeenCalledWith('test-plugin');
      expect(registry.getPlugin('test-plugin')).toBe(updatedPlugin);
    });

    it('should handle reload failures', async () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin'
      };

      mockLoader.loadPlugins.mockResolvedValueOnce([
        { plugin: mockPlugin, path: '/path/to/plugin' }
      ]);

      await registry.initialize({});

      // Mock failed reload
      mockLoader.reloadPlugin.mockResolvedValueOnce(undefined);
      mockLoader.getPlugin.mockReturnValueOnce(undefined);

      await registry.reloadPlugin('test-plugin');

      expect(registry.getPlugin('test-plugin')).toBeUndefined();
    });
  });

  describe('getAvailableAIProviders', () => {
    it('should return AI provider plugins from loader', async () => {
      const mockProviders = [
        { 
          name: 'openai',
          version: '1.0.0',
          description: 'OpenAI provider',
          execute: jest.fn(),
          listModels: jest.fn()
        },
        {
          name: 'anthropic',
          version: '1.0.0',
          description: 'Anthropic provider',
          execute: jest.fn(),
          listModels: jest.fn()
        }
      ];

      mockLoader.getAIProviderPlugins.mockReturnValueOnce(mockProviders);

      const providers = registry.getAvailableAIProviders();

      expect(providers).toEqual(mockProviders);
      expect(mockLoader.getAIProviderPlugins).toHaveBeenCalled();
    });
  });

  describe('plugin context', () => {
    it('should pass correct plugin config from services', async () => {
      const mockPlugin = {
        name: 'openai',
        version: '1.0.0',
        description: 'OpenAI plugin',
        onLoad: jest.fn()
      };

      mockLoader.loadPlugins.mockResolvedValueOnce([
        { plugin: mockPlugin, path: '/path/to/openai' }
      ]);

      const config = {
        services: {
          openai: { apiKey: 'test-key', model: 'gpt-4' }
        }
      };

      await registry.initialize(config);

      expect(mockPlugin.onLoad).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginConfig: { apiKey: 'test-key', model: 'gpt-4' }
        })
      );
    });

    it('should fall back to plugins.config for plugin config', async () => {
      const mockPlugin = {
        name: 'custom-plugin',
        version: '1.0.0',
        description: 'Custom plugin',
        onLoad: jest.fn()
      };

      mockLoader.loadPlugins.mockResolvedValueOnce([
        { plugin: mockPlugin, path: '/path/to/custom' }
      ]);

      const config = {
        plugins: {
          enabled: ['custom-plugin'],
          config: {
            'custom-plugin': { option: 'value' }
          }
        }
      };

      await registry.initialize(config);

      expect(mockPlugin.onLoad).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginConfig: { option: 'value' }
        })
      );
    });
  });
});