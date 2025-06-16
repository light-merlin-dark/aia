import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileResolver } from '../../src/services/file-resolver';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { FileContent, FileResolutionContext } from '../../src/services/file-resolver';

// Mock modules
vi.mock('fs');
vi.mock('glob');

describe('FileResolver', () => {
  const mockWorkingDir = '/test/project';
  const mockFileContent = 'console.log("Hello, world!");';
  const mockFileStats = {
    isDirectory: vi.fn().mockReturnValue(false),
    size: 100
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset environment variables
    delete process.env.MCP_WORKING_DIRECTORY;
    delete process.env.PWD;
    
    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue(mockWorkingDir);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('detectWorkingDirectory', () => {
    it('should prefer MCP_WORKING_DIRECTORY environment variable', () => {
      process.env.MCP_WORKING_DIRECTORY = '/mcp/dir';
      process.env.PWD = '/pwd/dir';
      
      const result = FileResolver.detectWorkingDirectory();
      
      expect(result).toBe('/mcp/dir');
    });
    
    it('should use PWD if MCP_WORKING_DIRECTORY not set', () => {
      process.env.PWD = '/pwd/dir';
      
      const result = FileResolver.detectWorkingDirectory();
      
      expect(result).toBe('/pwd/dir');
    });
    
    it('should fall back to process.cwd()', () => {
      const result = FileResolver.detectWorkingDirectory();
      
      expect(result).toBe(mockWorkingDir);
    });
  });
  
  describe('resolveFiles', () => {
    it('should resolve single file successfully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue(mockFileStats as any);
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
      
      const result = await FileResolver.resolveFiles(['test.js']);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: path.resolve(mockWorkingDir, 'test.js'),
        originalPath: 'test.js',
        content: mockFileContent,
        size: 100
      });
    });
    
    it('should handle absolute paths', async () => {
      const absolutePath = '/absolute/path/test.js';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue(mockFileStats as any);
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
      
      const result = await FileResolver.resolveFiles([absolutePath]);
      
      expect(result[0].path).toBe(absolutePath);
      expect(result[0].originalPath).toBe(absolutePath);
    });
    
    it('should handle multiple files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue(mockFileStats as any);
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('file1')) return 'content1';
        if (path.toString().includes('file2')) return 'content2';
        return '';
      });
      
      const result = await FileResolver.resolveFiles(['file1.js', 'file2.js']);
      
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('content1');
      expect(result[1].content).toBe('content2');
    });
    
    it('should handle glob patterns', async () => {
      vi.mocked(glob).mockResolvedValue([
        '/test/project/src/file1.js',
        '/test/project/src/file2.js'
      ]);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue(mockFileStats as any);
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
      
      const result = await FileResolver.resolveFiles(['src/*.js']);
      
      expect(result).toHaveLength(2);
      expect(glob).toHaveBeenCalledWith(
        path.join(mockWorkingDir, 'src/*.js'),
        { nodir: true, absolute: true }
      );
    });
    
    it('should handle file not found error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = await FileResolver.resolveFiles(['missing.js']);
      
      expect(result[0].error).toContain('File not found: missing.js');
      expect(result[0].content).toBe('');
      expect(result[0].size).toBe(0);
    });
    
    it('should try alternative paths when file not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path.toString().includes('/test/project/src/component.js');
      });
      vi.mocked(fs.statSync).mockReturnValue(mockFileStats as any);
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
      
      const result = await FileResolver.resolveFiles(['component.js']);
      
      expect(result[0].error).toBeUndefined();
      expect(result[0].path).toContain('src/component.js');
    });
    
    it('should try adding extensions when file not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path.toString().endsWith('index.ts');
      });
      vi.mocked(fs.statSync).mockReturnValue(mockFileStats as any);
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
      
      const result = await FileResolver.resolveFiles(['index']);
      
      expect(result[0].error).toBeUndefined();
      expect(result[0].path.endsWith('index.ts')).toBe(true);
    });
    
    it('should handle directory paths', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: vi.fn().mockReturnValue(true),
        size: 0
      } as any);
      
      const result = await FileResolver.resolveFiles(['src']);
      
      expect(result[0].error).toContain('Path is a directory: src');
    });
    
    it('should handle files exceeding size limit', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: vi.fn().mockReturnValue(false),
        size: 200 * 1024 // 200KB
      } as any);
      
      const result = await FileResolver.resolveFiles(['large.js'], {
        maxFileSize: 100 * 1024 // 100KB limit
      });
      
      expect(result[0].error).toContain('File too large: 204800 bytes');
      expect(result[0].error).toContain('max: 102400 bytes');
    });
    
    it('should handle read errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue(mockFileStats as any);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      const result = await FileResolver.resolveFiles(['protected.js']);
      
      expect(result[0].error).toContain('Failed to read file: Permission denied');
    });
    
    it('should use custom context options', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue(mockFileStats as any);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('binary content'));
      
      const context: Partial<FileResolutionContext> = {
        workingDirectory: '/custom/dir',
        maxFileSize: 50 * 1024,
        encoding: 'base64'
      };
      
      await FileResolver.resolveFiles(['test.bin'], context);
      
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('/custom/dir'),
        'base64'
      );
    });
    
    it('should handle empty glob results', async () => {
      vi.mocked(glob).mockResolvedValue([]);
      
      const result = await FileResolver.resolveFiles(['src/*.xyz']);
      
      expect(result[0].error).toContain('No files matched pattern: src/*.xyz');
    });
    
    it('should handle glob errors', async () => {
      // The FileResolver checks for glob patterns using * or ?
      vi.mocked(glob).mockRejectedValue(new Error('Invalid pattern'));
      
      const result = await FileResolver.resolveFiles(['src/*[invalid']);
      
      expect(result[0].error).toContain('Glob pattern error: Invalid pattern');
    });
  });
  
  describe('formatFilesForPrompt', () => {
    it('should format successful file reads', () => {
      const files: FileContent[] = [
        {
          path: '/test/file.js',
          originalPath: 'file.js',
          content: 'const x = 1;',
          size: 12
        },
        {
          path: '/test/style.css',
          originalPath: 'style.css',
          content: 'body { color: red; }',
          size: 20
        }
      ];
      
      const result = FileResolver.formatFilesForPrompt(files);
      
      expect(result).toContain('### File: file.js');
      expect(result).toContain('```js');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('### File: style.css');
      expect(result).toContain('```css');
      expect(result).toContain('body { color: red; }');
    });
    
    it('should format file errors', () => {
      const files: FileContent[] = [
        {
          path: '/test/missing.js',
          originalPath: 'missing.js',
          content: '',
          size: 0,
          error: 'File not found'
        }
      ];
      
      const result = FileResolver.formatFilesForPrompt(files);
      
      expect(result).toContain('### File: missing.js');
      expect(result).toContain('Error: File not found');
      expect(result).not.toContain('```');
    });
    
    it('should handle files without extensions', () => {
      const files: FileContent[] = [
        {
          path: '/test/README',
          originalPath: 'README',
          content: 'Read me',
          size: 7
        }
      ];
      
      const result = FileResolver.formatFilesForPrompt(files);
      
      // The path.split('.').pop() on '/test/README' returns '/test/README' as there's no dot
      expect(result).toContain('### File: README');
      expect(result).toContain('```/test/README');
      expect(result).toContain('Read me');
    });
    
    it('should handle mixed success and error files', () => {
      const files: FileContent[] = [
        {
          path: '/test/good.js',
          originalPath: 'good.js',
          content: 'console.log("ok");',
          size: 18
        },
        {
          path: '/test/bad.js',
          originalPath: 'bad.js',
          content: '',
          size: 0,
          error: 'Permission denied'
        }
      ];
      
      const result = FileResolver.formatFilesForPrompt(files);
      
      expect(result).toContain('### File: good.js');
      expect(result).toContain('```js');
      expect(result).toContain('console.log("ok");');
      expect(result).toContain('### File: bad.js');
      expect(result).toContain('Error: Permission denied');
    });
  });
});