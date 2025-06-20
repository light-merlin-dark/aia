import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Plugin, AIProviderPlugin } from './types';
import { createLogger } from '../services/logger';

const logger = createLogger('PluginLoader');

export interface PluginLoadResult {
  plugin: Plugin;
  path: string;
  error?: Error;
}

export class PluginLoader {
  private pluginPaths: string[] = [];
  private loadedPlugins = new Map<string, PluginLoadResult>();

  constructor(pluginPaths?: string[]) {
    // Default paths: built-in plugins and user plugins
    if (pluginPaths) {
      this.pluginPaths = pluginPaths;
    } else {
      // Get the module directory and resolve package root
      const moduleDir = path.dirname(fileURLToPath(import.meta.url));
      const packageRoot = path.resolve(moduleDir, '..', '..');
      
      this.pluginPaths = [
        path.join(packageRoot, 'plugins'),                     // Built-in plugins (always available)
        path.join(process.env.HOME || '', '.aia', 'plugins'),  // User plugins
        path.join(process.cwd(), 'plugins')                    // Project-specific plugins (fallback)
      ];
    }
  }

  async loadPlugins(): Promise<PluginLoadResult[]> {
    const results: PluginLoadResult[] = [];

    for (const pluginPath of this.pluginPaths) {
      try {
        await fs.access(pluginPath);
        const pluginDirs = await this.discoverPluginDirectories(pluginPath);
        
        for (const dir of pluginDirs) {
          const result = await this.loadPlugin(dir);
          if (result) {
            results.push(result);
            this.loadedPlugins.set(result.plugin.name, result);
          }
        }
      } catch (error) {
        logger.debug(`Plugin path not accessible: ${pluginPath}`);
      }
    }

    // Validate dependencies after all plugins are loaded
    await this.validateDependencies();

    return results;
  }

  private async discoverPluginDirectories(basePath: string): Promise<string[]> {
    const dirs: string[] = [];
    
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const pluginDir = path.join(basePath, entry.name);
          
          // Check if directory contains a package.json
          try {
            await fs.access(path.join(pluginDir, 'package.json'));
            dirs.push(pluginDir);
          } catch {
            logger.debug(`Skipping ${pluginDir}: no package.json found`);
          }
        }
      }
    } catch (error) {
      logger.error(`Error discovering plugins in ${basePath}:`, error);
    }

    return dirs;
  }

  private async loadPlugin(pluginPath: string): Promise<PluginLoadResult | null> {
    try {
      // Read package.json
      const packageJsonPath = path.join(pluginPath, 'package.json');
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, 'utf-8')
      );

      // Check if it's an AI Advisor plugin
      if (!packageJson.aiAdvisor || packageJson.aiAdvisor.type !== 'plugin') {
        logger.debug(`${pluginPath} is not an AI Advisor plugin`);
        return null;
      }

      // Import the plugin module
      // In development, check for TypeScript files first
      const baseName = packageJson.main?.replace(/\.[jt]s$/, '') || 'index';
      let indexPath = path.join(pluginPath, `${baseName}.ts`);
      
      try {
        await fs.access(indexPath);
      } catch {
        // Fall back to JavaScript
        indexPath = path.join(pluginPath, `${baseName}.js`);
      }
      
      const pluginModule = await import(indexPath);
      
      // Get the default export or named export 'plugin'
      const plugin: Plugin = pluginModule.default || pluginModule.plugin;
      
      if (!plugin) {
        throw new Error('Plugin module must export a default or named "plugin" export');
      }

      // Validate required properties
      if (!plugin.name || !plugin.version) {
        throw new Error('Plugin must have name and version properties');
      }

      logger.info(`Loaded plugin: ${plugin.name} v${plugin.version}`);

      return {
        plugin,
        path: pluginPath
      };
    } catch (error) {
      logger.error(`Failed to load plugin from ${pluginPath}:`, error);
      return {
        plugin: {
          name: path.basename(pluginPath),
          version: '0.0.0',
          description: 'Failed to load'
        },
        path: pluginPath,
        error: error as Error
      };
    }
  }

  private async validateDependencies(): Promise<void> {
    for (const [name, result] of this.loadedPlugins) {
      if (result.error) continue;
      
      const plugin = result.plugin;
      if (plugin.dependencies) {
        for (const dep of plugin.dependencies) {
          if (!this.loadedPlugins.has(dep)) {
            logger.warn(
              `Plugin ${name} depends on ${dep}, which is not loaded`
            );
          }
        }
      }
    }
  }

  getLoadedPlugins(): Plugin[] {
    return Array.from(this.loadedPlugins.values())
      .filter(result => !result.error)
      .map(result => result.plugin);
  }

  getPlugin(name: string): Plugin | undefined {
    const result = this.loadedPlugins.get(name);
    return result && !result.error ? result.plugin : undefined;
  }

  getAIProviderPlugins(): AIProviderPlugin[] {
    return this.getLoadedPlugins().filter(
      (plugin): plugin is AIProviderPlugin => 
        'execute' in plugin && 'listModels' in plugin
    );
  }

  getPluginPath(name: string): string | undefined {
    const result = this.loadedPlugins.get(name);
    return result?.path;
  }

  async reloadPlugin(name: string): Promise<void> {
    const existingResult = this.loadedPlugins.get(name);
    if (!existingResult) {
      throw new Error(`Plugin ${name} not found`);
    }

    // Clear the require cache for this plugin
    const pluginPath = existingResult.path;
    const resolvedPaths = Object.keys(require.cache).filter(p => 
      p.startsWith(pluginPath)
    );
    
    for (const p of resolvedPaths) {
      delete require.cache[p];
    }

    // Reload the plugin
    const result = await this.loadPlugin(pluginPath);
    if (result) {
      this.loadedPlugins.set(name, result);
    }
  }
}

// Singleton instance
let loaderInstance: PluginLoader | null = null;

export function getPluginLoader(paths?: string[]): PluginLoader {
  if (!loaderInstance) {
    loaderInstance = new PluginLoader(paths);
  }
  return loaderInstance;
}

export async function loadAllPlugins(paths?: string[]): Promise<Plugin[]> {
  const loader = getPluginLoader(paths);
  await loader.loadPlugins();
  return loader.getLoadedPlugins();
}