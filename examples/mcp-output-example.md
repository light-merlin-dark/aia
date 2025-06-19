# Using the AIA MCP Tool with Output File

The `aia` MCP tool now supports writing responses directly to files using the `output` parameter.

## Example Usage

### Basic usage with output file:
```json
{
  "prompt": "Create a comprehensive implementation plan",
  "output": "docs/implementation-plan.md"
}
```

### With multiple models and output:
```json
{
  "prompt": "Design a REST API for user management",
  "models": ["gpt-4-turbo", "claude-3-opus"],
  "output": "api-design.json"
}
```

### With input files and output:
```json
{
  "prompt": "Refactor this code for better performance",
  "files": ["src/index.ts", "src/utils.ts"],
  "output": "refactored-code-analysis.json"
}
```

### Full example from your use case:
```json
{
  "prompt": "Create a comprehensive implementation plan for a contacts management system",
  "files": [
    "/Users/merlin/_dev/contacts/docs/private-mcp-cli-blueprint.md",
    "/Users/merlin/_dev/contacts/docs/responses.md",
    "/Users/merlin/_dev/contacts/docs/seed.md"
  ],
  "models": ["openai/gpt-4-turbo", "anthropic/claude-3-opus"],
  "output": "contacts-implementation-plan.json"
}
```

## Output Format

The tool will:
1. Write the JSON response to the specified file
2. Create any necessary directories
3. Handle both relative and absolute paths
4. Return both the file path confirmation and the response content

## Notes

- Relative paths are resolved from the current working directory
- The output is always in JSON format with proper indentation
- If the write fails, you'll still get the response with a warning message