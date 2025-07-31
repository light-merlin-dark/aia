import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { execSync } from "child_process";

// Simple color logging without external deps
const blue = (text: string) => `\x1b[34m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;

const PROJECT_ROOT = process.cwd();

// Directory structure
const directories = [
  "src",
  "src/cli",
  "src/cli/commands",
  "src/config",
  "src/core",
  "src/plugins",
  "src/plugins/types",
  "src/plugins/providers",
  "src/plugins/providers/openai",
  "src/plugins/providers/openai/tests",
  "src/plugins/providers/anthropic",
  "src/plugins/providers/anthropic/tests",
  "src/plugins/providers/openrouter",
  "src/plugins/providers/openrouter/tests",
  "src/services",
  "src/utils",
  "scripts",
  "tests",
  "tests/unit",
  "tests/integration",
  "tests/fixtures",
  "tests/fixtures/mock-files",
  "tests/fixtures/mock-responses",
];

// File templates
const files: Record<string, string> = {
  "package.json": `{
  "name": "ai-advisor",
  "version": "0.1.0",
  "description": "AI Advisor - Parallel AI model consultation CLI and MCP server",
  "keywords": ["ai", "cli", "mcp", "openai", "anthropic", "llm"],
  "author": "Merlin",
  "license": "MIT",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "ai-advisor": "dist/index.js",
    "ai-advisor-mcp": "dist/mcp-server.js"
  },
  "files": [
    "dist/",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "bun run src/index.ts",
    "mcp-dev": "bun run src/mcp-server.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src tests --ext .ts",
    "lint:fix": "eslint src tests --ext .ts --fix",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "bun run build && chmod +x dist/index.js dist/mcp-server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "chalk": "^5.3.0",
    "commander": "^12.0.0",
    "prompts": "^2.4.2",
    "zod": "^3.22.4",
    "glob": "^10.3.10",
    "p-retry": "^6.2.0",
    "openai": "^4.52.0",
    "@anthropic-ai/sdk": "^0.24.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/prompts": "^2.4.9",
    "@typescript-eslint/eslint-plugin": "^7.13.0",
    "@typescript-eslint/parser": "^7.13.0",
    "@vitest/coverage-v8": "^1.6.0",
    "eslint": "^8.57.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0",
    "msw": "^2.3.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "bun": ">=1.0.0"
  }
}`,

  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "allowJs": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@test-utils": ["tests/test-utils"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}`,

  "vitest.config.ts": `import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/tests/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'scripts/',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/types.ts'
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@test-utils': resolve(__dirname, './tests/test-utils'),
    },
  },
});`,

  "bunfig.toml": `[test]
preload = ["./tests/setup.ts"]

[run]
silent = false`,

  ".gitignore": `# Dependencies
node_modules/
bun.lockb

# Build output
dist/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log
npm-debug.log*
bun-debug.log*

# Testing
coverage/
.vitest/

# Temporary
*.tmp
*.temp

# User config (never commit)
.ai-advisor/`,

  ".env.example": `# AI Service API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...

# Optional: Custom configuration
# AI_ADVISOR_CONFIG_DIR=~/.ai-advisor
# AI_ADVISOR_LOG_LEVEL=info`,

  Makefile: `.PHONY: install build test lint dev mcp-dev push release clean help

# Default target
help:
	@echo "Available commands:"
	@echo "  make install    - Install dependencies"
	@echo "  make build      - Build the project"
	@echo "  make test       - Run tests"
	@echo "  make lint       - Run linter"
	@echo "  make dev        - Run CLI in development mode"
	@echo "  make mcp-dev    - Run MCP server in development mode"
	@echo "  make push       - Prepare and push release"
	@echo "  make release    - Full release (push + npm publish)"
	@echo "  make clean      - Clean build artifacts"

install:
	bun install

build:
	bun run build

test:
	bun test

lint:
	bun run lint

typecheck:
	bun run typecheck

dev:
	bun run dev

mcp-dev:
	bun run mcp-dev

# Smart push - handles everything before npm publish
push:
	@echo "🚀 Preparing release..."
	make lint
	make typecheck
	make build
	make test
	@echo "📦 Checking version..."
	bun run scripts/smart-version.ts
	git add .
	git commit -m "build: Bump package version to $$(node -p "require('./package.json').version")" || true
	git push origin main
	@echo "✅ Ready for release! Run 'make release' to publish to npm"

# Full release - includes npm publish
release: push
	@echo "📤 Publishing to npm..."
	npm publish --access public
	@echo "🔍 Running post-release validation..."
	bun run scripts/post-validation.ts
	@echo "🎉 Release complete!"

clean:
	rm -rf dist/
	rm -rf coverage/
	rm -rf .vitest/
	rm -f *.log`,

  "README.md": `# AI Advisor

A powerful CLI tool and MCP server for consulting multiple AI models in parallel. Get diverse perspectives on technical challenges, code refactoring, and complex problem-solving.

## Features

- 🚀 **Parallel AI Consultation** - Query multiple models simultaneously
- 🔌 **Plugin Architecture** - Extensible support for AI providers
- 🔄 **Smart Retry & Failover** - Automatic fallback to available models
- 🤖 **Agent-Native** - JSON output optimized for AI consumption
- 🔐 **Secure Configuration** - Encrypted credential storage
- 📎 **Context Enhancement** - Attach files and directories to prompts

## Installation

\`\`\`bash
npm install -g ai-advisor
\`\`\`

Or with Bun:

\`\`\`bash
bun install -g ai-advisor
\`\`\`

## Quick Start

1. Run the tool for the first time:
   \`\`\`bash
   ai-advisor consult "Hello, AI!"
   \`\`\`

2. Follow the interactive setup to configure your AI providers.

3. Start consulting:
   \`\`\`bash
   # Single model
   ai-advisor consult "Explain async/await in JavaScript"

   # Multiple models
   ai-advisor consult "Design a REST API" -m gpt-4-turbo claude-3-opus

   # With file context
   ai-advisor consult "Refactor this code" -f src/index.ts
   \`\`\`

## MCP Server Setup

Add to Claude Desktop or other MCP-compatible clients:

\`\`\`bash
claude mcp add-json ai-advisor '{
  "type": "stdio",
  "command": "ai-advisor-mcp",
  "env": {"NODE_NO_WARNINGS": "1"}
}'
\`\`\`

## Commands

### \`consult\` - Get AI advice

\`\`\`bash
ai-advisor consult [prompt] [options]
\`\`\`

Options:
- \`-m, --models <models...>\` - Models to consult (default: configured)
- \`-f, --files <paths...>\` - Attach files to prompt
- \`-d, --dirs <paths...>\` - Attach directories recursively
- \`--json\` - Output raw JSON
- \`--best-of\` - Select best response (experimental)

## Configuration

Configuration is stored encrypted at \`~/.ai-advisor/\`.

### Environment Variables

Create a \`.env\` file:

\`\`\`bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...
\`\`\`

## Development

\`\`\`bash
# Install dependencies
make install

# Run in development
make dev

# Run tests
make test

# Build
make build
\`\`\`

## License

MIT`,

  "CHANGELOG.md": `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2024-01-01

### Added
- Initial release
- CLI interface with \`consult\` command
- MCP server for AI agent integration
- Plugin support for OpenAI, Anthropic, and OpenRouter
- Encrypted configuration management
- Interactive first-run setup
- Parallel model consultation
- Retry and failover mechanisms
- File and directory attachment support`,

  LICENSE: `MIT License

Copyright (c) 2024 AI Advisor Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,

  // Stub files for key modules
  "src/index.ts": `#!/usr/bin/env bun

