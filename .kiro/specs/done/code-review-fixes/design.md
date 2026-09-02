# Design Document: Code Review Fixes

## Overview

Structural refactoring addressing 11 code review findings across the Pabawi backend (Express 4, TypeScript strict, CommonJS) and frontend (Svelte 5, Vite 7, ESM). The changes span secret centralisation, server decomposition, route deduplication, execution logic extraction, API module splitting, DI introduction, MCP SDK typing, Bolt error parsing, SSE transport promotion, type suppression elimination, and test restoration.

All changes preserve existing runtime behaviour. No new user-facing features are introduced.

## Architecture

### High-Level Change Map

```
backend/src/
├── config/
│   ├── ConfigService.ts        ← Add jwtSecret + lifecycleToken accessors (Req 1)
│   └── schema.ts               ← Add secret fields to AppConfigSchema (Req 1)
├── container/
│   └── DIContainer.ts          ← NEW: lightweight DI container (Req 6)
├── integrations/
│   ├── bolt/
│   │   ├── BoltService.ts      ← Structured JSON error parsing (Req 8)
│   │   └── types.ts            ← BoltJsonError interface (Req 8, 10)
│   └── IntegrationManager.ts   ← (unchanged)
├── plugins/
│   └── registry.ts             ← NEW: declarative plugin registry (Req 2)
├── routes/
│   └── puppet.ts               ← Extract runPuppetOn helper (Req 4)
├── server.ts                   ← Plugin loop, remove duplicate mounts (Req 2, 3)
├── types/
│   ├── express.d.ts            ← Express.Request augmentation (Req 10)
│   └── mcp-sdk.d.ts            ← NEW: MCP SDK type declarations (Req 7)
└── services/
    ├── LoggerService.ts        ← (unchanged, consumed via DI)
    └── ExpertModeService.ts    ← (unchanged, consumed via DI)

frontend/src/lib/
├── api.ts                      ← Retain HTTP infrastructure only (Req 5)
├── proxmoxApi.ts               ← NEW: Proxmox domain functions (Req 5)
├── awsApi.ts                   ← NEW: AWS domain functions (Req 5)
├── azureApi.ts                 ← NEW: Azure domain functions (Req 5)
└── executionStream.svelte.ts   ← Becomes sole execution result transport (Req 9)
```

---

## Component Designs

### 1. Secret Centralisation (Requirement 1)

**Schema change** — add two fields to `AppConfigSchema`:

```typescript
// backend/src/config/schema.ts — additions to AppConfigSchema
export const AppConfigSchema = z.object({
  // ... existing fields ...
  jwtSecret: z.string().min(1, "JWT_SECRET is required"),
  lifecycleToken: z.string().min(1, "PABAWI_LIFECYCLE_TOKEN is required"),
});
```

**ConfigService accessors:**

```typescript
// backend/src/config/ConfigService.ts
public getJwtSecret(): string {
  return this.config.jwtSecret;
}

public getLifecycleToken(): string {
  return this.config.lifecycleToken;
}
```

**Loading** — in `loadConfiguration()`, add:

```typescript
jwtSecret: process.env.JWT_SECRET,
lifecycleToken: process.env.PABAWI_LIFECYCLE_TOKEN,
```

**Consumer migration** — all 8 route files that read `process.env.JWT_SECRET` receive `configService` as a factory parameter and call `configService.getJwtSecret()`. Same for lifecycle token consumers.

**Fail-fast** — Zod's `.min(1)` rejects empty strings at parse time. If either secret is missing, `ConfigService` constructor throws before the server binds a port.

---

### 2. Plugin Registry Loop (Requirement 2)

**Registry definition** — `backend/src/plugins/registry.ts`:

