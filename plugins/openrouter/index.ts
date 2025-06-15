import type { 
  AIProviderPlugin, 
  AIExecuteOptions, 
  AIResponse, 
  PluginContext,
  Logger 
} from '../../src/plugins/types';

interface OpenRouterPluginConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  siteUrl?: string;
  siteName?: string;
}

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  pricing?: {
    prompt: number;
    completion: number;
  };
}

class OpenRouterPlugin implements AIProviderPlugin {
  name = 'openrouter';
  version = '1.0.0';
  description = 'OpenRouter multi-model AI provider';
  author = 'AI Advisor Team';
  
  private apiKey: string = '';
  private baseURL: string = 'https://openrouter.ai/api/v1';
  private logger: Logger | null = null;
  private config: OpenRouterPluginConfig = {};
  
  // Popular models available on OpenRouter
  private models = [
    'openai/gpt-4-turbo-preview',
    'openai/gpt-4',
    'openai/gpt-3.5-turbo',
    'anthropic/claude-3-opus',
    'anthropic/claude-3-sonnet',
    'anthropic/claude-3-haiku',
    'google/gemini-pro',
    'google/gemini-pro-vision',
    'meta-llama/llama-3-70b-instruct',
    'meta-llama/llama-3-8b-instruct',
    'mistralai/mixtral-8x7b-instruct',
    'mistralai/mistral-7b-instruct',
  ];
  
  mcpContext = {
    section: 'OpenRouter Models',
    models: [
      { name: 'openai/gpt-4-turbo', description: 'OpenAI GPT-4 Turbo via OpenRouter' },
      { name: 'anthropic/claude-3-opus', description: 'Claude 3 Opus via OpenRouter' },
      { name: 'google/gemini-pro', description: 'Google Gemini Pro via OpenRouter' },
      { name: 'meta-llama/llama-3-70b', description: 'Meta Llama 3 70B via OpenRouter' },
    ]
  };

  async onLoad(context: PluginContext): Promise<void> {
    this.logger = context.services.logger;
    this.config = context.pluginConfig || {};
    
    // Initialize API key
    this.apiKey = this.config.apiKey || process.env.OPENROUTER_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured. Set OPENROUTER_API_KEY environment variable.');
    }
    
    if (this.config.baseURL) {
      this.baseURL = this.config.baseURL;
    }
    
    this.logger?.info('OpenRouter plugin loaded successfully');
  }

  listModels(): string[] {
    return [...this.models];
  }

  async execute(options: AIExecuteOptions): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const startTime = Date.now();
    
    try {
      this.logger?.debug(`Executing OpenRouter request with model: ${options.model}`);
      
      // Build messages array
      const messages: any[] = [];
      
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      
      messages.push({ role: 'user', content: options.prompt });

      // Prepare request body
      const requestBody = {
        model: options.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
      };

      // Prepare headers
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.config.siteUrl || 'https://github.com/ai-advisor/ai-advisor',
        'X-Title': this.config.siteName || 'AI Advisor',
      };

      // Make the request
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || 
          `OpenRouter API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      if (!choice) {
        throw new Error('No response from OpenRouter');
      }

      return {
        model: options.model,
        provider: this.name,
        content: choice.message?.content || '',
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
        metadata: {
          finishReason: choice.finish_reason,
          durationMs: Date.now() - startTime,
          modelUsed: data.model, // OpenRouter may use a different model
        }
      };
    } catch (error: any) {
      this.logger?.error(`OpenRouter execution error: ${error.message}`);
      
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
    
    if (config.baseURL && typeof config.baseURL !== 'string') {
      return false;
    }
    
    if (config.siteUrl && typeof config.siteUrl !== 'string') {
      return false;
    }
    
    if (config.siteName && typeof config.siteName !== 'string') {
      return false;
    }
    
    return true;
  }

  getRequiredEnvVars(): string[] {
    return ['OPENROUTER_API_KEY'];
  }

  isModelAvailable(model: string): boolean {
    // OpenRouter supports many models, so we'll be permissive
    // and check our known list, but also allow any model string
    // that follows the provider/model format
    if (this.models.includes(model)) {
      return true;
    }
    
    // Check if it follows the provider/model format
    const modelPattern = /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+$/;
    return modelPattern.test(model);
  }

  // Additional method to fetch available models from OpenRouter API
  async fetchAvailableModels(): Promise<OpenRouterModel[]> {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      this.logger?.error('Failed to fetch OpenRouter models:', error);
      return [];
    }
  }
}

// Export as default for the plugin loader
export default new OpenRouterPlugin();