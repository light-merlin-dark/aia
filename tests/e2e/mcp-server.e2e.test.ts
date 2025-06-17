import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

describe('MCP Server E2E Tests', () => {
  let mcpProcess: ChildProcess;
  
  beforeAll(async () => {
    // Use the user's actual configuration instead of test config
    // since they've just set it up
    const mcpServerPath = join(process.cwd(), 'src', 'mcp-server.ts');
    mcpProcess = spawn('bun', ['run', mcpServerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env  // Pass all environment variables
    });

    // Capture all output for debugging
    mcpProcess.stdout?.on('data', (data) => {
      console.log('[MCP stdout]:', data.toString());
    });

    mcpProcess.stderr?.on('data', (data) => {
      console.error('[MCP stderr]:', data.toString());
    });

    // Give the server time to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(() => {
    if (mcpProcess && !mcpProcess.killed) {
      mcpProcess.kill('SIGTERM');
    }
  });

  it('should start MCP server process successfully', () => {
    expect(mcpProcess).toBeDefined();
    expect(mcpProcess.killed).toBe(false);
  });

  it('should handle MCP protocol initialization', async () => {
    const responses: string[] = [];
    
    // Collect responses
    mcpProcess.stdout?.on('data', (data) => {
      responses.push(data.toString());
    });

    // Send initialization request following MCP protocol
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

    mcpProcess.stdin?.write(JSON.stringify(initRequest) + '\n');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check we got a response
    expect(responses.length).toBeGreaterThan(0);
    
    // Parse and verify response
    const responseText = responses.join('');
    expect(responseText).toContain('jsonrpc');
    expect(responseText).toContain('2.0');
  });

  it('should list consult tool after initialization', async () => {
    const responses: string[] = [];
    
    mcpProcess.stdout?.removeAllListeners('data');
    mcpProcess.stdout?.on('data', (data) => {
      responses.push(data.toString());
    });

    // First initialize
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

    mcpProcess.stdin?.write(JSON.stringify(initRequest) + '\n');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Clear responses
    responses.length = 0;

    // Then list tools
    const listToolsRequest = {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 2
    };

    mcpProcess.stdin?.write(JSON.stringify(listToolsRequest) + '\n');
    await new Promise(resolve => setTimeout(resolve, 500));

    const responseText = responses.join('');
    expect(responseText).toContain('consult');
    expect(responseText).toContain('tools');
  });

  it('should execute consult tool with simple prompt', async () => {
    const responses: string[] = [];
    
    mcpProcess.stdout?.removeAllListeners('data');
    mcpProcess.stdout?.on('data', (data) => {
      responses.push(data.toString());
    });

    // Execute consult tool
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

    mcpProcess.stdin?.write(JSON.stringify(consultRequest) + '\n');

    // Wait longer for API response
    await new Promise(resolve => setTimeout(resolve, 5000));

    const responseText = responses.join('');
    // Should have some response content
    expect(responseText.length).toBeGreaterThan(0);
    // Should contain JSON-RPC structure
    expect(responseText).toContain('jsonrpc');
  });

  it('should handle missing required parameters', async () => {
    const responses: string[] = [];
    
    mcpProcess.stdout?.removeAllListeners('data');
    mcpProcess.stdout?.on('data', (data) => {
      responses.push(data.toString());
    });

    // Send request missing required prompt
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

    mcpProcess.stdin?.write(JSON.stringify(invalidRequest) + '\n');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const responseText = responses.join('');
    // Should contain error
    expect(responseText).toMatch(/error|required|prompt/i);
  });
});