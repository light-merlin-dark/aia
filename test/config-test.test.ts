import { describe, it, expect } from 'bun:test';
import consultCommand from '../src/commands/consult.js';

describe('CLI Commands Structure', () => {
  describe('Consult Command', () => {
    it('should have correct command structure', () => {
      expect(consultCommand.name).toBe('consult');
      expect(consultCommand.description).toBeDefined();
      expect(consultCommand.usage).toBeDefined();
      expect(consultCommand.examples).toBeArray();
      expect(consultCommand.args).toBeDefined();
      expect(consultCommand.options).toBeDefined();
      expect(consultCommand.execute).toBeFunction();
    });

    it('should have structured args for prompt', () => {
      expect(consultCommand.args.prompt).toBeDefined();
      expect(consultCommand.args.prompt.type).toBe('string');
      expect(consultCommand.args.prompt.description).toBeDefined();
      expect(consultCommand.args.prompt.required).toBe(false);
    });

    it('should have required models option', () => {
      expect(consultCommand.options.models).toBeDefined();
      expect(consultCommand.options.models.type).toBe('string');
      expect(consultCommand.options.models.flag).toBe('m');
      expect(consultCommand.options.models.required).toBe(true);
    });

    it('should have file attachment options', () => {
      expect(consultCommand.options.files).toBeDefined();
      expect(consultCommand.options.files.type).toBe('string');
      expect(consultCommand.options.files.flag).toBe('f');
      expect(consultCommand.options.files.description).toContain('Files to attach');

      expect(consultCommand.options.dirs).toBeDefined();
      expect(consultCommand.options.dirs.type).toBe('string');
      expect(consultCommand.options.dirs.flag).toBe('d');
    });

    it('should have output formatting options', () => {
      expect(consultCommand.options.json).toBeDefined();
      expect(consultCommand.options.json.type).toBe('boolean');
      
      expect(consultCommand.options['best-of']).toBeDefined();
      expect(consultCommand.options['best-of'].type).toBe('boolean');
      
      expect(consultCommand.options.verbose).toBeDefined();
      expect(consultCommand.options.verbose.type).toBe('boolean');
      expect(consultCommand.options.verbose.flag).toBe('v');
    });

    it('should have helpful examples', () => {
      expect(consultCommand.examples.length).toBeGreaterThan(0);
      
      // Check for file attachment examples
      const hasFileExample = consultCommand.examples.some(example => 
        example.includes('-f') && example.includes('.ts')
      );
      expect(hasFileExample).toBe(true);

      // Check for multi-model example
      const hasMultiModelExample = consultCommand.examples.some(example => 
        example.includes('model1,model2')
      );
      expect(hasMultiModelExample).toBe(true);
    });
  });

  describe('Command Line Arguments', () => {
    it('should properly structure arguments for @merlin/cli', () => {
      // Verify the command follows @merlin/cli conventions
      expect(consultCommand).toHaveProperty('name');
      expect(consultCommand).toHaveProperty('description');
      expect(consultCommand).toHaveProperty('usage');
      expect(consultCommand).toHaveProperty('examples');
      expect(consultCommand).toHaveProperty('args');
      expect(consultCommand).toHaveProperty('options');
      expect(consultCommand).toHaveProperty('execute');
    });

    it('should handle file path arguments correctly', () => {
      // Files option should accept comma-separated paths
      expect(consultCommand.options.files.description).toContain('comma-separated');
      expect(consultCommand.options.dirs.description).toContain('comma-separated');
    });
  });
});