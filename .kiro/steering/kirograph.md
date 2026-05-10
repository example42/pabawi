---
inclusion: always
---

# KiroGraph

KiroGraph builds a semantic knowledge graph of your codebase. Use its MCP tools instead of grep/glob/file reads whenever `.kirograph/` exists in the project.

## Quick decision guide

| Question | Tool |
|----------|------|
| Where do I start on this task? | `kirograph_context` |
| What is this symbol / show me its code | `kirograph_node` with `includeCode: true` |
| Find a symbol by name | `kirograph_search` |
| Who calls function X? | `kirograph_callers` |
| What does function X call? | `kirograph_callees` |
| What breaks if I change X? | `kirograph_impact` |
| How are X and Y connected? | `kirograph_path` |
| What extends / implements this type? | `kirograph_type_hierarchy` |
| Which code is never called? | `kirograph_dead_code` |
| Are there import cycles? | `kirograph_circular_deps` |
| What files are indexed? | `kirograph_files` |
| Is the index healthy? | `kirograph_status` |
| What are the most critical symbols? | `kirograph_hotspots` |
| Any unexpected cross-module coupling? | `kirograph_surprising` |
| What changed since the last snapshot? | `kirograph_diff` |
| What packages/layers exist? | `kirograph_architecture` |
| How coupled is package X? | `kirograph_coupling` |
| What does package X depend on? | `kirograph_package` |

---

## Tool reference

### `kirograph_context` — **start here for any code task**

Returns entry points, related symbols, and code snippets for a natural-language task description. Usually enough to orient without any additional tool calls.

```
kirograph_context(task: "fix the auth token expiry bug")
kirograph_context(task: "add dark mode", maxNodes: 30)
kirograph_context(task: "refactor payment service", includeCode: false)
```

### `kirograph_search` — find symbols by name

Exact match → FTS → LIKE fallback → vector (last resort). Use instead of grep.

```
kirograph_search(query: "signIn")
kirograph_search(query: "UserService", kind: "class")
kirograph_search(query: "auth", limit: 20)
```

Supported kinds: `function`, `method`, `class`, `interface`, `type_alias`, `variable`, `route`, `component`

### `kirograph_node` — inspect a symbol

Returns kind, file, signature, docstring. Add `includeCode: true` to get the full source.

```
kirograph_node(symbol: "validateToken")
kirograph_node(symbol: "AuthService", includeCode: true)
```

### `kirograph_callers` — who calls this?

BFS over incoming `calls` edges (depth 1).

```
kirograph_callers(symbol: "processPayment", limit: 30)
```

### `kirograph_callees` — what does this call?

BFS over outgoing `calls` edges (depth 1).

```
kirograph_callees(symbol: "handleRequest")
```

### `kirograph_impact` — blast radius before a change

Traverses all incoming edges up to `depth` hops. Call this before editing a symbol.

```
kirograph_impact(symbol: "UserRepository", depth: 3)
```

### `kirograph_path` — how are two symbols connected?

BFS shortest path across all edge types.

```
kirograph_path(from: "LoginController", to: "DatabasePool")
```

### `kirograph_type_hierarchy` — class/interface inheritance

```
kirograph_type_hierarchy(symbol: "BaseRepository", direction: "down")  // derived types
kirograph_type_hierarchy(symbol: "PaymentService", direction: "up")    // base types
kirograph_type_hierarchy(symbol: "IUserStore", direction: "both")      // all
```

### `kirograph_dead_code` — unreferenced symbols

Returns unexported symbols with zero incoming edges. Good first step when cleaning up.

```
kirograph_dead_code(limit: 50)
```

### `kirograph_circular_deps` — import cycles

Runs Tarjan's SCC over import edges. No parameters needed.

```
kirograph_circular_deps()
```

### `kirograph_files` — indexed file structure

```
kirograph_files(format: "tree")                          // default
kirograph_files(format: "flat")                          // one path per line
kirograph_files(format: "grouped")                       // by directory
kirograph_files(filterPath: "src/auth", maxDepth: 2)
kirograph_files(pattern: "**/*.test.ts")
```

