# Changelog

All notable changes to AIA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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