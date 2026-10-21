# OpenLDAP test fixture

This fixture contains synthetic accounts only. It uses OpenLDAP from a pinned
Debian base, generates a short-lived CA and certificate on startup, and provides
a read-only lookup account. Its configured ACL hides password values.

From the repository root:

~~~bash
docker build -t pabawi-ldap-fixture:package3 backend/test/fixtures/ldap
docker run --detach --name pabawi-ldap-p3-openldap --pull never \
  -p 127.0.0.1::1389 -p 127.0.0.1::1636 pabawi-ldap-fixture:package3
docker port pabawi-ldap-p3-openldap
mkdir -p /tmp/pabawi-ldap-fixture-tls /tmp/pabawi-ldap-fixture-downloads
docker cp pabawi-ldap-p3-openldap:/fixture/tls/ca.pem /tmp/pabawi-ldap-fixture-tls/ca.pem
docker cp pabawi-ldap-p3-openldap:/downloads/. /tmp/pabawi-ldap-fixture-downloads
clamscan -r /tmp/pabawi-ldap-fixture-downloads
~~~

Use the published 1636 and 1389 ports, respectively:

~~~bash
TEST_LDAP_LDAPS_PORT=PORT_1636 \
TEST_LDAP_STARTTLS_PORT=PORT_1389 \
TEST_LDAP_CA_FILE=/tmp/pabawi-ldap-fixture-tls/ca.pem \
npm run test --workspace=backend -- test/integration/ldap-directory.test.ts
docker stop pabawi-ldap-p3-openldap
~~~

The fixture uses FQDN localhost.localdomain, which must resolve to loopback.
The test skips when the three TEST_LDAP variables are absent. An ordinary full
backend test run therefore does not constitute directory interoperability evidence.
Containers, image and temporary artifacts are retained for inspection.

The service is read-only. Fixture setup uses slapadd before starting slapd.
The test credentials are fixture-reader, fixture-user and fixture-admin. They have
no meaning outside this disposable directory. No real AD interoperability is
claimed by this fixture.

## Browser contract fixture

Run from the repository root with the supported Node 24 runtime:

~~~bash
npx playwright test --config playwright.ldap.config.ts
~~~

This separate suite starts an in-memory database and loopback-only HTTP server with
synthetic directory responses, builds the frontend, and exercises real auth, mapping,
user/role routes and sessions through Chromium. It uses no developer database or real
directory. It covers short LDAP credentials, provider isolation, local login, page
permissions, mappings, failed diagnostics and read-only nullable directory profiles.
It does not establish LDAP protocol or AD interoperability. The regular Playwright
configuration excludes this directory so it cannot run against infrastructure fixtures.
Browser artifacts and screenshots are retained under /tmp/pabawi-ldap-p6-*.

## Live rollout and worker acceptance

Use a fresh container from the verified fixture image for each acceptance session. The current
entrypoint seeds an empty database and cannot safely restart a previously seeded container.

With the same three `TEST_LDAP_*` variables above and an optional disposable
`TEST_DATABASE_URL`, run from the repository root:

~~~bash
npm run test --workspace=backend -- test/integration/ldap-rollout.test.ts test/database/ldap-authentication.test.ts test/database/provider-bound-sessions.test.ts
~~~

The rollout file uses the fixture's synthetic administrator only to create and mutate uniquely named
test entries. Production directory operations remain read-only. It checks zero-role/manual enrollment,
profile and DN moves, group rename/recreation, user recreation and terminal policy revocation through
real authentication HTTP routes. All four adapter/TLS combinations run when PostgreSQL is configured;
PostgreSQL cases are explicitly skipped otherwise. Cleanup removes only case-owned entries.

Database authentication tests additionally launch `validation-worker.ts` as a separate Node process
using the installed tsx loader. Controlled directory results allow deterministic lease coalescing,
fencing and mapping-revision races on both adapters. These are actual process-boundary tests with
synthetic directory responses, independent of the real-directory and browser evidence.

## Reproducible acceptance runner

