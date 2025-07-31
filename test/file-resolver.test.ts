import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { FileResolver } from '../src/services/file-resolver.js';

const TEST_DIR = join(process.cwd(), 'test', 'fixtures');

describe('FileResolver', () => {
  beforeEach(() => {
    // Create test directory and files
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    
    // Create test files
    writeFileSync(join(TEST_DIR, 'test1.txt'), 'Content of test1');
    writeFileSync(join(TEST_DIR, 'test2.js'), 'console.log("hello");');
    writeFileSync(join(TEST_DIR, 'config.json'), '{"name": "test"}');
    
    // Create subdirectory with files
    mkdirSync(join(TEST_DIR, 'src'));
    writeFileSync(join(TEST_DIR, 'src', 'index.ts'), 'export const hello = "world";');
    writeFileSync(join(TEST_DIR, 'src', 'utils.ts'), 'export const add = (a, b) => a + b;');
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('detectWorkingDirectory', () => {
    it('should return MCP_WORKING_DIRECTORY if set', () => {
      const originalEnv = process.env.MCP_WORKING_DIRECTORY;
      process.env.MCP_WORKING_DIRECTORY = '/custom/mcp/dir';
      
      const result = FileResolver.detectWorkingDirectory();
      expect(result).toBe('/custom/mcp/dir');
      
      // Restore
      if (originalEnv) {
        process.env.MCP_WORKING_DIRECTORY = originalEnv;
      } else {
        delete process.env.MCP_WORKING_DIRECTORY;
      }
    });

    it('should return PWD if MCP_WORKING_DIRECTORY is not set', () => {
      const originalMCP = process.env.MCP_WORKING_DIRECTORY;
      const originalPWD = process.env.PWD;
      
      delete process.env.MCP_WORKING_DIRECTORY;
      process.env.PWD = '/custom/pwd/dir';
      
      const result = FileResolver.detectWorkingDirectory();
      expect(result).toBe('/custom/pwd/dir');
      
      // Restore
      if (originalMCP) {
        process.env.MCP_WORKING_DIRECTORY = originalMCP;
      }
      if (originalPWD) {
        process.env.PWD = originalPWD;
      } else {
        delete process.env.PWD;
      }
    });

    it('should return process.cwd() as fallback', () => {
      const originalMCP = process.env.MCP_WORKING_DIRECTORY;
      const originalPWD = process.env.PWD;
      
      delete process.env.MCP_WORKING_DIRECTORY;
      delete process.env.PWD;
      
      const result = FileResolver.detectWorkingDirectory();
      expect(result).toBe(process.cwd());
      
      // Restore
      if (originalMCP) process.env.MCP_WORKING_DIRECTORY = originalMCP;
      if (originalPWD) process.env.PWD = originalPWD;
    });
  });

  describe('resolveFiles', () => {
    it('should resolve absolute file paths', async () => {
      const absolutePath = join(TEST_DIR, 'test1.txt');
      const result = await FileResolver.resolveFiles([absolutePath]);
      
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe(absolutePath);
      expect(result[0].content).toBe('Content of test1');
      expect(result[0].error).toBeUndefined();
    });

    it('should resolve relative file paths from working directory', async () => {
      const result = await FileResolver.resolveFiles(['test1.txt'], {
        workingDirectory: TEST_DIR
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe(resolve(TEST_DIR, 'test1.txt'));
      expect(result[0].content).toBe('Content of test1');
      expect(result[0].originalPath).toBe('test1.txt');
    });

    it('should resolve relative paths from calling directory (critical functionality)', async () => {
      // Simulate calling from a different directory with relative paths
      const callingDir = join(TEST_DIR, 'src');
      const result = await FileResolver.resolveFiles(['../test1.txt'], {
        workingDirectory: callingDir
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Content of test1');
      expect(result[0].error).toBeUndefined();
      expect(result[0].originalPath).toBe('../test1.txt');
    });

    it('should handle multiple relative files from different contexts', async () => {
      const result = await FileResolver.resolveFiles([
        'test1.txt',
        'src/index.ts',
        'config.json'
      ], {
        workingDirectory: TEST_DIR
      });
      
      expect(result).toHaveLength(3);
      
      // Check each file
      const test1 = result.find(r => r.originalPath === 'test1.txt');
      expect(test1?.content).toBe('Content of test1');
      
      const index = result.find(r => r.originalPath === 'src/index.ts');
      expect(index?.content).toBe('export const hello = "world";');
      
      const config = result.find(r => r.originalPath === 'config.json');
      expect(config?.content).toBe('{"name": "test"}');
    });

    it('should handle glob patterns', async () => {
      const result = await FileResolver.resolveFiles(['src/*.ts'], {
        workingDirectory: TEST_DIR
      });
      
      expect(result.length).toBeGreaterThanOrEqual(2);
      const hasIndex = result.some(r => r.content.includes('export const hello'));
      const hasUtils = result.some(r => r.content.includes('export const add'));
      expect(hasIndex).toBe(true);
      expect(hasUtils).toBe(true);
    });

    it('should return error for non-existent files', async () => {
      const result = await FileResolver.resolveFiles(['nonexistent.txt'], {
        workingDirectory: TEST_DIR
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('File not found');
      expect(result[0].content).toBe('');
    });

    it('should return error for directories', async () => {
      const result = await FileResolver.resolveFiles(['src'], {
        workingDirectory: TEST_DIR
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('Path is a directory');
    });

    it('should handle file size limits', async () => {
      const result = await FileResolver.resolveFiles(['test1.txt'], {
        workingDirectory: TEST_DIR,
        maxFileSize: 5 // Very small limit
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].error).toContain('File too large');
    });

    it('should try alternative paths when file not found directly', async () => {
      // Create a file in src directory
      writeFileSync(join(TEST_DIR, 'src', 'helper.ts'), 'export const helper = true;');
      
      // Try to find it without specifying src/
      const result = await FileResolver.resolveFiles(['helper.ts'], {
        workingDirectory: TEST_DIR
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('export const helper = true;');
      expect(result[0].error).toBeUndefined();
    });

    it('should add extensions when missing', async () => {
      // Try to find 'index' without extension in src/
      const result = await FileResolver.resolveFiles(['src/index'], {
        workingDirectory: TEST_DIR
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('export const hello = "world";');
      expect(result[0].error).toBeUndefined();
    });
  });

  describe('formatFilesForPrompt', () => {
    it('should format files with proper markdown syntax', async () => {
      const files = await FileResolver.resolveFiles(['test2.js', 'config.json'], {
        workingDirectory: TEST_DIR
      });
      
      const formatted = FileResolver.formatFilesForPrompt(files);
      
      expect(formatted).toContain('### File: test2.js');
      expect(formatted).toContain('```js');
      expect(formatted).toContain('console.log("hello");');
      expect(formatted).toContain('### File: config.json');
      expect(formatted).toContain('```json');
      expect(formatted).toContain('{"name": "test"}');
    });

    it('should format error files appropriately', async () => {
      const files = await FileResolver.resolveFiles(['nonexistent.txt'], {
        workingDirectory: TEST_DIR
      });
      
      const formatted = FileResolver.formatFilesForPrompt(files);
      
      expect(formatted).toContain('### File: nonexistent.txt');
      expect(formatted).toContain('Error: File not found');
      expect(formatted).not.toContain('```');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty file paths array', async () => {
      const result = await FileResolver.resolveFiles([]);
      expect(result).toHaveLength(0);
    });

    it('should handle mixed valid and invalid paths', async () => {
      const result = await FileResolver.resolveFiles([
        'test1.txt',
        'nonexistent.txt',
        'config.json'
      ], {
        workingDirectory: TEST_DIR
      });
      
      expect(result).toHaveLength(3);
      expect(result[0].error).toBeUndefined();
      expect(result[1].error).toContain('File not found');
      expect(result[2].error).toBeUndefined();
    });

    it('should handle special characters in file paths', async () => {
      const specialFile = join(TEST_DIR, 'file with spaces.txt');
      writeFileSync(specialFile, 'Special content');
      
      const result = await FileResolver.resolveFiles(['file with spaces.txt'], {
        workingDirectory: TEST_DIR
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Special content');
      expect(result[0].error).toBeUndefined();
    });
  });
});