# Repository assessment and security-first action plan

Assessment date: 2026-09-09. Repository version: 1.5.0. Assessed commit: `ee7fb20a9e697d248a6fd713031a807cf570ae41`. The working tree was clean at the start. This report records findings and proposed work; it does not implement remediation.

## Remediation verification: 2026-09-10

This section records follow-up verification against the working tree after
`f485312`. The findings below retain their original assessment evidence.

- **I01: implementation verified.** Migration 017 preserves populated SQLite
  authorization and federation relationships. Regression coverage now uses a
  real WAL database, checks failure rollback and restored foreign-key enforcement,
  rejects orphaned references before commit, and restores role/group/federation
  state from a consistent file backup. A disposable PostgreSQL 15 instance passed
  fresh migrations and populated upgrades from both historical 016 variants.
  Already deleted assignments still require operator recovery from a backup.
- **S01: core route authorization implemented and verified.** Production and
  regression tests use the same `mountInfrastructureRoutes` assembly. An
  executable inventory enumerates its routes and rejects anonymous/no-role
  callers, with explicit authenticated exceptions for color metadata and health
  status. The role matrix includes built-in roles, a Bolt-only principal and an
  AWS lifecycle-only principal. It verifies denial before provider dispatch.
  Commands, packages, Puppet runs and batch submissions authorize the selected
  tool; re-execution and cancellation authorize stored tools. Node routes no
  longer inherit unrelated Bolt/Ansible execution gates from earlier mounts.
  The integrations factory requires an authorization policy and has no
  database-free bypass.
- **S01 read scope and UI:** inventory and facts query only permitted sources
  before merging. Scoped inventory neither consumes nor replaces the global
  cache, and response-cache keys include the freshly resolved source scope.
  Stream tickets authenticate only GET requests for their designated execution.
  `GET /api/auth/permissions` exposes the caller's own grants for navigation,
  provisioning forms, lifecycle controls and execution controls. Browser-level
  verification against live providers remains outside this test run.
- **I08: repaired by A17 on 2026-09-11,** recorded below. The generic lifecycle
  routes no longer carry a conflicting static-token/JWT credential contract.
- **I02: implementation verified in the follow-up working tree.** Unique
  migrations 021 (Checkmk) and 022 (Entra repair) converge fresh installs and both
  historical 016 variants. Real-file SQLite fixtures compare the resulting
  schema and preserve federation/OAuth records and authorization assignments.
  PostgreSQL 15 passes fresh migrations and both populated historical upgrades.
  Checkmk repair preserves deliberate grant removals on previously seeded
  installations. The runner rejects conflicting numeric IDs across dialects
  and verifies SHA-256 checksums for newly applied migrations before proceeding.
  Legacy history remains explicitly unverified, with null checksums. Upgrade
  guidance requires clean release files to avoid stale compiled SQL collisions.

- **A05 / S03: implemented.** Access JWTs require purpose and validated claims;
  refresh JWTs fail REST, SSE and MCP JWT authentication. Pair issuance shares
  an account version so revocation between issuance steps cannot produce a fresh
  refresh credential. The upgrade deliberately requires fresh login.
- **A05 / S04: revocation foundations implemented.** Migrations 023-025 persist
  opaque account versions, a shared authorization revision and console account
  bindings. Database triggers change revisions atomically with password/status
  and RBAC mutations. Every cache lookup verifies the database revision across
  instances/connections. Random revisions prevent rollback-value reuse. SSO
  issuance and code exchange check account/session validity. Protected SSE and
  console deliveries revalidate, and idle sessions poll every second. A live
  local WebSocket regression verifies both ends close after deactivation.
  MCP opening credentials also revalidate. S02/A06 was subsequently repaired
  as recorded below; the other console lifecycle and SSO findings remain open.

Validation: full backend suite passed (3,501 tests, 12 skipped, 1 todo); full
frontend suite passed (999 tests). The separate PostgreSQL run passed eight
integration tests and two populated-upgrade tests. Lint and the complete build
passed, with existing frontend accessibility and bundle-size warnings. The
additional frontend `tsc --noEmit` check reports 14 missing `global` declarations
in unchanged test files; it reports no errors in the changed files.

I02 follow-up validation: full backend suite passed (3,511 tests, 12 skipped,
1 todo). A disposable PostgreSQL 15 instance passed eight adapter/fresh-migration
tests and both populated historical-016 upgrades. Backend lint, backend
TypeScript checking and `git diff --check` passed. No production database was
used. Frontend, image and cluster checks were not repeated for this tranche.
A05 follow-up validation: full backend suite passed (3,539 tests, 13 skipped,
1 todo). PostgreSQL 15 passed fresh migrations, both historical-016 populated
upgrades, and independent-connection revocation/rollback tests. SQLite also
passed the independent-connection tests. Live local SSE and fake upstream
WebSocket tests verified revocation closure. Backend lint, backend TypeScript
checking and `git diff --check` passed. No production providers or databases
were used. A06 verification follows; the remaining findings retain their
existing status.

- **A06 / S02: implemented and verified.** Production mounts the same MCP router
  exercised by HTTP regressions. Tool authorization uses the session caller:
  personal JWTs retain their own grants and only static-token authentication uses
  `mcp-service`. POST, GET and DELETE reject another user or authentication method,
  including JWT/static crossover for the same account. Opening credentials are
  revalidated on continuation, before and after tool work, and while idle.
  Inventory and facts query only permitted sources; source removal during a query
  suppresses its result. Per-account limits include pending initialization and
  both authentication methods, alongside the process cap and session TTL.
  Failed initialization, deletion, revocation, expiry and shutdown release sessions.
  Structured logs attribute tool decisions and session boundary events to user ID
  and authentication method without recording credentials or tool arguments.
  The MCP guide now explains ownership, limits and effective role/group unions.

A06 validation: full backend suite passed (3,555 tests, 13 skipped, 1 todo),
including 13 new production-router security regressions, two in-flight result
checks and provider-level facts isolation. Backend lint, TypeScript checking,
backend build and `git diff --check` passed. These tests use disposable SQLite databases and local HTTP transport;
no production providers, databases or external services were exercised.
PostgreSQL, frontend, container and cluster checks were not repeated.

- **A07 / S06: implemented and verified.** Migration 026 introduces explicit
  `rbac:admin` authority, seeded only to the built-in Administrator role. Legacy
  user/group/role/permission editing grants do not confer entitlement authority.
  User-role assignments, group memberships, group-role assignments, role-permission
  changes, role creation/update/deletion, group deletion, permission creation and
  administrator-status changes require the new permission. Role naming shares
  this boundary because SSO mappings resolve roles by name. Profile and group
  metadata editing retain their existing gates. Entitlement administrators may
  delegate permissions they do not hold and assign roles to themselves; the
  existing prohibition on changing one's own administrator flag remains.
  Successful mutations persist actor and affected IDs in the audit log; denied
  permission checks persist authorization failures. UI entitlement controls use
  the new permission. The RBAC guide documents migration and delegation policy,
  including the separate sensitive account-recovery authority of `users:admin`.

A07 validation: full backend suite passed (3,562 tests, 13 skipped, 1 todo),
including seven new security regressions covering the real route factories,
16 mutation cases across anonymous/no-role/legacy-management callers, unchanged
state after denials, direct and group-derived delegation, audit attribution and
revocation. Full frontend suite passed (999 tests). PostgreSQL 15 passed ten
fresh-migration/adapter and populated historical-016 upgrade tests. Lint, complete
build and `git diff --check` passed. Existing frontend accessibility and bundle
warnings remain. Tests used local HTTP transport, disposable SQLite databases
and a disposable PostgreSQL container. Live browser/provider and cluster checks
were not performed. A08 remains the next action.

- **A08 / S07 and the SSO portion of S08: implemented and verified.**
  Federation lookup includes issuer and subject; email collisions cannot link
  accounts. Explicit enrollment requires both `rbac:admin` and `users:admin`
  and records actor and target identity. OAuth state and final codes require
  the initiating browser's HttpOnly cookie; stored records contain its digest.
  Conditional claims admit exactly one callback and one final redemption,
  including across independent database connections. Inactive/revoked accounts
  fail callback or redemption. Signed fake-provider regressions cover email and
  issuer collisions, absent/different browser bindings, concurrent attempts,
  inactive accounts, malformed groups and both Entra overage markers.
- **A08 group reconciliation:** migration 027 stores provider grants separately
  from manual grants, and effective authorization includes both. Reconciliation
  is atomic and serializes each account across connections. Missing groups and
  removed mappings clear provider grants; overage/malformed claims also deny
  login when mapping is enabled. Failed reconciliation cannot issue a session.
  Existing direct grants on federated accounts have no trustworthy provenance:
  migration 027 marks them for removal at the next reconciliation, followed by
  the current mapping. Administrators must review and explicitly regrant intended
  manual assignments as documented in the Entra guide. Old in-flight logins must
  restart because they lack browser binding. Entra changes are observed at login;
  this does not implement continuous Graph synchronization.
- **I03 / A12 transaction ownership prerequisite: implemented and verified.**
  Transactions use callback-scoped async ownership. SQLite excludes unrelated
  queries for the whole transaction; PostgreSQL reserves separate pooled clients.
  Nested/overlapping transactions within a reservation and detached work from an
  ended transaction are rejected. Migrations hold an exclusive adapter reservation
  around inspection, transactions and SQLite foreign-key restoration. Tests prove
  unrelated writes survive rollback, concurrent transactions retain separate
  ownership and maintenance excludes ordinary queries. This reservation is local
  to an adapter; installations still require one migration process. Distributed
  migration coordination and execution/session ownership are not established.

A08 validation: full backend suite passed (3,565 tests, 19 skipped, 1 todo);
full frontend suite passed (999 tests). A separate run against disposable
PostgreSQL 15 passed 24 database tests, including SQLite/PostgreSQL transaction
ownership, independent-connection SSO provisioning/redemption and grant revocation,
fresh migrations, populated historical-016 upgrades, and authorization-state
checks. Lint, complete build and `git diff --check` passed. Existing frontend
accessibility and bundle warnings remain. Tests used local HTTP, a signed fake
identity provider, disposable databases and a local PostgreSQL container.
No real Entra tenant, production account, provider or cluster was exercised.
Console ticket redemption was subsequently completed by A15, recorded below. A09 is the next action.

- **A09 / S05: implemented and verified.** SSH checks the raw server key against
  an operator-managed SHA-256 fingerprint map keyed by destination hostname and
  port. Unknown and changed keys, absent configuration and invalid/unreadable
  trust files fail before authentication. Inventory aliases use the destination
  HostName and Port. URI ports, IPv6 and pool identity share endpoint parsing.
  Explicit insecure opt-out remains available with a warning. This supports
  fingerprint enrollment, not OpenSSH known_hosts or host certificates. Operators
  verify and audit enrollment through trusted configuration management. Trust
  file changes affect new handshakes; restart to close existing pooled sessions.
- **A09 / S12: implemented and verified.** Initial enrollment requires the
  installation-specific `PABAWI_BOOTSTRAP_TOKEN` header credential, exposed in the
  setup form as a password input. Missing configuration disables enrollment.
  A unique database claim, account creation and configuration save commit together.
  Migration 028 preserves completion for existing administrators. Completion
  persists after account deactivation or administrator-status removal. Failed
  saves roll back and permit retry. Independent SQLite and PostgreSQL connections
  verify one concurrent winner, rollback visibility and legacy upgrade closure.
  The setup script generates an independent token and restricts its environment
  file to mode 0600. Operator guidance covers private first start and recovery.

