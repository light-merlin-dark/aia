import { createCommand } from '@merlin/cli';
import { ConfigManager } from '../config/manager.js';
import chalk from 'chalk';

export default createCommand({
  name: 'config-clear-default',
  description: 'Clear the default model configuration',
  usage: 'aia config-clear-default',
  examples: [
    'aia config-clear-default'
  ],

  async execute() {
    try {
      const configManager = ConfigManager.getInstance();
      await configManager.clearDefaultModel();
      
      console.log(chalk.green('Default model configuration cleared'));
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clear default model';
      console.log(chalk.red(`Error: ${message}`));
      throw new Error(message);
    }
  }
});