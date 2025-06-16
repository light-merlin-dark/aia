import { CommandSpec, CommandResult } from '../types';
import { ConfigManager } from '../../config/manager';
import { createLogger } from '../../services/logger';
import chalk from 'chalk';
import prompts from 'prompts';

const logger = createLogger('ServicesCommand');

const servicesCommand: CommandSpec = {
  name: 'services',
  description: 'Manage AI service configurations',
  help: `Usage: aia services

Description:
  Manage your AI service configurations including models and API keys.
  
  This command allows you to:
  - View configured services
  - Update model names
  - Update API keys
  - Remove services

Examples:
  # Manage services interactively
  aia services`,

  async execute(): Promise<CommandResult> {
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.getConfig();
      
      if (!config.services || Object.keys(config.services).length === 0) {
        console.log(chalk.yellow('\nNo services configured. Run any command to set up services.\n'));
        return { success: true };
      }

      // Show current services
      console.log(chalk.blue('\n🔧 Current Services:\n'));
      for (const [service, details] of Object.entries(config.services)) {
        const models = details.models || [];
        const modelStr = models.length > 0 ? models.join(', ') : 'No models configured';
        console.log(`  ${chalk.cyan(service)}:`);
        console.log(`    Models: ${modelStr}`);
        console.log(`    API Key: ${chalk.gray('***' + details.apiKey.slice(-4))}\n`);
      }

      // Ask what to do
      const { action } = await prompts({
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { title: 'Update service', value: 'update' },
          { title: 'Remove service', value: 'remove' },
          { title: 'Add new service', value: 'add' },
          { title: 'Exit', value: 'exit' }
        ]
      });

      if (!action || action === 'exit') {
        return { success: true };
      }

      if (action === 'add') {
        // Run the wizard to add a new service
        const { runOnboardingWizard } = await import('../../config/wizard');
        const newConfig = await runOnboardingWizard(config);
        await configManager.saveConfig(newConfig);
        console.log(chalk.green('\n✅ Configuration updated!\n'));
        return { success: true };
      }

      // Select service for update/remove
      const services = Object.keys(config.services);
      const { service } = await prompts({
        type: 'select',
        name: 'service',
        message: `Select service to ${action}:`,
        choices: services.map(s => ({ title: s, value: s }))
      });

      if (!service) {
        return { success: true };
      }

      if (action === 'remove') {
        const { confirm } = await prompts({
          type: 'confirm',
          name: 'confirm',
          message: `Remove ${service} configuration?`,
          initial: false
        });

        if (confirm) {
          delete config.services[service];
          // Remove from enabled plugins
          if (config.plugins?.enabled) {
            config.plugins.enabled = config.plugins.enabled.filter(p => p !== service);
          }
          await configManager.saveConfig(config);
          console.log(chalk.green(`\n✅ ${service} removed!\n`));
        }
        return { success: true };
      }

      // Update service
      const { updateType } = await prompts({
        type: 'select',
        name: 'updateType',
        message: `What would you like to update for ${service}?`,
        choices: [
          { title: 'Model name', value: 'model' },
          { title: 'API key', value: 'apikey' },
          { title: 'Both', value: 'both' }
        ]
      });

      if (!updateType) {
        return { success: true };
      }

      const currentModels = config.services[service].models || [];
      const currentModel = currentModels[0] || '';

      if (updateType === 'model' || updateType === 'both') {
        const { model } = await prompts({
          type: 'text',
          name: 'model',
          message: `Enter model name for ${service}:`,
          initial: currentModel,
          validate: (value: string) => value.trim() ? true : 'Model name is required'
        });

        if (model) {
          config.services[service].models = [model.trim()];
          // Update default model if it was the old model
          if (config.defaultModel === currentModel) {
            config.defaultModel = model.trim();
            config.defaultModels = [model.trim()];
          }
        }
      }

      if (updateType === 'apikey' || updateType === 'both') {
        const { apiKey } = await prompts({
          type: 'password',
          name: 'apiKey',
          message: `Enter new API key for ${service}:`,
          validate: (value: string) => {
            if (!value) return 'API key is required';
            if (service === 'openai' && !value.startsWith('sk-')) {
              return 'OpenAI API key should start with "sk-"';
            }
            if (service === 'anthropic' && !value.includes('ant')) {
              return 'Anthropic API key should contain "ant"';
            }
            return true;
          }
        });

        if (apiKey) {
          config.services[service].apiKey = apiKey;
        }
      }

      await configManager.saveConfig(config);
      console.log(chalk.green(`\n✅ ${service} updated successfully!\n`));

      return { success: true };
    } catch (error: any) {
      logger.error('Services command error', error);
      return {
        success: false,
        message: `Error managing services: ${error.message}`
      };
    }
  }
};

export default servicesCommand;