import { Command } from 'commander';
import chalk from 'chalk';
import { consultCommand } from './cli/commands/consult';

const program = new Command();

program
  .name('ai-advisor')
  .description('AI Advisor - Consult multiple AI models in parallel')
  .version('0.1.0');

program
  .command('consult [prompt]')
  .alias('c')
  .description('Consult AI models with a prompt')
  .option('-m, --models <models...>', 'Models to consult')
  .option('-f, --files <files...>', 'Files to attach')
  .option('-d, --dirs <dirs...>', 'Directories to attach')
  .option('--json', 'Output raw JSON')
  .option('--best-of', 'Select best response')
  .action(consultCommand);

program.parse();`,

  "src/mcp-server.ts": `#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "ai-advisor",
  version: "0.1.0",
  description: "Consult multiple AI models for technical advice"
});

const consultSchema = z.object({
  prompt: z.string().min(1).describe("The query or task"),
  files: z.array(z.string()).optional().describe("File paths to include"),
  models: z.array(z.string()).optional().describe("Models to consult"),
  bestOf: z.boolean().optional().describe("Select best response")
});

server.tool("consult", consultSchema, async (args) => {
  // TODO: Implement consultation logic
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ status: "Not implemented yet" })
    }]
  };
});

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("MCP Server error:", error);
  process.exit(1);
});`,

  "src/cli/commands/consult.ts": `export async function consultCommand(prompt: string | undefined, options: any) {
  console.log('Consult command - Not implemented yet');
  console.log('Prompt:', prompt);
  console.log('Options:', options);
}`,

  "src/config/manager.ts": `// Configuration manager - TODO`,

  "src/plugins/types.ts": `export interface Plugin {
  name: string;
  version: string;
  description: string;
}

export interface AIProviderPlugin extends Plugin {
  listModels(): Promise<string[]>;
  execute(model: string, prompt: string, options: any): Promise<any>;
}`,
};

async function createProjectStructure() {
  console.log(blue("🚀 Setting up AI Advisor project..."));

  // Create directories
  for (const dir of directories) {
    const path = join(PROJECT_ROOT, dir);
    await mkdir(path, { recursive: true });
    console.log(green(`✓ Created ${dir}/`));
  }

  // Create files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(PROJECT_ROOT, filePath);
    await writeFile(fullPath, content);
    console.log(green(`✓ Created ${filePath}`));
  }

  // Make scripts executable
  execSync(`chmod +x ${join(PROJECT_ROOT, "src/index.ts")}`, {
    stdio: "inherit",
  });
  execSync(`chmod +x ${join(PROJECT_ROOT, "src/mcp-server.ts")}`, {
    stdio: "inherit",
  });

  console.log(blue("\n📦 Installing dependencies..."));
  execSync("bun install", { stdio: "inherit" });

  console.log(green("\n✅ Project setup complete!"));
  console.log(yellow("\nNext steps:"));
  console.log("1. Copy .env.example to .env and add your API keys");
  console.log('2. Run "make dev" to start development');
  console.log('3. Run "make test" to run tests');
}

// Run setup
createProjectStructure().catch(console.error);
