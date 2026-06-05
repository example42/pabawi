# PRD — Swamp Integration

| | |
|---|---|
| **Status** | Draft (post-grill, ready for review) |
| **Author** | Alessandro Franceschi |
| **Created** | 2026-05-26 |
| **Target** | Pabawi v1.4+ |
| **Tracking** | TBD |

---

## 1. Problem & motivation

Pabawi is an infrastructure-management web UI. Its users increasingly run AI-native automation (model-driven, schema-typed, DAG-orchestrated). Swamp is one such tool — it owns the orchestration layer (models, workflows, vaults, reports) but has no web UI.

Today, a user running both has two disjoint surfaces: pabawi for classic ops (Bolt, Ansible, SSH, Puppet) and a swamp CLI in a terminal. They want one pane of glass for execution, one inventory for hosts (regardless of who discovered them), and one place to look at audit/reporting output.

This PRD specifies how pabawi integrates swamp as a first-class plugin alongside Bolt, Ansible, AWS, etc. — without pabawi reimplementing swamp's primitives (CEL, schemas, vaults) and without swamp reimplementing pabawi's (SSH/Puppet/RBAC/audit).

## 2. Goals

- **G1.** A user with swamp installed can point pabawi at their swamp repo and, even from a fresh state, install recommended host-shaped extensions and run their discovery methods from the UI — landing on a usable inventory and operational catalog without leaving the browser.
- **G2.** Host-shaped swamp model artifacts (EC2, Azure VM, Proxmox VM, custom) appear in pabawi's inventory alongside hosts discovered via PuppetDB / SSH / cloud plugins, correlated by hostname via `NodeLinkingService` (same behavior as every other inventory source today).
- **G3.** Swamp's native reports are runnable from pabawi and their output is rendered live (no pabawi-side caching) as a Reports tab.
- **G4.** Adding a new host-producing swamp extension requires zero pabawi code change — only a manifest entry in the pabawi-side YAML.
- **G5.** All swamp executions triggered from pabawi flow through pabawi's existing RBAC, audit log, journal, and streaming infrastructure.

## 3. Non-goals (v1)

- **NG1.** Pabawi does not become a swamp editor (no model/workflow authoring UI). Pulling pre-authored extensions and invoking their discovery methods is operational, not authoring, and is in scope.
- **NG2.** Non-host swamp artifacts (S3 buckets, IAM policies, RDS, DNS records, etc.) are **hidden** in v1. A "Cloud Resources" page is deferred to v2.
- **NG3.** Pabawi does not replace swamp's vault for its own secret storage. Workflow inputs containing credentials should reference swamp vault expressions.
- **NG4.** Pabawi does not orchestrate or schedule swamp workflows (cron, webhook triggers). Triggering is on-demand from the UI/API.
- **NG5.** Remote swamp (over MCP or HTTP) is deferred. v1 assumes the swamp CLI runs locally to the pabawi backend, against a local repo path.
- **NG6.** Multi-tool swamp repos: pabawi targets exactly one tool per pabawi instance (`SWAMP_TOOL`). Surfacing multiple tools simultaneously from one pabawi is deferred to v2 alongside multi-repo.
- **NG7.** Inline fact-projection from non-host swamp artifacts onto pabawi nodes (e.g., a sortable `cve_critical` column on the host list sourced from `@swamp/cve/dirtyfrag` output) is deferred to v1.1. v1 surfaces such data only via the Reports tab.

## 4. User personas

- **Ops engineer (primary)**: runs Puppet, Ansible, and bolt today; adopting swamp for cloud automation. Wants one UI, one audit trail, one inventory.
- **Platform engineer**: maintains pabawi's swamp manifest; authors swamp extensions for the team's specific cloud patterns when community ones don't fit.
- **Compliance/security reviewer**: consumes Reports; doesn't run commands.

## 5. Architecture overview

