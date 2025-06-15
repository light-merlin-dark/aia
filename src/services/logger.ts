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
    console.log(chalk.blue(this.formatMessage('INFO', message, ...args)));
  }
  
  warn(message: string, ...args: any[]): void {
    console.warn(chalk.yellow(this.formatMessage('WARN', message, ...args)));
  }
  
  error(message: string, ...args: any[]): void {
    console.error(chalk.red(this.formatMessage('ERROR', message, ...args)));
  }
}