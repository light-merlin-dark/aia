import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt } from '../../src/config/crypto';
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Config Encryption/Decryption', () => {
  const testDir = join(tmpdir(), 'aia-test-' + Date.now());
  const keyPath = join(testDir, 'test-key');
  const configPath = join(testDir, 'test-config.enc');

  beforeEach(() => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should generate a key file on first encryption', async () => {
    const testData = 'test data';
    
    // Key should not exist initially
    expect(existsSync(keyPath)).toBe(false);
    
    // Encrypt data
    await encrypt(testData, keyPath);
    
    // Key should now exist
    expect(existsSync(keyPath)).toBe(true);
    
    // Key should be 32 bytes (256 bits)
    const key = readFileSync(keyPath);
    expect(key.length).toBe(32);
  });

  it('should encrypt and decrypt data successfully', async () => {
    const testData = JSON.stringify({
      services: {
        openai: {
          apiKey: 'sk-test123',
          models: ['gpt-4']
        }
      },
      defaultModel: 'gpt-4'
    });
    
    // Encrypt
    const encrypted = await encrypt(testData, keyPath);
    
    // Encrypted data should be base64
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
    
    // Encrypted should be different from original
    expect(encrypted).not.toBe(testData);
    
    // Decrypt
    const decrypted = await decrypt(encrypted, keyPath);
    
    // Decrypted should match original
    expect(decrypted).toBe(testData);
  });

  it('should use the same key for multiple encryptions', async () => {
    const data1 = 'first encryption';
    const data2 = 'second encryption';
    
    // First encryption creates key
    await encrypt(data1, keyPath);
    const key1 = readFileSync(keyPath);
    
    // Second encryption uses same key
    await encrypt(data2, keyPath);
    const key2 = readFileSync(keyPath);
    
    // Keys should be identical
    expect(key1.equals(key2)).toBe(true);
  });

  it('should fail to decrypt with wrong key', async () => {
    const testData = 'sensitive data';
    const wrongKeyPath = join(testDir, 'wrong-key');
    
    // Encrypt with one key
    const encrypted = await encrypt(testData, keyPath);
    
    // Create a different key
    writeFileSync(wrongKeyPath, Buffer.from('x'.repeat(32)));
    
    // Decrypt with wrong key should fail
    await expect(decrypt(encrypted, wrongKeyPath)).rejects.toThrow();
  });

  it('should fail to decrypt if key file is missing', async () => {
    const testData = 'test data';
    const missingKeyPath = join(testDir, 'missing-key');
    
    // Encrypt first
    const encrypted = await encrypt(testData, keyPath);
    
    // Try to decrypt with non-existent key
    await expect(decrypt(encrypted, missingKeyPath)).rejects.toThrow('Encryption key not found');
  });

  it('should handle real config structure', async () => {
    const realConfig = {
      services: {
        openrouter: {
          apiKey: 'sk-or-test-key-123456',
          models: ['google/gemini-2.5-pro']
        }
      },
      defaultModel: 'google/gemini-2.5-pro',
      defaultModels: ['google/gemini-2.5-pro'],
      plugins: {
        enabled: ['openrouter'],
        disabled: []
      },
      maxRetries: 2,
      timeout: 60000
    };
    
    const configJson = JSON.stringify(realConfig);
    
    // Encrypt
    const encrypted = await encrypt(configJson, keyPath);
    
    // Save to file like the real config manager does
    writeFileSync(configPath, encrypted);
    
    // Read from file and decrypt
    const encryptedFromFile = readFileSync(configPath, 'utf-8');
    const decrypted = await decrypt(encryptedFromFile, keyPath);
    const parsedConfig = JSON.parse(decrypted);
    
    // Verify all fields
    expect(parsedConfig).toEqual(realConfig);
    expect(parsedConfig.services.openrouter.apiKey).toBe('sk-or-test-key-123456');
  });

  it('should test the actual user config if it exists', async () => {
    const userConfigDir = join(process.env.HOME || '', '.aia');
    const userConfigPath = join(userConfigDir, 'config.enc');
    const oldUserConfigPath = join(userConfigDir, 'config.json');
    const userKeyPath = join(userConfigDir, 'key');
    
    // Check for either new or old config file
    const configToTest = existsSync(userConfigPath) ? userConfigPath : 
                        existsSync(oldUserConfigPath) ? oldUserConfigPath : null;
    
    if (configToTest && existsSync(userKeyPath)) {
      console.log('Testing actual user config...');
      
      try {
        // Read the encrypted config
        const encrypted = readFileSync(configToTest, 'utf-8');
        console.log(`Testing ${configToTest}`);
        console.log('Encrypted length:', encrypted.length);
        
        // Try to decrypt
        const decrypted = await decrypt(encrypted, userKeyPath);
        console.log('Decrypted successfully');
        
        // Parse the JSON
        const config = JSON.parse(decrypted);
        console.log('Config structure:', Object.keys(config));
        
        // Basic validation
        expect(config).toHaveProperty('services');
        // defaultModel is optional
        if (config.defaultModel) {
          expect(typeof config.defaultModel).toBe('string');
        }
      } catch (error) {
        console.error('Error testing user config:', error);
        throw error;
      }
    } else {
      console.log('User config not found, skipping test');
    }
  });
});