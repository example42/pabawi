# LDAP authentication implementation plan

**Status:** Package 1 complete; packages 2 through 7 pending  
**Date:** 2026-10-21  
**Scope:** OpenLDAP and Active Directory authentication, directory group authorization, and provider-bound session revalidation

## Agreed behavior

Pabawi will authenticate users against one configured LDAP directory, with optional equivalent endpoints for failover. Local authentication, Entra ID, and LDAP can operate simultaneously. Users explicitly select a password authentication provider; a failed attempt never falls through to another provider.

Connection credentials, TLS, search settings, and directory policy come from environment variables. Administrators search selected directory groups and map them directly to Pabawi roles through access administration. These mappings live in the database. There is no full-directory user import or synchronization job.

An LDAP user gets a Pabawi account after successful credential and eligibility verification. Access requires at least one explicitly granted role, either through directory groups or a manual Pabawi assignment. New LDAP accounts receive no automatic default role. Accounts without grants can remain visible to administrators for subsequent manual assignment, but receive no session tokens.

Directory identities remain separate from local and Entra identities, even when login names or email addresses match. LDAP passwords are used only for the current bind and are never persisted or retained for later revalidation. Directory writes, password changes, account linking, bulk synchronization, FreeIPA-specific behavior, RFC2307 `posixGroup` membership, and LDAP-specific MFA are outside this implementation.

## Current architecture and required changes

These observations describe the code inspected for this plan. Proposed interfaces and configuration below are implementation contracts, not existing functionality.

| Existing surface | Current behavior | Required change |
| --- | --- | --- |
| `backend/src/routes/auth.ts` | Provider discovery advertises local and optional Entra; password login is local | Advertise LDAP public metadata and add an explicit LDAP login route |
| `backend/src/server.ts` | Entra is an authentication service outside the infrastructure plugin registry | Wire LDAP authentication and shared eligibility dependencies alongside authentication services |
| `backend/src/config/ConfigService.ts` | Parses and validates environment configuration | Add typed LDAP configuration and conditional validation; do not read `process.env` in LDAP services |
| `backend/src/services/UserService.ts` | Federated creation accepts Entra claims and hardcodes its provider | Extract provider-neutral transactional account provisioning while preserving Entra behavior |
| `backend/src/services/AuthenticationService.ts` | Shared token issuance and rotation; tokens lack provider context | Bind tokens to the authenticating identity and enforce LDAP eligibility on verification and refresh |
| `backend/src/middleware/authMiddleware.ts` | Creates its own authentication service and exposes `req.revalidateAuth` | Use shared configured authentication dependencies so request and stream checks see LDAP state |
| `backend/src/services/SessionAuthorization.ts` | Periodically checks authorization for long-lived connections | Keep its checks and place bounded LDAP freshness underneath them |
| `backend/src/services/PermissionService.ts` | Uses effective roles and database authorization revisions | Include LDAP grants and invalidate permissions on their mutation |
| `backend/src/database/migrations/016_entra_id_auth.sql`, `022_repair_entra_id_auth.sql` | Identity uniqueness is `(provider, subject)` although lookup also includes issuer | Include stable directory/provider scope in identity uniqueness and lookup |
| `backend/src/database/migrations/027_sso_boundaries.sqlite.sql` and PostgreSQL counterpart | Federated role grants lack identity provenance | Separate grants by source identity so one provider cannot erase another provider's grants |
| `frontend/src/pages/LoginPage.svelte` | Password form applies local minimum username/password lengths | For LDAP, require nonempty input and reasonable payload limits; do not impose local password creation rules |
| `frontend/src/lib/entraIdAuth.svelte.ts` | Provider discovery is Entra-specific | Extract common discovery while retaining Entra redirect handling |

Authentication does not belong in `plugins/registry.ts`: that registry manages infrastructure integrations. Add focused authentication services rather than introducing an unrelated plugin framework.

## Environment configuration

### Parsing and defaults

Use the existing configuration type definitions and `ConfigService` validation. `LDAP_ENABLED=false` is the default. When enabled, malformed configuration fails startup. Valid configuration with an unreachable directory permits startup with LDAP unavailable and local access intact. Configuration changes require restart.

The primary host/port and additional endpoints must describe the same logical directory: identical identity attributes, search bases, schema, and policy. The stable directory ID must survive hostname changes. Pointing it at a different directory requires an intentional identity migration, not an ordinary endpoint edit.

| Variable | Default and contract | Secret |
| --- | --- | --- |
| `LDAP_ENABLED` | `false`; strict boolean | no |
| `LDAP_DIRECTORY_ID` | Required when enabled; stable operator-chosen identifier, restricted to letters, digits, `_`, and `-` | no |
| `LDAP_DIRECTORY_TYPE` | Required: `ad` or `openldap` | no |
| `LDAP_DISPLAY_NAME` | `LDAP`; provider label in login and user administration | no |
| `LDAP_LOGIN_HELP_URL` | Empty; optional HTTP(S) help link, safely rendered | no |
| `LDAP_HOSTNAME` | Required FQDN; no embedded credentials, protocol, path, or search parameters | no |
| `LDAP_PORT` | `636` for LDAPS, `389` for StartTLS; integer 1 through 65535 | no |
| `LDAP_FAILOVER_ENDPOINTS` | `[]`; JSON array of additional `{ "hostname": "...", "port": 636 }` objects; maximum four | no |
| `LDAP_TLS_MODE` | `ldaps`; either `ldaps` or `starttls`; applies to every endpoint | no |
| `LDAP_CA_FILE` | Empty uses system trust; otherwise readable PEM CA bundle path, added to system trust | no |
| `LDAP_ALLOW_WILDCARD_CERTIFICATES` | `false`; additional restriction beyond normal hostname validation | no |
| `LDAP_LOOKUP_USER` | Required DN unless anonymous lookup is explicitly enabled | no |
| `LDAP_LOOKUP_PASSWORD` | Required nonempty value with lookup user; never expose in discovery, logs, or diagnostics | yes |
| `LDAP_ANONYMOUS_LOOKUP` | `false`; when true, lookup user/password must both be absent | no |
| `LDAP_CONNECT_TIMEOUT_SECONDS` | `10`; positive integer, at most 30 | no |
| `LDAP_OPERATION_TIMEOUT_SECONDS` | `10`; positive integer, at most 30 | no |
| `LDAP_REQUEST_TIMEOUT_SECONDS` | `30`; total LDAP transaction deadline across endpoints, binds, searches, and traversal; at most 60 | no |
| `LDAP_BASE_DN` | Required nonempty valid DN | no |
| `LDAP_USER_RDN` | Empty; optional relative DN beneath base DN | no |
| `LDAP_USER_OBJECT_CLASS` | `user` for AD, `inetOrgPerson` for OpenLDAP | no |
| `LDAP_USER_LOOKUP_ATTR` | `sAMAccountName` for AD, `uid` for OpenLDAP | no |
| `LDAP_USER_ID_ATTR` | `objectGUID` for AD, `entryUUID` for OpenLDAP; must be immutable and readable | no |
| `LDAP_USER_EMAIL_ATTR` | `mail`; missing value becomes null, never a fabricated address | no |
| `LDAP_USER_DISPLAY_NAME_ATTR` | `displayName`; fallback to current directory login name | no |
| `LDAP_USER_GIVEN_NAME_ATTR` | `givenName`; missing value becomes an empty profile field | no |
| `LDAP_USER_SURNAME_ATTR` | `sn`; missing value becomes an empty profile field | no |
| `LDAP_USER_ELIGIBILITY_FILTER` | Empty for AD means built-in AD policy; required valid filter for OpenLDAP | no |
| `LDAP_GROUP_RDN` | Empty; optional relative DN beneath base DN | no |
| `LDAP_GROUP_OBJECT_CLASS` | `group` for AD, `groupOfUniqueNames` for OpenLDAP | no |
| `LDAP_GROUP_MEMBER_ATTR` | `member` for AD, `uniqueMember` for OpenLDAP; DN-valued memberships only | no |
| `LDAP_GROUP_ID_ATTR` | `objectGUID` for AD, `entryUUID` for OpenLDAP | no |
| `LDAP_GROUP_NAME_ATTR` | `name` for AD, `displayName` for OpenLDAP; display falls back to lookup attribute | no |
| `LDAP_GROUP_LOOKUP_ATTR` | `cn`; used for administrative search, not persistent identity | no |
| `LDAP_SEARCH_NESTED_GROUPS` | `false`; direct membership only unless enabled | no |
| `LDAP_DISABLE_MATCHING_RULE_IN_CHAIN` | `false`; AD optimization switch, irrelevant for OpenLDAP | no |
| `LDAP_NESTED_GROUP_MAX_DEPTH` | `10`; positive integer, at most 32 | no |
| `LDAP_GROUP_SEARCH_LIMIT` | `100`; total returned administrative search entries, at most 500 | no |
| `LDAP_GROUP_TRAVERSAL_LIMIT` | `1000`; maximum visited groups per eligibility transaction, at most 10000 | no |
| `LDAP_REVALIDATION_INTERVAL_SECONDS` | `300`; positive integer at most 300, so operators can tighten the agreed freshness bound | no |
| `LDAP_MAX_CONCURRENT_OPERATIONS` | `10`; positive integer at most 100; bounded admission, with excess requests rejected temporarily | no |

