import { Plugin, AIProviderPlugin, IPluginRegistry, PluginContext } from './types';
import { createLogger } from '../services/logger';
import { FileResolver } from '../services/file-resolver';
import { PluginLoader } from './loader';

export class PluginRegistry implements IPluginRegistry {
  private plugins = new Map<string, Plugin>();
  private enabledPlugins = new Set<string>();
  private logger = createLogger('PluginRegistry');
  private context: PluginContext;
  private loader: PluginLoader;
  
  constructor(pluginPaths?: string[]) {
    this.loader = new PluginLoader(pluginPaths);
    this.context = this.createPluginContext();
  }
  
  async initialize(config: any): Promise<void> {
    this.context.config = config;
    
    // Load plugins using the new loader
    const loadResults = await this.loader.loadPlugins();
    
    // Register all successfully loaded plugins
    for (const result of loadResults) {
      if (!result.error) {
        await this.register(result.plugin);
      } else {
        this.logger.warn(`Failed to load plugin from ${result.path}: ${result.error.message}`);
      }
    }
    
    // Enable plugins based on config
    const pluginsConfig = config.plugins || {};
    const enabledList = pluginsConfig.enabled || [];
    const disabledList = pluginsConfig.disabled || [];
    
    // Enable plugins that have configuration in services
    for (const pluginName of Object.keys(config.services || {})) {
      // Skip 'default' as it's not a plugin
      if (pluginName !== 'default' && !disabledList.includes(pluginName)) {
        await this.enable(pluginName);
      }
    }
    
    // Enable explicitly listed plugins
    for (const pluginName of enabledList) {
      if (!disabledList.includes(pluginName)) {
        await this.enable(pluginName);
      }
    }
  }
  
  updateConfig(config: any): void {
    this.context.config = config;
  }
  
