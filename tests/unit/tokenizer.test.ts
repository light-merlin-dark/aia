import { describe, it, expect, beforeEach } from 'vitest';
import { TokenizerService } from '@/core/tokenizer';
import { AIResponse } from '@/plugins/types';
import { AIAdvisorConfig } from '@/config/manager';

describe('TokenizerService', () => {
  let tokenizer: TokenizerService;

  beforeEach(() => {
    tokenizer = TokenizerService.getInstance();
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for text', () => {
      const text = 'Hello world, this is a test message';
      const tokens = tokenizer.estimateTokens(text);
      
      // Using CharDivEstimator with default divisor of 4
      expect(tokens).toBe(Math.ceil(text.length / 4));
      expect(tokens).toBe(9); // 36 chars / 4 = 9
    });

    it('should handle empty text', () => {
      const tokens = tokenizer.estimateTokens('');
      expect(tokens).toBe(0);
    });

    it('should handle long text', () => {
      const longText = 'a'.repeat(1000);
      const tokens = tokenizer.estimateTokens(longText);
      expect(tokens).toBe(250); // 1000 / 4 = 250
    });
  });

  describe('calculateCost', () => {
    it('should calculate costs correctly', () => {
      const result = tokenizer.calculateCost(
        1000,    // inputTokens
        500,     // outputTokens
        2.5,     // $2.50 per million input tokens
        10.0     // $10.00 per million output tokens
      );

      expect(result.inputCost).toBeCloseTo(0.0025);
      expect(result.outputCost).toBeCloseTo(0.005);
      expect(result.totalCost).toBeCloseTo(0.0075);
    });

    it('should handle zero tokens', () => {
      const result = tokenizer.calculateCost(0, 0, 10.0, 30.0);
      
      expect(result.inputCost).toBe(0);
      expect(result.outputCost).toBe(0);
      expect(result.totalCost).toBe(0);
    });

    it('should handle large token counts', () => {
      const result = tokenizer.calculateCost(
        1_000_000,  // 1M input tokens
        500_000,    // 500K output tokens
        5.0,        // $5 per million
        15.0        // $15 per million
      );

      expect(result.inputCost).toBe(5.0);
      expect(result.outputCost).toBe(7.5);
      expect(result.totalCost).toBe(12.5);
    });
  });

  describe('calculateResponseCosts', () => {
    const mockConfig: AIAdvisorConfig = {
      services: {
        openai: {
          apiKey: 'test-key',
          pricing: {
            'gpt-4-turbo': {
              inputCostPerMillion: 10.0,
              outputCostPerMillion: 30.0
            }
          }
        },
        anthropic: {
          apiKey: 'test-key',
          pricing: {
            'claude-3-opus': {
              inputCostPerMillion: 15.0,
              outputCostPerMillion: 75.0
            }
          }
        }
      }
    };

    it('should calculate costs with usage data', async () => {
      const responses: AIResponse[] = [
        {
          model: 'gpt-4-turbo',
          provider: 'openai',
          content: 'Test response',
          usage: {
            promptTokens: 150,
            completionTokens: 75,
            totalTokens: 225
          }
        }
      ];

      const result = await tokenizer.calculateResponseCosts(
        responses,
        'Test prompt',
        mockConfig
      );

      expect(result.costs).toHaveLength(1);
      expect(result.costs[0].model).toBe('gpt-4-turbo');
      expect(result.costs[0].provider).toBe('openai');
      expect(result.costs[0].inputTokens).toBe(150);
      expect(result.costs[0].outputTokens).toBe(75);
      expect(result.costs[0].inputCost).toBeCloseTo(0.0015);  // 150 * 10 / 1M
      expect(result.costs[0].outputCost).toBeCloseTo(0.00225); // 75 * 30 / 1M
      expect(result.costs[0].totalCost).toBeCloseTo(0.00375);
      expect(result.totalCost).toBeCloseTo(0.00375);
    });

    it('should estimate tokens when usage not provided', async () => {
      const prompt = 'Test prompt for estimation';
      const content = 'This is a test response content';
      
      const responses: AIResponse[] = [
        {
          model: 'gpt-4-turbo',
          provider: 'openai',
          content
        }
      ];

      const result = await tokenizer.calculateResponseCosts(
        responses,
        prompt,
        mockConfig
      );

      expect(result.costs).toHaveLength(1);
      expect(result.costs[0].inputTokens).toBe(Math.ceil(prompt.length / 4));
      expect(result.costs[0].outputTokens).toBe(Math.ceil(content.length / 4));
    });

    it('should skip models without pricing', async () => {
      const responses: AIResponse[] = [
        {
          model: 'gpt-4-turbo',
          provider: 'openai',
          content: 'Test',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
        },
        {
          model: 'unknown-model',
          provider: 'openai',
          content: 'Test',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
        }
      ];

      const result = await tokenizer.calculateResponseCosts(
        responses,
        'Test',
        mockConfig
      );

      expect(result.costs).toHaveLength(1);
      expect(result.costs[0].model).toBe('gpt-4-turbo');
    });

    it('should skip error responses', async () => {
      const responses: AIResponse[] = [
        {
          model: 'gpt-4-turbo',
          provider: 'openai',
          content: '',
          isError: true,
          error: 'API Error'
        }
      ];

      const result = await tokenizer.calculateResponseCosts(
        responses,
        'Test',
        mockConfig
      );

      expect(result.costs).toHaveLength(0);
      expect(result.totalCost).toBe(0);
    });

    it('should handle multiple models', async () => {
      const responses: AIResponse[] = [
        {
          model: 'gpt-4-turbo',
          provider: 'openai',
          content: 'Response 1',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
        },
        {
          model: 'claude-3-opus',
          provider: 'anthropic',
          content: 'Response 2',
          usage: { promptTokens: 100, completionTokens: 60, totalTokens: 160 }
        }
      ];

      const result = await tokenizer.calculateResponseCosts(
        responses,
        'Test',
        mockConfig
      );

      expect(result.costs).toHaveLength(2);
      expect(result.totalCost).toBeCloseTo(0.001 + 0.0015 + 0.0015 + 0.0045); // Sum of all costs
    });
  });

  describe('formatCost', () => {
    it('should format costs with 4 decimal places', () => {
      expect(tokenizer.formatCost(0.0025)).toBe('$0.0025');
      expect(tokenizer.formatCost(0.009)).toBe('$0.0090');
      expect(tokenizer.formatCost(0.015)).toBe('$0.0150');
      expect(tokenizer.formatCost(0.099)).toBe('$0.0990');
      expect(tokenizer.formatCost(0.15)).toBe('$0.1500');
      expect(tokenizer.formatCost(1.50)).toBe('$1.5000');
      expect(tokenizer.formatCost(12.345)).toBe('$12.3450');
    });
  });

  describe('getPricingHint', () => {
    it('should return pricing hint message', () => {
      const hint = tokenizer.getPricingHint('openai', 'gpt-4-turbo');
      expect(hint).toBe('💡 Configure pricing with: aia services cost set openai gpt-4-turbo --input <cost> --output <cost>');
    });
  });
});