import { describe, it, expect } from 'vitest';
import { buildPrompt, estimateTokenCount, truncatePrompt } from '../../src/core/prompt-builder';
import type { FileContent } from '../../src/services/file-resolver';

describe('buildPrompt', () => {
  it('should return user prompt when no files provided', () => {
    const result = buildPrompt('Test prompt', []);
    expect(result).toBe('Test prompt');
  });
  
  it('should return user prompt when files array is null', () => {
    const result = buildPrompt('Test prompt', null as any);
    expect(result).toBe('Test prompt');
  });
  
  it('should append file contents with proper formatting', () => {
    const files: FileContent[] = [
      {
        path: '/path/to/file.js',
        originalPath: 'file.js',
        content: 'console.log("Hello");',
        size: 21
      }
    ];
    
    const result = buildPrompt('Analyze this code', files);
    
    expect(result).toContain('Analyze this code');
    expect(result).toContain('---');
    expect(result).toContain('The following files have been provided for context:');
    expect(result).toContain('### File: file.js');
    expect(result).toContain('```javascript');
    expect(result).toContain('console.log("Hello");');
    expect(result).toContain('```');
  });
  
  it('should handle multiple files', () => {
    const files: FileContent[] = [
      {
        path: '/path/to/app.ts',
        originalPath: 'app.ts',
        content: 'const app = express();',
        size: 22
      },
      {
        path: '/path/to/index.html',
        originalPath: 'index.html', 
        content: '<h1>Hello</h1>',
        size: 14
      }
    ];
    
    const result = buildPrompt('Review these files', files);
    
    expect(result).toContain('### File: app.ts');
    expect(result).toContain('```typescript');
    expect(result).toContain('const app = express();');
    expect(result).toContain('### File: index.html');
    expect(result).toContain('```html');
    expect(result).toContain('<h1>Hello</h1>');
  });
  
  it('should handle file read errors', () => {
    const files: FileContent[] = [
      {
        path: '/path/to/good.js',
        originalPath: 'good.js',
        content: 'console.log("OK");',
        size: 18
      },
      {
        path: '/path/to/bad.js',
        originalPath: 'bad.js',
        error: 'Permission denied',
        size: 0
      }
    ];
    
    const result = buildPrompt('Check files', files);
    
    expect(result).toContain('### File: good.js');
    expect(result).toContain('console.log("OK");');
    expect(result).toContain('The following files could not be read:');
    expect(result).toContain('- bad.js: Permission denied');
  });
  
  it('should skip files with no content and no error', () => {
    const files: FileContent[] = [
      {
        path: '/path/to/empty.js',
        originalPath: 'empty.js',
        content: '',
        size: 0
      },
      {
        path: '/path/to/valid.js',
        originalPath: 'valid.js',
        content: 'const x = 1;',
        size: 12
      }
    ];
    
    const result = buildPrompt('Test', files);
    
    expect(result).not.toContain('empty.js');
    expect(result).toContain('valid.js');
  });
  
  it('should handle only error files', () => {
    const files: FileContent[] = [
      {
        path: '/path/to/error1.js',
        originalPath: 'error1.js',
        error: 'File not found',
        size: 0
      },
      {
        path: '/path/to/error2.py',
        originalPath: 'error2.py',
        error: 'Access denied',
        size: 0
      }
    ];
    
    const result = buildPrompt('Analyze', files);
    
    expect(result).not.toContain('The following files have been provided for context');
    expect(result).toContain('The following files could not be read:');
    expect(result).toContain('- error1.js: File not found');
    expect(result).toContain('- error2.py: Access denied');
  });
  
  it('should detect correct language from file extensions', () => {
    const testCases = [
      { ext: 'js', lang: 'javascript' },
      { ext: 'ts', lang: 'typescript' },
      { ext: 'py', lang: 'python' },
      { ext: 'go', lang: 'go' },
      { ext: 'rs', lang: 'rust' },
      { ext: 'java', lang: 'java' },
      { ext: 'cpp', lang: 'cpp' },
      { ext: 'rb', lang: 'ruby' },
      { ext: 'php', lang: 'php' },
      { ext: 'sql', lang: 'sql' },
      { ext: 'md', lang: 'markdown' },
      { ext: 'json', lang: 'json' },
      { ext: 'yaml', lang: 'yaml' },
      { ext: 'sh', lang: 'bash' },
      { ext: 'dockerfile', lang: 'dockerfile' }
    ];
    
    for (const { ext, lang } of testCases) {
      const files: FileContent[] = [{
        path: `/test/file.${ext}`,
        originalPath: `file.${ext}`,
        content: 'test content',
        size: 12
      }];
      
      const result = buildPrompt('Test', files);
      expect(result).toContain(`\`\`\`${lang}`);
    }
  });
  
  it('should handle files without extension', () => {
    const files: FileContent[] = [
      {
        path: '/path/to/README',
        originalPath: 'README',
        content: 'This is readme',
        size: 14
      }
    ];
    
    const result = buildPrompt('Test', files);
    expect(result).toContain('```text');
  });
  
  it('should handle unknown extensions', () => {
    const files: FileContent[] = [
      {
        path: '/path/to/file.xyz',
        originalPath: 'file.xyz',
        content: 'Unknown format',
        size: 14
      }
    ];
    
    const result = buildPrompt('Test', files);
    expect(result).toContain('```xyz');
  });
  
  it('should preserve original paths in output', () => {
    const files: FileContent[] = [
      {
        path: '/absolute/path/to/src/index.js',
        originalPath: './src/index.js',
        content: 'export default {};',
        size: 18
      }
    ];
    
    const result = buildPrompt('Review', files);
    expect(result).toContain('### File: ./src/index.js');
    expect(result).not.toContain('/absolute/path/to/src/index.js');
  });
});

