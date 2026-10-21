# LDAP authentication

Pabawi authenticates against one configured directory, with optional equivalent failover
endpoints. Local password login and Entra ID can remain enabled. Select **Local** or
the configured directory under **Sign in using**. Entra retains its redirect button.
A rejected LDAP attempt stays on LDAP and never tries another provider.

Real OpenLDAP fixtures cover LDAPS and StartTLS. AD policy and GUID handling have
service-level coverage, but real AD interoperability remains unverified. The AD example
is not support certification. Release review must also resolve the recorded maintenance
concern for the decommissioned DN-parser dependency.

## Configuration

Use environment variables, including protected runtime configuration for the lookup
password. Source development loads `backend/.env`. See the
[complete reference](../configuration.md#ldap-directory-service) and
[environment example](../../backend/.env.example).

LDAP is disabled by default. Enabled invalid configuration fails startup. An unreachable
directory with valid configuration permits startup and local/Entra login. Configuration
changes require a coordinated restart of all backend workers. Keep `LDAP_DIRECTORY_ID`
stable across endpoint moves. Failover endpoints must represent the same directory,
identity attributes, scope and policy. A different directory dataset requires an
intentional identity migration.

OpenLDAP with StartTLS:

```dotenv
LDAP_ENABLED=true
LDAP_DIRECTORY_ID=corporate-openldap
LDAP_DIRECTORY_TYPE=openldap
LDAP_DISPLAY_NAME=Corporate directory
LDAP_LOGIN_HELP_URL=https://help.example.com/directory
LDAP_HOSTNAME=ldap1.example.com
LDAP_PORT=389
LDAP_TLS_MODE=starttls
LDAP_CA_FILE=/etc/pabawi/corporate-ca.pem
LDAP_LOOKUP_USER=cn=pabawi-reader,ou=services,dc=example,dc=com
# Supply LDAP_LOOKUP_PASSWORD through protected runtime configuration.
LDAP_BASE_DN=dc=example,dc=com
LDAP_USER_RDN=ou=people
LDAP_USER_ELIGIBILITY_FILTER=(employeeType=active)
LDAP_GROUP_RDN=ou=groups
LDAP_GROUP_OBJECT_CLASS=groupOfUniqueNames
LDAP_GROUP_MEMBER_ATTR=uniqueMember
LDAP_GROUP_ID_ATTR=entryUUID
LDAP_SEARCH_NESTED_GROUPS=false
```

This example requires a deployment schema containing `employeeType` and a policy
where `active` positively establishes eligibility. OpenLDAP has no universal account
status attribute. Supply a positive filter excluding your disabled, locked and expired
states. Test missing status attributes explicitly. Both examples intentionally omit the
required lookup password and cannot start until a real secret is supplied.

AD with LDAPS, pending real AD verification:

```dotenv
LDAP_ENABLED=true
LDAP_DIRECTORY_ID=corporate-ad
LDAP_DIRECTORY_TYPE=ad
LDAP_DISPLAY_NAME=Corporate AD
LDAP_HOSTNAME=dc1.example.com
LDAP_PORT=636
LDAP_FAILOVER_ENDPOINTS='[{"hostname":"dc2.example.com","port":636}]'
LDAP_TLS_MODE=ldaps
LDAP_CA_FILE=/etc/pabawi/corporate-ca.pem
LDAP_LOOKUP_USER=CN=pabawi-reader,OU=Service Accounts,DC=example,DC=com
# Supply LDAP_LOOKUP_PASSWORD through protected runtime configuration.
LDAP_BASE_DN=DC=example,DC=com
LDAP_USER_RDN=OU=People
LDAP_GROUP_RDN=OU=Groups
LDAP_SEARCH_NESTED_GROUPS=false
```

AD presets use `sAMAccountName`, `objectGUID`, `group` and `member`.
The user scope must resolve each login uniquely. The lookup account must read
`userAccountControl`, `msDS-User-Account-Control-Computed`, `accountExpires`,
`pwdLastSet` and `msDS-UserPasswordExpiryTimeComputed`. Missing or malformed
attributes deny validation. Policy checks observable disablement, lockout, forced
password change, password expiry and account expiry. States observable only during
user bind cannot be detected by lookup-only session checks.

Use a read-only lookup account scoped to required entries and attributes. Anonymous
lookup requires `LDAP_ANONYMOUS_LOOKUP=true` and absent lookup user/password; it
still requires complete identity, policy and membership visibility.

## TLS, scope and actual defaults

Both modes require TLS 1.2 or newer, chain validation, endpoint SNI and hostname
verification. There is no insecure bypass. A public PEM CA bundle augments system
trust. Wildcard certificates are rejected by default; permitting them still requires
standard hostname validation. Failed StartTLS never falls back to plaintext.

Failover retries known transient connection-establishment failures within one deadline.
Certificate failures and rejected lookup credentials stop the transaction. A rejected
user bind never replays the password to another endpoint. Referrals, aliases and partial
searches cannot establish authorization.

Direct membership is the default. OpenLDAP supports DN-valued
`groupOfUniqueNames/uniqueMember` and `groupOfNames/member`. Override both
variables together for the latter. Optional UID suffixes and RFC2307 `memberUid`
are unsupported. Nested traversal stays in scope, detects cycles and enforces depth,
count and time bounds. AD matching-rule-in-chain is enabled for nested membership unless
`LDAP_DISABLE_MATCHING_RULE_IN_CHAIN=true`. Only a definitive unsupported-rule
response permits bounded traversal alone. AD primary groups, out-of-scope membership,
forest discovery, cross-domain referrals, directory writes and bulk sync are excluded.

| Setting | Actual default |
| --- | --- |
| TLS / port | `ldaps` / 636; StartTLS defaults to 389 |
| Connect / operation / transaction timeout | 10 / 10 / 30 seconds |
| Nested membership / maximum depth | false / 10 |
| Administrative search / traversal entries | 100 / 1000 |
| Concurrent directory transactions | 10, immediate bounded admission |
| Eligibility freshness | 300 seconds, configurable downward |
| Diagnostics | 10 per minute per authenticated user |
| Search UI page size / cursor lifetime | 50 / 60 seconds |

Exceeded bounds reject incomplete decisions. Search again if a cursor expires. Cursors
are opaque and bound to the original query, administrator and backend configuration.
Snapshots live in the serving process; use sticky routing for pagination.

## Map groups and diagnose access

1. Verify an emergency local administrator before enabling LDAP.
2. Sign in as a Pabawi administrator holding `rbac:admin`. Open **Role Management**.
   The existing management-page administrator guard remains in force.
3. Search directory groups, select the returned group and Pabawi role, then choose
   **Create mapping**. A role detail dialog maps directly to its current role.
   Multiple roles use separate mappings. Search never imports users or grants access.
   The server resolves immutable group IDs and supplies authoritative names and DNs.
4. Run **Restricted directory diagnostics** without a username for TLS and lookup bind.
   Supply an exact username for identity and policy visibility. Select up to 20 enabled
   mapped groups for membership checks. A passing lookup is not password authentication.
5. In a separate login, select the directory and use a synthetic eligible account.
   Verify access, denial after eligibility/grant removal, and outage/recovery behavior.

Stored mappings remain visible during outages. Disablement and removal withdraw only
attributable grants without directory lookup. Creation, enabling and role replacement
require fresh group identity proof. Reload after a failed or concurrent edit. Removal
requires UI confirmation. Every administration API independently enforces `rbac:admin`;
delegated API authority does not bypass the administrator-only UI pages.

There is no default LDAP role. Valid credentials and eligibility with no explicit role
create a visible account but return 403 without tokens. In **User Management**, locate
it by current directory login or display name, assign a manual role, then log in again.

## Identity and profile ownership

Directory ID and immutable subject define identity. Renaming or moving an entry preserves
the account; recreation with a new immutable ID does not inherit it. Administration shows
the reserved internal username, source, current login and display name. Matching local
or Entra names/emails never link accounts. External contact email may be absent or shared.

Directory names/email refresh at login and successful revalidation. These fields are
read-only; LDAP accounts cannot receive local passwords even through administrator APIs.
Change passwords in the directory. Pabawi owns suspension, administrative status and
manual roles. User details show manual/external role provenance. Removing a manual
assignment preserves other sources for that role. Manage LDAP grants through mappings.

## Sessions, failures and operations

Login establishes fresh eligibility. Refresh always forces lookup-only validation.
Other activity can reuse success only until its configured deadline, measured from
the start of the directory read. Passwords are never retained for revalidation.
Shared database revisions, leases and fencing protect concurrent workers. REST,
execution/journal SSE, MCP and console websocket delivery share this boundary.
Already dispatched infrastructure work continues independently.

| Outcome | Behavior |
| --- | --- |
| Bad or ambiguous credentials | Generic 401; no account-existence disclosure |
| Ineligible, suspended or no remaining explicit role | 403; positive revocation invalidates existing sessions |
| Too many attempts or concurrent operations | 429; wait before retrying |
| Directory/TLS error, incomplete search or exceeded limit | 503; no fresh eligibility or token issuance |
| Outage after login | Existing freshness lasts only to its original deadline; refresh needs directory availability |
| Transient recovery | Otherwise valid tokens may resume after a successful check |
| Recovery after positive revocation | New login required; old tokens stay invalid |

IP throttling accompanies separate provider/directory/submitted-login counters.
Five credential failures within fifteen minutes lock that key for fifteen minutes.
Rejected lookup credentials are availability errors and do not consume user failure
budgets. Avoid repeated bind attempts against locked directory accounts.

Use restricted stage results and structured logs for latency, limits, failover and safe
reason codes. Do not share passwords, tokens, full entries or raw directory diagnostics.
Public discovery exposes only configured name/help metadata and stays visible during
outages. The browser retains tokens after a temporary refresh failure (429/503 or a
network error), displays a warning and permits a later retry; it does not treat the failed
check as fresh authorization. Definitive refresh rejection clears the session.
Keep local emergency access available.

## Upgrade and rollout

Back up the database/configuration using normal operational procedures. Apply the release
consistently across backend workers and never edit historic migrations. Migration 031
preserves identity/grant ownership and local email constraints. Migration 032 intentionally
invalidates legacy sessions once; all providers must sign in again with provider-bound
tokens. Later migrations add validation decisions and console context. Legacy console
reservations without provable authentication context cannot upgrade.

Stage the deployment and verify both database adapters, local/Entra login, configured TLS,
mapping withdrawal, outage/recovery and long-lived transports. Real AD acceptance remains
a release gate: GUIDs, account state, nested matching rules, large membership and failover.
Real Proxmox console compatibility is separately unverified; authorization fixture tests
do not establish provider interoperability.

The [OpenLDAP fixture](../../backend/test/fixtures/ldap/README.md) documents live directory
checks. The [implementation plan](../internal/plans/ldap-authentication.md) tracks full
acceptance and release blockers.
