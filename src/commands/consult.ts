import { createCommand } from '@merlin/cli';
import { orchestrate } from '../core/orchestrator.js';
import { buildPrompt } from '../core/prompt-builder.js';
import { FileResolver } from '../services/file-resolver.js';
import { tokenizer } from '../core/tokenizer.js';
import { createLogger } from '../services/logger.js';
import chalk from 'chalk';
import { costCalculator } from '../services/cost-calculator.js';

const logger = createLogger('ConsultCommand');

export default createCommand({
  name: 'consult',
  description: 'Consult AI models with a prompt',
  usage: 'aia consult [prompt] [options]',
  examples: [
    'aia consult "Explain this code" -m model-name -f src/index.ts',
    'aia consult "Design a caching strategy" -m model1,model2',
    'aia consult "Complex question" -m model1,model2 --best-of',
    'echo "What is this?" | aia consult -m model-name -f image.png'
  ],
  
  args: {
    prompt: {
      type: 'string',
      description: 'The prompt to send to AI models',
      required: false
    }
  },

  options: {
    models: {
      type: 'string',
      flag: 'm',
      description: 'Models to consult (comma-separated). If not specified, uses default model',
      required: false
    },
    files: {
      type: 'string', 
      flag: 'f',
      description: 'Files to attach to the prompt (comma-separated)'
    },
    dirs: {
      type: 'string',
      flag: 'd', 
      description: 'Directories to attach (recursive, comma-separated)'
    },
    json: {
      type: 'boolean',
      description: 'Output raw JSON response'
    },
    'best-of': {
      type: 'boolean',
      description: 'Enable best response selection from multiple models'
    },
    verbose: {
      type: 'boolean',
      flag: 'v',
      description: 'Enable verbose output'
    }
  },

  async execute({ namedArgs, options, registry }) {
    try {
      const verbose = options.verbose;

      if (verbose) {
        logger.info('Starting consultation...');
      }

      // Get prompt from args or stdin
      let prompt = namedArgs?.prompt;
      if (!prompt && !process.stdin.isTTY) {
        // Read from stdin if available
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        prompt = Buffer.concat(chunks).toString().trim();
      }

      if (!prompt) {
        throw new Error('No prompt provided. Use --help for usage information.');
      }

      // Get configuration and plugin registry from bootstrap
      const config = registry.get('config');
      const pluginRegistry = registry.get('pluginRegistry');

      // Parse models - use default if not specified
      let models: string[] = [];
      
      if (options.models) {
        models = options.models.split(',').map((m: string) => m.trim());
      } else {
        // Use default model from config
        const defaultModel = config.defaultModel;
        
        if (defaultModel) {
          models = [defaultModel];
          if (verbose) {
            logger.info(`Using default model: ${defaultModel}`);
          }
        } else {
          // Show available models if no default is set
          const availableServices = Object.keys(config.services).filter(s => s !== 'default');
          const serviceModels: string[] = [];
          
          // Collect all available models
          for (const service of availableServices) {
            const svcConfig = config.services[service];
            if (svcConfig.models && svcConfig.models.length > 0) {
              serviceModels.push(...svcConfig.models.map(m => `${service}/${m}`));
            }
          }
          
          throw new Error(
            `No models specified and no default model configured.\n` +
            `Available models:\n${serviceModels.map(m => `  ${m}`).join('\n')}\n\n` +
            `Options:\n` +
            `  1. Set a default: aia config-set-default <service/model>\n` +
            `  2. Specify models: aia consult "your prompt" -m <model-name>`
          );
        }
      }

      if (models.length === 0) {
        throw new Error('No valid models found');
      }

      // Parse files and directories
      const files: string[] = [];
      if (options.files) {
        files.push(...options.files.split(',').map((f: string) => f.trim()));
      }
      if (options.dirs) {
        files.push(...options.dirs.split(',').map((d: string) => d.trim()));
      }

      // Build prompt with attachments
      let enhancedPrompt = prompt;
      if (files.length > 0) {
        const resolvedFiles = await FileResolver.resolveFiles(files, {
          workingDirectory: process.cwd()
        });
        enhancedPrompt = buildPrompt(prompt, resolvedFiles);
      }

      if (verbose) {
        logger.info(`Consulting models: ${models.join(', ')}`);
        if (files.length > 0) {
          logger.info(`Attached files: ${files.join(', ')}`);
        }
      }

      // Execute consultation
      const result = await orchestrate({
        prompt: enhancedPrompt,
        models,
        bestOf: options['best-of'],
        registry: pluginRegistry,
        maxRetries: config.maxRetries,
        timeout: config.timeout
      });

      // Calculate costs using @light-merlin-dark/tok
      const enhancedCosts = [];
      if (result.costs) {
        for (const cost of result.costs) {
          try {
            // Calculate cost using our cost calculator
            const costResult = await costCalculator.calculateCost(
              cost.provider,
              cost.model,
              cost.inputTokens,
              cost.outputTokens,
              {
                inputCostPer1M: cost.inputCostPer1M || 0,
                outputCostPer1M: cost.outputCostPer1M || 0
              }
            );
            
            enhancedCosts.push({
              ...cost,
              formattedCost: costResult.formattedCost,
              totalCost: costResult.totalCost
            });
          } catch (error) {
            enhancedCosts.push(cost);
          }
        }
      }

      // Output results
      if (options.json) {
        console.log(JSON.stringify({ ...result, costs: enhancedCosts }, null, 2));
      } else {
        // Format and display results
        if (result.responses.length === 0) {
          console.log(chalk.red('No responses received.'));
        } else {
          for (let i = 0; i < result.responses.length; i++) {
            const response = result.responses[i];
            console.log(chalk.blue(`\n=== ${response.model} ===`));
            console.log(response.content);
            
            // Display cost if available
            const cost = enhancedCosts.find(c => c.model === response.model && c.provider === response.provider);
            if (cost) {
              console.log(chalk.gray(`\nCost: ${cost.formattedCost || tokenizer.formatCost(cost.totalCost)} (${cost.inputTokens} in, ${cost.outputTokens} out)`));
            }
            
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

        // Display total cost if multiple models
        const totalCost = enhancedCosts.reduce((sum, cost) => sum + (cost.totalCost || 0), 0);
        if (totalCost > 0 && result.responses.length > 1) {
          console.log(chalk.yellow(`\nTotal cost: ${tokenizer.formatCost(totalCost)}`));
        }

        // Show pricing hints for models without pricing
        const modelsWithoutPricing: Set<string> = new Set();
        for (const response of result.responses) {
          if (!response.isError) {
            const hasPricing = enhancedCosts.some(c => 
              c.model === response.model && c.provider === response.provider
            );
            if (!hasPricing) {
              modelsWithoutPricing.add(`${response.provider} ${response.model}`);
            }
          }
        }
        
        if (modelsWithoutPricing.size > 0) {
          const firstModel = modelsWithoutPricing.values().next().value;
          if (firstModel) {
            const [provider, model] = firstModel.split(' ');
            console.log(chalk.gray('\n' + tokenizer.getPricingHint(provider, model)));
          }
        }

        if (verbose) {
          console.log(chalk.gray(`\nTotal duration: ${result.durationMs}ms`));
        }
      }

      return { success: true, data: result };
    } catch (error) {
      logger.error('Consult command error:', error);
      throw error;
    }
  }
});