import { describe, it, expect, beforeEach } from 'bun:test';
import { CLIRouter } from '../../src/cli/router';
import type { CommandSpec, RuntimeContext, CommandOptions } from '../../src/cli/types';

// Test the complete CLI command workflow 
describe('CLI Commands E2E Tests', () => {
  let router: CLIRouter;
  let mockContext: RuntimeContext;

  // Mock command for testing
  const mockConsultCommand: CommandSpec = {
    name: 'consult',
    description: 'Consult AI models with a prompt',
    options: [
      { flag: 'models', description: 'Models to use', type: 'string' },
      { flag: 'files', description: 'Files to include', type: 'string' },
      { flag: 'output', description: 'Output file', type: 'string' }
    ],
    execute: async (args: string[], options: CommandOptions, _ctx: RuntimeContext) => {
      return {
        success: true,
        message: `Mock consult executed with args: [${args.join(', ')}] and options: ${JSON.stringify(options)}`
      };
    }
  };

  const mockConfigCommand: CommandSpec = {
    name: 'config-set',
    description: 'Set configuration value',
    options: [],
    execute: async (args: string[], _options: CommandOptions, _ctx: RuntimeContext) => {
      if (args.length < 2) {
        return { success: false, message: 'Key and value required' };
      }
      return {
        success: true,
        message: `Mock config-set: ${args[0]} = ${args[1]}`
      };
    }
  };

  beforeEach(() => {
    router = new CLIRouter();
    mockContext = {} as RuntimeContext;
    
    // Register mock commands
    router.registerCommand(mockConsultCommand);
    router.registerCommand(mockConfigCommand);
  });

  it('should route basic consult command', async () => {
    const args = ['consult', 'What is 2+2?'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Mock consult executed');
    expect(result.message).toContain('What is 2+2?');
  });

  it('should route consult command with options', async () => {
    const args = ['consult', '--models', 'test-model', '--files', 'test.js', 'What does this code do?'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Mock consult executed');
    expect(result.message).toContain('models');
    expect(result.message).toContain('test-model');
    expect(result.message).toContain('files');
    expect(result.message).toContain('test.js');
  });

  it('should route config-set command', async () => {
    const args = ['config-set', 'openai.apiKey', 'sk-test123'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Mock config-set: openai.apiKey = sk-test123');
  });

  it('should handle config-set with missing arguments', async () => {
    const args = ['config-set', 'openai.apiKey'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Key and value required');
  });

  it('should handle unknown commands', async () => {
    const args = ['unknown-command', 'arg1', 'arg2'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown command');
  });

  it('should handle help flags', async () => {
    const args = ['--help'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(typeof result.message).toBe('string');
    expect(result.message).toContain('Commands');
  });

  it('should handle command-specific help', async () => {
    const args = ['consult', '--help'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(typeof result.message).toBe('string');
    expect(result.message).toContain('consult');
  });

  it('should handle empty command input', async () => {
    const args: string[] = [];
    const result = await router.route(args, mockContext);

    // Should show general help for empty input
    expect(result.success).toBe(true);
    expect(typeof result.message).toBe('string');
    expect(result.message).toContain('Commands');
  });

  it('should parse complex option combinations', async () => {
    const args = [
      'consult',
      '--models', 'gpt-4-turbo,claude-3-opus-20240229',
      '--files', 'src/**/*.ts',
      '--output', 'analysis.json',
      'Analyze this codebase'
    ];
    
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Mock consult executed');
    expect(result.message).toContain('models');
    expect(result.message).toContain('gpt-4-turbo,claude-3-opus-20240229');
    expect(result.message).toContain('files');
    expect(result.message).toContain('src/**/*.ts');
    expect(result.message).toContain('output');
    expect(result.message).toContain('analysis.json');
  });

  it('should handle boolean flags', async () => {
    // Add a command that accepts boolean flags
    const mockCommandWithFlags: CommandSpec = {
      name: 'test-flags',
      description: 'Test boolean flags',
      options: [
        { flag: 'verbose', description: 'Verbose output', type: 'boolean' },
        { flag: 'dry-run', description: 'Dry run mode', type: 'boolean' }
      ],
      execute: async (_args: string[], options: CommandOptions) => {
        return {
          success: true,
          message: `Flags: verbose=${options.verbose}, dryRun=${options.dryRun}`
        };
      }
    };

    router.registerCommand(mockCommandWithFlags);

    const args = ['test-flags', '--verbose', '--dry-run'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('verbose=true');
    expect(result.message).toContain('dryRun=true');
  });

  it('should handle quoted arguments with spaces', async () => {
    const args = ['consult', '--output', '/path/with spaces/file.json', 'What is "Hello World" in Python?'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('output');
    expect(result.message).toContain('/path/with spaces/file.json');
    expect(result.message).toContain('What is "Hello World" in Python?');
  });

  it('should handle numeric option values', async () => {
    const mockCommandWithNumbers: CommandSpec = {
      name: 'test-numbers',
      description: 'Test numeric options',
      options: [
        { flag: 'timeout', description: 'Timeout in ms', type: 'number' },
        { flag: 'max-tokens', description: 'Max tokens', type: 'number' }
      ],
      execute: async (_args: string[], options: CommandOptions) => {
        return {
          success: true,
          message: `Numbers: timeout=${options.timeout}, maxTokens=${options.maxTokens}`
        };
      }
    };

    router.registerCommand(mockCommandWithNumbers);

    const args = ['test-numbers', '--timeout', '30000', '--max-tokens', '4096'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('timeout=30000');
    expect(result.message).toContain('maxTokens=4096');
  });

  it('should preserve argument order', async () => {
    const args = ['consult', 'first', 'second', 'third', '--option', 'value'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('first, second, third');
  });

  it('should handle mixed short and long options', async () => {
    const mockCommandWithMixedOptions: CommandSpec = {
      name: 'test-mixed',
      description: 'Test mixed options',
      options: [
        { flag: 'v', description: 'Verbose (short)', type: 'boolean' },
        { flag: 'verbose', description: 'Verbose (long)', type: 'boolean' },
        { flag: 'f', description: 'File (short)', type: 'string' },
        { flag: 'file', description: 'File (long)', type: 'string' }
      ],
      execute: async (_args: string[], options: CommandOptions) => {
        return {
          success: true,
          message: `Mixed: v=${options.v}, verbose=${options.verbose}, f=${options.f}, file=${options.file}`
        };
      }
    };

    router.registerCommand(mockCommandWithMixedOptions);

    const args = ['test-mixed', '-v', '--file', 'test.txt'];
    const result = await router.route(args, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('v=true');
    expect(result.message).toContain('file=test.txt');
  });

  it('should handle complex real-world scenarios', async () => {
    const complexArgs = [
      'consult',
      '--models', 'gpt-4-turbo,claude-3-sonnet-20240229,gpt-3.5-turbo',
      '--files', 'src/**/*.{ts,js},tests/**/*.test.{ts,js}',
      '--output', './analysis/code-review.json',
      'Please perform a comprehensive code review focusing on: 1) Security vulnerabilities 2) Performance optimizations 3) Code quality improvements. Provide specific recommendations with examples.'
    ];

    const result = await router.route(complexArgs, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Mock consult executed');
    expect(result.message).toContain('gpt-4-turbo,claude-3-sonnet-20240229,gpt-3.5-turbo');
    expect(result.message).toContain('src/**/*.{ts,js},tests/**/*.test.{ts,js}');
    expect(result.message).toContain('./analysis/code-review.json');
    expect(result.message).toContain('comprehensive code review');
  });
});