A09 validation: 83 focused SSH/setup regressions passed, including real loopback
SSH handshakes. The full backend run passed 3,578 tests with 20 skipped and one
todo, but failed one unchanged logging field-order property test. Its generated
component and operation were identical (`?`), so `indexOf` matched the same field;
seed `574637843`, path `41:0:0:5`. That file's 13 tests passed on a separate rerun;
the full run is not recorded as green. The full frontend suite passed 999 tests,
and the subsequently added setup-form credential regression passed separately.
PostgreSQL 15 passed 18 adapter/bootstrap/fresh-migration/historical-upgrade tests;
the extended independent-connection rollback tests then passed on both dialects.
Lint, backend TypeScript, complete build, setup-script syntax and diff checks
passed. Existing frontend accessibility and bundle warnings remain. Tests used
disposable databases and local fake SSH/HTTP servers; no production infrastructure
or real deployment was exercised. A10 is the next action.


- **A10 / S10: build controls implemented; release remains blocked.** Development,
  CI and all image variants use Node 24.21.0 with digest-pinned container bases.
  Root-locked workspace installs preserve security overrides and dependency
  placement. A workspace-aware runner validates the existing script allowlist
  before running approved native builds; unknown scripts fail before execution.
  Regression tests cover nested/workspace scripts, explicit denial and failure.
  Image checks cover actual native modules, Bolt task discovery, migrations,
  frontend delivery and anonymous request denial. CI compares independent clean
  dependency installations and retains artifact SBOMs and advisory reports.
  Release jobs scan and smoke-test each architecture before pushing the same image.
- **A10 scan disposition:** patched tar, brace-expansion and smol-toml overrides
  remove the critical root npm-audit finding. Remaining image advisory matches
  block publication: Bookworm has 16 critical/125 high occurrences, Alpine 14 high,
  and Ubuntu eight high. No suppressions were added. Distribution repositories
  and Ruby transitive dependencies remain mutable, so full-image reproducibility
  is not established. See the [artifact scan review](a10-artifact-scan-2026-09-10.md)
  and [build policy](../deployment/supply-chain.md) for evidence and remaining work.

A10 validation: backend passed 3,579 tests (20 skipped, one todo), frontend passed
1,000 tests, and four script-policy regressions passed on Node 24. All three
arm64 images built and passed smoke checks; their installed npm graphs matched
independent uncached installations, including the security overrides. Trivy
scanned exported images and generated CycloneDX SBOMs. The remote release
workflow and amd64 runtime were not exercised locally. No production provider,
live database, image publication or deployment was involved.

A10 final static checks: lint, backend TypeScript, shell syntax, shellcheck,
workflow YAML parsing and `git diff --check` passed. The first lint attempt
was killed with exit 137 under concurrent image/test load; the isolated rerun
passed. Existing frontend build warnings remain. ClamAV completed the downloaded
artifact scans with no infected files reported; advisory gates remain blocked.


**A10 follow-up, 2026-09-11:** targeted npm updates now pass the high/critical audit
threshold (eight moderate and two low findings remain). The Ubuntu image uses a
frozen Ruby bundle and a tested local WinRM FS source migration to RubyZip 3.6.
Its exported-image scan reports no critical/high findings, with 60 medium and
ten low occurrences remaining. The backend/frontend suites and image smoke tests
pass. A second uncached Ruby build produces the same dependency inventory.
The default Bookworm release image remains blocked; other variants were not
rescanned in this follow-up. See the [follow-up evidence](a10-follow-up-2026-09-11.md).

- **A12 / I03: execution storage ownership implemented and verified.**
  Re-execution creation runs the original-record check, the child insert and the
  parent counter increment in one transaction, and advances the counter in SQL
  instead of reading it into the process and writing it back, so two concurrent
  re-executions of the same original are both counted. A failed counter write
  discards the child instead of leaving it unaccounted. Batch cancellation
  applies the child and parent status writes in one transaction, so no reader
  observes cancelled children under a running batch and a failed parent write
  leaves the batch uncancelled. This governs stored records only. Batch
  admission ordering and cancellation of queued and in-flight work remain with
  A13. Console ticket redemption, where validation and the unconditional
  consuming update were still separate statements so two concurrent upgrades
  could claim one token, and the console session quota check, which was still a
  check-then-act across a provider call, were completed by A15. Cross-process
  migration coordination stays out of scope and belongs with A21.

A12 validation: three of the four new dialect-parametrized storage-ownership
regressions fail against the previous code, and all four pass on both dialects.
The fourth is a guard on a missing original and passes either way. The lost
re-execution count
reproduces deterministically on SQLite; the same interleaving did not occur
against PostgreSQL in this environment, so that one case is a non-regression
check there rather than a reproduction, while both rollback cases reproduce on
both dialects. The full backend suite passed 3,583 tests with 24 skipped and one
todo. All 21 database test files passed against a disposable PostgreSQL 15
container. Backend lint, backend TypeScript and `git diff --check` passed. No
production database, provider, deployment or live execution was exercised.

**A11 / S11 and I09 hook prerequisites, 2026-09-11: implemented and verified.**
Chart-managed configuration and Secret checksums trigger same-image rollouts.
Generated JWTs resolve once per render and reuse the installed Secret on an
unchanged upgrade. Reserved checksum annotations cannot be overridden. External
Secrets have a documented explicit restart or GitOps revision procedure. SQLite
always uses Recreate, and PostgreSQL Recreate removes inherited rolling-update
fields. A separate, earlier ServiceAccount hook supplies the migration Job's
fresh-install prerequisite; externally supplied accounts and credentials must
already exist. Hook annotations cannot override ordering or retention controls.
The chart now retains its locked PostgreSQL dependency during rendering and
packaging instead of excluding its archive through `.helmignore`.

A11 validation: six render regressions, chart lint, packaged-chart rendering,
script syntax, workflow YAML and diff checks passed. A disposable arm64 kind
cluster running Kubernetes 1.37.0 and PostgreSQL 15 passed the production chart's
fresh migration hook, unchanged upgrade with generated-JWT/pod preservation,
same-image JWT/MCP/policy rotation, and external-Secret activation by explicit
restart on persistent SQLite. Old access JWTs and MCP credentials returned 401;
old refresh JWTs returned the API's 400 `INVALID_REFRESH_TOKEN`. New login and
MCP credentials worked, `/api/config` exposed the replacement command policy,
old application pods were gone, and the SQLite account survived replacement.
The test used the previously scanned A10 Ubuntu candidate
`sha256:8c2b9dbd073626298153d598ef2959eb6800d8fcf853d7ec255b6fff8a085271`.

The [chart guide](../../charts/pabawi/README.md) documents maintenance windows,
session/token effects and the single-process baseline. The
[cluster runner](../../scripts/deployment/cluster-smoke.mjs) preserves disposable
resources for inspection; CI now runs the separate chart render regressions.
ClamAV reported no infected files in the downloaded kind executable, node image
archive or chart dependency. No production provider, real account, publication
or deployment was exercised. Application source did not change, so full backend
and frontend suites were not repeated. Command dispatch after policy rotation,
amd64, live cloud credentials, bundled PostgreSQL startup, multi-replica recovery
and remote CI execution were not validated. A10's default-image release block
remains. A12 transaction ownership is already recorded above.

**A13 / I04, 2026-09-11: implemented and verified.** Batch admission reserves
capacity and commits the parent and every child atomically before asynchronous
dispatch. HTTP admission returns stable IDs while provider work remains blocked.
Children retain the submitting user and execution tool; queued children have no
start timestamp. History includes queued, cancelled and interrupted work.

Queued cancellation prevents provider dispatch, including races with slot release.
Dispatched work retains its actual outcome and a durable cancellation-request
timestamp. Both batch and individual cancellation responses distinguish removed
queued work from running work. The UI uses authenticated cancellation requests,
continues polling until terminal status, and displays cancelled and unknown
outcomes accurately. Current plugins have no abort contract for dispatched work.

Single-process shutdown waits for admissions already persisting before reconciling.
Startup and shutdown cancel undispatched batch work and mark uncertain dispatched
work interrupted, without automatic replay. Migration 029 preserves populated
history while adding the lifecycle states, timestamps, attribution and counters.
The [API guide](../api.md) documents admission, cancellation and recovery semantics.

A13 validation: 3,600 backend tests passed (39 skipped, one todo), and all 1,003
frontend tests passed. All 30 focused lifecycle and populated migration tests
passed across SQLite and a disposable PostgreSQL database, including database
reopening, rollback, concurrent admission, cancellation races, shutdown during
admission and provider failure outcomes. HTTP regression coverage verifies prompt
admission and truthful cancellation with blocked providers. Component tests cover
continued polling, cancellation errors and stale responses after switching batches.
Build, lint and diff checks passed. Existing frontend accessibility and bundle-size
build warnings remain. No live provider, production database, publication or
deployment was exercised. Multi-process ownership and direct-route concurrency
remain outside this batch contract; A14 retry/idempotency is the next execution
correctness action.

**A14 / I05, 2026-09-11: implemented and verified.** The transport retry budget is
derived from the request method: safe methods retry, non-idempotent ones do not
unless the request carries a durable idempotency key. Explicit budgets still win,
and no mutation caller now relies on an unsafe default.

An authenticated replay after a token refresh is no longer a retry. It is a
call-scoped one-shot, so a zero-retry mutation performs exactly one replay with
the refreshed token, a refused replay surfaces the server's own error instead of
a generic retry-exhausted message, and the retry budget of the replayed request
stays intact.

Batch and multi-node Puppet run admission accept `Idempotency-Key`. The key and
the work it admits are claimed in one transaction through a conflict-tolerant
insert, so a lost response can be resent without admitting a second batch or a
second set of runs, a failed admission releases the key, and a replay dispatches
nothing and returns the original identifiers. Keys are scoped per user and per
route and carry a request fingerprint, so a reused key is refused rather than
answered with another submission's outcome. Replayed submissions release the
queue capacity they reserved. Puppet run records are now persisted together
before any provider work starts, at the cost of holding SQLite's exclusive
connection for the whole target list; that route still has no target limit and
still bypasses the execution queue, so it cannot reject an oversized submission
the way batch admission does. Migration 030 adds the store. Startup purges keys
older than 24 hours, so a long-running process keeps its keys until the next
restart rather than expiring them on a timer.

A14 validation: 3,626 backend tests passed (56 skipped, one todo) and all 1,015
frontend tests passed. The 17 new service and HTTP idempotency tests pass on
SQLite and on a disposable PostgreSQL 15 database, including concurrent duplicate
submissions, rollback key release, cross-user isolation, fingerprint conflicts and
retention. Seven of the nine HTTP contracts and nine of the twelve transport tests
fail against the previous code, including the reported zero-retry authenticated
replay defect, which reproduces as `Request failed after maximum retries`.
`ON CONFLICT DO NOTHING` was verified on both dialects to report zero affected
rows, to leave the surrounding transaction usable, and to wait for a concurrent
submission to commit or roll back, so no dialect-specific unique-violation
discriminator is needed. Backend and frontend TypeScript, backend and frontend
lint and `git diff --check` passed; a stale `AggregatedResultsView` test fixture
that broke the frontend typecheck under A13 was repaired at the same time.

