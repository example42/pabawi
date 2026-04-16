---
title: MCP (Model Context Protocol) Best Practices
inclusion: always
---

## Server Configuration

- Use workspace-level config (`.kiro/settings/mcp.json`) for project-specific servers
- Use user-level config for global/cross-workspace servers
- Workspace config takes precedence over user config for server name conflicts
- Always specify exact versions or use `@latest` for stability

## Installation and Setup

- Use `uvx` command for Python-based MCP servers (requires `uv` package manager)
- No separate installation needed for uvx servers — they download automatically
- Test servers immediately after configuration, don't wait for issues

## Security and Auto-Approval

- Use `autoApprove` sparingly and only for trusted, low-risk tools
- Review tool capabilities before adding to auto-approve list
- Regularly audit auto-approved tools for security implications

## Error Handling and Debugging

- Set `FASTMCP_LOG_LEVEL: "ERROR"` to reduce noise in logs
- Use `disabled: true` to temporarily disable problematic servers

## Performance Optimization

- Disable unused servers to improve startup time
- Use specific tool names in `autoApprove` rather than wildcards

## Tool Usage

- Understand tool capabilities before first use
- Use descriptive prompts when calling MCP tools
- Handle tool errors gracefully in workflows
- Combine multiple MCP tools for complex tasks
