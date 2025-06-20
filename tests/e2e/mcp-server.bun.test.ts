import { test, expect, beforeAll, afterAll, describe } from 'bun:test';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { setupTestConfig } from './setup-test-config';
import { encrypt } from '../../src/config/crypto';
import { writeFileSync } from 'fs';

// Helper to wait for a specific pattern in stdout
async function waitForOutput(proc: ChildProcess, pattern: string | RegExp, timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      proc.stdout?.removeListener('data', handler);
      reject(new Error(`Timeout waiting for pattern: ${pattern}`));
    }, timeout);
    
    const handler = (data: Buffer) => {
      output += data.toString();
      if (typeof pattern === 'string' ? output.includes(pattern) : pattern.test(output)) {
        clearTimeout(timer);
        proc.stdout?.removeListener('data', handler);
        resolve(output);
      }
    };
    
    proc.stdout?.on('data', handler);
  });
}

// Helper to send request and get response
async function sendRequest(proc: ChildProcess, request: any): Promise<any> {
  return new Promise((resolve, reject) => {
    // const responses: string[] = [];
    let buffer = '';
    
    const handler = (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === request.id) {
              proc.stdout?.removeListener('data', handler);
              resolve(parsed);
              return;
            }
          } catch (e) {
            // Not JSON, continue
          }
        }
      }
    };
    
    proc.stdout?.on('data', handler);
    proc.stdin?.write(JSON.stringify(request) + '\n');
    
    // Timeout after 10 seconds
    setTimeout(() => {
      proc.stdout?.removeListener('data', handler);
      reject(new Error(`Timeout waiting for response to request ${request.id}`));
    }, 10000);
  });
}

