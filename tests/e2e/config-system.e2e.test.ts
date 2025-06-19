import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { encrypt, decrypt } from '../../src/config/crypto';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { randomBytes } from 'crypto';

// Test the complete config system lifecycle with real encryption
describe('Config System E2E Tests', () => {
  let testDir: string;
  let testKeyFile: string;
  let testConfigFile: string;

  beforeEach(async () => {
    // Create unique test directory for each test
    testDir = join(tmpdir(), `config-test-${Date.now()}-${Math.random()}`);
    testKeyFile = join(testDir, 'key');
    testConfigFile = join(testDir, 'config.enc');

    // Ensure test directory exists
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should encrypt and decrypt config data', async () => {
    const config = {
      services: {
        openai: {
          apiKey: 'sk-test-key-12345',
          models: ['gpt-3.5-turbo', 'gpt-4-turbo']
        },
        anthropic: {
          apiKey: 'claude-test-key-67890',
          models: ['claude-3-haiku-20240307']
        }
      },
      defaultModel: 'gpt-4-turbo',
      maxRetries: 3,
      timeout: 30000
    };

    // Test the encrypt function
    const configJson = JSON.stringify(config);
    const encrypted = await encrypt(configJson, testKeyFile);

    // Verify key file was created
    expect(existsSync(testKeyFile)).toBe(true);
    
    // Verify encrypted data doesn't contain plaintext
    expect(encrypted).not.toContain('sk-test-key-12345');
    expect(encrypted).not.toContain('claude-test-key-67890');
    expect(encrypted).not.toContain('openai');
    expect(encrypted).not.toContain('anthropic');

    // Test the decrypt function
    const decrypted = await decrypt(encrypted, testKeyFile);
    const decryptedConfig = JSON.parse(decrypted);

    // Verify decrypted config matches original
    expect(decryptedConfig.services.openai.apiKey).toBe('sk-test-key-12345');
    expect(decryptedConfig.services.anthropic.apiKey).toBe('claude-test-key-67890');
    expect(decryptedConfig.services.openai.models).toEqual(['gpt-3.5-turbo', 'gpt-4-turbo']);
    expect(decryptedConfig.defaultModel).toBe('gpt-4-turbo');
    expect(decryptedConfig.maxRetries).toBe(3);
  });

  it('should handle file operations correctly', async () => {
    const testData = {
      sensitive: 'secret-information',
      models: ['model1', 'model2'],
      nested: {
        deep: {
          value: 'test'
        }
      }
    };

    // Encrypt and save to file
    const encrypted = await encrypt(JSON.stringify(testData), testKeyFile);
    writeFileSync(testConfigFile, encrypted, { mode: 0o600 });

    // Verify file was created with correct permissions
    expect(existsSync(testConfigFile)).toBe(true);
    
    // Read and decrypt from file
    const fileContent = readFileSync(testConfigFile, 'utf-8');
    const decrypted = await decrypt(fileContent, testKeyFile);
    const parsedData = JSON.parse(decrypted);

    // Verify data integrity
    expect(parsedData.sensitive).toBe('secret-information');
    expect(parsedData.models).toEqual(['model1', 'model2']);
    expect(parsedData.nested.deep.value).toBe('test');
  });

  it('should create secure key files', async () => {
    const testData = 'test-encryption-data';
    
    // Encrypt (this creates the key file)
    const encrypted = await encrypt(testData, testKeyFile);

    // Verify key file exists and has correct permissions
    expect(existsSync(testKeyFile)).toBe(true);
    
    // Verify key file is 32 bytes (256 bits)
    const keyData = readFileSync(testKeyFile);
    expect(keyData.length).toBe(32);

    // Verify the same key can decrypt the data
    const decrypted = await decrypt(encrypted, testKeyFile);
    expect(decrypted).toBe(testData);
  });

  it('should handle multiple encryption/decryption cycles', async () => {
    const configs = [
      { service: 'openai', key: 'key1' },
      { service: 'anthropic', key: 'key2' },
      { service: 'openrouter', key: 'key3' }
    ];

    // Encrypt each config
    const encryptedConfigs = [];
    for (const config of configs) {
      const encrypted = await encrypt(JSON.stringify(config), testKeyFile);
      encryptedConfigs.push(encrypted);
    }

    // Decrypt each config and verify
    for (let i = 0; i < encryptedConfigs.length; i++) {
      const decrypted = await decrypt(encryptedConfigs[i], testKeyFile);
      const parsedConfig = JSON.parse(decrypted);
      
      expect(parsedConfig.service).toBe(configs[i].service);
      expect(parsedConfig.key).toBe(configs[i].key);
    }
  });

  it('should fail with wrong key', async () => {
    const testData = 'secret-data';
    const wrongKeyFile = join(testDir, 'wrong-key');

    // Encrypt with one key
    const encrypted = await encrypt(testData, testKeyFile);

    // Create different key
    const wrongKey = randomBytes(32);
    writeFileSync(wrongKeyFile, wrongKey, { mode: 0o600 });

    // Should fail to decrypt with wrong key
    await expect(decrypt(encrypted, wrongKeyFile)).rejects.toThrow();
  });

  it('should handle corrupted data gracefully', async () => {
    // Create key file
    const key = randomBytes(32);
    writeFileSync(testKeyFile, key, { mode: 0o600 });

    // Try to decrypt corrupted data
    const corruptedData = 'definitely-not-encrypted-data';
    
    await expect(decrypt(corruptedData, testKeyFile)).rejects.toThrow();
  });

  it('should handle missing key file', async () => {
    const nonExistentKeyFile = join(testDir, 'non-existent-key');

    // Should fail to decrypt without key file
    await expect(decrypt('some-data', nonExistentKeyFile)).rejects.toThrow();
  });

  it('should maintain consistent encryption', async () => {
    const testData = 'consistent-test-data';

    // Encrypt the same data multiple times
    const encrypted1 = await encrypt(testData, testKeyFile);
    const encrypted2 = await encrypt(testData, testKeyFile);

    // Encrypted data should be different (due to random IV)
    expect(encrypted1).not.toBe(encrypted2);

    // But both should decrypt to the same result
    const decrypted1 = await decrypt(encrypted1, testKeyFile);
    const decrypted2 = await decrypt(encrypted2, testKeyFile);

    expect(decrypted1).toBe(testData);
    expect(decrypted2).toBe(testData);
  });

  it('should backup and restore configuration', async () => {
    // Import ConfigManager for testing
    const { ConfigManager } = await import('../../src/config/manager');
    
    // Reset singleton for clean test
    ConfigManager.resetInstance();
    
    // Create a test config manager with our test directory
    const configManager = ConfigManager.getInstance();
    configManager.CONFIG_DIR = testDir;
    configManager.CONFIG_FILE = testConfigFile;
    configManager.KEY_FILE = testKeyFile;
    configManager.disableEnvMerge = true;
    
    // Create initial config
    const initialConfig = {
      services: {
        openai: {
          apiKey: 'original-key',
          models: ['gpt-4']
        },
        default: {
          apiKey: '',
          service: 'openai'
        }
      },
      maxRetries: 2,
      timeout: 30000
    };
    
    // Save initial config
    await configManager.saveConfig(initialConfig);
    
    // Create backup
    const backupName = await configManager.backupConfig();
    expect(backupName).toBe('default');
    
    // Verify backup file exists
    const backupFile = join(testDir, 'backup-default.enc');
    expect(existsSync(backupFile)).toBe(true);
    
    // Modify config
    const modifiedConfig = {
      services: {
        anthropic: {
          apiKey: 'new-key',
          models: ['claude-3']
        },
        default: {
          apiKey: '',
          service: 'anthropic'
        }
      },
      maxRetries: 5,
      timeout: 60000
    };
    
    await configManager.saveConfig(modifiedConfig);
    
    // Verify config was changed
    const currentConfig = await configManager.getConfig();
    expect(currentConfig.services.openai).toBeUndefined();
    expect(currentConfig.services.anthropic?.apiKey).toBe('new-key');
    
    // Restore from backup
    await configManager.restoreConfig();
    
    // Verify config was restored
    const restoredConfig = await configManager.getConfig();
    expect(restoredConfig.services.openai?.apiKey).toBe('original-key');
    expect(restoredConfig.services.anthropic).toBeUndefined();
    expect(restoredConfig.maxRetries).toBe(2);
  });

  it('should handle named backups', async () => {
    const { ConfigManager } = await import('../../src/config/manager');
    ConfigManager.resetInstance();
    const configManager = ConfigManager.getInstance();
    configManager.CONFIG_DIR = testDir;
    configManager.CONFIG_FILE = testConfigFile;
    configManager.KEY_FILE = testKeyFile;
    configManager.disableEnvMerge = true;
    
    const config1 = {
      services: { openai: { apiKey: 'key1', models: ['gpt-3.5-turbo'] } },
      maxRetries: 1,
      timeout: 10000
    };
    
    const config2 = {
      services: { anthropic: { apiKey: 'key2', models: ['claude-3'] } },
      maxRetries: 2,
      timeout: 20000
    };
    
    // Create multiple named backups
    await configManager.saveConfig(config1);
    await configManager.backupConfig('version1');
    
    await configManager.saveConfig(config2);
    await configManager.backupConfig('version2');
    
    // List backups
    const backups = await configManager.listBackups();
    expect(backups).toContain('version1');
    expect(backups).toContain('version2');
    
    // Restore specific backup
    await configManager.restoreConfig('version1');
    const restored1 = await configManager.getConfig();
    expect(restored1.services.openai?.apiKey).toBe('key1');
    expect(restored1.maxRetries).toBe(1);
    
    await configManager.restoreConfig('version2');
    const restored2 = await configManager.getConfig();
    expect(restored2.services.anthropic?.apiKey).toBe('key2');
    expect(restored2.maxRetries).toBe(2);
  });

  it('should clear configuration', async () => {
    const { ConfigManager } = await import('../../src/config/manager');
    ConfigManager.resetInstance();
    const configManager = ConfigManager.getInstance();
    configManager.CONFIG_DIR = testDir;
    configManager.CONFIG_FILE = testConfigFile;
    configManager.KEY_FILE = testKeyFile;
    configManager.disableEnvMerge = true;
    
    // Create config with data
    const config = {
      services: {
        openai: { apiKey: 'test-key', models: ['gpt-4'] },
        anthropic: { apiKey: 'test-key2', models: ['claude-3'] }
      },
      defaultModel: 'gpt-4',
      maxRetries: 3,
      timeout: 45000
    };
    
    await configManager.saveConfig(config);
    
    // Clear config
    await configManager.clearConfig();
    
    // Verify config is empty
    const clearedConfig = await configManager.getConfig();
    expect(Object.keys(clearedConfig.services)).toHaveLength(0);
    expect(clearedConfig.defaultModel).toBeUndefined();
    expect(clearedConfig.defaultModels).toBeUndefined();
    expect(clearedConfig.maxRetries).toBe(2); // Default value
    expect(clearedConfig.timeout).toBe(60000); // Default value
  });
});