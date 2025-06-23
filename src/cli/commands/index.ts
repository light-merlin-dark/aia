import { CommandSpec } from '../types';
import consultCommand from './consult';
import resetCommand from './reset';
import servicesCommand from './services';
import servicesCostCommand from './services-cost';
import installCommand from './install';
import { configSetCommand } from './config-set';
import { configGetCommand } from './config-get';
import { configListCommand } from './config-list';
import { configAddModelCommand } from './config-add-model';
import { configSetDefaultCommand } from './config-set-default';
import { configRemoveCommand } from './config-remove';
import configClearDefaultCommand from './config-clear-default';
import { command as configSetDefaultServiceCommand } from './config-set-default-service';

export const commands: Record<string, CommandSpec> = {
  consult: consultCommand,
  // Alias for consult
  c: consultCommand,
  reset: resetCommand,
  install: installCommand,
  // Use the enhanced services command that handles cost subcommands
  services: servicesCostCommand,
  // Config commands
  'config-set': configSetCommand,
  'config-get': configGetCommand,
  'config-list': configListCommand,
  'config-add-model': configAddModelCommand,
  'config-set-default': configSetDefaultCommand,
  'config-set-default-service': configSetDefaultServiceCommand,
  'config-clear-default': configClearDefaultCommand,
  'config-remove': configRemoveCommand,
};

export { consultCommand, resetCommand, servicesCommand };