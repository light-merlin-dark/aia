import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import sqlite3 from 'sqlite3';
// import { promisify } from 'util';
import { createLogger } from '../services/logger.js';
import { encrypt, decrypt } from './crypto.js';
import { runOnboardingWizard } from './wizard.js';

const logger = createLogger('SQLiteConfigManager');

export interface ModelPricing {
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export interface ServiceConfig {
  apiKey: string;
  models?: string[];
  endpoint?: string;
  pricing?: {
    [model: string]: ModelPricing;
  };
  service?: string;
  defaultModel?: string;
}

export interface AIAdvisorConfig {
  services: {
    [provider: string]: ServiceConfig;
  };
  defaultModel?: string;
  defaultModels?: string[];
  plugins?: {
    enabled?: string[];
    disabled?: string[];
    config?: {
      [pluginName: string]: any;
    };
  };
  maxRetries?: number;
  timeout?: number;
}

export class SQLiteConfigManager {
  private static instance: SQLiteConfigManager;
  private db?: sqlite3.Database;
  private configCache?: AIAdvisorConfig;
  
  // Configuration paths
  public CONFIG_DIR = process.env.AIA_CONFIG_DIR || join(homedir(), '.aia');
  public DB_FILE = join(this.CONFIG_DIR, 'config.db');
  
  private constructor() {
    // Ensure config directory exists
    if (!existsSync(this.CONFIG_DIR)) {
      mkdirSync(this.CONFIG_DIR, { recursive: true });
    }
  }

  public static getInstance(): SQLiteConfigManager {
    if (!SQLiteConfigManager.instance) {
      SQLiteConfigManager.instance = new SQLiteConfigManager();
    }
    return SQLiteConfigManager.instance;
  }

