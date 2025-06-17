import { 
  CharDivEstimator, 
  CostCalculator,
  type TokenEstimator 
} from '@light-merlin-dark/tok';
import { AIResponse } from '../plugins/types';
import { AIAdvisorConfig } from '../config/manager';

export interface TokenCount {
  tokens: number;
  model?: string;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}

export class TokenizerService {
  private static instance: TokenizerService;
  private estimator: TokenEstimator;

  private constructor() {
    // Use fast character-based estimation
    this.estimator = new CharDivEstimator();
  }

  static getInstance(): TokenizerService {
    if (!TokenizerService.instance) {
      TokenizerService.instance = new TokenizerService();
    }
    return TokenizerService.instance;
  }

  /**
   * Estimate token count for a given text
   */
  estimateTokens(text: string): number {
    return this.estimator.estimate(text);
  }

  /**
   * Calculate cost based on token usage and pricing
   */
  calculateCost(
    inputTokens: number,
    outputTokens: number,
    inputCostPerMillion: number,
    outputCostPerMillion: number
  ): { inputCost: number; outputCost: number; totalCost: number } {
    const inputCost = CostCalculator.cost(inputTokens, inputCostPerMillion);
    const outputCost = CostCalculator.cost(outputTokens, outputCostPerMillion);
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost
    };
  }

  /**
   * Calculate costs for AI responses with configured pricing
   */
  async calculateResponseCosts(
    responses: AIResponse[],
    prompt: string,
    config: AIAdvisorConfig
  ): Promise<{ costs: CostEstimate[]; totalCost: number }> {
    const costs: CostEstimate[] = [];
    let totalCost = 0;

    for (const response of responses) {
      if (response.isError) continue;

      // Get pricing for this model
      const service = config.services[response.provider];
      const pricing = service?.pricing?.[response.model];

      // Skip if pricing not configured
      if (!pricing?.inputCostPerMillion || !pricing?.outputCostPerMillion) {
        continue;
      }

      // Get token counts
      let inputTokens: number;
      let outputTokens: number;

      if (response.usage) {
        // Use actual usage if available
        inputTokens = response.usage.promptTokens;
        outputTokens = response.usage.completionTokens;
      } else {
        // Estimate tokens
        inputTokens = this.estimateTokens(prompt);
        outputTokens = this.estimateTokens(response.content);
      }

      // Calculate costs
      const costResult = this.calculateCost(
        inputTokens,
        outputTokens,
        pricing.inputCostPerMillion,
        pricing.outputCostPerMillion
      );

      const estimate: CostEstimate = {
        model: response.model,
        provider: response.provider,
        inputTokens,
        outputTokens,
        inputCost: costResult.inputCost,
        outputCost: costResult.outputCost,
        totalCost: costResult.totalCost
      };

      costs.push(estimate);
      totalCost += costResult.totalCost;
    }

    return { costs, totalCost };
  }

  /**
   * Format cost for display using tok's formatter
   */
  formatCost(cost: number): string {
    return CostCalculator.formatCost(cost);
  }

  /**
   * Get hint message for unconfigured pricing
   */
  getPricingHint(provider: string, model: string): string {
    return `💡 Configure pricing with: aia services cost set ${provider} ${model} --input <cost> --output <cost>`;
  }
}

export const tokenizer = TokenizerService.getInstance();