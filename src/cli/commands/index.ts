import { CommandSpec } from '../types';
import consultCommand from './consult';
import resetCommand from './reset';
import servicesCommand from './services';
import servicesCostCommand from './services-cost';

export const commands: Record<string, CommandSpec> = {
  consult: consultCommand,
  // Alias for consult
  c: consultCommand,
  reset: resetCommand,
  // Use the enhanced services command that handles cost subcommands
  services: servicesCostCommand,
};

export { consultCommand, resetCommand, servicesCommand };