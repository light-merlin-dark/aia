#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig } from "./config/manager.js";
import { PluginRegistry } from "./plugins/registry.js";
import { orchestrate } from "./core/orchestrator.js";
import { createLogger } from "./services/logger.js";
import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Initialize logger and file logging
const logger = createLogger('MCP-Server');
const logDir = join(homedir(), '.aia', 'logs');
const logFile = join(logDir, `mcp-server-${new Date().toISOString().split('T')[0]}.log`);

// Ensure log directory exists
try {
  mkdirSync(logDir, { recursive: true });
} catch (error) {
  // Directory might already exist
}

// Log to both console and file
function logToFile(level: string, message: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}\n`;
  try {
    appendFileSync(logFile, logEntry);
  } catch (error) {
    // Fail silently if can't write to file
  }
}

// Define the consult tool schema as raw shape for MCP
const consultSchemaShape = {
  prompt: z.string().min(1).describe("The technical query or task"),
  files: z.array(z.string()).optional().describe("File paths to include as context"),
  models: z.array(z.string()).optional().describe("Specific models to consult (defaults to configured model)"),
  bestOf: z.boolean().optional().describe("Select best response from multiple models")
};

// Build dynamic tool description based on enabled plugins
function buildConsultDescription(registry: PluginRegistry): string {
  let description = `Consult AI models for technical advice. Examples:

BASIC USAGE:
• Single model: {"prompt": "Explain async/await"}
• Multiple models: {"prompt": "Design a REST API", "models": ["gpt-4-turbo", "claude-3-opus"]}
• With files: {"prompt": "Refactor this code", "files": ["src/index.ts"]}`;

  const enabledPlugins = registry.getEnabledPlugins();
  if (enabledPlugins.length > 0) {
    description += "\n\nAVAILABLE MODELS:";
    for (const plugin of enabledPlugins) {
      const models = ('listModels' in plugin && typeof plugin.listModels === 'function') ? plugin.listModels() : [];
      if (models.length > 0) {
        description += `\n• ${plugin.name}: ${models.join(", ")}`;
      }
    }
  }

  return description;
}

async function main() {
  logger.info('Starting MCP server...');
  logToFile('INFO', 'Starting MCP server...');
  
  try {
    // Initialize config and plugin registry
    logger.info('Initializing configuration...');
    logToFile('INFO', 'Initializing configuration...');
    
    // Set MCP mode to skip interactive prompts
    process.env.AIA_MCP_MODE = 'true';
    const config = await getConfig();
    
    logger.info('Initializing plugin registry...');
    logToFile('INFO', 'Initializing plugin registry...');
    const registry = new PluginRegistry();
    await registry.initialize(config);
    
    const enabledPlugins = registry.getEnabledPlugins();
    logger.info(`Loaded ${enabledPlugins.length} plugins:`, enabledPlugins.map(p => p.name));
    logToFile('INFO', `Loaded ${enabledPlugins.length} plugins:`, enabledPlugins.map(p => p.name));

    // Initialize MCP server
    logger.info('Creating MCP server instance...');
    logToFile('INFO', 'Creating MCP server instance...');
    const server = new McpServer({
      name: "aia",
      version: "0.1.0",
      description: "AIA - Consult multiple AI models in parallel for technical advice"
    });

    // Register the main consult tool with dynamic description
    logger.info('Registering consult tool...');
    logToFile('INFO', 'Registering consult tool...');
    server.tool(
    "consult",
    buildConsultDescription(registry),
    consultSchemaShape,
    async ({ prompt, files, models, bestOf }) => {
      try {
        logger.debug('Consult tool invoked with:', { prompt, files, models, bestOf });
        logToFile('DEBUG', 'Consult tool invoked with:', { prompt, files, models, bestOf });
        
        // Use configured default model if none specified
        const targetModels = models && models.length > 0 
          ? models 
          : [config.defaultModel || 'gpt-4-turbo'];

        // Orchestrate the consultation
        const result = await orchestrate({
          prompt,
          files,
          models: targetModels,
          bestOf,
          registry
        });

        // Format response
        if (result.error) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error: ${result.error}`
            }]
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        logger.error('Consult tool error:', error);
        logToFile('ERROR', 'Consult tool error:', error.message, error.stack);
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error: ${error.message}`
          }]
        };
      }
    }
  );

    // Register any additional MCP tools from plugins
    logger.info('Registering plugin tools...');
    logToFile('INFO', 'Registering plugin tools...');
    for (const plugin of enabledPlugins) {
    if (plugin.mcpTools) {
      for (const tool of plugin.mcpTools) {
        server.tool(
          tool.name,
          tool.description || `Plugin tool: ${tool.name}`,
          async (args) => {
            try {
              const result = await tool.handler(args, { registry, config });
              return {
                content: [{
                  type: "text" as const,
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                }]
              };
            } catch (error: any) {
              logger.error(`Plugin tool error in ${tool.name}:`, error);
              logToFile('ERROR', `Plugin tool error in ${tool.name}:`, error.message, error.stack);
              return {
                isError: true,
                content: [{
                  type: "text" as const,
                  text: `Error in ${tool.name}: ${error.message}`
                }]
              };
            }
          }
        );
      }
    }
  }

    // Tool description is set during registration

    // Connect to stdio transport
    logger.info('Connecting to stdio transport...');
    logToFile('INFO', 'Connecting to stdio transport...');
    
    const transport = new StdioServerTransport();
    
    // Add transport event listeners for debugging
    transport.onerror = (error: Error) => {
      logger.error('Transport error:', error);
      logToFile('ERROR', 'Transport error:', error.message, error.stack);
    };
    
    await server.connect(transport);
    
    logger.info('MCP server successfully started and listening on stdio');
    logToFile('INFO', 'MCP server successfully started and listening on stdio');
    logger.info(`Log file: ${logFile}`);
    
  } catch (error: any) {
    logger.error('Failed to start MCP server:', error);
    logToFile('ERROR', 'Failed to start MCP server:', error.message, error.stack);
    throw error;
  }
}

// Run the server
main().catch((error) => {
  logger.error('Fatal MCP server error:', error);
  logToFile('FATAL', 'Fatal MCP server error:', error.message, error.stack);
  console.error("MCP Server error:", error);
  console.error(`Check logs at: ${logFile}`);
  process.exit(1);
});