Durable keys cover the two admission routes named in the finding. The provisioning
routes (AWS, Azure, Proxmox) and every other mutation are protected by the
zero-retry default alone; every explicit retry budget in those clients was audited
and already applies only to reads. Batch group expansion and target validation
still run before the key is claimed, so a resend whose targets have since left
inventory receives `INVALID_NODES` instead of the batch it already holds; the
response depends on the expanded list, so the order cannot simply be swapped.
Multi-process key ownership, direct-route admission, shared admission for the
Puppet run route and the untracked dispatch of its workers remain outside this
change and belong with I11. No live provider, production database, publication or deployment was
exercised.

**A15 / I06, S08 console portion and S09, 2026-09-11: implemented and verified,
except provider compatibility.** A connection broker now carries a provider's
upstream material to the WebSocket relay and owns the live relays. The material
stays in memory, is claimable exactly once, expires with the session token and is
never persisted or logged, because a Proxmox console URL embeds a live ticket.
The `console_sessions.upstream_url` column is retired and always null.

Session capacity is reserved before the provider is asked for anything, so no
provider resource exists for a session the cap did not count. The reservation
holds the slot while the provider works, a provider failure releases it at once,
and concurrent requests for the last slot admit exactly one. Providers no longer
mint session identity, tokens or transports: those come from the reservation, so
a provider cannot create a session the database does not know about.

Ticket redemption is a single conditional update carrying the unconsumed flag,
the live state and the age bound, so concurrent upgrades admit exactly one and a
replay opens no second upstream. It is also the only upgrade path left: the two
read-then-decide validators it replaced are deleted rather than deprecated, so
nothing can be wired back through the split S08 named. `getActiveSessionCount`
survives for reporting and is documented as narrower than the cap, which counts
reservations too; admission is decided only inside the reservation.

Terminating a session closes both ends of its relay, releases the provider-side
session and records the state, rather than doing only the last: owner
termination, administrator termination, heartbeat expiry, restart cleanup,
account deactivation and process shutdown all do all three. Provider cleanup
reaches the provider through a bridge supplied by the composition root, because
the session manager owns the transitions and has no plugin registry; without it
a provider kept every session for the process lifetime and kept reporting it as
active. A relay is registered before the upstream dial rather than after, so a
termination during the dial closes the upstream that subsequently opens instead
of leaving it to the next authorization poll. Termination writes started by a
socket event are tracked and drained during shutdown, so the sockets closing and
the database closing no longer race. Reading a session's status and extending its
heartbeat now require owning the session or holding `console:admin`, and a
heartbeat cannot touch a session that is no longer live.

A15 validation: 3,669 backend tests passed on SQLite (56 skipped, one todo) and
3,723 against a disposable PostgreSQL 15 database; all 1,015 frontend tests
passed. Twenty-five new lifecycle tests run through the real route, session
manager, broker and proxy against a local WebSocket upstream, covering
bidirectional frame relay, unreachable and absent upstreams, concurrent and
replayed ticket claims, expired tickets, terminated sessions, every termination
path including provider release and the drained shutdown write, revocation during
an upstream dial, cross-user denial and capacity reservation. Fifteen broker
tests cover single-use claims, expiry, purging and revocation, and the token
property tests now target the claim, including that a refusal leaves a dead
session's ticket unconsumed. Five probes confirmed the defects in the previous
code: a created session had no upstream URL, two concurrent validations both
succeeded for one ticket, concurrent creation reached the cap plus three, a
heartbeat wrote to a terminated session, and no socket registry existed.

Backend and frontend TypeScript, backend and frontend lint, build and
`git diff --check` passed. The terminated-session upgrade refusal that S09
reported was already closed by A05's session-version check; it now has an
explicit regression test rather than only an incidental one.

Proxmox compatibility is **not** established: the endpoint, port and
authentication were exercised only against a fake upstream, so I06's requirement
to validate against an actual test provider is outstanding and the console should
not be treated as production ready. Console sessions remain process-local, which
keeps the single-process baseline from I09/A21. No live provider, production
database, publication or deployment was exercised.

**A16 / I07, 2026-09-11: implemented and verified.** A `complete` event now
means the run finished, not that it succeeded. The SSE client takes the terminal
status from the payload, which every emitter already carried, and the emitter's
signature requires it, so a completion cannot arrive without one. A payload with
no status is treated as a failure rather than a success, and the five callers
that announced success for every completion (Puppet, task, package, playbook and
node command, in both their streaming and polling paths) now report what the run
reported. Partial, cancelled and interrupted runs are included: the previous
code recognised only `failed`, and the stream route replayed only `success` and
`failed`, so a client subscribing to an already-cancelled run waited for an
event that never came. `TERMINAL_EXECUTION_STATUSES` names the set once for both
sides. A status badge given an unrecognised status renders it instead of
throwing.

Output state is released unconditionally. The delayed teardown used to return
early when the subscriber set was already gone, which is the normal case because
the client disconnects first, leaving a buffer and an output counter per
execution for the process lifetime. The same early return leaked the per-IP
connection slot for every stream the server closed itself, and ten of those
locked a client out of streaming entirely. A sweep on the heartbeat tick covers
the remainder: an execution abandoned without any terminal event. Retained
output state and tracked connections are both reported through
`/api/streaming/stats` so the condition is observable rather than inferred.

The viewer that displays streamed output needed the same widening: its
running/complete split recognised only success and failure, which was
exhaustive only because the client used to report success for everything. A
cancelled or interrupted run was therefore neither running nor complete, showed
a "Running" badge, reported no duration and left its elapsed timer running.

Flush latency is bounded. The buffer timer was restarted on every chunk, so a
continuously producing run streamed nothing until it went quiet; a pending flush
is now left alone and the bound is the buffer interval measured from the first
buffered chunk. Terminal paths clear the timer instead of leaving one scheduled
against released state.

The two remaining parts of I07's action were found already closed and were
verified rather than reimplemented: `?ticket=` is resolved by a dedicated
pre-auth mount ahead of both `/api/executions` chains, and redemption checks the
ticket's stored execution against the requested path and method. Both are
covered by existing tests in `route-authorization.test.ts` ("issues a ticket and
redeems it on the stream endpoint without an Authorization header" and the S01
group asserting a ticket cannot authenticate another execution or operation).

A16 validation: 3,683 backend tests passed on SQLite (56 skipped, one todo) and
3,737 against a disposable PostgreSQL 15 database; 1,042 frontend tests passed.
Fourteen new streaming lifecycle tests cover state release on every path, the
abandoned-state sweep, flush latency under continuous output, coalescing, the
per-IP slot through a real socket, and terminal replay for all five terminal
statuses; twenty-seven new frontend tests cover the status helpers, the client's
terminal handling, the Puppet component's reporting and the output viewer's
rendering of every terminal status. Five probes confirmed the defects in the
previous code: a disconnect before completion left a buffer and a counter
behind, a server-closed stream leaked its connection slot, 400 ms of continuous
output produced no flush at all, a completion without a status was displayed as
success, and a cancelled run rendered as running. Backend and frontend lint and TypeScript passed.

Not in scope for A16: the polling fallbacks still poll rather than reconnect,
and per-execution output state remains process-local. No live provider,
production database, publication or deployment was exercised. A17 is the next
action.

**A17 / I08, 2026-09-11: implemented and verified.** The generic lifecycle
endpoints have one credential model, and they work. `PABAWI_LIFECYCLE_TOKEN`
was required in `Authorization` on top of the JWT the production mount already
required in that same header, so neither credential satisfied both checks:
through the assembled chain an administrator's `POST /api/inventory/:id/action`
and `DELETE /api/inventory/:id` were refused with 401, and the token itself was
refused as an invalid JWT signature. The token is now an alternative
credential, matched ahead of JWT verification the way `MCP_AUTH_TOKEN` already
was, and it authenticates a provisioned `lifecycle-service` account rather than
granting anything by itself. `PermissionService` is therefore the single
authorization authority for both principals, and no permission middleware can
return allow without consulting the database.

The machine account's scope is explicit and adjustable: a built-in "Lifecycle
Service" role holding `read`, `lifecycle` and `destroy` on `proxmox`, `aws` and
`azure`, provisioned only when a token is configured, reused as it stands on
later starts so operator edits survive, and revocable by deactivating the
account. It is the account's only role: account creation attaches the
configured default role, which would have let the credential read every source
a Viewer can read, so that assignment is dropped during provisioning. The
credential is mounted on `/api/inventory` alone and is refused on every other
route. Provisioning is deliberately not granted.

One classification now decides both which permission an action requires and
whether the discovery endpoint calls it destructive. The two lists disagreed:
`terminate_instance` was advertised as non-destructive while being gated as a
destroy. Providers are an allowlist (`proxmox`, `aws`, `azure`) rather than any
registered execution tool, because node IDs also carry command-tool prefixes
and that route bypasses the command whitelist. Within a provider the advertised
capabilities are the contract: an action the provider does not publish is
refused before dispatch, and `DELETE` takes the destroy action from the
provider's own capabilities, so Azure is refused because it has no destroy
capability rather than because the route had never heard of Azure. Azure nodes
previously failed as an unknown provider.

A17 validation: 3,708 backend tests passed on SQLite (56 skipped, one todo) and
3,762 against a disposable PostgreSQL 15 database; 1,042 frontend tests passed.
Sixteen new route tests run through `mountInfrastructureRoutes` with the real
authentication and RBAC middleware, covering the authorized JWT, the
under-scoped JWT, the machine credential with no JWT, a wrong credential, no
credential, the account's exact role and source scope, deactivation of the
machine account, refusal on other mounts, and the discovery/execution agreement
including the Azure destroy refusal. Ten unit tests cover the classification
table and the account's provisioning, default-role strip and reuse.
The router-level regression in `jazzy-launching-wombat-regressions.test.ts` was
rewritten: it asserted the old second-credential gate through a mount that had
no authentication in front of it, so it would have passed over a fix that left
the assembled app broken. Five probes confirmed the defects in the previous
code: an administrator's action and destroy were both refused with 401, the
machine token was refused as an invalid JWT, `terminate_instance` was advertised
as non-destructive, and an Azure node resolved to no provider. Two further
probes confirmed that, without the default-role strip, the machine account held
Viewer alongside its own role and read bolt-sourced inventory. Backend lint and
TypeScript and the full build passed, with the existing frontend bundle-size
warning.

Not in scope for A17: the frontend still dispatches lifecycle actions to the
Proxmox provider routes directly instead of the provider-agnostic endpoints it
already uses for discovery, so the generic path remains machine- and
script-facing. Azure gained no destroy capability. No live provider, production
database, publication or deployment was exercised. A18 is the next action.

**A18 / I10, 2026-09-11: implemented and verified.** The gates that mattered
existed but nothing ran them. Three of I10's four acceptance conditions were
already satisfied by earlier actions: the assembled-app authorization matrix
(A03), real-file populated migration fixtures for both dialects (A04), and fake
upstreams proving console and execution lifecycle behaviour (A13/A15/A16). The
migration and dialect work only ran when a maintainer happened to have a
PostgreSQL server reachable, so CI now runs the backend suite against a
PostgreSQL 15 service as well as SQLite.

