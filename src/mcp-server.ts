#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig, ConfigManager } from "./config/manager.js";
import { PluginRegistry } from "./plugins/registry.js";
import { orchestrate } from "./core/orchestrator.js";
import { createLogger } from "./services/logger.js";
import { FileResolver } from "./services/file-resolver.js";
import { mkdirSync, appendFileSync, writeFileSync } from "fs";
import { join, dirname, resolve, isAbsolute } from "path";
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
  prompt: z.string().min(1).describe("The technical query or task. Be specific and detailed for best results. Can include code snippets, error messages, requirements, etc."),
  files: z.array(z.string()).optional().describe("Array of file paths to include as context. Supports wildcards (e.g., 'src/**/*.ts'). Files are read and included in the prompt to provide context."),
  models: z.array(z.string()).optional().describe("Array of AI models to consult. Use provider prefix for non-default providers (e.g., 'openai/gpt-4-turbo', 'anthropic/claude-3-opus'). If not specified, uses the default configured model."),
  bestOf: z.boolean().optional().describe("When true, evaluates all model responses and returns only the best one. Useful for critical decisions or when quality matters more than seeing all perspectives."),
  output: z.string().optional().describe("File path where the JSON response will be saved. Supports both relative and absolute paths. Directories are created automatically if they don't exist.")
};

// Helper to get example models based on user configuration
function getExampleModels(config: any, count: number): string[] {
  const models: string[] = [];
  
  // First, add default models if configured
  if (config.defaultModels && config.defaultModels.length > 0) {
    models.push(...config.defaultModels.slice(0, count));
  } else if (config.defaultModel) {
    models.push(config.defaultModel);
  }
  
  // Fill with available models from configured services
  for (const serviceConfig of Object.values(config.services)) {
    if (serviceConfig && (serviceConfig as any).models) {
      for (const model of (serviceConfig as any).models) {
        if (!models.includes(model) && models.length < count) {
          models.push(model);
        }
      }
    }
  }
  
  // If still not enough, add some reasonable defaults based on configured services
  if (models.length < count && config.services.openai) {
    models.push('gpt-4-turbo');
  }
  if (models.length < count && config.services.anthropic) {
    models.push('claude-3-opus-20240229');
  }
  if (models.length < count && config.services.openrouter) {
    models.push('google/gemini-pro');
  }
  
  return models.slice(0, count);
}

