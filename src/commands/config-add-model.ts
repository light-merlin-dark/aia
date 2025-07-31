import { createCommand } from '@merlin/cli';
import { ConfigManager } from '../config/manager.js';
import chalk from 'chalk';

export default createCommand({
  name: 'config-add-model',
  description: 'Add a model to a service',
  usage: 'aia config-add-model <service> <model>',
  examples: [
    'aia config-add-model openai gpt-4',
    'aia config-add-model anthropic claude-3-sonnet-20240229'
  ],
  
  args: {
    service: {
      type: 'string',
      description: 'Service name',
      required: true
    },
    model: {
      type: 'string',
      description: 'Model name',
      required: true
    }
  },
  
  async execute({ namedArgs }) {
    const { service, model } = namedArgs!;
    
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();
      
      // Ensure service exists
      if (!config.services[service]) {
        console.log(chalk.yellow(`Service '${service}' not configured. Configure it first with:`));
        console.log(chalk.cyan(`  aia config-set ${service} apiKey <your-api-key>`));
        throw new Error(`Service '${service}' not configured`);
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
      throw error;
    }
  }
});