The fourth condition had nothing behind it. `eslint` ignores `**/*.svelte` and
`tsc --noEmit` never parses component markup, so a type error inside a component
passed lint, both typechecks and the build. `npm run check:components` runs
`svelte-check` and compares the result with a recorded baseline keyed by file
and message rather than line number: the 163 errors the components already carry
are tolerated and anything else fails. Clearing them is a separate change
touching around fifty components with no behavioural coverage, which is not what
this action is for; the baseline makes the debt visible and stops it growing.

The E2E suite was a single unauthenticated smoke test running on whatever
database and inventory the developer happened to have. It now isolates the app
under test (scratch database, `NODE_ENV=test` so no `.env` is read, Bolt
unconfigured, one queue slot) and seeds an administrator through the API. The
inventory is two SSH hosts that are unreachable in two different ways: one
refuses the connection in about a millisecond, giving a deterministic terminal
failure, and one points at a port a test opens itself with a listener that
accepts and then never writes, so the SSH handshake waits for a banner that
never arrives and work stays running for exactly as long as the test holds it.
That is what makes a queued execution observable without a race. Three
authenticated tests assert prompt admission, that a failed run is displayed as
failed rather than as success, and that a queued execution cancelled from the UI
is reported cancelled. The suite runs in about six seconds and is a CI job.

The pre-commit secret scan excludes `docs/`, `backend/test/`, frontend test
files and `e2e/`, so a credential under any of those paths passed every local
check. A CI job scans the whole tracked tree against the reviewed baseline,
which grew from 32 to 63 files; every added finding was read and is a test
credential, a chart placeholder or a documentation example.

A18 validation: five probes confirmed each gate behaves as claimed. A
deliberate type error in a component passed `eslint` and both `tsc --noEmit`
runs and was caught only by the component gate. An AWS-shaped key added under
`docs/internal/` was caught by the secret scan and passed the pre-commit
exclusion. The three authenticated E2E assertions were each inverted and each
went red, so none of them is the false green that got the previous flow suites
deleted. A spec whose name matches no project convention was added and confirmed
to still run, because a suite that silently does not run is the same false
green. The backend suite passed 3,708 tests on SQLite and 3,762 against a
disposable PostgreSQL 15 database; 1,042 frontend tests, lint, both typechecks,
the component gate and the build passed, and the E2E suite passed from an empty
database.

Not in scope for A18: component *lint* (`eslint-plugin-svelte` and un-ignoring
`**/*.svelte`) would surface a fresh error class on top of the 163 recorded
type errors and is left for the cleanup that clears them. Console lifecycle has
no browser test: it needs a provider, and its fake-upstream coverage lives in
the backend suite. Helm installation is still only rendered and linted, not
installed, in CI. The new CI jobs are verified by their local equivalents; they
have not yet run on a GitHub runner. A19 is the next action.

**A19 / D01-D10, 2026-09-12: documentation corrections and drift gates implemented.**
Public guidance now preserves failed databases, describes mandatory access-JWT
authentication and its explicit exchanges/machine-credential exceptions, separates
PuppetDB upstream credentials, and explains Checkmk Livestatus history and REST
fallback fidelity. `CHECKMK_SSL_VERIFY` applies to REST and TLS Livestatus; REST
health alone does not establish history connectivity. Configuration tables cover
both ConfigService and the SSH parser, with defaults, units/conditions and secret
classification. Azure, Livestatus and console environment examples are included.

Architecture and contributor guidance now name actual registry constructors and
priorities, service paths, execution entry points, console ownership and the
single-process baseline. The API guide corrects nonexistent provider, package and
RBAC assignment paths. Deployment examples use consistent working directories,
state Compose's all-interface defaults, include bootstrap ownership, and explain
that a pre-upgrade hook does not stop the old application.

OpenAPI is version 1.5.0 with explicit public exchanges, bootstrap header security,
SSO/browser binding, Checkmk routes, lifecycle credentials and execution stream
issuance/redemption. It no longer advertises nonexistent endpoints. The new
[coverage inventory](../api-contract-coverage.md) accounts for all 188 statically
discovered REST method/path pairs: 123 specified and 65 intentional omissions,
including aliases and remaining provider/console/diagnostic payload schemas.
This is not complete client-generation or response-schema conformance coverage.
The six documentation checks fail on unknown/stale routes, missing variables,
version drift, dangling references, path-parameter errors and credential-contract
drift. CI invokes them. Dynamic mounts need an inventory-reader extension; MCP,
WebSocket upgrades and SPA responses are explicitly outside the REST inventory.

A19 validation: all 383 focused backend tests passed on Node 24.21.0, covering
assembled authorization and SSE tickets, bootstrap, local auth/refresh, SSO,
Checkmk routes/fallback/TLS and real-file migration recovery. All six documentation
checks and six chart regressions passed. Three deliberate documentation mutations
(nonexistent route, omitted variable and incorrect version) each failed the gate.
The documented SQLite `.backup` command retained committed WAL account, role,
group and federation records; copying the live database alone omitted them.
Both documented/repository Compose configurations validated using synthetic
credentials, and SQLite/external-PostgreSQL chart configurations rendered locally.
Thirty public/contributor Markdown files had no missing relative file targets.
Workspace lint, a separate JavaScript lint check for the new scripts and diff
checks passed. The repository TypeScript ESLint configuration does not include
standalone `.mjs` scripts, so those used ESLint's JavaScript recommended rules.
Tracked-tree and new-file secret scans passed without baseline changes; ClamAV
reported zero infected files in the isolated downloaded scanner environment.

Application code and dependency locks are unchanged. Full backend/frontend suites,
builds, live provider/browser workflows, PostgreSQL runtime, image startup and
cluster installation were not repeated for this documentation tranche. Existing
A10 release gates and A15 provider-compatibility limits remain; the new CI step
has not run remotely. A20 is the next action.

## Executive assessment

The principal risk is inconsistent enforcement at trust boundaries. Authentication and RBAC infrastructure exist, but several infrastructure-changing routes enforce authentication without authorization. AWS, Azure, Proxmox and Puppetserver handlers can therefore exercise server-held credentials on behalf of users who lack the corresponding permissions. Hiera data and execution output have related read-access gaps. This is especially serious where self-registration is enabled.

Other high-priority findings include MCP permission checks under the wrong principal, refresh tokens accepted as API access tokens, ineffective permission-cache invalidation, missing SSH host-key verification despite the setting being enabled, and unsafe SSO account linking. Database upgrades require equally urgent attention: migration 017 deletes existing SQLite role assignments, while duplicate migration ID 016 selects different features on different database backends.

The plugin registry, database adapter interface, Zod validation, structured logging and substantial test inventory are useful foundations. The appropriate response is to repair authorization and execution lifecycle contracts, then consolidate their implementations. A broad rewrite would delay the highest-value fixes.

Treat this snapshot as unsuitable for a shared, low-trust infrastructure management deployment until the P0 and relevant P1 gates below pass. This is an engineering release recommendation based on the identified paths, not evidence of a compromise.

## Scope, evidence and limitations

This was a repository-wide, risk-based assessment covering backend routes and services, frontend state and execution flows, database migrations, integration boundaries, build/deployment configuration, tests, and public/internal documentation. It is not a claim that every line or every provider operation was manually verified.

The tracked inventory includes 195 files under `backend/src`, 221 under `frontend/src`, 209 under `backend/test`, 56 under `docs`, 12 under `scripts`, 18 under `charts`, and two under `e2e`. Backend TypeScript and frontend TypeScript/Svelte total approximately 165,000 lines, including colocated tests. KiroGraph was used for orientation; it reported 121 files pending synchronization, so current source files took precedence.

Evidence labels used below:

- **Reproduced:** exercised with local installed tooling, mocked collaborators, or actual migration SQL against an in-memory database.
- **Source-confirmed:** a concrete path follows from the current code; no live infrastructure action was attempted.
- **Deployment inference:** supported by manifests and lifecycle behavior, but not exercised against a cluster or production image.
- **Improvement:** an architectural or assurance recommendation, rather than a demonstrated exploit.

Priorities are remediation order, not CVSS scores:

| Priority | Meaning | Target |
| --- | --- | --- |
| P0 | Release blocker for affected deployments or upgrades | Contain immediately and fix before release |
| P1 | High-impact security, data integrity or operational correctness problem | Next remediation tranche |
| P2 | Important reliability, defense-in-depth or contract problem | After security and data-integrity gates |
| P3 | Maintainability and documentation quality | Planned follow-up |

No production APIs, cloud accounts, SSH targets, live user databases, or deployment services were exercised. No package installation, image build, push, PR, or external publication was performed. Existing credentials were not needed. Public primary documentation was consulted for SSH host verification, Microsoft identity claims, Node.js support status and authorization principles. No live dependency-advisory audit or container vulnerability scan was performed; this report does not establish current CVE counts or assert that dependencies are vulnerability-free. No complete Git-history secret scan was performed. A tracked-path inventory found no `.env`, private-key or certificate-bundle paths, which is not a substitute for content scanning.

File links are relative to this document. Line numbers refer to the assessed snapshot and are provided in the surrounding text.

## Security findings

### S01. P0: Infrastructure routes lack authorization

**Source-confirmed.** The integration mounts in [server.ts](../../backend/src/server.ts), lines 890-934, authenticate and rate-limit callers but do not assign the relevant RBAC checks. [integrations.ts](../../backend/src/routes/integrations.ts), lines 68-74, mounts Puppetserver and Proxmox without authorization. Their route handlers also lack permission checks. AWS and Azure exhibit the same issue despite permission claims in comments.

| Surface | Representative handler | Missing boundary |
| --- | --- | --- |
| AWS | [aws.ts](../../backend/src/routes/integrations/aws.ts), lines 117-136: `POST /api/integrations/aws/provision`; lifecycle at 186 | `aws:provision` and action-specific authorization |
| Azure | [azure.ts](../../backend/src/routes/integrations/azure.ts), lines 120-140: `POST /api/integrations/azure/provision`; lifecycle at 187 | Azure provisioning and lifecycle authorization |
| Proxmox | [proxmox.ts](../../backend/src/routes/integrations/proxmox.ts), lines 223, 426, 625, 874 and 1074: provisioning, deletion and actions | Proxmox read/provision/execute/destroy checks |
| Puppetserver | [puppetserver.ts](../../backend/src/routes/integrations/puppetserver.ts), lines 2209 and 2431: environment deployment and cache flush | Puppetserver write/admin checks |
| Hiera | [server.ts](../../backend/src/server.ts), lines 904-909; [hiera.ts](../../backend/src/routes/hiera.ts), line 158 onward | Hiera read permission on lookup and code/data inspection |
| Execution history and output | [server.ts](../../backend/src/server.ts), lines 870-888; [executions.ts](../../backend/src/routes/executions.ts), lines 100-142; [streaming.ts](../../backend/src/routes/streaming.ts), line 147 onward | Read authorization on listing, details, output and subscriptions |

An authenticated user with no assigned integration permission can reach the relevant service call, subject to provider configuration and normal input validation. The destructive-provisioning flag defaults to false and blocks selected destruction operations; it does not authorize creation, stopping, rebooting or other mutations. Upstream provider IAM limits the maximum damage but does not restore Pabawi user separation.

