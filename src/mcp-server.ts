#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig } from "./config/manager.js";
import { PluginRegistry } from "./plugins/registry.js";
import { orchestrate } from "./core/orchestrator.js";

// Define the consult tool schema
const consultSchema = z.object({
  prompt: z.string().min(1).describe("The technical query or task"),
  files: z.array(z.string()).optional().describe("File paths to include as context"),
  models: z.array(z.string()).optional().describe("Specific models to consult (defaults to configured model)"),
  bestOf: z.boolean().optional().describe("Select best response from multiple models")
});

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
  // Initialize config and plugin registry
  const config = await getConfig();
  const registry = new PluginRegistry();
  await registry.initialize(config);

  // Initialize MCP server
  const server = new McpServer({
    name: "aia",
    version: "0.1.0",
    description: "AIA - Consult multiple AI models in parallel for technical advice"
  });

  // Register the main consult tool with dynamic description
  server.tool(
    "consult",
    buildConsultDescription(registry),
    async (args) => {
      try {
        // Validate args with schema
        const validated = consultSchema.parse(args);
        const { prompt, files, models, bestOf } = validated;
        
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
  const enabledPlugins = registry.getEnabledPlugins();
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
  await server.connect(new StdioServerTransport());
}

// Run the server
main().catch((error) => {
  console.error("MCP Server error:", error);
  process.exit(1);
});