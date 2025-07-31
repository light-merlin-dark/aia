import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const TEST_DIR = join(process.cwd(), 'test', 'post-release-fixtures');

/**
 * Post-Release Tests - Install the package globally and test the actual CLI
 * These tests verify that the published package works correctly when installed via npm
 */
describe('Post-Release Global Installation Tests', () => {
  const hasAPIKey = process.env.AIA_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  let wasGloballyInstalled = false;

  beforeAll(async () => {
    console.log('🔄 Setting up post-release test environment...');
    
    // Create test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    
    // Create test files
    writeFileSync(join(TEST_DIR, 'sample-component.tsx'), `
import React from 'react';

interface Props {
  name: string;
  age?: number;
}

export const UserCard: React.FC<Props> = ({ name, age }) => {
  return (
    <div className="user-card">
      <h2>{name}</h2>
      {age && <p>Age: {age}</p>}
    </div>
  );
};

export default UserCard;
    `.trim());

    writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({
      name: "test-project",
      version: "1.0.0",
      description: "Test project for AIA CLI post-release testing",
      scripts: {
        test: "echo 'Test script'"
      },
      dependencies: {
        react: "^18.0.0",
        "@types/react": "^18.0.0"
      }
    }, null, 2));

    writeFileSync(join(TEST_DIR, 'config.yml'), `
# Configuration file for testing
app:
  name: test-app
  version: 1.0.0
  debug: true

database:
  host: localhost
  port: 5432
  name: testdb

features:
  - authentication
  - logging
  - caching
    `.trim());

    try {
      // Install the package globally (assuming it's already published)
      console.log('📦 Installing @light-merlin-dark/aia globally...');
      const { stdout, stderr } = await execAsync('npm install -g @light-merlin-dark/aia');
      console.log('✅ Global installation successful');
      if (stderr) console.log('Install stderr:', stderr);
      wasGloballyInstalled = true;
    } catch (error) {
      console.log('⚠️  Global installation failed, will skip tests:', error);
      wasGloballyInstalled = false;
    }
  }, 120000); // 2 minute timeout for installation

  afterAll(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    // Optionally uninstall global package (commented out to avoid disruption)
    // if (wasGloballyInstalled) {
    //   try {
    //     await execAsync('npm uninstall -g @light-merlin-dark/aia');
    //     console.log('🗑️  Uninstalled global package');
    //   } catch (error) {
    //     console.log('⚠️  Failed to uninstall global package:', error);
    //   }
    // }
  });

  async function runGlobalCLI(args: string[], options: { cwd?: string; timeout?: number; input?: string } = {}): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    return new Promise((resolve, reject) => {
      const child = spawn('aia', args, {
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

      // Send input if provided
      if (options.input) {
        child.stdin?.write(options.input);
        child.stdin?.end();
      }

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });

      child.on('error', (error) => {
        // If command not found, likely not installed
        if (error.message.includes('ENOENT')) {
          resolve({
            stdout: '',
            stderr: 'Command not found: aia',
            exitCode: 127
          });
        } else {
          reject(error);
        }
      });

      const timeout = options.timeout || 60000;
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Global CLI test timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', () => {
        clearTimeout(timer);
      });
    });
  }

  describe('Global CLI Installation', () => {
    it('should have installed aia command globally', async () => {
      if (!wasGloballyInstalled) {
        console.log('⚠️  Skipping - global installation failed');
        return;
      }

      const result = await runGlobalCLI(['--help'], { timeout: 10000 });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('aia');
      expect(result.stdout).toContain('consult');
      expect(result.stdout).toMatch(/AI.*model/i);
    }, 15000);

    it('should show version information', async () => {
      if (!wasGloballyInstalled) {
        console.log('⚠️  Skipping - global installation failed');
        return;
      }

      const result = await runGlobalCLI(['--version'], { timeout: 5000 });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version number pattern
    }, 10000);
  });

  describe('Real-world Usage Scenarios', () => {
    it('should analyze a React component with file attachment', async () => {
      if (!wasGloballyInstalled || !hasAPIKey) {
        console.log('⚠️  Skipping - missing requirements');
        return;
      }

      const result = await runGlobalCLI([
        'consult',
        'Analyze this React component. What props does it accept and what does it render?',
        '-m', 'google/gemini-2.5-pro',
        '-f', 'sample-component.tsx',
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 30000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('Error');
      
      const response = JSON.parse(result.stdout);
      expect(response.responses[0].content).toMatch(/props|Props|interface/i);
      expect(response.responses[0].content).toMatch(/name|age/i);
      expect(response.responses[0].content).toMatch(/React|component/i);
    }, 35000);

    it('should handle multiple file types in real project structure', async () => {
      if (!wasGloballyInstalled || !hasAPIKey) {
        console.log('⚠️  Skipping - missing requirements');
        return;
      }

      const result = await runGlobalCLI([
        'consult',
        'I have a React component, package.json, and config file. Summarize the project structure.',
        '-m', 'google/gemini-2.5-pro',
        '-f', 'sample-component.tsx,package.json,config.yml',
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 40000
      });

      expect(result.exitCode).toBe(0);
      
      const response = JSON.parse(result.stdout);
      const content = response.responses[0].content.toLowerCase();
      
      // Should recognize different file types
      expect(content).toMatch(/react|component|tsx/);
      expect(content).toMatch(/package\.json|dependencies/);
      expect(content).toMatch(/config|yml|yaml/);
      expect(content).toMatch(/database|host|port/);
    }, 45000);

    it('should work with relative paths from subdirectories', async () => {
      if (!wasGloballyInstalled || !hasAPIKey) {
        console.log('⚠️  Skipping - missing requirements');
        return;
      }

      // Create subdirectory
      const subDir = join(TEST_DIR, 'src');
      mkdirSync(subDir, { recursive: true });

      const result = await runGlobalCLI([
        'consult',
        'What is in the parent directory package.json?',
        '-m', 'google/gemini-2.5-pro',
        '-f', '../package.json',
        '--json'
      ], {
        cwd: subDir,
        timeout: 25000
      });

      expect(result.exitCode).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.responses[0].content).toMatch(/test-project|dependencies|react/i);
    }, 30000);

    it('should handle cost calculation in production', async () => {
      if (!wasGloballyInstalled || !hasAPIKey) {
        console.log('⚠️  Skipping - missing requirements');
        return;
      }

      const result = await runGlobalCLI([
        'consult',
        'Quick cost test - just say "OK"',
        '-m', 'google/gemini-2.5-pro'
      ], {
        cwd: TEST_DIR,
        timeout: 20000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Cost:|Total cost:/);
      expect(result.stdout).toMatch(/\$\d+\.\d+/);
    }, 25000);
  });

  describe('Error Handling in Production', () => {
    it('should show helpful error for missing models', async () => {
      if (!wasGloballyInstalled) {
        console.log('⚠️  Skipping - global installation failed');
        return;
      }

      const result = await runGlobalCLI([
        'consult',
        'Test prompt'
        // No -m flag
      ], {
        cwd: TEST_DIR,
        timeout: 10000
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('models');
    }, 15000);

    it('should handle missing files gracefully', async () => {
      if (!wasGloballyInstalled || !hasAPIKey) {
        console.log('⚠️  Skipping - missing requirements');
        return;
      }

      const result = await runGlobalCLI([
        'consult',
        'Test with missing file',
        '-m', 'google/gemini-2.5-pro',
        '-f', 'nonexistent.txt',
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 20000
      });

      // Should not crash
      expect(result.exitCode).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.responses[0]).toHaveProperty('content');
    }, 25000);
  });

  describe('Configuration and Setup', () => {
    it('should run setup wizard if no config exists', async () => {
      if (!wasGloballyInstalled) {
        console.log('⚠️  Skipping - global installation failed');
        return;
      }

      // This test is tricky since we can't easily interact with the wizard
      // We'll just verify the command recognizes when setup is needed
      const result = await runGlobalCLI([
        'config-list'
      ], {
        timeout: 10000
      });

      // Should either show config or prompt for setup
      expect([0, 1]).toContain(result.exitCode);
    }, 15000);

    it('should handle environment variable configuration', async () => {
      if (!wasGloballyInstalled || !hasAPIKey) {
        console.log('⚠️  Skipping - missing requirements');
        return;
      }

      const result = await runGlobalCLI([
        'consult',
        'Environment test',
        '-m', 'google/gemini-2.5-pro',
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 25000
      });

      // Should work with environment variable
      expect(result.exitCode).toBe(0);
      
      const response = JSON.parse(result.stdout);
      expect(response.responses).toHaveLength(1);
    }, 30000);
  });

  describe('Performance and Reliability', () => {
    it('should complete simple consultation within reasonable time', async () => {
      if (!wasGloballyInstalled || !hasAPIKey) {
        console.log('⚠️  Skipping - missing requirements');
        return;
      }

      const startTime = Date.now();
      
      const result = await runGlobalCLI([
        'consult',
        'Say hello',
        '-m', 'google/gemini-2.5-flash', // Faster model
        '--json'
      ], {
        cwd: TEST_DIR,
        timeout: 15000
      });

      const duration = Date.now() - startTime;
      
      expect(result.exitCode).toBe(0);
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      
      const response = JSON.parse(result.stdout);
      expect(response.responses[0].content).toMatch(/hello/i);
    }, 20000);
  });
});