```typescript
import type { ConfigService } from "../config/ConfigService";
import type { LoggerService } from "../services/LoggerService";
import type { PerformanceMonitorService } from "../services/PerformanceMonitorService";
import type { IntegrationPlugin } from "../integrations/types";

export interface PluginRegistryEntry {
  name: string;
  /** Returns null if the integration is not configured / should be skipped */
  resolveConfig: (configService: ConfigService) => Record<string, unknown> | null;
  /** Factory that creates the plugin instance */
  create: (deps: PluginDeps) => IntegrationPlugin | Promise<IntegrationPlugin>;
  /** IntegrationConfig fields */
  type: "execution" | "information" | "both";
  priority: number;
}

export interface PluginDeps {
  configService: ConfigService;
  logger: LoggerService;
  performanceMonitor: PerformanceMonitorService;
}

export const pluginRegistry: PluginRegistryEntry[] = [
  {
    name: "bolt",
    type: "both",
    priority: 5,
    resolveConfig: (cs) => { /* check boltProjectPath + fs existence */ },
    create: (deps) => new BoltPlugin(/* ... */),
  },
  {
    name: "ansible",
    type: "both",
    priority: 5,
    resolveConfig: (cs) => cs.getIntegrationsConfig().ansible?.enabled ? cs.getIntegrationsConfig().ansible : null,
    create: (deps) => new AnsiblePlugin(/* ... */),
  },
  // ... puppetdb, puppetserver, hiera, ssh, proxmox, aws, azure
];
```

**Startup loop** — replaces the nine copy-pasted blocks in `server.ts`:

```typescript
for (const entry of pluginRegistry) {
  const config = entry.resolveConfig(configService);
  if (!config) {
    logger.warn(`${entry.name} integration not configured — skipping`);
    continue;
  }
  try {
    const plugin = await entry.create({ configService, logger, performanceMonitor });
    integrationManager.registerPlugin(plugin, {
      enabled: true,
      name: entry.name,
      type: entry.type,
      config,
      priority: entry.priority,
    });
    logger.info(`${entry.name} integration registered`);
  } catch (err) {
    logger.warn(`${entry.name} integration failed to initialise: ${(err as Error).message}`);
  }
}
```

**Invariant**: the registry array order and priority values reproduce the same registration order as the previous nine blocks.

---

### 3. Duplicate Router Mount Removal (Requirement 3)

**Current state:**

- `createInventoryRouter` mounted at `/api/inventory` AND `/api/nodes`
- `createPackagesRouter` mounted at `/api` AND `/api/nodes`

**Target state:**

