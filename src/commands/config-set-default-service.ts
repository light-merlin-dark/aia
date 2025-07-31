import { createCommand } from '@merlin/cli';
import { ConfigManager } from '../config/manager.js';
import { createLogger } from '../services/logger.js';
import chalk from 'chalk';

const logger = createLogger('ConfigSetDefaultService');

export default createCommand({
  name: 'config-set-default-service',
  description: 'Set the default service (e.g., openai, anthropic, openrouter)',
  usage: 'aia config-set-default-service <service>',
  examples: [
    'aia config-set-default-service openai',
    'aia config-set-default-service anthropic'
  ],
  
  args: {
    service: {
      type: 'string',
      description: 'The service to set as default',
      required: true
    }
  },
  
  async execute({ namedArgs }) {
    const { service } = namedArgs!;
    
    const configManager = ConfigManager.getInstance();
    
    try {
      const config = await configManager.getConfig();
      
      // Verify service exists
      if (!config.services[service]) {
        logger.error(`Service '${service}' not found`);
        const availableServices = Object.keys(config.services).filter((s: string) => s !== 'default');
        throw new Error(`Service '${service}' not found. Available services: ${availableServices.join(', ')}`);
      }
      
      // Set default service
      (config as any).defaultService = service;
      
      await configManager.saveConfig(config);
      
      logger.info(`Default service set to: ${service}`);
      console.log(chalk.green(`✅ Default service set to: ${service}`));
      
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to set default service:', error);
      console.log(chalk.red(`Error: ${error.message}`));
      throw error;
    }
  }
});