Swamp is integrated as a single pabawi plugin (`SwampPlugin`) that implements **both** `ExecutionToolPlugin` and `InformationSourcePlugin` (matching the pattern of `BoltPlugin`, `AWSPlugin`, `AzurePlugin`, etc.). It shells out to the local `swamp` CLI with `cwd` set to a configured repo path and parses JSON output.

```
┌─────────────────────────────────────────────────────────────┐
│ Pabawi backend                                              │
│                                                             │
│  ┌──────────────┐   ┌────────────────────────────────────┐  │
│  │ Routes / UI  │──▶│ IntegrationManager                 │  │
│  └──────────────┘   │  ├─ BoltPlugin                     │  │
│                     │  ├─ AnsiblePlugin                  │  │
│                     │  ├─ PuppetDBPlugin                 │  │
│                     │  └─ SwampPlugin ──┐                │  │
│                     └──────────────────│─────────────────┘  │
│                                        │                    │
│                  ┌─────────────────────┴────────────────┐   │
│                  │ SwampService                         │   │
│                  │  · spawn('swamp', argv, {cwd, env})  │   │
│                  │    — stdin-piped inputs              │   │
│                  │    — stdout streamed to caller       │   │
│                  │  · JSON parse                        │   │
│                  │  · per-model lock (mutex per model)  │   │
│                  └──────┬───────────────────────────────┘   │
│                         │                                   │
│                  ┌──────┴───────────┐                       │
│                  │ ManifestLoader   │ ←── swamp-manifest.yaml
│                  │  · Zod validate  │                       │
│                  │  · defaults +    │                       │
│                  │    user overlay  │                       │
│                  └──────────────────┘                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                  ┌───────┴───────┐
                  │ swamp CLI     │
                  │ (local repo)  │
                  └───────────────┘
```

Streaming uses swamp CLI's own stdout/stderr — same pattern as `BoltService` and `AnsibleService`. Pabawi does **not** read swamp's internal `.swamp/` directory.

## 6. Feature breakdown

### 6.1 SwampPlugin — execution

**Capability.** Run admin-allowlisted swamp model methods and workflows from pabawi, with per-node action menus and a global command catalog.

**`listCapabilities()`** derives from the manifest (§7):

- For each `hosts:` entry with a `methods:` list, expose one capability per `(modelType, methodName)` pair — per-node only, scoped to nodes of that type.
- For each `methods:` entry with `perHost: true`, expose one capability shown in the per-node menu for **every** node (probe/scan-style).
- For each `methods:` entry with `perHost: false`, expose one capability in the global catalog (takes inputs at run time).
- For each `workflows:` entry, expose one capability in the global catalog with the workflow's input JSON Schema.

**`executeAction(action)`** dispatches based on action type:

- `swamp-method`: `swamp model method run <modelName> <method> --stdin --json` with input JSON piped over stdin (never argv). When `SWAMP_TOOL` is set, `--tool <value>` is unconditionally appended.
- `swamp-workflow`: `swamp workflow run <workflowName> --stdin --json` with input JSON piped over stdin.
- Returns `ExecutionResult` (stdout, stderr, exit code, parsed output).
- Audited via `ExecutionRepository`.

