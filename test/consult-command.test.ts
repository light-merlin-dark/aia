import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import consultCommand from '../src/commands/consult.js';

const TEST_DIR = join(process.cwd(), 'test', 'fixtures');

// Mock dependencies
const mockOrchestrate = mock();
const mockBuildPrompt = mock();
const mockCostCalculator = {
  calculateCost: mock()
};

// Mock modules
mock.module('../src/core/orchestrator.js', () => ({
  orchestrate: mockOrchestrate
}));

mock.module('../src/core/prompt-builder.js', () => ({
  buildPrompt: mockBuildPrompt
}));

mock.module('../src/services/cost-calculator.js', () => ({
  costCalculator: mockCostCalculator
}));

describe('Consult Command', () => {
  beforeEach(() => {
    // Reset mocks
    mockOrchestrate.mockReset();
    mockBuildPrompt.mockReset();
    mockCostCalculator.calculateCost.mockReset();
    
    // Create test directory and files
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    
    writeFileSync(join(TEST_DIR, 'test.js'), 'console.log("test");');
    writeFileSync(join(TEST_DIR, 'config.json'), '{"test": true}');
    
    // Setup default mock returns
    mockOrchestrate.mockResolvedValue({
      responses: [
        {
          model: 'test-model',
          provider: 'test-provider',
          content: 'Test response',
          isError: false
        }
      ],
      failed: [],
      costs: [
        {
          provider: 'test-provider',
          model: 'test-model',
          inputTokens: 100,
          outputTokens: 50,
          inputCostPer1M: 1.0,
          outputCostPer1M: 2.0
        }
      ],
      durationMs: 1000
    });
    
    mockBuildPrompt.mockReturnValue('Enhanced prompt with files');
    
    mockCostCalculator.calculateCost.mockResolvedValue({
      totalCost: 0.00015,
      formattedCost: '$0.0002'
    });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('Command structure', () => {
    it('should have proper command definition', () => {
      expect(consultCommand.name).toBe('consult');
      expect(consultCommand.description).toContain('Consult AI models');
      expect(consultCommand.usage).toContain('aia consult');
      expect(consultCommand.examples).toBeArray();
      expect(consultCommand.examples.length).toBeGreaterThan(0);
    });

    it('should have structured args and options', () => {
      expect(consultCommand.args).toBeDefined();
      expect(consultCommand.args.prompt).toBeDefined();
      expect(consultCommand.args.prompt.type).toBe('string');
      expect(consultCommand.args.prompt.required).toBe(false);
      
      expect(consultCommand.options).toBeDefined();
      expect(consultCommand.options.models).toBeDefined();
      expect(consultCommand.options.models.required).toBe(true);
      expect(consultCommand.options.files).toBeDefined();
      expect(consultCommand.options.dirs).toBeDefined();
    });
  });

  describe('File path resolution', () => {
    it('should resolve relative file paths correctly', async () => {
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['test-model'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      spyOn(process, 'cwd').mockReturnValue(TEST_DIR);

      const result = await consultCommand.execute({
        namedArgs: { prompt: 'Test prompt' },
        options: {
          models: 'test-model',
          files: 'test.js,config.json',
          verbose: false
        },
        registry: mockRegistry
      });

      expect(result.success).toBe(true);
      expect(mockBuildPrompt).toHaveBeenCalled();
      
      // Verify that FileResolver.resolveFiles was called with correct context
      const buildPromptCall = mockBuildPrompt.mock.calls[0];
      expect(buildPromptCall[0]).toBe('Test prompt');
      expect(buildPromptCall[1]).toBeArray();
      
      // Restore
      process.cwd = originalCwd;
    });

    it('should handle files from different calling directories', async () => {
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['test-model'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      // Create subdirectory to simulate calling from different location
      const subDir = join(TEST_DIR, 'subdir');
      mkdirSync(subDir);
      
      const originalCwd = process.cwd;
      spyOn(process, 'cwd').mockReturnValue(subDir);

      const result = await consultCommand.execute({
        namedArgs: { prompt: 'Test prompt' },
        options: {
          models: 'test-model',
          files: '../test.js,../config.json',
          verbose: false
        },
        registry: mockRegistry
      });

      expect(result.success).toBe(true);
      expect(mockBuildPrompt).toHaveBeenCalled();
      
      // Restore
      process.cwd = originalCwd;
    });

    it('should handle absolute file paths', async () => {
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['test-model'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      const absolutePath = join(TEST_DIR, 'test.js');
      
      const result = await consultCommand.execute({
        namedArgs: { prompt: 'Test prompt' },
        options: {
          models: 'test-model',
          files: absolutePath,
          verbose: false
        },
        registry: mockRegistry
      });

      expect(result.success).toBe(true);
      expect(mockBuildPrompt).toHaveBeenCalled();
    });
  });

  describe('Prompt handling', () => {
    it('should use provided prompt from namedArgs', async () => {
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['test-model'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      const result = await consultCommand.execute({
        namedArgs: { prompt: 'Custom test prompt' },
        options: {
          models: 'test-model',
          verbose: false
        },
        registry: mockRegistry
      });

      expect(result.success).toBe(true);
      expect(mockOrchestrate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Custom test prompt'
        })
      );
    });

    it('should throw error when no prompt provided', async () => {
      const mockRegistry = {
        get: mock(() => ({}))
      };

      await expect(consultCommand.execute({
        namedArgs: {},
        options: {
          models: 'test-model'
        },
        registry: mockRegistry
      })).rejects.toThrow('No prompt provided');
    });
  });

  describe('Model handling', () => {
    it('should parse comma-separated models', async () => {
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['model1', 'model2'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      const result = await consultCommand.execute({
        namedArgs: { prompt: 'Test prompt' },
        options: {
          models: 'model1,model2,model3',
          verbose: false
        },
        registry: mockRegistry
      });

      expect(result.success).toBe(true);
      expect(mockOrchestrate).toHaveBeenCalledWith(
        expect.objectContaining({
          models: ['model1', 'model2', 'model3']
        })
      );
    });

    it('should handle best-of option', async () => {
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['test-model'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      const result = await consultCommand.execute({
        namedArgs: { prompt: 'Test prompt' },
        options: {
          models: 'model1,model2',
          'best-of': true,
          verbose: false
        },
        registry: mockRegistry
      });

      expect(result.success).toBe(true);
      expect(mockOrchestrate).toHaveBeenCalledWith(
        expect.objectContaining({
          bestOf: true
        })
      );
    });
  });

  describe('Output formatting', () => {
    it('should output JSON when json option is true', async () => {
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['test-model'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

      const result = await consultCommand.execute({
        namedArgs: { prompt: 'Test prompt' },
        options: {
          models: 'test-model',
          json: true,
          verbose: false
        },
        registry: mockRegistry
      });

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      
      // Check that the output was JSON
      const jsonOutput = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      
      consoleSpy.mockRestore();
    });

    it('should show verbose output when verbose is true', async () => {
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['test-model'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      const result = await consultCommand.execute({
        namedArgs: { prompt: 'Test prompt' },
        options: {
          models: 'test-model',
          verbose: true
        },
        registry: mockRegistry
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Cost calculation integration', () => {
    it('should calculate and display costs using @light-merlin-dark/tok', async () => {
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['test-model'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      const result = await consultCommand.execute({
        namedArgs: { prompt: 'Test prompt' },
        options: {
          models: 'test-model',
          verbose: false
        },
        registry: mockRegistry
      });

      expect(result.success).toBe(true);
      expect(mockCostCalculator.calculateCost).toHaveBeenCalledWith(
        'test-provider',
        'test-model',
        100,
        50,
        expect.objectContaining({
          inputCostPer1M: 1.0,
          outputCostPer1M: 2.0
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should handle orchestrator errors gracefully', async () => {
      mockOrchestrate.mockRejectedValue(new Error('Orchestration failed'));
      
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['test-model'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      await expect(consultCommand.execute({
        namedArgs: { prompt: 'Test prompt' },
        options: {
          models: 'test-model'
        },
        registry: mockRegistry
      })).rejects.toThrow('Orchestration failed');
    });

    it('should handle cost calculation errors gracefully', async () => {
      mockCostCalculator.calculateCost.mockRejectedValue(new Error('Cost calc failed'));
      
      const mockRegistry = {
        get: mock((name: string) => {
          if (name === 'config') {
            return {
              services: { 'test-service': { models: ['test-model'] } },
              maxRetries: 3,
              timeout: 30000
            };
          }
          if (name === 'pluginRegistry') {
            return {};
          }
          return {};
        })
      };

      // Should not throw - should continue with original cost data
      const result = await consultCommand.execute({
        namedArgs: { prompt: 'Test prompt' },
        options: {
          models: 'test-model',
          verbose: false
        },
        registry: mockRegistry
      });

      expect(result.success).toBe(true);
    });
  });
});