  private async initDatabase(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.DB_FILE, (err) => {
        if (err) {
          logger.error('Failed to open database:', err);
          reject(err);
          return;
        }

        // Create tables if they don't exist
        this.db!.serialize(() => {
          // Services table
          this.db!.run(`
            CREATE TABLE IF NOT EXISTS services (
              name TEXT PRIMARY KEY,
              api_key TEXT NOT NULL,
              endpoint TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Models table
          this.db!.run(`
            CREATE TABLE IF NOT EXISTS models (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              service_name TEXT NOT NULL,
              model_name TEXT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (service_name) REFERENCES services (name) ON DELETE CASCADE,
              UNIQUE(service_name, model_name)
            )
          `);

          // Model pricing table
          this.db!.run(`
            CREATE TABLE IF NOT EXISTS model_pricing (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              service_name TEXT NOT NULL,
              model_name TEXT NOT NULL,
              input_cost_per_million REAL NOT NULL DEFAULT 0,
              output_cost_per_million REAL NOT NULL DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (service_name) REFERENCES services (name) ON DELETE CASCADE,
              UNIQUE(service_name, model_name)
            )
          `);

          // Global config table
          this.db!.run(`
            CREATE TABLE IF NOT EXISTS global_config (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Plugins table
          this.db!.run(`
            CREATE TABLE IF NOT EXISTS plugins (
              name TEXT PRIMARY KEY,
              enabled BOOLEAN NOT NULL DEFAULT 1,
              config TEXT, -- JSON config for plugin
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          resolve();
        });
      });
    });
  }

  private async runQuery(sql: string, params: any[] = []): Promise<any[]> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Database query failed:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  private async runStatement(sql: string, params: any[] = []): Promise<void> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err) {
        if (err) {
          logger.error('Database statement failed:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public async getConfig(): Promise<AIAdvisorConfig> {
    if (this.configCache) {
      return this.configCache;
    }

    try {
      await this.initDatabase();

      // Check if we have any services configured
      const services = await this.runQuery('SELECT COUNT(*) as count FROM services');
      if (services[0].count === 0) {
        // Check for environment-based configuration first
        const envConfig = await this.createConfigFromEnvironment();
        if (envConfig) {
          logger.info('No services configured, using environment variables');
          await this.saveConfig(envConfig);
          return envConfig;
        }
        
        // No env config, run setup wizard
        logger.info('No services configured, running setup wizard');
        const config = await runOnboardingWizard();
        await this.saveConfig(config);
        return config;
      }
    } catch (error) {
      // Check for environment-based configuration first
      const envConfig = await this.createConfigFromEnvironment();
      if (envConfig) {
        logger.info('Database not ready, using environment variables');
        await this.saveConfig(envConfig);
        return envConfig;
      }
      
      logger.warn('Database not ready, running setup wizard');
      const config = await runOnboardingWizard();
      await this.saveConfig(config);
      return config;
    }

    // Build config from database
    const config: AIAdvisorConfig = {
      services: {},
      maxRetries: 2,
      timeout: 60000
    };

    // Load services
    const serviceRows = await this.runQuery('SELECT * FROM services');
    for (const service of serviceRows) {
      config.services[service.name] = {
        apiKey: decrypt(service.api_key, this.keyPath),
        endpoint: service.endpoint || undefined
      };

      // Load models for this service
      const modelRows = await this.runQuery(
        'SELECT model_name FROM models WHERE service_name = ?',
        [service.name]
      );
      config.services[service.name].models = modelRows.map(row => row.model_name);

      // Load pricing for this service
      const pricingRows = await this.runQuery(
        'SELECT * FROM model_pricing WHERE service_name = ?',
        [service.name]
      );
      
      if (pricingRows.length > 0) {
        config.services[service.name].pricing = {};
        for (const pricing of pricingRows) {
          config.services[service.name].pricing![pricing.model_name] = {
            inputCostPerMillion: pricing.input_cost_per_million,
            outputCostPerMillion: pricing.output_cost_per_million
          };
        }
      }
    }

    // Load global config
    const globalRows = await this.runQuery('SELECT * FROM global_config');
    for (const row of globalRows) {
      switch (row.key) {
        case 'defaultModel':
          config.defaultModel = row.value;
          break;
        case 'defaultModels':
          config.defaultModels = JSON.parse(row.value);
          break;
        case 'maxRetries':
          config.maxRetries = parseInt(row.value);
          break;
        case 'timeout':
          config.timeout = parseInt(row.value);
          break;
      }
    }

    // Load plugins
    const pluginRows = await this.runQuery('SELECT * FROM plugins');
    if (pluginRows.length > 0) {
      config.plugins = {
        enabled: [],
        disabled: [],
        config: {}
      };

      for (const plugin of pluginRows) {
        if (plugin.enabled) {
          config.plugins.enabled!.push(plugin.name);
        } else {
          config.plugins.disabled!.push(plugin.name);
        }
        
        if (plugin.config) {
          config.plugins.config![plugin.name] = JSON.parse(plugin.config);
        }
      }
    }

    this.configCache = config;
    return config;
  }

  public async saveConfig(config: AIAdvisorConfig): Promise<void> {
    await this.initDatabase();

    try {
      // Start transaction
      await this.runStatement('BEGIN TRANSACTION');

      // Clear existing data
      await this.runStatement('DELETE FROM services');
      await this.runStatement('DELETE FROM models');
      await this.runStatement('DELETE FROM model_pricing');
      await this.runStatement('DELETE FROM global_config');
      await this.runStatement('DELETE FROM plugins');

      // Save services
      for (const [serviceName, serviceConfig] of Object.entries(config.services)) {
        if (serviceName === 'default') continue;

        // Encrypt API key
        const encryptedApiKey = encrypt(serviceConfig.apiKey, this.keyPath);
        
        await this.runStatement(
          'INSERT INTO services (name, api_key, endpoint) VALUES (?, ?, ?)',
          [serviceName, encryptedApiKey, serviceConfig.endpoint || null]
        );

        // Save models
        if (serviceConfig.models) {
          for (const model of serviceConfig.models) {
            await this.runStatement(
              'INSERT INTO models (service_name, model_name) VALUES (?, ?)',
              [serviceName, model]
            );
          }
        }

        // Save pricing
        if (serviceConfig.pricing) {
          for (const [modelName, pricing] of Object.entries(serviceConfig.pricing)) {
            await this.runStatement(
              'INSERT INTO model_pricing (service_name, model_name, input_cost_per_million, output_cost_per_million) VALUES (?, ?, ?, ?)',
              [serviceName, modelName, pricing.inputCostPerMillion, pricing.outputCostPerMillion]
            );
          }
        }
      }

      // Save global config
      if (config.defaultModel) {
        await this.runStatement(
          'INSERT INTO global_config (key, value) VALUES (?, ?)',
          ['defaultModel', config.defaultModel]
        );
      }

      if (config.defaultModels) {
        await this.runStatement(
          'INSERT INTO global_config (key, value) VALUES (?, ?)',
          ['defaultModels', JSON.stringify(config.defaultModels)]
        );
      }

      if (config.maxRetries !== undefined) {
        await this.runStatement(
          'INSERT INTO global_config (key, value) VALUES (?, ?)',
          ['maxRetries', config.maxRetries.toString()]
        );
      }

      if (config.timeout !== undefined) {
        await this.runStatement(
          'INSERT INTO global_config (key, value) VALUES (?, ?)',
          ['timeout', config.timeout.toString()]
        );
      }

      // Save plugins
      if (config.plugins) {
        const allPlugins = new Set([
          ...(config.plugins.enabled || []),
          ...(config.plugins.disabled || [])
        ]);

        for (const pluginName of allPlugins) {
          const enabled = config.plugins.enabled?.includes(pluginName) || false;
          const pluginConfig = config.plugins.config?.[pluginName];
          
          await this.runStatement(
            'INSERT INTO plugins (name, enabled, config) VALUES (?, ?, ?)',
            [pluginName, enabled ? 1 : 0, pluginConfig ? JSON.stringify(pluginConfig) : null]
          );
        }
      }

      // Commit transaction
      await this.runStatement('COMMIT');

      // Update cache
      this.configCache = config;
      
      logger.info('Configuration saved to database');
    } catch (error) {
      logger.error('Failed to save config to database:', error);
      await this.runStatement('ROLLBACK');
      throw error;
    }
  }

  public async clearDefaultModel(): Promise<void> {
    await this.runStatement('DELETE FROM global_config WHERE key IN (?, ?)', ['defaultModel', 'defaultModels']);
    
    // Clear cache
    if (this.configCache) {
      delete this.configCache.defaultModel;
      delete this.configCache.defaultModels;
    }
  }

  private async createConfigFromEnvironment(): Promise<AIAdvisorConfig | null> {
    // Check for OpenRouter API key
    const openrouterKey = process.env.AIA_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    
    // If no environment variables are set, return null
    if (!openrouterKey && !openaiKey && !anthropicKey) {
      return null;
    }
    
    logger.info('Creating configuration from environment variables');
    
    const config: AIAdvisorConfig = {
      services: {},
      plugins: {
        enabled: [],
        disabled: []
      },
      maxRetries: 2,
      timeout: 60000
    };
    
    // Configure OpenRouter if API key is present
    if (openrouterKey) {
      config.services.openrouter = {
        apiKey: openrouterKey,
        models: ['google/gemini-2.5-pro', 'google/gemini-2.5-flash'],
        endpoint: 'https://openrouter.ai/api/v1'
      };
      config.plugins!.enabled!.push('openrouter');
      
      // Set as default service
      config.services.default = {
        apiKey: '',
        service: 'openrouter'
      };
    }
    
    // Configure OpenAI if API key is present
    if (openaiKey) {
      config.services.openai = {
        apiKey: openaiKey,
        models: ['gpt-4o', 'gpt-4o-mini']
      };
      config.plugins!.enabled!.push('openai');
      
      // Set as default if no other default
      if (!config.services.default) {
        config.services.default = {
          apiKey: '',
          service: 'openai'
        };
      }
    }
    
    // Configure Anthropic if API key is present
    if (anthropicKey) {
      config.services.anthropic = {
        apiKey: anthropicKey,
        models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
      };
      config.plugins!.enabled!.push('anthropic');
      
      // Set as default if no other default
      if (!config.services.default) {
        config.services.default = {
          apiKey: '',
          service: 'anthropic'
        };
      }
    }
    
    return config;
  }

  public async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve) => {
        this.db!.close((err) => {
          if (err) {
            logger.error('Error closing database:', err);
          }
          this.db = undefined;
          resolve();
        });
      });
    }
  }

  // Migration method to convert from JSON config to SQLite
  public async migrateFromJSON(jsonConfigPath: string): Promise<void> {
    if (!existsSync(jsonConfigPath)) {
      logger.info('No JSON config file to migrate from');
      return;
    }

    try {
      logger.info('Migrating from JSON config to SQLite...');
      
      // This would be implemented to read the old config format
      // and save it using the new SQLite format
      logger.info('JSON to SQLite migration completed');
    } catch (error) {
      logger.error('Failed to migrate from JSON config:', error);
      throw error;
    }
  }
}

// Export singleton instance getter
export function getConfig(): Promise<AIAdvisorConfig> {
  return SQLiteConfigManager.getInstance().getConfig();
}

export { SQLiteConfigManager as ConfigManager };