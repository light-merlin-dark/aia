import { CommandSpec } from '../types';
import consultCommand from './consult';

export const commands: Record<string, CommandSpec> = {
  consult: consultCommand,
  // Alias for consult
  c: consultCommand,
};

export { consultCommand };