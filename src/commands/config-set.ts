import { createCommand } from '@merlin/cli';
import { ConfigManager } from '../config/manager.js';
import chalk from 'chalk';

export default createCommand({
  name: 'config-set',
  description: 'Set configuration values',
  usage: 'aia config-set <service> <key> <value>',
  examples: [
    'aia config-set openai apiKey sk-...',
    'aia config-set anthropic model claude-3-haiku-20240307',
    'aia config-set openai endpoint https://api.openai.com/v1'
  ],
  
  args: {
    service: {
      type: 'string',
      description: 'Service name',
      required: true
    },
    key: {
      type: 'string',
      description: 'Configuration key (apiKey, model, endpoint, default)',
      required: true
    },
    value: {
      type: 'string',
      description: 'Configuration value',
      required: true
    }
  },
  
  async execute({ namedArgs }) {
    const { service, key, value } = namedArgs!;
    
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();
      
      // Ensure service exists
      if (!config.services[service]) {
        config.services[service] = { apiKey: '' };
      }
      
      // Handle different key types
      switch (key) {
        case 'apiKey':
          config.services[service].apiKey = value;
          break;
          
        case 'model':
          // Add model to the service's model list
          if (!config.services[service].models) {
            config.services[service].models = [];
          }
          if (!config.services[service].models.includes(value)) {
            config.services[service].models.push(value);
          }
          break;
          
        case 'endpoint':
          config.services[service].endpoint = value;
          break;
          
        case 'default':
          // Set this service's first model as default
          if (value.toLowerCase() === 'true' && config.services[service].models?.length) {
            config.defaultModel = config.services[service].models[0];
            config.defaultModels = config.services[service].models;
          }
          break;
          
        default:
          console.log(chalk.yellow(`Warning: Unknown configuration key: ${key}`));
          throw new Error(`Unknown configuration key: ${key}`);
      }
      
      // Save the updated configuration
      await configManager.saveConfig(config);
      
      console.log(chalk.green(`✅ Configuration updated: ${service}.${key} = ${key === 'apiKey' ? '***' : value}`));
      
      return { success: true };
    } catch (error: any) {
      console.log(chalk.red(`Error: ${error.message}`));
      throw error;
    }
  }
});