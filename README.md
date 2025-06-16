# AIA 🤖

**The Model Context Protocol (MCP) enabled CLI for parallel AI consultation.**

Built from the ground up for seamless integration with Claude Code, Claude Desktop, and other AI tools that support MCP. AIA transforms how AI agents and developers consult multiple AI models by providing parallel queries, intelligent retry mechanisms, and a powerful plugin architecture.

## 🚀 Why AIA?

### Native MCP Integration
AIA is a first-class MCP tool, meaning AI agents can:
- Query multiple AI models simultaneously with a single command
- Attach files and directories without reading them first (saves context)
- Get JSON-structured responses optimized for agent consumption
- Benefit from automatic retry and failover mechanisms

### Parallel AI Consultation
Query multiple AI models at once:
- Compare responses from GPT-4, Claude, and other models side-by-side
- Get diverse perspectives on complex technical challenges
- Save time with concurrent model queries
- Optional best-of selection for critical decisions

### Plugin Architecture
Extend AIA with provider plugins:
- **OpenAI Plugin**: GPT-4, GPT-3.5-turbo, O3, and more
- **Anthropic Plugin**: Claude-3-Opus, Claude-3-Sonnet models
- **OpenRouter Plugin**: Access to 50+ models through one API
- **Custom Plugins**: Build your own for specific AI services

## 🔌 Model Context Protocol (MCP) Setup

### Quick Start with Claude Code
```bash
# Install AIA globally
npm install -g aia

# Add to Claude Code
claude mcp add-json aia '{
  "type":"stdio",
  "command":"aia-mcp",
  "env":{"NODE_NO_WARNINGS":"1"}
}'
```

### Available MCP Tools
Once configured, AI agents gain access to:
- `consult` - Query one or more AI models with optional file attachments
  - Supports parallel model consultation
  - File and directory attachment for context
  - Optional best-of selection mode
  - JSON-structured responses for agent consumption

## ✨ Key Features

### 🤖 AI-Optimized Output
```json
{
  "responses": [
    {
      "model": "gpt-4-turbo",
      "content": "...",
      "metadata": { "tokensUsed": 1234 }
    },
    {
      "model": "claude-3-opus",
      "content": "...",
      "metadata": { "tokensUsed": 2345 }
    }
  ],
  "failed": [],
  "durationMs": 3456,
  "bestIndex": 0  // Only if bestOf=true
}
```

### 🎯 Intelligent File Resolution
Advanced file handling for AI agents:
- Automatic working directory detection
- Relative and absolute path support
- Size-aware file reading (40KB default limit)
- Directory traversal with filtering
- Clear truncation warnings

### 🛡️ Enterprise-Ready Reliability
- Automatic retry with exponential backoff (2 attempts)
- Intelligent failover to next available model
- Configurable timeouts (60s first attempt, 90s retry)
- Comprehensive error tracking and logging

### 🔐 Secure Configuration
Interactive setup with encrypted credential storage:
```bash
aia consult "test"  # Launches setup wizard on first run
```

The streamlined setup will:
1. Present a simple service selection menu
2. Accept model string directly (e.g., "o3", "claude-3-opus-20240229")
3. Securely input API keys
4. Encrypt and save configuration (AES-256-GCM)

## 📦 Installation

```bash
# Install globally via npm
npm install -g aia

# First run launches setup automatically
aia consult "Hello AI!"
```

### Prerequisites
- Node.js 18.0.0 or higher
- API keys for desired AI providers
- Optional: MCP-compatible AI tools

## 🚀 Quick Start

### CLI Usage

```bash
# View help and examples
aia --help

# Single model consultation (uses default)
aia consult "Refactor this code for better performance" -f src/index.ts

# Multi-model consultation
aia consult "Design a caching strategy" -m gpt-4-turbo claude-3-opus

# With best-of selection
aia consult "Complex architecture question" -m gpt-4 claude-3 --best-of

# Attach multiple files
aia consult "Review this implementation" -f src/api.ts src/types.ts

# Attach entire directories
aia consult "Analyze project structure" -d src/ tests/

# Short alias
aia c "Quick question"
```

### Service Management

```bash
# Manage services interactively
aia services

# Reset configuration
aia reset
aia reset --force  # Skip confirmation
```

