# LDAP package 7 acceptance evidence

**Candidate:** branch `151`, current base `7389784`, plus the uncommitted CI/harness/runner changes.
The initial base in this session was `55c8107`; the existing package-7 work was committed concurrently and preserved.
**Date:** 2026-10-21.
**Release decision:** blocked on actual AD evidence. Parser dependency cleanup is complete; local OpenLDAP transport and database recovery rehearsals pass.

This report maps the [implementation plan](ldap-authentication.md#acceptance-tests) to executable evidence.
A passing synthetic protocol or browser fixture does not establish AD or Proxmox interoperability.
Evidence paths below are local artifacts retained outside the repository; exact commands and outcomes are in
`~/.agents/logs/pabawi.jsonl`.

## Acceptance matrix

| Area | Current evidence | Remaining gate |
| --- | --- | --- |
| Configuration | `backend/test/config/LdapConfig.test.ts` and `LdapDn.test.ts`: owned bounded DN syntax, exact value/scope semantics, UTF-8/BER/multi-valued vectors; disabled/enabled settings, positive policy, invalid filters/DNs/attributes/TLS/CA and startup parsing. Server composition constructs LDAP without an initial network dependency. | None for configuration; actual AD attribute visibility remains below. |
| TLS and failover | `backend/test/integration/ldap-directory.test.ts`: real trusted LDAPS/StartTLS, bad CA/hostname, failed upgrade without credentials, transport-only failover and socket deadlines. Unit tests cover wildcard restrictions and rejected bind/certificate failover behavior. | Real AD endpoint/certificate and equivalent-controller failover. |
| Credentials | Real directory and HTTP tests cover valid/invalid/empty passwords, ambiguity, missing immutable ID, injection input, incomplete/limited results and timeouts. `provider-bound-sessions.test.ts` now proves local and LDAP temporary lockout on both adapters. | Real AD user/lookup bind behavior. |
| Identity | Both-adapter schema/provisioning tests plus all four live `ldap-rollout.test.ts` combinations prove move/rename continuity and new identity after DN/login reuse. Concurrent first-login tests preserve one identity/account. | Real AD binary GUID retrieval and equality filters. |
| Profiles | Live HTTP refresh after moving an entry updates login/DN/display name without replacing the user or revoking valid access. Null contacts, suspension and server-enforced profile/password ownership have HTTP and component regressions. | None for the shared ownership contract. |
| Authorization | Live zero-role enrollment returns 403 without tokens; manual role enables login, mapped grants survive manual withdrawal, recreated groups withdraw old grants and require a new immutable mapping. Database tests cover source unions and revisions. | None for the shared grant contract. |
| Groups | Real OpenLDAP covers both supported group classes, nested cycles, depth/count limits and group rename/recreation. AD matching-rule errors and bounded traversal have synthetic protocol tests. | Real AD nested matching-rule behavior, large/ranged membership and bounds. |
| Status | Real OpenLDAP positive-policy denial, missing-policy attributes and terminal observed revocation. Unit tests cover AD FILETIME sentinels, disablement, computed lockout/password expiry and unreadable state. | Actual AD policy visibility and disabled/expired/locked accounts. |
| Freshness | Both-adapter controlled database clocks cover the exact deadline. HTTP and database regressions cover forced refresh, unchanged failed timestamps, transient recovery and terminal positive denial. Live OpenLDAP policy restoration leaves old access/refresh tokens invalid. | None for the shared freshness algorithm. |
| Concurrency | Both-adapter independent-connection tests cover login/refresh/publication races. New child-process cases prove lease coalescing, stale-worker fencing and mapping-revision rejection across distinct OS processes. | None for the covered coordination contract. |
| Transports | `ldap-transports.test.ts` now runs nine REST/refresh/SSE/MCP/console scenarios in synthetic mode and against real OpenLDAP in both TLS modes on both adapters. Real connection interruption and policy mutation exercise delivery, idle checks, retry and recovery. Local/Entra provider independence is covered separately. | Real Proxmox interoperability is separately unverified. These fixtures test authorization enforcement. |
| Administration | HTTP permission/validation/audit tests and both-adapter mapping provenance/revision tests. Endpoint override/fabricated identity and outage controls are rejected without leaking configuration. | None for the administration contract. |
| Migrations | Fresh and populated upgrades on SQLite/PostgreSQL cover identity/grant preservation, foreign keys, rollback, views/triggers and one-time legacy-session invalidation. | Local populated SQLite WAL backup and PostgreSQL pg_dump/pg_restore, rollback and repeat-upgrade rehearsal now pass. Deployment-specific storage/service procedures still need staging validation. |
| UI | Full frontend regression plus isolated Chromium cases for explicit provider choice, short credentials, denial without fallback, mapping/diagnostic controls, nullable read-only profiles and page guards. | Browser directory responses are synthetic; they provide UI/HTTP evidence. |

## Added release-candidate checks

`backend/test/integration/ldap-rollout.test.ts` runs with the existing synthetic OpenLDAP image and
three `TEST_LDAP_*` settings. With `TEST_DATABASE_URL`, it executes the complete SQLite/PostgreSQL
and LDAPS/StartTLS matrix. Every case creates uniquely named entries under the fixture people/groups
bases. Only those entries are removed at teardown. Shared seed data is preserved.

The child-process tests live in `backend/test/database/ldap-authentication.test.ts`;
`backend/test/fixtures/ldap/validation-worker.ts` runs the unchanged authentication service and
database adapters in another Node process. Directory reads are controlled synthetic responses, so these
cases prove process isolation and database coordination, not directory protocol behavior.

The live rollout exposed an existing PostgreSQL ambiguity in the failed-login counter upsert.
Qualifying the target counter restores the shared path for local and provider-scoped LDAP lockouts.
The new regression failed against the starting source on PostgreSQL and passes after the one-line fix.
No historic migration, token format or runtime configuration contract changed. Approved dependency
removal is recorded below.

## Dependency maintenance gate

Primary registry metadata was rechecked for the pinned versions:

- [@ldapjs/dn 1.1.0](https://registry.npmjs.org/@ldapjs/dn/1.1.0) is explicitly decommissioned.
- [@ldapjs/asn1 2.0.0](https://registry.npmjs.org/@ldapjs/asn1/2.0.0), its transitive dependency, is also decommissioned.
- [ldapts 9.2.0](https://registry.npmjs.org/ldapts/9.2.0) declares Node >=22; the candidate was tested on supported Node 24.21.0.

Runtime DN parsing now uses the project-owned `backend/src/config/ldapDn.ts`, not either deprecated
module. Current Context7/source review found no equivalent parser API in the pinned ldapts DN builder;
the reviewed community LDAP fork would add another complete LDAP stack for this narrow function.
Pabawi owns parser maintenance and regression coverage. No new package was installed.

The bounded module parses escaped UTF-8, attribute names/OIDs, unordered multi-valued RDNs and opaque
BER hex values. Attribute descriptors normalize case; values remain exact and BER never guesses text
or schema matching. Only complete definite-length BER with single-octet tags is supported. Scope uses
parsed suffixes, never raw string endings or broad case folding. Malformed/unsupported encodings and
inputs above 8192 bytes fail closed. Standards: [RFC 4514](https://www.rfc-editor.org/rfc/rfc4514.html),
[RFC 4517 distinguishedNameMatch](https://www.rfc-editor.org/rfc/rfc4517.html#section-4.2.15).
The application deliberately uses conservative locator equality, not a complete schema matching engine.

Focused regression and 200 randomized Unicode cases pass, as do the live OpenLDAP matrix and full
backend regression. After explicit user approval, the obsolete declaration and @ldapjs/dn dependency
were removed offline. Its unused @ldapjs/asn1 and process-warning transitives were pruned. The lockfile
comparison proves no added packages or changes to any remaining package entry. This maintenance gate
is closed; Pabawi owns the bounded parser and its regression suite.

## Verification artifacts

- `/tmp/pabawi-ldap-p7-prerequisites.log`: 85 prerequisite cases, both adapters and live TLS.
- `/tmp/pabawi-ldap-p7-lockout-red.log`: PostgreSQL regression before the fix.
- `/tmp/pabawi-ldap-p7-lockout-green.log`: both-adapter counter and live mutation regression.
- `/tmp/pabawi-ldap-p7-workers.log`: independent-connection and actual child-process tests.
- `/tmp/pabawi-ldap-p7-backend.log`, `frontend.log`, `browser.log`: final full regressions.
  The last two names share the same `/tmp/pabawi-ldap-p7-` prefix.
- `/tmp/pabawi-ldap-p7-build-backend.log`, `lint.log`, `components.log`: final source gates,
  with the same prefix. Chromium setup also builds the production frontend.
- `/tmp/pabawi-ldap-p7-dependencies.json` and `clamav.log`: registry review and clean artifact scan,
  with the same prefix.

Final counts, documentation/secret-scan evidence and retained fixture shutdown are recorded in the
package-7 handoff. No production deployment, remote push or PR was performed.

## Remaining release work

Obtain an authorized real AD fixture and verify every AD gate in the matrix against actual AD,
not a mock or Samba substitute. Approved parser dependency/type cleanup and lockfile verification
are complete. The automated local recovery rehearsal passes; validate environment-specific
backup/restore and the staged procedure in the
[operator guide](../../integrations/ldap.md#upgrade-and-rollout) in the intended deployment environment.
No production rollout has been observed or claimed.

## Repeatable local acceptance

`npm run test:ldap -- --ldap-image pabawi-ldap-fixture:package3-verified --output-root /tmp`
provisions fresh loopback-only fixtures, discovers ports, scans fixture artifacts, runs the complete
backend/frontend/browser/build/contract gates and stops fixtures while retaining all evidence.
`--focused` limits the run to backend LDAP checks; `--build-fixture` builds the default image.
See the [fixture guide](../../../backend/test/fixtures/ldap/README.md#reproducible-acceptance-runner).

`ldap-upgrade-recovery.test.ts` retains a migration-030 snapshot, proves backup includes live WAL
commits or uses PostgreSQL custom format, upgrades through 034, checks legacy reauthentication,
local/Entra login and preserved relationships, restarts without a second session reset, rolls back a
failed candidate migration, restores the unchanged original snapshot and successfully upgrades it again.
Its synthetic migration 035 exists only in the retained fixture directory. No historic or new shipped
migration was edited or added. Artifact manifests distinguish this local rehearsal from production rollout.

## Latest complete local run

`/tmp/pabawi-ldap-acceptance-sGktn2/result.json` reports passed=true. The run passed 4176 backend
tests, 1079 frontend tests, three browser cases, both production builds, lint, components, all seven
documentation contracts and secret scanning. The environment and upgrade-recovery manifests retain
versions, ports, image IDs, original backups and every observed recovery stage. Both fixtures stopped.

The explicit scanner-failure rehearsal in `/tmp/pabawi-ldap-acceptance-IjDzAQ/result.json` correctly
reports passed=false and proves both fixtures stop before acceptance can proceed. Copied artifacts
were subsequently scanned with real ClamAV. The latest handoff records completed approved dependency
cleanup and the remaining AD gate separately from these passing local checks.

## Approved dependency cleanup verification

User approval resolved the obsolete parser package/declaration gate. Offline uninstall removed only
@ldapjs/dn, @ldapjs/asn1 and process-warning; the obsolete declaration is deleted. The structural
lockfile proof in `/tmp/pabawi-ldap-p7c-lock-verified.json` confirms no additions or remaining package
changes. Post-removal `/tmp/pabawi-ldap-acceptance-3jP2T7/result.json` reports passed=true with 247
focused parser, real TLS, both-adapter, transport, worker and recovery checks. Backend build and both
linters also pass. The prior complete local run remains the full frontend/browser regression evidence.
Actual AD remains the integration acceptance blocker.


## CI, AD harness and runner lifecycle continuation

The LDAP CI job now calls the existing runner for PostgreSQL 15 and 17, retaining SQLite and
LDAPS/StartTLS in each job, plus the dedicated browser configuration. JSON/JUnit results, recovery
backups/manifests and browser reports/failure artifacts are uploaded with `if: always()`, limited to
the synthetic runner output. No private keys, fixture downloads, CA files or actual AD data are
uploaded. The runner checks that required live suites and browser cases actually passed, so an
exit-zero all-skipped run cannot establish acceptance. The server major version is also checked.

The opt-in `scripts/acceptance/ad.mjs` validates local configuration, private secret references,
production LDAP settings and fixture scope without connecting. Its TypeScript fixture worker
prepares binary GUID, rename/recreation, account-state, nested-rule/traversal, ranged-membership and
equivalent-controller cases in both TLS modes. Mutations and cleanup require generated-child scope,
a run ownership marker and the unchanged binary GUID. Synthetic ownership journals support manual
investigation of incomplete cleanup. No remote provisioning or actual AD operation occurred.
Absent configuration reports `unavailable`, all cases `not-run`, `adVerified=false`, exit 1;
a valid offline configuration remains `not-run`. Local tests and those statuses are not AD evidence.

Runner failure regressions exercise scanner rejection, readiness timeout, subprocess failure,
command deadline and SIGINT/SIGTERM. They assert nonzero status, accurate manifests, no work after
cancellation, shutdown of every attempted fixture and no surviving detached child. The detached-child
case failed against the intermediate group-only implementation and passes with descendant tracking.
Creation is recorded before Docker returns, failure paths retain environment evidence, each readiness
check has its own budget, and shutdown is inspected. Containers/data/evidence are retained.

The fixture guide contains exact offline/opt-in commands and the distinction between controlled
transport failover and an observed controller shutdown. Actual AD remains unavailable and unverified;
package 7 remains blocked regardless of passing CI/local synthetic checks.


### Observed continuation evidence

- PostgreSQL 15.17, OpenLDAP 2.6.10: `/tmp/pabawi-p7-candidate15/pabawi-ldap-acceptance-BP4dyF`.
- PostgreSQL 17.11, OpenLDAP 2.6.10: `/tmp/pabawi-p7-candidate17/pabawi-ldap-acceptance-mmfqO5`.
- Local `--build-fixture` branch plus PostgreSQL 17.11:
  `/tmp/pabawi-p7-built17/pabawi-ldap-acceptance-FMdXtp`.
- Each run passes 252 focused cases, zero skipped, and all three dedicated browser cases.
  Six later standalone AD ownership/cancellation tests pass. All recorded fixtures were independently
  inspected as stopped. `/tmp/pabawi-p7-session-evidence.json` indexes versions, image IDs,
  shutdown state and injected-failure evidence.
- `/tmp/pabawi-p7-runner-final.log`: 14 offline/configuration/workflow/runner contracts pass.
  `/tmp/pabawi-p7-runner-real-final.log` retains the actual Docker failure/cancellation checks.
  Their CLI/test/scanner failures are intentional; successful tests assert nonzero child results.
  The final log also includes real Docker creation interrupted before its wrapper returns.
- `/tmp/pabawi-p7-ad-types.log`, `ad-unit.log`, `actionlint.log` and `actionlint-clamav.log`,
  each with the `/tmp/pabawi-p7-` prefix, retain fixture typechecking, ownership tests, actionlint
  1.7.12 and the clean post-execution scanner result for its verified release archive/binary.
- `/tmp/pabawi-p7-next-build-backend.log`, `build-frontend.log`, `lint.log`, `components.log`,
  `contracts.log`, `secrets.log` and `secrets-changed.log`, each with the
  `/tmp/pabawi-p7-next-` prefix, retain production builds and repository gates. Scanner checks use
  the unchanged reviewed baseline; synthetic invalid-configuration vectors have line-local pragmas.
- `/tmp/pabawi-p7-failure-clamav.log` retains an independent real scan of injected-failure artifacts,
  including files retained after intentional scanner rejection. Containers, databases, backups,
  public CAs, browser output and command evidence remain retained outside the repository.

The workflow was parsed, checked with actionlint and its runner/build/browser behavior executed locally.
No GitHub Actions execution, remote workflow trigger, actual AD session or deployment is claimed.
