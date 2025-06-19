import { CommandSpec } from '../types.js';
import { ConfigManager } from '../../config/manager.js';
import chalk from 'chalk';

export const configSetCommand: CommandSpec = {
  name: 'config-set',
  description: 'Set configuration values',
  arguments: [
    { name: 'service', description: 'Service name', required: true },
    { name: 'key', description: 'Configuration key', required: true },
    { name: 'value', description: 'Configuration value', required: true }
  ],
  
  async execute(args, _options, _ctx) {
    const [service, key, ...valueParts] = args;
    const value = valueParts.join(' ');
    
    if (!service || !key || !value) {
      console.log(chalk.red('Error: Missing required arguments'));
      console.log('Usage: aia config-set <service> <key> <value>');
      return { success: false, message: 'Missing required arguments' };
    }
    
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
          return { success: false, message: `Unknown configuration key: ${key}` };
      }
      
      // Save the updated configuration
      await configManager.saveConfig(config);
      
      console.log(chalk.green(`✅ Configuration updated: ${service}.${key} = ${key === 'apiKey' ? '***' : value}`));
      
      return { success: true };
    } catch (error: any) {
      console.log(chalk.red(`Error: ${error.message}`));
      return { success: false, message: error.message };
    }
  }
};