Execution output and Hiera values can contain operational secrets. A read-only MCP label or an authenticated REST route does not make those data harmless. Define whether execution output is shared with all appropriately authorized operators or restricted by ownership; currently neither an explicit read gate nor ownership filtering protects these execution reads.

**Action:** create an executable route/permission inventory and enforce deny-by-default authorization for every mounted route. Check the authenticated principal and requested provider/action before dispatch. Apply an explicit policy to aggregated inventory/facts so access to one integration does not implicitly grant data from all sources. Align UI visibility and documentation with server enforcement.

**Acceptance:** exercise the real assembled application with an unauthenticated caller, a valid no-role user, Viewer, narrowly scoped operators and Administrator. For every affected route, unauthorized requests must return 401/403 before any mocked provider call. Test direct cloud routes as well as generic and batch execution paths. Verify destruction-disabled behavior separately from RBAC.

### S02. P1: MCP JWT callers inherit the service account's permissions

**Source-confirmed.** [mcpAuthMiddleware.ts](../../backend/src/middleware/mcpAuthMiddleware.ts) accepts a configured static token or falls back to normal JWT authentication. However, [McpToolHandlers.ts](../../backend/src/mcp/McpToolHandlers.ts), lines 62-70, always calls `hasPermission(deps.mcpUserId, ...)`. The authenticated JWT user's ID never becomes the tool principal. [server.ts](../../backend/src/server.ts), lines 1016-1051, constructs identical dependencies for every session.

When MCP is enabled, even a restricted personal JWT can query whatever the service account can read. This applies even if static-token authentication was intended to be a separately controlled machine credential. The session map at lines 1003 and 1033-1078 stores transport and creation time, without an owner. A caller who obtains another session ID can attempt continuation or deletion using a different authenticated identity.

**Action:** bind each MCP session to its authenticated principal and authentication method. Check tool permissions against that principal on every invocation; reserve the service identity for requests actually authenticated with its credential. Reject cross-principal session access and deletion. Add per-principal resource limits and audit attribution.

**Acceptance:** a no-role JWT cannot call service-authorized tools; a narrowly scoped JWT sees only its own permissions; the static credential retains its configured scope; another user's session cannot be reused or closed. Repeat after permission removal and account deactivation.

### S03. P1: Refresh tokens are accepted as API access tokens

**Reproduced.** [AuthenticationService.ts](../../backend/src/services/AuthenticationService.ts), lines 345-387, signs refresh and access tokens with the same algorithm, issuer and audience. Refresh tokens carry `type: 'refresh'`, but `verifyToken()` validates neither token purpose nor the expected access-token payload shape. [authMiddleware.ts](../../backend/src/middleware/authMiddleware.ts), lines 66-79, accepts the result.

A locally generated refresh token passed `verifyToken()` and returned `type: refresh` with no roles array. Its seven-day lifetime can therefore be used directly at API endpoints instead of the intended one-hour access-token lifetime. Database-based RBAC still applies where it exists; this finding does not by itself grant another user's identity.

**Action:** issue and strictly validate distinct token purposes, with an explicit access-token schema. Consider separate audiences or keys as defense in depth. Require appropriate claims before constructing `req.user` and apply the same validator across REST, SSE and MCP JWT authentication.

**Acceptance:** valid refresh tokens are rejected on every access-token surface and accepted only by refresh exchange. Malformed signed access payloads are rejected. Normal access tokens continue to work.

### S04. P1: Revocation and account deactivation do not consistently take effect

**Reproduced for cache separation; remaining paths source-confirmed.** [PermissionService.ts](../../backend/src/services/PermissionService.ts), lines 79-85 and 268-303, maintains an instance-local five-minute cache and returns cached grants before reading account status. [rbacMiddleware.ts](../../backend/src/middleware/rbacMiddleware.ts), lines 28-30, creates its own service. User, role and group routers create separate services and invalidate those instead: for example [users.ts](../../backend/src/routes/users.ts), lines 60-62 and 983.

In an isolated probe, warming the enforcing cache, deactivating the fake user, then invalidating the mutation-side service left access allowed by the enforcing service. Similar stale grants affect role removal and administrator demotion.

`verifyToken()` does not check whether the user is active. [UserService.ts](../../backend/src/services/UserService.ts), lines 300-400, changes passwords or active status without revoking existing tokens. The self-service password-change route does revoke tokens, but administrative resets do not use that same behavior. Thus auth-only routes remain usable until token expiry/revocation, while cached RBAC routes can remain usable until cache expiry. SSO issuance also lacks an active-user gate in [EntraIdService.ts](../../backend/src/services/EntraIdService.ts), lines 305-348 and 398-405.

**Action:** centralize permission-state ownership and invalidation; use an account/session authorization version or equivalent mechanism for immediate invalidation. Check active status at authentication/session issuance. Revoke sessions consistently on administrative reset, deactivation and deletion. Propagate revocation to long-lived SSE, MCP and console sessions where appropriate.

**Acceptance:** warm caches through real routes, revoke a role or deactivate a user through the administrative API, then immediately retry. Old access and refresh tokens must fail according to a documented policy. Cover SSO, multiple permission-service instances and multiple processes if supported.

### S05. P1: SSH host-key checking is not implemented when enabled

