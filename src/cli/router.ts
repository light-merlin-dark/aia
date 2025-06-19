import { CommandSpec, CommandOptions, RuntimeContext, CommandResult } from './types';
import { createLogger } from '../services/logger';

const logger = createLogger('CLI Router');

export interface ParsedArgs {
  command: string;
  commandArgs: string[];
  options: CommandOptions;
}

export class CLIRouter {
  private commands = new Map<string, CommandSpec>();

  registerCommand(command: CommandSpec): void {
    this.commands.set(command.name, command);
    logger.debug(`Registered command: ${command.name}`);
  }

  async route(args: string[], ctx: RuntimeContext): Promise<CommandResult> {
    try {
      // Parse command and options
      const parsed = this.parseArgs(args);
      
      // Handle help flags
      if (parsed.options.help || parsed.options.h) {
        if (parsed.command) {
          return this.showCommandHelp(parsed.command);
        }
        return this.showGeneralHelp();
      }

      // If no command specified, show help
      if (!parsed.command) {
        return this.showGeneralHelp();
      }

      // Look up command handler
      const handler = this.commands.get(parsed.command);
      if (!handler) {
        return {
          success: false,
          message: `Unknown command: ${parsed.command}\nRun 'aia --help' for available commands.`
        };
      }

      // Execute command
      return await handler.execute(parsed.commandArgs, parsed.options, ctx);
    } catch (error) {
      logger.error('Router error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      };
    }
  }

  private parseArgs(args: string[]): ParsedArgs {
    let command = '';
    const commandArgs: string[] = [];
    const options: CommandOptions = {};
    
    let i = 0;
    
    // First non-option argument is the command
    while (i < args.length && !args[i].startsWith('-')) {
      if (!command) {
        command = args[i];
      } else {
        commandArgs.push(args[i]);
      }
      i++;
    }
    
    // Parse options
    while (i < args.length) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        // Long option
        const [flag, value] = arg.slice(2).split('=');
        const key = this.kebabToCamel(flag);
        
        if (value !== undefined) {
          options[key] = this.parseValue(value);
        } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          // Next arg is the value
          i++;
          options[key] = this.parseValue(args[i]);
        } else {
          // Boolean flag
          options[key] = true;
        }
      } else if (arg.startsWith('-') && arg.length > 1) {
        // Short option(s)
        const flags = arg.slice(1);
        
        for (let j = 0; j < flags.length; j++) {
          const flag = flags[j];
          
          if (j === flags.length - 1 && i + 1 < args.length && !args[i + 1].startsWith('-')) {
            // Last flag in group can have a value
            i++;
            options[flag] = this.parseValue(args[i]);
          } else {
            // Boolean flag
            options[flag] = true;
          }
        }
      } else {
        // Positional argument after options
        commandArgs.push(arg);
      }
      
      i++;
    }
    
    return { command, commandArgs, options };
  }

  private kebabToCamel(str: string): string {
    return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  private parseValue(value: string): any {
    // Try to parse as JSON first (handles arrays, objects, booleans, numbers)
    try {
      return JSON.parse(value);
    } catch {
      // Return as string if not valid JSON
      return value;
    }
  }

  private showGeneralHelp(): CommandResult {
    const lines = [
      'AIA - MCP-first advanced AI consultation',
      '',
      'Usage: aia <command> [options]',
      '',
      'Commands:'
    ];

    // List all registered commands
    for (const [name, command] of this.commands) {
      lines.push(`  ${name.padEnd(15)} ${command.description}`);
    }

    lines.push('', "Run 'aia <command> --help' for command-specific help.");

    console.log(lines.join('\n'));
    return { success: true };
  }

  private showCommandHelp(commandName: string): CommandResult {
    const command = this.commands.get(commandName);
    
    if (!command) {
      return {
        success: false,
        message: `Unknown command: ${commandName}`
      };
    }

    if (command.help) {
      console.log(command.help);
    } else {
      const lines = [
        `Usage: aia ${command.name} [options]`,
        '',
        `Description: ${command.description}`,
      ];

      if (command.arguments && command.arguments.length > 0) {
        lines.push('', 'Arguments:');
        for (const arg of command.arguments) {
          const required = arg.required ? ' (required)' : '';
          lines.push(`  ${arg.name.padEnd(15)} ${arg.description}${required}`);
        }
      }

      if (command.options && command.options.length > 0) {
        lines.push('', 'Options:');
        for (const opt of command.options) {
          const flag = opt.flag.includes('|') 
            ? opt.flag.split('|').map(f => f.length === 1 ? `-${f}` : `--${f}`).join(', ')
            : opt.flag.length === 1 ? `-${opt.flag}` : `--${opt.flag}`;
          lines.push(`  ${flag.padEnd(20)} ${opt.description}`);
        }
      }

      console.log(lines.join('\n'));
    }

    return { success: true };
  }
}

// Create singleton router instance
export const router = new CLIRouter();