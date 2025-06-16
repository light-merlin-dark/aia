# Changelog

All notable changes to AIA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-06-15

### Added
- Initial release of AIA (AI Assistant)
- **Core Features**
  - Parallel AI consultation across multiple models
  - Plugin architecture with dynamic loading
  - Encrypted configuration management (AES-256-GCM)
  - File attachment support with intelligent prompt building
  - Retry and failover mechanisms
  - MCP (Model Context Protocol) server implementation

- **Commands**
  - `aia consult` - Query AI models with optional file attachments
  - `aia services` - Interactive service configuration management  
  - `aia reset` - Clear configuration with optional --force flag

- **Provider Plugins**
  - OpenAI (GPT-4, GPT-3.5, O3)
  - Anthropic (Claude 3 family)
  - OpenRouter (Multiple models)

- **Developer Features**
  - TypeScript with strict typing
  - Comprehensive test suite (135+ tests)
  - Streamlined configuration wizard
  - Secure credential storage in ~/.aia/

### Security
- API keys encrypted at rest using AES-256-GCM
- Separate encryption key file with restricted permissions
- Environment variable support for CI/CD

### Notes
- Rebranded from "AI Advisor" to "AIA" for better CLI ergonomics
- Configuration files use `.enc` extension to clearly indicate encryption
- Simplified wizard flow with direct model string input