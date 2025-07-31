import { createCommand } from '@merlin/cli';
import { ConfigManager } from '../config/manager.js';
import { createLogger } from '../services/logger.js';
import { costCalculator } from '../services/cost-calculator.js';
import chalk from 'chalk';
import prompts from 'prompts';

const logger = createLogger('ServicesCostCommand');

export default createCommand({
  name: 'services-cost',
  description: 'Manage AI service pricing configurations and get cost information',
  usage: 'aia services-cost [subcommand]',
  examples: [
    'aia services-cost set openai gpt-4 --input 10 --output 30',
    'aia services-cost list',
    'aia services-cost update',
    'aia services-cost remove openai gpt-4'
  ],

  args: {
    subcommand: {
      type: 'string',
      description: 'Subcommand: set, list, update, remove',
      required: false
    },
    provider: {
      type: 'string',
      description: 'Provider name (for set/remove)',
      required: false
    },
    model: {
      type: 'string',
      description: 'Model name (for set/remove)',
      required: false
    }
  },

  options: {
    input: {
      type: 'number',
      description: 'Input cost per million tokens (for set command)'
    },
    output: {
      type: 'number',
      description: 'Output cost per million tokens (for set command)'
    }
  },

  async execute({ namedArgs, options }) {
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();
      const subcommand = namedArgs?.subcommand || 'list';

      switch (subcommand) {
        case 'set': {
          const provider = namedArgs?.provider;
          const model = namedArgs?.model;

          if (!provider || !model) {
            console.log(chalk.red('Error: Provider and model are required for set command'));
            console.log('Usage: aia services-cost set <provider> <model> --input <cost> --output <cost>');
            throw new Error('Provider and model are required for set command');
          }

          // Check if service exists
          if (!config.services[provider]) {
            throw new Error(`Service "${provider}" not configured. Run "aia services" to add it first.`);
          }

          let inputCost = options.input;
          let outputCost = options.output;

          // If not provided via options, prompt interactively
          if (inputCost === undefined || outputCost === undefined) {
            console.log(chalk.gray('\nExamples: 0.15, 5.00, 10.50'));
            
            const promptsArray = [];
            
            if (inputCost === undefined) {
              promptsArray.push({
                type: 'text' as const,
                name: 'inputCost',
                message: 'Token input cost ($/1M):',
                validate: (value: string) => {
                  const parsed = parseFloat(value.replace(/^\$/, ''));
                  if (isNaN(parsed)) return 'Please enter a valid number';
                  if (parsed < 0) return 'Cost must be non-negative';
                  if (parsed > 1000) return 'Cost seems too high (max $1000/M)';
                  return true;
                },
                format: (value: string) => {
                  const num = parseFloat(value.replace(/^\$/, ''));
                  return isNaN(num) ? 0 : num;
                }
              });
            }
            
            if (outputCost === undefined) {
              promptsArray.push({
                type: 'text' as const,
                name: 'outputCost',
                message: 'Token output cost ($/1M):',
                validate: (value: string) => {
                  const parsed = parseFloat(value.replace(/^\$/, ''));
                  if (isNaN(parsed)) return 'Please enter a valid number';
                  if (parsed < 0) return 'Cost must be non-negative';
                  if (parsed > 1000) return 'Cost seems too high (max $1000/M)';
                  return true;
                },
                format: (value: string) => {
                  const num = parseFloat(value.replace(/^\$/, ''));
                  return isNaN(num) ? 0 : num;
                }
              });
            }

            const pricing = await prompts(promptsArray);
            inputCost = inputCost ?? pricing.inputCost;
            outputCost = outputCost ?? pricing.outputCost;
          }

          // Validate costs
          if (inputCost === undefined || outputCost === undefined) {
            throw new Error('Both input and output costs are required');
          }

          if (isNaN(inputCost) || inputCost < 0 || inputCost > 1000) {
            throw new Error('Invalid input cost. Must be between $0 and $1000 per million tokens.');
          }
          if (isNaN(outputCost) || outputCost < 0 || outputCost > 1000) {
            throw new Error('Invalid output cost. Must be between $0 and $1000 per million tokens.');
          }

          // Initialize pricing object if needed
          if (!config.services[provider].pricing) {
            config.services[provider].pricing = {};
          }

          // Set pricing
          config.services[provider].pricing![model] = {
            inputCostPerMillion: inputCost,
            outputCostPerMillion: outputCost
          };

          await configManager.saveConfig(config);
          console.log(chalk.green(`\n✅ Pricing set for ${provider}/${model}:`));
          console.log(`  Input:  $${inputCost}/M tokens`);
          console.log(`  Output: $${outputCost}/M tokens\n`);

          return { success: true };
        }

        case 'list': {
          console.log(chalk.blue('\n💰 Configured Pricing:\n'));
          
          let hasPricing = false;
          for (const [provider, service] of Object.entries(config.services)) {
            if (service.pricing && Object.keys(service.pricing).length > 0) {
              hasPricing = true;
              console.log(chalk.cyan(`${provider}:`));
              
              for (const [model, pricing] of Object.entries(service.pricing)) {
                console.log(`  ${model}:`);
                console.log(`    Input:  $${pricing.inputCostPerMillion}/M tokens`);
                console.log(`    Output: $${pricing.outputCostPerMillion}/M tokens`);
              }
              console.log();
            }
          }

          if (!hasPricing) {
            console.log(chalk.yellow('No pricing configured yet.\n'));
            console.log('Configure pricing with:');
            console.log(chalk.cyan('  aia services-cost set <provider> <model> --input <cost> --output <cost>\n'));
            console.log('Or update pricing from ai-costs database:');
            console.log(chalk.cyan('  aia services-cost update\n'));
          }

          return { success: true };
        }

        case 'update': {
          console.log(chalk.blue('\n🔄 Updating pricing from ai-costs database...\n'));
          
          const success = await costCalculator.updatePricing();
          if (!success) {
            throw new Error('Failed to update pricing database');
          }

          // Get all models from ai-costs
          const allModels = await costCalculator.getAllModels();
          let updatedCount = 0;

          // Update pricing for configured models
          for (const [provider, service] of Object.entries(config.services)) {
            if (service.models) {
              for (const model of service.models) {
                // Try to find pricing in ai-costs data
                const modelPricing = allModels.find(m => 
                  m.model.toLowerCase().includes(model.toLowerCase()) ||
                  model.toLowerCase().includes(m.model.toLowerCase())
                );

                if (modelPricing && (modelPricing.inputCostPer1M > 0 || modelPricing.outputCostPer1M > 0)) {
                  if (!config.services[provider].pricing) {
                    config.services[provider].pricing = {};
                  }

                  config.services[provider].pricing![model] = {
                    inputCostPerMillion: modelPricing.inputCostPer1M,
                    outputCostPerMillion: modelPricing.outputCostPer1M
                  };

                  console.log(chalk.green(`✅ Updated ${provider}/${model}: $${modelPricing.inputCostPer1M}/$${modelPricing.outputCostPer1M} per 1M tokens`));
                  updatedCount++;
                } else {
                  console.log(chalk.yellow(`⚠️  No pricing found for ${provider}/${model}`));
                }
              }
            }
          }

          if (updatedCount > 0) {
            await configManager.saveConfig(config);
            console.log(chalk.green(`\n✅ Updated pricing for ${updatedCount} models\n`));
          } else {
            console.log(chalk.yellow('\nNo models were updated. You may need to manually set pricing.\n'));
          }

          return { success: true };
        }

        case 'remove': {
          const provider = namedArgs?.provider;
          const model = namedArgs?.model;

          if (!provider || !model) {
            console.log(chalk.red('Error: Provider and model are required for remove command'));
            console.log('Usage: aia services-cost remove <provider> <model>');
            throw new Error('Provider and model are required for remove command');
          }

          if (!config.services[provider]?.pricing?.[model]) {
            throw new Error(`No pricing configured for ${provider}/${model}`);
          }

          const { confirm } = await prompts({
            type: 'confirm',
            name: 'confirm',
            message: `Remove pricing for ${provider}/${model}?`,
            initial: false
          });

          if (confirm) {
            delete config.services[provider].pricing![model];
            
            // Clean up empty pricing object
            if (Object.keys(config.services[provider].pricing!).length === 0) {
              delete config.services[provider].pricing;
            }

            await configManager.saveConfig(config);
            console.log(chalk.green(`\n✅ Pricing removed for ${provider}/${model}\n`));
          }

          return { success: true };
        }

        default:
          console.log(chalk.red(`Unknown subcommand: ${subcommand}`));
          console.log('Available subcommands: set, list, update, remove');
          throw new Error(`Unknown subcommand: ${subcommand}`);
      }
    } catch (error: any) {
      logger.error('Services cost command error', error);
      throw error;
    }
  }
});