**Per-model lock.** `SwampService` maintains an in-process `Map<lockKey, Promise<void>>` keyed by `swamp:<modelType>:<modelName>` to serialize calls against the same model (avoids contending on swamp's per-model lock). Cross-model calls run in parallel. `CONCURRENT_EXECUTION_LIMIT` still applies as the global cap.

**Bulk semantics.** When a user invokes a per-node method against N nodes:

- Pabawi serializes within the lock bucket but parallelizes across buckets.
- Hard cap: `SWAMP_MAX_BULK_TARGETS` (default `50`).
- Bulk-confirmation modal shows estimated time and cap.
- Continue-on-error: a single failed instance does not abort the bulk; per-instance `ExecutionRepository` rows preserve audit granularity. UI surfaces partial-success.
- v1.1 forward-compat: manifest schema reserves `bulkMethods:` for fan-out optimization.

**Streaming.** `StreamingExecutionManager` consumes swamp CLI stdout/stderr directly. Same pattern as Bolt/Ansible. No file-tail, no `.swamp/` introspection.

**Input forms (UI).** Frontend renders JSON Schema from `swamp workflow describe` (or equivalent) for **workflows only**. Model methods invoked per-node take no run-time parameters (the instance state is already stored). Library choice deferred to M5.

**Cache invalidation.** After a successful method run, pabawi invalidates the per-model inventory cache (`swamp:<modelType>`). Affects only that model's nodes.

**RBAC.** New permissions:

- `swamp.read` — view swamp catalog (commands, models, workflows, reports)
- `swamp.execute.workflow` — run any allowlisted workflow
- `swamp.execute.model_method` — run any allowlisted model method
- `swamp.bootstrap` — install recommended extensions (§6.4)
- `swamp.reports.read` — view reports tab
- `swamp.reports.run` — kick off reports

Coarse permissions in v1; admin curates blast radius via the manifest (only allowlisted methods/workflows are exposed), so a coarse permission has a precise reach.

### 6.2 SwampPlugin — inventory & facts

**Capability.** Project host-shaped swamp artifacts into pabawi inventory, correlated by hostname with hosts from other sources.

**`getInventory()`** flow:

1. Load manifest.
2. For each `hosts:` entry, fetch artifacts via `swamp data query 'modelType == "<type>"<&& skipIf-inverted>' --json` (when `skipIf` is present, it's passed through as part of the predicate so swamp does the filtering).
3. Project each artifact to a pabawi `Node`:
   - `name` / `id` ← evaluate the `hostname:` field path against the artifact (plain dotted-path lookup in pabawi, e.g., `attributes.privateDnsName`).
   - `source: 'swamp'`, `sourceDetail: <modelType>`.
   - `facts: { ... }` ← per-key dotted-path projection from `facts:` map.
4. Pass nodes to `NodeLinkingService`. Correlation uses the existing identifier set (`id` / `name` / `uri` / `config.hostname`) — same as every other inventory source. No alias system.

**`getNodeFacts(nodeId)`** flow:

- For each manifest `hosts:` entry, query `swamp data query 'modelType == "<type>" && <hostname-CEL> == "<nodeId>"' --json`.
- Merge projected facts across matched artifacts.
- Source-attribute facts as `swamp:<modelType>` for UI display.

**Cache.** 30s inventory, 5min facts (matches AWS plugin). Per-model invalidation on method runs (§6.1).

**Priority.** `7` in `IntegrationManager` merge — same class as AWS / Azure / Proxmox.

**Filter discipline.** Only types declared in the manifest produce inventory. All other types in the swamp repo are ignored — intentional, so non-host artifacts don't pollute the host list. One info-level log entry per `getInventory()` run summarising types queried.

### 6.3 Reports tab

**Capability.** List and run allowlisted swamp reports. Live read-through; no pabawi-side caching.

**Backend routes** (`backend/src/routes/swampReports.ts`):

- `GET  /api/swamp/reports` — list reports allowlisted in the manifest `reports:` section. Live-fetched via swamp CLI.
- `POST /api/swamp/reports/:name/run` — kick off via `swamp report run <name> --json`. Streaming via stdout (same as method/workflow execution).
- `GET  /api/swamp/reports/:name/runs/:id` — proxy to swamp's own report-run storage (`swamp report get` or equivalent). Pabawi does **not** persist report output.

Pabawi-side persistence is limited to `ExecutionRepository` audit rows (who kicked off which report, when).

**Frontend** (`frontend/src/pages/SwampReports.svelte`):

- List view of allowlisted reports.
- Run button → streaming output.
- View past runs via swamp's own storage (list of run IDs, click-through to fetched output).

### 6.4 Bootstrap experience

**Capability.** Empty-state-friendly onboarding for users with a fresh swamp repo. Embedded in the swamp integration settings page; admin-only.

**Detection.** When the integration is enabled but no manifest-declared host type has matching artifacts (or no allowlisted methods/workflows have matching items in the repo), pabawi shows a "Recommended extensions" panel.

**Panel content.** A curated list of well-known swamp extensions, each with:

- Status badge: `not installed` / `installed but no instances` / `installed, N instances`.
- One-click **Install** button (admin only) → `POST /api/swamp/bootstrap/install` with `{ package: "<name>" }`.
- Post-install suggestion: "Now run `<extension>.<discoverMethod>`" with a one-click trigger.

**Server-side install.** `POST /api/swamp/bootstrap/install` spawns `swamp extension pull <package>` server-side, requires `swamp.bootstrap` permission, journals as `swamp.extension.install`. Audited. Disabled entirely when `SWAMP_BOOTSTRAP_ENABLED=false`.

**Curated default list** (subject to registry verification at M6):

- `swamp/aws` — EC2 host discovery + lifecycle
- `swamp/azure` — VM host discovery + lifecycle
- `swamp/proxmox` — VM host discovery + lifecycle
- `@webframp/system` — basic per-host system facts
- `@swamp/cve/dirtyfrag` — per-host CVE scanning

Anything beyond this list, the admin discovers via `swamp extension search` and adds to the manifest by hand.

**No silent auto-install.** Even with `swamp.bootstrap`, installation is one explicit click per extension.

### 6.5 Pabawi-authored extensions

Deferred from v1 entirely. The combination of (a) a curated default list of community extensions covering common cloud + host enrichment needs and (b) the user's ability to add any swamp extension via manifest means pabawi v1 ships **zero pabawi-authored swamp extensions**. Gaps identified during M6 (registry verification) and v1 usage may justify authoring `pabawi/<name>` extensions in v1.1+; that decision is deferred.

## 7. Configuration

### 7.1 Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `SWAMP_REPO_PATH` | yes (to enable) | — | Path to a swamp-initialized directory. Validated at startup: resolves, is a directory, contains `.swamp/`. |
| `SWAMP_BINARY` | no | `swamp` | CLI binary name or absolute path. |
| `SWAMP_TOOL` | no | — | Multi-tool repo filter. When set, `--tool <name>` is appended to every swamp invocation. Single-tool scope per pabawi instance. |
| `SWAMP_TIMEOUT_MS` | no | `120000` | Per-command timeout. |
| `SWAMP_MANIFEST_FILE` | no | `backend/config/swamp-manifest.yaml` | Pabawi-side manifest YAML. Overrides/extends shipped defaults. |
| `SWAMP_MAX_BULK_TARGETS` | no | `50` | Hard cap on bulk method invocations per user action. |
| `SWAMP_BOOTSTRAP_ENABLED` | no | `true` | Set `false` to hide the "Install extension" surface entirely (security-strict deployments). |
| `SWAMP_INVENTORY_CACHE_TTL_MS` | no | `30000` | Inventory cache. |
| `SWAMP_FACTS_CACHE_TTL_MS` | no | `300000` | Facts cache. |

If `SWAMP_REPO_PATH` is unset, the plugin is disabled (no init, no health check, no commands).

### 7.2 Manifest YAML

**Primary file**: pabawi-side, path from `SWAMP_MANIFEST_FILE`. Pabawi ships `backend/config/swamp-manifest.default.yaml` with sensible defaults for the curated extension set (§6.4). User file overrides/extends — pabawi-side wins on key conflict, user-added entries are merged in.

**Schema**:

```yaml
version: 1

# Discovery: types that produce inventory.
# Methods declared here are per-node and scoped to this type's nodes.
hosts:
  - type: aws/ec2-instance              # swamp model type (required, unique within section)
    extension: swamp/aws                # the package that provides this type (optional, used by bootstrap)
    hostname: attributes.privateDnsName # dotted-path expression resolving to a string (required)
    facts:                              # map<factName, dotted-path expression>
      cloud_provider: '"aws"'           # literal-quoted CEL fragment for constant values
      instance_type: attributes.instanceType
      region: attributes.region
      tags: attributes.tags
    skipIf: 'attributes.state != "running"'  # CEL predicate, evaluated server-side by swamp
    methods: [start, stop, restart]     # allowlisted per-node actions
    bootstrap:                          # optional, hints for the recommended-extensions panel
      discoverMethod: lookup

  - type: azure/virtual-machine
    extension: swamp/azure
    hostname: attributes.computerName
    facts:
      cloud_provider: '"azure"'
      vm_size: attributes.vmSize
      location: attributes.location
    methods: [start, stop]
    bootstrap:
      discoverMethod: lookup

  - type: proxmox/vm
    extension: swamp/proxmox
    hostname: attributes.name
    facts:
      cloud_provider: '"proxmox"'
      node: attributes.node
    methods: [start, shutdown]
    bootstrap:
      discoverMethod: lookup

# Standalone runnable things (not tied to a host inventory type).
methods:
  - type: webframp/system-info
    extension: '@webframp/system'
    perHost: true                       # appears in per-node action menu for all nodes
    bootstrap:
      collectMethod: probe

  - type: cve/scan-result
    extension: '@swamp/cve/dirtyfrag'
    perHost: true
    bootstrap:
      collectMethod: scan

# Admin-curated workflow allowlist (global catalog).
workflows:
  - name: nightly-patch
  - name: cost-rollup

# Admin-curated report allowlist (Reports tab).
reports:
  - name: patch-status
  - name: cve-summary
```

**Validation.** Manifest is parsed and validated at pabawi startup (Zod). Per-entry warnings (not fatal) when:

- A declared `type:` does not exist in the swamp repo.
- A declared workflow/report name does not exist.
- A declared method does not exist on the type.

Plugin remains healthy with valid swamp connectivity even if specific manifest entries are stale (§9). The integration settings page surfaces per-entry warnings.

**Defaults overlay.** Shipped defaults are loaded first; user file (if present) merges on top. User wins on key conflict; user can add new entries.

### 7.3 CEL pass-through

Pabawi does not parse, evaluate, or interpret CEL expressions. The `skipIf:` predicate is passed through to `swamp data query <predicate>` as-is. The `hostname:` and `facts:` expressions are dotted-path lookups evaluated client-side over the JSON returned by `swamp data query` (e.g., `lodash.get(record, "attributes.privateDnsName")`). Quoted literals like `'"aws"'` are recognized as constants and unwrapped. Any expression more complex than a dotted path or literal in `hostname:`/`facts:` is unsupported and fails at manifest-load time with a clear error.

## 8. Data flow examples

### 8.1 EC2 instance flowing through swamp and SSH

1. Swamp has an `aws/ec2-instance` artifact with `attributes.privateDnsName: "ip-10-0-1-12.ec2.internal"`.
2. `SwampPlugin.getInventory()` runs `swamp data query 'modelType == "aws/ec2-instance" && attributes.state == "running"' --json`, projects each artifact to `Node { id: "ip-10-0-1-12.ec2.internal", name: "ip-10-0-1-12.ec2.internal", source: "swamp", sourceDetail: "aws/ec2-instance", facts: {cloud_provider: "aws", ...} }`.
3. SSH plugin also has a node entry for `ip-10-0-1-12.ec2.internal` (via SSH known-hosts or explicit config).
4. `NodeLinkingService` correlates via shared `name` — single merged node, sources `["swamp", "ssh"]`.
5. UI shows one node; facts merged by source priority (SSH `50` > swamp `7`, so SSH-collected facts win on overlap; swamp facts contribute `cloud_provider`, `region`, `instance_type`).

### 8.2 Running a workflow from the UI

1. User opens command palette → "swamp workflow: nightly-patch".
2. Frontend renders input form from cached JSON Schema (workflow inputs only).
3. POST `/api/integrations/swamp/execute` with `{ kind: "workflow", name: "nightly-patch", inputs: {...} }`.
4. RBAC check: `swamp.execute.workflow`.
5. `ExecutionQueue.enqueue()` (global FIFO under `CONCURRENT_EXECUTION_LIMIT`).
6. `SwampService.runWorkflow()` spawns `swamp workflow run nightly-patch --stdin --json` (`--tool` appended if `SWAMP_TOOL` is set). Input JSON piped over stdin.
7. `StreamingExecutionManager` pipes swamp CLI stdout through SSE.
8. On completion, `ExecutionRepository.create()` (with `inputHash: sha256:...`, never raw input) + journal entry.

### 8.3 Bulk per-node action

1. User selects 7 EC2 instance nodes in inventory, clicks "Restart".
2. Confirmation modal: "Will run sequentially against 7 nodes. Estimated time up to 14 minutes."
3. On confirm: pabawi groups by lock bucket (`swamp:aws/ec2-instance:<instance-name>` per node — all distinct, so technically no contention, but conceptually serialized through the swamp per-model lock anyway).
4. 7 sequential `swamp model method run <instance> restart --stdin --json` calls.
5. After each completes, per-model cache invalidated.
6. UI shows progress `1/7` … `7/7`. Continue-on-error: a failing call doesn't abort the batch.
7. Final summary: "6 succeeded, 1 failed" with per-instance audit rows.

## 9. Health states

`SwampPlugin.healthCheck()` returns one of:

| State | Condition |
|---|---|
| `healthy` | Binary executes, repo path valid, `swamp model search --json` (with `--tool` if applicable) returns 0. |
| `degraded` | Previously healthy but a recent CLI call failed; cached inventory still served until TTL. |
| `unhealthy` | Binary missing, repo path invalid, `.swamp/` subdir absent, `SWAMP_TOOL` set but tool not found in repo, or basic `swamp` call errors. |

Manifest-entry validity is **per-entry warnings**, not a binary health signal. A user with one stale manifest row is still "healthy" — only that specific row is degraded in the UI.

A minimum swamp CLI version is pinned in pabawi's config; health check verifies the installed swamp meets that pin and downgrades to `unhealthy` (with a clear message) if not.

## 10. Audit & journal

Every swamp execution initiated by pabawi produces:

- An `ExecutionRepository` row (user, integration, action type, target, exit code, output, `inputHash: sha256:...`).
- A journal entry (`JournalService`) with event type `swamp.execute.workflow`, `swamp.execute.model_method`, or `swamp.extension.install` (bootstrap).
- **Never** the raw input JSON. Only the hash, for diffing repeated runs.

Swamp's own audit log (under `<SWAMP_REPO_PATH>/.swamp/audit/`) is **not** copied into pabawi. It remains the source of truth for "what swamp did internally"; pabawi records "what the user asked swamp to do via pabawi." Two layers, no overlap.

Swamp executions initiated **outside** pabawi (direct CLI use) are not visible to pabawi's audit. Surfacing them is out of scope for v1.

## 11. Errors & failure modes

| Failure | Handling |
|---|---|
| `SWAMP_REPO_PATH` invalid or missing | Plugin disabled at startup; clear log message; other plugins unaffected. |
| `swamp` binary missing | Same as above. |
| `SWAMP_TOOL` set but tool not in repo | Plugin unhealthy; clear health-check message. |
| Swamp CLI version below minimum pin | Plugin unhealthy; clear message naming the required minimum. |
| Manifest malformed (YAML parse / Zod fail) | Plugin unhealthy; clear message; pabawi backend continues to run. |
| Manifest type/method/workflow/report doesn't exist in swamp | Per-entry warning shown in integration settings UI; integration stays healthy; that row not exposed. |
| `swamp model search --json` returns non-zero | Health degrades to `degraded`; cached inventory served until TTL. |
| Workflow/method run fails | `ExecutionResult` exit code surfaced; SSE stream terminates with error frame; audit row records failure. |
| `skipIf` predicate errors at query time | Swamp surfaces the error in its own output; pabawi propagates as a degraded inventory query for that type; warn log; other types unaffected. |
| Concurrent swamp invocations against same model | Serialized by per-model lock (§6.1). |
| Bulk action exceeds `SWAMP_MAX_BULK_TARGETS` | UI rejects with clear error before dispatch. |

## 12. Security

- **Inputs over stdin, never argv.** `SwampService` mandates `--stdin` for all method/workflow invocations. `--input` and `--input-file` are forbidden — they expose secrets via `ps`.
- **Audit hashes inputs.** Only `inputHash` is persisted; raw input JSON is dropped after the spawn returns.
- **Vault expressions encouraged.** Documentation guides users to reference swamp vault secrets via vault expressions in workflow inputs rather than pasting credentials into pabawi forms. v1.1 adds form-field annotations to surface a vault picker UI for sensitive fields.
- **Output redaction is a cross-integration gap.** Pabawi today has no general-purpose command-output redaction pipeline; Bolt/Ansible stdout flows unfiltered into `ExecutionRepository` and SSE. Swamp output inherits the same behavior. Fixing this is a cross-integration security task tracked separately; this PRD does not pretend to address it.
- **Path traversal hardening.** `SWAMP_REPO_PATH` is `path.resolve`'d and validated at config load: directory exists, contains `.swamp/` subdir. Fail-closed on any violation.
- **Process env scoping.** Swamp CLI invocations use a minimal env: `PATH`, `HOME`, `LANG`, `LC_ALL`, `SWAMP_*`. Other pabawi env vars (DB creds, `JWT_SECRET`, etc.) are not inherited.
- **Bootstrap install gating.** `swamp.bootstrap` permission required to call `POST /api/swamp/bootstrap/install`; `SWAMP_BOOTSTRAP_ENABLED=false` removes the surface entirely.

## 13. Build order & milestones

| Phase | Scope | PR-sized |
|---|---|---|
| M1 | `SwampPlugin` skeleton + `SwampService` CLI bridge + L3 health check + minimum-version pin | 1 PR |
| M2 | `ExecutionToolPlugin` impl: methods + workflows + stdin piping + per-model lock + audit + RBAC permissions | 1 PR |
| M3 | Streaming via CLI stdout (small PR) | small PR |
| M4 | Manifest loader (YAML + Zod + defaults overlay) + `InformationSourcePlugin` impl: inventory projection, facts, per-model cache invalidation | 1 PR |
| M5 | Frontend: input forms for workflow inputs (JSON Schema rendering, narrow scope) | 1 PR |
| M6 | Bootstrap experience: recommended-extensions panel + `POST /api/swamp/bootstrap/install` + audit. Registry verification of curated list. | 1 PR |
| M7 | Reports tab: backend routes + Svelte page, live-read no cache | 1 PR |

Seven phases. Reference-extension authoring deferred to v1.1+ pending gap analysis.

## 14. Test plan

| Layer | Coverage |
|---|---|
| Unit | `SwampService` argv construction, stdin piping, output parse, error mapping. Mock `child_process.spawn` (pattern: `BoltService.test.ts`). |
| Unit | Manifest loader: YAML parse, Zod validation, defaults-overlay merge, per-entry warnings. In-memory fixtures. |
| Unit | Per-model lock: concurrent calls against same model assert serial order; cross-model calls run in parallel. Fake timers. |
| Unit | Cache invalidation logic: spy on cache, trigger method, assert correct keys invalidated. |
| Integration | `SwampPlugin` lifecycle: healthy → degraded → unhealthy transitions under various spawn-mock conditions. |
| Integration | `getInventory()` end-to-end: mocked `swamp data query` JSON → projected nodes → `NodeLinkingService` correlation. |
| Integration | `executeAction()` dispatch: workflow vs method, stdin piping correctness, audit row written. |
| Integration | Bootstrap install route: `POST /api/swamp/bootstrap/install` is RBAC-gated, audited, **spawn is mocked** (never runs `extension pull` in CI). |
| Property (fast-check) | Manifest parser invariants: arbitrary YAML either parses-and-validates or fails with a specific Zod error (no crashes); CEL strings round-trip through serialization without corruption. |
| E2E (Playwright) | Full UI flow against a real swamp + fixture repo. Opt-in via `E2E_SWAMP=1`. Skipped by default in CI. |
| Smoke | Shipped `swamp-manifest.default.yaml` validates against the Zod schema. Catches shipped-broken-defaults at PR time. **Mandatory.** |

**Coverage targets:** `SwampService` and `SwampPlugin` 90%+ line; manifest loader 100%. Routes (`/api/swamp/*`) every route hit by at least one supertest integration test.

**Known coverage gap:** swamp CLI breaking changes between releases are caught only by E2E or manual verification. Mitigated by the minimum-version pin at health-check time.

## 15. Open questions (remaining)

1. **JSON Schema → Svelte form library.** Narrowed in scope to workflow-inputs-only. Library decision (e.g., `@jsonforms/svelte` vs. hand-rolled minimal renderer) deferred to M5 spike.
2. **Manifest schema versioning.** `version: 1` is declared but no migration framework is built. If v2 is needed, accepted that it may be a clean break with a migration utility shipped alongside.
3. **Registry-curated default list final composition.** Subject to verification at M6 — confirm each of `swamp/aws`, `swamp/azure`, `swamp/proxmox`, `@webframp/system`, `@swamp/cve/dirtyfrag` actually exists and is stable in the registry. Substitutions made if needed.

(Originally listed open questions on streaming, multi-repo, reports persistence, and extension distribution are now resolved by the design above or deferred to v2.)

## 16. Risks

- **Architectural overlap (medium).** Swamp and pabawi both touch orchestration. Mitigation: NG1 (no authoring UI), reports-as-live-read (no parallel reports engine), enrichment-as-execution (no parallel data model). Pabawi is a curated execution and visualization surface; swamp owns orchestration definitions and storage.
- **CLI startup latency (medium).** Every `swamp ...` invocation has ~100-300ms startup. Mitigations: per-model inventory cache (30s), facts cache (5min), admin-curated small catalog reduces fan-out, per-model invalidation is narrow.
- **Manifest drift (medium).** Users have to maintain the YAML in sync with their swamp model types. Mitigations: shipped defaults cover ~90% of users, bootstrap UI surfaces gaps, per-entry warnings (not fatal) make drift visible without breaking the integration.
- **Output secret leakage (high but cross-integration).** Workflows may log credentials; pabawi has no redaction pipeline today. Acknowledged in §12 as a cross-integration gap; not addressed by this PRD.
- **Swamp CLI breaking changes (low).** Minimum-version pin + opt-in E2E surface drift early.

## 17. Out of scope (explicitly)

- Swamp model/workflow authoring UI in pabawi.
- Cloud-resources page for non-host artifacts (deferred to v2).
- Vault swap (pabawi keeps its own secret storage).
- Cron/scheduled swamp runs from pabawi (use swamp's own scheduler or external cron).
- Remote swamp (over MCP / HTTP) — local CLI only in v1.
- Multi-tool surfacing within a single pabawi instance (deferred to v2 with multi-repo).
- Inline projection of swamp-produced data onto pabawi node fact columns (e.g., sortable `cve_count` host-list columns) — deferred to v1.1.
- Pabawi-authored swamp extensions (deferred entirely from v1; revisited in v1.1+).
- Cross-integration output redaction pipeline (separate security task).
- Surfacing swamp executions initiated outside pabawi in pabawi audit.

---

*Ready for review. Open questions in §15 are scoped and tractable; risks in §16 reflect the trade-offs accepted during design.*
