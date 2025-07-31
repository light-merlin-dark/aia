import { createCommand } from '@merlin/cli';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

export default createCommand({
  name: 'install',
  description: 'Install AIA CLI globally',
  usage: 'aia install',
  examples: [
    'aia install'
  ],

  async execute() {
    try {
      console.log(chalk.blue('Installing AIA CLI globally...\n'));
      
      // Check if npm is available
      try {
        await execAsync('npm --version');
      } catch (error) {
        throw new Error('npm is not available. Please install Node.js and npm first.');
      }

      // Install the package globally
      const command = 'npm install -g @light-merlin-dark/aia';
      
      console.log(chalk.gray(`Running: ${command}\n`));
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stderr.includes('WARN')) {
        console.log(chalk.yellow('Warnings:'), stderr);
      }
      
      if (stdout) {
        console.log(stdout);
      }
      
      console.log(chalk.green('✅ AIA CLI successfully installed globally!'));
      console.log(chalk.blue('\n🚀 Getting Started:'));
      console.log('  1. Run configuration: ' + chalk.cyan('aia config-list'));
      console.log('  2. Set up a service: ' + chalk.cyan('aia config-set openai apiKey sk-...'));
      console.log('  3. Add a model: ' + chalk.cyan('aia config-add-model openai gpt-4'));
      console.log('  4. Start consulting: ' + chalk.cyan('aia consult "Hello!" -m gpt-4'));
      console.log('\n📖 Documentation: https://github.com/light-merlin-dark/ai-advisor');
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(chalk.red('❌ Error installing AIA CLI:'), errorMessage);
      
      // Provide helpful suggestions
      if (errorMessage.includes('permission denied') || errorMessage.includes('EACCES')) {
        console.log(chalk.yellow('\n💡 Try running with sudo:'));
        console.log(chalk.cyan('  sudo npm install -g @light-merlin-dark/aia'));
        console.log(chalk.yellow('\nOr configure npm to install packages globally without sudo:'));
        console.log(chalk.cyan('  npm config set prefix ~/.npm-global'));
        console.log(chalk.cyan('  echo "export PATH=~/.npm-global/bin:$PATH" >> ~/.bashrc'));
      } else if (errorMessage.includes('command not found') || errorMessage.includes('not found')) {
        console.log(chalk.yellow('\n💡 Please install Node.js and npm first:'));
        console.log(chalk.cyan('  https://nodejs.org/'));
      }
      
      throw error;
    }
  }
});