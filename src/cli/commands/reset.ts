import { CommandSpec, CommandResult } from '../types';
import { createLogger } from '../../services/logger';
import chalk from 'chalk';
import prompts from 'prompts';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const logger = createLogger('ResetCommand');

interface ResetOptions {
  force?: boolean;
}

const resetCommand: CommandSpec = {
  name: 'reset',
  description: 'Reset AIA configuration',
  help: `Usage: aia reset [options]

Description:
  Removes the AIA configuration file, allowing you to start fresh.

Options:
  -f, --force     Skip confirmation prompt

Examples:
  # Reset with confirmation
  aia reset

  # Reset without confirmation
  aia reset --force
  aia reset -f`,

  options: [
    {
      flag: '-f, --force',
      description: 'Skip confirmation prompt',
      type: 'boolean',
      default: false
    }
  ],

  async execute(_args: string[], options: ResetOptions): Promise<CommandResult> {
    const configDir = process.env.AIA_CONFIG_DIR || join(homedir(), '.aia');
    const configPath = join(configDir, 'config.enc');
    const oldConfigPath = join(configDir, 'config.json');

    // Check if config exists (either new or old format)
    if (!existsSync(configPath) && !existsSync(oldConfigPath)) {
      logger.info('No configuration found to reset');
      return {
        success: true,
        message: 'No configuration exists'
      };
    }

    // Confirm unless --force is used
    if (!options.force) {
      const { confirmed } = await prompts({
        type: 'confirm',
        name: 'confirmed',
        message: 'Are you sure you want to reset your AIA configuration?',
        initial: false
      });

      if (!confirmed) {
        logger.info('Reset cancelled');
        return {
          success: true,
          message: 'Reset cancelled'
        };
      }
    }

    try {
      // Remove the config files (both new and old format)
      if (existsSync(configPath)) {
        rmSync(configPath);
      }
      if (existsSync(oldConfigPath)) {
        rmSync(oldConfigPath);
      }
      logger.info('Configuration reset successfully');
      
      console.log(chalk.green('\n✅ Configuration reset successfully!'));
      console.log(chalk.gray('Run any command to set up a new configuration.'));
      
      return {
        success: true,
        message: 'Configuration reset successfully'
      };
    } catch (error: any) {
      logger.error('Failed to reset configuration', error);
      return {
        success: false,
        message: `Failed to reset configuration: ${error.message}`
      };
    }
  }
};

export default resetCommand;