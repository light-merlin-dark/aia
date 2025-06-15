export interface CommandOptions {
  [key: string]: any;
}

export interface RuntimeContext {
  verbose: boolean;
  cwd: string;
  env: Record<string, string>;
}

export interface CommandResult<T = any> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface CommandOption {
  flag: string;
  description: string;
  type: 'boolean' | 'string' | 'number';
  default?: any;
}

export interface CommandArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface CommandSpec<T = any> {
  name: string;
  description: string;
  help?: string;
  arguments?: CommandArgument[];
  options?: CommandOption[];
  execute: (
    args: string[],
    options: CommandOptions,
    ctx: RuntimeContext
  ) => Promise<CommandResult<T>>;
}