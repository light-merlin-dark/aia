import { createCommand } from '@merlin/cli';
import { ConfigManager } from '../config/manager.js';
import chalk from 'chalk';

export default createCommand({
  name: 'config-set-default',
  description: 'Set the default model',
  usage: 'aia config-set-default <model>',
  examples: [
    'aia config-set-default gpt-4',
    'aia config-set-default claude-3-haiku-20240307',
    'aia config-set-default openai/gpt-4'
  ],
  
  args: {
    model: {
      type: 'string',
      description: 'Model name',
      required: true
    }
  },
  
  async execute({ namedArgs }) {
    const { model } = namedArgs!;
    
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
        
        throw new Error(`Model '${model}' not found`);
      }
      
      // Set as default with service prefix
      config.defaultModel = `${foundService}/${foundModel!}`;
      config.defaultModels = [`${foundService}/${foundModel!}`];
      
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
      throw error;
    }
  }
});