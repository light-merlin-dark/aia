import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLIRouter } from '../../src/cli/router';
import type { CommandSpec, RuntimeContext, CommandResult } from '../../src/cli/types';

// Mock logger
vi.mock('../../src/services/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

// Mock console.log for help output tests
const originalConsoleLog = console.log;
let consoleOutput: string[] = [];

describe('CLIRouter', () => {
  let router: CLIRouter;
  let mockContext: RuntimeContext;
  
  beforeEach(() => {
    router = new CLIRouter();
    mockContext = {
      workingDir: '/test/dir',
      timestamp: new Date()
    };
    
    // Capture console.log output
    consoleOutput = [];
    console.log = vi.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });
  });
  
  afterEach(() => {
    console.log = originalConsoleLog;
    vi.clearAllMocks();
  });
  
  describe('registerCommand', () => {
    it('should register a command', () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn()
      };
      
      router.registerCommand(command);
      
      // Verify by trying to execute it
      router.route(['test'], mockContext);
      expect(command.execute).toHaveBeenCalled();
    });
  });
  
  describe('parseArgs', () => {
    it('should parse command with no args or options', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route(['test'], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith([], {}, mockContext);
    });
    
    it('should parse command with positional arguments', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route(['test', 'arg1', 'arg2'], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith(['arg1', 'arg2'], {}, mockContext);
    });
    
    it('should parse long options with values', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route(['test', '--model', 'gpt-4', '--verbose'], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith(
        [],
        { model: 'gpt-4', verbose: true },
        mockContext
      );
    });
    
    it('should parse long options with equals syntax', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route(['test', '--model=gpt-4', '--count=5'], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith(
        [],
        { model: 'gpt-4', count: 5 },
        mockContext
      );
    });
    
    it('should parse short options', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route(['test', '-v', '-m', 'gpt-4'], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith(
        [],
        { v: true, m: 'gpt-4' },
        mockContext
      );
    });
    
    it('should parse grouped short options', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route(['test', '-vdf'], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith(
        [],
        { v: true, d: true, f: true },
        mockContext
      );
    });
    
    it('should parse grouped short options with value for last flag', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route(['test', '-vdm', 'gpt-4'], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith(
        [],
        { v: true, d: true, m: 'gpt-4' },
        mockContext
      );
    });
    
    it('should convert kebab-case to camelCase for long options', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route(['test', '--max-retries', '3', '--best-of'], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith(
        [],
        { maxRetries: 3, bestOf: true },
        mockContext
      );
    });
    
    it('should parse JSON values', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route([
        'test',
        '--models', '["gpt-4","claude"]',
        '--config', '{"timeout":5000}',
        '--count', '42',
        '--enabled', 'true'
      ], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith(
        [],
        {
          models: ['gpt-4', 'claude'],
          config: { timeout: 5000 },
          count: 42,
          enabled: true
        },
        mockContext
      );
    });
    
    it('should handle mixed args and options', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route([
        'test', 'file1.txt', '--verbose', '-m', 'gpt-4', 'file2.txt'
      ], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith(
        ['file1.txt', 'file2.txt'],
        { verbose: true, m: 'gpt-4' },
        mockContext
      );
    });
  });
  
  describe('help system', () => {
    it('should show general help when no command provided', async () => {
      const command1: CommandSpec = {
        name: 'consult',
        description: 'Consult AI models',
        execute: vi.fn()
      };
      const command2: CommandSpec = {
        name: 'configure',
        description: 'Configure settings',
        execute: vi.fn()
      };
      
      router.registerCommand(command1);
      router.registerCommand(command2);
      
      const result = await router.route([], mockContext);
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('\n')).toContain('AI Advisor - Parallel AI model consultation');
      expect(consoleOutput.join('\n')).toContain('consult');
      expect(consoleOutput.join('\n')).toContain('configure');
    });
    
    it('should show general help with --help flag', async () => {
      const result = await router.route(['--help'], mockContext);
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('\n')).toContain('AI Advisor - Parallel AI model consultation');
    });
    
    it('should show general help with -h flag', async () => {
      const result = await router.route(['-h'], mockContext);
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('\n')).toContain('AI Advisor - Parallel AI model consultation');
    });
    
    it('should show command-specific help', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command with options',
        arguments: [
          { name: 'input', description: 'Input file', required: true },
          { name: 'output', description: 'Output file', required: false }
        ],
        options: [
          { flag: 'v|verbose', description: 'Enable verbose output' },
          { flag: 'm|model', description: 'Model to use' }
        ],
        execute: vi.fn()
      };
      
      router.registerCommand(command);
      const result = await router.route(['test', '--help'], mockContext);
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('\n')).toContain('Usage: ai-advisor test [options]');
      expect(consoleOutput.join('\n')).toContain('Test command with options');
      expect(consoleOutput.join('\n')).toContain('input');
      expect(consoleOutput.join('\n')).toContain('(required)');
      expect(consoleOutput.join('\n')).toContain('-v, --verbose');
      expect(consoleOutput.join('\n')).toContain('-m, --model');
    });
    
    it('should use custom help text if provided', async () => {
      const customHelp = 'Custom help text for test command';
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        help: customHelp,
        execute: vi.fn()
      };
      
      router.registerCommand(command);
      const result = await router.route(['test', '--help'], mockContext);
      
      expect(result.success).toBe(true);
      expect(consoleOutput.join('\n')).toBe(customHelp);
    });
    
    it('should show error for unknown command help', async () => {
      const result = await router.route(['unknown', '--help'], mockContext);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown command: unknown');
    });
  });
  
  describe('error handling', () => {
    it('should handle unknown commands', async () => {
      const result = await router.route(['unknown'], mockContext);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown command: unknown');
      expect(result.message).toContain("Run 'ai-advisor --help'");
    });
    
    it('should handle command execution errors', async () => {
      const error = new Error('Command failed');
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockRejectedValue(error)
      };
      
      router.registerCommand(command);
      const result = await router.route(['test'], mockContext);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Command failed');
    });
    
    it('should handle non-Error exceptions', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockRejectedValue('String error')
      };
      
      router.registerCommand(command);
      const result = await router.route(['test'], mockContext);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('An unexpected error occurred');
    });
  });
  
  describe('command execution', () => {
    it('should pass through command results', async () => {
      const commandResult: CommandResult = {
        success: true,
        message: 'Command completed',
        data: { foo: 'bar' }
      };
      
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue(commandResult)
      };
      
      router.registerCommand(command);
      const result = await router.route(['test'], mockContext);
      
      expect(result).toEqual(commandResult);
    });
    
    it('should provide runtime context to commands', async () => {
      const command: CommandSpec = {
        name: 'test',
        description: 'Test command',
        execute: vi.fn().mockResolvedValue({ success: true })
      };
      
      router.registerCommand(command);
      await router.route(['test'], mockContext);
      
      expect(command.execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        mockContext
      );
    });
  });
});