import { readFileSync, existsSync, statSync } from 'fs';
import { join, resolve, isAbsolute, dirname, basename } from 'path';
import { glob } from 'glob';

export interface FileContent {
  path: string;
  originalPath: string;
  content: string;
  size: number;
  error?: string;
}

export interface FileResolutionContext {
  workingDirectory: string;
  maxFileSize?: number; // bytes
  encoding?: BufferEncoding;
}

export class FileResolver {
  private static readonly DEFAULT_MAX_FILE_SIZE = 100 * 1024; // 100KB
  private static readonly DEFAULT_ENCODING: BufferEncoding = 'utf-8';
  
  /**
   * Detect the working directory from various sources
   */
  static detectWorkingDirectory(): string {
    // Priority order for detecting working directory:
    // 1. MCP_WORKING_DIRECTORY environment variable (if set by MCP host)
    if (process.env.MCP_WORKING_DIRECTORY) {
      return process.env.MCP_WORKING_DIRECTORY;
    }
    
    // 2. PWD environment variable (common in Unix-like systems)
    if (process.env.PWD) {
      return process.env.PWD;
    }
    
    // 3. Current working directory of the process
    return process.cwd();
  }
  
  /**
   * Resolve file paths and read their contents
   */
  static async resolveFiles(
    filePaths: string[],
    context?: Partial<FileResolutionContext>
  ): Promise<FileContent[]> {
    const ctx: FileResolutionContext = {
      workingDirectory: context?.workingDirectory || this.detectWorkingDirectory(),
      maxFileSize: context?.maxFileSize || this.DEFAULT_MAX_FILE_SIZE,
      encoding: context?.encoding || this.DEFAULT_ENCODING
    };
    
    const results: FileContent[] = [];
    
    for (const filePath of filePaths) {
      // Handle glob patterns
      if (filePath.includes('*') || filePath.includes('?')) {
        const globResults = await this.resolveGlobPattern(filePath, ctx);
        results.push(...globResults);
      } else {
        const result = await this.resolveSingleFile(filePath, ctx);
        results.push(result);
      }
    }
    
    return results;
  }
  
  /**
   * Resolve a single file path and read its content
   */
  private static async resolveSingleFile(
    filePath: string,
    context: FileResolutionContext
  ): Promise<FileContent> {
    const originalPath = filePath;
    let resolvedPath: string;
    
    // Resolve the path
    if (isAbsolute(filePath)) {
      resolvedPath = filePath;
    } else {
      resolvedPath = resolve(context.workingDirectory, filePath);
    }
    
    // Check if file exists
    if (!existsSync(resolvedPath)) {
      // Try some common variations
      const alternatives = this.generateAlternativePaths(filePath, context.workingDirectory);
      for (const alt of alternatives) {
        if (existsSync(alt)) {
          resolvedPath = alt;
          break;
        }
      }
      
      if (!existsSync(resolvedPath)) {
        return {
          path: resolvedPath,
          originalPath,
          content: '',
          size: 0,
          error: `File not found: ${originalPath}. Tried: ${resolvedPath}`
        };
      }
    }
    
    // Check if it's a file (not directory)
    const stats = statSync(resolvedPath);
    if (stats.isDirectory()) {
      return {
        path: resolvedPath,
        originalPath,
        content: '',
        size: 0,
        error: `Path is a directory: ${originalPath}`
      };
    }
    
    // Check file size
    if (stats.size > context.maxFileSize!) {
      return {
        path: resolvedPath,
        originalPath,
        content: '',
        size: stats.size,
        error: `File too large: ${stats.size} bytes (max: ${context.maxFileSize} bytes)`
      };
    }
    
    // Read file content
    try {
      const content = readFileSync(resolvedPath, context.encoding) as string;
      return {
        path: resolvedPath,
        originalPath,
        content,
        size: stats.size
      };
    } catch (error: any) {
      return {
        path: resolvedPath,
        originalPath,
        content: '',
        size: stats.size,
        error: `Failed to read file: ${error.message}`
      };
    }
  }
  
  /**
   * Resolve glob patterns
   */
  private static async resolveGlobPattern(
    pattern: string,
    context: FileResolutionContext
  ): Promise<FileContent[]> {
    const results: FileContent[] = [];
    
    try {
      // Resolve pattern relative to working directory
      const basePattern = isAbsolute(pattern) 
        ? pattern 
        : join(context.workingDirectory, pattern);
      
      const files = await glob(basePattern, {
        nodir: true,
        absolute: true
      });
      
      for (const file of files) {
        const result = await this.resolveSingleFile(file, context);
        results.push(result);
      }
      
      if (results.length === 0) {
        results.push({
          path: pattern,
          originalPath: pattern,
          content: '',
          size: 0,
          error: `No files matched pattern: ${pattern}`
        });
      }
    } catch (error: any) {
      results.push({
        path: pattern,
        originalPath: pattern,
        content: '',
        size: 0,
        error: `Glob pattern error: ${error.message}`
      });
    }
    
    return results;
  }
  
  /**
   * Generate alternative paths to try when a file is not found
   */
  private static generateAlternativePaths(filePath: string, workingDir: string): string[] {
    const alternatives: string[] = [];
    const fileName = basename(filePath);
    
    // Common source directories to check
    const commonDirs = ['src', 'lib', 'app', 'components', 'pages', 'utils', 'services'];
    
    // Try common directories
    for (const dir of commonDirs) {
      alternatives.push(join(workingDir, dir, fileName));
      alternatives.push(join(workingDir, dir, filePath));
    }
    
    // Try parent directory
    alternatives.push(join(dirname(workingDir), filePath));
    
    // Try with common extensions if no extension provided
    if (!filePath.includes('.')) {
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'];
      for (const ext of extensions) {
        alternatives.push(resolve(workingDir, filePath + ext));
      }
    }
    
    return alternatives;
  }
  
  /**
   * Format file contents for inclusion in prompts
   */
  static formatFilesForPrompt(files: FileContent[]): string {
    const sections: string[] = [];
    
    for (const file of files) {
      if (file.error) {
        sections.push(`\n### File: ${file.originalPath}\n\nError: ${file.error}\n`);
      } else {
        const extension = file.path.split('.').pop() || 'txt';
        sections.push(`\n### File: ${file.originalPath}\n\n\`\`\`${extension}\n${file.content}\n\`\`\`\n`);
      }
    }
    
    return sections.join('\n');
  }
}