**Source-confirmed against application and installed dependency.** [SSHService.ts](../../backend/src/integrations/ssh/SSHService.ts), lines 489-496, sets an always-accepting verifier when checking is disabled and sets no verifier when it is enabled. The installed `ssh2` README, line 955, and [upstream ssh2 documentation](https://github.com/mscdex/ssh2#client-methods) specify that an absent verifier accepts the host key automatically.

Consequently, setting `SSH_HOST_KEY_CHECK=true` does not authenticate the target server. An attacker able to intercept or redirect SSH traffic can impersonate a host, receive password authentication if configured, and falsify infrastructure command output. This is not a claim that private keys are transmitted.

**Action:** implement real trust checking against managed known-host keys, pinned fingerprints or an explicitly supported SSH host-certificate model. Fail closed on an unknown or changed identity unless a distinct, auditable enrollment workflow authorizes it.

**Acceptance:** a controlled SSH server with an unknown key is rejected, an enrolled key succeeds, and a changed key is rejected with the setting enabled. Test nondefault ports and host aliases.

### S06. P1: Delegated account/role administration can grant broader privileges

**Source-confirmed.** [users.ts](../../backend/src/routes/users.ts), lines 963-980, permits callers with `users:write` to assign arbitrary roles to arbitrary users, including themselves. [groups.ts](../../backend/src/routes/groups.ts), lines 504-520, similarly uses `groups:write` to assign arbitrary roles. [roles.ts](../../backend/src/routes/roles.ts), lines 535-553, lets `roles:write` assign arbitrary permissions to roles.

This undermines the deliberately stronger gates on administrator status and password resets. A custom helpdesk role with user-edit rights can assign the built-in Administrator role and acquire its permissions without the intended elevation gate. The prerequisites are delegated write permissions, not merely a default Viewer account.

**Action:** separate profile editing from entitlement assignment. Require an explicit entitlement-administration permission, prevent unapproved self-elevation, and define whether administrators can delegate only permissions they possess. Protect role/group changes as a single authorization surface.

**Acceptance:** a user-edit-only principal cannot grant Administrator directly or through a group, modify a role to acquire extra permissions, or grant equivalent custom permissions. Authorized entitlement administrators can perform documented assignments with an audit trail.

### S07. P1: SSO links local identities by mutable email

**Source-confirmed; takeover depends on identity-provider claim control.** [EntraIdService.ts](../../backend/src/services/EntraIdService.ts), lines 328-348, links a new federated identity to an existing local account solely on an email match, with no proof of control of that local account or approval step. This can include privileged local accounts. Microsoft explicitly describes email claims as mutable and unsuitable for authorization or stable identity in its [ID token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference).

A trusted tenant and signed token establish who issued the claim; they do not establish that an existing local account belongs to that identity. Guest accounts, recycled email addresses and tenant-side attribute administration must be considered in the threat model. A separate concern is browser binding: login stores state server-side but the route does not bind that state to the initiating browser. PKCE and nonce verification do not alone prove that the browser completing the flow initiated it.

**Action:** identify federation accounts by a stable provider/issuer/subject identity. Require authenticated local-account linking or explicit administrative enrollment for an existing account. Gate inactive accounts before issuance. Bind OAuth state and final code redemption to the initiating browser. Document tenant/guest enrollment assumptions.

**Acceptance:** a signed claim with another account's email cannot acquire that account; an existing disabled account cannot obtain a session; cross-browser callback/code substitution is rejected. Run these against a disposable identity-provider configuration, without targeting real users.

### S08. P1: SSO authorization codes are not consumed atomically

**SSO portion resolved by A08 on 2026-09-11; console ticket portion resolved by
A15 on 2026-09-11.** The following describes the original finding.

**Source-confirmed concurrency defect.** [EntraIdService.ts](../../backend/src/services/EntraIdService.ts), lines 464-527, reads a code, checks `exchanged`, then performs an unconditional `UPDATE ... WHERE code = ?`. Two concurrent requests can both observe zero and return the stored token pair. The comment promising atomic consumption does not match the implementation.

[ConsoleSessionManager.ts](../../backend/src/services/ConsoleSessionManager.ts), lines 113-185, also separates token validation from an unconditional consumption update. [ConsoleWebSocketProxy.ts](../../backend/src/services/ConsoleWebSocketProxy.ts), lines 79-90, awaits those operations separately.

**Action:** claim one-time credentials using a conditional update/delete with checked affected-row count, inside correctly scoped transaction semantics where necessary. Bind expiry, active session state and owner identity into the claim. Review refresh rotation for concurrent reuse handling separately; its unique revocation insert is a different mechanism, not the same unconditional-update defect.

**Acceptance:** send concurrent redemption attempts for one code or console ticket. Exactly one succeeds; all others fail without issuing credentials or opening another upstream session.

### S09. P1: Console termination does not enforce connection termination

**Resolved by A15 on 2026-09-11.** The following describes the original finding;
implementation and validation are recorded above.

**Reproduced for terminated-token acceptance; connection lifecycle source-confirmed.** [ConsoleSessionManager.ts](../../backend/src/services/ConsoleSessionManager.ts), lines 113-140, accepts an unconsumed recent token without checking session state. A fake row with `state: terminated` was accepted. `terminateSession()` at lines 203-225 and timeout cleanup at 279-298 update database state but do not notify the proxy or close sockets. The proxy has no session-to-socket revocation registry.

Session heartbeat and status routes in [console.ts](../../backend/src/routes/console.ts), lines 260-340, require `console:access` but do not check ownership. A user who obtains another session ID can extend its heartbeat or inspect metadata. Session creation also uses a count-then-create quota check, so concurrent creation can exceed the intended cap.

The console currently has an additional connection-wiring failure, I06 below. Fixing that failure must not ship an operational console with ineffective termination controls.

**Action:** introduce authoritative session lifecycle transitions linked to socket teardown and provider cleanup. Check owner/admin permissions consistently. Reject terminated sessions during upgrade, atomically consume tickets, and reserve session capacity before creating upstream resources.

**Acceptance:** owner termination, admin termination, heartbeat expiry, account deactivation and process shutdown close both ends of a live fake console connection. A terminated session never upgrades. Another user's heartbeat is denied. Concurrent creation respects the cap.

### S10. P1: Production builds do not preserve dependency controls, and use EOL Node.js

**Source-confirmed build recipe; final image dependency state unmeasured.** [Dockerfile](../../Dockerfile), lines 9-12, 28-31 and 51-52, copies workspace manifests and runs `npm install`. Workspace lockfiles do not exist. The root lockfile, root security overrides, `.npmrc` and LavaMoat policy are not copied into those stages. The Alpine and Ubuntu variants use the same pattern.

Root CI dependency checks therefore do not establish which versions or install scripts execute in production builds. This report does not claim a particular image contains a particular vulnerable package.

Docker build stages and CI target Node 20. As of the assessment date, the [official Node.js release table](https://nodejs.org/en/about/previous-releases) lists Node 20 as EOL and Node 22/24 as supported LTS branches.

**Action:** build workspace dependencies from the reviewed root lockfile and preserve deliberate install-script/native-module policy. Move development, CI and all runtime images to an explicitly supported Node LTS version. Generate an image SBOM, inspect actual installed versions, and establish advisory and image scanning with triage ownership. Pin release inputs sufficiently to reproduce builds.

**Acceptance:** two clean builds resolve the same dependency graph, including security overrides. Unexpected dependency scripts cannot execute. All image variants start and pass smoke tests on the chosen runtime; scans apply to the shipped image, not only the source lockfile.

### S11. P1: Helm secret and policy rotation can leave old values active

**Deployment inference.** [deployment.yaml](../../charts/pabawi/templates/deployment.yaml) references fixed ConfigMap/Secret names via `envFrom`, with only caller-supplied pod annotations. No checksum or reloader mechanism exists in the chart. Updating [secret.yaml](../../charts/pabawi/templates/secret.yaml), lines 27-32, or command policy in [configmap.yaml](../../charts/pabawi/templates/configmap.yaml), lines 20-22, does not by itself change the Deployment pod template.

With the same image and unchanged pod template, a Helm upgrade can report success while processes keep the old MCP token, JWT secret or command whitelist until restarted.

**Action:** make chart-managed configuration changes trigger rollout and specify the rotation mechanism for externally managed secrets. Treat rotation as complete only after new processes enforce it. Account for in-flight sessions and desired token invalidation semantics.

**Acceptance:** rotate an MCP credential and command policy using a same-image Helm upgrade. Observe replacement/refresh and verify old credentials and newly forbidden operations are rejected by every pod.

### S12. P1: Initial setup is first-come administrative enrollment

**Source-confirmed, exposure-dependent.** [setup.ts](../../backend/src/routes/setup.ts), lines 148-231, exposes unauthenticated administrator creation whenever no administrator exists. Rate limiting limits attempts but proves no ownership of a fresh installation. Container/proxy exposure before setup gives a reachable attacker a first-claim opportunity.

The concurrency guard counts administrators after insertion and soft-deletes a duplicate. [SetupService.ts](../../backend/src/services/SetupService.ts), lines 42-49, counts `is_admin = 1` without considering active status; soft deletion leaves that flag set. It is not a transactional, durable bootstrap claim and can leave confusing inactive-admin/configuration states after races or partial failure.

**Action:** require an installation-specific bootstrap credential or a local administrative provisioning command. Claim setup atomically and persist completion/configuration coherently. Document private first-start access and recovery from an incomplete setup.

**Acceptance:** network reachability alone cannot claim a new installation. Concurrent initialization has exactly one winner with consistent account/configuration state, and injected save failure has a tested recovery path.

### S13. P2: Rate-limit exclusions and session allocation permit avoidable abuse

**Source-confirmed.** [securityMiddleware.ts](../../backend/src/middleware/securityMiddleware.ts) exempts any request whose `originalUrl` contains `/entra-id/` from the authentication limiter. Since `originalUrl` includes the query string, a local credential endpoint can match that exception through a query parameter. The account lockout pipeline remains an independent control, so this is not a claim that all brute-force defenses disappear.

MCP requests in [server.ts](../../backend/src/server.ts), lines 1029-1078, omit the authenticated rate limiter. The global session limit is not a per-principal quota. Public Entra login creates database state and is exempted from the auth limiter. These paths need workload limits beyond guessing resistance.

**Action:** match exclusions on the actual route and method, apply distinct limits to credential attempts, SSO state allocation, refresh and MCP work, and test reverse-proxy IP attribution. Bound sessions and expensive queries per principal as well as globally.

**Acceptance:** adding `/entra-id/` in a login query cannot skip credential throttling. One caller cannot consume the whole MCP session pool or unbounded SSO state. Legitimate users behind the supported proxy topology remain usable.

### S14. P2: Diagnostic data requires a consistent secret policy

**Source-confirmed exposure paths, conditional on diagnostics and access.** [ApiLogger.ts](../../backend/src/integrations/ApiLogger.ts), lines 203-204 and 358-390, leaves response bodies/previews unsanitized and only shallowly sanitizes selected request object fields. [crashHandler.ts](../../backend/src/utils/crashHandler.ts), lines 108-111, writes a native process diagnostic report, without configuring environment-variable exclusion. [crashDumps.ts](../../backend/src/routes/crashDumps.ts) lists JSON files and returns their full content to callers with the separately mounted debug-admin permission.

Default Node diagnostic reports can include environment configuration. Treat these files as potentially containing JWT keys and integration credentials, even though the custom crash JSON and directory/file permissions already reduce exposure. This is an authorized-debug-user/support-export boundary, not an unauthenticated download finding.

[ExpertModeCopyButton.svelte](../../frontend/src/components/ExpertModeCopyButton.svelte), lines 91-134, can collect all browser storage when explicitly enabled; storage collection defaults to false. [auth.svelte.ts](../../frontend/src/lib/auth.svelte.ts), lines 308-312, stores access and refresh tokens in localStorage. The default-off behavior is useful, but opt-in support exports still need mandatory credential redaction.

**Action:** define one recursive redaction policy for logs, previews, errors, support bundles and diagnostic exports. Exclude sensitive environment values from native reports and set retention/size limits. Review browser token persistence as an explicit threat-model decision; an HttpOnly refresh-cookie design would also require a deliberate CSRF and cross-origin policy.

**Acceptance:** canary secrets placed in nested fields, URLs, environment variables and browser storage never appear in exported support material. No actual production credentials are needed for this test.

### S15. P2: SSO group synchronization can retain stale grants

**Source-confirmed, claim-shape dependent.** [EntraIdService.ts](../../backend/src/services/EntraIdService.ts), lines 786-791, skips synchronization when `groups` is absent, retaining existing mapped roles. Microsoft documents cases where a groups-overage indication replaces the groups list in its [claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference). The implementation does not distinguish overage, unavailable claims and authoritative empty membership. It also treats all mapping-target roles as managed without recording whether an assignment was manual or federated.

**Action:** define behavior for empty, missing and overage claims, retrieve authoritative membership when required, and record assignment provenance. Reconcile removed mappings as well as removed group membership. Couple changes to S04 cache invalidation.

**Acceptance:** removed membership cannot silently retain privileges; overage is handled explicitly; manual assignments survive federation reconciliation according to the documented policy.

## Design and implementation findings

### I01. P0 for upgrades: Migration 017 loses authorization relationships

**Reproduced on SQLite; PostgreSQL outcome source-confirmed.** `017_nullable_password_hash.sql` (the original shared migration, now replaced by [SQLite](../../backend/src/database/migrations/017_nullable_password_hash.sqlite.sql) and [PostgreSQL](../../backend/src/database/migrations/017_nullable_password_hash.postgres.sql) variants), line 32, drops `users` while [SQLiteAdapter.ts](../../backend/src/database/SQLiteAdapter.ts), line 55, enables foreign keys. Earlier migrations define cascading user-role and user-group relationships.

Using actual repository migration SQL in an in-memory SQLite database, an inserted user and Administrator role assignment changed from `users=1, user_roles=1` to `users=1, user_roles=0` after migration 017. The user survives because it is copied; its direct authorization assignment does not. Revoked-token rows remained in this probe, so the claim is not that every dependent table is deleted. PostgreSQL receives the same shared table-drop migration and rejects dropping a table with dependent constraints; that failure was not exercised against a running PostgreSQL server.

**Action:** stop shipping this upgrade path until dialect-specific migrations preserve relationships. Supply recovery guidance for already affected databases: a later migration cannot infer deleted role/group assignments. Preserve backups and migration history before attempting repair.

**Acceptance:** populated upgrade fixtures retain users, roles, groups, federation links and relevant references. Fresh and supported-version upgrades pass on SQLite and PostgreSQL. Restore testing proves recovery of authorization state, not just user rows.

### I02. P1: Migration ID 016 represents two unrelated changes

**Reproduced selection and SQLite schema outcome.** [MigrationRunner.ts](../../backend/src/database/MigrationRunner.ts), assessed lines 179-199, groups migrations only by numeric ID, overwrites shared candidates and prefers dialect-specific candidates. `016_checkmk_write_permissions.sql`, its PostgreSQL variant and `016_entra_id_auth.sql` therefore collide.

SQLite selects Entra and lacks `checkmk:write`; PostgreSQL selects the Checkmk-specific file and omits Entra tables. Databases already recording either 016 will not automatically receive the other feature. The existing MigrationRunner suite still passes.

**Action:** reject conflicting logical migration identities, assign unique IDs and create repair migrations for both deployed variants. Do not simply rename an old file without handling installed schemas. Add migration-content checksums or equivalent drift detection.

**Acceptance:** inspect the real migration directory for every dialect; both features exist after fresh install and after either historic 016 variant. Fixtures converge to a single schema without losing data.

### I03. P1: Transactions share mutable adapter state across requests

**Source-confirmed.** [PostgresAdapter.ts](../../backend/src/database/PostgresAdapter.ts), lines 12, 91 and 175 onward, stores the transaction client on the shared adapter and routes all queries through it. [SQLiteAdapter.ts](../../backend/src/database/SQLiteAdapter.ts), lines 12 and 167 onward, similarly exposes one connection and transaction flag without callback-specific ownership. Federated user creation uses this boundary in [UserService.ts](../../backend/src/services/UserService.ts), line 698.

An unrelated request can execute while a transaction is awaiting and become part of that transaction. A subsequent rollback can discard work that the unrelated request considered successful. Overlapping PostgreSQL starts can also race during client acquisition.

**Action:** pass an explicit transaction-scoped adapter or implement correctly scoped asynchronous transaction context. SQLite needs serialization that also protects ordinary queries from joining someone else's transaction. Avoid changing this interface piecemeal across consumers.

**Acceptance:** interleave a failing transaction with an unrelated successful write; the successful write survives. Concurrent transactions use distinct ownership and release all clients. Exercise concurrent first SSO login and migration exclusion.

### I04. P1: Batch admission and cancellation are not a durable lifecycle

**Resolved by A13 on 2026-09-11 for the single-process batch contract.** The
following describes the original finding; implementation and validation are
recorded above.

**Source-confirmed.** [BatchExecutionService.ts](../../backend/src/services/BatchExecutionService.ts), lines 236-277, creates child executions, waits for queue slots and starts actions before inserting the parent batch. A batch exceeding available slots blocks submission until earlier work progresses; a later failure can return an error after infrastructure operations have already started. Children are marked running before actual admission, compromising queued/running reporting.

Cancellation at lines 476-510 only updates database rows. It does not remove queued work or abort provider execution; dispatch at line 646 and completion at 655 can continue and overwrite the cancellation. The user interface can therefore report cancellation without stopping subsequent mutations.

**Action:** persist parent and children atomically, return a stable batch ID promptly, then dispatch asynchronously through explicit queued/running/terminal transitions. Reserve capacity or define admission rejection before side effects. Cancel queued jobs, propagate abort where supported and accurately expose running work that cannot be interrupted.

**Acceptance:** a batch of N+1 blocked jobs returns an ID before any completes; partial admission cannot create unexplained orphan actions. Cancelled queued targets never run. A late completion cannot silently erase cancellation state. Restart reconciliation accounts for interrupted work.

### I05. P1: Mutation retry policy can duplicate infrastructure execution

**Resolved by A14 on 2026-09-11.** The following describes the original finding;
implementation and validation are recorded above.

**Source-confirmed.** [ParallelExecutionModal.svelte](../../frontend/src/components/ParallelExecutionModal.svelte), lines 645 and 657, submits Puppet runs and batches with default retries. [api.ts](../../frontend/src/lib/api.ts), lines 343 and 477 onward, allows three retries, including network failures. Other callers deliberately disable retries, demonstrating inconsistent semantics rather than an unavoidable transport limitation.

A response lost after server admission can cause another run. I04's slow admission increases the chance of a proxy timeout. Merely disabling retry in this one component leaves the default hazardous for future mutation callers.

**Action:** default non-idempotent mutations to no transport retry and use durable server-side idempotency keys where retry is required. Separate authentication replay from retry: at lines 442-457, a successful token refresh consumes an iteration, so `maxRetries: 0` prevents the authorized replay and produces an error.

**Acceptance:** drop the response after a committed batch submission and prove only one batch exists. An initial 401 with a valid refresh token and `maxRetries: 0` performs exactly one authenticated replay. Test the actual modal and provisioning callers.

### I06. P1: Console connection information never reaches the proxy

**Resolved by A15 on 2026-09-11 for the session lifecycle; Proxmox provider
compatibility remains unvalidated.** The following describes the original
finding; implementation and validation are recorded above.

**Source-confirmed.** [ConsoleSessionManager.ts](../../backend/src/services/ConsoleSessionManager.ts), lines 64-79, inserts `upstream_url` as null. Its getter at line 315 reads only that column. [ConsoleWebSocketProxy.ts](../../backend/src/services/ConsoleWebSocketProxy.ts), lines 110-113, closes the connection if the URL is absent. [ProxmoxConsoleProvider.ts](../../backend/src/integrations/proxmox/ProxmoxConsoleProvider.ts), lines 198-225, retains the URL in a separate private map that is not connected to this getter.

**Action:** establish one explicit provider-to-broker connection contract with protected ephemeral connection material. Validate the constructed Proxmox endpoint, authentication requirements and port against an actual test provider. Complete S08/S09 at the same time, before treating the console as usable.

**Acceptance:** create a session through the real route and manager, then upgrade to a local fake upstream and exchange frames. Exercise termination, upstream errors and restart cleanup. A production Proxmox compatibility test remains necessary.

### I07. P2: SSE reports failures as success and leaks tracking state

**Resolved by A16 on 2026-09-11.** The following describes the original finding;
implementation and validation are recorded above. The ticket routing and
ticket-to-execution binding it describes were already fixed before A16 and were
verified against the assembled mount chain rather than reimplemented.

**Source-confirmed.** [executionStream.svelte.ts](../../frontend/src/lib/executionStream.svelte.ts), lines 289-293, assigns success for every `complete` event. [streaming.ts](../../backend/src/routes/streaming.ts), lines 236-250, emits complete for both successful and failed stored executions, including their actual status. Failed runs can consequently appear successful.

[StreamingExecutionManager.ts](../../backend/src/services/StreamingExecutionManager.ts), line 600, returns from cleanup if no subscriber set remains, skipping deletion of other execution state at line 624. Normal client disconnection before delayed completion cleanup can trigger this. `scheduleFlush()` at line 428 restarts its timer on every chunk, delaying continuously arriving output until a quiet interval.

The assembled SSE route order also needs repair: [server.ts](../../backend/src/server.ts), lines 870-881, mounts JWT authentication on `/api/executions` before the later ticket-conversion middleware. Browser requests to `/api/executions/:id/stream?ticket=...` can fail authentication before conversion. The `/api/streaming` alias does not have that earlier mount. Additionally, ticket redemption does not verify the stored execution ID against the requested resource.

**Action:** preserve terminal result status, make cleanup unconditional, schedule bounded flush latency, resolve tickets before all relevant authentication middleware, and bind tickets to their intended execution/endpoint.

**Acceptance:** live and replayed failures show failure; continuous output flushes within its interval; thousands of completed/disconnected executions leave bounded memory; the documented ticket URL works in the assembled app and cannot redeem a ticket for another execution.

### I08. P2: Generic lifecycle authentication is contradictory

**Resolved by A17 on 2026-09-11.** The following describes the original finding;
implementation and validation are recorded above.

**Source-confirmed.** [inventory.ts](../../backend/src/routes/inventory.ts), lines 26-48 and 1340-1342, requires `PABAWI_LIFECYCLE_TOKEN` in `Authorization`. Its server mounts already require a JWT in that same header. An independently generated static token and a normal user JWT cannot satisfy both checks.

This makes the documented generic lifecycle flow unusable under ordinary configuration, while the direct provider routes in S01 remain under-protected. Do not fix usability by simply removing all protection.

**Action:** define one coherent user/machine authentication model and provider/action authorization policy. If retaining a machine credential, scope and authenticate it explicitly rather than requiring it to masquerade as a JWT. Update examples only after route tests pass.

**Acceptance:** documented authorized requests succeed through the production mount chain; unrelated users/tokens fail; destructive policy remains enforced.

### I09. P1/P2: Helm migration and scaling promises exceed the implementation

**Deployment inference.** [migration-job.yaml](../../charts/pabawi/templates/migration-job.yaml), line 9, runs before install/upgrade, but line 25 references the chart's normally created ServiceAccount. On a fresh namespace with the external-PostgreSQL migration path enabled, that regular release resource is not yet available to the pre-install hook. Validate this as a P1 installation blocker.

SQLite permits only one replica, but [values.yaml](../../charts/pabawi/values.yaml), lines 107-111, defaults to a surge rollout. That can overlap writers or wait for an RWO volume attachment. For PostgreSQL deployments, additional replicas do not make execution state distributed: queues, stream tickets, SSE buffers, MCP transports and provider console state are process-local.

**Action:** fix hook prerequisite ordering, choose a SQLite-safe deployment strategy and publish a supported topology matrix. Keep the supported baseline single-process until cross-pod ownership, routing, concurrency, cancellation and recovery are implemented and tested. Sticky routing alone is not a full HA design.

**Acceptance:** clean external-PostgreSQL installation succeeds; SQLite upgrades avoid overlapping writers; multi-replica claims require tests for cross-pod tickets, session continuation, execution cancellation, aggregate capacity, rollout and node failure.

### I10. P2: Quality gates miss the relevant integration boundaries

**Resolved by A18 on 2026-09-11 for the gating, with the recorded component
backlog outstanding.** The following describes the original finding;
implementation and validation are recorded above.

**Source-confirmed.** [eslint.config.js](../../eslint.config.js), line 48, ignores Svelte components. Frontend lint targets TypeScript, CI runs `tsc --noEmit`, and Vite build does not provide Svelte semantic checking. No component checker is configured. Passing lint/type checks therefore do not establish that component code follows the same rules.

[ci.yml](../../.github/workflows/ci.yml) runs unit tests and builds, but does not run PostgreSQL migrations, a built-image startup check, Helm installation or Playwright flows. Existing migration and security suites passed during this assessment while the source-level gaps remained. The problem is missing boundary assertions, not simply too few tests.

**Action:** add component-aware lint/type checking, assembled-app authorization tests, real-file populated migration fixtures for both dialects, and a small set of E2E tests for admission, failure display, cancellation and console lifecycle. Test the shipped image and deployment instructions. Gate dependency/secret scans in CI with reviewed exceptions; current local hooks exclude broad documentation/test paths and are not sufficient by themselves.

**Acceptance:** an intentional component type error fails CI; a missing route authorization check fails before deployment; actual migration 016/017 defects fail fixtures; fake upstreams prove console and execution lifecycle behavior without touching infrastructure.

### I11. P3: Consolidate around proven failure boundaries

**Architectural judgment.** Route factories and the declarative plugin registry are useful, but duplicated execution persistence, dispatch, retry, completion and diagnostics have diverged. Independent `PermissionService` instances demonstrate that nominal dependency injection has not established coherent service ownership.

Recommended module boundaries are a shared authorization/session policy, an execution lifecycle service, transaction-scoped storage, and a console session broker. Keep provider-specific API/CLI semantics in plugins. Reduce repetitive expert-mode/error blocks after behavior is covered; file size alone is not a reason to refactor.

Queue admission should apply consistently to direct and batch execution. [commands.ts](../../backend/src/routes/commands.ts), line 233, dispatches directly through IntegrationManager without acquiring the batch queue; the examined Bolt service also spawns directly. Verify every execution path before describing the concurrency limit as global. Inventory/facts timeout behavior and shutdown at [server.ts](../../backend/src/server.ts), line 1181 onward, need a clear drain/cancel/restart contract.

**Acceptance:** all execution entry points share tested admission, attribution, terminal status, cancellation and retry semantics. Provider failure cannot indefinitely block unrelated inventory or shutdown. Persisted running work is reconciled after restart.

## Documentation assessment

Existing dated assessments under `docs/internal` are historical evidence. They were not treated as current vulnerabilities merely because their text describes old defects. Use this report as the current assessment at the stated commit; preserve older reports with explicit dates and status.

| ID / priority | Drift or operational problem | Evidence | Required correction and verification |
| --- | --- | --- | --- |
| D01 / P1 | SQLite backup instructions copy the database before stopping the WAL writer; troubleshooting suggests deleting a failed database | [upgrading.md](../upgrading.md), lines 12-18 and 36; [troubleshooting.md](../troubleshooting.md), line 210; SQLiteAdapter line 42 enables WAL | Document a consistent online backup or clean-stop procedure. Preserve failed databases for diagnosis. Restore a backup containing recent WAL writes and verify records, integrity and authorization assignments. Link I01 recovery guidance. |
| D02 / P2 | `AUTH_ENABLED` is documented as an auth switch, but backend auth mounts are unconditional | [README.md](../../README.md), line 184; [api.md](../api.md), lines 7, 13, 516, 545; [openapi.yaml](../openapi.yaml), lines 23, 4485; [permissions-rbac.md](../permissions-rbac.md), line 3 | Describe mandatory REST JWT authentication, actual public exceptions and route authorization. No backend source consumes `AUTH_ENABLED`. Test documented examples against a disposable assembled app. |
| D03 / P2 | Authentication headers and MCP requirements conflict | [api.md](../api.md), lines 7 and 15, claims inbound `X-Authentication-Token` support; [mcp.md](../mcp.md), line 32, requires JWT despite static-token instructions at 40-56 | Separate Pabawi caller authentication from upstream PuppetDB credentials. Explain supported MCP token types and their corrected identity semantics after S02. |
| D04 / P2 | Checkmk guide describes the obsolete historical-event REST endpoint and omits the real history transport configuration | [checkmk.md](../integrations/checkmk.md), lines 80-86; accepted [ADR 0001](../adr/0001-checkmk-events-source.md), lines 9-19; [CheckmkPlugin.ts](../../backend/src/integrations/checkmk/CheckmkPlugin.ts), lines 127-145 and 469-492 | Document Livestatus, its network/TLS boundary and fallback fidelity. Add `CHECKMK_LIVESTATUS_*` and health-check settings to configuration and environment examples. Following public docs must enable the intended history mode without assuming REST authentication protects Livestatus. |
| D05 / P2 | OpenAPI lags implemented version and protocol flows | [openapi.yaml](../openapi.yaml), line 44, reports 1.2.0; stream entry at 1718 lacks tickets; ticket issuance, Checkmk and Entra routes are absent | Update security declarations, version and endpoint schemas. Add route/contract coverage with explicit intentional omissions. Verify SSE ticket issuance/redemption and current auth responses. |
| D06 / P2 | Scaling instructions imply broader support than process-local protocols provide | [charts README](../../charts/pabawi/README.md), lines 52-75; [kubernetes.md](../deployment/kubernetes.md), line 23 uses three replicas, while 61-63 recommends one | Publish feature/topology limits before recommending HPA. Include execution ownership, MCP/SSE affinity, secret activation and SQLite rollout constraints. Verify I09 before claiming HA. |
| D07 / P3 | Architecture diagrams misstate classes, priorities and execution entry points | [architecture.md](../architecture.md), lines 24-32; [registry.ts](../../backend/src/plugins/registry.ts), lines 61-63, 91-93, 138-140, 195-197, 212-214 | Replace service-as-plugin inheritance and old priorities with real Plugin constructors and registry values; include Azure/Checkmk. Replace nonexistent root `POST /api/executions` in the command flow with actual entry points. |
| D08 / P3 | The full configuration reference omits supported variables | [configuration.md](../configuration.md) and [backend/.env.example](../../backend/.env.example) compared with [ConfigService.ts](../../backend/src/config/ConfigService.ts) | Add Azure settings, Checkmk Livestatus/health settings and missing console examples. Generate or check a variable inventory with defaults, units, secret classification and conditions. Avoid exposing real values. |
| D09 / P3 | Copy-paste deployment examples contain path/name/exposure inconsistencies | [upgrading.md](../upgrading.md), lines 152-160, changes directory then repeats the chart path; [docker.md](../deployment/docker.md), line 14 uses `./env` while other examples use `.env`; compose publishes on all host interfaces | State working directories and bind-address behavior explicitly. Run examples in disposable environments and align private first-start guidance with S12. |
| D10 / P3 | Repository guidance contains stale file paths and incomplete plugin inventory | [AGENTS.md](../../AGENTS.md) compared with current file structure | Correct CommandWhitelistService to `validation/`, JournalService to `services/journal/`, NodeLinkingService to `integrations/`, and include Checkmk/console architecture. Keep contributor commands aligned with actual quality gates. |

A local Markdown-link scan of README, public `docs` excluding `docs/internal`, and the chart README found no missing relative file targets. It did not validate heading anchors, external URLs, HTML links or generated references. The main documentation problem is semantic drift and unsafe operational procedures, not missing Markdown files.

## Action plan

Owners below are proposed responsibility areas, not assignments to named people. Effort estimates are implementation person-days for one experienced maintainer, including focused regression tests; provider/cluster validation and recovery work can add time. They are planning estimates, not a schedule commitment.

### Phase 0: Containment and release protection

| Action | Priority | Owner | Effort | Dependencies | Done when |
| --- | --- | --- | --- | --- | --- |
| A01. Restrict affected installations to explicitly trusted operators; review enabled self-registration and exposure; temporarily disable unused affected integrations/MCP | P0 | Security / operations | 0.5-1 day | Deployment-specific review | Exposure and compensating controls recorded; no claim that UI hiding fixes authorization |
| A02. Block the affected migration upgrade path and preserve recoverable database backups | P0 | Database / release | 0.5-1 day | None | Consistent backup/restore verified; release gate covers I01/I02 |
| A03. Add assembled-app authorization regression matrix and repair S01 | P0 | Backend security | 3-5 days | A01 | No-role and narrowly scoped users cannot dispatch unauthorized actions or read restricted output/data |
| A04. Repair migration 016/017 handling and document recovery for deployed variants | P0/P1 | Database | 3-5 days | A02 | Fresh/populated upgrades converge on both dialects without relationship loss |

### Phase 1: Identity, sessions and build trust

| Action | Priority | Owner | Effort | Dependencies | Done when |
| --- | --- | --- | --- | --- | --- |
| A05. Enforce token purpose, active-account checks and unified revocation/cache ownership | P1 | Backend security | 3-5 days | S03/S04 tests | Revocations apply immediately across supported authentication/session paths |
| A06. Bind MCP to caller identity and session ownership | P1 | MCP / security | 2-3 days | A05 policy | JWT and machine-token identities retain separate scopes; cross-user sessions rejected |
| A07. Separate entitlement administration from user editing | P1 | RBAC | 2-3 days | A03/A05 | Direct, role and group elevation paths require deliberate authority |
| A08. Repair SSO linking, one-time redemption, browser binding and group reconciliation | P1/P2 | Identity | 4-6 days | I03 transaction design, A05 | Identity collisions, concurrent redemption, inactive accounts and missing/overage groups pass negative tests |
| A09. Implement SSH trust verification and secure bootstrap claim | P1 | Integrations / security | 3-5 days | Trust/enrollment policy | Unknown/changed SSH hosts fail; fresh setup requires installation ownership |
| A10. Move to supported Node LTS; preserve locked image dependency and script policy; scan shipped artifacts | P1 | Build / supply chain | 3-5 days | Runtime compatibility testing | Reproducible dependency graph, controlled native builds, SBOM and reviewed scan output |
| A11. Make secret/policy rotation activate in running deployments; fix migration-hook prerequisites | P1 | Deployment | 2-3 days | A04/A10 | Clean install and same-image secret rotation pass on a disposable cluster |

### Phase 2: Infrastructure execution correctness

| Action | Priority | Owner | Effort | Dependencies | Done when |
| --- | --- | --- | --- | --- | --- |
| A12. Implement transaction-scoped storage ownership | P1 | Database | 3-5 days | Transaction interface decision | Interleaved requests cannot join or roll back each other's work |
| A13. Make batch admission durable and asynchronous; implement truthful cancellation/restart semantics | P1 | Execution backend | 4-7 days | A12 | Atomic records precede effects; queued cancellation prevents execution; recovery is tested |
| A14. Standardize mutation retries and durable idempotency; separate auth replay | P1 | Frontend / execution backend | 2-4 days | A13 contract | Dropped responses do not duplicate actions; refreshed zero-retry mutations work |
| A15. Complete console provider/broker wiring and lifecycle enforcement together | P1 | Console / security | 3-5 days | A05/A08 one-time claim policy | Fake and real provider connectivity works; termination closes connections; quotas/ownership enforced |
| A16. Fix SSE terminal status, ticket routing/scope, cleanup and flush timing | P2 | Streaming / frontend | 2-3 days | A03/A13 | Failed runs never display success; documented EventSource flow works; memory remains bounded |
| A17. Repair generic lifecycle auth and unify provider policy | P2 | Backend API | 1-2 days | A03 | Production-mounted requests use a coherent documented credential model |

### Phase 3: Assurance, deployment limits and documentation

| Action | Priority | Owner | Effort | Dependencies | Done when |
| --- | --- | --- | --- | --- | --- |
| A18. Add Svelte semantic checks, real migration tests, image smoke tests and focused E2E gates | P2 | Quality / CI | 3-5 days | Add regression tests throughout earlier phases | Deliberate regressions at each boundary fail CI |
| A19. Correct backup/auth/Checkmk/OpenAPI and deployment references | P1-P3 | Maintainers / docs | 3-5 days | Update alongside behavior changes | D01-D10 resolved with verified commands and contract checks |
| A20. Harden workload limits and redact/retain diagnostic data consistently | P2 | Security / observability | 2-4 days | A05/A06 | Query-based limiter bypass fails; canary credentials stay out of support exports |
| A21. Define the supported topology, shutdown and recovery contract | P2 | Architecture / operations | 2-4 days for specification and single-process hardening | A11/A13/A15/A16 | Single-process baseline is reliable; unsupported HA claims removed; distributed work separately scoped |
| A22. Consolidate execution and diagnostics modules using the repaired contracts | P3 | Backend / frontend | Scope after phases 1-2 | Behavioral regression suite | Duplicate paths no longer diverge in admission, cancellation, attribution or status |

Security tests should be added with each fix, not deferred to A18. Documentation describing unsafe recovery or incorrect protection should be corrected with the corresponding behavior change. Broader multi-replica execution is a separate design project and is intentionally not hidden inside the estimates above.

## Validation performed

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm run lint` | Passed in both workspaces | Existing configured lint rules pass; Svelte components remain excluded |
| Workspace-local `tsc --noEmit`, TypeScript 5.9.3 | Backend and frontend passed | Current TypeScript projects compile under their installed workspace compiler; not Svelte semantic verification |
| Backend security directory | 3 files, 72 tests passed | Existing security regressions remain green, not complete authorization coverage |
| AuthenticationService, MCP unit tests, EntraIdService and Entra auth-code properties | 6 files, 122 tests passed | Existing auth/MCP/SSO expectations pass, including expectations that do not cover the identified negative cases |
| MigrationRunner targeted suite | 15 tests passed | Runner unit behavior passes; actual migration-directory collisions and populated upgrades need additional tests |
| Actual migration SQL against in-memory SQLite | Reproduced 016 feature omission and 017 role-assignment loss | Concrete migration defects with no live database modified |
| Isolated actual-service probes | Refresh accepted as access; inactive user retained warmed grant; terminated console token accepted | Reproduced S03, S04 cache separation and part of S09 using fake collaborators |
| Public documentation relative-file links | No missing file targets in the scoped scan | File existence only, not semantic accuracy or anchor/external validity |

The security HTTP test harness initially hit sandbox `EPERM` on loopback binding. The same tests were rerun with the required local-network permission and passed. An initial root TypeScript 6.0.3 invocation differed from the workspace toolchain; the reported successful checks use each workspace's TypeScript 5.9.3. Neither tooling issue is classified as a product defect.

Useful repeat commands, using already installed dependencies:

```bash
npm run lint
(cd backend && ./node_modules/.bin/tsc --noEmit)
(cd frontend && ./node_modules/.bin/tsc --noEmit)
(cd backend && node ../node_modules/vitest/vitest.mjs run test/security)
(cd backend && node ../node_modules/vitest/vitest.mjs run test/AuthenticationService.test.ts test/unit/mcp test/unit/services/EntraIdService.test.ts test/properties/EntraIdAuthCode.property.test.ts)
```

Still required before claiming release readiness: full backend regression coverage, populated PostgreSQL upgrades, image/runtime verification, browser execution/console workflows, provider compatibility checks, dependency/OS advisory scans, historical secret scanning with reviewed exceptions, and documented backup/restore and secret-rotation exercises. Passing the current targeted suites does not close any finding without its stated acceptance tests.
