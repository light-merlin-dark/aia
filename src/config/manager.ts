import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { encrypt, decrypt } from './crypto';
import { runOnboardingWizard } from './wizard';
import { Logger } from '../services/logger';

export interface ModelPricing {
  inputCostPerMillion: number;   // dollars per million input tokens
  outputCostPerMillion: number;  // dollars per million output tokens
}

export interface ServiceConfig {
  apiKey: string;
  models?: string[];
  endpoint?: string;
  pricing?: {
    [model: string]: ModelPricing;
  };
  // For default service config
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

export class ConfigManager {
  private static instance: ConfigManager;
  private config?: AIAdvisorConfig;
  private logger = new Logger('ConfigManager');
  
  // Configuration paths
  public CONFIG_DIR = join(homedir(), '.aia');
  public CONFIG_FILE = join(this.CONFIG_DIR, 'config.enc');
  public KEY_FILE = join(this.CONFIG_DIR, 'key');
  
  // Path to project .env file
  private readonly ENV_FILE = process.env.AIA_ENV_FILE || join(process.cwd(), '.env');
  
  // Testing flag
  public disableEnvMerge = false;
  
  private constructor() {}
  
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }
  
  // For testing only
  static resetInstance(): void {
    ConfigManager.instance = undefined as any;
  }
  
  async getConfig(): Promise<AIAdvisorConfig> {
    if (this.config) {
      return this.config;
    }
    
    // Ensure config directory exists
    if (!existsSync(this.CONFIG_DIR)) {
      mkdirSync(this.CONFIG_DIR, { recursive: true });
    }
    
    // Migrate old config.json to config.enc if it exists
    const oldConfigPath = join(this.CONFIG_DIR, 'config.json');
    if (existsSync(oldConfigPath) && !existsSync(this.CONFIG_FILE)) {
      this.logger.info('Migrating config.json to config.enc');
      renameSync(oldConfigPath, this.CONFIG_FILE);
    }
    
    // Load or create configuration
    if (existsSync(this.CONFIG_FILE) && existsSync(this.KEY_FILE)) {
      this.config = await this.loadConfig();
    } else {
      this.config = await this.createConfig();
    }
    
    // Merge with environment variables
    this.mergeEnvVars();
    
    return this.config;
  }
  
  async saveConfig(newConfig?: AIAdvisorConfig): Promise<void> {
    // If new config provided, update the internal config
    if (newConfig) {
      this.config = newConfig;
    }
    
    if (!this.config) {
      throw new Error('No configuration to save');
    }
    
    const encrypted = await encrypt(JSON.stringify(this.config, null, 2), this.KEY_FILE);
    writeFileSync(this.CONFIG_FILE, encrypted);
    this.logger.info('Configuration saved');
  }
  
  private async loadConfig(): Promise<AIAdvisorConfig> {
    try {
      const encrypted = readFileSync(this.CONFIG_FILE, 'utf-8');
      const decrypted = await decrypt(encrypted, this.KEY_FILE);
      return JSON.parse(decrypted);
    } catch (error) {
      this.logger.error('Failed to load config:', error);
      throw new Error('Failed to decrypt configuration. Config may be corrupted.');
    }
  }
  
  private async createConfig(): Promise<AIAdvisorConfig> {
    this.logger.info('No configuration found.');
    
    // In MCP mode, create minimal config from environment
    if (process.env.AIA_MCP_MODE === 'true') {
      this.logger.info('Running in MCP mode - using environment configuration');
      
      // Load initial values from .env if available
      const envConfig = this.loadEnvFile();
      
      // Create minimal config
      const config: AIAdvisorConfig = {
        services: envConfig.services || {}
      };
      
      // Only save if we have at least one service configured
      if (Object.keys(config.services).length > 0) {
        this.config = config;
        await this.saveConfig();
      }
      
      return config;
    }
    
    // Normal mode - run wizard
    this.logger.info('Starting setup wizard...');
    
    // Load initial values from .env if available
    const envConfig = this.loadEnvFile();
    
    // Run onboarding wizard
    const config = await runOnboardingWizard(envConfig);
    
    // Save the configuration
    this.config = config;
    await this.saveConfig();
    
    return config;
  }
  
  private loadEnvFile(): Partial<AIAdvisorConfig> {
    const config: Partial<AIAdvisorConfig> = {
      services: {}
    };
    
    if (existsSync(this.ENV_FILE)) {
      try {
        const envContent = readFileSync(this.ENV_FILE, 'utf-8');
        const lines = envContent.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=').trim();
          
          if (key && value) {
            // Map environment variables to config
            switch (key) {
              case 'OPENAI_API_KEY':
                config.services!.openai = { apiKey: value };
                break;
              case 'ANTHROPIC_API_KEY':
                config.services!.anthropic = { apiKey: value };
                break;
              case 'OPENROUTER_API_KEY':
                config.services!.openrouter = { apiKey: value };
                break;
            }
          }
        }
      } catch (error) {
        this.logger.warn('Failed to load .env file:', error);
      }
    }
    