### MCP Usage

```typescript
// In Claude or other MCP-enabled tools
await mcp.call('consult', {
  prompt: "Optimize this database query",
  files: ["queries/slow_query.sql"],
  models: ["gpt-4", "claude-3-opus"],
  bestOf: false
});
```

## 🧩 Plugin System

AIA features a powerful plugin architecture for AI provider integration.

### Built-in Plugins

- **OpenAI**: Access to GPT-4, GPT-4 Turbo, GPT-3.5-turbo, O3
- **Anthropic**: Claude-3-Opus, Claude-3-Sonnet, Claude-3-Haiku
- **OpenRouter**: Gateway to 50+ models with automatic routing

### Plugin Development

Creating an AIA plugin:

```typescript
import { AIProviderPlugin } from 'aia/types';

const myPlugin: AIProviderPlugin = {
  name: 'my-provider',
  version: '1.0.0',
  
  async listModels() {
    return ['model-1', 'model-2'];
  },
  
  async execute(model, prompt, options) {
    // Your API integration here
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

## 🎯 Perfect for AI Agent Workflows

### Why AI Agents Love AIA

1. **MCP Native**: First-class support for Model Context Protocol
2. **Context Efficient**: Attach files without reading them first
3. **Parallel Power**: Query multiple models in one go
4. **JSON Responses**: Structured output perfect for parsing
5. **Reliability**: Automatic retry and failover built-in
6. **Extensible**: Easy to add new AI providers

### Common Use Cases

```bash
# Code Review with Multiple Perspectives
aia consult "Review this PR for security issues" -d src/ -m gpt-4 claude-3-opus

# Architecture Decisions
aia consult "Compare microservices vs monolith for this use case" \
  -f requirements.md architecture.md -m gpt-4 claude-3 --best-of

# Debugging Complex Issues
aia consult "Why is this function returning undefined?" \
  -f buggy-function.js tests/function.test.js -m gpt-4-turbo claude-3

# Performance Optimization
aia consult "Optimize this SQL query" -f slow-query.sql \
  -m gpt-4 claude-3 openrouter/mixtral
```

## ⚙️ Configuration

Configuration is stored encrypted in `~/.aia/config.enc`:

```json
{
  "defaultModel": "gpt-4-turbo",
  "providers": {
    "openai": {
      "enabled": true,
      "models": ["gpt-4-turbo", "gpt-3.5-turbo", "o3"]
    },
    "anthropic": {
      "enabled": true,
      "models": ["claude-3-opus", "claude-3-sonnet"]
    }
  },
  "retry": {
    "maxAttempts": 2,
    "timeout": 60000
  }
}
```

Environment variables (optional):
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `OPENROUTER_API_KEY` - OpenRouter API key
- `AIA_CONFIG_DIR` - Custom config directory

## 🛡️ Security Features

- **Encrypted Storage**: AES-256-GCM encryption for credentials
- **Local Key Management**: Keys never leave your machine
- **Path Validation**: Protection against directory traversal
- **Input Sanitization**: Safe handling of user inputs
- **Rate Limiting**: Respects provider limits automatically

## 📊 Performance

Optimized for speed and efficiency:
- **Parallel Execution**: Concurrent model queries with Promise.allSettled
- **Connection Pooling**: Reused HTTP clients per provider
- **Lazy Loading**: Plugins loaded only when needed
- **Smart Timeouts**: 60s first attempt, 90s retry with backoff
- **Minimal Overhead**: <100ms orchestration overhead

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/light-merlin-dark/aia.git
cd aia

# Install dependencies
make install

# Run in development mode
make dev

# Run tests
make test

# Build for production
make build
```

### Development Workflow

```bash
# Common tasks
make lint        # Lint code
make test        # Run test suite
make build       # Build TypeScript
make clean       # Clean artifacts

# Release workflow
make push        # Prepare release
make release     # Publish to npm
```

## 📁 Project Structure

```
aia/
├── src/               # Core application code
├── plugins/           # Provider plugin implementations
├── scripts/           # Development automation
├── tests/             # Test suites
└── docs/              # Documentation
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ by [@EnchantedRobot](https://twitter.com/EnchantedRobot)