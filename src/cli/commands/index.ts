import { CommandSpec } from '../types';
import consultCommand from './consult';
import resetCommand from './reset';
import servicesCommand from './services';

export const commands: Record<string, CommandSpec> = {
  consult: consultCommand,
  // Alias for consult
  c: consultCommand,
  reset: resetCommand,
  services: servicesCommand,
};

export { consultCommand, resetCommand, servicesCommand };