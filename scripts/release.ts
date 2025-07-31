#!/usr/bin/env bun
import { SmartRelease } from '@merlin/cli';

const release = new SmartRelease({
  packageName: '@light-merlin-dark/aia',
  registryUrl: 'https://npm.hyper.gdn/',
  autoCommit: true,
  autoPush: true,
  tagRelease: false
});

release.run().catch(error => {
  console.error('Release failed:', error);
  process.exit(1);
});