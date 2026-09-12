# Remediation ledger, 2026-09-12

This ledger supplements the complete [assessment](codebase-assessment-2026-09-09.md)
and its dated remediation records. Recorded validation is historical evidence,
not a claim that current artifacts or installed deployments are release ready.
The supported application topology is a single process with SQLite or PostgreSQL.
Distributed execution ownership, session routing and HA remain separately scoped.

| Action | Findings | Status | Evidence and remaining acceptance |
| --- | --- | --- | --- |
| A01 | S01-S15 containment | Implemented but awaiting validation | Code protections are recorded below. Operator inventory and authorized inspection of installed exposure, registration and enabled integrations are required to establish deployment containment. |
| A02 | I01/I02, D01 recovery | Implemented but awaiting validation | A04 validates consistent backup and restoration locally. Previously damaged installations require operator backups and grant reconciliation; source changes cannot reconstruct deleted assignments. |
| A03 | S01 | Completed with evidence | Assessment A03 record: assembled route authorization and source-scoped inventory/facts matrix. |
| A04 | I01/I02, D01 | Completed with evidence | Assessment A04 record: populated real SQLite WAL and PostgreSQL historical migration/restore fixtures preserve authorization. Deployment recovery remains A02. |
| A05 | S03/S04 | Completed with evidence | Assessment A05 record: token purpose and account/session revision checks, independent PostgreSQL connections and protocol revocation tests. |
| A06 | S02/S13 | Completed with evidence | Assessment A06 record: HTTP MCP ownership, grant rechecks, session caps and cleanup; A20 adds work limits. |
| A07 | S06 | Completed with evidence | Assessment A07 record: entitlement administration separated from user editing, effective grant unions and audited assignment tests. |
| A08 | S07/S08/S15 | Completed with evidence | Assessment A08 record: signed disposable IdP, browser-bound atomic redemption, issuer/subject identity and provider-grant provenance tests. Real Entra tenant compatibility is not established by these tests. |
| A09 | S05/S12 | Completed with evidence | Assessment A09 record: real loopback SSH enrollment/change rejection, atomic bootstrap claims with SQLite and PostgreSQL connections. |
| A10 | S10 | Implemented but awaiting validation | [Initial artifact scan](a10-artifact-scan-2026-09-10.md) and [follow-up](a10-follow-up-2026-09-11.md): Ubuntu passed recorded high/critical gates; default Bookworm and Alpine remain blocked. Current advisory/package retrieval, amd64 execution, live Windows compatibility and release workflow evidence remain outstanding. |
| A11 | S11/I09 | Implemented but awaiting validation | Assessment A11 record: rendered chart gates and disposable arm64 cluster installs/rotations. Actual command denial after policy rotation was not exercised. A21 must enforce the single-process topology. |
| A12 | I03 | Completed with evidence | Assessment A12 record: transaction ownership with real SQLite and PostgreSQL; atomic re-execution and batch cancellation. Distributed migration coordination is separately scoped. |
| A13 | I04 | Completed with evidence | Assessment A13 record: durable batch admission, attribution, queue cancellation and restart reconciliation. Direct execution paths remain A22. |
| A14 | I05 | Implemented but awaiting validation | Assessment A14 record: no default mutation retries and durable batch/Puppet idempotency. A22 must address direct Puppet admission and replay ordering. |
| A15 | S08 console/S09/I06 | Implemented but awaiting validation | Assessment A15 record: broker capacity, tickets, live local WebSocket lifecycle and revocation tests. Required real Proxmox API/port/auth compatibility needs an authorized disposable provider and credentials. |
| A16 | I07 | Completed with evidence | Assessment A16 record: all terminal statuses, bounded buffering, timed flush, scoped stream tickets and cleanup regression coverage. |
| A17 | I08 | Completed with evidence | Assessment A17 record: production mount-chain user/machine authorization, provider action classes and destructive policy tests. |
| A18 | I10 | Implemented but awaiting validation | Assessment A18 record: component semantic baseline, assembled authorization, historical migrations, fake-provider browser flows and whole-tree secret gates. Existing 163 component diagnostics, component lint and remote CI evidence remain outstanding. |
| A19 | D01-D10 | Completed with evidence | Commit 6b0d6e0 and assessment A19 record: documentation contracts check routes, configuration, schema and architecture. Explicit schema omissions remain documented, not silently treated as full OpenAPI coverage. |
| A20 | S13/S14 | Completed with evidence | Commit f4798d3 and assessment A20 record: bounded authentication/MCP work, shared diagnostic redaction and retention policy with regression coverage. |
| A21 | I09/I11/D06 | Remaining implementation | Harden single-process topology, shutdown, provider wait boundaries and recovery. |
| A22 | I11 | Remaining implementation | Consolidate execution admission, attribution, status, cancellation and retry across direct and batch paths; use the existing shared diagnostics policy. |

## External evidence boundaries

- Installed containment and historical data recovery require operator-provided deployment
  inventory, consistent backups and authorization to inspect affected systems (A01/A02).
- Current release vulnerability evidence requires approved advisory/package access;
  existing dated scans do not clear the default Bookworm or Alpine images (A10).
- Real Proxmox and Windows interoperability require authorized disposable providers and
  credentials. Fake upstreams cannot satisfy these provider acceptance criteria (A10/A15).
- Remote CI and publication workflows have not been run for this remediation. Local
  equivalents do not establish the result of a remote workflow (A10/A18).

Local validation and implementation continue independently of those blockers.