From the repository root, with supported Node 24, Docker, ClamAV and installed project dependencies:

~~~bash
npm run test:ldap -- --ldap-image pabawi-ldap-fixture:package3-verified --output-root /tmp
~~~

Use any locally available image built from this fixture with --ldap-image. On a fresh machine,
--build-fixture builds the default pabawi-ldap-fixture:acceptance tag from the repository Dockerfile.
A local postgres:17 image is also required; --postgres-image accepts another local reference.
Runtime containers use --pull never. --focused runs the LDAP/backend matrix without the full
frontend/browser/build gates. The full run additionally requires detect-secrets on PATH and the
repository's Chromium test installation.

The runner creates fresh, uniquely named OpenLDAP and PostgreSQL containers with dynamic loopback
ports, retains/scans the public CA and fixture package downloads, records image IDs and versions,
and supplies the live test environment automatically. It stops its own fixtures in finally after
success or failure, retaining containers, database volumes and evidence. It never removes containers
or overwrites an earlier evidence directory. Commands append to ~/.agents/logs/pabawi.jsonl.

Each run prints an evidence directory containing result.json, environment.json, command outputs,
browser screenshots and upgrade-recovery-* subdirectories. The recovery cases retain SQLite backups
and PostgreSQL custom-format archives plus a machine-readable list of passed checks. No real
directory, developer database or infrastructure provider is used.

The transport suite runs nine scenarios in each of five configurations: synthetic SQLite plus actual
OpenLDAP LDAPS/StartTLS on SQLite/PostgreSQL. Its loopback relay interrupts real TLS connections for
outage checks. Its fixture administrator changes only uniquely named test accounts for policy checks.
Provider adapters and infrastructure result payloads remain local fixtures; this does not establish
real Proxmox or AD interoperability.

## CI acceptance

The `ldap-acceptance` job in `.github/workflows/ci.yml` runs PostgreSQL 15 and 17 independently.
Each invocation retains SQLite, both real OpenLDAP TLS modes, transport checks, process coordination
and database recovery. `--focused --browser` also runs the dedicated LDAP Chromium suite, which the
normal Playwright configuration excludes. This suite still uses synthetic directory responses.
The runner rejects missing, skipped or failed live-directory/recovery cases and browser cases even
if the underlying test command exits zero. `--postgres-major` checks the actual server version.

Each job builds the repository's OpenLDAP fixture, explicitly pulls its PostgreSQL image, installs
Chromium and ClamAV, and uses the existing approved dependency-install steps. Runtime containers
still use `--pull never`. Only synthetic acceptance evidence is uploaded, on success and failure,
with 14-day retention: JSON/JUnit results, recovery backups/manifests, browser HTML reports and
failure screenshots/traces. Private keys, fixture downloads and CA files are excluded from upload;
only the public CA is copied from the fixture. No directory credentials or real AD evidence enter
this artifact tree. Local successful invocations validate runner behavior, not GitHub-hosted execution.

## Opt-in actual AD lab harness

`ad-lab.example.json` is a configuration shape with local file references, not a usable lab.
Keep the actual configuration outside the repository. All three password references must point to
private regular files outside the repository (mode 0600); symlinks are checked by their resolved
location. The CA reference must be a readable PEM certificate/bundle. No inline passwords or
additional configuration keys are accepted. Fixture and lookup bind identities are distinct roles:
a delegated writer creates fixtures below the explicitly configured parent OU, while the production
service uses the lookup identity to prove read visibility. Domain policy and existing objects are
never modified.

Run from the repository root to validate configuration, production settings, certificate and secret
references entirely offline:

~~~bash
npm run test:ldap:ad -- --config /absolute/local/ad-lab.json --output-root /tmp
~~~

Without `--execute`, the result is `not-run`, `adVerified=false`, exit 1. Without configuration it is
`unavailable`, with every required case explicitly `not-run` and exit 1. Invalid configuration fails
without recording its contents or raw errors. No connection is opened in either offline mode.

For a separately authorized disposable Microsoft AD DS lab, the explicit network/mutation opt-in is:

~~~bash
npm run test:ldap:ad -- --config /absolute/local/ad-lab.json --execute --output-root /tmp
~~~

That command has not been executed in this implementation session. It requires two independently
configured equivalent controller FQDNs with trusted LDAPS and StartTLS and an operator attestation
that the lab is actual Microsoft AD DS. RootDSE capabilities are checked and an advertised Samba
vendor is rejected. Capabilities alone do not prove a Microsoft implementation; mocks, OpenLDAP
and Samba never establish actual AD compatibility.

Each TLS mode creates a random child OU and synthetic objects. The ownership ledger permits only
its generated direct children, checks the marker and binary GUID before every mutation/deletion,
and refuses cleanup if ownership changes. Cleanup never enumerates or recursively deletes arbitrary
OU contents. The retained result journals synthetic run IDs, relative object names and GUIDs as
operations occur, so incomplete cleanup can be investigated with the local lab configuration.
A failed cleanup makes acceptance fail. Only these disposable AD objects are cleaned up; the local
OpenLDAP/PostgreSQL runner continues to retain its containers, volumes, databases and evidence.

Cases cover binary objectGUID retrieval/equality queries and production immutable-ID resolution;
user/group rename and recreation; disabled, expired, password-expired and computed locked state;
explicit AD matching-rule-in-chain plus bounded traversal; and membership beyond the configured
1501-3000 range. The large group uses synthetic contacts and requires an actual nonterminal ranged
`member` response. No change to MaxValRange or domain lockout/password policy is attempted. The lab
must expose a lockout within its configured 1-20 wrong binds against the harness-created user.
Missing policy visibility, unsuitable lab policy, missing ranged results or replication timeout fail
acceptance. Failover refuses primary transport establishment through an injected connector and then
uses the real alternate controller/TLS/user bind after bounded replication convergence. This provides
controlled outage evidence, not an observed controller shutdown.

The configured mutation limits and replication timeout are validated offline. Local ownership tests
simulate collisions, rename, replacement, foreign objects and lost creation replies; they provide
harness safety evidence only. Actual AD account-policy/replication/schema behavior remains unverified.
Protocol references: [Microsoft computed account state](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-adts/b80798ae-1f8c-4d30-9d80-a1f3281e96e2),
[range retrieval](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-adts/e27b48db-6f82-44cd-9038-2e54f790cc1f),
[capabilities](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-adts/3ed61e6c-cfdc-487d-9f02-5a3397be3772),
and [ldapts binary attributes](https://github.com/ldapts/ldapts#searchbasedn-options-controls).

## Runner failure and interruption regressions

~~~bash
npm run test:ldap:runner
LDAP_RUNNER_REAL_FAILURES=1 node --test scripts/acceptance/ldap.test.mjs
~~~

The default tests run the real CLI with controlled executable shims and retained synthetic state.
The second command additionally creates real local Docker fixtures using the verified local
`pabawi-ldap-fixture:package3-verified` and `postgres:17` images. It injects scanner rejection,
readiness timeout, test subprocess failure, command timeout and both SIGINT/SIGTERM. The tests prove
nonzero exit, persisted command/environment/result manifests, verified shutdown, no subsequent
acceptance stages and termination of detached descendants that ignore SIGTERM. A separate synthetic
creation-interruption case proves the shutdown ledger includes Docker creation before it returns.
Every fixture is retained, never removed automatically. Rejected scanner artifacts are retained for
inspection; scan them with real ClamAV after an intentionally injected scanner rejection.

The runner has separate readiness deadlines (default 30 seconds each) and a command deadline
(default 15 minutes), configurable with `--readiness-timeout-ms` and `--command-timeout-ms`.
Cancellation exits 130/143, prevents further work, terminates command groups and detached descendants,
and then stops/verifies every attempted fixture. Shutdown has its own bounded budget. Evidence marks
unavailable shutdown inspection or a failed stop as failure rather than claiming cleanup succeeded.
SIGKILL and host loss cannot execute in-process cleanup; retained container names are in the logs.
