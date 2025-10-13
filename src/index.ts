#!/usr/bin/env bun
import { createCLI } from '@merlin/cli';


// Import all commands eagerly for a snappy CLI experience
import consultCmd from './commands/consult.js';
import configAddModelCmd from './commands/config-add-model.js';
import configClearDefaultCmd from './commands/config-clear-default.js';
import configGetCmd from './commands/config-get.js';
import configListCmd from './commands/config-list.js';
import configRemoveCmd from './commands/config-remove.js';
import configSetDefaultServiceCmd from './commands/config-set-default-service.js';
import configSetDefaultCmd from './commands/config-set-default.js';
import configSetCmd from './commands/config-set.js';
import installCmd from './commands/install.js';
import resetCmd from './commands/reset.js';
import servicesCmd from './commands/services.js';
import servicesCostCmd from './commands/services-cost.js';

const cli = createCLI({
  name: 'aia',
  version: '0.8.19',
  description: 'AI Advisor - Parallel AI model consultation CLI',
  commands: {
    consult: consultCmd,
    'config-add-model': configAddModelCmd,
    'config-clear-default': configClearDefaultCmd,
    'config-get': configGetCmd,
    'config-list': configListCmd,
    'config-remove': configRemoveCmd,
    'config-set-default-service': configSetDefaultServiceCmd,
    'config-set-default': configSetDefaultCmd,
    'config-set': configSetCmd,
    install: installCmd,
    reset: resetCmd,
    services: servicesCmd,
    'services-cost': servicesCostCmd
  }
});

// Add custom services initialization
cli.bootstrap = async (registry) => {
  // Check if this is just a help display (no command or help command)
  const args = process.argv.slice(2);
  const isHelp = args.length === 0 || args[0] === 'help';
  
  if (isHelp) {
    // Set quiet mode for help display
    process.env.AIA_QUIET = 'true';
  }
  
  try {
    // Initialize plugin registry
    const { getPluginRegistry } = await import('./plugins/registry.js');
    const pluginRegistry = getPluginRegistry();
    (registry as any).register('pluginRegistry', pluginRegistry);

    // Initialize config manager
    const { getConfig } = await import('./config/manager.js');
    const config = await getConfig();
    (registry as any).register('config', config);
    
    // Initialize the plugin registry with config
    await pluginRegistry.initialize(config);
  } finally {
    if (isHelp) {
      // Restore normal logging after initialization
      delete process.env.AIA_QUIET;
    }
  }
};


// Handle help display
if (process.argv.length <= 2 || process.argv[2] === 'help') {
  // Import help module dynamically to show custom help
  import('./help.js').then(({ showHelp }) => {
    showHelp(process.argv[3]);
  });
} else {
  // Run the CLI
  cli.run();
}