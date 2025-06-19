import { CommandSpec, CommandResult } from '../types';
import { ConfigManager } from '../../config/manager';
import chalk from 'chalk';

const configClearDefaultCommand: CommandSpec = {
  name: 'config-clear-default',
  description: 'Clear the default model configuration',
  help: `Usage: aia config-clear-default

Description:
  Removes any global default model configuration. After clearing, 
  the system will use the models from the default service instead.

Examples:
  aia config-clear-default`,

  async execute(): Promise<CommandResult> {
    try {
      const configManager = ConfigManager.getInstance();
      await configManager.clearDefaultModel();
      
      return {
        success: true,
        message: chalk.green('Default model configuration cleared')
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to clear default model'
      };
    }
  }
};

export default configClearDefaultCommand;