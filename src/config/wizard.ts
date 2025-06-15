import prompts from 'prompts';
import chalk from 'chalk';
import { AIAdvisorConfig } from './manager';
import { maskValue } from './crypto';

const AVAILABLE_MODELS = {
  openai: ['gpt-4-turbo', 'gpt-4o', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
  openrouter: ['meta-llama/llama-3-70b-instruct', 'google/gemini-pro', 'mistralai/mixtral-8x7b-instruct']
};

export async function runOnboardingWizard(
  initialConfig?: Partial<AIAdvisorConfig>
): Promise<AIAdvisorConfig> {
  console.log(chalk.blue('\n🤖 Welcome to AI Advisor!\n'));
  console.log('Let\'s set up your AI providers. You can always change these settings later.\n');
  
  const config: AIAdvisorConfig = {
    services: initialConfig?.services || {},
    plugins: {
      enabled: [],
      disabled: []
    }
  };
  
  // Ask which services to configure
  const { selectedServices } = await prompts({
    type: 'multiselect',
    name: 'selectedServices',
    message: 'Which AI services would you like to configure?',
    choices: [
      { 
        title: 'OpenAI', 
        value: 'openai',
        selected: !!config.services.openai
      },
      { 
        title: 'Anthropic (Claude)', 
        value: 'anthropic',
        selected: !!config.services.anthropic
      },
      { 
        title: 'OpenRouter', 
        value: 'openrouter',
        selected: !!config.services.openrouter
      }
    ],
    hint: 'Space to select, Enter to confirm'
  });
  
  if (!selectedServices || selectedServices.length === 0) {
    console.log(chalk.yellow('\n⚠️  No services selected. You\'ll need to configure at least one service to use AI Advisor.\n'));
    process.exit(0);
  }
  
  // Configure each selected service
  for (const service of selectedServices) {
    console.log(chalk.blue(`\n📋 Configuring ${service}...\n`));
    
    const existingKey = config.services[service]?.apiKey;
    const maskedKey = existingKey ? maskValue(existingKey) : '';
    
    const { apiKey } = await prompts({
      type: 'password',
      name: 'apiKey',
      message: `Enter your ${service} API key:`,
      initial: existingKey || '',
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
    
    if (!apiKey) {
      console.log(chalk.yellow(`Skipping ${service} configuration`));
      continue;
    }
    
    // Ask for preferred models
    const availableModels = AVAILABLE_MODELS[service as keyof typeof AVAILABLE_MODELS] || [];
    if (availableModels.length > 0) {
      const { models } = await prompts({
        type: 'multiselect',
        name: 'models',
        message: `Select preferred models for ${service}:`,
        choices: availableModels.map(model => ({
          title: model,
          value: model,
          selected: true
        })),
        hint: 'Space to select, Enter to confirm'
      });
      
      config.services[service] = {
        apiKey,
        models: models || availableModels
      };
    } else {
      config.services[service] = { apiKey };
    }
    
    // Enable the plugin
    if (!config.plugins!.enabled!.includes(service)) {
      config.plugins!.enabled!.push(service);
    }
  }
  
  // Ask for default model
  const allModels: string[] = [];
  for (const [service, serviceConfig] of Object.entries(config.services)) {
    const models = serviceConfig.models || AVAILABLE_MODELS[service as keyof typeof AVAILABLE_MODELS] || [];
    allModels.push(...models);
  }
  
  if (allModels.length > 0) {
    const { defaultModel } = await prompts({
      type: 'select',
      name: 'defaultModel',
      message: 'Select your default model:',
      choices: allModels.map(model => ({
        title: model,
        value: model
      })),
      initial: 0
    });
    
    config.defaultModel = defaultModel;
    config.defaultModels = [defaultModel];
  }
  
  // Additional settings
  const { advancedSettings } = await prompts({
    type: 'confirm',
    name: 'advancedSettings',
    message: 'Would you like to configure advanced settings?',
    initial: false
  });
  
  if (advancedSettings) {
    const advanced = await prompts([
      {
        type: 'number',
        name: 'maxRetries',
        message: 'Maximum retry attempts for failed requests:',
        initial: 2,
        min: 0,
        max: 5
      },
      {
        type: 'number',
        name: 'timeout',
        message: 'Request timeout in seconds:',
        initial: 60,
        min: 10,
        max: 300
      }
    ]);
    
    config.maxRetries = advanced.maxRetries;
    config.timeout = advanced.timeout * 1000; // Convert to milliseconds
  } else {
    config.maxRetries = 2;
    config.timeout = 60000; // 60 seconds
  }
  
  console.log(chalk.green('\n✅ Configuration complete!\n'));
  console.log('Your settings have been encrypted and saved to ~/.ai-advisor/');
  console.log('\nYou can now use AI Advisor with the following command:');
  console.log(chalk.cyan('  ai-advisor consult "Your prompt here"'));
  console.log('\nFor MCP integration with Claude Desktop, run:');
  console.log(chalk.cyan('  ai-advisor mcp-setup'));
  
  return config;
}