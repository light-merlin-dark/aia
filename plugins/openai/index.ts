import OpenAI from 'openai';
import type { 
  AIProviderPlugin, 
  AIExecuteOptions, 
  AIResponse, 
  PluginContext,
  Logger 
} from '../../src/plugins/types';

interface OpenAIPluginConfig {
  apiKey?: string;
  organization?: string;
  baseURL?: string;
  defaultModel?: string;
}

class OpenAIPlugin implements AIProviderPlugin {
  name = 'openai';
  version = '1.0.0';
  description = 'OpenAI GPT models provider';
  author = 'AI Advisor Team';
  
  private client: OpenAI | null = null;
  private logger: Logger | null = null;
  private config: OpenAIPluginConfig = {};
  
  private models: string[] = [];
  
  mcpContext = {
    section: 'OpenAI Models',
    models: []
  };

  async onLoad(context: PluginContext): Promise<void> {
    this.logger = context.services.logger;
    this.config = context.pluginConfig || {};
    
    // Populate models from config (no defaults)
    if (this.config.models && Array.isArray(this.config.models)) {
      this.models = this.config.models;
    }
    
    // Initialize OpenAI client
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
    }
    
    this.client = new OpenAI({
      apiKey,
      organization: this.config.organization || process.env.OPENAI_ORG_ID,
      baseURL: this.config.baseURL,
    });
    
    this.logger?.info('OpenAI plugin loaded successfully');
  }

  listModels(): string[] {
    return [...this.models];
  }

  async execute(options: AIExecuteOptions): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const startTime = Date.now();
    
    try {
      this.logger?.debug(`Executing OpenAI request with model: ${options.model}`);
      
      const messages: OpenAI.ChatCompletionMessageParam[] = [];
      
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      
      messages.push({ role: 'user', content: options.prompt });

      // Build request parameters
      const params: any = {
        model: options.model,
        messages,
        max_tokens: options.maxTokens,
      };

      // Only add temperature if the model supports it
      // o3-mini doesn't support temperature parameter
      if (options.model !== 'o3-mini') {
        params.temperature = options.temperature ?? 0.7;
      }

      const completion = await this.client.chat.completions.create(params);

      const response = completion.choices[0];
      const usage = completion.usage;

      return {
        model: options.model,
        provider: this.name,
        content: response.message.content || '',
        usage: usage ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        } : undefined,
        metadata: {
          finishReason: response.finish_reason,
          durationMs: Date.now() - startTime,
        }
      };
    } catch (error: any) {
      this.logger?.error(`OpenAI execution error: ${error.message}`);
      
      return {
        model: options.model,
        provider: this.name,
        content: '',
        error: error.message,
        isError: true,
        metadata: {
          durationMs: Date.now() - startTime,
          errorType: error.type || 'unknown',
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
    
    if (config.organization && typeof config.organization !== 'string') {
      return false;
    }
    
    if (config.baseURL && typeof config.baseURL !== 'string') {
      return false;
    }
    
    return true;
  }

  getRequiredEnvVars(): string[] {
    return ['OPENAI_API_KEY'];
  }

  isModelAvailable(model: string): boolean {
    return this.models.includes(model);
  }
}

// Export as default for the plugin loader
export default new OpenAIPlugin();