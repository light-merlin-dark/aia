import { createLogger } from './logger.js';

const logger = createLogger('CostCalculator');

export interface ModelPricing {
  provider: string;
  model: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export interface CostResult {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  formattedCost: string;
}

export class CostCalculator {
  private pricingCache = new Map<string, ModelPricing>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Calculate cost for token usage
   */
  async calculateCost(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    existingPricing?: { inputCostPer1M?: number; outputCostPer1M?: number }
  ): Promise<CostResult> {
    let pricing = existingPricing;
    
    // Try to get pricing if not provided
    if (!pricing || (!pricing.inputCostPer1M && !pricing.outputCostPer1M)) {
      const modelPricing = await this.getModelPricing(provider, model);
      if (modelPricing) {
        pricing = {
          inputCostPer1M: modelPricing.inputCostPer1M,
          outputCostPer1M: modelPricing.outputCostPer1M
        };
      } else {
        pricing = { inputCostPer1M: 0, outputCostPer1M: 0 };
      }
    }

    // Calculate costs
    const inputCost = (inputTokens * (pricing.inputCostPer1M || 0)) / 1_000_000;
    const outputCost = (outputTokens * (pricing.outputCostPer1M || 0)) / 1_000_000;
    const totalCost = inputCost + outputCost;

    return {
      provider,
      model,
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      totalCost,
      formattedCost: `$${totalCost.toFixed(6)}`
    };
  }

  /**
   * Get pricing for a model using ai-costs CLI
   */
  async getModelPricing(provider: string, model: string): Promise<ModelPricing | null> {
    const cacheKey = `${provider}/${model}`;
    
    // Check cache first
    const cached = this.pricingCache.get(cacheKey);
    const expiry = this.cacheExpiry.get(cacheKey);
    
    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    try {
      // Query ai-costs CLI for pricing
      const { spawn } = await import('child_process');
      
      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn('ai-costs', ['query', model, '--json'], { stdio: 'pipe' });
        let stdout = '';
        let stderr = '';
        
        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
        
        proc.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`ai-costs exited with code ${code}: ${stderr}`));
          }
        });
        
        proc.on('error', reject);
      });

      const costData = JSON.parse(result);
      
      // Find matching model from results
      let matchedModel = null;
      if (Array.isArray(costData)) {
        matchedModel = costData.find((m: any) => 
          m.model_name?.toLowerCase().includes(model.toLowerCase()) ||
          m.display_name?.toLowerCase().includes(model.toLowerCase())
        );
      } else if (costData.model_name || costData.display_name) {
        matchedModel = costData;
      }

      if (!matchedModel) {
        logger.warn(`No pricing found for ${cacheKey}`);
        return null;
      }

      const pricing: ModelPricing = {
        provider,
        model,
        inputCostPer1M: matchedModel.input_price_per_1m || 0,
        outputCostPer1M: matchedModel.output_price_per_1m || 0
      };

      // Cache the result
      this.pricingCache.set(cacheKey, pricing);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

      return pricing;
    } catch (error) {
      logger.error(`Failed to get pricing for ${cacheKey}:`, error);
      return null;
    }
  }

  /**
   * Get all available models and pricing
   */
  async getAllModels(): Promise<ModelPricing[]> {
    try {
      const { spawn } = await import('child_process');
      
      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn('ai-costs', ['list', '--json'], { stdio: 'pipe' });
        let stdout = '';
        let stderr = '';
        
        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
        
        proc.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`ai-costs exited with code ${code}: ${stderr}`));
          }
        });
        
        proc.on('error', reject);
      });

      const models = JSON.parse(result);
      
      return models.map((m: any) => ({
        provider: m.provider || 'unknown',
        model: m.model_name || m.display_name || 'unknown',
        inputCostPer1M: m.input_price_per_1m || 0,
        outputCostPer1M: m.output_price_per_1m || 0
      }));
    } catch (error) {
      logger.error('Failed to get all models:', error);
      return [];
    }
  }

  /**
   * Update pricing data using ai-costs CLI
   */
  async updatePricing(): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ai-costs', ['update-helicone'], { stdio: 'inherit' });
        
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`ai-costs update failed with code ${code}`));
          }
        });
        
        proc.on('error', reject);
      });

      // Clear cache after update
      this.pricingCache.clear();
      this.cacheExpiry.clear();
      
      logger.info('Pricing data updated successfully');
      return true;
    } catch (error) {
      logger.error('Failed to update pricing:', error);
      return false;
    }
  }
}

export const costCalculator = new CostCalculator();