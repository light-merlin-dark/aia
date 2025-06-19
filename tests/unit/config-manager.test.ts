import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../../src/config/manager';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from '../../src/config/crypto';
import { runOnboardingWizard } from '../../src/config/wizard';
import type { AIAdvisorConfig } from '../../src/config/manager';

// Mock dependencies
vi.mock('fs');
vi.mock('os');
vi.mock('../../src/config/crypto');
vi.mock('../../src/config/wizard');
vi.mock('../../src/services/logger');

// Helper to get a fresh ConfigManager instance
function getNewConfigManager(): ConfigManager {
  // Reset the singleton
  (ConfigManager as any).instance = undefined;
  return ConfigManager.getInstance();
}

describe('ConfigManager', () => {
  const mockHomeDir = '/home/user';
  const mockConfigDir = '/home/user/.aia';
  const mockConfigFile = '/home/user/.aia/config.enc';
  const mockKeyFile = '/home/user/.aia/key';
  const mockEnvFile = '/test/.env';
  
  const mockConfig: AIAdvisorConfig = {
    services: {
      openai: { apiKey: 'test-openai-key' },
      anthropic: { apiKey: 'test-anthropic-key' }
    },
    defaultModel: 'gpt-4',
    maxRetries: 3,
    timeout: 60000
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
    
    // Set test env file path
    process.env.AIA_ENV_FILE = mockEnvFile;
    
    // Reset process.env
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });
  
  afterEach(() => {
    // Clean up singleton
    (ConfigManager as any).instance = undefined;
    // Clean up env variable
    delete process.env.AIA_ENV_FILE;
  });
  
  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ConfigManager.getInstance();
      const instance2 = ConfigManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
  
  describe('getConfig', () => {
    it('should create config directory if not exists', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === mockConfigDir) return false;
        if (path === mockConfigFile || path === mockKeyFile) return false;
        return true;
      });
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(runOnboardingWizard).mockResolvedValue(mockConfig);
      vi.mocked(crypto.encrypt).mockResolvedValue('encrypted-data');
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      
      const manager = getNewConfigManager();
      await manager.getConfig();
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockConfigDir, { recursive: true });
    });
    
    it('should load existing config from encrypted file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === mockConfigFile) return 'encrypted-config';
        if (path === mockKeyFile) return 'encryption-key';
        return '';
      });
      vi.mocked(crypto.decrypt).mockResolvedValue(JSON.stringify(mockConfig));
      
      const manager = getNewConfigManager();
      const config = await manager.getConfig();
      
      expect(config).toEqual(mockConfig);
      expect(crypto.decrypt).toHaveBeenCalledWith('encrypted-config', mockKeyFile);
    });
    
    it('should create new config if files do not exist', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === mockConfigFile || path === mockKeyFile) return false;
        return true;
      });
      vi.mocked(runOnboardingWizard).mockResolvedValue(mockConfig);
      vi.mocked(crypto.encrypt).mockResolvedValue('encrypted-data');
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      
      const manager = getNewConfigManager();
      const config = await manager.getConfig();
      
      expect(config).toEqual(mockConfig);
      expect(runOnboardingWizard).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(mockConfigFile, 'encrypted-data');
    });
    
    it('should handle decryption errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('corrupted-data');
      vi.mocked(crypto.decrypt).mockRejectedValue(new Error('Decryption failed'));
      
      const manager = getNewConfigManager();
      await expect(manager.getConfig()).rejects.toThrow('Failed to decrypt configuration');
    });
    
    it('should merge environment variables with config', async () => {
      process.env.OPENAI_API_KEY = 'env-openai-key';
      process.env.ANTHROPIC_API_KEY = 'env-anthropic-key';
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('encrypted-config');
      vi.mocked(crypto.decrypt).mockResolvedValue(JSON.stringify(mockConfig));
      
      const manager = getNewConfigManager();
      const config = await manager.getConfig();
      
      expect(config.services.openai.apiKey).toBe('env-openai-key');
      expect(config.services.anthropic.apiKey).toBe('env-anthropic-key');
    });
    
    it('should add new providers from environment variables', async () => {
      process.env.OPENROUTER_API_KEY = 'env-openrouter-key';
      
      const configWithoutOpenRouter = {
        ...mockConfig,
        services: { openai: { apiKey: 'test-key' } }
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('encrypted-config');
      vi.mocked(crypto.decrypt).mockResolvedValue(JSON.stringify(configWithoutOpenRouter));
      
      const manager = getNewConfigManager();
      const config = await manager.getConfig();
      
      expect(config.services.openrouter).toEqual({ apiKey: 'env-openrouter-key' });
    });
    
    it('should cache config after first load', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('encrypted-config');
      vi.mocked(crypto.decrypt).mockResolvedValue(JSON.stringify(mockConfig));
      
      const manager = getNewConfigManager();
      const config1 = await manager.getConfig();
      const config2 = await manager.getConfig();
      
      expect(config1).toBe(config2);
      expect(crypto.decrypt).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('saveConfig', () => {
    it('should encrypt and save config', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('encrypted-config');
      vi.mocked(crypto.decrypt).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(crypto.encrypt).mockResolvedValue('new-encrypted-data');
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      
      const manager = getNewConfigManager();
      await manager.getConfig();
      await manager.saveConfig();
      
      expect(crypto.encrypt).toHaveBeenCalledWith(
        JSON.stringify(mockConfig, null, 2),
        mockKeyFile
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(mockConfigFile, 'new-encrypted-data');
    });
    
    it('should throw error if no config to save', async () => {
      const manager = getNewConfigManager();
      await expect(manager.saveConfig()).rejects.toThrow('No configuration to save');
    });
  });
  
  describe('loadEnvFile', () => {
    it('should load API keys from .env file', async () => {
      const envContent = `
# Comment line
OPENAI_API_KEY=env-openai-key
ANTHROPIC_API_KEY=env-anthropic-key
OPENROUTER_API_KEY=env-openrouter-key
OTHER_VAR=ignored
`;
      
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === mockEnvFile) return true;
        if (path === mockConfigFile || path === mockKeyFile) return false;
        return true;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === mockEnvFile) return envContent;
        return '';
      });
      vi.mocked(runOnboardingWizard).mockImplementation(async (envConfig) => {
        // Verify env config was passed correctly
        expect(envConfig.services).toEqual({
          openai: { apiKey: 'env-openai-key' },
          anthropic: { apiKey: 'env-anthropic-key' },
          openrouter: { apiKey: 'env-openrouter-key' }
        });
        return mockConfig;
      });
      vi.mocked(crypto.encrypt).mockResolvedValue('encrypted-data');
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      
      const manager = getNewConfigManager();
      await manager.getConfig();
      
      expect(runOnboardingWizard).toHaveBeenCalled();
    });
    
    it('should handle missing .env file gracefully', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === mockEnvFile) return false;
        if (path === mockConfigFile || path === mockKeyFile) return false;
        return true;
      });
      vi.mocked(runOnboardingWizard).mockResolvedValue(mockConfig);
      vi.mocked(crypto.encrypt).mockResolvedValue('encrypted-data');
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      
      const manager = getNewConfigManager();
      await manager.getConfig();
      
      expect(runOnboardingWizard).toHaveBeenCalledWith({ services: {} });
    });
    
    it('should handle malformed .env file', async () => {
      const envContent = `
INVALID LINE WITHOUT EQUALS
OPENAI_API_KEY=valid-key
=VALUE_WITHOUT_KEY
KEY_WITH_EQUALS=value=with=equals
`;
      
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === mockEnvFile) return true;
        if (path === mockConfigFile || path === mockKeyFile) return false;
        return true;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === mockEnvFile) return envContent;
        return '';
      });
      vi.mocked(runOnboardingWizard).mockImplementation(async (envConfig) => {
        expect(envConfig.services).toEqual({
          openai: { apiKey: 'valid-key' }
        });
        return mockConfig;
      });
      vi.mocked(crypto.encrypt).mockResolvedValue('encrypted-data');
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      
      const manager = getNewConfigManager();
      await manager.getConfig();
      
      expect(runOnboardingWizard).toHaveBeenCalled();
    });
  });
});

describe('getConfig export', () => {
  it('should use singleton instance', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('encrypted-config');
    vi.mocked(crypto.decrypt).mockResolvedValue(JSON.stringify({
      services: { openai: { apiKey: 'test-key' } }
    }));
    
    const { getConfig } = await import('../../src/config/manager');
    const config1 = await getConfig();
    const config2 = await getConfig();
    
    expect(config1).toBe(config2);
    expect(crypto.decrypt).toHaveBeenCalledTimes(1);
  });
});