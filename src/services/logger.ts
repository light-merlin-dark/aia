import chalk from 'chalk';

export class Logger {
  constructor(private context: string = 'App') {}
  
  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + JSON.stringify(args) : '';
    return `[${timestamp}] [${level}] [${this.context}] ${message}${formattedArgs}`;
  }
  
  debug(message: string, ...args: any[]): void {
    if (process.env.DEBUG || process.env.LOG_LEVEL === 'debug') {
      console.log(chalk.gray(this.formatMessage('DEBUG', message, ...args)));
    }
  }
  
  info(message: string, ...args: any[]): void {
    // Suppress plugin loading logs for a cleaner CLI experience
    if (message.includes('Loaded plugin') || 
        message.includes('Registered plugin') || 
        message.includes('plugin loaded successfully') ||
        message.includes('Enabled plugin')) {
      return;
    }
    
    // Suppress all info logs unless verbose is explicitly enabled
    const cliArgs = process.argv.slice(2);
    const isHelp = cliArgs.length === 0 || cliArgs[0] === 'help' || cliArgs[0] === '--help';
    const isVerbose = cliArgs.includes('--verbose') || cliArgs.includes('-v');
    
    if (process.env.AIA_QUIET === 'true' || isHelp || !isVerbose) {
      return;
    }
    console.log(chalk.blue(this.formatMessage('INFO', message, ...args)));
  }
  
  warn(message: string, ...args: any[]): void {
    console.warn(chalk.yellow(this.formatMessage('WARN', message, ...args)));
  }
  
  error(message: string, ...args: any[]): void {
    console.error(chalk.red(this.formatMessage('ERROR', message, ...args)));
  }
  
  log(level: string, message: string, ...args: any[]): void {
    switch (level.toLowerCase()) {
      case 'debug':
        this.debug(message, ...args);
        break;
      case 'info':
        this.info(message, ...args);
        break;
      case 'warn':
        this.warn(message, ...args);
        break;
      case 'error':
        this.error(message, ...args);
        break;
      default:
        this.info(message, ...args);
    }
  }
}

// Factory function for creating logger instances
export function createLogger(context: string): Logger {
  return new Logger(context);
}