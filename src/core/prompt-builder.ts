import { FileContent } from '../services/file-resolver';

/**
 * Build a complete prompt with file contents
 */
export function buildPrompt(userPrompt: string, files: FileContent[]): string {
  if (!files || files.length === 0) {
    return userPrompt;
  }
  
  const validFiles = files.filter(f => !f.error && f.content);
  const errorFiles = files.filter(f => f.error);
  
  let prompt = userPrompt;
  
  // Add valid file contents
  if (validFiles.length > 0) {
    prompt += '\n\n---\n\n';
    prompt += 'The following files have been provided for context:\n';
    
    for (const file of validFiles) {
      const extension = getFileExtension(file.path);
      const language = getLanguageFromExtension(extension);
      
      prompt += `\n### File: ${file.originalPath}\n\n`;
      prompt += '```' + language + '\n';
      prompt += file.content;
      prompt += '\n```\n';
    }
  }
  
  // Add file errors if any
  if (errorFiles.length > 0) {
    prompt += '\n\n---\n\n';
    prompt += 'The following files could not be read:\n';
    
    for (const file of errorFiles) {
      prompt += `\n- ${file.originalPath}: ${file.error}`;
    }
    
    prompt += '\n';
  }
  
  return prompt;
}

/**
 * Get file extension from path
 */
function getFileExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Map file extensions to language identifiers for syntax highlighting
 */
function getLanguageFromExtension(extension: string): string {
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'mjs': 'javascript',
    'cjs': 'javascript',
    
    // Web
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    
    // Data formats
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'xml': 'xml',
    
    // Programming languages
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'kt': 'kotlin',
    'swift': 'swift',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'r': 'r',
    'scala': 'scala',
    'clj': 'clojure',
    'ex': 'elixir',
    'exs': 'elixir',
    
    // Shell
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'fish': 'bash',
    'ps1': 'powershell',
    
    // Config files
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'env': 'bash',
    'gitignore': 'bash',
    
    // Documentation
    'md': 'markdown',
    'mdx': 'markdown',
    'rst': 'restructuredtext',
    'txt': 'text',
    
    // Database
    'sql': 'sql',
    
    // Other
    'graphql': 'graphql',
    'proto': 'protobuf',
    'vim': 'vim',
    'lua': 'lua',
    'dart': 'dart',
    'zig': 'zig',
    'nim': 'nim',
    'v': 'v',
    'jl': 'julia'
  };
  
  return languageMap[extension] || extension || 'text';
}

/**
 * Calculate the approximate token count for a prompt
 * This is a rough estimate - actual token count may vary by model
 */
export function estimateTokenCount(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Truncate prompt if it exceeds a certain token limit
 */
export function truncatePrompt(prompt: string, maxTokens: number): string {
  const estimatedTokens = estimateTokenCount(prompt);
  
  if (estimatedTokens <= maxTokens) {
    return prompt;
  }
  
  // Calculate how many characters we can keep
  const maxChars = maxTokens * 4;
  const truncated = prompt.slice(0, maxChars - 100); // Leave room for ellipsis message
  
  return truncated + '\n\n[Content truncated due to length limits]';
}