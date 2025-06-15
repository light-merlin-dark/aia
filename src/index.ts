#!/usr/bin/env bun

import { router } from './cli/router';
import { RuntimeContext } from './cli/types';
import { createLogger } from './services/logger';

const logger = createLogger('CLI');

async function main() {
  try {
    // Create runtime context
    const ctx: RuntimeContext = {
      verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
      cwd: process.cwd(),
      env: process.env as Record<string, string>
    };

    // Get command line arguments (skip node/bun and script path)
    const args = process.argv.slice(2);

    // Import and register commands
    const { commands } = await import('./cli/commands');
    for (const command of Object.values(commands)) {
      router.registerCommand(command);
    }

    // Route the command
    const result = await router.route(args, ctx);

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    logger.error('Unexpected error:', error);
    console.error('An unexpected error occurred. Run with --verbose for more details.');
    process.exit(1);
  }
}

// Run the CLI
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});