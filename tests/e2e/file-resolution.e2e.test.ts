import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FileResolver } from '../../src/services/file-resolver';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';

// Test the complete file resolution workflow
describe('File Resolution E2E Tests', () => {
  let testDir: string;
  let fileResolver: typeof FileResolver;

  beforeEach(async () => {
    // Create unique test directory
    testDir = join(tmpdir(), `file-test-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });

    // Create test file structure
    const srcDir = join(testDir, 'src');
    const testsDir = join(testDir, 'tests');
    const docsDir = join(testDir, 'docs');
    
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(testsDir, { recursive: true });
    mkdirSync(docsDir, { recursive: true });

    // Create test files
    writeFileSync(join(srcDir, 'index.js'), 'console.log("Hello World");');
    writeFileSync(join(srcDir, 'utils.ts'), 'export function add(a: number, b: number) { return a + b; }');
    writeFileSync(join(srcDir, 'app.tsx'), 'import React from "react"; export default function App() { return <div>Hello</div>; }');
    writeFileSync(join(testsDir, 'index.test.js'), 'describe("test", () => { it("works", () => expect(true).toBe(true)); });');
    writeFileSync(join(testsDir, 'utils.test.ts'), 'import { add } from "../src/utils"; test("add function", () => { expect(add(2, 3)).toBe(5); });');
    writeFileSync(join(docsDir, 'README.md'), '# Test Project\n\nThis is a test project.');
    writeFileSync(join(testDir, 'package.json'), '{"name": "test-project", "version": "1.0.0"}');
    writeFileSync(join(testDir, '.gitignore'), 'node_modules/\n*.log');

    fileResolver = FileResolver;
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should resolve single file paths', async () => {
    const filePath = join(testDir, 'src/index.js');
    const result = await fileResolver.resolveFiles([filePath], { workingDirectory: testDir });

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(filePath);
    expect(result[0].content).toContain('Hello World');
    expect(result[0].error).toBeUndefined();
    expect(result[0].size).toBeGreaterThan(0);
  });

  it('should resolve multiple specific files', async () => {
    const filePaths = [
      join(testDir, 'src/index.js'),
      join(testDir, 'src/utils.ts'),
      join(testDir, 'package.json')
    ];
    
    const result = await fileResolver.resolveFiles(filePaths, { workingDirectory: testDir });

    expect(result).toHaveLength(3);
    
    const indexFile = result.find(f => f.path.endsWith('index.js'));
    expect(indexFile?.content).toContain('Hello World');
    
    const utilsFile = result.find(f => f.path.endsWith('utils.ts'));
    expect(utilsFile?.content).toContain('function add');
    
    const packageFile = result.find(f => f.path.endsWith('package.json'));
    expect(packageFile?.content).toContain('test-project');
  });

  it('should resolve glob patterns', async () => {
    const pattern = join(testDir, 'src/**/*.{js,ts}');
    const result = await fileResolver.resolveFiles([pattern], { workingDirectory: testDir });

    expect(result.length).toBeGreaterThanOrEqual(2);
    
    const filePaths = result.map(f => f.path);
    expect(filePaths.some(p => p.endsWith('index.js'))).toBe(true);
    expect(filePaths.some(p => p.endsWith('utils.ts'))).toBe(true);
    
    // Should not include tsx files
    expect(filePaths.some(p => p.endsWith('app.tsx'))).toBe(false);
  });

  it('should resolve complex glob patterns', async () => {
    // Test pattern that includes multiple directories and extensions
    const pattern = join(testDir, '**/*.{js,ts,tsx,md}');
    const result = await fileResolver.resolveFiles([pattern], { workingDirectory: testDir });

    expect(result.length).toBeGreaterThanOrEqual(5);
    
    const extensions = result.map(f => f.path.split('.').pop());
    expect(extensions).toContain('js');
    expect(extensions).toContain('ts');
    expect(extensions).toContain('tsx');
    expect(extensions).toContain('md');
  });

  it('should handle relative paths', async () => {
    // Test with relative paths from working directory
    const result = await fileResolver.resolveFiles(['src/index.js', 'tests/*.test.js'], { 
      workingDirectory: testDir 
    });

    expect(result.length).toBeGreaterThanOrEqual(2);
    
    const indexFile = result.find(f => f.path.endsWith('src/index.js'));
    expect(indexFile?.content).toContain('Hello World');
    
    const testFiles = result.filter(f => f.path.includes('test.js'));
    expect(testFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle file not found errors', async () => {
    const nonExistentFile = join(testDir, 'does-not-exist.js');
    const result = await fileResolver.resolveFiles([nonExistentFile], { workingDirectory: testDir });

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(nonExistentFile);
    expect(result[0].error).toBeTruthy();
    expect(result[0].content).toBe("");
  });

  it('should handle mixed existing and non-existing files', async () => {
    const filePaths = [
      join(testDir, 'src/index.js'),
      join(testDir, 'does-not-exist.js'),
      join(testDir, 'package.json')
    ];
    
    const result = await fileResolver.resolveFiles(filePaths, { workingDirectory: testDir });

    expect(result).toHaveLength(3);
    
    const successfulFiles = result.filter(f => !f.error);
    const failedFiles = result.filter(f => f.error);
    
    expect(successfulFiles).toHaveLength(2);
    expect(failedFiles).toHaveLength(1);
    
    expect(failedFiles[0].path).toContain('does-not-exist.js');
  });

  it('should format files for prompt correctly', async () => {
    const filePaths = [
      join(testDir, 'src/index.js'),
      join(testDir, 'src/utils.ts')
    ];
    
    const resolvedFiles = await fileResolver.resolveFiles(filePaths, { workingDirectory: testDir });
    const formatted = fileResolver.formatFilesForPrompt(resolvedFiles);

    expect(typeof formatted).toBe('string');
    expect(formatted).toContain('index.js');
    expect(formatted).toContain('utils.ts');
    expect(formatted).toContain('Hello World');
    expect(formatted).toContain('function add');
    
    // Should include file path markers  
    expect(formatted).toContain('###');
  });

  it('should handle file size limits', async () => {
    // Create a large file
    const largeContent = 'x'.repeat(100000); // 100KB
    const largeFile = join(testDir, 'large.txt');
    writeFileSync(largeFile, largeContent);

    const result = await fileResolver.resolveFiles([largeFile], { 
      workingDirectory: testDir,
      maxFileSize: 50000 // 50KB limit
    });

    expect(result).toHaveLength(1);
    expect(result[0].error).toBeTruthy();
    expect(result[0].error).toContain('File too large');
  });

  it('should detect working directory correctly', () => {
    // Test working directory detection
    const detectedDir = fileResolver.detectWorkingDirectory();
    
    expect(typeof detectedDir).toBe('string');
    expect(detectedDir.length).toBeGreaterThan(0);
    expect(detectedDir).not.toContain('undefined');
  });

  it('should handle directory paths', async () => {
    const result = await fileResolver.resolveFiles([join(testDir, 'src')], { 
      workingDirectory: testDir 
    });

    // Should resolve to files within the directory
    expect(result.length).toBeGreaterThan(0);
    
    const filePaths = result.map(f => f.path);
    expect(filePaths.some(p => p.includes('src') || p.includes('.js') || p.includes('.ts'))).toBe(true);
  });

  it('should handle empty glob results', async () => {
    const pattern = join(testDir, 'nonexistent/**/*.xyz');
    const result = await fileResolver.resolveFiles([pattern], { workingDirectory: testDir });

    // Should return array (may contain error entry for invalid patterns)
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle special characters in filenames', async () => {
    // Create files with special characters
    const specialFiles = [
      'file with spaces.js',
      'file-with-dashes.ts',
      'file_with_underscores.md',
      'file.with.dots.txt'
    ];

    specialFiles.forEach(filename => {
      writeFileSync(join(testDir, filename), `// Content of ${filename}`);
    });

    const result = await fileResolver.resolveFiles(
      specialFiles.map(f => join(testDir, f)), 
      { workingDirectory: testDir }
    );

    expect(result).toHaveLength(4);
    
    specialFiles.forEach(filename => {
      const file = result.find(f => f.path.endsWith(filename));
      expect(file).toBeTruthy();
      expect(file?.content).toContain(`Content of ${filename}`);
    });
  });

  it('should handle nested directory structures', async () => {
    // Create deeper nested structure
    const deepDir = join(testDir, 'src/components/ui/buttons');
    mkdirSync(deepDir, { recursive: true });
    
    writeFileSync(join(deepDir, 'Button.tsx'), 'export function Button() { return <button>Click me</button>; }');
    writeFileSync(join(deepDir, 'Button.test.tsx'), 'import { Button } from "./Button"; test("renders", () => {});');

    const pattern = join(testDir, 'src/**/*.tsx');
    const result = await fileResolver.resolveFiles([pattern], { workingDirectory: testDir });

    expect(result.length).toBeGreaterThanOrEqual(3); // app.tsx + Button.tsx + Button.test.tsx
    
    const buttonFiles = result.filter(f => f.path.includes('Button'));
    expect(buttonFiles).toHaveLength(2);
  });

  it('should preserve file metadata', async () => {
    const filePath = join(testDir, 'src/utils.ts');
    const result = await fileResolver.resolveFiles([filePath], { workingDirectory: testDir });

    expect(result).toHaveLength(1);
    const file = result[0];
    
    expect(file.path).toBe(filePath);
    expect(file.content).toBeTruthy();
    expect(file.size).toBeGreaterThan(0);
    expect(file.path.endsWith('.ts')).toBe(true);
    expect(file.error).toBeUndefined();
  });

  it('should handle concurrent file resolution', async () => {
    const filePaths = [
      join(testDir, 'src/index.js'),
      join(testDir, 'src/utils.ts'),
      join(testDir, 'tests/index.test.js'),
      join(testDir, 'docs/README.md'),
      join(testDir, 'package.json')
    ];

    // Resolve multiple files concurrently
    const results = await Promise.all([
      fileResolver.resolveFiles([filePaths[0]], { workingDirectory: testDir }),
      fileResolver.resolveFiles([filePaths[1]], { workingDirectory: testDir }),
      fileResolver.resolveFiles([filePaths[2]], { workingDirectory: testDir }),
      fileResolver.resolveFiles([filePaths[3]], { workingDirectory: testDir }),
      fileResolver.resolveFiles([filePaths[4]], { workingDirectory: testDir })
    ]);

    // All resolutions should succeed
    results.forEach(result => {
      expect(result).toHaveLength(1);
      expect(result[0].error).toBeUndefined();
      expect(result[0].content).toBeTruthy();
    });
  });
});