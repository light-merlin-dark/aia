import { createCommand } from '@merlin/cli';
import { ConfigManager } from '../config/manager.js';
import { maskValue } from '../config/crypto.js';
import chalk from 'chalk';

export default createCommand({
  name: 'config-get',
  description: 'Get configuration values',
  usage: 'aia config-get <service> [key]',
  examples: [
    'aia config-get openai',
    'aia config-get openai apiKey',
    'aia config-get anthropic models'
  ],
  
  args: {
    service: {
      type: 'string',
      description: 'Service name',
      required: true
    },
    key: {
      type: 'string',
      description: 'Configuration key (apiKey, models, endpoint, default)',
      required: false
    }
  },
  
  async execute({ namedArgs }) {
    const { service, key } = namedArgs!;
    
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();
      
      if (!config.services[service]) {
        console.log(chalk.yellow(`Service '${service}' not configured`));
        throw new Error(`Service '${service}' not configured`);
      }
      
      const serviceConfig = config.services[service];
      
      if (key) {
        // Get specific key
        let value: any;
        switch (key) {
          case 'apiKey':
            value = maskValue(serviceConfig.apiKey);
            break;
          case 'models':
            value = serviceConfig.models?.join(', ') || 'No models configured';
            break;
          case 'endpoint':
            value = serviceConfig.endpoint || 'Default endpoint';
            break;
          case 'default':
            value = config.defaultModel?.startsWith(service) ? 'true' : 'false';
            break;
          default:
            console.log(chalk.yellow(`Unknown key: ${key}`));
            throw new Error(`Unknown key: ${key}`);
        }
        
        console.log(chalk.cyan(`${service}.${key}:`), value);
      } else {
        // Get all service config
        console.log(chalk.blue(`\n${service} configuration:`));
        console.log('  API Key:', maskValue(serviceConfig.apiKey));
        console.log('  Models:', serviceConfig.models?.join(', ') || 'No models configured');
        if (serviceConfig.endpoint) {
          console.log('  Endpoint:', serviceConfig.endpoint);
        }
        
        // Check if this is the default service
        const isDefault = config.defaultModel && 
          (config.services[service].models?.includes(config.defaultModel) || 
           config.defaultModel.startsWith(`${service}/`));
        
        if (isDefault) {
          console.log('  Default:', chalk.green('Yes'));
        }
      }
      
      return { success: true };
    } catch (error: any) {
      console.log(chalk.red(`Error: ${error.message}`));
      throw error;
    }
  }
});