Validate attribute descriptions as LDAP attribute names/OIDs, DNs with a DN parser, and filters with a filter parser. Do not treat an arbitrary configured attribute name as safe filter syntax. Combine fixed administrative filters with escaped runtime values; do not support executable templates or raw client-supplied filters.

TLS certificate verification and hostname checking are mandatory, with TLS 1.2 or newer. There is no environment option to disable them. Wildcard permission, when enabled, still uses standard hostname matching. With the default restriction, reject wildcard identities used to match the endpoint. Apply identical checks to LDAPS and StartTLS, including SNI for each selected FQDN. A failed StartTLS negotiation never falls back to plaintext.

### Active Directory example

Proposed additions to `backend/.env.example`; these variables are not implemented yet:

```dotenv
LDAP_ENABLED=true
LDAP_DIRECTORY_ID=corporate-ad
LDAP_DIRECTORY_TYPE=ad
LDAP_DISPLAY_NAME=Corporate directory
LDAP_HOSTNAME=dc1.example.com
LDAP_PORT=636
LDAP_FAILOVER_ENDPOINTS='[{"hostname":"dc2.example.com","port":636}]'
LDAP_TLS_MODE=ldaps
LDAP_CA_FILE=/etc/pabawi/corporate-ca.pem
LDAP_LOOKUP_USER=CN=pabawi-reader,OU=Service Accounts,DC=example,DC=com
# Set LDAP_LOOKUP_PASSWORD in the protected runtime environment.
LDAP_BASE_DN=DC=example,DC=com
LDAP_USER_RDN=OU=People
LDAP_GROUP_RDN=OU=Groups
LDAP_SEARCH_NESTED_GROUPS=false
LDAP_REVALIDATION_INTERVAL_SECONDS=300
```

The unset lookup password intentionally prevents this example from starting until a real secret is supplied. Use a read-only account with visibility of the relevant user status and membership attributes. The configured user search base must uniquely resolve a login name; `sAMAccountName` is not assumed unique across multiple domains. Forest-wide discovery and cross-domain referrals are excluded.

### OpenLDAP example

```dotenv
LDAP_ENABLED=true
LDAP_DIRECTORY_ID=corporate-openldap
LDAP_DIRECTORY_TYPE=openldap
LDAP_DISPLAY_NAME=Corporate directory
LDAP_HOSTNAME=ldap1.example.com
LDAP_PORT=389
LDAP_TLS_MODE=starttls
LDAP_CA_FILE=/etc/pabawi/corporate-ca.pem
LDAP_LOOKUP_USER=cn=pabawi-reader,ou=services,dc=example,dc=com
# Set LDAP_LOOKUP_PASSWORD in the protected runtime environment.
LDAP_BASE_DN=dc=example,dc=com
LDAP_USER_RDN=ou=people
LDAP_USER_LOOKUP_ATTR=uid
LDAP_USER_ID_ATTR=entryUUID
# Example policy only: employeeType must exist in this deployment's schema.
LDAP_USER_ELIGIBILITY_FILTER=(employeeType=active)
LDAP_GROUP_RDN=ou=groups
LDAP_GROUP_OBJECT_CLASS=groupOfUniqueNames
LDAP_GROUP_MEMBER_ATTR=uniqueMember
LDAP_GROUP_ID_ATTR=entryUUID
LDAP_SEARCH_NESTED_GROUPS=false
```

OpenLDAP presets select schema attributes, not a universal account status policy. Operators must supply a positive eligibility filter and document which disabled, locked, and expired states it excludes. Test that missing status attributes do not inadvertently make a user eligible. A deployment using `groupOfNames` can override the class and membership attribute to `groupOfNames` and `member`. Memberships expressed as usernames, such as `memberUid`, require separate future support. Initially support the ordinary DN form of `uniqueMember`; reject unsupported optional UID suffixes rather than interpreting them incorrectly.

### Relationship to Puppet Enterprise settings

