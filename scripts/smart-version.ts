#!/usr/bin/env bun

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface PackageJson {
  name: string;
  version: string;
}

function getLocalVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
  ) as PackageJson;
  return packageJson.version;
}

function getNpmVersion(packageName: string): string | null {
  try {
    const output = execSync(`npm view ${packageName} version`, {
      encoding: 'utf-8',
    }).trim();
    return output;
  } catch {
    // Package not published yet
    return null;
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  
  return 0;
}

function bumpVersion(currentVersion: string, type: 'major' | 'minor' | 'patch' = 'patch'): string {
  const parts = currentVersion.split('.').map(Number);
  
  switch (type) {
    case 'major':
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case 'minor':
      parts[1]++;
      parts[2] = 0;
      break;
    case 'patch':
    default:
      parts[2]++;
      break;
  }
  
  return parts.join('.');
}

function updatePackageVersion(newVersion: string): void {
  const packagePath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
  packageJson.version = newVersion;
  writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
}

async function main() {
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
  ) as PackageJson;
  
  const localVersion = getLocalVersion();
  const npmVersion = getNpmVersion(packageJson.name);
  
  console.log(`📦 Package: ${packageJson.name}`);
  console.log(`📍 Local version: ${localVersion}`);
  console.log(`🌐 NPM version: ${npmVersion || 'Not published'}`);
  
  if (!npmVersion) {
    console.log('✅ Package not yet published. Ready for initial release!');
    return;
  }
  
  const comparison = compareVersions(localVersion, npmVersion);
  
  if (comparison > 0) {
    console.log('✅ Local version is ahead of npm. No bump needed.');
    return;
  } else if (comparison === 0) {
    const newVersion = bumpVersion(npmVersion);
    console.log(`⬆️  Bumping version from ${npmVersion} to ${newVersion}`);
    updatePackageVersion(newVersion);
    console.log('✅ Version bumped successfully!');
  } else {
    // Local version is behind npm (shouldn't happen)
    console.error('❌ Local version is behind npm version!');
    console.error('   This might indicate a sync issue.');
    const newVersion = bumpVersion(npmVersion);
    console.log(`🔧 Auto-fixing: Setting version to ${newVersion}`);
    updatePackageVersion(newVersion);
    console.log('✅ Version fixed!');
  }
}

// Run the script
main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});