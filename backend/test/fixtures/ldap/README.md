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
