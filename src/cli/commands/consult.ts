import { CommandSpec, CommandResult } from '../types';
import { createLogger } from '../../services/logger';
import { Orchestrator } from '../../core/orchestrator';
import { PromptBuilder } from '../../core/prompt-builder';
import { getPluginRegistry } from '../../plugins/registry';
import { ConfigManager } from '../../config/manager';
import { startWizard } from '../../config/wizard';
import chalk from 'chalk';

const logger = createLogger('ConsultCommand');

interface ConsultOptions {
  models?: string[];
  files?: string[];
  dirs?: string[];
  json?: boolean;
  bestOf?: boolean;
  verbose?: boolean;
}

const consultCommand: CommandSpec = {
  name: 'consult',
  description: 'Consult AI models with a prompt',
  help: `Usage: ai-advisor consult [prompt] [options]

Description:
  Consult one or more AI models with a prompt. You can attach files and directories
  for context, and optionally select the best response from multiple models.

Arguments:
  prompt              The prompt to send to the AI models (optional - can use stdin)

Options:
  -m, --models        Specific models to consult (default: configured default models)
  -f, --files         Files to attach to the prompt
  -d, --dirs          Directories to attach (recursive)
  --json              Output raw JSON response
  --best-of           Enable best response selection from multiple models
  -v, --verbose       Enable verbose output

Examples:
  # Single model consultation
  ai-advisor consult "Explain this code" -f src/index.ts

  # Multi-model consultation
  ai-advisor consult "Design a caching strategy" -m gpt-4 claude-3-opus

  # Best-of selection
  ai-advisor consult "Complex question" -m gpt-4 claude-3 --best-of

  # Using stdin
  echo "What is this?" | ai-advisor consult -f image.png`,

  arguments: [
    {
      name: 'prompt',
      description: 'The prompt to send to AI models',
      required: false
    }
  ],

  options: [
    {
      flag: 'm|models',
      description: 'Specific models to consult',
      type: 'string'
    },
    {
      flag: 'f|files',
      description: 'Files to attach to the prompt',
      type: 'string'
    },
    {
      flag: 'd|dirs',
      description: 'Directories to attach (recursive)',
      type: 'string'
    },
    {
      flag: 'json',
      description: 'Output raw JSON response',
      type: 'boolean'
    },
    {
      flag: 'best-of',
      description: 'Enable best response selection',
      type: 'boolean'
    },
    {
      flag: 'v|verbose',
      description: 'Enable verbose output',
      type: 'boolean'
    }
  ],

  async execute(args, options, ctx): Promise<CommandResult> {
    try {
      const opts = options as ConsultOptions;
      const verbose = opts.verbose || ctx.verbose;

      if (verbose) {
        logger.info('Starting consultation...');
      }

      // Get prompt from args or stdin
      let prompt = args[0];
      if (!prompt && !process.stdin.isTTY) {
        // Read from stdin if available
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        prompt = Buffer.concat(chunks).toString().trim();
      }

      if (!prompt) {
        return {
          success: false,
          message: 'No prompt provided. Use --help for usage information.'
        };
      }

      // Initialize configuration
      const configManager = new ConfigManager();
      
      // Check if configuration exists
      if (!await configManager.exists()) {
        console.log(chalk.yellow('No configuration found. Starting setup wizard...'));
        await startWizard();
      }

      const config = await configManager.load();

      // Initialize plugin registry
      const registry = getPluginRegistry();
      await registry.initialize(config);

      // Parse models
      let models: string[] = [];
      if (opts.models) {
        // Handle both array and comma-separated string
        if (Array.isArray(opts.models)) {
          models = opts.models;
        } else if (typeof opts.models === 'string') {
          models = opts.models.split(',').map(m => m.trim());
        }
      }

      // Use default models if none specified
      if (models.length === 0) {
        models = config.defaultModels || [];
        if (models.length === 0) {
          return {
            success: false,
            message: 'No models specified and no default models configured.'
          };
        }
      }

      // Parse files and directories
      const files: string[] = [];
      if (opts.files) {
        if (Array.isArray(opts.files)) {
          files.push(...opts.files);
        } else if (typeof opts.files === 'string') {
          files.push(...opts.files.split(',').map(f => f.trim()));
        }
      }

      const dirs: string[] = [];
      if (opts.dirs) {
        if (Array.isArray(opts.dirs)) {
          dirs.push(...opts.dirs);
        } else if (typeof opts.dirs === 'string') {
          dirs.push(...opts.dirs.split(',').map(d => d.trim()));
        }
      }

      // Build prompt with attachments
      const promptBuilder = new PromptBuilder();
      const enhancedPrompt = await promptBuilder.build({
        prompt,
        files,
        directories: dirs,
        workingDirectory: ctx.cwd
      });

      if (verbose) {
        logger.info(`Consulting models: ${models.join(', ')}`);
        if (files.length > 0) {
          logger.info(`Attached files: ${files.join(', ')}`);
        }
        if (dirs.length > 0) {
          logger.info(`Attached directories: ${dirs.join(', ')}`);
        }
      }

      // Create orchestrator and execute
      const orchestrator = new Orchestrator(registry);
      const result = await orchestrator.consult({
        prompt: enhancedPrompt,
        models,
        bestOf: opts.bestOf,
        options: {
          temperature: 0.7,
          maxTokens: undefined
        }
      });

      // Output results
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Format and display results
        if (result.responses.length === 0) {
          console.log(chalk.red('No responses received.'));
        } else {
          for (const response of result.responses) {
            console.log(chalk.blue(`\n=== ${response.model} ===`));
            console.log(response.content);
            
            if (verbose && response.metadata) {
              console.log(chalk.gray(`\nMetadata: ${JSON.stringify(response.metadata, null, 2)}`));
            }
          }

          if (result.bestIndex !== undefined) {
            console.log(chalk.green(`\nBest response: ${result.responses[result.bestIndex].model}`));
          }
        }

        if (result.failed.length > 0) {
          console.log(chalk.yellow(`\nFailed models: ${result.failed.join(', ')}`));
        }

        if (verbose) {
          console.log(chalk.gray(`\nTotal duration: ${result.durationMs}ms`));
        }
      }

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('Consult command error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      };
    }
  }
};

export default consultCommand;