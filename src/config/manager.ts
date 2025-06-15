import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { encrypt, decrypt } from './crypto';
import { runOnboardingWizard } from './wizard';
import { Logger } from '../services/logger';

export interface AIAdvisorConfig {
  services: {
    [provider: string]: {
      apiKey: string;
      models?: string[];
      endpoint?: string;
    };
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
  private readonly CONFIG_DIR = join(homedir(), '.ai-advisor');
  private readonly CONFIG_FILE = join(this.CONFIG_DIR, 'config.json');
  private readonly KEY_FILE = join(this.CONFIG_DIR, 'key');
  
  // Absolute path to project .env file as requested
  private readonly ENV_FILE = '/Users/merlin/_dev/ai-advisor/.env';
  
  private constructor() {}
  
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }
  
  async getConfig(): Promise<AIAdvisorConfig> {
    if (this.config) {
      return this.config;
    }
    
    // Ensure config directory exists
    if (!existsSync(this.CONFIG_DIR)) {
      mkdirSync(this.CONFIG_DIR, { recursive: true });
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
  
  async saveConfig(): Promise<void> {
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
    this.logger.info('No configuration found. Starting setup wizard...');
    
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
    if (!this.config) return;
    
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
}

// Export singleton instance getter
export async function getConfig(): Promise<AIAdvisorConfig> {
  return ConfigManager.getInstance().getConfig();
}