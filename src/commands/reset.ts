import { createCommand } from '@merlin/cli';
import { createLogger } from '../services/logger.js';
import chalk from 'chalk';
import prompts from 'prompts';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const logger = createLogger('ResetCommand');

export default createCommand({
  name: 'reset',
  description: 'Reset AIA configuration',
  usage: 'aia reset [options]',
  examples: [
    'aia reset',
    'aia reset --force'
  ],

  options: {
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Skip confirmation prompt'
    }
  },

  async execute({ options }) {
    const configDir = process.env.AIA_CONFIG_DIR || join(homedir(), '.aia');
    const configPath = join(configDir, 'config.enc');
    const oldConfigPath = join(configDir, 'config.json');

    // Check if config exists (either new or old format)
    if (!existsSync(configPath) && !existsSync(oldConfigPath)) {
      logger.info('No configuration found to reset');
      console.log(chalk.yellow('No configuration exists'));
      return { success: true };
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
        console.log(chalk.gray('Reset cancelled'));
        return { success: true };
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
      
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to reset configuration', error);
      throw new Error(`Failed to reset configuration: ${error.message}`);
    }
  }
});