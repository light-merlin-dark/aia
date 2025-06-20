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
        const targetModels = models && models.length > 0 ? models : [];
        
        // If no models specified, throw an error
        if (targetModels.length === 0) {
          const availableServices = Object.keys(config.services).filter(s => s !== 'default');
          const serviceModels: string[] = [];
          
          // Collect all available models
          for (const service of availableServices) {
            const svcConfig = config.services[service];
            if (svcConfig.models && svcConfig.models.length > 0) {
              serviceModels.push(...svcConfig.models.map(m => `${service}/${m}`));
            }
          }
          
          throw new Error(
            `No models specified. You must specify at least one model.\n` +
            `Available models:\n${serviceModels.map(m => `  - ${m}`).join('\n')}\n` +
            `Usage: { "models": ["model-name"] }`
          );
        }
        
        // Validate that models are not service names
        const serviceNames = Object.keys(config.services).filter(s => s !== 'default');
        for (const model of targetModels) {
          if (serviceNames.includes(model)) {
            const serviceConfig = config.services[model];
            const availableModels = serviceConfig.models || [];
            throw new Error(
              `"${model}" is a service name, not a model.\n` +
              `Available models for ${model}: ${availableModels.join(', ') || 'none configured'}\n` +
              `Use one of these models instead, or configure models using:\n` +
              `aia config-set ${model} models <model1,model2>`
            );
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
    
    // config-set-pricing tool
    server.tool(
      "config-set-pricing",
      "Set input and output pricing for a specific model. Pricing is in dollars per million tokens.",
      {
        service: z.string().describe("The service name (e.g., 'openai', 'anthropic', 'openrouter')"),
        model: z.string().describe("The model name (e.g., 'gpt-4-turbo', 'claude-3-opus-20240229')"),
        inputCost: z.number().min(0).max(1000).describe("Input cost per million tokens in dollars (e.g., 10 for $10/M)"),
        outputCost: z.number().min(0).max(1000).describe("Output cost per million tokens in dollars (e.g., 30 for $30/M)")
      },
      async ({ service, model, inputCost, outputCost }) => {
        try {
          const config = await configManager.getConfig();
          
          // Check if service exists
          if (!config.services[service]) {
            return {
              isError: true,
              content: [{
                type: "text" as const,
                text: `Service '${service}' not found. Available services: ${Object.keys(config.services).join(', ')}`
              }]
            };
          }
          
          // Initialize pricing object if needed
          if (!config.services[service].pricing) {
            config.services[service].pricing = {};
          }
          
          // Set pricing
          config.services[service].pricing![model] = {
            inputCostPerMillion: inputCost,
            outputCostPerMillion: outputCost
          };
          
          await configManager.saveConfig(config);
          
          return {
            content: [{
              type: "text" as const,
              text: `Successfully set pricing for ${service}/${model}:\n- Input: $${inputCost}/M tokens\n- Output: $${outputCost}/M tokens`
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error setting pricing: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-get-pricing tool
    server.tool(
      "config-get-pricing",
      "Get pricing information for a specific model or all models in a service",
      {
        service: z.string().describe("The service name (e.g., 'openai', 'anthropic', 'openrouter')"),
        model: z.string().optional().describe("Optional model name to get specific pricing")
      },
      async ({ service, model }) => {
        try {
          const config = await configManager.getConfig();
          
          if (!config.services[service]) {
            return {
              isError: true,
              content: [{
                type: "text" as const,
                text: `Service '${service}' not found. Available services: ${Object.keys(config.services).join(', ')}`
              }]
            };
          }
          
          const pricing = config.services[service].pricing;
          
          if (!pricing || Object.keys(pricing).length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: `No pricing configured for service '${service}'`
              }]
            };
          }
          
          if (model) {
            // Get specific model pricing
            if (!pricing[model]) {
              return {
                content: [{
                  type: "text" as const,
                  text: `No pricing configured for ${service}/${model}`
                }]
              };
            }
            
            return {
              content: [{
                type: "text" as const,
                text: `Pricing for ${service}/${model}:\n- Input: $${pricing[model].inputCostPerMillion}/M tokens\n- Output: $${pricing[model].outputCostPerMillion}/M tokens`
              }]
            };
          } else {
            // List all pricing for service
            let result = `Pricing for ${service}:\n`;
            for (const [modelName, modelPricing] of Object.entries(pricing)) {
              result += `\n${modelName}:\n`;
              result += `- Input: $${modelPricing.inputCostPerMillion}/M tokens\n`;
              result += `- Output: $${modelPricing.outputCostPerMillion}/M tokens\n`;
            }
            
            return {
              content: [{
                type: "text" as const,
                text: result
              }]
            };
          }
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error getting pricing: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-remove-pricing tool
    server.tool(
      "config-remove-pricing",
      "Remove pricing configuration for a specific model",
      {
        service: z.string().describe("The service name (e.g., 'openai', 'anthropic', 'openrouter')"),
        model: z.string().describe("The model name to remove pricing for")
      },
      async ({ service, model }) => {
        try {
          const config = await configManager.getConfig();
          
          if (!config.services[service]?.pricing?.[model]) {
            return {
              isError: true,
              content: [{
                type: "text" as const,
                text: `No pricing configured for ${service}/${model}`
              }]
            };
          }
          
          delete config.services[service].pricing![model];
          
          // Clean up empty pricing object
          if (Object.keys(config.services[service].pricing!).length === 0) {
            delete config.services[service].pricing;
          }
          
          await configManager.saveConfig(config);
          
          return {
            content: [{
              type: "text" as const,
              text: `Successfully removed pricing for ${service}/${model}`
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error removing pricing: ${error.message}`
            }]
          };
        }
      }
    );
    
    // doctor tool - comprehensive diagnostics
    server.tool(
      "doctor",
      "Run comprehensive diagnostics including configuration, logs, and system information. Great for troubleshooting.",
      {},
      async () => {
        try {
          const { readFileSync, existsSync } = await import('fs');
          const { join, dirname } = await import('path');
          const { homedir, platform, release } = await import('os');
          const { fileURLToPath } = await import('url');
          
          // Find package.json relative to this file
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = dirname(__filename);
          const packageJsonPath = join(__dirname, '..', 'package.json');
          
          let packageJson = { version: 'unknown' };
          try {
            packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          } catch (err) {
            // If we can't find package.json, continue with unknown version
          }
          
          let diagnostic = "🏥 AI Advisor Diagnostics Report\n";
          diagnostic += "=" .repeat(50) + "\n\n";
          
          // System Information
          diagnostic += "📊 System Information\n";
          diagnostic += "-".repeat(30) + "\n";
          diagnostic += `Version: ${packageJson.version}\n`;
          diagnostic += `Platform: ${platform()} ${release()}\n`;
          diagnostic += `Node Version: ${process.version}\n`;
          diagnostic += `User Directory: ${process.cwd()}\n`;
          diagnostic += `Config Directory: ${join(homedir(), '.aia')}\n`;
          diagnostic += `Date: ${new Date().toISOString()}\n\n`;
          
          // Configuration Overview
          diagnostic += "⚙️  Configuration Overview\n";
          diagnostic += "-".repeat(30) + "\n";
          try {
            const config = await configManager.getConfig();
            const serviceCount = Object.keys(config.services).length;
            diagnostic += `Services Configured: ${serviceCount}\n`;
            
            for (const [service, serviceConfig] of Object.entries(config.services)) {
              diagnostic += `\n${service}:\n`;
              diagnostic += `  - API Key: ${serviceConfig.apiKey ? '***' + serviceConfig.apiKey.slice(-4) : 'Not Set'}\n`;
              if (serviceConfig.models && serviceConfig.models.length > 0) {
                diagnostic += `  - Models: ${serviceConfig.models.join(', ')}\n`;
              }
              if (serviceConfig.pricing) {
                const pricingCount = Object.keys(serviceConfig.pricing).length;
                diagnostic += `  - Pricing Configured: ${pricingCount} models\n`;
              }
              if (serviceConfig.endpoint) {
                diagnostic += `  - Custom Endpoint: ${serviceConfig.endpoint}\n`;
              }
            }
            
            if (config.defaultModel) {
              diagnostic += `\nDefault Model: ${config.defaultModel}\n`;
            }
          } catch (error: any) {
            diagnostic += `Error loading config: ${error.message}\n`;
          }
          
          // Plugin Status
          diagnostic += "\n🔌 Plugin Status\n";
          diagnostic += "-".repeat(30) + "\n";
          try {
            const enabledPlugins = registry.getEnabledPlugins();
            diagnostic += `Enabled Plugins: ${enabledPlugins.length}\n`;
            for (const plugin of enabledPlugins) {
              const models = ('listModels' in plugin && typeof plugin.listModels === 'function') ? plugin.listModels() : [];
              diagnostic += `- ${plugin.name}: ${models.length} models\n`;
            }
          } catch (error: any) {
            diagnostic += `Error loading plugins: ${error.message}\n`;
          }
          
          // Recent Logs
          diagnostic += "\n📋 Recent Logs (Last 50 lines)\n";
          diagnostic += "-".repeat(30) + "\n";
          try {
            const logDir = join(homedir(), '.aia', 'logs');
            const logDate = new Date().toISOString().split('T')[0];
            const logFilePath = join(logDir, `mcp-server-${logDate}.log`);
            
            if (existsSync(logFilePath)) {
              const logContent = readFileSync(logFilePath, 'utf-8');
              const allLines = logContent.split('\n').filter(line => line.trim());
              const recentLines = allLines.slice(-50);
              
              // Count log levels
              let errorCount = 0, warnCount = 0, infoCount = 0;
              for (const line of allLines) {
                if (line.includes('[ERROR]')) errorCount++;
                else if (line.includes('[WARN]')) warnCount++;
                else if (line.includes('[INFO]')) infoCount++;
              }
              
              diagnostic += `Log Summary: ${errorCount} errors, ${warnCount} warnings, ${infoCount} info messages\n`;
              diagnostic += `Showing last ${recentLines.length} lines:\n\n`;
              diagnostic += recentLines.join('\n');
            } else {
              diagnostic += `No log file found for today (${logDate})\n`;
            }
          } catch (error: any) {
            diagnostic += `Error reading logs: ${error.message}\n`;
          }
          
          // Health Checks and Recommendations
          diagnostic += "\n\n💡 Health Checks & Recommendations\n";
          diagnostic += "-".repeat(30) + "\n";
          
          const recommendations: string[] = [];
          
          // Check for API keys
          const config = await configManager.getConfig();
          for (const [service, serviceConfig] of Object.entries(config.services)) {
            if (!serviceConfig.apiKey) {
              recommendations.push(`⚠️  No API key configured for ${service}`);
            }
          }
          
          // Check for pricing configuration
          let totalPricingConfigured = 0;
          for (const serviceConfig of Object.values(config.services)) {
            if (serviceConfig.pricing) {
              totalPricingConfigured += Object.keys(serviceConfig.pricing).length;
            }
          }
          if (totalPricingConfigured === 0) {
            recommendations.push(`💰 No pricing configured. Use config-set-pricing to enable cost tracking.`);
          }
          
          // Check for default model
          if (!config.defaultModel && (!config.defaultModels || config.defaultModels.length === 0)) {
            recommendations.push(`🎯 No default model configured. Use config-set-default to set one.`);
          }
          
          if (recommendations.length === 0) {
            diagnostic += "✅ All systems operational!\n";
          } else {
            diagnostic += recommendations.join('\n') + "\n";
          }
          
          // Common Commands
          diagnostic += "\n📚 Helpful MCP Tool Commands\n";
          diagnostic += "-".repeat(30) + "\n";
          diagnostic += "- View error logs: config-view-logs (with level='ERROR')\n";
          diagnostic += "- Set pricing: config-set-pricing (service, model, inputCost, outputCost)\n";
          diagnostic += "- Backup config: config-backup (optional name parameter)\n";
          diagnostic += "- List all config: config-list (no parameters needed)\n";
          diagnostic += "- View recent logs: config-view-logs (lines=100)\n";
          diagnostic += "- Search logs: config-view-logs (search='error')\n";
          
          return {
            content: [{
              type: "text" as const,
              text: diagnostic
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error running diagnostics: ${error.message}`
            }]
          };
        }
      }
    );
    
    // config-view-logs tool
    server.tool(
      "config-view-logs",
      "View MCP server logs with filtering capabilities. Useful for debugging errors and monitoring server activity.",
      {
        lines: z.number().min(1).max(1000).optional().describe("Number of recent lines to return (default: 50, max: 1000)"),
        level: z.enum(["ERROR", "WARN", "INFO", "DEBUG"]).optional().describe("Filter by log level"),
        search: z.string().optional().describe("Search for specific text in logs"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Specific date to view logs (YYYY-MM-DD, defaults to today)")
      },
      async ({ lines = 50, level, search, date }) => {
        try {
          const { readFileSync, existsSync } = await import('fs');
          const { join } = await import('path');
          const { homedir } = await import('os');
          
          // Determine log file path
          const logDir = join(homedir(), '.aia', 'logs');
          const logDate = date || new Date().toISOString().split('T')[0];
          const logFilePath = join(logDir, `mcp-server-${logDate}.log`);
          
          // Check if log file exists
          if (!existsSync(logFilePath)) {
            return {
              content: [{
                type: "text" as const,
                text: `No log file found for date ${logDate}`
              }]
            };
          }
          
          // Read log file
          const logContent = readFileSync(logFilePath, 'utf-8');
          const allLines = logContent.split('\n').filter(line => line.trim());
          
          // Apply filters
          let filteredLines = allLines;
          
          // Filter by log level if specified
          if (level) {
            filteredLines = filteredLines.filter(line => line.includes(`[${level}]`));
          }
          
          // Search filter if specified
          if (search) {
            filteredLines = filteredLines.filter(line => 
              line.toLowerCase().includes(search.toLowerCase())
            );
          }
          
          // Get the requested number of most recent lines
          const startIndex = Math.max(0, filteredLines.length - lines);
          const resultLines = filteredLines.slice(startIndex);
          
          if (resultLines.length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: `No logs found matching criteria:\n- Date: ${logDate}\n- Level: ${level || 'any'}\n- Search: ${search || 'none'}`
              }]
            };
          }
          
          // Format response
          let response = `Log file: ${logFilePath}\n`;
          response += `Showing ${resultLines.length} of ${filteredLines.length} filtered lines`;
          if (level || search) {
            response += ` (filters: ${level ? `level=${level}` : ''}${level && search ? ', ' : ''}${search ? `search="${search}"` : ''})`;
          }
          response += `\n\n${resultLines.join('\n')}`;
          
          return {
            content: [{
              type: "text" as const,
              text: response
            }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error reading logs: ${error.message}`
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