  async register(plugin: Plugin): Promise<void> {
    // Validate plugin
    if (!plugin.name || !plugin.version) {
      throw new Error('Plugin must have name and version');
    }
    
    // Check dependencies
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Plugin ${plugin.name} requires ${dep} which is not registered`);
        }
      }
    }
    
    // Store plugin
    this.plugins.set(plugin.name, plugin);
    this.logger.info(`Registered plugin: ${plugin.name} v${plugin.version}`);
  }
  
  async enable(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      this.logger.warn(`Cannot enable unknown plugin: ${name}`);
      return;
    }
    
    if (this.enabledPlugins.has(name)) {
      return; // Already enabled
    }
    
    // Enable dependencies first
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        await this.enable(dep);
      }
    }
    
    // Check runtime dependencies
    if (plugin.runtimeDependencies) {
      for (const [depName, dep] of Object.entries(plugin.runtimeDependencies)) {
        if (dep.required && !this.checkRuntimeDependency()) {
          throw new Error(
            `Plugin ${name} requires ${depName}. ${dep.hint || 'Please install it.'}`
          );
        }
      }
    }
    
    // Call onLoad hook
    if (plugin.onLoad) {
      const pluginContext = {
        ...this.context,
        pluginConfig: this.context.config.services?.[name] || this.context.config.plugins?.config?.[name]
      };
      await plugin.onLoad(pluginContext);
    }
    
    this.enabledPlugins.add(name);
    this.logger.info(`Enabled plugin: ${name}`);
  }
  
  async disable(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return;
    }
    
    // Check if other enabled plugins depend on this
    for (const [otherName, otherPlugin] of this.plugins) {
      if (otherName !== name && 
          this.enabledPlugins.has(otherName) && 
          otherPlugin.dependencies?.includes(name)) {
        throw new Error(`Cannot disable ${name}: ${otherName} depends on it`);
      }
    }
    
    // Call onUnload hook
    if (plugin.onUnload) {
      await plugin.onUnload();
    }
    
    this.enabledPlugins.delete(name);
    this.logger.info(`Disabled plugin: ${name}`);
  }
  
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }
  
  getAIProvider(nameOrModel: string): AIProviderPlugin | undefined {
    // Handle service/model format
    if (nameOrModel.includes('/')) {
      const firstSlashIndex = nameOrModel.indexOf('/');
      const serviceName = nameOrModel.substring(0, firstSlashIndex);
      const modelName = nameOrModel.substring(firstSlashIndex + 1);
      
      const plugin = this.plugins.get(serviceName);
      
      if (plugin && this.isAIProvider(plugin) && this.enabledPlugins.has(serviceName)) {
        const aiPlugin = plugin as AIProviderPlugin;
        
        // Check if the model is configured for this service
        const serviceConfig = this.context.config?.services?.[serviceName];
        if (serviceConfig?.models?.includes(modelName)) {
          return aiPlugin;
        }
        
        // Also check if plugin reports the full model as available (for nested models like google/gemini)
        if (aiPlugin.isModelAvailable && aiPlugin.isModelAvailable(modelName)) {
          return aiPlugin;
        }
      }
      
      return undefined;
    }
    
    // First try direct plugin name
    const directPlugin = this.plugins.get(nameOrModel);
    if (directPlugin && this.isAIProvider(directPlugin) && this.enabledPlugins.has(nameOrModel)) {
      return directPlugin as AIProviderPlugin;
    }
    
    // Then try to find by model in configured services or plugin's available models
    for (const [pluginName, plugin] of this.plugins) {
      if (this.isAIProvider(plugin) && this.enabledPlugins.has(pluginName)) {
        const aiPlugin = plugin as AIProviderPlugin;
        
        // Check if model is in service config
        const serviceConfig = this.context.config?.services?.[pluginName];
        if (serviceConfig?.models?.includes(nameOrModel)) {
          return aiPlugin;
        }
        
        // Also check if plugin reports the model as available
        if (aiPlugin.isModelAvailable && aiPlugin.isModelAvailable(nameOrModel)) {
          return aiPlugin;
        }
      }
    }
    
    return undefined;
  }
  
  getEnabledPlugins(): Plugin[] {
    return Array.from(this.enabledPlugins)
      .map(name => this.plugins.get(name))
      .filter(Boolean) as Plugin[];
  }
  
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
  
  isEnabled(name: string): boolean {
    return this.enabledPlugins.has(name);
  }
  
  async reloadPlugin(name: string): Promise<void> {
    // Disable the plugin first
    if (this.isEnabled(name)) {
      await this.disable(name);
    }
    
    // Remove from registry
    this.plugins.delete(name);
    
    // Reload using the loader
    await this.loader.reloadPlugin(name);
    
    // Re-register if found
    const reloadedPlugin = this.loader.getPlugin(name);
    if (reloadedPlugin) {
      await this.register(reloadedPlugin);
      this.logger.info(`Reloaded plugin: ${name}`);
    } else {
      this.logger.warn(`Plugin ${name} not found after reload`);
    }
  }
  
  getAvailableAIProviders(): AIProviderPlugin[] {
    return this.loader.getAIProviderPlugins();
  }
  
  private createPluginContext(): PluginContext {
    return {
      services: {
        logger: this.logger,
        fileResolver: FileResolver,
      },
      config: {},
      getPlugin: (name: string) => this.getPlugin(name),
    };
  }
  
  private isAIProvider(plugin: Plugin): plugin is AIProviderPlugin {
    return 'execute' in plugin && 'listModels' in plugin;
  }
  
  private checkRuntimeDependency(): boolean {
    // This is a simplified check - in production you'd want more sophisticated checks
    // For now, we'll assume the dependency exists if we can't check it
    return true;
  }
}

// Singleton instance
let registryInstance: PluginRegistry | null = null;

export function getPluginRegistry(paths?: string[]): PluginRegistry {
  if (!registryInstance) {
    registryInstance = new PluginRegistry(paths);
  }
  return registryInstance;
}

export function resetPluginRegistry(): void {
  registryInstance = null;
}