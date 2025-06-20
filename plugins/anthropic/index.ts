import Anthropic from '@anthropic-ai/sdk';
import type { 
  AIProviderPlugin, 
  AIExecuteOptions, 
  AIResponse, 
  PluginContext,
  Logger 
} from '../../src/plugins/types';

interface AnthropicPluginConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
}

class AnthropicPlugin implements AIProviderPlugin {
  name = 'anthropic';
  version = '1.0.0';
  description = 'Anthropic Claude models provider';
  author = 'AI Advisor Team';
  
  private client: Anthropic | null = null;
  private logger: Logger | null = null;
  private config: AnthropicPluginConfig = {};
  private context: PluginContext | null = null;
  
  private models: string[] = [];
  
  mcpContext = {
    section: 'Anthropic Models',
    models: []
  };

  async onLoad(context: PluginContext): Promise<void> {
    this.logger = context.services.logger;
    this.config = context.pluginConfig || {};
    this.context = context;
    
    // Populate models from config (no defaults)
    if (this.config.models && Array.isArray(this.config.models)) {
      this.models = this.config.models;
    }
    
    // Initialize Anthropic client
    const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.');
    }
    
    this.client = new Anthropic({
      apiKey,
      baseURL: this.config.baseURL,
    });
    
    this.logger?.info('Anthropic plugin loaded successfully');
  }

  listModels(): string[] {
    // Check context for live config if available
    if (this.context && this.context.config?.services?.anthropic?.models) {
      return [...this.context.config.services.anthropic.models];
    }
    // Fall back to initial config
    if (this.config.models && Array.isArray(this.config.models)) {
      return [...this.config.models];
    }
    return [...this.models];
  }

  async execute(options: AIExecuteOptions): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    const startTime = Date.now();
    
    try {
      this.logger?.debug(`Executing Anthropic request with model: ${options.model}`);
      
      // Build the messages array
      const messages: Anthropic.MessageParam[] = [{
        role: 'user',
        content: options.prompt
      }];

      // Create the completion
      const completion = await this.client.messages.create({
        model: options.model,
        messages,
        system: options.systemPrompt,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 4096,
      });

      // Extract content from the response
      const content = completion.content
        .filter(block => block.type === 'text')
        .map(block => (block as Anthropic.TextBlock).text)
        .join('\n');

      return {
        model: options.model,
        provider: this.name,
        content,
        usage: {
          promptTokens: completion.usage.input_tokens,
          completionTokens: completion.usage.output_tokens,
          totalTokens: completion.usage.input_tokens + completion.usage.output_tokens,
        },
        metadata: {
          messageId: completion.id,
          stopReason: completion.stop_reason,
          durationMs: Date.now() - startTime,
        }
      };
    } catch (error: any) {
      this.logger?.error(`Anthropic execution error: ${error.message}`);
      
      return {
        model: options.model,
        provider: this.name,
        content: '',
        error: error.message,
        isError: true,
        metadata: {
          durationMs: Date.now() - startTime,
          errorType: error.type || 'unknown',
          statusCode: error.status,
        }
      };
    }
  }

  validateConfig(config: any): boolean {
    if (!config || typeof config !== 'object') {
      return false;
    }
    
    // apiKey can come from env var, so not required in config
    if (config.apiKey && typeof config.apiKey !== 'string') {
      return false;
    }
    
    if (config.baseURL && typeof config.baseURL !== 'string') {
      return false;
    }
    
    return true;
  }

  getRequiredEnvVars(): string[] {
    return ['ANTHROPIC_API_KEY'];
  }

  isModelAvailable(model: string): boolean {
    // Get current models list
    const currentModels = this.listModels();
    
    // Support both full model names and shorthand versions
    if (currentModels.includes(model)) {
      return true;
    }
    
    // Check for shorthand versions only if the corresponding full model is available
    const shorthandMap: Record<string, string> = {
      'claude-3-opus': 'claude-3-opus-20240229',
      'claude-3-sonnet': 'claude-3-sonnet-20240229',
      'claude-3-haiku': 'claude-3-haiku-20240307',
      'claude-sonnet-4': 'claude-sonnet-4-20250514',
      'claude-opus-4': 'claude-opus-4-20250514',
    };
    
    if (model in shorthandMap) {
      return currentModels.includes(shorthandMap[model]);
    }
    
    return false;
  }
}

// Export as default for the plugin loader
export default new AnthropicPlugin();