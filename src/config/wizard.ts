import prompts from 'prompts';
import chalk from 'chalk';
import { AIAdvisorConfig } from './manager';

export async function runOnboardingWizard(
  initialConfig?: Partial<AIAdvisorConfig>
): Promise<AIAdvisorConfig> {
  console.log(chalk.blue('\n🤖 AIA Setup\n'));
  
  const config: AIAdvisorConfig = {
    services: initialConfig?.services || {},
    plugins: {
      enabled: initialConfig?.plugins?.enabled || [],
      disabled: initialConfig?.plugins?.disabled || []
    },
    maxRetries: initialConfig?.maxRetries || 2,
    timeout: initialConfig?.timeout || 60000
  };
  
  // Ask which service to configure (radio selection)
  const { service } = await prompts({
    type: 'select',
    name: 'service',
    message: 'Select AI service:',
    choices: [
      { title: 'OpenAI', value: 'openai' },
      { title: 'Anthropic', value: 'anthropic' },
      { title: 'OpenRouter', value: 'openrouter' },
      { title: 'Skip', value: 'skip' }
    ]
  });
  
  if (!service || service === 'skip') {
    if (Object.keys(config.services).length === 0) {
      console.log(chalk.yellow('\n⚠️  No services configured. You need at least one service.\n'));
      process.exit(0);
    }
    return config;
  }
  
  // Ask for model string
  const { model } = await prompts({
    type: 'text',
    name: 'model',
    message: `Enter model name for ${service}:`,
    initial: service === 'openai' ? 'gpt-4-turbo' : 
             service === 'anthropic' ? 'claude-3-opus-20240229' : 
             'google/gemini-pro',
    validate: (value: string) => value.trim() ? true : 'Model name is required'
  });
  
  if (!model) {
    console.log(chalk.yellow(`\nSkipping ${service} configuration`));
    return config;
  }
  
  // Ask for API key
  const { apiKey } = await prompts({
    type: 'password',
    name: 'apiKey',
    message: `Enter ${service} API key:`,
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
    console.log(chalk.yellow(`\nSkipping ${service} configuration`));
    return config;
  }
  
  // Save configuration
  config.services[service] = {
    apiKey,
    models: [model]
  };
  
  // Set as default model if it's the first one
  if (!config.defaultModel) {
    config.defaultModel = model;
    config.defaultModels = [model];
  }
  
  // Enable the plugin
  if (!config.plugins!.enabled!.includes(service)) {
    config.plugins!.enabled!.push(service);
  }
  
  console.log(chalk.green(`\n✅ ${service} configured successfully!\n`));
  
  // Ask if they want to add another service
  const { addAnother } = await prompts({
    type: 'confirm',
    name: 'addAnother',
    message: 'Add another service?',
    initial: false
  });
  
  if (addAnother) {
    return runOnboardingWizard(config);
  }
  
  console.log(chalk.green('\n✅ Setup complete!\n'));
  console.log('Run:', chalk.cyan('aia consult "Your prompt"'));
  
  return config;
}