import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

const TEST_DIR = join(process.cwd(), 'test', 'fixtures');
const CLI_PATH = join(process.cwd(), 'src', 'index.ts');

/**
 * Production Tests - These tests make real API calls to verify the CLI works end-to-end
 * Only run when OPENROUTER_API_KEY is available
 */
describe('Production Tests', () => {
  const hasAPIKey = process.env.AIA_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  
  beforeEach(async () => {
    if (!hasAPIKey) {
      console.log('⚠️  Skipping production tests - no API key found');
      return;
    }

    // Create test directory and files
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    
    // Create a small test file for attachment
    writeFileSync(join(TEST_DIR, 'test-script.js'), `
// Simple test script for AIA CLI production testing
function greet(name) {
  return \`Hello, \${name}! This is a test function.\`;
}

function calculate(a, b) {
  return a + b;
}

module.exports = { greet, calculate };
    `.trim());

    writeFileSync(join(TEST_DIR, 'test-config.json'), JSON.stringify({
      name: "aia-production-test",
      version: "1.0.0",
      testData: {
        numbers: [1, 2, 3, 4, 5],
        settings: {
          debug: true,
          timeout: 5000
        }
      }
    }, null, 2));
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  async function runCLI(args: string[], options: { cwd?: string; timeout?: number } = {}): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    return new Promise((resolve, reject) => {
      const child = spawn('bun', [CLI_PATH, ...args], {
        cwd: options.cwd || process.cwd(),
        env: {
          ...process.env,
          AIA_OPENROUTER_API_KEY: hasAPIKey
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });

      child.on('error', reject);

      // Configurable timeout (default 60 seconds for API calls)
      const timeout = options.timeout || 60000;
      setTimeout(() => {
        child.kill();
        reject(new Error(`CLI test timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  describe('Real API Integration', () => {
    it('should successfully consult OpenRouter with google/gemini-2.5-pro', async () => {
      if (!hasAPIKey) {
        console.log('⚠️  Skipping - no API key');
        return;
      }

      const result = await runCLI([
        'consult',
        'This is a production test. Please respond with exactly: "Production test successful"',
        '-m', 'google/gemini-2.5-pro',
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 30000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('Error');
      
      // Parse JSON response
      const response = JSON.parse(result.stdout);
      expect(response).toHaveProperty('responses');
      expect(response.responses).toHaveLength(1);
      expect(response.responses[0]).toHaveProperty('content');
      expect(response.responses[0].content).toContain('Production test successful');
      
      // Should have cost information
      expect(response).toHaveProperty('costs');
      expect(response.costs).toHaveLength(1);
      expect(response.costs[0]).toHaveProperty('inputTokens');
      expect(response.costs[0]).toHaveProperty('outputTokens');
    }, 35000);

    it('should successfully attach and analyze a JavaScript file', async () => {
      if (!hasAPIKey) {
        console.log('⚠️  Skipping - no API key');
        return;
      }

      const result = await runCLI([
        'consult',
        'Analyze the attached JavaScript file. What functions does it export?',
        '-m', 'google/gemini-2.5-pro',
        '-f', 'test-script.js',
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 30000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('Error');
      
      const response = JSON.parse(result.stdout);
      expect(response.responses[0].content).toContain('greet');
      expect(response.responses[0].content).toContain('calculate');
      
      // Verify file was actually attached by checking content mentions
      const content = response.responses[0].content.toLowerCase();
      expect(content).toMatch(/function|export|module/);
    }, 35000);

    it('should attach multiple files from relative paths', async () => {
      if (!hasAPIKey) {
        console.log('⚠️  Skipping - no API key');
        return;
      }

      // Create subdirectory to test relative paths
      const subDir = join(TEST_DIR, 'subproject');
      mkdirSync(subDir, { recursive: true });
      
      const result = await runCLI([
        'consult',
        'I have attached a JavaScript file and a JSON config. Summarize what each contains.',
        '-m', 'google/gemini-2.5-pro',
        '-f', '../test-script.js,../test-config.json',
        '--json'
      ], {
        cwd: subDir,
        timeout: 40000
      });

      expect(result.exitCode).toBe(0);
      
      const response = JSON.parse(result.stdout);
      const content = response.responses[0].content.toLowerCase();
      
      // Should mention both files
      expect(content).toMatch(/javascript|js|function/);
      expect(content).toMatch(/json|config|settings/);
      expect(content).toMatch(/greet|calculate/);
      expect(content).toMatch(/debug|timeout|numbers/);
    }, 45000);

    it('should handle cost calculation with real pricing', async () => {
      if (!hasAPIKey) {
        console.log('⚠️  Skipping - no API key');
        return;
      }

      const result = await runCLI([
        'consult',
        'Short test prompt for cost verification.',
        '-m', 'google/gemini-2.5-pro',
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 20000
      });

      expect(result.exitCode).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.costs[0]).toHaveProperty('totalCost');
      expect(response.costs[0]).toHaveProperty('formattedCost');
      expect(typeof response.costs[0].totalCost).toBe('number');
      expect(response.costs[0].totalCost).toBeGreaterThan(0);
      expect(response.costs[0].formattedCost).toMatch(/\$/);
    }, 25000);
  });

  describe('Error Scenarios with Real API', () => {
    it('should handle invalid model gracefully', async () => {
      if (!hasAPIKey) {
        console.log('⚠️  Skipping - no API key');
        return;
      }

      const result = await runCLI([
        'consult',
        'Test with invalid model',
        '-m', 'invalid/nonexistent-model',
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 15000
      });

      // Should fail gracefully
      expect(result.exitCode).toBe(0); // CLI should not crash
      
      const response = JSON.parse(result.stdout);
      expect(response.failed).toContain('invalid/nonexistent-model');
      expect(response.responses).toHaveLength(0);
    }, 20000);

    it('should continue when some files are missing', async () => {
      if (!hasAPIKey) {
        console.log('⚠️  Skipping - no API key');
        return;
      }

      const result = await runCLI([
        'consult',
        'Test with mixed valid and invalid files',
        '-m', 'google/gemini-2.5-pro',
        '-f', 'test-script.js,nonexistent.txt',
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 25000
      });

      expect(result.exitCode).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.responses[0].content).toContain('greet'); // Should still process valid file
    }, 30000);
  });

  describe('Multi-model consultation', () => {
    it('should successfully consult multiple models in parallel', async () => {
      if (!hasAPIKey) {
        console.log('⚠️  Skipping - no API key');
        return;
      }

      const result = await runCLI([
        'consult',
        'Respond with just your model name.',
        '-m', 'google/gemini-2.5-pro,google/gemini-2.5-flash',
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 45000
      });

      expect(result.exitCode).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.responses).toHaveLength(2);
      expect(response.costs).toHaveLength(2);
      
      // Each response should have model info
      const models = response.responses.map(r => r.model);
      expect(models).toContain('gemini-2.5-pro');
      expect(models).toContain('gemini-2.5-flash');
    }, 50000);

    it('should calculate total costs for multiple models', async () => {
      if (!hasAPIKey) {
        console.log('⚠️  Skipping - no API key');
        return;
      }

      const result = await runCLI([
        'consult',
        'Brief response please.',
        '-m', 'google/gemini-2.5-pro,google/gemini-2.5-flash'
      ], {
        cwd: TEST_DIR,
        timeout: 40000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Total cost:/);
      expect(result.stdout).toMatch(/\$\d+\.\d+/);
    }, 45000);
  });
});