---
title: MCP (Model Context Protocol) Best Practices
inclusion: always
---

# MCP (Model Context Protocol) Best Practices

## Server Configuration
- Use workspace-level config (`.kiro/settings/mcp.json`) for project-specific servers
- Use user-level config (`~/.kiro/settings/mcp.json`) for global/cross-workspace servers
- Workspace config takes precedence over user config for server name conflicts
- Always specify exact versions or use `@latest` for stability

## Installation and Setup
- Use `uvx` command for Python-based MCP servers (requires `uv` package manager)
- Install `uv` via pip, homebrew, or follow: https://docs.astral.sh/uv/getting-started/installation/
- No separate installation needed for uvx servers - they download automatically
- Test servers immediately after configuration, don't wait for issues

## Security and Auto-Approval
- Use `autoApprove` sparingly and only for trusted, low-risk tools
- Review tool capabilities before adding to auto-approve list
- Regularly audit auto-approved tools for security implications
- Consider environment-specific auto-approve settings

## Error Handling and Debugging
- Set `FASTMCP_LOG_LEVEL: "ERROR"` to reduce noise in logs
- Use `disabled: false` to temporarily disable problematic servers
- Servers reconnect automatically on config changes
- Use MCP Server view in Kiro feature panel for manual reconnection

## Common MCP Server Examples
```json
{
  "mcpServers": {
    "aws-docs": {
      "command": "uvx",
      "args": ["awslabs.aws-documentation-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "disabled": false,
      "autoApprove": []
    },
    "filesystem": {
      "command": "uvx",
      "args": ["mcp-server-filesystem@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "disabled": false,
      "autoApprove": ["read_file", "list_directory"]
    }
  }
}
```

## Testing MCP Tools
- Test MCP tools immediately after configuration
- Don't inspect configurations unless facing specific issues
- Use sample calls to verify tool behavior
- Test with various parameter combinations
- Document working examples for team reference

## Performance Optimization
- Disable unused servers to improve startup time
- Use specific tool names in auto-approve rather than wildcards
- Monitor server resource usage and adjust as needed
- Consider server-specific environment variables for optimization

## Development Workflow
- Add MCP servers incrementally, test each addition
- Use version pinning for production environments
- Document server purposes and usage in team documentation
- Create project-specific server collections for different use cases

## Troubleshooting
- Check server logs in Kiro's MCP Server view
- Verify `uv` and `uvx` installation if Python servers fail
- Test server connectivity outside of Kiro if needed
- Use command palette "MCP" commands for server management
- Restart servers via MCP Server view rather than restarting Kiro

## Best Practices for Tool Usage
- Understand tool capabilities before first use
- Use descriptive prompts when calling MCP tools
- Handle tool errors gracefully in workflows
- Combine multiple MCP tools for complex tasks
- Cache results when appropriate to avoid repeated calls

## Development Integration
- Use Context7 MCP server to verify dependency compatibility before adding libraries
- Leverage AWS-Knowledge MCP server for current AWS documentation and best practices
- Use aws-api-mcp-server for AWS API interactions and validation
- Reference official sources through MCP servers when available in documentation