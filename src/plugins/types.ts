import { z } from 'zod';

// Base plugin interface
export interface Plugin {
  // Metadata
  name: string;
  version: string;
  description: string;
  author?: string;
  
  // Dependencies
  dependencies?: string[];              // Other plugins required
  runtimeDependencies?: {              // External tools/services required
    [key: string]: {
      service: string;
      required: boolean;
      hint?: string;                   // Help text for setting up the dependency
    };
  };
  
  // Lifecycle hooks
  onLoad?: (context: PluginContext) => Promise<void> | void;
  onUnload?: () => Promise<void> | void;
  
  // MCP-specific features
  mcpTools?: McpToolDefinition[];     // Additional MCP tools this plugin provides
  mcpContext?: {                      // Context for dynamic tool descriptions
    section: string;                  // Section name in tool description
    models: { name: string; description: string }[];
  };
}

// AI Provider specific plugin interface
export interface AIProviderPlugin extends Plugin {
  // List available models for this provider
  listModels(): string[];
  
  // Execute a prompt with a specific model
  execute(options: AIExecuteOptions): Promise<AIResponse>;
  
  // Validate configuration
  validateConfig?(config: any): boolean;
  
  // Get required environment variables
  getRequiredEnvVars?(): string[];
  
  // Check if a specific model is available
  isModelAvailable?(model: string): boolean;
}

// MCP tool definition
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  handler: (args: any, context: McpToolContext) => Promise<any>;
}

// Plugin context provided to plugins
export interface PluginContext {
  // Core services
  services: {
    logger: Logger;
    fileResolver: any;
    [key: string]: any;
  };
  
  // Configuration
  config: any;
  
  // Plugin management
  getPlugin: (name: string) => Plugin | undefined;
  
  // Plugin-specific config
  pluginConfig?: any;
}

// MCP tool context
export interface McpToolContext {
  registry: any;
  config: any;
}

// AI execution options
export interface AIExecuteOptions {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  retryAttempts?: number;
  timeout?: number;
}

// AI response structure
export interface AIResponse {
  model: string;
  provider: string;
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
  error?: string;
  isError?: boolean;
}

// Logger interface
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

// Plugin registry interface
export interface IPluginRegistry {
  register(plugin: Plugin): Promise<void>;
  getPlugin(name: string): Plugin | undefined;
  getEnabledPlugins(): Plugin[];
  getAllPlugins(): Plugin[];
  isEnabled(name: string): boolean;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
}