import { CommandSpec } from '../types.js';
import { ConfigManager } from '../../config/manager.js';
import chalk from 'chalk';

export const configAddModelCommand: CommandSpec = {
  name: 'config-add-model',
  description: 'Add a model to a service',
  arguments: [
    { name: 'service', description: 'Service name', required: true },
    { name: 'model', description: 'Model name', required: true }
  ],
  
  async execute(args, _options, _ctx) {
    const [service, model] = args;
    
    if (!service || !model) {
      console.log(chalk.red('Error: Missing required arguments'));
      console.log('Usage: aia config-add-model <service> <model>');
      return { success: false, message: 'Missing required arguments' };
    }
    
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();
      
      // Ensure service exists
      if (!config.services[service]) {
        console.log(chalk.yellow(`Service '${service}' not configured. Configure it first with:`));
        console.log(chalk.cyan(`  aia config-set ${service} apiKey <your-api-key>`));
        return { success: false, message: `Service '${service}' not configured` };
      }
      
      // Initialize models array if needed
      if (!config.services[service].models) {
        config.services[service].models = [];
      }
      
      // Check if model already exists
      if (config.services[service].models.includes(model)) {
        console.log(chalk.yellow(`Model '${model}' already configured for ${service}`));
        return { success: true };
      }
      
      // Add the model
      config.services[service].models.push(model);
      
      // If this is the first model and no default is set, make it default
      if (!config.defaultModel && config.services[service].models.length === 1) {
        config.defaultModel = model;
        config.defaultModels = [model];
        console.log(chalk.green(`✅ Added model '${model}' to ${service} and set as default`));
      } else {
        console.log(chalk.green(`✅ Added model '${model}' to ${service}`));
      }
      
      // Save the configuration
      await configManager.saveConfig(config);
      
      return { success: true };
    } catch (error: any) {
      console.log(chalk.red(`Error: ${error.message}`));
      return { success: false, message: error.message };
    }
  }
};