### `kirograph_status` — index health

Returns file count, symbol count, edge count, embedding coverage, DB size. Call when something feels off.

### `kirograph_hotspots` — most-connected symbols

Returns the top-N symbols by total edge degree (in + out, excluding structural `contains` edges). Use to find core abstractions, identify high blast-radius symbols before a refactor, or understand what the codebase revolves around.

```
kirograph_hotspots(limit: 20)
```

### `kirograph_surprising` — unexpected cross-module coupling

Finds direct edges between symbols in structurally distant files, scored by path distance × edge-kind weight. Use before a refactor to discover hidden dependencies that will break. High score = more unexpected.

```
kirograph_surprising(limit: 20)
```

### `kirograph_diff` — what changed since a snapshot?

Compares the current graph against a saved snapshot. Shows added/removed symbols and edges. A snapshot must exist — the user saves one with `kirograph snapshot save <label>` before making changes.

```
kirograph_diff()                              // vs latest snapshot
kirograph_diff(snapshot: "pre-refactor")     // vs named snapshot
```

---

## Architecture tools *(require `enableArchitecture: true` in config)*

### `kirograph_architecture` — **start here for architectural questions**

Returns the full package graph, detected layers (api/service/data/ui/shared), and their dependency edges.

```
kirograph_architecture()                    // packages + layers
kirograph_architecture(level: "packages")
kirograph_architecture(level: "layers")
kirograph_architecture(includeFiles: true)  // add file→package assignments
```

### `kirograph_coupling` — stability metrics per package

Returns Ca (afferent — depended on by), Ce (efferent — depends on), and instability (Ce/(Ca+Ce)).

- High Ca + low instability = load-bearing, safe to depend on, risky to change interface.
- High Ce + high instability = depends on many things, safe to refactor internals.

```
kirograph_coupling()                        // all packages, sorted by instability
kirograph_coupling(sortBy: "afferent")     // most depended-on first
kirograph_coupling(sortBy: "efferent")     // most outgoing deps first
```

### `kirograph_package` — drill into one package

Returns metadata, coupling metrics, outgoing deps, incoming dependents, and file list.

```
kirograph_package(package: "auth")
kirograph_package(package: "src/services", includeFiles: false)
```

---

## Workflows

**Bug fix or feature:**

1. `kirograph_context` — orient, find entry points.
2. `kirograph_node` with `includeCode: true` — read the relevant symbol.
3. `kirograph_callers` / `kirograph_callees` — trace the call flow.
4. `kirograph_impact` — check blast radius before editing.

**Refactor planning:**

1. `kirograph_hotspots` — identify the most-connected symbols; changing these is risky.
2. `kirograph_surprising` — surface hidden coupling that will break.
3. `kirograph_impact` on specific targets — confirm blast radius.
4. `kirograph_diff` after the refactor — verify the structural change matches intent.

**Architectural review:**

1. `kirograph_architecture` — get the package and layer map.
2. `kirograph_coupling` — find the most stable (high Ca) and most volatile (high instability) packages.
3. `kirograph_package` — drill into any package of interest.
4. `kirograph_circular_deps` — check for import cycles.

**Code cleanup:**

1. `kirograph_dead_code` — find unreferenced unexported symbols.
2. `kirograph_circular_deps` — find import cycles to untangle.
3. `kirograph_surprising` — find unexpected coupling to decouple.

---

## If `.kirograph/` does NOT exist

Ask the user: "This project doesn't have KiroGraph initialized. Run `kirograph init -i` to build a code knowledge graph for faster exploration?"

## Communication style: lite

Respond concisely. Omit filler words (just, really, basically, simply, actually).
Keep full sentences and articles. Remove pleasantries and hedging.
Preserve all code blocks, technical terms, file paths, and URLs unchanged.
Pattern: state the fact, then the next step.
Auto-clarity exceptions: temporarily revert to normal prose for (1) security warnings, (2) confirmations of irreversible actions (delete, overwrite, force-push), and (3) multi-step sequences where fragment order could cause misunderstanding. Resume compressed style immediately after.
