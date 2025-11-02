```
 █████╗ ██╗ █████╗
██╔══██╗██║██╔══██╗
███████║██║███████║
██╔══██║██║██╔══██║
██║  ██║██║██║  ██║
╚═╝  ╚═╝╚═╝╚═╝  ╚═╝

Parallel AI model consultation with intelligent failover
CLI & MCP Server • Query multiple models simultaneously • Automatic retry and cost tracking
```

## Why AIA?

- Query multiple AI models in parallel (GPT-4, Claude, 50+ models via OpenRouter)
- Automatic retry with intelligent failover (60s timeout, 90s retry with exponential backoff)
- Real-time cost tracking with configurable pricing (per-model token usage and cost breakdown)
- Encrypted credential storage (AES-256-GCM, local-only key management)
- Plugin architecture for easy provider integration

## Install

```bash
npm install -g @light-merlin-dark/aia
```

## Quick Start

```bash
# First run launches interactive setup
aia consult "Explain async/await in JavaScript"

# Query multiple models in parallel
aia consult "Review this code for performance issues" -m gpt-4-turbo claude-sonnet-4 -f src/api.ts

# Attach entire directories
aia consult "Analyze project structure" -d src/ tests/

# Best-of selection mode
aia consult "Complex architecture question" -m gpt-4 claude-3-opus --best-of
```

All consultations return structured JSON with usage stats and cost breakdowns.

## Core Commands

### Consultation

```bash
# Single model (uses configured default)
aia consult "Your question here"
aia c "Your question here"  # Short alias

# Multiple models in parallel
aia consult "Compare approaches" -m gpt-4-turbo claude-sonnet-4 openrouter/google/gemini-2-pro

# Attach files for context
aia consult "Review this implementation" -f src/api.ts src/types.ts

# Attach directories
aia consult "Analyze codebase" -d src/ -d tests/

# Best-of selection (evaluates responses and picks best)
aia consult "Critical decision" -m gpt-4 claude-3-opus --best-of
```

### Configuration

```bash
# View current config (secrets masked)
aia config list

# Set default model
aia config set-default anthropic/claude-sonnet-4

# Set default service (used when no model specified)
aia config set-default-service anthropic

# Configure pricing for cost tracking ($ per 1M tokens)
aia services cost set openai gpt-4-turbo --input 10 --output 30
aia services cost list

# Manage services interactively
aia services

# Backup and restore
aia config backup my-backup
aia config list-backups
aia config restore my-backup

# Reset configuration
aia reset
```

### Diagnostics

```bash
# System health check
aia doctor

# View logs with filtering
aia config view-logs --level ERROR --search timeout --lines 50
```

## Configuration

Configuration is stored encrypted in `~/.aia/config.enc`:

```json
{
  "services": {
    "openai": {
      "apiKey": "sk-...",
      "models": ["gpt-4-turbo", "o3-mini"],
      "pricing": {
        "gpt-4-turbo": {
          "inputCostPerMillion": 10,
          "outputCostPerMillion": 30
        }
      }
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "models": ["claude-sonnet-4-20250514"],
      "pricing": {
        "claude-sonnet-4-20250514": {
          "inputCostPerMillion": 3,
          "outputCostPerMillion": 15
        }
      }
    },
    "default": {
      "service": "anthropic"
    }
  }
}
```

Optional environment variables:
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `OPENROUTER_API_KEY` - OpenRouter API key
- `AIA_CONFIG_DIR` - Custom config directory

## Plugin System

Built-in providers:
- **OpenAI**: O3-mini, GPT-4, GPT-4 Turbo, GPT-3.5-turbo
- **Anthropic**: Claude Sonnet 4, Claude Opus 4, Claude 3 models
- **OpenRouter**: Gateway to 50+ models (Gemini, Mixtral, Llama, etc.)

Create custom plugins:

```typescript
import { AIProviderPlugin } from 'aia/types';

const myPlugin: AIProviderPlugin = {
  name: 'my-provider',
  version: '1.0.0',

  async listModels() {
    return ['model-1', 'model-2'];
  },

  async execute(model, prompt, options) {
    // Your API integration
    return {
      content: response,
      metadata: { tokensUsed: 100 }
    };
  },

  validateConfig(config) {
    return !!config.apiKey;
  },

  getRequiredEnvVars() {
    return ['MY_PROVIDER_API_KEY'];
  }
};

export default myPlugin;
```

## MCP Server

AIA includes an MCP server for integration with Claude Code, Claude Desktop, and other MCP-compatible tools.

### Setup

```bash
# Install as MCP server
aia install
```

### Available Tools

**Core Consultation:**
- `consult` - Query multiple models with file attachments and cost tracking
- `config-list` - View configuration (secrets masked)
- `config-get` - Get service-specific configuration
- `config-set` - Update configuration values
- `config-remove` - Remove services

**Model Management:**
- `config-add-model` - Add models to services
- `config-set-default` - Set default model
- `config-set-default-service` - Set default service
- `config-clear-default` - Clear default model
- `config-set-pricing` - Configure cost tracking
- `config-get-pricing` - View pricing information

**Diagnostics:**
- `doctor` - System health check with plugin status
- `config-view-logs` - View and filter server logs
- `config-backup` - Backup configuration
- `config-list-backups` - List available backups

See [MCP Usage Guide](docs/mcp-usage-guide.md) for detailed examples.

## Response Format

All consultation responses include structured data:

```json
{
  "responses": [
    {
      "model": "gpt-4-turbo",
      "provider": "openai",
      "content": "...",
      "usage": {
        "promptTokens": 150,
        "completionTokens": 350,
        "totalTokens": 500
      }
    }
  ],
  "failed": [],
  "durationMs": 3456,
  "bestIndex": 0,
  "costs": [
    {
      "model": "gpt-4-turbo",
      "promptCost": 0.0015,
      "completionCost": 0.0105,
      "totalCost": 0.012
    }
  ],
  "totalCost": 0.012
}
```

## Development

```bash
# Clone and install
git clone https://github.com/light-merlin-dark/ai-advisor.git
cd ai-advisor
make install

# Development
make dev          # Run CLI in development
make mcp-dev      # Run MCP server
make test         # Run test suite
make lint         # Lint code

# Release
make release      # Full release workflow (lint, test, build, publish)
```

### Project Structure

```
aia/
├── src/           # Core application code
├── plugins/       # Provider plugin implementations
├── scripts/       # Development automation
├── tests/         # Test suites
└── docs/          # Documentation
```

## Security

- AES-256-GCM encryption for credentials
- Local-only key management (keys never leave your machine)
- Path validation against directory traversal
- Input sanitization for safe handling
- Automatic rate limiting per provider

## Performance

- Parallel execution with Promise.allSettled
- Connection pooling (reused HTTP clients per provider)
- Lazy plugin loading (loaded only when needed)
- Smart timeouts (60s first attempt, 90s retry)
- Minimal orchestration overhead (<100ms)

## License

MIT

---

Built by [Robert E. Beckner III (Merlin)](https://rbeckner.com)
