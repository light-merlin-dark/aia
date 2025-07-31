#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Convert a single test file from vitest to bun test
function convertTestFile(filePath: string): void {
  console.log(`Converting ${filePath}...`);
  
  let content = readFileSync(filePath, 'utf-8');
  
  // Replace vitest imports with bun:test
  content = content.replace(
    /import\s*{\s*([^}]+)\s*}\s*from\s*['"]vitest['"]/g,
    (match, imports) => {
      // Parse imports and filter out vi
      const importList = imports.split(',').map((i: string) => i.trim());
      const bunImports = importList.filter((i: string) => i !== 'vi');
      
      let result = `import { ${bunImports.join(', ')} } from 'bun:test'`;
      
      // If vi was used, add a separate mock import
      if (importList.includes('vi')) {
        result += `\nimport { mock, spyOn } from 'bun:test'`;
      }
      
      return result;
    }
  );
  
  // Replace vi.mock with mock
  content = content.replace(/vi\.mock/g, 'mock');
  
  // Replace vi.spyOn with spyOn
  content = content.replace(/vi\.spyOn/g, 'spyOn');
  
  // Replace vi.fn() with mock()
  content = content.replace(/vi\.fn\(\)/g, 'mock()');
  
  // Replace vi.mocked with direct usage
  content = content.replace(/vi\.mocked\(([^)]+)\)/g, '$1');
  
  // Replace vi.clearAllMocks() with mock.restore()
  content = content.replace(/vi\.clearAllMocks\(\)/g, 'mock.restore()');
  
  // Replace mockReset/mockClear with mock.restore
  content = content.replace(/\.mockReset\(\)/g, '.mock.restore()');
  content = content.replace(/\.mockClear\(\)/g, '.mock.restore()');
  
  // Replace .mockImplementation with direct assignment
  content = content.replace(/\.mockImplementation\(([^)]+)\)/g, ' = mock($1)');
  
  // Replace .mockResolvedValue
  content = content.replace(/\.mockResolvedValue\(([^)]+)\)/g, ' = mock(() => Promise.resolve($1))');
  
  // Replace .mockRejectedValue
  content = content.replace(/\.mockRejectedValue\(([^)]+)\)/g, ' = mock(() => Promise.reject($1))');
  
  // Replace .mockReturnValue
  content = content.replace(/\.mockReturnValue\(([^)]+)\)/g, ' = mock(() => $1)');
  
  // Save the converted file
  writeFileSync(filePath, content);
  console.log(`✓ Converted ${filePath}`);
}

// Get file path from command line
const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: bun run convert-to-bun-test.ts <test-file-path>');
  process.exit(1);
}

convertTestFile(filePath);