// Build dynamic tool description based on enabled plugins
function buildConsultDescription(registry: PluginRegistry, config: any): string {
  let description = `Consult multiple AI models in parallel for technical advice, code reviews, architectural decisions, and problem-solving. Features automatic retry/failover, cost tracking, and parallel execution.

PARAMETERS:
• prompt (required): Your technical question or task
• files (optional): Array of file paths to include as context (supports wildcards)
• models (optional): Array of specific models to consult (defaults to configured model)
• bestOf (optional): If true, returns only the best response from multiple models
• output (optional): File path to save the response (creates directories as needed)

REAL-WORLD EXAMPLES:

1. Code Review:
{"prompt": "Review this code for security vulnerabilities and performance issues", "files": ["src/**/*.ts"], "models": ${JSON.stringify(getExampleModels(config, 2))}}

2. Architecture Decision:
{"prompt": "Design a scalable microservices architecture for an e-commerce platform with 1M daily users", "models": ${JSON.stringify(getExampleModels(config, 3))}, "bestOf": true}

3. Debugging Help:
{"prompt": "This function is throwing 'undefined is not a function'. Help me fix it", "files": ["src/utils/parser.js", "tests/parser.test.js"]}

4. Documentation Generation:
{"prompt": "Generate comprehensive API documentation for these endpoints", "files": ["src/api/**/*.ts"], "output": "docs/api-reference.md"}

5. Code Refactoring:
{"prompt": "Refactor this legacy code to use modern React patterns and TypeScript", "files": ["components/UserDashboard.jsx"], "models": ${JSON.stringify(getExampleModels(config, 1))}, "output": "refactored/UserDashboard.tsx"}

6. Test Generation:
{"prompt": "Write comprehensive unit tests with edge cases", "files": ["src/services/auth.ts"], "output": "tests/auth.test.ts"}

RESPONSE STRUCTURE:
{
  "responses": [
    {
      "model": "${getExampleModels(config, 1)[0] || 'your-model'}",
      "content": "AI response here...",
      "provider": "openai",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "usage": {
        "prompt_tokens": 150,
        "completion_tokens": 500,
        "total_tokens": 650
      }
    }
  ],
  "failed": [],  // List of models that failed
  "durationMs": 1234,
  "bestIndex": 0,  // If bestOf=true, index of best response
  "costs": [
    {
      "model": "${getExampleModels(config, 1)[0] || 'your-model'}",
      "promptCost": 0.0015,
      "completionCost": 0.015,
      "totalCost": 0.0165
    }
  ],
  "totalCost": 0.0165
}

TIPS:
• Use specific, detailed prompts for better results
• Include relevant files for context-aware responses
• Use multiple models for important decisions
• Save responses to files for documentation/audit trail
• Models automatically retry on failure (up to 3 attempts)`;

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
    buildConsultDescription(registry, config),
    consultSchemaShape,
    async ({ prompt, files, models, bestOf, output }) => {
      try {
        logger.debug('Consult tool invoked with:', { prompt, files, models, bestOf, output });
        logToFile('DEBUG', 'Consult tool invoked with:', { prompt, files, models, bestOf, output });
        
        // Use configured default model if none specified
        let targetModels = models && models.length > 0 ? models : [];
        
        // If no models specified, use models from default service
        if (targetModels.length === 0) {
          // Check if we have a default service configured
          const defaultService = config.services?.default?.service;
          if (defaultService && config.services[defaultService]?.models) {
            targetModels = config.services[defaultService].models;
            logger.debug(`Using models from default service '${defaultService}':`, targetModels);
          } else {
            // Fall back to legacy defaultModels/defaultModel
            targetModels = config.defaultModels || (config.defaultModel ? [config.defaultModel] : []);
          }
          
          if (targetModels.length === 0) {
            throw new Error('No models specified and no default models configured');
          }
        }

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

        // Write to output file if specified
        if (output) {
          try {
            // Resolve output path relative to working directory
            const workingDir = FileResolver.detectWorkingDirectory();
            const resolvedOutput = isAbsolute(output) ? output : resolve(workingDir, output);
            
            // Ensure directory exists
            const outputDir = dirname(resolvedOutput);
            mkdirSync(outputDir, { recursive: true });
            
            // Write the formatted result
            const formattedResult = JSON.stringify(result, null, 2);
            writeFileSync(resolvedOutput, formattedResult, 'utf-8');
            
            logger.info(`Response written to: ${resolvedOutput}`);
            logToFile('INFO', `Response written to: ${resolvedOutput}`);
            
            // Return success with file path
            return {
              content: [{
                type: "text" as const,
                text: `Response written to: ${resolvedOutput}\n\n${formattedResult}`
              }]
            };
          } catch (writeError: any) {
            logger.error('Failed to write output file:', writeError);
            logToFile('ERROR', 'Failed to write output file:', writeError.message);
            
            // Return result but mention write error
            return {
              content: [{
                type: "text" as const,
                text: `Warning: Failed to write to ${output}: ${writeError.message}\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          }
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

    // Register configuration management tools
    const configManager = ConfigManager.getInstance();
    
    // config-list tool
    server.tool(
      "config-list",
      "List all AI Advisor configuration including services, API keys, models, and defaults",
      {}, // No parameters needed
      async () => {
        try {
          const config = await configManager.listConfig();
          // Mask API keys for security
          const maskedConfig = JSON.parse(JSON.stringify(config));
          for (const service in maskedConfig.services) {
            if (maskedConfig.services[service].apiKey) {
              maskedConfig.services[service].apiKey = '***' + maskedConfig.services[service].apiKey.slice(-4);
            }
          }
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify(maskedConfig, null, 2)
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error listing config: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-get tool
    server.tool(
      "config-get",
      "Get configuration for a specific service or a specific key within a service",
      {
        service: z.string().describe("The service name (e.g., 'openai', 'anthropic', 'openrouter')"),
        key: z.string().optional().describe("Optional specific key to retrieve (e.g., 'apiKey', 'models', 'endpoint')")
      },
      async ({ service, key }) => {
        try {
          const result = await configManager.getServiceConfig(service, key);
          // Mask API key if that's what we're returning
          if (key === 'apiKey' || (!key && result.apiKey)) {
            if (typeof result === 'string') {
              return {
                content: [{
                  type: "text" as const,
                  text: '***' + result.slice(-4)
                }]
              };
            } else {
              result.apiKey = '***' + result.apiKey.slice(-4);
            }
          }
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error getting config: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-set tool
    server.tool(
      "config-set",
      "Set a configuration value for a service. Creates the service if it doesn't exist.",
      {
        service: z.string().describe("The service name (e.g., 'openai', 'anthropic', 'openrouter')"),
        key: z.string().describe("The configuration key to set (e.g., 'apiKey', 'endpoint', 'models')"),
        value: z.string().describe("The value to set. For models, use comma-separated list. For pricing, use JSON.")
      },
      async ({ service, key, value }) => {
        try {
          await configManager.setServiceConfig(service, key, value);
          return {
            content: [{
              type: "text" as const,
              text: `Successfully set ${key} for service ${service}`
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error setting config: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-add-model tool
    server.tool(
      "config-add-model",
      "Add a model to a service's available models list",
      {
        service: z.string().describe("The service name (e.g., 'openai', 'anthropic', 'openrouter')"),
        model: z.string().describe("The model name to add (e.g., 'gpt-4', 'claude-3-opus-20240229')")
      },
      async ({ service, model }) => {
        try {
          await configManager.addModel(service, model);
          return {
            content: [{
              type: "text" as const,
              text: `Successfully added model ${model} to service ${service}`
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error adding model: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-set-default tool
    server.tool(
      "config-set-default",
      "Set the default model to use when no specific model is requested",
      {
        model: z.string().describe("The model to set as default (e.g., 'gpt-4-turbo', 'anthropic/claude-3-opus-20240229')")
      },
      async ({ model }) => {
        try {
          await configManager.setDefaultModel(model);
          return {
            content: [{
              type: "text" as const,
              text: `Successfully set default model to ${model}`
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error setting default model: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-remove tool
    server.tool(
      "config-remove",
      "Remove a service and all its configuration",
      {
        service: z.string().describe("The service name to remove (e.g., 'openai', 'anthropic', 'openrouter')")
      },
      async ({ service }) => {
        try {
          await configManager.removeService(service);
          return {
            content: [{
              type: "text" as const,
              text: `Successfully removed service ${service}`
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error removing service: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-clear-default tool
    server.tool(
      "config-clear-default",
      "Clear the global default model configuration",
      {},
      async () => {
        try {
          await configManager.clearDefaultModel();
          return {
            content: [{
              type: "text" as const,
              text: `Successfully cleared default model configuration`
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error clearing default model: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-backup tool
    server.tool(
      "config-backup",
      "Backup the current configuration with an optional name",
      {
        name: z.string().optional().describe("Optional backup name (defaults to 'default')")
      },
      async ({ name }) => {
        try {
          const backupName = await configManager.backupConfig(name);
          return {
            content: [{
              type: "text" as const,
              text: `Successfully backed up configuration as '${backupName}'`
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error backing up configuration: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-restore tool
    server.tool(
      "config-restore",
      "Restore configuration from a backup",
      {
        name: z.string().optional().describe("Backup name to restore (defaults to 'default')")
      },
      async ({ name }) => {
        try {
          await configManager.restoreConfig(name);
          return {
            content: [{
              type: "text" as const,
              text: `Successfully restored configuration from '${name || 'default'}' backup`
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error restoring configuration: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-list-backups tool
    server.tool(
      "config-list-backups",
      "List all available configuration backups",
      {},
      async () => {
        try {
          const backups = await configManager.listBackups();
          if (backups.length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: "No configuration backups found"
              }]
            };
          }
          return {
            content: [{
              type: "text" as const,
              text: `Available backups:\n${backups.map(b => `- ${b}`).join('\n')}`
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error listing backups: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-clear tool
    server.tool(
      "config-clear",
      "Clear all configuration (removes all services and settings)",
      {
        confirm: z.boolean().optional().describe("Confirm clearing all configuration (defaults to false)")
      },
      async ({ confirm }) => {
        try {
          if (!confirm) {
            return {
              content: [{
                type: "text" as const,
                text: "Configuration clear cancelled. Set confirm=true to proceed with clearing all configuration."
              }]
            };
          }
          
          await configManager.clearConfig();
          return {
            content: [{
              type: "text" as const,
              text: "Successfully cleared all configuration. You will need to run the setup wizard again."
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error clearing configuration: ${error.message}`
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