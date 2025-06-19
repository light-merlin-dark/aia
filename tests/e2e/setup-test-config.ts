import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import { encrypt } from '../../src/config/crypto';

// Create a test configuration to bypass the wizard
export async function setupTestConfig() {
  const configDir = join(homedir(), '.aia');
  const keyFile = join(configDir, 'key');
  const configFile = join(configDir, 'config.enc');
  
  // Ensure directory exists
  mkdirSync(configDir, { recursive: true });
  
  // Create a key file (simplified for testing)
  const key = randomBytes(32);
  writeFileSync(keyFile, key, { mode: 0o600 });
  
  // Create a basic config
  const config = {
    services: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY || 'test-key',
        models: ['gpt-3.5-turbo', 'gpt-4-turbo']
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
        models: ['claude-3-haiku-20240307', 'claude-3-opus-20240229']
      },
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY || 'test-key',
        models: []
      },
      default: {
        apiKey: '',
        service: 'openai'
      }
    },
    maxRetries: 2,
    timeout: 30000
  };
  
  // Encrypt and save the config
  const encrypted = await encrypt(JSON.stringify(config), keyFile);
  writeFileSync(configFile, encrypted, { mode: 0o600 });
  
  return { configDir, keyFile, config };
}