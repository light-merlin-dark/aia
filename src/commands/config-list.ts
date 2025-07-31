import { createCommand } from '@merlin/cli';
import { ConfigManager } from '../config/manager.js';
import { maskValue } from '../config/crypto.js';
import chalk from 'chalk';

export default createCommand({
  name: 'config-list',
  description: 'List all configuration',
  usage: 'aia config-list',
  examples: [
    'aia config-list'
  ],
  
  async execute() {
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();
      
      console.log(chalk.blue('\n🔧 AI Advisor Configuration\n'));
      
      // Display services
      console.log(chalk.cyan('Services:'));
      for (const [service, serviceConfig] of Object.entries(config.services)) {
        const isDefault = config.defaultModel && 
          (serviceConfig.models?.includes(config.defaultModel) || 
           config.defaultModel?.startsWith(`${service}/`));
        
        console.log(`\n  ${chalk.bold(service)}${isDefault ? chalk.green(' (default)') : ''}:`);
        console.log(`    API Key: ${maskValue(serviceConfig.apiKey)}`);
        console.log(`    Models: ${serviceConfig.models?.join(', ') || chalk.gray('No models configured')}`);
        
        if (serviceConfig.endpoint) {
          console.log(`    Endpoint: ${serviceConfig.endpoint}`);
        }
        
        // Show pricing if configured
        if (serviceConfig.pricing) {
          console.log('    Pricing:');
          for (const [model, pricing] of Object.entries(serviceConfig.pricing)) {
            console.log(`      ${model}: $${pricing.inputCostPerMillion}/M in, $${pricing.outputCostPerMillion}/M out`);
          }
        }
      }
      
      // Display global settings
      console.log(chalk.cyan('\nGlobal Settings:'));
      console.log(`  Default Model: ${config.defaultModel || chalk.gray('Not set')}`);
      console.log(`  Max Retries: ${config.maxRetries || 2}`);
      console.log(`  Timeout: ${config.timeout || 60000}ms`);
      
      // Display plugins if configured
      if (config.plugins) {
        console.log(chalk.cyan('\nPlugins:'));
        if (config.plugins.enabled?.length) {
          console.log(`  Enabled: ${config.plugins.enabled.join(', ')}`);
        }
        if (config.plugins.disabled?.length) {
          console.log(`  Disabled: ${config.plugins.disabled.join(', ')}`);
        }
      }
      
      console.log('');
      
      return { success: true };
    } catch (error: any) {
      console.log(chalk.red(`Error: ${error.message}`));
      throw error;
    }
  }
});