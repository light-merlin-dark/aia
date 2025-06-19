import { describe, it, expect } from 'bun:test';
import { TokenizerService } from '@/core/tokenizer';
import { CharDivEstimator, CostCalculator } from '@light-merlin-dark/tok';

describe('Tok Integration', () => {
  const tokenizer = TokenizerService.getInstance();

  it('should use tok for token estimation correctly', () => {
    const text = 'Hello world, this is a test message';
    
    // Compare our service with direct tok usage
    const directEstimator = new CharDivEstimator();
    const tokTokens = directEstimator.estimate(text);
    const serviceTokens = tokenizer.estimateTokens(text);
    
    expect(serviceTokens).toBe(tokTokens);
    expect(serviceTokens).toBe(9); // 36 chars / 4 = 9
  });

  it('should calculate costs accurately using tok CostCalculator', () => {
    // Test with typical GPT-4 pricing
    const inputTokens = 150;
    const outputTokens = 75;
    const inputPricePerMillion = 10.0;  // $10/M tokens
    const outputPricePerMillion = 30.0; // $30/M tokens
    
    // Direct tok calculation
    const tokInputCost = CostCalculator.cost(inputTokens, inputPricePerMillion);
    const tokOutputCost = CostCalculator.cost(outputTokens, outputPricePerMillion);
    const tokTotalCost = tokInputCost + tokOutputCost;
    
    // Our service calculation
    const result = tokenizer.calculateCost(
      inputTokens,
      outputTokens,
      inputPricePerMillion,
      outputPricePerMillion
    );
    
    expect(result.inputCost).toBe(tokInputCost);
    expect(result.outputCost).toBe(tokOutputCost);
    expect(result.totalCost).toBe(tokTotalCost);
    expect(result.totalCost).toBe(0.00375); // Verify actual value
  });

  it('should format costs correctly with tok formatter', () => {
    // Test various cost amounts
    const testCases = [
      { cost: 0.002, expected: '$0.0020' },
      { cost: 0.00005, expected: '$0.0001' },  // Very small cost
      { cost: 0.000005, expected: '$0.0000' }, // Even smaller
      { cost: 0.0150, expected: '$0.0150' },
      { cost: 1.2345, expected: '$1.2345' },
      { cost: 12.50, expected: '$12.5000' }
    ];
    
    for (const { cost, expected } of testCases) {
      const formatted = tokenizer.formatCost(cost);
      const tokFormatted = CostCalculator.formatCost(cost);
      
      expect(formatted).toBe(tokFormatted);
      expect(formatted).toBe(expected);
    }
  });

  it('should handle very small token counts and costs', () => {
    // Simulate a very short prompt/response
    const inputTokens = 5;
    const outputTokens = 3;
    const inputPricePerMillion = 0.5;   // $0.50/M tokens (cheap model)
    const outputPricePerMillion = 1.5;  // $1.50/M tokens
    
    const result = tokenizer.calculateCost(
      inputTokens,
      outputTokens,
      inputPricePerMillion,
      outputPricePerMillion
    );
    
    // Verify calculations
    expect(result.inputCost).toBeCloseTo(0.0000025, 10);  // 5 * 0.5 / 1M
    expect(result.outputCost).toBeCloseTo(0.0000045, 10); // 3 * 1.5 / 1M
    expect(result.totalCost).toBeCloseTo(0.000007, 10);   // Sum
    
    // Verify formatting
    expect(tokenizer.formatCost(result.inputCost)).toBe('$0.0000');
    expect(tokenizer.formatCost(result.outputCost)).toBe('$0.0000');
    expect(tokenizer.formatCost(result.totalCost)).toBe('$0.0000');
  });

  it('should match tok calculations for real-world scenarios', () => {
    // GPT-3.5 Turbo example
    const gpt35 = {
      prompt: 'Explain the concept of recursion in programming',
      promptTokens: 10,
      responseTokens: 150,
      inputPrice: 0.5,   // $0.50/M
      outputPrice: 1.5   // $1.50/M
    };
    
    const gpt35Result = tokenizer.calculateCost(
      gpt35.promptTokens,
      gpt35.responseTokens,
      gpt35.inputPrice,
      gpt35.outputPrice
    );
    
    expect(gpt35Result.totalCost).toBeCloseTo(0.00023, 10);
    expect(tokenizer.formatCost(gpt35Result.totalCost)).toBe('$0.0002');
    
    // Claude 3 Opus example
    const claude3 = {
      prompt: 'Write a detailed analysis of quantum computing applications',
      promptTokens: 15,
      responseTokens: 500,
      inputPrice: 15.0,   // $15/M
      outputPrice: 75.0   // $75/M
    };
    
    const claude3Result = tokenizer.calculateCost(
      claude3.promptTokens,
      claude3.responseTokens,
      claude3.inputPrice,
      claude3.outputPrice
    );
    
    expect(claude3Result.totalCost).toBeCloseTo(0.037725, 10);
    expect(tokenizer.formatCost(claude3Result.totalCost)).toBe('$0.0377');
  });
});