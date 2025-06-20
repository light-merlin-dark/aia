import { describe, it, expect, beforeEach } from 'bun:test';
import { PluginRegistry, resetPluginRegistry } from '../../src/plugins/registry';
import { PluginLoader } from '../../src/plugins/loader';

// Test the complete plugin system workflow with real plugins
describe('Plugin System E2E Tests', () => {
  let registry: PluginRegistry;

  beforeEach(async () => {
    // Reset plugin registry for clean state
    resetPluginRegistry();
    registry = new PluginRegistry();
  });

  it('should discover and load real plugins', async () => {
    // Test config with real plugin services
    const mockConfig = {
      services: {
        openai: {
          apiKey: 'test-openai-key',
          models: ['gpt-3.5-turbo', 'gpt-4-turbo']
        },
        anthropic: {
          apiKey: 'test-anthropic-key',
          models: ['test-model-2']
        },
        openrouter: {
          apiKey: 'test-openrouter-key',
          models: []
        }
      }
    };

    await registry.initialize(mockConfig);

    // Verify real plugins are loaded
    const aiProviders = registry.getAvailableAIProviders();
    expect(aiProviders.length).toBeGreaterThanOrEqual(3);

    const providerNames = aiProviders.map(p => p.name);
    expect(providerNames).toContain('openai');
    expect(providerNames).toContain('anthropic');
    expect(providerNames).toContain('openrouter');
  });

  it('should handle plugin configuration validation', async () => {
    const mockConfig = {
      services: {
        openai: {
          apiKey: 'valid-api-key',
          models: ['test-model']
        }
      }
    };

    await registry.initialize(mockConfig);

    // Get OpenAI plugin
    const openaiPlugin = registry.getPlugin('openai');
    expect(openaiPlugin).toBeTruthy();

    if (openaiPlugin) {
      // Test config validation - cast to AIProviderPlugin to access specific methods
      const aiPlugin = openaiPlugin as any;
      expect(aiPlugin.validateConfig({ apiKey: 'test' })).toBe(true);
      expect(aiPlugin.validateConfig({})).toBe(true); // Empty config should be valid
      expect(aiPlugin.validateConfig({ apiKey: 'test', extraProp: 'value' })).toBe(true); // Real plugins are permissive
    }
  });

  it('should provide plugin metadata and models', async () => {
    const mockConfig = {
      services: {
        openai: { apiKey: 'test-key', models: ['test-model-1', 'test-model-2'] },
        anthropic: { apiKey: 'test-key', models: ['test-model-3'] }
      }
    };

    await registry.initialize(mockConfig);

    // Test OpenAI plugin
    const openaiPlugin = registry.getPlugin('openai');
    expect(openaiPlugin).toBeTruthy();

    if (openaiPlugin) {
      expect(openaiPlugin.name).toBe('openai');
      expect(openaiPlugin.version).toBeTruthy();
      expect(openaiPlugin.description).toBeTruthy();

      // Cast to access AI provider methods
      const aiPlugin = openaiPlugin as any;

      // Test model listing
      const models = aiPlugin.listModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBe(2);
      expect(models).toContain('test-model-1');
      expect(models).toContain('test-model-2');

      // Test model availability
      expect(aiPlugin.isModelAvailable('test-model-1')).toBe(true);
      expect(aiPlugin.isModelAvailable('definitely-not-a-model')).toBe(false);

      // Test required environment variables
      const envVars = aiPlugin.getRequiredEnvVars();
      expect(Array.isArray(envVars)).toBe(true);
      expect(envVars).toContain('OPENAI_API_KEY');
    }

    // Test Anthropic plugin
    const anthropicPlugin = registry.getPlugin('anthropic');
    expect(anthropicPlugin).toBeTruthy();

    if (anthropicPlugin) {
      expect(anthropicPlugin.name).toBe('anthropic');
      
      // Cast to access AI provider methods
      const aiPlugin = anthropicPlugin as any;
      
      const models = aiPlugin.listModels();
      expect(models.length).toBe(1);
      expect(models).toContain('test-model-3');

      const envVars = aiPlugin.getRequiredEnvVars();
      expect(envVars).toContain('ANTHROPIC_API_KEY');
    }
  });

  it('should handle plugin enabling and disabling', async () => {
    // Config with only OpenAI enabled
    const mockConfig = {
      services: {
        openai: { apiKey: 'test-key' }
        // anthropic and openrouter not in services
      }
    };

    await registry.initialize(mockConfig);

    const aiProviders = registry.getAvailableAIProviders();
    const enabledProviderNames = aiProviders.map(p => p.name);

    // Only OpenAI should be enabled
    expect(enabledProviderNames).toContain('openai');
    
    // All plugins should still be registered, even if not enabled
    expect(registry.getPlugin('openai')).toBeTruthy();
    expect(registry.getPlugin('anthropic')).toBeTruthy();
    expect(registry.getPlugin('openrouter')).toBeTruthy();
  });

  it('should handle plugin execution with mock responses', async () => {
    const mockConfig = {
      services: {
        openai: {
          apiKey: 'test-key',
          models: ['test-model']
        }
      }
    };

    await registry.initialize(mockConfig);

    const openaiPlugin = registry.getPlugin('openai');
    expect(openaiPlugin).toBeTruthy();

    if (openaiPlugin) {
      // Cast to access AI provider methods
      const aiPlugin = openaiPlugin as any;
      
      // Test that the plugin has the execute method
      expect(typeof aiPlugin.execute).toBe('function');

      // We can't test actual execution without API keys, but we can verify
      // the plugin structure and methods are correct
      expect(typeof openaiPlugin.onLoad).toBe('function');
      expect(typeof aiPlugin.validateConfig).toBe('function');
      expect(typeof aiPlugin.listModels).toBe('function');
      expect(typeof aiPlugin.isModelAvailable).toBe('function');
      expect(typeof aiPlugin.getRequiredEnvVars).toBe('function');
    }
  });

  it('should provide accurate plugin discovery', async () => {
    // Test PluginLoader directly
    const loader = new PluginLoader();
    await loader.loadPlugins();

    // Verify core plugins are discovered
    const aiProviders = loader.getAIProviderPlugins();
    expect(aiProviders.length).toBeGreaterThanOrEqual(3);

    const providerNames = aiProviders.map(p => p.name);
    expect(providerNames).toContain('openai');
    expect(providerNames).toContain('anthropic');
    expect(providerNames).toContain('openrouter');

    // Verify each plugin has proper structure
    aiProviders.forEach(plugin => {
      expect(plugin.name).toBeTruthy();
      expect(plugin.version).toBeTruthy();
      expect(plugin.description).toBeTruthy();
      expect(typeof plugin.execute).toBe('function');
      expect(typeof plugin.listModels).toBe('function');
      expect(Array.isArray(plugin.listModels())).toBe(true);
    });
  });

  it('should handle partial plugin configurations', async () => {
    // Config with some services missing API keys
    const mockConfig = {
      services: {
        openai: {
          apiKey: 'valid-key',
          models: ['test-model']
        },
        anthropic: {
          // Missing API key - plugin should still load but may not be fully functional
          models: ['test-model-2']
        }
      }
    };

    await registry.initialize(mockConfig);

    // Both plugins should be registered
    expect(registry.getPlugin('openai')).toBeTruthy();
    expect(registry.getPlugin('anthropic')).toBeTruthy();

    // Available providers might vary based on configuration
    const aiProviders = registry.getAvailableAIProviders();
    expect(aiProviders.length).toBeGreaterThanOrEqual(1);
  });

  it('should provide consistent plugin interface', async () => {
    const mockConfig = {
      services: {
        openai: { apiKey: 'test', models: ['test-model'] },
        anthropic: { apiKey: 'test', models: ['test-model'] },
        openrouter: { apiKey: 'test', models: ['test-model'] }
      }
    };

    await registry.initialize(mockConfig);

    const allPlugins = ['openai', 'anthropic', 'openrouter'];
    
    allPlugins.forEach(pluginName => {
      const plugin = registry.getPlugin(pluginName);
      expect(plugin).toBeTruthy();

      if (plugin) {
        // Cast to access AI provider methods
        const aiPlugin = plugin as any;
        
        // Verify all required interface methods exist
        expect(typeof plugin.name).toBe('string');
        expect(typeof plugin.version).toBe('string');
        expect(typeof plugin.description).toBe('string');
        expect(typeof aiPlugin.execute).toBe('function');
        expect(typeof plugin.onLoad).toBe('function');
        expect(typeof aiPlugin.validateConfig).toBe('function');
        expect(typeof aiPlugin.listModels).toBe('function');
        expect(typeof aiPlugin.isModelAvailable).toBe('function');
        expect(typeof aiPlugin.getRequiredEnvVars).toBe('function');

        // Verify method return types
        expect(Array.isArray(aiPlugin.listModels())).toBe(true);
        expect(Array.isArray(aiPlugin.getRequiredEnvVars())).toBe(true);
        expect(typeof aiPlugin.isModelAvailable('test-model')).toBe('boolean');
        expect(typeof aiPlugin.validateConfig({})).toBe('boolean');
      }
    });
  });

  it('should handle plugin reload scenarios', async () => {
    const mockConfig = {
      services: {
        openai: { apiKey: 'initial-key' }
      }
    };

    await registry.initialize(mockConfig);

    // Verify initial state
    const initialPlugin = registry.getPlugin('openai');
    expect(initialPlugin).toBeTruthy();

    // Test reloading (config is not passed to reloadPlugin method)
    
    // Reload should not fail (even if it doesn't change behavior)
    await expect(registry.reloadPlugin('openai')).resolves.toBeUndefined();

    // Plugin should still be available
    const reloadedPlugin = registry.getPlugin('openai');
    expect(reloadedPlugin).toBeTruthy();
  });
});