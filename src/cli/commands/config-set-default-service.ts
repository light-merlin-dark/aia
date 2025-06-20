import { CommandSpec } from '../types';
import { ConfigManager } from '../../config/manager';
import { Logger } from '../../services/logger';

export const command: CommandSpec = {
  name: 'config-set-default-service',
  description: 'Set the default service (e.g., openai, anthropic, openrouter)',
  help: 'Usage: aia config-set-default-service <service>\n\nExamples:\n  aia config-set-default-service openai\n  aia config-set-default-service anthropic',
  arguments: [
    {
      name: 'service',
      description: 'The service to set as default',
      required: true
    }
  ],
  async execute(args) {
    const logger = new Logger('ConfigSetDefaultService');
    
    if (args.length < 1) {
      logger.error('Service name required');
      return {
        success: false,
        message: 'Service name required. Usage: aia config-set-default-service <service>'
      };
    }
    
    const service = args[0];
    const configManager = ConfigManager.getInstance();
    
    try {
      const config = await configManager.getConfig();
      
      // Verify service exists
      if (!config.services[service]) {
        logger.error(`Service '${service}' not found`);
        return {
          success: false,
          message: `Service '${service}' not found. Available services: ${Object.keys(config.services).filter((s: string) => s !== 'default').join(', ')}`
        };
      }
      
      // Set default service
      (config as any).defaultService = service;
      
      // If service has only one model, also set it as default model
      const serviceConfig = config.services[service];
      if (serviceConfig.models && serviceConfig.models.length === 1) {
        config.defaultModel = `${service}/${serviceConfig.models[0]}`;
        logger.info(`Also setting default model to ${config.defaultModel} (only model in service)`);
      }
      
      await configManager.saveConfig(config);
      
      logger.info(`Default service set to: ${service}`);
      console.log(`✓ Default service set to: ${service}`);
      
      if (config.defaultModel) {
        console.log(`✓ Default model set to: ${config.defaultModel}`);
      }
      
      return {
        success: true,
        message: `Default service set to: ${service}`
      };
    } catch (error: any) {
      logger.error('Failed to set default service:', error);
      return {
        success: false,
        message: `Error setting default service: ${error.message}`
      };
    }
  }
};