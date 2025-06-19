import { CommandSpec } from '../types.js';
import { ConfigManager } from '../../config/manager.js';
import chalk from 'chalk';

export const configSetDefaultCommand: CommandSpec = {
  name: 'config-set-default',
  description: 'Set the default model',
  arguments: [
    { name: 'model', description: 'Model name', required: true }
  ],
  
  async execute(args, _options, _ctx) {
    const [model] = args;
    
    if (!model) {
      console.log(chalk.red('Error: Model name required'));
      console.log('Usage: aia config-set-default <model>');
      return { success: false, message: 'Model name required' };
    }
    
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();
      
      // Find which service has this model
      let foundService: string | undefined;
      let foundModel: string | undefined;
      
      for (const [service, serviceConfig] of Object.entries(config.services)) {
        if (serviceConfig.models?.includes(model)) {
          foundService = service;
          foundModel = model;
          break;
        }
        
        // Check if model includes service prefix
        if (model.startsWith(`${service}/`)) {
          const modelName = model.substring(service.length + 1);
          if (serviceConfig.models?.includes(modelName)) {
            foundService = service;
            foundModel = modelName;
            break;
          }
        }
      }
      
      if (!foundService) {
        console.log(chalk.yellow(`Model '${model}' not found in any configured service`));
        console.log('\nAvailable models:');
        
        for (const [service, serviceConfig] of Object.entries(config.services)) {
          if (serviceConfig.models?.length) {
            console.log(`  ${service}:`, serviceConfig.models.join(', '));
          }
        }
        
        return { success: false, message: `Model '${model}' not found` };
      }
      
      // Set as default
      config.defaultModel = foundModel!;
      config.defaultModels = [foundModel!];
      
      // Enable the plugin if not already enabled
      if (!config.plugins) {
        config.plugins = { enabled: [], disabled: [] };
      }
      if (!config.plugins.enabled?.includes(foundService)) {
        config.plugins.enabled?.push(foundService);
      }
      
      // Save configuration
      await configManager.saveConfig(config);
      
      console.log(chalk.green(`✅ Default model set to: ${foundModel} (${foundService})`));
      
      return { success: true };
    } catch (error: any) {
      console.log(chalk.red(`Error: ${error.message}`));
      return { success: false, message: error.message };
    }
  }
};