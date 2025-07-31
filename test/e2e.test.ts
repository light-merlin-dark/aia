import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

const TEST_DIR = join(process.cwd(), 'test', 'fixtures');
const CLI_PATH = join(process.cwd(), 'src', 'index.ts');

describe('End-to-End CLI Tests', () => {
  beforeEach(async () => {
    // Create test directory and files
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    
    // Create sample files for testing
    writeFileSync(join(TEST_DIR, 'sample.js'), `
// Sample JavaScript file for testing
function hello(name) {
  return \`Hello, \${name}!\`;
}

module.exports = { hello };
    `.trim());
    
    writeFileSync(join(TEST_DIR, 'data.json'), JSON.stringify({
      name: "test-project",
      version: "1.0.0",
      description: "A test project for AIA CLI"
    }, null, 2));
    
    writeFileSync(join(TEST_DIR, 'README.md'), `
# Test Project

This is a sample project for testing the AIA CLI file attachment functionality.

## Features
- File reading
- JSON parsing
- Code analysis
    `.trim());
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  async function runCLI(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    return new Promise((resolve, reject) => {
      const child = spawn('bun', [CLI_PATH, ...args], {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
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

      // Timeout after 30 seconds
      setTimeout(() => {
        child.kill();
        reject(new Error('CLI test timed out'));
      }, 30000);
    });
  }

  describe('Mock Service Integration', () => {
    it('should handle file attachments with mock service', async () => {
      // Mock the plugin registry to return a test plugin
      const mockPlugin = {
        name: 'mock-service',
        listModels: () => ['mock-model'],
        execute: mock(async (options: any) => ({
          content: `Mock response analyzing ${options.files?.length || 0} files: ${options.prompt}`,
          usage: {
            inputTokens: 100,
            outputTokens: 50
          }
        }))
      };

      // Create a temporary config that uses our mock service
      const configDir = join(TEST_DIR, '.aia');
      mkdirSync(configDir, { recursive: true });
      
      // We'll simulate this by setting up environment to skip real API calls
      const result = await runCLI([
        'consult',
        'Analyze this code and tell me what it does',
        '-m', 'mock-service/mock-model',
        '-f', 'sample.js,data.json',
        '--json'
      ], {
        cwd: TEST_DIR,
        env: {
          AIA_TEST_MODE: 'true',
          AIA_SKIP_SETUP: 'true'
        }
      });

      // In test mode, we expect the CLI to show file processing
      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('File Path Resolution', () => {
    it('should resolve relative paths from calling directory correctly', async () => {
      // Create subdirectory to test relative path resolution
      const subDir = join(TEST_DIR, 'subproject');
      mkdirSync(subDir, { recursive: true });
      
      writeFileSync(join(subDir, 'local.ts'), `
export const config = {
  env: 'test',
  debug: true
};
      `.trim());

      const result = await runCLI([
        'consult',
        'What does this configuration do?',
        '-m', 'mock-service/mock-model',
        '-f', '../sample.js,local.ts,../data.json',
        '--verbose'
      ], {
        cwd: subDir,
        env: {
          AIA_TEST_MODE: 'true',
          AIA_SKIP_SETUP: 'true'
        }
      });

      // Should not error on file resolution
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('File not found');
    }, 30000);

    it('should handle absolute paths correctly', async () => {
      const absolutePath = join(TEST_DIR, 'sample.js');
      
      const result = await runCLI([
        'consult',
        'Explain this JavaScript code',
        '-m', 'mock-service/mock-model',
        '-f', absolutePath,
        '--verbose'
      ], {
        cwd: '/tmp', // Run from different directory
        env: {
          AIA_TEST_MODE: 'true',
          AIA_SKIP_SETUP: 'true'
        }
      });

      expect(result.exitCode).toBe(0);
    }, 30000);

    it('should handle glob patterns for multiple files', async () => {
      // Create additional test files
      writeFileSync(join(TEST_DIR, 'helper.js'), 'module.exports = { helper: true };');
      writeFileSync(join(TEST_DIR, 'utils.js'), 'module.exports = { utils: true };');
      
      const result = await runCLI([
        'consult',
        'Analyze all JavaScript files',
        '-m', 'mock-service/mock-model',
        '-f', '*.js',
        '--verbose'
      ], {
        cwd: TEST_DIR,
        env: {
          AIA_TEST_MODE: 'true',
          AIA_SKIP_SETUP: 'true'
        }
      });

      expect(result.exitCode).toBe(0);
      // Should process multiple .js files
      expect(result.stdout).toContain('.js');
    }, 30000);
  });

  describe('Command Structure and Args', () => {
    it('should show help when no arguments provided', async () => {
      const result = await runCLI(['consult'], {
        env: { AIA_SKIP_SETUP: 'true' }
      });

      // Should show error about missing models or help
      expect(result.exitCode).toBe(1);
      expect(result.stderr.length).toBeGreaterThan(0);
    }, 10000);

    it('should handle stdin prompt input', async () => {
      const child = spawn('bun', [CLI_PATH, 'consult', '-m', 'mock-service/mock-model'], {
        cwd: TEST_DIR,
        env: { 
          ...process.env, 
          AIA_TEST_MODE: 'true',
          AIA_SKIP_SETUP: 'true'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Send prompt via stdin
      child.stdin?.write('Analyze this input from stdin');
      child.stdin?.end();

      const result = await new Promise<{stdout: string, stderr: string, exitCode: number}>((resolve) => {
        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          resolve({ stdout, stderr, exitCode: code || 0 });
        });

        setTimeout(() => {
          child.kill();
          resolve({ stdout: '', stderr: 'timeout', exitCode: 1 });
        }, 10000);
      });

      expect(result.exitCode).toBe(0);
    }, 15000);
  });

  describe('Output Formats', () => {
    it('should output structured JSON when --json flag is used', async () => {
      const result = await runCLI([
        'consult',
        'Simple test prompt',
        '-m', 'mock-service/mock-model',
        '-f', 'sample.js',
        '--json'
      ], {
        cwd: TEST_DIR,
        env: {
          AIA_TEST_MODE: 'true',
          AIA_SKIP_SETUP: 'true'
        }
      });

      expect(result.exitCode).toBe(0);
      
      // Should be valid JSON
      expect(() => {
        const parsed = JSON.parse(result.stdout);
        expect(parsed).toHaveProperty('responses');
        expect(parsed).toHaveProperty('costs');
        expect(parsed).toHaveProperty('failed');
      }).not.toThrow();
    }, 20000);

    it('should show verbose output with --verbose flag', async () => {
      const result = await runCLI([
        'consult',
        'Test verbose output',
        '-m', 'mock-service/mock-model',
        '-f', 'sample.js',
        '--verbose'
      ], {
        cwd: TEST_DIR,
        env: {
          AIA_TEST_MODE: 'true',
          AIA_SKIP_SETUP: 'true'
        }
      });

      expect(result.exitCode).toBe(0);
      // Verbose should show additional information
      expect(result.stdout.length).toBeGreaterThan(50);
    }, 20000);
  });

  describe('Error Handling', () => {
    it('should handle non-existent files gracefully', async () => {
      const result = await runCLI([
        'consult',
        'Test with missing file',
        '-m', 'mock-service/mock-model',
        '-f', 'nonexistent.txt'
      ], {
        cwd: TEST_DIR,
        env: {
          AIA_TEST_MODE: 'true',
          AIA_SKIP_SETUP: 'true'
        }
      });

      // Should continue processing even with missing files
      expect(result.exitCode).toBe(0);
    }, 15000);

    it('should handle directories instead of files', async () => {
      mkdirSync(join(TEST_DIR, 'testdir'));
      
      const result = await runCLI([
        'consult',
        'Test with directory',
        '-m', 'mock-service/mock-model',
        '-f', 'testdir'
      ], {
        cwd: TEST_DIR,
        env: {
          AIA_TEST_MODE: 'true',
          AIA_SKIP_SETUP: 'true'
        }
      });

      // Should handle directory error gracefully
      expect(result.exitCode).toBe(0);
    }, 15000);
  });
});