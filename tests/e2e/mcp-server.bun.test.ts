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
    const mcpServerPath = join(process.cwd(), 'src', 'mcp-server.ts');
    mcpProcess = spawn('bun', ['run', mcpServerPath], {
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
          models: ['gpt-3.5-turbo']
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
          models: ['gpt-3.5-turbo']
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
});