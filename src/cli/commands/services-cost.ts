import { CommandSpec, CommandResult, CommandOptions } from '../types';
import { ConfigManager } from '../../config/manager';
import { createLogger } from '../../services/logger';
import chalk from 'chalk';
import prompts from 'prompts';

const logger = createLogger('ServicesCostCommand');

const servicesCostCommand: CommandSpec = {
  name: 'services',
  description: 'Manage AI service pricing configurations',
  help: `Usage: aia services cost <subcommand> [options]

Subcommands:
  set <provider> <model>    Set pricing for a model
  list                      List all configured pricing
  remove <provider> <model> Remove pricing for a model

Options:
  --input <cost>   Input cost per million tokens (for set command)
  --output <cost>  Output cost per million tokens (for set command)

Examples:
  # Set pricing for a model
  aia services cost set openai gpt-4-turbo --input 10 --output 30
  
  # List all pricing
  aia services cost list
  
  # Remove pricing
  aia services cost remove openai gpt-4-turbo`,

  async execute(args: string[], options: CommandOptions): Promise<CommandResult> {
    try {
      // Check if this is a cost subcommand
      if (args[0] !== 'cost') {
        // Delegate to original services command
        const servicesCommand = (await import('./services')).default;
        return servicesCommand.execute(args, options, {} as any);
      }

      const subcommand = args[1];
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();

      switch (subcommand) {
        case 'set': {
          const provider = args[2];
          const model = args[3];

          if (!provider || !model) {
            return {
              success: false,
              message: 'Usage: aia services cost set <provider> <model> --input <cost> --output <cost>'
            };
          }

          // Check if service exists
          if (!config.services[provider]) {
            return {
              success: false,
              message: `Service "${provider}" not configured. Run "aia services" to add it first.`
            };
          }

          let inputCost: number | undefined;
          let outputCost: number | undefined;

          // Parse command line options if provided
          const inputOption = options.input;
          const outputOption = options.output;
          
          if (typeof inputOption === 'string') {
            inputCost = parseFloat(inputOption.replace(/^\$/, ''));
          } else if (typeof inputOption === 'number') {
            inputCost = inputOption;
          }
          
          if (typeof outputOption === 'string') {
            outputCost = parseFloat(outputOption.replace(/^\$/, ''));
          } else if (typeof outputOption === 'number') {
            outputCost = outputOption;
          }

          // If not provided via options, prompt interactively
          if (inputCost === undefined || outputCost === undefined) {
            console.log(chalk.gray('\nExamples: $0.15, $5.00, 10.50'));
            
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

          // Validate parsed command line values
          if (inputCost !== undefined && (isNaN(inputCost) || inputCost < 0 || inputCost > 1000)) {
            return {
              success: false,
              message: 'Invalid input cost. Must be between $0 and $1000 per million tokens.'
            };
          }
          if (outputCost !== undefined && (isNaN(outputCost) || outputCost < 0 || outputCost > 1000)) {
            return {
              success: false,
              message: 'Invalid output cost. Must be between $0 and $1000 per million tokens.'
            };
          }

          if (inputCost === undefined || outputCost === undefined) {
            return {
              success: false,
              message: 'Both input and output costs are required'
            };
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
            console.log(chalk.cyan('  aia services cost set <provider> <model> --input <cost> --output <cost>\n'));
          }

          return { success: true };
        }

        case 'remove': {
          const provider = args[2];
          const model = args[3];

          if (!provider || !model) {
            return {
              success: false,
              message: 'Usage: aia services cost remove <provider> <model>'
            };
          }

          if (!config.services[provider]?.pricing?.[model]) {
            return {
              success: false,
              message: `No pricing configured for ${provider}/${model}`
            };
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
          return {
            success: false,
            message: 'Usage: aia services cost <set|list|remove> [options]'
          };
      }
    } catch (error: any) {
      logger.error('Services cost command error', error);
      return {
        success: false,
        message: `Error managing pricing: ${error.message}`
      };
    }
  }
};

export default servicesCostCommand;