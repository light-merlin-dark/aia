#!/usr/bin/env bun

import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

// Create a minimal config file that will bypass the setup wizard
const configDir = join(process.env.HOME || '/tmp', '.aia');
mkdirSync(configDir, { recursive: true });

const config = {
  services: {
    openrouter: {
      apiKey: process.env.AIA_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '',
      models: ['google/gemini-2.5-pro', 'google/gemini-2.5-flash'],
      endpoint: 'https://openrouter.ai/api/v1'
    },
    default: {
      apiKey: '',
      service: 'openrouter'
    }
  },
  plugins: {
    enabled: ['openrouter'],
    disabled: []
  },
  maxRetries: 2,
  timeout: 60000
};

// Write the config file
writeFileSync(join(configDir, 'config.json'), JSON.stringify(config, null, 2));
console.log('Test config created at:', join(configDir, 'config.json'));