This is conceptual compatibility, not a promise to accept PE RBAC API payloads. The source of the terminology is [PE external directory settings](https://help.puppet.com/pe/current/topics/rbac_ldap_ext_directory_settings.htm). That retrieved page identifies itself as 2025.8; the requested [2025.12.0 URL](https://help.puppet.com/pe/2025.12.0/topics/rbac_ldap_ext_directory_settings.htm) was unavailable during design.

| PE concept | Pabawi equivalent |
| --- | --- |
| Directory name and login help | `LDAP_DISPLAY_NAME`, `LDAP_LOGIN_HELP_URL` |
| Hostname, port, lookup user/password, timeout | Corresponding `LDAP_*` connection variables |
| SSL and StartTLS booleans | Single `LDAP_TLS_MODE` choice |
| Certificate chain | `LDAP_CA_FILE` |
| Hostname and wildcard validation | Mandatory hostname validation; optional wildcard permission |
| Base DN and user/group relative DNs | `LDAP_BASE_DN`, `LDAP_USER_RDN`, `LDAP_GROUP_RDN` |
| User login, email, full name attributes | Corresponding lookup/email/display name variables |
| Group object class, member, display, and lookup attributes | Corresponding `LDAP_GROUP_*` variables |
| Nested groups and matching rule switch | `LDAP_SEARCH_NESTED_GROUPS`, `LDAP_DISABLE_MATCHING_RULE_IN_CHAIN` |

Pabawi additionally needs immutable user/group IDs, explicit eligibility policy, endpoint failover, query limits, and session freshness settings. Unlike the optional security choices in the reference, this design requires TLS and hostname validation.

## Identity and database design

### Accounts and profile ownership

Keep the existing globally unique `users.username` as an internal identifier. New LDAP accounts receive a deterministic reserved identifier derived from provider, directory ID, and immutable subject, not their mutable login name. Encode components unambiguously and reserve this namespace from local account creation. Store directory login name and display name separately. Preserve existing local usernames and existing Entra accounts; do not mass-rename them.

Make contact email nullable and nonunique for external accounts. Preserve local email requirements and uniqueness through an explicit local credential/account scope and a corresponding database constraint. Never use a global `findByEmail(): User | null` contract once duplicate emails are legal. Replace ambiguous callers with scoped local lookup or an explicit set of matches. Preserve the existing Entra collision rejection policy with an explicit query; changing the email index must not silently enable linking or change Entra enrollment behavior.

Use nullable password hash types consistently in backend and frontend DTOs. A directory-only user has no local password. Authenticated password changes and administrative password updates must reject LDAP accounts. Existing explicitly enrolled Entra accounts that already have local credentials keep their established behavior.

Add a dedicated display name field rather than splitting arbitrary full names into invented first and last names. Refresh LDAP login, display name, given name, surname, and contact email from directory data at login and successful revalidation. Profile refresh never alters Pabawi suspension, manual grants, or administrative status. LDAP profile fields are read-only through user management APIs as well as the UI.

There is currently no email password recovery workflow. Preserve unambiguous local credential operations now; any future email recovery must select a local account explicitly and cannot resolve an account from an unscoped email match.

### Required logical records

Choose new migration numbers from the repository's current sequence during implementation. Implement equivalent SQLite and PostgreSQL migrations through `DatabaseService`.

| Record | Required fields and invariants |
| --- | --- |
| Federated identity | Existing ID and user reference, provider, stable issuer/directory scope, immutable subject; unique `(provider, issuer, subject)` |
| LDAP identity metadata | Identity reference, current login name, DN and profile metadata; DN/login are mutable locators, never identity keys |
| External group mapping | ID, directory ID, immutable group subject, current DN/name, role ID, enabled flag, audit timestamps; unique `(directory_id, group_subject, role_id)` |
| External role grant | User ID, role ID, identity/source ownership, mapping ID when group-derived; retain multiple provenance rows when several mappings grant one role |
| LDAP validation state | Identity ID, last successful validation timestamp, monotonically increasing validation generation, and applicable mapping/config revision |
| LDAP validation lease | Identity ID, lease owner/expiry and fencing generation for cross-process refresh coordination |

Reuse and extend `federated_identities` and `federated_user_roles` where this produces a coherent model. Do not create a second unsynchronized identity store. Entra reconciliation must delete only Entra-owned grants; LDAP reconciliation must delete only LDAP-owned grants. Manual `user_roles` and local group assignments remain separate. Backfill existing Entra grants with ownership, including accounts explicitly enrolled from local authentication, without dropping permissions.

Update `effective_user_roles`, permission queries, authorization revision triggers, and indexes on both database adapters. Deduplicate effective roles while preserving grant provenance. Removing one mapping cannot remove an identical role still granted by another mapping or manually.

Provision user, identity, initial grants, and validation state atomically. Resolve concurrent first logins using database identity uniqueness and a transaction retry/read strategy; never create two users for the same immutable identity. For a proven identity with no grants, commit the account without tokens so an administrator can later grant a role. Failed binds must not provision accounts.

SQLite table rebuilds must preserve dependent foreign keys, indexes, views, triggers, and data. Test upgrades from real migrated databases, not only freshly created schemas. Existing identity references must remain stable.

## Authentication services and login flow

Add `LdapDirectoryService` for read-only connection/search/bind operations and `LdapAuthenticationService` for provisioning and authorization orchestration. Add a shared provider-aware session eligibility service usable by every authentication entry point. Follow existing typed errors and structured `LoggerService` metadata. Do not introduce a separate token implementation.

Use `ldapts` as the proposed TypeScript client, with its exact release pinned in the lockfile after checking Node engine compatibility and package review. Its documented client supports LDAPS, `startTLS()`, connection/operation timeouts, binary attributes, paginated searches, filter escaping, and `unbind()`. Use dedicated user-bind connections and close clients in `finally`. The API references are the [ldapts repository](https://github.com/ldapts/ldapts); filter construction must conform to [RFC 4515](https://www.rfc-editor.org/rfc/rfc4515).

The login transaction is:

1. Require explicit LDAP selection and nonempty username/password. Apply body limits and rate limits before directory work. Do not trim or normalize passwords. Use case-preserving login input and the directory's matching semantics.
2. Select an endpoint, establish verified TLS, and bind the lookup account, or explicitly bind anonymously. No credential-bearing operation precedes StartTLS.
3. Search under `USER_RDN + BASE_DN` using the configured user class, escaped login equality, and eligibility policy. Request only needed identity, profile, and status attributes. Require exactly one result and a valid immutable ID. Zero results, ambiguity, or incomplete/limited results cannot authenticate.
4. Open a separate TLS connection to the same endpoint and bind with the returned user DN and supplied password. Never construct a user DN from submitted text. Never rebind a shared lookup client as the user.
5. With the lookup connection, read current status and resolve mapped direct/nested groups. Check the same immutable identity after the user bind so a changed locator cannot attach credentials to another object. Treat directory changes during authentication as a retryable transaction failure, not an identity substitution.
6. Transactionally provision or update the account and LDAP-owned grants, respecting local suspension. Evaluate effective explicit roles, including manual assignments. Issue no tokens if the user has no role or remains suspended.
7. Generate the existing Pabawi token pair with authenticated provider/identity context. Audit the result with safe reason codes and clear transient credential references on exit.

Reject empty passwords before calling LDAP: a server accepting an unauthenticated bind must never authenticate an empty password. Automatic reconnect/rebind must not replay user credentials or resume a StartTLS session without reestablishing TLS. Use transaction-scoped clients; discard a connection when its TLS or bind state is uncertain.

Canonicalize `entryUUID` as a validated UUID. Read AD `objectGUID` as binary, with a single tested canonical encoding for persistence and filter reconstruction. Do not use lossy text decoding, DN lowercasing, or a mutable login as the subject. Missing identity attributes are configuration/data failures, not permission to fall back to the DN.

### Eligibility policy

For AD, evaluate supported account disablement, account expiration, lockout, and password-expiration indicators using documented attributes and server-computed state where readable. Distinguish Windows FILETIME values from Unix timestamps and test sentinel values. Make the required readable attributes part of diagnostics. A configured extra eligibility filter further restricts the built-in policy and cannot bypass it.

For OpenLDAP, use the operator's configured filter on every eligibility search. If policy relies on operational attributes, request them explicitly. Diagnostics must distinguish a readable inactive account from missing policy visibility where possible. A successful bind is necessary at login, but not a substitute for a revalidation policy.

Password changes or conditions observable only during a user bind cannot reliably be detected later without the password. Do not claim otherwise. Revalidation enforces directory existence and the status/membership information available to the lookup identity; fresh authentication is required for bind-only conditions.

## Group resolution and role administration

Map external groups directly to roles, following the existing federated-role approach. Do not mirror every external group into local Pabawi RBAC groups. Add controls alongside `RoleManagementPage.svelte` and `RoleDetailDialog.svelte`, with provider/source information in user administration. `GroupDetailPage.svelte` manages infrastructure node groups and is not the appropriate surface.

Administrator group search uses `GROUP_RDN + BASE_DN`, the configured object class, and an escaped name/lookup substring with server-enforced limits. Return current display/lookup name, DN, and immutable ID. Creating a mapping resolves the submitted immutable ID against the configured directory and confirms the target role. A DN or display label supplied by the browser is not authoritative.

For direct membership, test whether each mapped group contains the user's current DN in the configured DN-valued membership attribute. Follow group references only when nested membership is enabled, remaining within the configured group search scope. Use parsed LDAP DN equality and a visited set; do not compare DNs using ad hoc string normalization.

For AD nested membership, use `LDAP_MATCHING_RULE_IN_CHAIN` where supported and enabled; its recursive link rule is specified by [Microsoft](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-adts/1e889adc-b503-4423-8985-c28d5c7d4887). The optimization must preserve the configured scope and resource limits. Use bounded traversal instead when disabled or when the server definitively reports the operation unsupported. Do not retry arbitrary directory errors as a different query strategy.

For OpenLDAP nested membership, traverse supported DN-valued group memberships with depth, visited-group, time, and result limits. Detect cycles. For AD member retrieval, handle ranged attributes if a traversal reads large member lists. Primary-group SID resolution and membership outside the configured group scope are excluded from this first version and must be stated in the operator guide.

Return no partial authorization decision when a query, referral, pagination boundary, depth bound, or result limit prevents establishing complete membership. Deny the attempted validation and preserve the distinction between an outage and a confirmed empty group set. Do not erase stored grants merely because a directory transaction failed.

Mapping creation, replacement, disablement, and deletion require `rbac:admin`, as do directory search and diagnostics. Preserve the application's existing page-level management guard and enforce API permissions independently. Search and mapping are separate operations; viewing search results never imports users or assigns roles.

On a mapping edit, increment a database mapping revision and invalidate affected validation state. Removal must withdraw that mapping's materialized grants transactionally, with authorization revision changes visible to all processes. New mappings force fresh membership validation before granting access. An in-flight validation must compare its starting revision with the current revision before committing, so it cannot resurrect a removed grant.

## Session freshness and revocation

Add signed authentication context to access and refresh tokens: provider, identity ID, and directory ID for LDAP. Resolve the identity from the database and verify it belongs to the token's user; token context cannot select arbitrary accounts or endpoints. Rotation retains the same context. Local and Entra behavior remains independent of directory availability.

Every LDAP login establishes fresh directory state. Every refresh forces a fresh check, with only concurrent in-flight checks coalesced. Other authenticated activity may use the last successful check for at most `LDAP_REVALIDATION_INTERVAL_SECONDS`, measured from the start of the directory read to avoid extending freshness by a slow transaction. At the deadline, stop delivering protected data or authorizing new operations until a fresh check succeeds.

Revalidation uses the lookup identity to find the immutable subject, evaluate status, refresh profile, and resolve mapped memberships. It never rebinds as the user. Persist successful validation state and mapping revision in the database. Coordinate concurrent checks through bounded leases/fencing and in-process single-flight. Expired or failed work cannot overwrite a newer result or extend a successful timestamp. Use database time for cross-process timestamps and lease checks.

| Outcome | Required behavior |
| --- | --- |
| Eligible user with explicit roles | Reconcile LDAP grants and profile atomically; continue |
| Group removal with remaining manual/other mapped roles | Remove lost grants; continue with reduced permissions |
| No remaining explicit role | Reject protected access and revoke LDAP sessions |
| User deleted, observably disabled/expired, or locally suspended | Reject access and revoke LDAP sessions; never reactivate local suspension |
| Network/TLS/search error or exceeded resolution limit | Do not advance freshness or erase grants; block LDAP access once freshness expires |
| Directory recovery after transient failure | Existing otherwise valid sessions may resume after a successful fresh check |
| Positive revocation followed by directory recovery | Require a new login; previously revoked tokens remain invalid |

Use existing account-wide `session_version` for LDAP-only accounts when positively revoked. Profile refreshes must not accidentally trigger session revocation. Permission changes must invalidate effective permission caches, even when sessions remain valid.

Connect the common eligibility service to ordinary REST middleware, refresh, SSE revalidation, MCP authorization, and console websocket checks. The console path currently checks `ConsoleSessionManager.assertSessionAuthorized`, so JWT middleware alone is insufficient. Close or stop protected delivery on stale/invalid authorization for each transport. Already dispatched infrastructure jobs are not automatically cancelled; authorization is checked before new actions and output delivery.

No background full-directory polling is needed. Active connections drive periodic checks; an idle HTTP session is checked when next used. Request coalescing and bounded concurrency prevent the existing frequent stream checks from becoming frequent LDAP queries.

Deploy the token-context change with an intentional one-time session invalidation and required reauthentication. Do not guess a legacy token's provider from email or from whichever linked identity happens to be present. Issue provider-bound tokens for local and Entra login as part of the same release.

## HTTP and frontend contracts

All routes below are proposed except existing provider discovery and token refresh. Use existing async route helpers, request validation, typed errors, audit infrastructure, and RBAC middleware.

| Method and path | Access | Contract |
| --- | --- | --- |
| `GET /api/auth/providers` | Public | Add LDAP enabled/display/help metadata; expose no hostnames, search bases, credentials, or directory diagnostics |
| `POST /api/auth/ldap/login` | Public, rate limited | `{ username, password }`; same successful authentication DTO as local login |
| `POST /api/auth/refresh` | Existing refresh contract | Retain provider context and force LDAP verification for LDAP refresh tokens |
| `GET /api/auth/ldap/groups` | `rbac:admin` | Bounded `query` and opaque pagination cursor; selected group metadata only |
| `GET /api/auth/ldap/mappings` | `rbac:admin` | List mappings with roles and current/stored group labels |
| `POST /api/auth/ldap/mappings` | `rbac:admin` | Persist a verified group-subject/role mapping |
| `PUT /api/auth/ldap/mappings/:id` | `rbac:admin` | Change enabled state or role; verify directory/group ownership |
| `DELETE /api/auth/ldap/mappings/:id` | `rbac:admin` | Remove mapping and its attributable grants transactionally |
| `POST /api/auth/ldap/test` | `rbac:admin`, rate limited | Test configured TLS/lookup and optionally an exact user/group lookup; accept no user password or arbitrary connection overrides |

Administrative cursors must be bound to the current directory/configuration and filter, bounded in lifetime and opaque to clients. Group creation can map several roles through separate unique mapping records. Mapping administration may show stored mappings during an outage, but cannot verify new directory identities until connectivity returns.

Keep LDAP configured and visible in provider discovery during an outage; its login route can return temporary unavailability. Use `401` with a generic credential message for failed/ambiguous authentication, `403` for an authenticated but ineligible or unassigned user, `429` for rate/capacity limits, and `503` for directory unavailability or incomplete resolution. Return safe error codes; detailed directory reasons belong in restricted logs. All login failures must avoid disclosing whether a username exists.

Reuse existing login throttling, but scope counters to provider, directory ID, and submitted login, with IP limits as well. A local username must not share a lockout counter with an LDAP username. Do not retry user bind failures across endpoints: a rejected credential must not multiply directory lockout attempts.

The login page selects Local or the configured directory for password entry; Entra retains its redirect button. Keep token storage behavior in `auth.svelte.ts`. Show directory source and current directory login/display name in user administration. Render null contact emails safely in auth/user/group DTOs, filtering, search, dialogs, and tables. A missing email is not a broken profile.

Diagnostics return per-stage status, timings, and safe error codes. Test both identity and eligibility visibility for an exact supplied user, without treating that lookup as proof of password authentication. Group diagnostics test direct/nested resolution for selected mapped groups. Redact passwords, token material, raw LDAP diagnostic strings, unnecessary personal fields, and raw connection configuration from responses. Diagnostics use only configured endpoints so they do not become an arbitrary network probe.

## Failure handling and operations

Retry only transient connection establishment failures against configured equivalent endpoints, within the total deadline. Stop on certificate/hostname failures, rejected lookup credentials, invalid user credentials, policy denial, malformed data, or ambiguity. Do not follow LDAP referrals to unconfigured endpoints. Search references or partial results that affect authentication cause validation failure.

Preserve local startup/setup and emergency administrator access during directory outages. Directory availability is a degraded component signal, not process liveness failure. Add a restricted readiness/diagnostic view and metrics or existing structured monitoring hooks for connection latency, validation latency, revalidation failures, limits, and failover. Public health responses must not disclose directory topology.

Use structured logs with `{ component, operation }` and safe provider/directory identifiers. Audit successful/failed login, mapping mutations, manual entitlement edits, suspension, positive revocation, and effective entitlement changes. Avoid one audit event per unchanged five-minute check. Record IDs and reason codes rather than passwords or complete directory entries. Environment lookup credentials remain in the deployment secret boundary; never store another copy in the database.

## Implementation sequence

1. **Schema and identity boundaries:** Add migrations for provider-scoped identity uniqueness, source-owned grants, optional external contact email, local credential scope, profile fields, and validation coordination. Backfill existing accounts and Entra grants. Update DTOs and scoped email callers. Verify SQLite and PostgreSQL upgrades before building LDAP on these assumptions.
2. **Provider-neutral provisioning:** Refactor Entra-specific creation into a shared transactional primitive with explicit default-role policy. Keep Entra defaults/enrollment behavior and manual assignments intact. LDAP explicitly requests no default role and forbids linking/local password creation.
3. **Directory configuration and client:** Add configuration types/parser, presets, conditional validation, TLS, bounded read-only operations, immutable ID codecs, status policies, failover, and direct/nested group resolution. Add the dependency through the approved package-install path.
4. **Authorization administration:** Add mapping persistence, restricted search/diagnostics/routes, source attribution, revision invalidation, and role-management UI controls.
5. **Provider-bound authentication:** Implement LDAP login and common session eligibility, token context, shared dependency wiring, refresh checks, and transport integration. Introduce the one-time session invalidation in the release migration.
6. **Frontend and operator documentation:** Add provider selection, directory-owned profile behavior, null-safe contact fields, examples, and documented policy/diagnostic behavior. Update `backend/.env.example`, `docs/configuration.md`, `docs/api.md`, `docs/openapi.yaml`, `docs/permissions-rbac.md`, and add `docs/integrations/ldap.md`.
7. **Acceptance and rollout:** Run migration, directory interoperability, revocation, RBAC, frontend, and regression coverage. Publish no support claim for real AD until tested against an actual AD environment.

## Session execution plan

These are ordered work packages, not estimates of context-window capacity. One session may complete several packages; a package may need several sessions. The design sections above remain authoritative. Record execution progress here so another agent can resume without conversation history.

### Start and finish each session

1. Read the current repository instructions, this package's prerequisites, its referenced design sections, and the latest handoff record. Check the actual branch, working tree, and prerequisite implementation before relying on recorded status.
2. Understand the affected architecture and callers before editing. Confirm current migration numbers, test locations, and package scripts from the repository. Preserve unrelated work.
3. Work within the selected package. Include the compatibility changes needed to keep local and Entra behavior working at every checkpoint. If a discovered dependency changes the package boundary, record it here before proceeding.
4. Run focused acceptance tests and relevant build/lint checks. Record exact commands and outcomes in the external command log. Update API/configuration contracts whenever an implemented route or variable changes, even when the full operator guide belongs to a later package.
5. Update the progress table and append a handoff entry before ending the session. Mark a package complete only when its acceptance criteria pass; missing AD/PostgreSQL evidence remains pending or blocked. Record pre-existing failures separately from regressions.

Keep LDAP login unavailable until package 5B passes. Use the implementation's agreed configuration and wiring to enforce that boundary, without adding temporary bypasses or advertising unfinished authentication. A checkpoint must preserve existing functionality.

### Package 1 Identity and schema

**Prerequisites:** None. Read [Identity and database design](#identity-and-database-design) and the migrations, identity, profile, and authorization rows in [Acceptance tests](#acceptance-tests).

**Scope and files:** Own forward SQLite/PostgreSQL migrations, identity uniqueness, external email nullability, local credential scope, source-owned grants, mapping/validation records, indexes, views, and revision triggers. Update affected queries and nullable DTO consumers together. Main surfaces: `backend/src/database/migrations/`, `UserService.ts`, `PermissionService.ts`, `AuthenticationService.ts` DTOs, Entra grant reconciliation, and frontend user/email consumers.

**Exclusions:** LDAP network operations, login routes, and token-format changes. Validation tables may exist without enabling session checks.

**Acceptance:** Fresh and upgraded databases preserve local and Entra identities, explicit enrollments, permissions, and referential integrity on both adapters. External missing/duplicate contact emails work; local uniqueness remains enforced. Existing Entra synchronization uses the new provenance model correctly. Null email renders safely.

**Checks:** Focused migration, authorization-state, concurrency, user/Entra provisioning and frontend nullability tests; backend/frontend builds and applicable lint/component checks.

**Handoff:** Record migration numbers, identity/grant keys, scoped email APIs, backfill assumptions, and exact upgrade fixtures/results. Existing writers and readers must agree on the schema before this package is complete.

### Package 2 Shared provisioning

**Prerequisites:** Package 1. Read [Authentication services and login flow](#authentication-services-and-login-flow) and the provisioning transaction rules in [Identity and database design](#identity-and-database-design).

**Scope and files:** Extract provider-neutral transactional provisioning from `backend/src/services/UserService.ts`; adapt `EntraIdService.ts` callers. Define immutable identity inputs, profile ownership, explicit default-role policy, conflict handling, and first-login concurrency. Enforce LDAP account ownership in user/password update routes.

**Exclusions:** Live LDAP access and public LDAP authentication. Preserve existing Entra default-role and explicit enrollment semantics.

**Acceptance:** Existing local/Entra flows pass. Service-level LDAP provisioning creates one account under concurrency, assigns no default role, preserves suspension/manual grants, and prevents local password attachment or implicit linking.

**Checks:** Provisioning, Entra auth-flow/group-sync, user update, and password-boundary regressions; backend build/lint.

**Handoff:** Record the shared provisioning API, transaction ownership, role-policy inputs, and all migrated callers.

### Package 3 Directory configuration and service

**Prerequisites:** Packages 1 and 2. Read [Environment configuration](#environment-configuration), [Authentication services and login flow](#authentication-services-and-login-flow), and [Group resolution and role administration](#group-resolution-and-role-administration).

**Scope and files:** Add typed LDAP configuration through `backend/src/config/`, the reviewed dependency in `backend/package.json` and lockfile, and `LdapDirectoryService` under `backend/src/services/`. Implement TLS, lookup/user-bind isolation, status policies, immutable ID codecs, bounded searches, endpoint failover, and direct/nested membership. Add reproducible directory fixtures and update implemented configuration references.

**Exclusions:** Role-mapping administration, Pabawi token issuance, and frontend login. Keep directory support callable through internal services/tests.

**Acceptance:** Disabled LDAP leaves existing startup behavior intact. Invalid configuration fails; an unreachable configured directory permits local access. OpenLDAP fixtures verify both TLS modes, binding, eligibility, group classes, limits, and cleanup. AD behavior has protocol-level tests, with actual AD evidence explicitly deferred if unavailable.

**Checks:** Configuration/client unit tests, real OpenLDAP integration tests, backend build/lint, and documentation contracts.

**Handoff:** Record the pinned library release, service API, fixture commands, supported policy attributes, TLS/failover evidence, and real AD cases still outstanding.

### Package 4 RBAC mapping administration

**Prerequisites:** Packages 1 through 3. Read [Group resolution and role administration](#group-resolution-and-role-administration) and [HTTP and frontend contracts](#http-and-frontend-contracts).

**Scope and files:** Implement mapping persistence, bounded directory group search, diagnostics, administrative routes, audit events, materialized-grant withdrawal, and cross-process revision invalidation. Main surfaces: `backend/src/services/`, `backend/src/routes/`, server/container wiring, and API documentation. Complete the backend contract here; mapping controls are owned by package 6.

**Exclusions:** Public LDAP login, token changes, and bulk user import.

**Acceptance:** Search/test/mapping endpoints enforce `rbac:admin`. Mapping edits preserve grants from other sources, invalidate stale validation state, and cannot be undone by an in-flight old revision. Outages and fabricated group identities produce the agreed failures without leaking credentials.

**Checks:** Supertest permission/error cases, provenance and revision-race tests on both adapters, backend build/lint, and documentation contracts.

**Handoff:** Record route/service contracts, mapping revision behavior, audit events, and frontend integration examples using synthetic IDs.

### Package 5 Authentication and session enforcement

Read [Session freshness and revocation](#session-freshness-and-revocation), [HTTP and frontend contracts](#http-and-frontend-contracts), and the freshness, concurrency, and transport acceptance rows. Split this package at the following checkpoints when needed.

#### Package 5A Provider context and shared authentication wiring

**Prerequisites:** Packages 1, 2, and 4.

**Scope and files:** Add verified provider/identity context to token creation, validation, and rotation for existing authentication providers. Replace isolated authentication-service construction with shared configured dependencies. Main surfaces: `AuthenticationService.ts`, `EntraIdService.ts`, `authMiddleware.ts`, server/container wiring, and authentication routes. Add the intentional one-time session invalidation in the appropriate forward migration.

**Exclusions:** Issuing LDAP tokens before 5B is complete.

**Acceptance:** Local and Entra login/refresh remain functional with explicit context. Forged, mismatched, or invalidated context fails. The legacy-session transition requires reauthentication without guessing provider ownership. All relevant callers can reach the shared eligibility seam.

**Checks:** Local/Entra login-refresh, revocation and context-binding tests; fresh/upgrade session invalidation on both adapters; backend build/lint.

**Handoff:** Record token payload contracts, migration/session invalidation behavior, dependency wiring, and exact transport integration points remaining for 5B.

#### Package 5B LDAP login and all transport checks

**Prerequisites:** Packages 3, 4, and 5A.

**Scope and files:** Implement `LdapAuthenticationService`, explicit login and provider discovery, forced refresh verification, persisted freshness/leases/fencing, grant/profile reconciliation, provider-scoped throttling, and revocation. Wire REST, `SessionAuthorization`, SSE, MCP, and console authorization to shared eligibility enforcement.

**Exclusions:** Login UI and automatic cancellation of already dispatched infrastructure work.

**Acceptance:** LDAP tokens are issued only after the complete credential/eligibility/role transaction. Every supported transport blocks stale state at the deadline. Refresh forces verification; failed work cannot extend freshness or resurrect grants. Positive revocation remains terminal while transient recovery follows the agreed policy. Local/Entra sessions remain independent of LDAP availability.

**Checks:** HTTP login/refresh integration tests, fake-clock deadline tests, cross-process coordination and revision-race tests, plus REST/SSE/MCP/console revocation coverage. Run backend regressions, build/lint, and documentation contracts.

**Handoff:** Record enforcement evidence for each transport, freshness/lease state transitions, throttling keys, outage/recovery behavior, and any remaining interoperability evidence. Package 5 is complete only when both checkpoints pass.

### Package 6 Frontend and operator documentation

**Prerequisites:** Packages 4 and 5B, including stable HTTP/DTO contracts. Read [HTTP and frontend contracts](#http-and-frontend-contracts), [Environment configuration](#environment-configuration), and [Failure handling and operations](#failure-handling-and-operations).

**Scope and files:** Implement common provider discovery, explicit password-provider selection, role-mapping controls, restricted diagnostics, directory source labels, and directory-owned profile editing rules. Main surfaces: `LoginPage.svelte`, `auth.svelte.ts`, `entraIdAuth.svelte.ts`, role/user management pages and dialogs. Finish `docs/integrations/ldap.md`, configuration/env examples, API/OpenAPI, and RBAC documentation.

**Exclusions:** Reworking the agreed backend identity/security contract or claiming unverified AD interoperability.

**Acceptance:** Provider selection never falls through; valid short directory credentials reach LDAP; nullable email and read-only profile fields work throughout user management. Mapping and diagnostic controls respect API and page permissions. Local and Entra UI regressions pass. Operator instructions explain status visibility, exclusions, outages, restart, and upgrade reauthentication.

**Checks:** Focused component/API integration tests, appropriate browser/E2E flows, frontend tests/build/lint, component checking, and documentation contracts.

**Handoff:** Record UI/browser evidence, operator guide locations, actual implemented defaults, and any remaining end-to-end cases.

### Package 7 Interoperability and rollout

**Prerequisites:** Packages 1 through 6. Read the complete [Acceptance tests](#acceptance-tests), [Failure handling and operations](#failure-handling-and-operations), and [Completion criteria](#completion-criteria).

**Scope and files:** Verify real OpenLDAP and AD behavior, both database adapters, multi-process races, failover, every transport, and existing local/Entra functionality. Fix failures in their owning modules with regression coverage. Finish deployment and upgrade instructions based on observed behavior.

**Exclusions:** Production deployment, remote pushes, PR creation, destructive cleanup, or sharing real directory data without the confirmations required by repository instructions.

**Acceptance:** Every acceptance row has passing evidence. Missing real AD or PostgreSQL access is a recorded blocker to completion, not a waived test. Operators can configure either supported directory from the guide and understand the intentional session invalidation.

**Checks:** The full commands under [Commands for the implementation phase](#commands-for-the-implementation-phase), relevant E2E checks, real directory fixtures, and SQLite/PostgreSQL upgrade scenarios. Record unavailable tools and their effect on completion.

**Handoff:** Record release readiness, exact environment/version evidence without secrets or personal records, unresolved blockers, and the deployment procedure.

### Progress and handoff records

Update this table as work proceeds. Status values: `pending`, `in_progress`, `blocked`, or `complete`. A package can remain `in_progress` across several agent sessions.

| Package | Status | Completion commit or working tree reference | Latest handoff |
| --- | --- | --- | --- |
| 1 Identity and schema | complete | Branch `151`, base `2c23a95`, uncommitted migration 031 and consumers | [2026-10-21 Codex](#handoff-2026-10-21-codex-package-1) |
| 2 Shared provisioning | pending | Not started | None |
| 3 Directory configuration and service | pending | Not started | None |
| 4 RBAC mapping administration | pending | Not started | None |
| 5A Provider context and wiring | pending | Not started | None |
| 5B LDAP login and transport enforcement | pending | Not started | None |
| 6 Frontend and operator documentation | pending | Not started | None |
| 7 Interoperability and rollout | pending | Not started | None |

Append a record using the following fields after each implementation session. Use an actual commit hash when available, otherwise identify the branch/base and changed paths explicitly. Preserve prior records and correct outdated findings with a new entry.

```text
Date and agent:
Package and checkpoint:
Branch, base commit, completion commit or uncommitted paths:
Completed scope and changed interfaces:
Verification: exact commands, outcomes, and external log reference:
Pre-existing failures:
Remaining work and blockers:
Decisions or discoveries affecting the next package:
Next action and acceptance criterion still to satisfy:
```

For a new agent session, use: "Read AGENTS.md and docs/internal/plans/ldap-authentication.md. Resume package <ID> from its latest handoff. Complete its scope and acceptance checks, then update the progress table and append a handoff record. Follow the current command-log instructions."

## Acceptance tests

Use existing Vitest, Supertest, migration fixtures, security tests, and frontend conventions. Place backend unit tests under `backend/test/unit/`, HTTP flows under `backend/test/integration/`, revocation cases under `backend/test/security/`, and database upgrade/concurrency tests under `backend/test/database/`. Co-locate Svelte tests with their components.

| Area | Required evidence |
| --- | --- |
| Configuration | Disabled LDAP requires no credentials; enabled invalid configuration fails; malformed JSON, DNs, attributes, filters, TLS mode, missing CA files, and inconsistent anonymous settings fail |
| TLS and failover | Trusted LDAPS and StartTLS succeed; untrusted CA, hostname mismatch, forbidden wildcard, failed upgrade, and plaintext attempts fail; connection failover works without credential replay |
| Credentials | Empty passwords never bind; correct credentials succeed; wrong credentials, zero/multiple matches, missing immutable IDs, injection input, partial searches, and timeouts issue no tokens |
| Identity | Renamed/moved users retain identity; reused names/DNs do not inherit accounts; duplicate/missing external emails work; local names/emails retain their rules; concurrent logins create one account |
| Profiles | Directory changes refresh safely; missing names/email render; profile sync does not revoke valid sessions or undo local suspension; LDAP password/profile writes fail server-side |
| Authorization | No default role; zero-role user gets no token; manual assignment enables subsequent login; multiple mappings union roles; one removed mapping preserves other provenance |
| Groups | Direct and nested OpenLDAP/AD membership, cycle detection, scope, depth/result limits, group rename/recreation, and unsupported AD matching-rule behavior |
| Status | AD observable disabled/expired/locked states; OpenLDAP positive policy including missing attributes; bind-only limitations documented |
| Freshness | Fake-clock tests at the exact deadline; refresh forces verification; outage does not extend freshness; transient recovery resumes valid sessions; positive revocation remains terminal |
| Concurrency | Cross-process leases, fencing, stale completion, mapping-revision races, and simultaneous refresh cannot restore obsolete grants or timestamps |
| Transports | REST, refresh, SSE, MCP, and console websocket reject stale/invalid LDAP state while local and Entra remain independent |
| Administration | Every search/mapping/test endpoint rejects missing permissions; request fields cannot override endpoints or fabricate group identity; mutations audit and invalidate permissions |
| Migrations | Fresh and upgraded SQLite/PostgreSQL preserve users, Entra enrollments, grants, foreign keys, triggers/views, uniqueness, and intentional session invalidation |
| UI | Provider selection never falls through; LDAP accepts directory-valid short credentials; directory fields are read-only; null email, mappings, empty results, and outages render correctly |

Run real OpenLDAP integration tests for both TLS modes and supported group classes with an explicit eligibility policy. Test real AD for GUID handling, account state, nested matching rules, large/ranged membership, and failover. A mock LDAP server or Samba-only result is insufficient evidence of real AD compatibility.

### Commands for the implementation phase

Run from the repository root unless stated otherwise. These are planned commands, not commands executed while writing this document. Log commands according to the current repository instructions in `~/.agents/logs/pabawi.jsonl`, outside the repository. Create the log directory/file if missing, append one JSON object per line, redact secrets, and record command outcomes after completion. Skip trivial read-only commands as specified in AGENTS.md.

```bash
# Add the backend dependency through the required package review wrapper.
socket npm install ldapts --workspace=backend

# Run focused new tests first, using their actual implementation filenames.
# Then check the complete workspace and documentation contracts.
npm run test --workspace=backend
npm run test --workspace=frontend
npm run build
npm run lint
npm run check:components
node --test scripts/documentation/contracts.test.mjs
bash scripts/quality/secret-scan.sh
git diff --check
```

Use a reproducible directory test fixture with its own documented startup and cleanup commands during implementation. Scan downloaded fixture artifacts with ClamAV after use as required by the project instructions. Do not commit directory secrets, real user records, or production CA private keys. The CA bundle contains public certificates only.

## Completion criteria

The implementation is complete when both supported directory types authenticate and authorize through the agreed configuration, users can be managed without identity collisions or implicit linking, directory eligibility controls every supported transport within the freshness bound, migrations preserve existing local/Entra behavior, and the acceptance matrix passes on SQLite and PostgreSQL. The operator guide must state observable status limitations, group scope exclusions, restart requirements, outage behavior, and the one-time reauthentication required on upgrade.


## Handoff 2026-10-21 Codex package 1

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 1, identity and schema, complete. LDAP network access, provider discovery, login routes, token context, and runtime eligibility enforcement remain assigned to later packages.

**Branch, base commit, completion commit or uncommitted paths:** Branch `151`, base `2c23a95b81a2492d6dec5f3a76ea0b3afe06e76f`. No completion commit was created. The plan was already untracked at the start of this session. All implementation changes remain in the working tree:

```text
backend/src/database/migrations/031_external_identity_boundaries.postgres.sql
backend/src/database/migrations/031_external_identity_boundaries.sqlite.sql
backend/src/services/AuthenticationService.ts
backend/src/services/EntraIdService.ts
backend/src/services/GroupService.ts
backend/src/services/UserService.ts
backend/test/UserService.password.test.ts
backend/test/database/BatchLifecycleMigration.test.ts
backend/test/database/external-identity-boundaries.test.ts
backend/test/database/migration-integration.test.ts
backend/test/database/rbac-schema.test.ts
backend/test/database/sso-concurrency.test.ts
backend/test/properties/EntraIdAuthCode.property.test.ts
backend/test/properties/EntraIdCallback.property.test.ts
backend/test/properties/EntraIdGroupSync.property.test.ts
backend/test/properties/EntraIdProvisioning.property.test.ts
backend/test/properties/user/email-uniqueness.property.test.ts
backend/test/services/AuthenticationService.bruteforce.test.ts
backend/test/unit/services/EntraIdService.test.ts
docs/api.md
docs/internal/plans/ldap-authentication.md
docs/openapi.yaml
frontend/src/components/GroupDetailDialog.svelte
frontend/src/components/UserDetailDialog.svelte
frontend/src/components/user-contact-nullability.test.ts
frontend/src/lib/auth.svelte.ts
frontend/src/lib/auth.test.ts
frontend/src/lib/permission-state.test.ts
frontend/src/pages/UserManagementPage.svelte
```

**Completed scope and changed interfaces:**

- Added forward migration `031_external_identity_boundaries.sqlite.sql` and its PostgreSQL counterpart. Fresh schemas and populated migration-030 upgrades retain user IDs, identity IDs, explicit Entra enrollments, original profile data, session versions, manual/group assignments, revoked tokens, audit links, and journal links. Historic migration-016 upgrade fixtures also pass through 031.
- Identity uniqueness is now `(provider, issuer, subject)`. Added composite parent keys to enforce grant-to-user ownership and LDAP metadata-to-directory ownership. Mutable LDAP login/DN locators are stored in `ldap_identity_metadata`; they are deliberately nonunique and are never identity keys.
- `users.local_auth_enabled` is the local account/credential scope. Backfill sets it to 1 when a password hash exists and 0 otherwise, including explicitly enrolled Entra users with local passwords. External-only rows require a null password hash. Local rows require nonempty contact email, with uniqueness enforced by the partial `idx_users_local_email` index. Existing usernames are preserved; local creation reserves the case-insensitive `ldap:` prefix. New Entra creation explicitly uses scope 0 and stores absent email as null.
- Added nullable `display_name`; backend/auth/frontend user DTOs expose `displayName: string | null` and `email: string | null`. Internal password hashes are consistently nullable. Group member contact email is nullable. User filtering, user details, and group member rendering handle absent contact email. API/OpenAPI documentation describes these implemented fields.
- Removed ambiguous singular email lookup. `UserService.findLocalByEmail(email)` returns the unique local-scoped account, while `findAllByEmail(email)` returns every contact match. Entra provisioning rejects any existing email match without linking. Entra creation serializes its collision checks using the existing default-role configuration row inside its transaction; independent-connection tests cover simultaneous subjects sharing one email.
- `federated_user_roles` now has primary key `(identity_id, role_id, source_key)`. Group-derived LDAP grants also reference `mapping_id` and `directory_id`, with composite foreign keys binding the role, mapping, directory, identity, and user. Existing materialized Entra grants are backfilled to each existing Entra identity for that user with source key `legacy`. Detached historical grants with no remaining Entra identity are preserved in manual `user_roles`, with a database timestamp, rather than discarded. Existing migration-027 legacy markers retain their established first-reconciliation cleanup semantics.
- `EntraIdService.syncGroupRoles(identityId, groups)` now requires an Entra identity from the configured issuer, deletes only that identity's grants, and stores `group:<lowercase-group-id>` source keys. Multiple groups granting one role retain separate provenance. The callback resolves its authenticating identity before reconciliation. Manual assignments and grants owned by other identities survive. `effective_user_roles` retains its UNION deduplication; existing PermissionService and token role queries already consume this view, so no separate permission-query rewrite was needed.
- Added `ldap_directory_state`, `external_group_mappings`, `ldap_validation_state`, and `ldap_validation_leases`. Mapping uniqueness is `(directory_id, group_subject, role_id)`. Mapping mutation triggers increment persisted directory revision, invalidate directory validation timestamps, and change authorization revision on both adapters. A BEFORE UPDATE trigger withdraws attributable grants before a role/scope composite-key edit; AFTER triggers handle revision changes. Deletion cascades only attributable grants. Validation timestamps/lease expiry are Unix milliseconds in BIGINT fields; generation fields are nonnegative BIGINTs. PostgreSQL returns BIGINT values as strings through the current adapter. Lease/fencing and freshness algorithms are still package 5B work.
- SQLite rebuilds use the existing runner's foreign-key suspension, atomic transaction, and pre-commit foreign-key check. Application indexes, user/session triggers, external-role revision triggers, and the effective-role view are recreated. Failed rebuild rollback, restored enforcement, profile updates without revocation, sensitive-field revocation, mapping rollback, role edits, identity cascade cleanup, and cross-connection cache invalidation are covered.
- Compatibility adjustment: explicitly administrated password attachment for an existing Entra-only account enables its local scope atomically. LDAP identities cannot acquire local passwords through that path. Complete LDAP profile ownership and shared provider-neutral provisioning remain package 2.

**Verification: exact commands, outcomes, and external log reference:**

Commands ran from the repository root. The append-only command log is `~/.agents/logs/pabawi.jsonl`. PostgreSQL used the already-present `postgres:17` image, version 17.11; SQLite was 3.52.0. No dependencies or fixture artifacts were downloaded. Host Node was 26.8.1; the repository declares Node >=24.21.0 and <25, so the supported-engine release check remains separate evidence.

- `docker run --detach --name pabawi-ldap-p1-postgres --pull never -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1::5432 postgres:17`: isolated local test server, loopback port 63167. Fresh acceptance databases avoided checksum reuse while 031 was being finalized. The fixture was stopped with `docker stop pabawi-ldap-p1-postgres` after final verification; the stopped container was retained.
- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:63167/ldap_package1_verified npm run test --workspace=backend > /tmp/pabawi-ldap-p1-backend-final.log 2>&1 && npm run build:backend > /tmp/pabawi-ldap-p1-build-final.log 2>&1`: PASS, 239 test files passed, one skipped; 3863 tests passed, two skipped, one todo. The backend artifact includes the final migration files.
- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:63167/ldap_package1_final npm run test --workspace=backend -- test/database/external-identity-boundaries.test.ts`: PASS after the PostgreSQL BEFORE UPDATE fix, 17 tests. The final full run also includes these tests against the final timestamp SQL.
- `npm run test --workspace=frontend > /tmp/pabawi-ldap-p1-frontend-tests-final.log 2>&1`: PASS, 60 files and 1046 tests, including null email rendering/filtering and user/group detail dialogs.
- `npm run build && npm run check:components > /tmp/pabawi-ldap-p1-components.log 2>&1`: PASS, both production builds and zero component errors. Subsequent `npm run build:backend && npm run lint && npm run check:components > /tmp/pabawi-ldap-p1-components-acceptance.log 2>&1 && git diff --check` also passed; frontend source did not change after its successful production build. Vite retained its existing large-chunk warning.
- `node --test --test-name-pattern='every declared REST|API guide|OpenAPI version|public exchanges|configuration inventory|architecture registry' scripts/documentation/contracts.test.mjs`: PASS, six contracts covering routes, API/OpenAPI, auth boundaries, configuration, and architecture.
- Changed/new-file `detect-secrets scan` with the existing pre-commit environment, followed by a comparison against reviewed baseline hashes: PASS, zero new unreviewed findings. Exact file arguments and comparison command are in the external log. Synthetic credential fixtures are explicitly annotated. The baseline was not changed.
- `git diff --check`: PASS. The command log parses as JSON Lines.

**Pre-existing failures:**

- Unfiltered `node --test scripts/documentation/contracts.test.mjs` reports six passes and one failure: package metadata is 1.5.1, but CHANGELOG.md lacks a dated 1.5.1 entry and begins with 1.6.0 Unreleased. The relevant version/changelog files match the starting commit.
- `bash scripts/quality/secret-scan.sh` initially could not find detect-secrets on PATH. Using `PATH=/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin:$PATH bash scripts/quality/secret-scan.sh` runs the scanner and reports four pre-existing findings across unchanged `backend/package.json`, `backend/src/cli/resetUserPassword.ts`, and `backend/test/unit/cli/resetUserPassword.test.ts`. These files match HEAD; the LDAP change adds none.
- One repeated full backend run returned an intermittent 404 in the unchanged `test/security/workload-limits.test.ts`. `npm run test --workspace=backend -- test/security/workload-limits.test.ts` passed all five tests in isolation, and the subsequent final complete run passed. No unrelated workload-limit code was modified.

**Remaining work and blockers:** No package-1 acceptance blocker remains. The unrelated release-documentation and tracked secret-scan failures above remain unresolved. Directory interoperability, supported-engine release evidence, runtime mapping administration, and session enforcement belong to later packages. No LDAP authentication is advertised or enabled.

**Decisions or discoveries affecting the next package:** Use provider `ldap` and stable directory ID as issuer when creating LDAP identities. Reserve deterministic internal usernames beneath `ldap:` and use immutable subjects, not DN or login. Preserve the explicit local scope and the scoped email APIs. Entra's default role remains a manual `user_roles` assignment, and its legacy-marker behavior is unchanged. Mapping updates already withdraw old grants and invalidate persisted state through database triggers; callers must use a transaction and later add revision/fencing comparisons rather than relying only on cached permissions. Existing sessions are preserved by 031; intentional release invalidation remains package 5A. Validation and lease tables exist without any enabled runtime LDAP enforcement.

**Next action and acceptance criterion still to satisfy:** Start package 2. Extract shared transactional provisioning, implement deterministic immutable LDAP account creation without default roles or implicit linking, preserve suspension/manual grants and Entra enrollment behavior, and enforce complete LDAP profile/password ownership. Verify concurrent first login creates one account, zero-role LDAP provisioning issues no tokens, and local/Entra regressions still pass.