describe('MCP Server E2E Tests (Bun)', () => {
  let mcpProcess: ChildProcess;
  let isInitialized = false;
  
  beforeAll(async () => {
    // Set up test configuration
    const { configDir, keyFile, config } = await setupTestConfig();
    
    // Encrypt and save the config for the MCP server to use
    const configFile = join(configDir, 'config.enc');
    const encrypted = await encrypt(JSON.stringify(config), keyFile);
    writeFileSync(configFile, encrypted);
    
    // Start MCP server
    const mcpServerPath = join(process.cwd(), 'dist', 'mcp-server.js');
    mcpProcess = spawn('node', [mcpServerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AIA_MCP_MODE: 'true'  // Skip interactive prompts
      }
    });

    // Handle errors
    mcpProcess.on('error', (error) => {
      console.error('Failed to start MCP server:', error);
    });

    mcpProcess.stderr?.on('data', (data) => {
      console.error('[MCP stderr]:', data.toString());
    });

    // Wait for server to be ready
    await waitForOutput(mcpProcess, 'MCP server successfully started', 3000);
  });

  afterAll(() => {
    if (mcpProcess && !mcpProcess.killed) {
      mcpProcess.kill('SIGTERM');
    }
  });

  test('should start MCP server process successfully', () => {
    expect(mcpProcess).toBeDefined();
    expect(mcpProcess.killed).toBe(false);
  });

  test('should handle MCP protocol initialization', async () => {
    const initRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      },
      id: 1
    };

    const response = await sendRequest(mcpProcess, initRequest);
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.result.protocolVersion).toBe('2024-11-05');
    expect(response.result.serverInfo.name).toBe('aia');
    
    isInitialized = true;
  });

  test('should list all tools including config management tools', async () => {
    // Initialize if not already done
    if (!isInitialized) {
      const initRequest = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        },
        id: 100
      };
      await sendRequest(mcpProcess, initRequest);
      isInitialized = true;
    }

    const listToolsRequest = {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 2
    };

    const response = await sendRequest(mcpProcess, listToolsRequest);
    
    expect(response.result.tools).toBeDefined();
    const toolNames = response.result.tools.map((t: any) => t.name);
    
    // Check for all expected tools
    expect(toolNames).toContain('consult');
    expect(toolNames).toContain('config-list');
    expect(toolNames).toContain('config-get');
    expect(toolNames).toContain('config-set');
    expect(toolNames).toContain('config-add-model');
    expect(toolNames).toContain('config-set-default');
    expect(toolNames).toContain('config-remove');
  });

  test('should execute consult tool with simple prompt', async () => {
    const consultRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'consult',
        arguments: {
          prompt: 'What is 2 + 2? Reply with just the number.',
          models: ['test-model']
        }
      },
      id: 3
    };

    const response = await sendRequest(mcpProcess, consultRequest);
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeDefined();
  });

  test('should handle missing required parameters', async () => {
    const invalidRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'consult',
        arguments: {
          // Missing prompt
          models: ['test-model']
        }
      },
      id: 4
    };

    const response = await sendRequest(mcpProcess, invalidRequest);
    
    // Check if it's an error response - MCP might return error differently
    if (response.error) {
      expect(response.error.message).toMatch(/required|prompt/i);
    } else {
      expect(response.result.isError).toBe(true);
      expect(response.result.content[0].text).toMatch(/required|prompt/i);
    }
  });

  test('should successfully manage service configuration via MCP tools', async () => {
    // Use Promise.all to run independent operations in parallel
    const testService = 'testservice';
    const testApiKey = 'test-api-key-12345';
    const testModel = 'test-model-v1';
    
    // Step 1: Add a new test service
    const addServiceResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-set',
        arguments: {
          service: testService,
          key: 'apiKey',
          value: testApiKey
        }
      },
      id: 101
    });
    
    expect(addServiceResponse.result.content[0].text).toContain(`Successfully set apiKey for service ${testService}`);
    
    // Step 2 & 3 can run in parallel: Add model and verify service exists
    const [addModelResponse, getServiceResponse] = await Promise.all([
      sendRequest(mcpProcess, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'config-add-model',
          arguments: {
            service: testService,
            model: testModel
          }
        },
        id: 102
      }),
      sendRequest(mcpProcess, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'config-get',
          arguments: {
            service: testService
          }
        },
        id: 103
      })
    ]);
    
    expect(addModelResponse.result.content[0].text).toContain(`Successfully added model ${testModel} to service ${testService}`);
    expect(getServiceResponse.result.content[0].text).toContain(testModel);
    expect(getServiceResponse.result.content[0].text).toContain('***'); // API key should be masked
    
    // Step 4: Remove the test service
    const removeServiceResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-remove',
        arguments: {
          service: testService
        }
      },
      id: 104
    });
    
    expect(removeServiceResponse.result.content[0].text).toContain(`Successfully removed service ${testService}`);
    
    // Step 5: Verify the service is gone
    const verifyRemovedResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-get',
        arguments: {
          service: testService
        }
      },
      id: 105
    });
    
    expect(verifyRemovedResponse.result.isError).toBe(true);
    expect(verifyRemovedResponse.result.content[0].text).toMatch(/testservice.*not found/i);
  });

  test('should successfully manage pricing configuration via MCP tools', async () => {
    const testService = 'openai'; // Using existing service
    const testModel = 'gpt-4-turbo';
    const inputCost = 10;
    const outputCost = 30;
    
    // Step 1: Set pricing for a model
    const setPricingResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-set-pricing',
        arguments: {
          service: testService,
          model: testModel,
          inputCost: inputCost,
          outputCost: outputCost
        }
      },
      id: 201
    });
    
    expect(setPricingResponse.result.content[0].text).toContain(`Successfully set pricing for ${testService}/${testModel}`);
    expect(setPricingResponse.result.content[0].text).toContain(`Input: $${inputCost}/M tokens`);
    expect(setPricingResponse.result.content[0].text).toContain(`Output: $${outputCost}/M tokens`);
    
    // Step 2: Get pricing for specific model
    const getSpecificPricingResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-get-pricing',
        arguments: {
          service: testService,
          model: testModel
        }
      },
      id: 202
    });
    
    expect(getSpecificPricingResponse.result.content[0].text).toContain(`Pricing for ${testService}/${testModel}`);
    expect(getSpecificPricingResponse.result.content[0].text).toContain(`Input: $${inputCost}/M tokens`);
    expect(getSpecificPricingResponse.result.content[0].text).toContain(`Output: $${outputCost}/M tokens`);
    
    // Step 3: Get all pricing for service
    const getAllPricingResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-get-pricing',
        arguments: {
          service: testService
        }
      },
      id: 203
    });
    
    expect(getAllPricingResponse.result.content[0].text).toContain(`Pricing for ${testService}:`);
    expect(getAllPricingResponse.result.content[0].text).toContain(testModel);
    expect(getAllPricingResponse.result.content[0].text).toContain(`Input: $${inputCost}/M tokens`);
    
    // Step 4: Update pricing with new values
    const newInputCost = 15;
    const newOutputCost = 45;
    
    const updatePricingResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-set-pricing',
        arguments: {
          service: testService,
          model: testModel,
          inputCost: newInputCost,
          outputCost: newOutputCost
        }
      },
      id: 204
    });
    
    expect(updatePricingResponse.result.content[0].text).toContain(`Successfully set pricing for ${testService}/${testModel}`);
    expect(updatePricingResponse.result.content[0].text).toContain(`Input: $${newInputCost}/M tokens`);
    
    // Step 5: Remove pricing
    const removePricingResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-remove-pricing',
        arguments: {
          service: testService,
          model: testModel
        }
      },
      id: 205
    });
    
    expect(removePricingResponse.result.content[0].text).toContain(`Successfully removed pricing for ${testService}/${testModel}`);
    
    // Step 6: Verify pricing is removed
    const verifyRemovedPricingResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-get-pricing',
        arguments: {
          service: testService,
          model: testModel
        }
      },
      id: 206
    });
    
    expect(verifyRemovedPricingResponse.result.content[0].text).toContain(`No pricing configured for`);
  });

  test('should handle pricing configuration error cases', async () => {
    // Test 1: Set pricing for non-existent service
    const invalidServiceResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-set-pricing',
        arguments: {
          service: 'nonexistent-service',
          model: 'some-model',
          inputCost: 10,
          outputCost: 20
        }
      },
      id: 301
    });
    
    expect(invalidServiceResponse.result.isError).toBe(true);
    expect(invalidServiceResponse.result.content[0].text).toContain("Service 'nonexistent-service' not found");
    
    // Test 2: Get pricing for service with no pricing configured
    const noPricingResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-get-pricing',
        arguments: {
          service: 'anthropic' // Assuming this doesn't have pricing set in test config
        }
      },
      id: 302
    });
    
    expect(noPricingResponse.result.content[0].text).toContain("No pricing configured for service 'anthropic'");
    
    // Test 3: Remove pricing that doesn't exist
    const removeNonexistentResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-remove-pricing',
        arguments: {
          service: 'openai',
          model: 'nonexistent-model'
        }
      },
      id: 303
    });
    
    expect(removeNonexistentResponse.result.isError).toBe(true);
    expect(removeNonexistentResponse.result.content[0].text).toContain("No pricing configured for openai/nonexistent-model");
  });

  test('should successfully view logs via config-view-logs tool', async () => {
    // First, make sure we have some logs by calling a tool
    await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-list',
        arguments: {}
      },
      id: 401
    });
    
    // Test 1: View recent logs (default)
    const viewLogsResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-view-logs',
        arguments: {}
      },
      id: 402
    });
    
    expect(viewLogsResponse.result.content[0].text).toContain('Log file:');
    expect(viewLogsResponse.result.content[0].text).toContain('Showing');
    expect(viewLogsResponse.result.content[0].text).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/); // Contains timestamp
    
    // Test 2: View logs with specific number of lines
    const viewLogsWithLinesResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-view-logs',
        arguments: {
          lines: 10
        }
      },
      id: 403
    });
    
    expect(viewLogsWithLinesResponse.result.content[0].text).toContain('Showing');
    const linesMatch = viewLogsWithLinesResponse.result.content[0].text.match(/Showing (\d+) of/);
    expect(linesMatch).toBeTruthy();
    if (linesMatch) {
      expect(parseInt(linesMatch[1])).toBeLessThanOrEqual(10);
    }
    
    // Test 3: Filter by log level
    const viewErrorLogsResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-view-logs',
        arguments: {
          level: 'ERROR',
          lines: 100
        }
      },
      id: 404
    });
    
    // Should either show ERROR logs or indicate no errors found
    const errorLogsText = viewErrorLogsResponse.result.content[0].text;
    if (errorLogsText.includes('No logs found')) {
      expect(errorLogsText).toContain('Level: ERROR');
    } else {
      expect(errorLogsText).toContain('filters: level=ERROR');
    }
    
    // Test 4: Search for specific text
    const searchLogsResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-view-logs',
        arguments: {
          search: 'config',
          lines: 20
        }
      },
      id: 405
    });
    
    expect(searchLogsResponse.result.content[0].text).toContain('filters:');
    expect(searchLogsResponse.result.content[0].text).toContain('search="config"');
    
    // Test 5: View logs from non-existent date
    const oldDateLogsResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-view-logs',
        arguments: {
          date: '2020-01-01'
        }
      },
      id: 406
    });
    
    expect(oldDateLogsResponse.result.content[0].text).toContain('No log file found for date 2020-01-01');
  });

  test('should handle log viewing edge cases', async () => {
    // Test with invalid date format (should be caught by schema validation)
    const invalidDateRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-view-logs',
        arguments: {
          date: 'invalid-date'
        }
      },
      id: 501
    };
    
    const invalidDateResponse = await sendRequest(mcpProcess, invalidDateRequest);
    
    // Schema validation should catch this
    if (invalidDateResponse.error) {
      expect(invalidDateResponse.error.message).toMatch(/date|format|invalid/i);
    } else {
      expect(invalidDateResponse.result.isError).toBe(true);
    }
    
    // Test combining multiple filters
    const multiFilterResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-view-logs',
        arguments: {
          level: 'INFO',
          search: 'MCP',
          lines: 5
        }
      },
      id: 502
    });
    
    const multiFilterText = multiFilterResponse.result.content[0].text;
    if (!multiFilterText.includes('No logs found')) {
      expect(multiFilterText).toContain('filters: level=INFO, search="MCP"');
    }
  });

  test('should run comprehensive diagnostics via doctor tool', async () => {
    // First set some pricing to make the diagnostics more interesting
    await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-set-pricing',
        arguments: {
          service: 'openai',
          model: 'gpt-4',
          inputCost: 5,
          outputCost: 10
        }
      },
      id: 601
    });
    
    // Run the doctor command
    const doctorResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'doctor',
        arguments: {}
      },
      id: 602
    });
    
    const doctorOutput = doctorResponse.result.content[0].text;
    
    // Verify all major sections are present
    expect(doctorOutput).toContain('🏥 AI Advisor Diagnostics Report');
    expect(doctorOutput).toContain('📊 System Information');
    expect(doctorOutput).toContain('⚙️  Configuration Overview');
    expect(doctorOutput).toContain('🔌 Plugin Status');
    expect(doctorOutput).toContain('📋 Recent Logs');
    expect(doctorOutput).toContain('💡 Health Checks & Recommendations');
    expect(doctorOutput).toContain('📚 Helpful MCP Tool Commands');
    
    // Verify system information
    expect(doctorOutput).toMatch(/Version: \d+\.\d+\.\d+/);
    expect(doctorOutput).toContain('Platform:');
    expect(doctorOutput).toContain('Node Version:');
    expect(doctorOutput).toContain('Config Directory:');
    
    // Verify configuration is shown with masked API keys
    expect(doctorOutput).toContain('Services Configured:');
    expect(doctorOutput).toContain('openai:');
    expect(doctorOutput).toMatch(/API Key: \*\*\*[a-zA-Z0-9]{4}/); // Masked key
    
    // Verify pricing info is shown
    expect(doctorOutput).toContain('Pricing Configured: 1 models');
    
    // Verify plugin status
    expect(doctorOutput).toContain('Enabled Plugins:');
    
    // Verify log summary
    expect(doctorOutput).toMatch(/Log Summary: \d+ errors, \d+ warnings, \d+ info messages/);
    
    // Verify helpful commands section
    expect(doctorOutput).toContain("config-view-logs (with level='ERROR')");
    expect(doctorOutput).toContain('config-set-pricing');
    expect(doctorOutput).toContain('config-backup');
  });

  test('should show appropriate recommendations in doctor output', async () => {
    // Create a service without an API key to trigger a recommendation
    await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-set',
        arguments: {
          service: 'testservice',
          key: 'models',
          value: 'test-model-1,test-model-2'
        }
      },
      id: 701
    });
    
    // Run doctor to see recommendations
    const doctorResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'doctor',
        arguments: {}
      },
      id: 702
    });
    
    const doctorOutput = doctorResponse.result.content[0].text;
    
    // Should have a warning about missing API key
    expect(doctorOutput).toContain('⚠️  No API key configured for testservice');
    
    // Clean up
    await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'config-remove',
        arguments: {
          service: 'testservice'
        }
      },
      id: 703
    });
  });

  test('should handle doctor command errors gracefully', async () => {
    // This test ensures doctor command doesn't crash even with issues
    // The command should always return useful output
    const doctorResponse = await sendRequest(mcpProcess, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'doctor',
        arguments: {}
      },
      id: 801
    });
    
    // Should always return a successful response with diagnostic info
    expect(doctorResponse.result).toBeDefined();
    expect(doctorResponse.result.isError).not.toBe(true);
    expect(doctorResponse.result.content[0].text).toContain('AI Advisor Diagnostics Report');
  });

  // Tests for MCP consult with configured models
  describe('MCP Consult Model Resolution', () => {
    beforeAll(async () => {
      // Set up services with models for testing
      const setupCommands = [
        // Set up OpenAI service
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'config-set',
            arguments: {
              service: 'openai',
              key: 'apiKey',
              value: 'test-openai-key'
            }
          },
          id: 900
        },
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'config-set',
            arguments: {
              service: 'openai',
              key: 'models',
              value: 'o3-mini,gpt-4-turbo'
            }
          },
          id: 901
        },
        // Set up Anthropic service
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'config-set',
            arguments: {
              service: 'anthropic',
              key: 'apiKey',
              value: 'test-anthropic-key'
            }
          },
          id: 902
        },
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'config-set',
            arguments: {
              service: 'anthropic',
              key: 'models',
              value: 'claude-sonnet-4-20250514'
            }
          },
          id: 903
        },
        // Set up OpenRouter service
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'config-set',
            arguments: {
              service: 'openrouter',
              key: 'apiKey',
              value: 'test-openrouter-key'
            }
          },
          id: 904
        },
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'config-set',
            arguments: {
              service: 'openrouter',
              key: 'models',
              value: 'minimax/minimax-m1'
            }
          },
          id: 905
        }
      ];
      
      // Execute all setup commands
      for (const cmd of setupCommands) {
        await sendRequest(mcpProcess, cmd);
      }
    });
    
    test('should list available models when no model specified', async () => {
      const consultRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'consult',
          arguments: {
            prompt: 'Test prompt',
            models: []
          }
        },
        id: 910
      };
      
      const response = await sendRequest(mcpProcess, consultRequest);
      
      expect(response.result.isError).toBe(true);
      const errorText = response.result.content[0].text;
      expect(errorText).toContain('No models specified');
      expect(errorText).toContain('Available models:');
      expect(errorText).toContain('openai/o3-mini');
      expect(errorText).toContain('openai/gpt-4-turbo');
      expect(errorText).toContain('anthropic/claude-sonnet-4-20250514');
      expect(errorText).toContain('openrouter/minimax/minimax-m1');
    });
    
    test('should resolve model with service prefix', async () => {
      const consultRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'consult',
          arguments: {
            prompt: 'What is 2 + 2? Reply with just the number.',
            models: ['openai/o3-mini']
          }
        },
        id: 911
      };
      
      const response = await sendRequest(mcpProcess, consultRequest);
      
      // The actual API call will fail (test keys), but model resolution should work
      expect(response.result).toBeDefined();
      const resultText = response.result.content[0].text;
      const result = JSON.parse(resultText);
      
      // Check that the model was attempted
      expect(result.responses).toBeDefined();
      expect(result.responses[0].model).toBe('openai/o3-mini');
    });
    
    test('should resolve bare model name when unique', async () => {
      const consultRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'consult',
          arguments: {
            prompt: 'What is 2 + 2? Reply with just the number.',
            models: ['claude-sonnet-4-20250514'] // Unique to anthropic
          }
        },
        id: 912
      };
      
      const response = await sendRequest(mcpProcess, consultRequest);
      
      expect(response.result).toBeDefined();
      const resultText = response.result.content[0].text;
      const result = JSON.parse(resultText);
      
      // Check that the model was resolved to anthropic
      expect(result.responses[0].model).toBe('anthropic/claude-sonnet-4-20250514');
    });
    
    test('should fail when bare model name is ambiguous without default service', async () => {
      // First, add the same model to multiple services to create ambiguity
      await sendRequest(mcpProcess, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'config-add-model',
          arguments: {
            service: 'openrouter',
            model: 'gpt-4-turbo' // Also available in openai
          }
        },
        id: 913
      });
      
      const consultRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'consult',
          arguments: {
            prompt: 'Test prompt',
            models: ['gpt-4-turbo'] // Ambiguous - in both openai and openrouter
          }
        },
        id: 914
      };
      
      const response = await sendRequest(mcpProcess, consultRequest);
      
      expect(response.result.isError).toBe(true);
      const errorText = response.result.content[0].text;
      expect(errorText).toContain('Failed to resolve models');
      expect(errorText).toMatch(/gpt-4-turbo.*configured in multiple services/);
      expect(errorText).toContain('openai');
      expect(errorText).toContain('openrouter');
    });
    
    test('should resolve ambiguous model with default service', async () => {
      // Set default service
      await sendRequest(mcpProcess, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'config-set-default-service',
          arguments: {
            service: 'openai'
          }
        },
        id: 915
      });
      
      // Now the ambiguous model should resolve to openai
      const consultRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'consult',
          arguments: {
            prompt: 'What is 2 + 2? Reply with just the number.',
            models: ['gpt-4-turbo'] // Should resolve to openai/gpt-4-turbo
          }
        },
        id: 916
      };
      
      const response = await sendRequest(mcpProcess, consultRequest);
      
      expect(response.result).toBeDefined();
      const resultText = response.result.content[0].text;
      const result = JSON.parse(resultText);
      
      expect(result.responses[0].model).toBe('openai/gpt-4-turbo');
    });
    
    test('should fail for non-existent model', async () => {
      const consultRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'consult',
          arguments: {
            prompt: 'Test prompt',
            models: ['non-existent-model']
          }
        },
        id: 917
      };
      
      const response = await sendRequest(mcpProcess, consultRequest);
      
      expect(response.result.isError).toBe(true);
      const errorText = response.result.content[0].text;
      expect(errorText).toContain('Failed to resolve models');
      expect(errorText).toContain('Model \'non-existent-model\' not found');
    });
    
    test('should use default model when none specified', async () => {
      // Set a default model
      await sendRequest(mcpProcess, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'config-set-default',
          arguments: {
            model: 'openai/o3-mini'
          }
        },
        id: 918
      });
      
      // Call consult without specifying models
      const consultRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'consult',
          arguments: {
            prompt: 'What is 2 + 2? Reply with just the number.'
            // No models specified - should use default
          }
        },
        id: 919
      };
      
      const response = await sendRequest(mcpProcess, consultRequest);
      
      expect(response.result).toBeDefined();
      const resultText = response.result.content[0].text;
      const result = JSON.parse(resultText);
      
      expect(result.responses[0].model).toBe('openai/o3-mini');
    });
    
    test('should handle multiple models in one request', async () => {
      const consultRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'consult',
          arguments: {
            prompt: 'What is 2 + 2? Reply with just the number.',
            models: ['openai/o3-mini', 'anthropic/claude-sonnet-4-20250514', 'minimax/minimax-m1']
          }
        },
        id: 920
      };
      
      const response = await sendRequest(mcpProcess, consultRequest);
      
      expect(response.result).toBeDefined();
      const resultText = response.result.content[0].text;
      const result = JSON.parse(resultText);
      
      expect(result.responses).toHaveLength(3);
      expect(result.responses[0].model).toBe('openai/o3-mini');
      expect(result.responses[1].model).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.responses[2].model).toBe('openrouter/minimax/minimax-m1');
    });
    
    test('should correctly resolve OpenRouter models with multiple slashes (google/gemini-2.5-pro-preview)', async () => {
      // Add Google Gemini model to OpenRouter
      await sendRequest(mcpProcess, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'config-set',
          arguments: {
            service: 'openrouter',
            key: 'models',
            value: 'google/gemini-2.5-pro-preview'
          }
        },
        id: 921
      });
      
      // Set OpenRouter as default service
      await sendRequest(mcpProcess, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'config-set-default-service',
          arguments: {
            service: 'openrouter'
          }
        },
        id: 922
      });
      
      // Test with full service/model specification
      const consultFullRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'consult',
          arguments: {
            prompt: 'What is 2 + 2? Reply with just the number.',
            models: ['openrouter/google/gemini-2.5-pro-preview']
          }
        },
        id: 923
      };
      
      const fullResponse = await sendRequest(mcpProcess, consultFullRequest);
      
      expect(fullResponse.result).toBeDefined();
      // Should not have error about model resolution
      if (fullResponse.result.isError) {
        expect(fullResponse.result.content[0].text).not.toContain('Failed to resolve models');
        expect(fullResponse.result.content[0].text).not.toContain("Model 'google' not configured");
      } else {
        const resultText = fullResponse.result.content[0].text;
        const result = JSON.parse(resultText);
        expect(result.responses[0].model).toBe('openrouter/google/gemini-2.5-pro-preview');
      }
      
      // Test with bare model name (should resolve to openrouter since it's default)
      const consultBareRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'consult',
          arguments: {
            prompt: 'What is 2 + 2? Reply with just the number.',
            models: ['google/gemini-2.5-pro-preview']
          }
        },
        id: 924
      };
      
      const bareResponse = await sendRequest(mcpProcess, consultBareRequest);
      
      expect(bareResponse.result).toBeDefined();
      if (bareResponse.result.isError) {
        expect(bareResponse.result.content[0].text).not.toContain('Failed to resolve models');
        expect(bareResponse.result.content[0].text).not.toContain("Service 'google' not found");
      } else {
        const resultText = bareResponse.result.content[0].text;
        const result = JSON.parse(resultText);
        expect(result.responses[0].model).toBe('openrouter/google/gemini-2.5-pro-preview');
      }
    });
  });
});