- Inventory: `/api/inventory` only (canonical)
- Packages: `/api/packages` only (canonical)
- `/api/nodes/:id/puppet-run` remains (it's the puppet router, not a duplicate)

**Frontend migration**: grep all `fetch('/api/nodes')` calls in frontend components and update to `/api/inventory` or `/api/packages` as appropriate.

---

### 4. Shared Puppet Execution Helper (Requirement 4)

Extract a `runPuppetOn` function inside `puppet.ts`:

```typescript
interface PuppetExecutionContext {
  executionId: string;
  nodeId: string;
  puppetCommand: string;
  tool: ExecutionTool;
  body: PuppetRunBody;
  expertMode: boolean;
  userId: string;
  integrationManager: IntegrationManager;
  executionRepository: ExecutionRepository;
  journalService?: JournalService;
  streamingManager?: StreamingExecutionManager;
}

async function runPuppetOn(ctx: PuppetExecutionContext): Promise<void> {
  try {
    const streamingCallback = ctx.streamingManager?.createStreamingCallback(
      ctx.executionId,
      ctx.expertMode,
    );

    const result = await ctx.integrationManager.executeAction(ctx.tool, {
      type: "command",
      target: ctx.nodeId,
      action: ctx.puppetCommand,
      parameters: { sudo: true },
      metadata: { streamingCallback },
    });

    await ctx.executionRepository.update(ctx.executionId, {
      status: result.status,
      completedAt: result.completedAt,
      results: result.results,
      error: result.error,
      command: result.command ?? ctx.puppetCommand,
      stdout: ctx.expertMode ? result.stdout : undefined,
      stderr: ctx.expertMode ? result.stderr : undefined,
    });

    await recordPuppetJournal(
      ctx.journalService, ctx.nodeId, ctx.tool, ctx.body,
      result.status === "success" ? "success" : "failed",
      result.error, ctx.userId,
    );

    if (ctx.streamingManager) {
      ctx.streamingManager.emitComplete(ctx.executionId, result);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await ctx.executionRepository.update(ctx.executionId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      results: [{ nodeId: ctx.nodeId, status: "failed", error: errorMessage, duration: 0 }],
      error: errorMessage,
    });

    await recordPuppetJournal(
      ctx.journalService, ctx.nodeId, ctx.tool, ctx.body,
      "failed", errorMessage, ctx.userId,
    );

    if (ctx.streamingManager) {
      ctx.streamingManager.emitError(ctx.executionId, errorMessage);
    }
  }
}
```

Both the single-node and multi-node handlers call `runPuppetOn` — the single-node handler once, the multi-node handler in a loop.

---

### 5. Frontend API Module Split (Requirement 5)

**Split strategy:**

| New file | Contents moved from `api.ts` |
|----------|------------------------------|
| `api.ts` (trimmed) | `fetchWithRetry`, `get`, `post`, `put`, `del`, error utilities, shared types, `getBatchStatus` |
| `proxmoxApi.ts` | All `getProxmox*`, `createProxmox*`, `destroyNode`, `executeNodeAction`, `fetchLifecycleActions`, `testProxmoxConnection` |
| `awsApi.ts` | All AWS-specific functions (lines 1055–1293) |
| `azureApi.ts` | All Azure-specific functions |

Each domain module imports `{ get, post, put, del }` from `./api` and re-exports its domain functions.

**Barrel re-export** (optional): `index.ts` in `lib/` re-exports everything for backward compat during migration, but consumers are updated to import from the specific module.

---

### 6. Dependency Injection Container (Requirement 6)

**Design** — a minimal typed container, not a framework:

```typescript
// backend/src/container/DIContainer.ts

import type { LoggerService } from "../services/LoggerService";
import type { ExpertModeService } from "../services/ExpertModeService";
import type { ConfigService } from "../config/ConfigService";

export interface ServiceRegistry {
  logger: LoggerService;
  expertMode: ExpertModeService;
  config: ConfigService;
}

export class DIContainer {
  private services = new Map<string, unknown>();

  register<K extends keyof ServiceRegistry>(key: K, instance: ServiceRegistry[K]): void {
    this.services.set(key, instance);
  }

  resolve<K extends keyof ServiceRegistry>(key: K): ServiceRegistry[K] {
    const instance = this.services.get(key);
    if (!instance) {
      throw new Error(`Service '${key}' not registered in container`);
    }
    return instance as ServiceRegistry[K];
  }
}
```

**Startup** — in `server.ts`, before plugin registration:

```typescript
const container = new DIContainer();
container.register("config", configService);
container.register("logger", logger);
container.register("expertMode", new ExpertModeService());
```

**Consumer pattern** — route factories and service constructors receive `container: DIContainer` and call `container.resolve("logger")` instead of `new LoggerService()`.

**Singleton guarantee**: `register()` is called once per key at startup. `resolve()` always returns the same instance.

---

### 7. MCP SDK Type Declaration (Requirement 7)

**File**: `backend/src/types/mcp-sdk.d.ts`

```typescript
declare module "@modelcontextprotocol/sdk/server/streamableHttp.js" {
  import type { Request, Response } from "express";
  import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

  export interface StreamableHTTPServerTransportOptions {
    sessionIdGenerator?: () => string;
    onsessioninitialized?: (sessionId: string) => void;
  }

  export class StreamableHTTPServerTransport {
    constructor(options?: StreamableHTTPServerTransportOptions);
    onclose?: () => void;
    handleRequest(req: Request, res: Response, body?: unknown): Promise<void>;
    close(): void;
  }
}
```

**tsconfig.json** — no changes to `moduleResolution`. The declaration file is picked up automatically because it's under `src/` which is in the `include` glob.

**Usage site** — `server.ts` changes from:

```typescript
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const { StreamableHTTPServerTransport } = require("...") as any;
```

to:

```typescript
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js") as typeof import("@modelcontextprotocol/sdk/server/streamableHttp.js");
```

This removes all `as any`, `@typescript-eslint/no-unsafe-*` suppressions from the MCP block while keeping `require()` for CJS runtime compatibility.

---

### 8. Bolt Structured JSON Error Parsing (Requirement 8)

**New interface** — `backend/src/integrations/bolt/types.ts`:

```typescript
export interface BoltJsonError {
  _error: {
    kind: string;
    msg: string;
    details?: Record<string, unknown>;
  };
}
```

**Error kind mapping:**

```typescript
// backend/src/integrations/bolt/BoltService.ts
private static readonly ERROR_KIND_MAP: Record<string, string> = {
  "puppetlabs.tasks/connect-error": "connection",
  "puppetlabs.tasks/task-error": "execution",
  "puppetlabs.tasks/not-found-error": "not_found",
  "puppetlabs.tasks/validation-error": "validation",
  "bolt/connect-error": "connection",
  "bolt/run-failure": "execution",
};
```

**Categorisation logic** — new method:

```typescript
private categoriseError(stderr: string): { category: string; message: string } {
  // Attempt structured JSON parse first
  try {
    const parsed = JSON.parse(stderr) as unknown;
    if (this.isBoltJsonError(parsed)) {
      const kind = parsed._error.kind;
      const category = BoltService.ERROR_KIND_MAP[kind] ?? "unknown";
      return { category, message: parsed._error.msg };
    }
  } catch {
    // Not JSON — fall through to substring matching
  }

  // Fallback: existing substring matching (unchanged)
  const lower = stderr.toLowerCase();
  if (lower.includes("unreachable") || lower.includes("connection")) {
    return { category: "connection", message: stderr };
  }
  // ... remaining fallback patterns
  return { category: "unknown", message: stderr };
}

private isBoltJsonError(value: unknown): value is BoltJsonError {
  return (
    typeof value === "object" && value !== null &&
    "_error" in value &&
    typeof (value as Record<string, unknown>)._error === "object" &&
    (value as Record<string, unknown>)._error !== null &&
    "kind" in ((value as Record<string, unknown>)._error as object) &&
    "msg" in ((value as Record<string, unknown>)._error as object)
  );
}
```

---

### 9. SSE as Default Execution Transport (Requirement 9)

**Current state**: `PuppetRunInterface.svelte` uses SSE for expert-mode streaming (line 223) but falls back to raw `fetch()` polling via `pollExecutionResult` for non-expert mode.

**Target state**: SSE is the sole real-time transport. The `pollExecutionResult` function is deleted.

**Design:**

1. After `POST /api/nodes/:id/puppet-run` returns `{ executionId }`, the component calls `useExecutionStream(executionId)` regardless of expert mode.
2. The `onComplete` callback receives the final result.
3. **Fallback**: if the SSE connection enters `error` state after max reconnect attempts, a single `GET /api/executions/:id` fetch retrieves the final result (not a polling loop).

```typescript
// In PuppetRunInterface.svelte
const stream = useExecutionStream(executionId, {
  onComplete: (result) => { executionResult = result; },
  onError: async () => {
    // Single fallback fetch, not a loop
    executionResult = await get(`/api/executions/${executionId}`);
  },
});
stream.connect();
```

**Removed**: `pollExecutionResult` function and all `setInterval`/`setTimeout` polling patterns.

---

### 10. Type Suppression Elimination (Requirement 10)

**Strategy**: typed interfaces at major boundaries + batch fix.

**New interfaces:**

| Interface | Location | Replaces |
|-----------|----------|----------|
| `BoltJsonOutput` (already exists) | `bolt/types.ts` | `as any` on JSON.parse results |
| `BoltJsonError` | `bolt/types.ts` | substring matching casts |
| `Express.Request` augmentation | `types/express.d.ts` | `(req as unknown as { user? })` |
| `StreamableHTTPServerTransport` | `types/mcp-sdk.d.ts` | `require(...) as any` |
| `McpSessionEntry` (typed transport) | `server.ts` | `transport: any` |

**Batch approach:**

1. Define interfaces for the top ~20 suppression sites (MCP, Bolt JSON, Express request).
2. Replace `as any` / `as unknown as` with proper type assertions or type guards.
3. Leave one-off casts in test files (mocking patterns) — these are acceptable per Req 10.4.
4. Target: ≤28 remaining suppressions (down from 108).

---

### 11. Test Restoration (Requirement 11)

**Approach:**

1. Run `npm test` to identify all failures.
2. Categorise each failure: structural change (moved import, renamed function) vs. pre-existing bug.
3. Fix structural failures by updating imports/references.
4. Fix pre-existing bugs by correcting the test or the code under test.
5. No tests are skipped or deleted.

This requirement has no design artefact — it's a verification gate applied after all other changes.

---

## Data Models

### ServiceRegistry (DI Container)

```typescript
interface ServiceRegistry {
  logger: LoggerService;
  expertMode: ExpertModeService;
  config: ConfigService;
}
```

### PluginRegistryEntry

```typescript
interface PluginRegistryEntry {
  name: string;
  resolveConfig: (configService: ConfigService) => Record<string, unknown> | null;
  create: (deps: PluginDeps) => IntegrationPlugin | Promise<IntegrationPlugin>;
  type: "execution" | "information" | "both";
  priority: number;
}
```

### BoltJsonError

```typescript
interface BoltJsonError {
  _error: {
    kind: string;
    msg: string;
    details?: Record<string, unknown>;
  };
}
```

### PuppetExecutionContext

```typescript
interface PuppetExecutionContext {
  executionId: string;
  nodeId: string;
  puppetCommand: string;
  tool: ExecutionTool;
  body: PuppetRunBody;
  expertMode: boolean;
  userId: string;
  integrationManager: IntegrationManager;
  executionRepository: ExecutionRepository;
  journalService?: JournalService;
  streamingManager?: StreamingExecutionManager;
}
```

---

## Error Handling

### ConfigService (Requirement 1)

- Missing `JWT_SECRET` → Zod validation error at startup → process exits before binding port.
- Missing `PABAWI_LIFECYCLE_TOKEN` → same behaviour.

### Plugin Registry (Requirement 2)

- Plugin constructor throws → caught in loop body, warning logged, iteration continues.
- `resolveConfig` returns null → plugin skipped silently (info log).

### Bolt Error Parsing (Requirement 8)

- `JSON.parse` throws → fall through to substring matching (existing behaviour preserved).
- `_error.kind` not in mapping → category defaults to `"unknown"`.

### SSE Fallback (Requirement 9)

- SSE connection fails after max reconnects → single GET fetch for final result.
- GET fetch also fails → error state displayed to user.

### DI Container (Requirement 6)

- `resolve()` called for unregistered key → throws immediately with descriptive message (fail-fast, caught during startup wiring).

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Secret validation rejects missing or empty values

*For any* configuration object where `jwtSecret` is missing, empty, or whitespace-only, the `AppConfigSchema.parse()` call SHALL throw a `ZodError`.

**Validates: Requirements 1.1, 1.3**

### Property 2: Secret round-trip through ConfigService

*For any* non-empty string value set as the `JWT_SECRET` environment variable, `configService.getJwtSecret()` SHALL return that exact string value unchanged.

**Validates: Requirements 1.2**

### Property 3: Plugin registry produces correct registrations

*For any* subset of enabled integrations in the configuration, iterating the plugin registry SHALL result in exactly those integrations being registered in IntegrationManager with their specified priority values, and no others.

**Validates: Requirements 2.2, 2.5**

### Property 4: Failed plugin does not prevent subsequent registrations

*For any* plugin registry where entry N throws during `create()`, all entries after N with valid configuration SHALL still be registered in IntegrationManager.

**Validates: Requirements 2.3**

### Property 5: DI container singleton guarantee

*For any* registered service key, calling `container.resolve(key)` multiple times SHALL return the same object reference (referential equality) on every call.

**Validates: Requirements 6.1**

### Property 6: Bolt JSON error categorisation is deterministic

*For any* valid JSON string containing `_error.kind` with a value present in the error kind mapping, `categoriseError()` SHALL return the mapped category — never falling through to substring matching.

**Validates: Requirements 8.1, 8.2, 8.5**

### Property 7: Bolt error fallback for non-JSON input

*For any* string that is not valid JSON, `categoriseError()` SHALL use the substring-matching fallback and never throw.

**Validates: Requirements 8.3**

### Property 8: SSE client handles all event types without error

*For any* valid `StreamingEvent` with a type in `["start", "stdout", "stderr", "status", "complete", "error", "command"]`, the `handleEvent` function SHALL update state without throwing.

**Validates: Requirements 9.4**
