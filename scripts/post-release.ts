#!/usr/bin/env bun

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ValidationResult {
  step: string;
  success: boolean;
  message: string;
}

// Color output helpers
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const blue = (text: string) => `\x1b[34m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function validateNpmPublishWithRetry(maxRetries: number = 3, delayMs: number = 20000): Promise<ValidationResult> {
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
  );
  
  const startTime = Date.now();
  console.log(`Starting NPM version validation with ${delayMs/1000}s initial delay...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Checking NPM registry (attempt ${attempt}/${maxRetries})...`);
      
      const npmVersion = execSync(
        `npm view ${packageJson.name} version --registry https://npm.hyper.gdn`,
        { encoding: 'utf-8' }
      ).trim();
      
      // Ensure NPM version matches our local version (meaning it's higher than what we started with)
      if (npmVersion === packageJson.version) {
        const elapsedTime = Math.round((Date.now() - startTime) / 1000);
        return {
          step: 'NPM Version Check',
          success: true,
          message: `NPM version: ${npmVersion}, Local version: ${packageJson.version} ✓ (took ${elapsedTime}s)`
        };
      }
      
      console.log(`   NPM: ${npmVersion}, Local: ${packageJson.version} - waiting for registry update...`);
      
      if (attempt < maxRetries) {
        console.log(`Waiting ${delayMs/1000}s before next attempt...`);
        await sleep(delayMs);
      }
      
    } catch (error: any) {
      console.log(`   Error checking NPM: ${error.message}`);
      if (attempt < maxRetries) {
        console.log(`Waiting ${delayMs/1000}s before retry...`);
        await sleep(delayMs);
      }
    }
  }
  
  const elapsedTime = Math.round((Date.now() - startTime) / 1000);
  return {
    step: 'NPM Version Check',
    success: false,
    message: `Failed to verify NPM version after ${maxRetries} attempts (${elapsedTime}s total). Registry may be slow to update.`
  };
}

async function validateGlobalInstall(): Promise<ValidationResult> {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
    );
    
    // Check if package is already installed globally
    let isInstalled = false;
    let currentVersion = '';
    try {
      currentVersion = execSync(`npm list -g ${packageJson.name} --depth=0 --json --registry https://npm.hyper.gdn`, { encoding: 'utf-8' });
      const listData = JSON.parse(currentVersion);
      isInstalled = !!listData.dependencies?.[packageJson.name];
    } catch {
      // Package not installed globally
      isInstalled = false;
    }
    
    if (isInstalled) {
      console.log('Uninstalling existing global installation...');
      execSync(`npm uninstall -g ${packageJson.name}`, { stdio: 'inherit' });
    }

    console.log('Installing fresh global installation from private npm...');
    execSync(`npm install -g ${packageJson.name}@latest --registry https://npm.hyper.gdn`, { stdio: 'inherit' });
    return {
      step: 'Fresh Global Installation',
      success: true,
      message: 'Package installed globally from private npm successfully'
    };
  } catch (error: any) {
    return {
      step: 'Global Installation/Update',
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

async function validateCLI(): Promise<ValidationResult> {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
    );
    
    const binName = Object.keys(packageJson.bin)[0];
    
    // Try running CLI with --help to see if it shows help (indicates CLI is working)
    try {
      const helpOutput = execSync(`${binName} --help 2>/dev/null`, { 
        encoding: 'utf-8',
        shell: true 
      }).trim();
      
      // Check for expected help content
      if (helpOutput.includes('consult') && helpOutput.includes('config') && 
          (helpOutput.includes('Usage') || helpOutput.includes('Commands') || helpOutput.includes('Options'))) {
        return {
          step: 'CLI Execution',
          success: true,
          message: 'CLI executes and shows help correctly'
        };
      } else {
        return {
          step: 'CLI Execution',
          success: false,
          message: `CLI runs but output is unexpected: ${helpOutput.substring(0, 100)}...`
        };
      }
    } catch (error: any) {
      return {
        step: 'CLI Execution',
        success: false,
        message: `CLI execution failed: ${error.message}`
      };
    }
  } catch (error: any) {
    return {
      step: 'CLI Execution',
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

async function validateConfigCommands(): Promise<ValidationResult> {
  try {
    console.log('Testing config commands...');

    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
    );
    const binName = Object.keys(packageJson.bin)[0];

    // Test config-list command (should work without API keys)
    try {
      const listOutput = execSync(`${binName} config-list 2>&1`, {
        encoding: 'utf-8',
        shell: true
      });

      // Should show some output (either services or "No services configured")
      if (listOutput.length > 0) {
        return {
          step: 'Config Commands Test',
          success: true,
          message: 'Config commands execute correctly'
        };
      } else {
        return {
          step: 'Config Commands Test',
          success: false,
          message: 'Config command produced no output'
        };
      }
    } catch (error: any) {
      // Command may exit with error if no config exists, but it should still execute
      if (error.stdout && error.stdout.length > 0) {
        return {
          step: 'Config Commands Test',
          success: true,
          message: 'Config commands execute correctly'
        };
      }
      throw error;
    }
  } catch (error: any) {
    return {
      step: 'Config Commands Test',
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

async function validatePackageStructure(): Promise<ValidationResult> {
  try {
    console.log('Validating package structure...');

    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
    );

    // Check if bin entry exists
    if (!packageJson.bin) {
      return {
        step: 'Package Structure',
        success: false,
        message: 'No bin entry in package.json'
      };
    }

    // Check if main/exports are properly configured
    if (!packageJson.main && !packageJson.exports) {
      return {
        step: 'Package Structure',
        success: false,
        message: 'No main or exports entry in package.json'
      };
    }

    // Check if dependencies are specified
    if (!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0) {
      return {
        step: 'Package Structure',
        success: false,
        message: 'No dependencies specified in package.json'
      };
    }

    return {
      step: 'Package Structure',
      success: true,
      message: 'Package structure is valid'
    };
  } catch (error: any) {
    return {
      step: 'Package Structure',
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

async function main() {
  console.log(blue('Running post-release validation...\n'));

  const validations = [
    await validateNpmPublishWithRetry(),
    await validateGlobalInstall(),
    await validateCLI(),
    await validateConfigCommands(),
    await validatePackageStructure(),
  ];

  console.log('\n' + blue('Validation Results:'));
  console.log('='.repeat(50));

  validations.forEach(result => {
    const icon = result.success ? green('[PASS]') : red('[FAIL]');
    const statusColor = result.success ? green : red;
    console.log(`${icon} ${statusColor(result.step)}`);
    console.log(`   ${result.message}`);
  });

  const allPassed = validations.every(v => v.success);
  const passedCount = validations.filter(v => v.success).length;
  const totalCount = validations.length;

  console.log('\n' + '='.repeat(50));
  console.log(`Summary: ${passedCount}/${totalCount} validations passed`);

  if (allPassed) {
    console.log('\n' + green('All validations passed!'));
    console.log(yellow('\nNext steps:'));
    console.log('1. Test the MCP integration with Claude Desktop');
    console.log('2. Update documentation if needed');
    console.log('3. Create a GitHub release');
  } else {
    console.log('\n' + red('Some validations failed!'));
    console.log(yellow('\nTroubleshooting:'));
    console.log('1. Check npm publish logs');
    console.log('2. Verify package.json bin paths');
    console.log('3. Ensure all dependencies are included');
    console.log('4. NPM registry updates can take up to 2 minutes');
    process.exit(1);
  }
}

// Run validation
main().catch((error) => {
  console.error(red('Validation error:'), error.message);
  process.exit(1);
});