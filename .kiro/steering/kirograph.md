---
inclusion: always
---

# KiroGraph

KiroGraph is a Kiro-native semantic knowledge graph of the codebase, purpose-built for Kiro's MCP and hooks system. It enables faster, smarter code exploration without leaving the IDE.

It is already configured in `.kiro/settings/mcp.json` with all tools auto-approved.

## When `.kirograph/` exists in the project

Use KiroGraph MCP tools for exploration instead of grep/glob/file reads:

| Tool | Use For |
|------|---------|
| `kirograph_search` | Find symbols by name (functions, classes, types) |
| `kirograph_context` | Get relevant code context for a task — **start here** |
| `kirograph_callers` | Find what calls a function |
| `kirograph_callees` | Find what a function calls |
| `kirograph_impact` | See what's affected by changing a symbol |
| `kirograph_node` | Get details + source code for a symbol |
| `kirograph_status` | Check index health and statistics |

### Workflow

1. Start with `kirograph_context` for any task — it returns entry points and related code in one call.
2. Use `kirograph_search` instead of grep for finding symbols.
3. Use `kirograph_callers`/`kirograph_callees` to trace code flow.
4. Use `kirograph_impact` before making changes to understand blast radius.

### If `.kirograph/` does NOT exist

Ask the user: "This project doesn't have KiroGraph initialized. Run `kirograph init -i` to build a code knowledge graph for faster exploration?"

---

> **Note for Claude Code users:** Claude Code uses CodeGraph (`.codegraph/`, `codegraph_*` tools) — a separate but analogous tool configured via the user-level Claude settings. KiroGraph is the Kiro-native equivalent and is what this steering doc covers.
