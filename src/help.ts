import chalk from 'chalk';

export function showHelp(commandName?: string): void {
  console.log(chalk.bold('\nAI Advisor CLI'));
  console.log('Parallel AI model consultation with retry and failover\n');
  
  console.log(chalk.bold('Usage:'));
  console.log('  aia <command> [options]\n');
  
  console.log(chalk.bold('Main Commands:'));
  console.log('  ' + chalk.cyan('consult') + '                    Query AI models with a prompt');
  console.log('  ' + chalk.cyan('services') + '                   List available AI services');
  console.log('  ' + chalk.cyan('services-cost') + '              Compare service costs\n');
  
  console.log(chalk.bold('Configuration:'));
  console.log('  ' + chalk.cyan('config-list') + '                Show all configuration');
  console.log('  ' + chalk.cyan('config-set') + '                 Set API keys and settings');
  console.log('  ' + chalk.cyan('config-get') + '                 Get a config value');
  console.log('  ' + chalk.cyan('config-add-model') + '           Add model to a service');
  console.log('  ' + chalk.cyan('config-remove') + '              Remove a config key');
  console.log('  ' + chalk.cyan('config-set-default') + '         Set default model');
  console.log('  ' + chalk.cyan('config-set-default-service') + ' Set default service');
  console.log('  ' + chalk.cyan('config-clear-default') + '       Clear default model\n');
  
  console.log(chalk.bold('Other:'));
  console.log('  ' + chalk.cyan('install') + '                    Install required dependencies');
  console.log('  ' + chalk.cyan('reset') + '                      Reset all configuration\n');
  
  console.log(chalk.bold('Examples:'));
  console.log('  ' + chalk.gray('# Query multiple models'));
  console.log('  aia consult "Explain quantum computing" -m claude-3-5-sonnet,gpt-4o\n');
  
  console.log('  ' + chalk.gray('# Attach files to prompt'));
  console.log('  aia consult "Review this code" -m claude-3-5-sonnet -f src/index.ts\n');
  
  console.log('  ' + chalk.gray('# Use service/model format'));
  console.log('  aia consult "Hello" -m anthropic/claude-3-5-sonnet,openai/gpt-4o\n');
  
  console.log('  ' + chalk.gray('# Pipe input'));
  console.log('  echo "What is this?" | aia consult -m claude-3-5-sonnet -f image.png\n');
  
  console.log('  ' + chalk.gray('# Configure API keys'));
  console.log('  aia config-set anthropic.apiKey sk-ant-...\n');
  
  console.log('Run \'aia help [command]\' for detailed command help.');
  
  if (commandName) {
    console.log('\n' + chalk.bold(`Help for command: ${commandName}`));
    console.log('Use \'aia ' + commandName + ' --help\' for detailed options\n');
  }
}