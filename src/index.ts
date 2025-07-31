#!/usr/bin/env bun
import { createCLI } from '@merlin/cli';

const cli = createCLI({
  name: 'aia',
  version: '0.8.19',
  description: 'AI Advisor - Parallel AI model consultation CLI',
  commands: {
    // Lazy load commands for better performance
    consult: () => import('./commands/consult.js').then(m => m.default),
    'config-add-model': () => import('./commands/config-add-model.js').then(m => m.default),
    'config-clear-default': () => import('./commands/config-clear-default.js').then(m => m.default),
    'config-get': () => import('./commands/config-get.js').then(m => m.default),
    'config-list': () => import('./commands/config-list.js').then(m => m.default),
    'config-remove': () => import('./commands/config-remove.js').then(m => m.default),
    'config-set-default-service': () => import('./commands/config-set-default-service.js').then(m => m.default),
    'config-set-default': () => import('./commands/config-set-default.js').then(m => m.default),
    'config-set': () => import('./commands/config-set.js').then(m => m.default),
    install: () => import('./commands/install.js').then(m => m.default),
    reset: () => import('./commands/reset.js').then(m => m.default),
    services: () => import('./commands/services.js').then(m => m.default),
    'services-cost': () => import('./commands/services-cost.js').then(m => m.default)
  }
});

// Add custom services initialization
cli.bootstrap = async (registry) => {
  // Initialize plugin registry
  const { getPluginRegistry } = await import('./plugins/registry.js');
  const pluginRegistry = getPluginRegistry();
  registry.register('pluginRegistry', pluginRegistry);
  
  // Initialize config manager
  const { getConfig } = await import('./config/manager.js');
  const config = await getConfig();
  registry.register('config', config);
  
  // Initialize the plugin registry with config
  await pluginRegistry.initialize(config);
};

// Run the CLI
cli.run();