    return config;
  }
  
  private mergeEnvVars(): void {
    if (!this.config || this.disableEnvMerge) return;
    
    // Check for environment variable overrides
    const envOverrides = {
      OPENAI_API_KEY: { provider: 'openai', field: 'apiKey' },
      ANTHROPIC_API_KEY: { provider: 'anthropic', field: 'apiKey' },
      OPENROUTER_API_KEY: { provider: 'openrouter', field: 'apiKey' },
    };
    
    for (const [envVar, mapping] of Object.entries(envOverrides)) {
      const value = process.env[envVar];
      if (value) {
        if (!this.config.services[mapping.provider]) {
          this.config.services[mapping.provider] = { apiKey: value };
        } else {
          this.config.services[mapping.provider].apiKey = value;
        }
      }
    }
  }
  
  // MCP Config Management Methods
  
  async listConfig(): Promise<AIAdvisorConfig> {
    return await this.getConfig();
  }
  
  async getServiceConfig(service: string, key?: string): Promise<any> {
    const config = await this.getConfig();
    
    if (!config.services[service]) {
      throw new Error(`Service '${service}' not found in configuration`);
    }
    
    const serviceConfig = config.services[service];
    
    if (key) {
      if (!(key in serviceConfig)) {
        throw new Error(`Key '${key}' not found in service '${service}'`);
      }
      return serviceConfig[key as keyof typeof serviceConfig];
    }
    
    return serviceConfig;
  }
  
  async setServiceConfig(service: string, key: string, value: string): Promise<void> {
    const config = await this.getConfig();
    
    if (!config.services[service]) {
      // Create new service if it doesn't exist
      config.services[service] = { apiKey: '' };
    }
    
    // Handle special cases for complex fields
    if (key === 'models' && typeof value === 'string') {
      // Parse comma-separated models
      config.services[service].models = value.split(',').map(m => m.trim()).filter(m => m);
    } else if (key === 'pricing' && typeof value === 'string') {
      // Parse JSON pricing data
      try {
        config.services[service].pricing = JSON.parse(value);
      } catch (e) {
        throw new Error(`Invalid pricing JSON: ${value}`);
      }
    } else {
      // Set simple string values
      (config.services[service] as any)[key] = value;
    }
    
    await this.saveConfig(config);
  }
  
  async addModel(service: string, model: string): Promise<void> {
    const config = await this.getConfig();
    
    if (!config.services[service]) {
      throw new Error(`Service '${service}' not found in configuration`);
    }
    
    if (!config.services[service].models) {
      config.services[service].models = [];
    }
    
    if (!config.services[service].models!.includes(model)) {
      config.services[service].models!.push(model);
      await this.saveConfig(config);
    }
  }
  
  async setDefaultModel(model: string): Promise<void> {
    const config = await this.getConfig();
    
    // Set both defaultModel and defaultModels for compatibility
    config.defaultModel = model;
    config.defaultModels = [model];
    
    await this.saveConfig(config);
  }
  
  async removeService(service: string): Promise<void> {
    const config = await this.getConfig();
    
    if (!config.services[service]) {
      throw new Error(`Service '${service}' not found in configuration`);
    }
    
    delete config.services[service];
    
    // If the default model was from this service, clear it
    if (config.defaultModel?.startsWith(`${service}/`)) {
      delete config.defaultModel;
      delete config.defaultModels;
    }
    
    await this.saveConfig(config);
  }
  
  async clearDefaultModel(): Promise<void> {
    const config = await this.getConfig();
    delete config.defaultModel;
    delete config.defaultModels;
    await this.saveConfig(config);
  }
  
  // Backup and Restore Methods
  
  async backupConfig(name?: string): Promise<string> {
    const config = await this.getConfig();
    const backupName = name || 'default';
    const backupFile = join(this.CONFIG_DIR, `backup-${backupName}.enc`);
    
    // Create encrypted backup
    const encrypted = await encrypt(JSON.stringify(config, null, 2), this.KEY_FILE);
    writeFileSync(backupFile, encrypted);
    
    this.logger.info(`Configuration backed up to: backup-${backupName}.enc`);
    return backupName;
  }
  
  async restoreConfig(name?: string): Promise<void> {
    const backupName = name || 'default';
    const backupFile = join(this.CONFIG_DIR, `backup-${backupName}.enc`);
    
    if (!existsSync(backupFile)) {
      throw new Error(`Backup '${backupName}' not found`);
    }
    
    // Read and decrypt backup
    const encryptedData = readFileSync(backupFile, 'utf-8');
    const decryptedData = await decrypt(encryptedData, this.KEY_FILE);
    const restoredConfig = JSON.parse(decryptedData);
    
    // Save as current config
    await this.saveConfig(restoredConfig);
    
    // Clear cache to force reload
    this.config = undefined;
    
    this.logger.info(`Configuration restored from: backup-${backupName}.enc`);
  }
  
  async listBackups(): Promise<string[]> {
    const files = readdirSync(this.CONFIG_DIR);
    const backups = files
      .filter((file: string) => file.startsWith('backup-') && file.endsWith('.enc'))
      .map((file: string) => file.replace('backup-', '').replace('.enc', ''));
    
    return backups;
  }
  
  async clearConfig(): Promise<void> {
    // Create a minimal empty config
    const emptyConfig: AIAdvisorConfig = {
      services: {},
      maxRetries: 2,
      timeout: 60000
    };
    
    // Save empty config
    await this.saveConfig(emptyConfig);
    
    // Clear cache
    this.config = undefined;
    
    this.logger.info('Configuration cleared');
  }
}

// Export singleton instance getter
export async function getConfig(): Promise<AIAdvisorConfig> {
  return ConfigManager.getInstance().getConfig();
}