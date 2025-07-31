import { createCommand } from '@merlin/cli';
import { ConfigManager } from '../config/manager.js';
import chalk from 'chalk';
import prompts from 'prompts';

export default createCommand({
  name: 'config-remove',
  description: 'Remove a service from configuration',
  usage: 'aia config-remove <service>',
  examples: [
    'aia config-remove openai',
    'aia config-remove anthropic'
  ],
  
  args: {
    service: {
      type: 'string',
      description: 'Service name to remove',
      required: true
    }
  },
  
  async execute({ namedArgs }) {
    const { service } = namedArgs!;
    
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();
      
      if (!config.services[service]) {
        console.log(chalk.yellow(`Service '${service}' not found in configuration`));
        throw new Error(`Service '${service}' not found`);
      }
      
      // Confirm removal
      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: `Remove ${service} from configuration?`,
        initial: false
      });
      
      if (!confirm) {
        console.log(chalk.gray('Cancelled'));
        return { success: true };
      }
      
      // Check if this service contains the default model
      const isDefault = config.defaultModel && 
        config.services[service].models?.includes(config.defaultModel);
      
      // Remove the service
      delete config.services[service];
      
      // Remove from plugins
      if (config.plugins?.enabled) {
        config.plugins.enabled = config.plugins.enabled.filter(p => p !== service);
      }
      
      // Clear default if it was from this service
      if (isDefault) {
        config.defaultModel = undefined;
        config.defaultModels = undefined;
        console.log(chalk.yellow('Note: Default model cleared as it belonged to removed service'));
      }
      
      // Save configuration
      await configManager.saveConfig(config);
      
      console.log(chalk.green(`✅ Service '${service}' removed from configuration`));
      
      return { success: true };
    } catch (error: any) {
      console.log(chalk.red(`Error: ${error.message}`));
      throw error;
    }
  }
});