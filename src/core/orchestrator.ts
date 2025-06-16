import { AIResponse } from '../plugins/types';
import { PluginRegistry } from '../plugins/registry';
import { FileResolver } from '../services/file-resolver';
import { Logger } from '../services/logger';
import { buildPrompt } from './prompt-builder';
import pRetry, { AbortError } from 'p-retry';

export interface OrchestrateOptions {
  prompt: string;
  files?: string[];
  models: string[];
  bestOf?: boolean;
  registry: PluginRegistry;
  maxRetries?: number;
  timeout?: number;
}

export interface OrchestrateResult {
  responses: AIResponse[];
  failed: string[];
  durationMs: number;
  bestIndex?: number;
  error?: string;
}

export class Orchestrator {
  private logger = new Logger('Orchestrator');
  
  async orchestrate(options: OrchestrateOptions): Promise<OrchestrateResult> {
    const startTime = Date.now();
    const {
      prompt,
      files = [],
      models,
      bestOf = false,
      registry,
      maxRetries = 2,
      timeout = 60000
    } = options;
    
    try {
      // Resolve files if provided
      let fullPrompt = prompt;
      if (files.length > 0) {
        const workingDir = FileResolver.detectWorkingDirectory();
        this.logger.info(`Resolving files from working directory: ${workingDir}`);
        
        const resolvedFiles = await FileResolver.resolveFiles(files, {
          workingDirectory: workingDir,
          maxFileSize: 50 * 1024 // 50KB per file
        });
        
        // Log any file resolution errors
        for (const file of resolvedFiles) {
          if (file.error) {
            this.logger.warn(`File resolution error: ${file.error}`);
          }
        }
        
        // Build prompt with file contents
        fullPrompt = buildPrompt(prompt, resolvedFiles);
      }
      
      // Prepare model execution tasks
      const tasks = models.map(model => ({
        model,
        execute: () => this.executeModel(model, fullPrompt, registry, maxRetries, timeout)
      }));
      
      // Execute all models in parallel
      this.logger.info(`Consulting ${tasks.length} models in parallel`);
      const results = await Promise.allSettled(
        tasks.map(task => task.execute())
      );
      
      // Process results
      const responses: AIResponse[] = [];
      const failed: string[] = [];
      
      results.forEach((result, index) => {
        const model = tasks[index].model;
        if (result.status === 'fulfilled') {
          responses.push(result.value);
        } else {
          failed.push(model);
          responses.push({
            model,
            provider: 'unknown',
            content: '',
            error: result.reason?.message || 'Unknown error',
            isError: true
          });
        }
      });
      
      // Select best response if requested
      let bestIndex: number | undefined;
      if (bestOf && responses.length > 1) {
        bestIndex = await this.selectBestResponse(responses, prompt, registry);
      }
      
      const durationMs = Date.now() - startTime;
      this.logger.info(`Orchestration completed in ${durationMs}ms`);
      
      return {
        responses,
        failed,
        durationMs,
        bestIndex
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.logger.error('Orchestration failed:', error);
      
      return {
        responses: [],
        failed: models,
        durationMs,
        error: error.message
      };
    }
  }
  
  private async executeModel(
    model: string,
    prompt: string,
    registry: PluginRegistry,
    maxRetries: number,
    timeout: number
  ): Promise<AIResponse> {
    const provider = registry.getAIProvider(model);
    if (!provider) {
      throw new Error(`No provider found for model: ${model}`);
    }
    
    this.logger.debug(`Executing model ${model} with provider ${provider.name}`);
    
    // Use p-retry for automatic retries with exponential backoff
    return pRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
          const response = await provider.execute({
            model,
            prompt,
            timeout,
            retryAttempts: 0 // Let p-retry handle retries
          });
          
          clearTimeout(timeoutId);
          return response;
        } catch (error: any) {
          clearTimeout(timeoutId);
          
          // Check if we should retry
          if (error.name === 'AbortError') {
            throw new AbortError(`Timeout after ${timeout}ms`);
          }
          
          // For rate limits, wait longer before retry
          if (error.message?.includes('rate limit')) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
          throw error;
        }
      },
      {
        retries: maxRetries,
        onFailedAttempt: (error) => {
          this.logger.warn(
            `Attempt ${error.attemptNumber} failed for ${model}: ${error.message}`
          );
        }
      }
    );
  }
  
  private async selectBestResponse(
    responses: AIResponse[],
    originalPrompt: string,
    registry: PluginRegistry
  ): Promise<number> {
    // Filter out error responses
    const validResponses = responses.filter(r => !r.isError);
    if (validResponses.length === 0) return 0;
    if (validResponses.length === 1) return responses.indexOf(validResponses[0]);
    
    // Use the first available model to evaluate
    const evaluatorModel = validResponses[0].model;
    const provider = registry.getAIProvider(evaluatorModel);
    if (!provider) return 0;
    
    // Build evaluation prompt
    const evalPrompt = this.buildEvaluationPrompt(originalPrompt, responses);
    
    try {
      const evalResponse = await provider.execute({
        model: evaluatorModel,
        prompt: evalPrompt,
        temperature: 0.1, // Low temperature for consistent evaluation
        maxTokens: 100
      });
      
      // Parse the response to get the best index
      const match = evalResponse.content.match(/\b(\d+)\b/);
      if (match) {
        const index = parseInt(match[1]) - 1; // Convert 1-based to 0-based
        if (index >= 0 && index < responses.length) {
          return index;
        }
      }
    } catch (error) {
      this.logger.warn('Failed to evaluate best response:', error);
    }
    
    // Default to first valid response
    return responses.indexOf(validResponses[0]);
  }
  
  private buildEvaluationPrompt(originalPrompt: string, responses: AIResponse[]): string {
    let prompt = `Given the following query and responses from different AI models, select the BEST response based on accuracy, completeness, and helpfulness.

Original Query:
${originalPrompt}

Responses:
`;
    
    responses.forEach((response, index) => {
      if (!response.isError) {
        prompt += `
Response ${index + 1} (${response.model}):
${response.content.slice(0, 500)}${response.content.length > 500 ? '...' : ''}
`;
      }
    });
    
    prompt += `
Please respond with ONLY the number of the best response (e.g., "1" or "2" or "3").`;
    
    return prompt;
  }
}

// Export singleton orchestrate function
export async function orchestrate(options: OrchestrateOptions): Promise<OrchestrateResult> {
  const orchestrator = new Orchestrator();
  return orchestrator.orchestrate(options);
}