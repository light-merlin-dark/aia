import { CommandSpec } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const installCommand: CommandSpec = {
  name: 'install',
  description: 'Install AIA as an MCP server in Claude Code',
  help: `
Installs AIA as an MCP (Model Context Protocol) server in Claude Code.

This command will:
1. Remove any existing AIA MCP configuration
2. Add AIA as an MCP server with the correct settings

Example:
  $ aia install
`,
  execute: async () => {
    try {
      console.log('Installing AIA as MCP server in Claude Code...\n');
      
      // Execute the claude mcp command
      const command = `claude mcp remove aia 2>/dev/null || true && claude mcp add-json aia '{"type":"stdio","command":"aia-mcp","env":{"NODE_NO_WARNINGS":"1"}}'`;
      
      await execAsync(command);
      
      console.log('✅ AIA successfully installed as MCP server!');
      console.log('\nKey MCP tools now available in Claude Code:');
      console.log('  • consult - Query multiple AI models in parallel with file context');
      console.log('  • doctor - Complete system diagnostics and health checks');  
      console.log('  • config-list - View all configuration (API keys masked)');
      console.log('  • config-set - Configure services, models, and pricing');
      console.log('\nStart with: consult {"prompt": "Hello!", "models": ["your-model"]}');
      console.log('Full documentation: https://github.com/light-merlin-dark/ai-advisor#model-context-protocol-mcp-setup');
      
      return {
        success: true,
        message: 'AIA installed as MCP server'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if claude command is available
      if (errorMessage.includes('command not found') || errorMessage.includes('not found')) {
        console.error('❌ Error: Claude Code CLI not found');
        console.error('\nPlease ensure Claude Code is installed and the "claude" command is available.');
        console.error('Visit: https://docs.anthropic.com/en/docs/claude-code');
      } else {
        console.error('❌ Error installing AIA as MCP server:', errorMessage);
      }
      
      return {
        success: false,
        message: `Failed to install: ${errorMessage}`
      };
    }
  }
};

export default installCommand;