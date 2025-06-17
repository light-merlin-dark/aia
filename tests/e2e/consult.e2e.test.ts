import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { orchestrate } from '../../src/core/orchestrator';
import { getPluginRegistry } from '../../src/plugins/registry';
import { ConfigManager } from '../../src/config/manager';
import { Logger } from '../../src/services/logger';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, rmSync } from 'fs';
import type { PluginRegistry } from '../../src/plugins/registry';
import { setupTestConfig } from './setup-test-config';
import { encrypt } from '../../src/config/crypto';
import { writeFileSync } from 'fs';

// This is an E2E test - it makes real API calls
// Run with: npm test tests/e2e/consult.e2e.test.ts

describe('AI Advisor E2E Tests', () => {
  let registry: PluginRegistry;
  let capturedLogs: Array<{ level: string; message: string; args: any[] }> = [];
  
  // Capture logger output
  const originalLog = Logger.prototype.log;
  const originalInfo = Logger.prototype.info;
  const originalDebug = Logger.prototype.debug;
  const originalWarn = Logger.prototype.warn;
  const originalError = Logger.prototype.error;
  
  beforeAll(async () => {
    // Setup test configuration to bypass wizard
    const { configDir, keyFile, config } = setupTestConfig();
    
    // Encrypt and save the config
    const encrypted = await encrypt(JSON.stringify(config, null, 2), keyFile);
    writeFileSync(join(configDir, 'config.json'), encrypted);
    
    // Initialize registry with real plugins
    registry = getPluginRegistry();
    const configManager = ConfigManager.getInstance();
    const loadedConfig = await configManager.getConfig();
    await registry.initialize(loadedConfig);
  }, 60000); // 60s timeout for initialization
  
  beforeEach(() => {
    capturedLogs = [];
    
    // Capture all log methods
    Logger.prototype.log = function(level: string, message: string, ...args: any[]) {
      capturedLogs.push({ level, message, args });
      originalLog.call(this, level, message, ...args);
    };
    
    Logger.prototype.info = function(message: string, ...args: any[]) {
      capturedLogs.push({ level: 'info', message, args });
      originalInfo.call(this, message, ...args);
    };
    
    Logger.prototype.debug = function(message: string, ...args: any[]) {
      capturedLogs.push({ level: 'debug', message, args });
      originalDebug.call(this, message, ...args);
    };
    
    Logger.prototype.warn = function(message: string, ...args: any[]) {
      capturedLogs.push({ level: 'warn', message, args });
      originalWarn.call(this, message, ...args);
    };
    
    Logger.prototype.error = function(message: string, ...args: any[]) {
      capturedLogs.push({ level: 'error', message, args });
      originalError.call(this, message, ...args);
    };
  });
  
  afterEach(() => {
    // Restore original methods
    Logger.prototype.log = originalLog;
    Logger.prototype.info = originalInfo;
    Logger.prototype.debug = originalDebug;
    Logger.prototype.warn = originalWarn;
    Logger.prototype.error = originalError;
  });
  
  it('should consult AI without file attachments', async () => {
    const prompt = 'What is 2 + 2? Reply with just the number.';
    
    // Use a single model to minimize costs
    const result = await orchestrate({
      prompt,
      models: ['gpt-3.5-turbo'], // Using cheaper model for tests
      registry
    });
    
    // Verify response structure
    expect(result.responses).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(result.responses[0].model).toBe('gpt-3.5-turbo');
    expect(result.responses[0].provider).toBe('openai');
    expect(result.responses[0].content).toBeTruthy();
    expect(result.responses[0].isError).toBeUndefined();
    
    // The response should contain "4"
    expect(result.responses[0].content).toMatch(/4/);
    
    // Verify logs contain the prompt
    const promptLogs = capturedLogs.filter(log => 
      log.message.includes('Consulting') || 
      log.message.includes('Executing model')
    );
    expect(promptLogs.length).toBeGreaterThan(0);
    
    // Log the actual prompt that was sent (for debugging)
    console.log('Prompt sent to AI:', prompt);
    console.log('AI Response:', result.responses[0].content);
  }, 30000); // 30s timeout for API call
  
  it('should consult AI with file attachments', async () => {
    const prompt = 'What do these files do? Give a brief summary.';
    const testDataDir = join(__dirname, 'data');
    
    const result = await orchestrate({
      prompt,
      files: [
        join(testDataDir, 'hello.js'),
        join(testDataDir, 'math.ts')
      ],
      models: ['gpt-3.5-turbo'],
      registry
    });
    
    // Verify response structure
    expect(result.responses).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(result.responses[0].content).toBeTruthy();
    
    // The response should mention both files
    const response = result.responses[0].content.toLowerCase();
    expect(response).toMatch(/hello|greet/i);
    expect(response).toMatch(/math|add|multiply/i);
    
    // Verify file resolution logs
    const fileResolutionLogs = capturedLogs.filter(log => 
      log.message.includes('Resolving files') ||
      log.message.includes('File resolution')
    );
    expect(fileResolutionLogs.length).toBeGreaterThan(0);
    
    // Find the full prompt that was built (with file contents)
    // const orchestratorLogs = capturedLogs.filter(log => 
    //   log.level === 'debug' && log.message.includes('Executing model')
    // );
    
    // Log what was actually sent to the AI
    console.log('\n=== E2E Test: Files Attached ===');
    console.log('Original prompt:', prompt);
    console.log('Files attached:', ['hello.js', 'math.ts']);
    console.log('AI Response:', result.responses[0].content);
    console.log('Response includes greeting logic:', response.includes('greet') || response.includes('hello'));
    console.log('Response includes math functions:', response.includes('add') || response.includes('multiply'));
  }, 30000);
  
  it('should handle API errors gracefully', async () => {
    // Use an invalid model to trigger an error
    const result = await orchestrate({
      prompt: 'Test prompt',
      models: ['invalid-model-xyz'],
      registry,
      maxRetries: 0 // Don't retry to save time
    });
    
    // Should have failed
    expect(result.failed).toContain('invalid-model-xyz');
    expect(result.responses[0].isError).toBe(true);
    expect(result.responses[0].error).toBeTruthy();
    
    console.log('\n=== E2E Test: Error Handling ===');
    console.log('Error received:', result.responses[0].error);
  }, 30000);
  
  it('should execute multiple models in parallel', async () => {
    const prompt = 'What is the capital of France? Reply with just the city name.';
    
    // Test with two models
    const result = await orchestrate({
      prompt,
      models: ['gpt-3.5-turbo', 'claude-3-haiku-20240307'],
      registry
    });
    
    // Should have responses from both
    expect(result.responses).toHaveLength(2);
    
    // Count successful responses
    const successfulResponses = result.responses.filter(r => !r.isError);
    expect(successfulResponses.length).toBeGreaterThan(0);
    
    // All successful responses should mention Paris
    for (const response of successfulResponses) {
      expect(response.content.toLowerCase()).toMatch(/paris/i);
    }
    
    console.log('\n=== E2E Test: Parallel Execution ===');
    console.log('Models tested:', result.responses.map(r => r.model).join(', '));
    console.log('Successful responses:', successfulResponses.length);
    console.log('Failed responses:', result.failed.length);
    
    // Log timing
    console.log(`Total duration: ${result.durationMs}ms`);
  }, 30000);
  
  afterAll(() => {
    // Clean up test config
    const configDir = join(homedir(), '.aia');
    if (existsSync(configDir)) {
      rmSync(configDir, { recursive: true, force: true });
    }
  });
});