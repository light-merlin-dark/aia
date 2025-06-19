import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { orchestrate } from '../../src/core/orchestrator';
import { getPluginRegistry } from '../../src/plugins/registry';
import { ConfigManager } from '../../src/config/manager';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, rmSync } from 'fs';
import type { PluginRegistry } from '../../src/plugins/registry';
import { setupTestConfig } from './setup-test-config';

// This is an E2E test - it makes real API calls
// Run with: bun test tests/e2e/consult.e2e.test.ts

describe('AI Advisor E2E Tests', () => {
  let registry: PluginRegistry;
  
  beforeAll(async () => {
    // Setup test configuration to bypass wizard
    await setupTestConfig();
    
    registry = getPluginRegistry();
    const configManager = ConfigManager.getInstance();
    const loadedConfig = await configManager.getConfig();
    await registry.initialize(loadedConfig);
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
  });
  
  it('should handle orchestration with multiple models', async () => {
    const prompt = 'What color is the sky? Reply with one word.';
    
    // Test with multiple models (keep costs low)
    const result = await orchestrate({
      prompt,
      models: ['gpt-3.5-turbo', 'claude-3-haiku-20240307'],
      registry
    });
    
    // Should have responses from both models
    expect(result.responses.length).toBeGreaterThan(0);
    
    // Verify each response has proper structure
    result.responses.forEach(response => {
      expect(response.model).toBeTruthy();
      expect(response.provider).toBeTruthy();
      expect(response.content).toBeTruthy();
      expect(response.isError).toBeUndefined();
    });
    
    // Should contain "blue" in at least one response
    const hasBlue = result.responses.some(r => 
      r.content.toLowerCase().includes('blue')
    );
    expect(hasBlue).toBe(true);
  });
  
  it('should handle file attachments', async () => {
    const prompt = 'Analyze this code and tell me what it does.';
    
    const result = await orchestrate({
      prompt,
      files: ['tests/data/sample_code.py'],
      models: ['gpt-3.5-turbo'],
      registry
    });
    
    // Verify response structure
    expect(result.responses).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(result.responses[0].content).toBeTruthy();
    
    // Should mention something about the code
    expect(result.responses[0].content.toLowerCase()).toMatch(/code|function|python/);
  });
  
  afterAll(async () => {
    // Clean up test config if it exists
    const testConfigDir = join(homedir(), '.aia-test');
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
  });
});