describe('estimateTokenCount', () => {
  it('should estimate tokens based on character count', () => {
    expect(estimateTokenCount('test')).toBe(1); // 4 chars = 1 token
    expect(estimateTokenCount('hello world')).toBe(3); // 11 chars = 3 tokens
    expect(estimateTokenCount('a'.repeat(100))).toBe(25); // 100 chars = 25 tokens
  });
  
  it('should round up token count', () => {
    expect(estimateTokenCount('12345')).toBe(2); // 5 chars = 2 tokens (rounded up)
  });
  
  it('should handle empty string', () => {
    expect(estimateTokenCount('')).toBe(0);
  });
  
  it('should handle unicode and special characters', () => {
    const text = '🚀 Hello 世界！';
    const tokens = estimateTokenCount(text);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('truncatePrompt', () => {
  it('should not truncate if within token limit', () => {
    const prompt = 'This is a short prompt';
    const result = truncatePrompt(prompt, 100);
    expect(result).toBe(prompt);
  });
  
  it('should truncate long prompts', () => {
    const prompt = 'a'.repeat(1000);
    const result = truncatePrompt(prompt, 100);
    
    expect(result.length).toBeLessThan(prompt.length);
    expect(result).toContain('[Content truncated due to length limits]');
  });
  
  it('should leave room for truncation message', () => {
    const prompt = 'x'.repeat(500);
    const result = truncatePrompt(prompt, 100);
    
    // Should truncate to approximately 400 chars (100 tokens * 4) minus buffer
    expect(result.length).toBeLessThan(450);
    expect(result.length).toBeGreaterThan(250);
    expect(result.endsWith('[Content truncated due to length limits]')).toBe(true);
  });
  
  it('should handle edge case of very small token limit', () => {
    const prompt = 'This is a test prompt that is longer than the limit';
    const result = truncatePrompt(prompt, 5);
    
    expect(result).toContain('[Content truncated due to length limits]');
  });
  
  it('should preserve prompt structure when truncating', () => {
    const prompt = `User query: What is the weather?
    
File contents:
${'x'.repeat(1000)}`;
    
    const result = truncatePrompt(prompt, 50);
    
    expect(result).toContain('User query: What is the weather?');
    expect(result).toContain('[Content truncated due to length limits]');
  });
});