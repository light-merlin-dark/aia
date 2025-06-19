import { CommandSpec } from '../types.js';
import { ConfigManager } from '../../config/manager.js';
import { maskValue } from '../../config/crypto.js';
import chalk from 'chalk';

export const configGetCommand: CommandSpec = {
  name: 'config-get',
  description: 'Get configuration values',
  arguments: [
    { name: 'service', description: 'Service name', required: true },
    { name: 'key', description: 'Configuration key', required: false }
  ],
  
  async execute(args, _options, _ctx) {
    const [service, key] = args;
    
    if (!service) {
      console.log(chalk.red('Error: Service name required'));
      console.log('Usage: aia config-get <service> [key]');
      return { success: false, message: 'Service name required' };
    }
    
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();
      
      if (!config.services[service]) {
        console.log(chalk.yellow(`Service '${service}' not configured`));
        return { success: false, message: `Service '${service}' not configured` };
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
            return { success: false, message: `Unknown key: ${key}` };
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
      return { success: false, message: error.message };
    }
  }
};