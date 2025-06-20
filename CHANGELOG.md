# Changelog

All notable changes to AIA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.2] - 2025-06-20

### Fixed
- **Doctor Command Path Resolution**
  - Fixed error when running `doctor` command from different directories
  - Now correctly finds package.json relative to MCP server installation
  - Changed "Working Directory" to "User Directory" for clarity
  - Gracefully handles missing package.json files

## [0.8.1] - 2025-06-20

### Added
- **Enhanced Model/Service Resolution**
  - Clear, actionable error messages when models or services not found
  - Intelligent detection when service name is used instead of model
  - Lists available models and provides configuration guidance
  - Better handling of default service model selection

### Changed
- **Improved Default Service Logic**
  - When no models specified, uses first model from default service
  - Better error messages for misconfigured default service
  - Early validation to catch service names being used as models

### Fixed
- **Plugin Registry**
  - Fixed warning about trying to enable "default" as a plugin
  - Registry now correctly skips "default" service during initialization
- **Anthropic Plugin**
  - Updated to read models from live configuration
  - Added support for Claude 4 model shorthand mappings

## [0.8.0] - 2025-06-20

### Added
- **Comprehensive MCP Configuration Management Suite**
  - Complete set of configuration tools accessible via MCP:
    - `config-set-pricing`: Set input/output costs per model ($/million tokens)
    - `config-get-pricing`: View pricing information for services/models
    - `config-remove-pricing`: Remove pricing configuration
  - All pricing tools support validation and error handling
  
- **Advanced Log Viewing System**
  - `config-view-logs`: Powerful log viewer with filtering capabilities
    - Filter by log level (ERROR, WARN, INFO, DEBUG)
    - Search for specific text within logs
    - View logs from specific dates (YYYY-MM-DD format)
    - Control number of lines returned (1-1000, default 50)
    - Efficient reading without loading entire files into memory
  
- **Comprehensive System Diagnostics**
  - `doctor`: All-in-one diagnostic tool providing:
    - System information (version, platform, Node.js version)
    - Configuration overview with masked API keys
    - Plugin status and available model counts
    - Recent log summary with error/warning counts
    - Health checks and actionable recommendations
    - Helpful MCP command reference
  - Intelligent recommendations for missing API keys, pricing, and default models
  
- **Enhanced Testing Strategy**
  - All new MCP tools have comprehensive E2E test coverage
  - Tests use MCP interface directly (not CLI) for real-world validation
  - Edge case testing for error conditions and validation
  - 13/13 MCP server tests passing with new tools included

### Changed
- **Testing Focus on MCP Interface**
  - All tests now go through MCP protocol for authentic validation
  - Improved test sustainability for real deployment scenarios
  - Better coverage of tool failures and error handling
  
- **Enhanced Cost Tracking Integration**
  - Pricing configuration now fully integrated with MCP tools
  - Seamless cost tracking setup via MCP interface
  - Better pricing validation and error messages

### Performance
- Overall test coverage: 133/142 tests passing (93.7%)
- MCP server test suite: 13/13 tests passing
- All new diagnostic and log tools optimized for performance

### Documentation
- Updated README with comprehensive MCP tool documentation
- Organized tools into logical categories (Core AI, Configuration, Diagnostics)
- Added usage examples for new diagnostic capabilities

## [0.4.0] - 2025-06-19

### Added
- **Configuration Backup and Restore**
  - New MCP tools for configuration management:
    - `config-backup`: Create encrypted backups of current configuration
    - `config-restore`: Restore configuration from backups
    - `config-list-backups`: List all available backups
    - `config-clear`: Completely clear configuration with confirmation
  - Support for named backups (defaults to 'default' if no name provided)
  - All backups are encrypted using the same security as main config
  
- **Default Service Configuration**
  - Removed hardcoded default models (no more gpt-3.5-turbo assumptions)
  - System now uses models from configured default service
  - When no models specified, uses the default service's models
  - More transparent and user-controlled model selection
  
- **New Configuration Commands**
  - `config-clear-default`: Clear global default model configuration
  - Better configuration flexibility and control

### Changed
- **Configuration Model Selection**
  - No longer assumes any default models
  - Uses default service configuration instead of hardcoded defaults
  - Wizard sets default service instead of default model
  - MCP server and CLI consult commands updated to use default service models

### Fixed
- Configuration fallback behavior now properly respects default service
- Test isolation improved with environment variable merge control
- Mock AI providers added to E2E tests for better test reliability

## [0.3.0] - 2025-06-19

### Changed
- **Test Framework Migration: Vitest → Bun**
  - Complete migration of all test files from Vitest to Bun test framework
  - Massive performance improvements:
    - MCP E2E tests: 16s → 1.4s (91% faster)
    - Unit tests: ~4s → <100ms per file
  - Updated test syntax from `vi.mock()` to `mock.module()`
  - Replaced `vi.spyOn()` with `jest.spyOn()` (from bun:test)
  - Optimized tests with parallel async operations using Promise.all()
  - Removed Vitest dependencies (@vitest/coverage-v8, vitest)
  - Updated Makefile commands:
    - `make test-unit`: `bun test tests/unit`
    - `make test-e2e`: `bun test tests/e2e`
    - `make test-watch`: `bun test --watch`

### Added
- Async test parallelization for improved performance
- New .bun.test.ts extension support for pure Bun tests
- Enhanced test isolation and mock management

### Removed
- Vitest test framework and all related dependencies
- vitest.config.ts configuration file

## [0.2.1] - 2025-06-17

### Added
- **Test Performance Improvements**
  - Parallel test execution with thread pool (3x speedup: 10.5s → 3.5s)
  - Fail-fast mode with `BAIL=1` environment variable
  - New test categorization commands in Makefile:
    - `make test-unit` - Run unit tests only
    - `make test-e2e` - Run e2e tests only  
    - `make test-critical` - Run with fail-fast
    - `make test-watch` - Run in watch mode
  - Test optimization plan document at `docs/plan.md`

### Changed
- Vitest configuration to enable parallel test execution with up to 4 threads
- Test commands in Makefile to use proper vitest runner

### Fixed
- MCP server test undefined `serverError` variable
- Config path inconsistencies from `.ai-advisor` to `.aia`
- CLI router test assertions for AIA rebranding

## [0.2.0] - 2025-06-16

### Added
- **Cost Tracking Feature**
  - Real-time cost calculation for all API calls
  - Integration with @light-merlin-dark/tok for accurate token estimation
  - Per-model cost breakdown in response output
  - Total cost aggregation for multi-model queries
  - Cost configuration during setup wizard
  - New CLI commands: `aia services cost set/list/remove`
  - Support for pricing in $/million tokens format
  - Cost display formatting (e.g., $0.0125, $0.0001)
  - Pricing hints when not configured

### Changed
- Extended config schema to include model pricing information
- Enhanced wizard to optionally collect pricing during setup
- Improved response output to display token usage and costs
- Updated test runner from `bun test` to `vitest` in Makefile

### Fixed
- Fixed floating-point precision issues in cost calculations
- Improved test reliability with proper mocking

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