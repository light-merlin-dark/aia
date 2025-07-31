import { promises as fs } from 'fs';
import * as fsSync from 'fs';
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
      // Get the package root using multiple fallback methods
      const packageRoot = this.findPackageRoot();
      
      // Create unique plugin paths
      const paths = [
        path.join(packageRoot, 'plugins'),                     // Built-in plugins (always available)
        path.join(process.env.HOME || '', '.aia', 'plugins'),  // User plugins
        path.join(process.cwd(), 'plugins')                    // Project-specific plugins (fallback)
      ];
      
      // Deduplicate paths by resolving them and keeping unique ones
      const uniquePaths = new Set<string>();
      for (const p of paths) {
        try {
          const resolved = path.resolve(p);
          uniquePaths.add(resolved);
        } catch (error) {
          // Skip invalid paths
        }
      }
      
      this.pluginPaths = Array.from(uniquePaths);
      
      logger.debug(`Plugin paths: ${this.pluginPaths.join(', ')}`);
    }
  }

  private findPackageRoot(): string {
    // Method 1: Use import.meta.url (works in most ES module contexts)
    try {
      const moduleDir = path.dirname(fileURLToPath(import.meta.url));
      const candidate1 = path.resolve(moduleDir, '..', '..');
      
      // Verify this is actually the package root by checking for package.json
      if (this.isPackageRoot(candidate1)) {
        logger.debug(`Found package root via import.meta.url: ${candidate1}`);
        return candidate1;
      }
    } catch (error) {
      logger.debug(`Failed to resolve package root via import.meta.url: ${error}`);
    }
    
    // Method 2: Check if we're in a node_modules context (for global installs)
    try {
      const moduleDir = path.dirname(fileURLToPath(import.meta.url));
      // Look for patterns like: /path/to/node_modules/@scope/package-name/dist/plugins
      // or: /path/to/node_modules/package-name/dist/plugins
      const nodeModulesMatch = moduleDir.match(/(.+\/node_modules\/(?:@[^/]+\/)?[^/]+)/);
      if (nodeModulesMatch) {
        const candidate2 = nodeModulesMatch[1];
        if (this.isPackageRoot(candidate2)) {
          logger.debug(`Found package root via node_modules pattern: ${candidate2}`);
          return candidate2;
        }
      }
    } catch (error) {
      logger.debug(`Failed to resolve package root via node_modules pattern: ${error}`);
    }
    
    // Method 3: Search upward from current working directory
    let currentDir = process.cwd();
    while (currentDir !== path.dirname(currentDir)) {
      if (this.isPackageRoot(currentDir)) {
        logger.debug(`Found package root via cwd search: ${currentDir}`);
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    
    // Method 4: Fallback to current working directory
    logger.warn(`Could not find package root, falling back to current working directory: ${process.cwd()}`);
    return process.cwd();
  }

  private isPackageRoot(dir: string): boolean {
    try {
      const packageJsonPath = path.join(dir, 'package.json');
      const pluginsPath = path.join(dir, 'plugins');
      
      // Check if package.json exists and plugins directory exists
      const hasPackageJson = this.fileExists(packageJsonPath);
      const hasPluginsDir = this.fileExists(pluginsPath);
      
      if (hasPackageJson) {
        // Also check if this is the ai-advisor package (supporting both scoped and unscoped names)
        try {
          const packageJson = JSON.parse(this.readFileSync(packageJsonPath));
          const isAiAdvisor = packageJson.name === 'ai-advisor' || packageJson.name === '@light-merlin-dark/aia';
          logger.debug(`Checking ${dir}: hasPackageJson=${hasPackageJson}, hasPluginsDir=${hasPluginsDir}, packageName=${packageJson.name}, isAiAdvisor=${isAiAdvisor}`);
          return isAiAdvisor && hasPluginsDir;
        } catch (error) {
          logger.debug(`Failed to read package.json at ${packageJsonPath}: ${error}`);
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  private fileExists(path: string): boolean {
    try {
      fsSync.accessSync(path);
      return true;
    } catch {
      return false;
    }
  }

  private readFileSync(path: string): string {
    return fsSync.readFileSync(path, 'utf-8');
  }

  async loadPlugins(): Promise<PluginLoadResult[]> {
    const results: PluginLoadResult[] = [];

    for (const pluginPath of this.pluginPaths) {
      try {
        await fs.access(pluginPath);
        const pluginDirs = await this.discoverPluginDirectories(pluginPath);
        
        for (const dir of pluginDirs) {
          const result = await this.loadPlugin(dir);
          if (result && !result.error) {
            // Check if plugin already loaded (prevent duplicates)
            if (!this.loadedPlugins.has(result.plugin.name)) {
              results.push(result);
              this.loadedPlugins.set(result.plugin.name, result);
            } else {
              logger.debug(`Plugin ${result.plugin.name} already loaded, skipping duplicate from ${dir}`);
            }
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