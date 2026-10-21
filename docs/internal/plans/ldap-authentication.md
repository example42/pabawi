# LDAP authentication implementation plan

**Status:** Packages 1 through 6 complete; package 7 CI integration, AD harness and runner failure checks implemented, blocked on actual AD
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

Directory-service configuration, public authentication and frontend provider selection are implemented through package 6. See [the operator guide](../../integrations/ldap.md). Example:

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

The route contracts and frontend controls below are implemented through package 6. Use existing async route helpers, request validation, typed errors, audit infrastructure, and RBAC middleware.

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
| 1 Identity and schema | complete | Commit `a739cf2`, migration 031 and consumers | [2026-10-21 Codex](#handoff-2026-10-21-codex-package-1) |
| 2 Shared provisioning | complete | Commit `2d37548`, verified against current source | [2026-10-21 Codex](#handoff-2026-10-21-codex-package-2) |
| 3 Directory configuration and service | complete | Commit `4fac169`, verified against current source | [2026-10-21 Codex](#handoff-2026-10-21-codex-package-3) |
| 4 RBAC mapping administration | complete | Commit `4a5c2b4`, verified against current source | [2026-10-21 Codex](#handoff-2026-10-21-codex-package-4) |
| 5A Provider context and wiring | complete | Commit `7f58092`, verified against current source | [2026-10-21 Codex](#handoff-2026-10-21-codex-package-5a) |
| 5B LDAP login and transport enforcement | complete | Commit `56ea384`, verified against current source | [2026-10-21 Codex](#handoff-2026-10-21-codex-package-5b) |
| 6 Frontend and operator documentation | complete | Commit `55c8107`, verified against current source | [2026-10-21 Codex](#handoff-2026-10-21-codex-package-6) |
| 7 Interoperability and rollout | blocked | Branch `151`, current base `7389784`; CI integration, opt-in AD harness and runner lifecycle regressions implemented; [acceptance evidence](ldap-acceptance.md) | [2026-10-21 Codex CI and harness](#handoff-2026-10-21-codex-package-7-ci-and-harness) |

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


## Handoff 2026-10-21 Codex package 2

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 2, shared provisioning, complete. Package 3 is the next eligible package. LDAP network access, public authentication, group reconciliation and session freshness enforcement remain in their assigned later packages.

**Branch, base commit, completion commit or uncommitted paths:** Branch `151`, base `a739cf296fb01b872ed4b234eba971e51f0bb783`. The initial working tree was clean. Package 1's previously uncommitted changes are now committed in that base; its schema and compatibility claims were verified against the current source and both database adapters. No package-2 completion commit was created. The package-2 working tree contains:

```text
backend/src/routes/auth.ts
backend/src/routes/users.ts
backend/src/services/EntraIdService.ts
backend/src/services/UserService.ts
backend/test/database/federated-provisioning.test.ts
backend/test/integration/ldap-account-ownership.test.ts
backend/test/properties/EntraIdProvisioning.property.test.ts
backend/test/unit/services/EntraIdService.test.ts
docs/api.md
docs/internal/plans/ldap-authentication.md
docs/openapi.yaml
```

**Completed scope and changed interfaces:**

- `UserService.createFederatedUser(input: FederatedProvisioningInput): Promise<User>` is now provider-neutral and idempotent. Its input contains immutable `provider`, `issuer`, `subject` and explicit nullable contact/display name plus given name/surname. The discriminated input requires `defaultRole: 'configured'` and a provider-derived username for Entra, or `defaultRole: 'none'` and current `loginName`/`dn` for LDAP. The shared service no longer imports Entra token claims.
- This method owns the transaction. SQLite serializes through the adapter's existing BEGIN IMMEDIATE transaction; PostgreSQL provisioning writers lock the shared default-role configuration row before rereading identity and checking collisions. An upsert ensures the lock exists even if the configuration row is absent, preserving SetupService's existing Viewer fallback without overwriting configured values. Independent-connection tests start without that row and converge twelve simultaneous LDAP calls to one account.
- New LDAP usernames are `ldap:` followed by SHA-256 of the JSON tuple `[provider, issuer, subject]`. Mutable login/DN and email never select an account. Reused locators, shared or absent email, equal subjects in different directories and local/Entra contact matches create separate accounts. Missing issuer, immutable subject or locators fail before writes. Direct LDAP linking to existing users is forbidden; LDAP-owned accounts also reject subsequent federated enrollment.
- User, identity, configured initial Entra role, LDAP metadata and initially unvalidated LDAP state are committed atomically. LDAP creates no default/manual/federated grant and issues no token. Its validation timestamp remains null, generation 0 and config revision empty. The primitive does not claim directory eligibility or freshness. Metadata write failures roll back all newly created records.
- Returning LDAP identities refresh email, display name, given name, surname, login and DN. They preserve internal username, Pabawi suspension, administrative status, manual grants, credentials and existing validation state. Profile refresh preserves existing valid sessions. A provisioned zero-role account remains available for manual assignment and subsequent provisioning retains the assignment.
- EntraIdService is the only production caller migrated from raw token claims to the shared input. Username derivation moved into that caller. Existing Entra profile immutability, default-role policy, explicit local-account enrollment and local password administration remain intact. Shared identity conflicts use `FederatedAccountError`; Entra translates collision errors to its established error code. Both the initial and transactional returning paths still check suspension.
- `UserService.requireLocalProfileOwnership(userId)` rejects LDAP-owned contact/name/password writes, including legacy mixed accounts and administrators. `updateUser` uses that guard before any mutation, protecting HTTP administration and the existing password-reset CLI. Authenticated password changes check ownership before password verification or lockout accounting. The affected user/password routes return HTTP 403 with `DIRECTORY_ACCOUNT_READ_ONLY`. Suspension, admin status and manual roles remain locally editable.
- Updated API/OpenAPI user update contracts, Entra unit/property assertions and two new acceptance files. LDAP remains absent from provider discovery and has no public login route. No dependency or migration was added.

**Verification: exact commands, outcomes, and external log reference:**

All commands ran from the repository root and were recorded in `~/.agents/logs/pabawi.jsonl`. Host Node was 26.8.1, outside the declared >=24.21.0 and <25 engine range; supported-engine release evidence remains outstanding. PostgreSQL was 17.11, using the already-present package-1 fixture. No packages or fixture artifacts were downloaded.

- `npm run test --workspace=backend -- test/database/external-identity-boundaries.test.ts test/database/sso-concurrency.test.ts > /tmp/pabawi-ldap-p2-baseline.log 2>&1`: PASS before edits, ten SQLite tests; nine PostgreSQL tests skipped until starting the fixture.
- `docker start pabawi-ldap-p1-postgres`: restarted the existing isolated fixture, now exposed at loopback port 55612. `docker exec pabawi-ldap-p1-postgres createdb -U postgres ldap_package2_verified` created a fresh acceptance database. The fixture was stopped with `docker stop pabawi-ldap-p1-postgres` after verification; the stopped container and acceptance database were retained.
- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55612/postgres npm run test --workspace=backend -- test/database/federated-provisioning.test.ts test/database/external-identity-boundaries.test.ts test/database/sso-concurrency.test.ts > /tmp/pabawi-ldap-p2-focused.log 2>&1`: PASS, 35 tests across SQLite/PostgreSQL.
- `npm run test --workspace=backend -- test/integration/ldap-account-ownership.test.ts test/unit/services/EntraIdService.test.ts test/properties/EntraIdProvisioning.property.test.ts test/integration/EntraIdAuthFlow.test.ts > /tmp/pabawi-ldap-p2-compat-final.log 2>&1`: PASS, four files and 50 tests.
- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55612/ldap_package2_verified npm run test --workspace=backend > /tmp/pabawi-ldap-p2-backend-acceptance.log 2>&1`: PASS on the final production code, 241 files passed, one skipped; 3883 tests passed, two skipped, one todo. This includes migration upgrades, PostgreSQL/SQLite concurrency, Entra group synchronization/auth flows, local authentication, user updates and password/CLI regressions.
- `npm run build:backend > /tmp/pabawi-ldap-p2-build-acceptance.log 2>&1 && npm run lint > /tmp/pabawi-ldap-p2-lint-acceptance.log 2>&1`: PASS, backend compilation and both workspace linters.
- `node --test scripts/documentation/contracts.test.mjs > /tmp/pabawi-ldap-p2-doc-contracts.log 2>&1`: six contracts pass; the unchanged release/changelog mismatch fails as recorded below.
- `PATH=/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin:$PATH bash scripts/quality/secret-scan.sh > /tmp/pabawi-ldap-p2-secrets-full.log 2>&1`: the same four pre-existing findings, detailed below. An additional scanner pass covers all changed and untracked package-2 files and compares their hashes with the reviewed baseline; the baseline is unchanged. PASS, zero new unreviewed findings. Its exact Python/scanner commands and results are in the external command log.
- `npm run test --workspace=backend -- test/integration/ldap-account-ownership.test.ts > /tmp/pabawi-ldap-p2-http-final.log 2>&1`: PASS, four tests after the final synthetic fixture adjustment.
- `git diff --check`: PASS. Frontend source did not change; frontend tests/component checks were not rerun for this backend package.

Initial new-code verification found a short synthetic JWT secret in the new HTTP test fixture and four lint diagnostics. These were corrected before acceptance. The changed-file scan also identified an inline synthetic test password, which now reuses the annotated fixture constant.

**Pre-existing failures:**

- Release metadata remains version 1.5.1, while CHANGELOG.md has no dated 1.5.1 entry and starts with 1.6.0 Unreleased. All six other documentation contracts pass.
- Full tracked-tree secret scan reports four unchanged findings: one in `backend/package.json`, two in `backend/src/cli/resetUserPassword.ts`, and one in `backend/test/unit/cli/resetUserPassword.test.ts`. These files and the relevant version/changelog files match the starting commit. No baseline entries were approved or changed.

**Remaining work and blockers:** No package-2 acceptance blocker remains. The two repository-wide check failures above remain release blockers outside this package. The supported Node engine, live OpenLDAP and real AD evidence remain outstanding for their later packages. No live directory was accessed.

**Decisions or discoveries affecting the next package:** Supply LDAP directory ID as issuer and only a proven immutable subject from the future directory service. That service must canonicalize/validate directory identifiers and supply profile fields without splitting display names. The provisioning primitive owns its transaction and the adapters reject nested transactions. Package 5B must extend the same transaction to reconcile LDAP-owned grants and publish revision/fencing-checked freshness atomically; wrapping the current public method in another transaction is invalid. Its current null validation state is intentional and must never be treated as session eligibility. Existing validation rows are preserved during profile refresh.

**Next action and acceptance criterion still to satisfy:** Start package 3. Add validated disabled-by-default directory configuration, the reviewed/pinned ldapts dependency, bounded read-only directory operations, immutable ID codecs and reproducible real OpenLDAP fixtures for verified LDAPS and StartTLS. Keep public LDAP authentication unavailable. Record real AD evidence still deferred if no actual AD environment is available.


## Handoff 2026-10-21 Codex package 3

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 3, directory configuration and service, complete. Package 4 is next eligible. LDAP provider discovery, login endpoints, Pabawi token issuance, mapping administration and session enforcement remain unavailable until their assigned packages.

**Branch, base commit, completion commit or uncommitted paths:** Branch 151, base 2d37548. The starting tree was clean. Package 2 is now committed in that base, superseding its previous uncommitted reference. Inspected migrations 031, shared provisioning, profile ownership, Entra callers and authentication boundaries; verified their behavior with SQLite and PostgreSQL tests. No completion commit was created. Changed/new paths:

~~~text
backend/.env.example
backend/package.json
backend/src/config/ConfigService.ts
backend/src/config/schema.ts
backend/src/config/ldap.ts
backend/src/config/ldapFilter.ts
backend/src/services/LdapDirectoryService.ts
backend/src/services/ldap/LdapDirectoryError.ts
backend/src/services/ldap/identity.ts
backend/src/services/ldap/policy.ts
backend/src/services/ldap/transport.ts
backend/src/types/ldapjs-dn.d.ts
backend/src/types/node-tls.d.ts
backend/test/config/LdapConfig.test.ts
backend/test/unit/services/LdapDirectoryService.test.ts
backend/test/integration/ldap-directory.test.ts
backend/test/fixtures/ldap/Dockerfile
backend/test/fixtures/ldap/entrypoint.sh
backend/test/fixtures/ldap/seed.ldif
backend/test/fixtures/ldap/README.md
docs/configuration.md
docs/internal/plans/ldap-authentication.md
package-lock.json
scripts/documentation/source-inventory.mjs
~~~

**Completed scope and changed interfaces:**

- ConfigService.getLdapConfig(): LdapConfig | null and AppConfig.ldap expose validated configuration. LDAP_ENABLED defaults false and accepts only literal booleans. Disabled mode ignores other directory settings. Enabled mode validates all agreed variables, presets, FQDNs, directory IDs, endpoint JSON, bounds, DN/attribute/filter syntax, anonymous lookup consistency and readable PEM certificates. Configuration construction opens no network connection, preserving startup/local access during directory outages. Directory ID is case-sensitive. Environment access remains inside configuration parsing.
- Pinned ldapts 9.2.0 and @ldapjs/dn 1.1.0 through socket npm install --workspace=backend --save-exact. Both install reviews reported no new risks. ldapts requires Node >=22, compatible with the supported Node 24 range. Parsed DNs support validation, scope and locator comparisons. Maintenance limitation: registry metadata marks @ldapjs/dn and its @ldapjs/asn1 dependency decommissioned. This is recorded for dependency-maintenance review before release, separately from directory interoperability.
- LdapDirectoryService(config, logger, connector?) exposes authenticate(loginName, password, mappedGroupSubjects?), revalidate(subject, mappedGroupSubjects?), searchGroups(query) and resolveGroup(subject). Authentication/revalidation return { user, groupSubjects }; users contain immutable subject, current DN/login, display name, nullable email and given/surname fields. Search/resolve return { subject, dn, name }. These operations perform no database writes, provisioning or token issuance.
- Each transaction has bounded immediate admission and one deadline spanning endpoints, TLS, binds, searches and traversal. Abort closes tracked TCP/TLS sockets, rejects unfinished work and prevents reconnects. Operation/connect timeouts are separately bounded. Lookup and user-bind clients are isolated at the selected endpoint. Empty/oversized credentials fail before connecting; passwords are untrimmed. Automatic rebinding is disabled. Failover ends before credential-bearing lookup binding; user passwords are never retried against another endpoint.
- Both TLS modes require TLS >=1.2, CA verification, endpoint SNI, normal hostname validation and the configured additional wildcard restriction. Extra CA material augments Node's default trust roots, including configured system/extra roots. StartTLS failure cannot fall back to plaintext. A local TLS declaration covers getCACertificates, available in supported Node 24 but absent from the existing Node 20 type package.
- Runtime queries use typed filter objects, including Buffer-valued AD GUID equality. Configured filters receive structural/parser validation and byte restoration before BER encoding. Tests exposed ldapts accepting unbalanced syntax and converting escaped octets through Latin-1. The implementation rejects malformed syntax and preserves binary assertions and escaped/literal UTF-8. No raw client filter or executable template is accepted.
- Subjects are validated non-nil lowercase UUIDs. AD GUID conversion reverses the Windows little-endian fields and reconstructs exact binary assertion bytes. Missing/multivalued/wrongly typed IDs fail closed. After user binding, an immutable-ID search checks subject, parsed DN and current login against the pre-bind object. Replacement, disappearance or moved locators return IDENTITY_CHANGED. Revalidation never selects identity by stored DN/login.
- OpenLDAP applies the configured eligibility filter to every user eligibility search. AD requires readable userAccountControl, msDS-User-Account-Control-Computed, accountExpires, pwdLastSet and msDS-UserPasswordExpiryTimeComputed. It checks disablement, computed lockout/password expiry, forced password change and FILETIME expiration with integer arithmetic/documented sentinels. Missing visibility returns POLICY_UNREADABLE. AD evidence remains protocol/service testing only.
- Group queries are escaped, scoped and bounded. OpenLDAP supports groupOfUniqueNames/uniqueMember and groupOfNames/member. Optional UID suffixes are rejected when encountered. Reverse membership traversal uses immutable visited IDs and parsed locator comparisons, detects cycles, enforces depth/visit/deadline bounds and avoids downloading AD ranged member lists. AD chain-rule results are checked against bounded in-scope traversal; only definitive unsupported-rule responses permit the traversal result alone. Primary groups and out-of-scope memberships remain excluded.
- Searches disable pagination, alias dereferencing and referral following. Referrals, unexpected continuation cookies, missing bases and limited/incomplete results cannot become partial authorization. Real OpenLDAP exposed ldapts suppressing sizeLimitExceeded when a requested size limit exists. The transport observes public response objects before accepting results, preserves server status and interrupts responses exceeding the requested entry bound.
- LoggerService records safe operation/directory IDs, latency, error/limit reason and failover index, without raw exceptions, passwords or full entries. Configuration inventory/examples describe internal support and the unavailable public-login boundary. No migration, infrastructure plugin or frontend source changed.

**Verification: exact commands, outcomes, and external log reference:**

All commands ran from the repository root and are recorded in append-only ~/.agents/logs/pabawi.jsonl. Documentation network tools have supplemental records there. Initial host Node was 26.8.1. Final acceptance used an official Node 24.21.0 Darwin arm64 archive under /tmp/pabawi-node24, verified against its official SHA256 list and scanned with ClamAV before extraction. PostgreSQL was 17.11; OpenLDAP was 2.6.10+dfsg-1; the fixture used OpenSSL 3.5.7-1~deb13u3.

- Before edits, npm run test --workspace=backend -- test/database/federated-provisioning.test.ts test/database/external-identity-boundaries.test.ts test/database/sso-concurrency.test.ts test/integration/ldap-account-ownership.test.ts passed 22 SQLite/HTTP tests with 17 PostgreSQL cases skipped. After docker start pabawi-ldap-p1-postgres, its loopback port was 65056. These prerequisite files plus then-current LDAP tests passed all 112 tests with both adapters and live OpenLDAP (/tmp/pabawi-ldap-p3-focused-fourth.log).
- docker exec pabawi-ldap-p1-postgres createdb -U postgres ldap_package3_verified created a fresh full-suite acceptance database.
- Full acceptance on final production code, PASS: 244 files passed, one skipped; 3961 tests passed, two skipped, one todo. Includes SQLite/PostgreSQL migration/provisioning boundaries, local/Entra authentication/profile/password regressions and real directory tests:

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65056/ldap_package3_verified TEST_LDAP_LDAPS_PORT=54547 TEST_LDAP_STARTTLS_PORT=54548 TEST_LDAP_CA_FILE=/tmp/pabawi-ldap-p3-tls-final/ca.pem npm run test --workspace=backend > /tmp/pabawi-ldap-p3-node24-backend-verified.log 2>&1
~~~

- Focused final acceptance, PASS: 78 tests, including the final annotated/shared GUID vector:

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_LDAP_LDAPS_PORT=54547 TEST_LDAP_STARTTLS_PORT=54548 TEST_LDAP_CA_FILE=/tmp/pabawi-ldap-p3-tls-final/ca.pem npm run test --workspace=backend -- test/config/LdapConfig.test.ts test/unit/services/LdapDirectoryService.test.ts test/integration/ldap-directory.test.ts > /tmp/pabawi-ldap-p3-node24-focused-acceptance.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run build:backend > /tmp/pabawi-ldap-p3-node24-build-verified.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run lint > /tmp/pabawi-ldap-p3-node24-lint-verified.log 2>&1
~~~

- Backend build and both workspace linters passed. Frontend source is unchanged; frontend tests/component checks were not rerun.
- Fixture commands are documented in backend/test/fixtures/ldap/README.md. The final Dockerfile/entrypoint passed:

~~~bash
shellcheck backend/test/fixtures/ldap/entrypoint.sh
docker run --name pabawi-ldap-p3-hadolint-verified --pull never --interactive hadolint/hadolint:latest hadolint --ignore DL3008 --ignore DL3009 - < backend/test/fixtures/ldap/Dockerfile
docker build -t pabawi-ldap-fixture:package3-verified backend/test/fixtures/ldap > /tmp/pabawi-ldap-p3-fixture-build-verified.log 2>&1
docker run --detach --name pabawi-ldap-p3-openldap-verified --pull never -p 127.0.0.1::1389 -p 127.0.0.1::1636 pabawi-ldap-fixture:package3-verified
~~~

- The fixture uses a pinned Debian base, generated two-day TLS certificates, synthetic records and an ACL denying lookup password reads. Final published ports were StartTLS 50326 and LDAPS 50325. The CA was copied to /tmp/pabawi-ldap-p3-verified/tls/ca.pem. After the final Dockerfile adjustment, all ten real-directory tests passed:

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_LDAP_LDAPS_PORT=50325 TEST_LDAP_STARTTLS_PORT=50326 TEST_LDAP_CA_FILE=/tmp/pabawi-ldap-p3-verified/tls/ca.pem npm run test --workspace=backend -- test/integration/ldap-directory.test.ts > /tmp/pabawi-ldap-p3-openldap-verified.log 2>&1
~~~

- Real evidence covers both verified TLS modes, isolated binds, incorrect/empty credentials, active/inactive/missing policy, Unicode/ambiguous login, absent contact/identity fields, two group schemas, optional UID rejection, direct/nested cycles, limits, failover, CA/hostname failures, failed StartTLS before credentials and deadline socket cleanup.
- ClamAV passed ldapts and its dependency, the DN parser dependencies, the official Node archive and downloaded fixture packages. The final fixture scan checked 19 packages with zero infections (/tmp/pabawi-ldap-p3-fixture-clamav-verified.log). Image digest and exact download/scan commands are in the external log.
- All six relevant documentation contracts passed:

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH node --test --test-name-pattern='every declared REST|API guide|OpenAPI version|public exchanges|configuration inventory|architecture registry' scripts/documentation/contracts.test.mjs > /tmp/pabawi-ldap-p3-doc-contracts-acceptance.log 2>&1
~~~

- The unfiltered documentation check retains the existing version/changelog failure. The required full tracked-tree secret scan retains the four existing findings below. A separate scan includes all 23 changed/new files except the lockfile and compares them with the reviewed baseline and starting-commit content: PASS, zero new findings (/tmp/pabawi-ldap-p3-secret-comparison-verified.json). Synthetic invalid-URL/GUID vectors are annotated. The baseline is unchanged; exact scanner/comparison commands are in the external log.
- git diff --check passed. docker stop pabawi-ldap-p3-openldap-final pabawi-ldap-p3-openldap-verified pabawi-ldap-p1-postgres stopped all remaining acceptance servers. The earlier directory fixture is also stopped. Containers/images/temporary evidence were retained. No remote push, PR, deployment or cleanup deletion occurred.

**Pre-existing failures:**

- Release metadata is 1.5.1 and CHANGELOG.md lacks a dated 1.5.1 entry. The unfiltered documentation contract therefore fails. Changelog/version values were not changed.
- PATH=/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin:$PATH bash scripts/quality/secret-scan.sh reports four existing findings: one in backend/package.json, two in backend/src/cli/resetUserPassword.ts, one in backend/test/unit/cli/resetUserPassword.test.ts. Only dependency entries changed in backend/package.json; its flagged content existed at the starting commit. CLI files and .secrets.baseline are unchanged.

**Remaining work and blockers:** No package-3 acceptance blocker remains. No real AD environment/credentials were available. Actual AD TLS, status visibility, objectGUID queries, matching-rule behavior and large-directory interoperability remain unverified and block package-7 completion/support claims. Existing release-documentation and tracked-tree secret failures remain release blockers outside this package. The DN parser's decommissioned upstream is recorded for dependency-maintenance review. Supported-engine evidence for this package is now present. Public LDAP authentication remains unavailable.

**Decisions or discoveries affecting the next package:** Use service-returned immutable subjects and authoritative current DN/name for mappings; never browser labels/locators as identity. Supply the case-sensitive directory ID as issuer. Safe error codes are INVALID_CREDENTIALS, INELIGIBLE, IDENTITY_CHANGED, INVALID_IDENTITY, POLICY_UNREADABLE, INCOMPLETE_RESULT, LIMIT_EXCEEDED, BUSY, TIMEOUT and UNAVAILABLE. Preserve confirmed ineligibility versus transient/incomplete results. Failures change no stored grants. Construction is lazy and does not make startup depend on directory availability. Preserve the transport/filter guards when upgrading ldapts and rerun real truncation, TLS and binary/UTF-8 checks. Package-2 transaction ownership and package-5B atomic reconciliation/fencing requirements remain unchanged.

**Next action and acceptance criterion still to satisfy:** Start package 4. Implement restricted search/diagnostics and mapping persistence/routes through existing RBAC/container patterns. Require rbac:admin, audit changes, resolve immutable group subjects through this service, and prove revision/fencing-safe grant withdrawal on both adapters. Keep public LDAP login unavailable. Complete permission/error/provenance/revision-race tests and backend contracts before mapping UI or session work.


## Handoff 2026-10-21 Codex package 4

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 4, RBAC mapping administration, complete. Package 5A is next eligible. Public LDAP discovery/login and LDAP token issuance remain unavailable. Mapping UI belongs to package 6.

**Branch, base commit, completion commit or uncommitted paths:** Branch `151`, base `4fac169ef75c9882c106728faa6d2c1717565f3e`. Starting tree was clean. Package 3 is committed in that base, correcting its previous uncommitted progress reference. Read AGENTS.md, code-change/git/Context7 instructions, progress and latest handoffs. Verified migration 031, shared provisioning, local/Entra boundaries, directory configuration/service, container, route guards and audit patterns against current source. KiroGraph reported 204 pending files and could not find LdapDirectoryService, so source inspection supplied the missing context. No completion commit was created. Changed/new paths:

~~~text
backend/src/container/DIContainer.ts
backend/src/server.ts
backend/src/services/LdapDirectoryService.ts
backend/src/services/LdapMappingService.ts
backend/src/routes/ldapAdministration.ts
backend/test/database/ldap-mappings.test.ts
backend/test/integration/ldap-administration.test.ts
backend/test/integration/ldap-directory.test.ts
backend/test/unit/services/LdapDirectoryService.test.ts
docs/api.md
docs/openapi.yaml
docs/configuration.md
docs/internal/plans/ldap-authentication.md
~~~

**Completed scope and changed interfaces:**

- LdapMappingService(db, directoryId, directory) implements list(), get(id), create(groupSubject, roleId, actor), update(id, { roleId?, enabled? }, actor), remove(id, actor), revision() and withRevision(snapshot, databaseWork). Mappings expose immutable group subject, authoritative stored DN/name, role ID/name, boolean enabled, timestamps and source: ldap. Every lookup is scoped to the configured case-sensitive directory ID.
- Creation and role/re-enable updates resolve the immutable group through the directory service before opening a database transaction. Browser DNs, labels and directory IDs are rejected. Absent roles/mappings return NOT_FOUND; duplicate subject/role mappings return CONFLICT. Disabling alone and deletion need no directory connection, preserving withdrawal during outages.
- Existing migration-031 triggers perform attributable grant withdrawal, mapping-revision increment, persisted timestamp invalidation and global authorization-revision changes in the same transaction. Other mappings, manual roles, local group permissions and Entra-owned grants survive. Creating or enabling a mapping never materializes a grant.
- revision() supplies directory ID and string-preserving mapping/config revisions. withRevision() owns its transaction and conditionally updates the directory row with those revisions, acquiring the PostgreSQL row lock or SQLite writer lock before databaseWork runs. A stale result returns STALE_REVISION before any grant/profile/freshness write. Mapping edits use this same lock and compare the revision captured before directory I/O, preventing stale edits as well as stale validation publication. Scope/config mismatch also fails closed.
- AuditLoggingService records createLdapMapping, updateLdapMapping and deleteLdapMapping atomically with mutation and withdrawal. Payloads include actor, directory/mapping/group/role IDs and enabled state, omitting group locators and personal profiles. Audit persistence failure rolls everything back. Existing middleware audits denied permissions.
- Six implemented endpoints: GET groups, GET mappings, POST mappings, PUT mappings/:id, DELETE mappings/:id and POST test, mounted under /api/auth/ldap. Each independently authenticates and enforces rbac:admin, including delegated non-is_admin roles. Authorized disabled-directory requests return 404. All authorized responses use Cache-Control: no-store. Lazy service/container wiring opens no startup directory connection and does not enter the infrastructure plugin registry.
- Group search matches escaped configured lookup/display-name substrings and accepts only a nonempty query of at most 1024 UTF-8 bytes plus optional opaque cursor. The complete directory result must satisfy the configured search limit before returning anything. Responses are { items, nextCursor }, at most 50 groups per page. Random 256-bit continuation references bind a bounded snapshot to administrator, exact query and configured router lifetime. Expiry is 60 seconds from snapshot creation and paging cannot extend it. At most 64 references are retained per router. Cursors are deliberately process-local: expiry/eviction/restart/another process returns INVALID_CURSOR and requires a new search. This is documented.
- LdapDirectoryService.diagnose({ username?, groupSubjects? }) reports TLS, lookup, identity, eligibility and selected group-resolution stages with status, durationMs and safe error code. It uses one bounded lookup transaction, performs no user bind and always returns authenticated: false. Identity lookup is separate from policy filtering; a visible inactive account differs from a missing/ambiguous identity. Selected group identity is resolved before membership checks. Failed/incomplete work returns no partial membership. Deadline reports are detached from late protocol bookkeeping.
- Diagnostic HTTP input allows no password, arbitrary filter, endpoint or connection override. Group diagnostics require an exact username, at most 20 subjects and enabled mappings. Reports omit profile data, raw directory exceptions and connection configuration. The router uses the existing 100/minute authenticated-user limiter; diagnostics add 10/minute per administrator. Mounting before generic /api/auth prevents administration from consuming the local-login budget.
- Restricted administrative errors use 400 for invalid input/cursor/selected mappings, 404 for disabled support or absent scoped records, 409 for duplicate/stale revision, 422 for invalid directory identity/confirmed ineligibility/identity change, 429 for admission/rate limits and 503 for directory outage, incomplete resolution, policy visibility or lookup credential rejection. Unexpected errors are redacted 500 responses. These restricted diagnostic statuses do not define the future public-login failure behavior.
- API/OpenAPI and configuration references describe the implemented contract. No migration, dependency, token format or frontend source changed.

**Verification: exact commands, outcomes, and external log reference:**

All state-changing, tool-network and verification commands are recorded in append-only ~/.agents/logs/pabawi.jsonl. Test evidence is retained under /tmp/pabawi-ldap-p4-*.log. Acceptance used the already verified official Node 24.21.0 archive from package 3, PostgreSQL 17.11 and the already reviewed local OpenLDAP image; no new package/archive/image download was needed.

- Prerequisites, PASS: 107 tests covering SQLite/PostgreSQL migration boundaries, shared provisioning, Entra concurrency, LDAP profile/password ownership and directory configuration/service.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55751/postgres npm run test --workspace=backend -- test/database/federated-provisioning.test.ts test/database/external-identity-boundaries.test.ts test/database/sso-concurrency.test.ts test/integration/ldap-account-ownership.test.ts test/config/LdapConfig.test.ts test/unit/services/LdapDirectoryService.test.ts > /tmp/pabawi-ldap-p4-prerequisites.log 2>&1
~~~

- Restarting retained pabawi-ldap-p1-postgres succeeded. Restarting the old OpenLDAP container failed because its entrypoint reruns slapadd against the retained database. Its log showed MDB_KEYEXIST. No repository code changed for this fixture limitation. Created a fresh loopback fixture from the existing verified image, which passed:

~~~bash
docker run --detach --name pabawi-ldap-p4-openldap --pull never -p 127.0.0.1::1389 -p 127.0.0.1::1636 pabawi-ldap-fixture:package3-verified
mkdir -p /tmp/pabawi-ldap-p4-tls && docker cp pabawi-ldap-p4-openldap:/fixture/tls/ca.pem /tmp/pabawi-ldap-p4-tls/ca.pem
~~~

Published ports were PostgreSQL 55751, LDAPS 55900 and StartTLS 55899. Containers, image, certificate and evidence were retained.

- Focused package acceptance, PASS: 76 tests across four files, including 26 mapping tests on both adapters, 14 HTTP cases and live directory behavior.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55751/postgres TEST_LDAP_LDAPS_PORT=55900 TEST_LDAP_STARTTLS_PORT=55899 TEST_LDAP_CA_FILE=/tmp/pabawi-ldap-p4-tls/ca.pem npm run test --workspace=backend -- test/database/ldap-mappings.test.ts test/integration/ldap-administration.test.ts test/unit/services/LdapDirectoryService.test.ts test/integration/ldap-directory.test.ts > /tmp/pabawi-ldap-p4-focused-acceptance.log 2>&1
~~~

Evidence includes all six endpoint guards before directory work, delegated administration, forged identities/locators, role conflicts, outage-safe withdrawal, opaque cursor actor/query/router/deadline binding, diagnostic limits/redaction and public login/discovery remaining unavailable. Both-adapter tests cover provenance, authorization-cache invalidation, stale revisions after insertion/disablement/replacement/deletion, an edit queued behind validation publication, changes during directory I/O, configuration/scope mismatch and complete audit rollback. Live HTTP search/mapping/diagnostics create no identity, grant, OAuth code or imported user. Real LDAPS/StartTLS diagnostics and previous TLS/bind/membership/limit regressions pass.

- Full backend acceptance on final production source, PASS: 246 files passed, one skipped; 4005 tests passed, two skipped, one todo. Includes local/Entra authentication, migrations/upgrades, SQLite/PostgreSQL concurrency and real OpenLDAP.

~~~bash
docker exec pabawi-ldap-p1-postgres createdb -U postgres ldap_package4_verified
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55751/ldap_package4_verified TEST_LDAP_LDAPS_PORT=55900 TEST_LDAP_STARTTLS_PORT=55899 TEST_LDAP_CA_FILE=/tmp/pabawi-ldap-p4-tls/ca.pem npm run test --workspace=backend > /tmp/pabawi-ldap-p4-backend-acceptance.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run build:backend > /tmp/pabawi-ldap-p4-build-acceptance.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run lint > /tmp/pabawi-ldap-p4-lint-acceptance.log 2>&1
~~~

Backend build and both workspace linters pass. Frontend source is unchanged, so frontend tests/component checks were not rerun. Initial verification found forbidden non-null assertions and test-fixture assumptions about default Viewer roles, permission timestamps, PostgreSQL BIGINT strings and a queued one-time mock. These were corrected before acceptance.

- Documentation contracts: all six route/API/security/configuration/architecture contracts pass. The unfiltered run retains only the pre-existing release/changelog failure.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH node --test scripts/documentation/contracts.test.mjs > /tmp/pabawi-ldap-p4-doc-contracts.log 2>&1
~~~

- The full tracked-tree scan retains exactly the four existing findings below. Additional changed/untracked-file comparison passes with zero new unreviewed findings; .secrets.baseline is unchanged. The comparison also verifies the existing flagged files and release/changelog files byte-for-byte against base 4fac169.

~~~bash
PATH=/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin:$PATH bash scripts/quality/secret-scan.sh > /tmp/pabawi-ldap-p4-secrets-full.log 2>&1
python3 /tmp/pabawi-ldap-p4-secret-check.py > /tmp/pabawi-ldap-p4-secret-comparison.log 2>&1
~~~

The comparison script and exact scanner arguments are retained in /tmp and in the external command log. Final documentation-only verification passed all six relevant contracts (/tmp/pabawi-ldap-p4-doc-contracts-final.log) and the changed/untracked secret comparison (/tmp/pabawi-ldap-p4-secret-comparison-final.log). git diff --check passed after removing a trailing blank line in this handoff. docker stop pabawi-ldap-p4-openldap pabawi-ldap-p1-postgres stopped both acceptance servers while retaining containers and evidence. No remote push, PR, deployment, cleanup deletion or real directory access occurred.

**Pre-existing failures:**

- Shipped release metadata is 1.5.1; CHANGELOG.md has no dated 1.5.1 entry. This remains the sole failing documentation contract.
- Full tracked-tree scan reports four unchanged unreviewed findings: one in backend/package.json, two in backend/src/cli/resetUserPassword.ts and one in backend/test/unit/cli/resetUserPassword.test.ts. All three files and the reviewed baseline match base 4fac169. No baseline exception was added.

**Remaining work and blockers:** No package-4 acceptance blocker remains. The two repository-wide check failures above remain release blockers outside this package. Real AD environment/credentials are still unavailable; actual AD TLS/status/GUID/matching-rule/large-directory evidence remains required for package 7. The previously recorded decommissioned DN-parser dependency still needs maintenance review before release. Retained OpenLDAP containers cannot be restarted with the current seed-on-start entrypoint; use a fresh container from the verified fixture image.

**Decisions or discoveries affecting the next package:** withRevision() owns its transaction, so callers must not nest transactions or call the existing transaction-owning createFederatedUser() inside it. Package 5B must design one atomic provisioning/profile/grant/freshness transaction and combine mapping/config revision checks with identity lease ownership, expiry and fencing-generation checks using database time. This package proves mapping-revision serialization; it does not implement validation leases or treat null/unvalidated state as session eligibility. Capture revision before mapping reads/directory I/O and compare it while holding the directory lock before publishing. Other-source grants and local suspension remain independent.

Frontend integration example (synthetic group ID, no user import):

~~~http
GET /api/auth/ldap/groups?query=operators
Authorization: Bearer <access-token>

POST /api/auth/ldap/mappings
Authorization: Bearer <access-token>
Content-Type: application/json

{"groupSubject":"10112233-4455-6677-8899-aabbccddeeff","roleId":"role-viewer-001"}

PUT /api/auth/ldap/mappings/<mapping-id>
Authorization: Bearer <access-token>
Content-Type: application/json

{"enabled":false}

POST /api/auth/ldap/test
Authorization: Bearer <access-token>
Content-Type: application/json

{"username":"alice"}
~~~

Use source/directory/group/role labels returned by the API. Never submit browser locators as identity. Continue local/Entra discovery unchanged until package 5B.

**Next action and acceptance criterion still to satisfy:** Start package 5A. Add verified provider/identity context for existing local/Entra access and refresh tokens, shared configured authentication dependencies and intentional one-time legacy-session invalidation via a forward migration on both adapters. Keep LDAP tokens/login unavailable until package 5B completes all transport and freshness checks.


## Handoff 2026-10-21 Codex package 5A

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 5A, provider context and shared authentication wiring, complete. Package 5B is next eligible. Public LDAP discovery/login and LDAP token issuance remain unavailable.

**Branch, base commit, completion commit or uncommitted paths:** Branch `151`, base `ac2069672962e0c2b723ba8d65534841d8afd461`. Starting tree was clean. Package 4 is committed as `4a5c2b4`; its progress reference has been corrected. Base `ac20696` bumps release metadata to 1.6.0 WIP, so the earlier handoff's single release-documentation failure is no longer an accurate description of the current base. Read AGENTS.md, code-change/git/Context7 instructions, progress and latest handoffs. Verified migration 031, provider-neutral provisioning, scoped identities and grants, directory service and mapping revision/audit routes against source and regression tests. KiroGraph had 208 pending files; used source inspection for missing context and did not change the index. No completion commit was created. Changed/new paths:

~~~text
backend/src/container/DIContainer.ts
backend/src/database/migrations/032_provider_bound_sessions.postgres.sql
backend/src/database/migrations/032_provider_bound_sessions.sqlite.sql
backend/src/middleware/authMiddleware.ts
backend/src/routes/auth.ts
backend/src/routes/console.ts
backend/src/routes/entraIdAuth.ts
backend/src/routes/groups.ts
backend/src/routes/journal.ts
backend/src/routes/ldapAdministration.ts
backend/src/routes/permissions.ts
backend/src/routes/roles.ts
backend/src/routes/setup.ts
backend/src/routes/users.ts
backend/src/server.ts
backend/src/services/AuthenticationService.ts
backend/src/services/EntraIdService.ts
backend/src/types/express.d.ts
backend/test/AuthenticationService.test.ts
backend/test/database/BatchLifecycleMigration.test.ts
backend/test/database/authorization-state.test.ts
backend/test/database/external-identity-boundaries.test.ts
backend/test/database/federated-provisioning.test.ts
backend/test/database/migration-016-convergence.test.ts
backend/test/database/migration-integration.test.ts
backend/test/database/provider-bound-sessions.test.ts
backend/test/database/sso-concurrency.test.ts
backend/test/integration/EntraIdAuthFlow.test.ts
backend/test/integration/ldap-account-ownership.test.ts
backend/test/integration/ldap-administration.test.ts
backend/test/integration/mcp-authorization.test.ts
backend/test/integration/shared-authentication.test.ts
backend/test/middleware/authMiddleware.test.ts
backend/test/properties/auth/token-validity.property.test.ts
backend/test/properties/consoleRbacCreation.property.test.ts
backend/test/properties/consoleRbacTermination.property.test.ts
backend/test/routes/auth.test.ts
backend/test/routes/aws.test.ts
backend/test/routes/groups.test.ts
backend/test/routes/journal.test.ts
backend/test/routes/permissions.test.ts
backend/test/routes/roles-permissions.test.ts
backend/test/routes/users.test.ts
backend/test/security/console-lifecycle.test.ts
backend/test/security/entitlement-administration.test.ts
backend/test/security/route-authorization.test.ts
backend/test/security/session-revocation.test.ts
docs/api.md
docs/internal/plans/ldap-authentication.md
~~~

**Completed scope and changed interfaces:**

- Access and refresh JWTs require signed `authContext`. Local context is `{ provider: 'local', identityId: null }`; Entra context is `{ provider: 'entra-id', identityId: '<federated-identity-id>' }`. Missing, malformed, unknown-provider and extra-field contexts fail closed, including LDAP contexts at this checkpoint. No provider inference from email, username or enrollment takes place. Existing issuer/audience `pabawi`, HS256 restriction, token purpose, expiry/JTI/session-version checks and token lifetimes remain.
- `generateToken(user, context, expectedVersion?)`, `generateRefreshToken(user, context, expectedVersion?)` and `generateTokenPair(user, context, expectedVersion?)` require an explicit context argument. Expected session version is the third argument. Local login explicitly selects local context. Entra callback passes the exact identity ID resolved by authenticated issuer/subject, not an arbitrary identity attached to the account. Refresh retains the verified inbound context in both replacement tokens.
- `assertSessionEligible(userId, context, expectedVersion?)` is the shared account/provider eligibility seam and returns the current session version. It validates context, requires an active account and the expected version, then requires enabled local scope or an existing identity matching ID, user ID and provider. It runs at issuance, access verification and refresh. Pair issuance checks the same context/version before and between signing steps and again before returning. Identity removal rejects the associated Entra session while separately issued local sessions remain valid. Account-wide revocation and refresh reuse detection retain existing behavior.
- `InvalidAuthenticationContextError` is a typed safe INVALID_TOKEN failure for context or identity ownership rejection. Client responses retain existing authentication error envelopes and no identity details are exposed.
- DIContainer registers `authentication`; `resolveAuthenticationService(db, container)` creates it once with ConfigService's JWT secret and an audit logger, or returns the explicitly registered instance. Server, setup/auth/user/RBAC/journal/console/LDAP/Entra routers and lifecycle/MCP user provisioning share it. The standalone password-reset CLI still owns its independent process/database service and issues no sessions.
- `createAuthMiddleware(authService)` now takes the configured instance and constructs no service. It exposes verified `req.authContext` separately from the existing user DTO and captures this same instance/token in `req.revalidateAuth`. Static lifecycle/MCP credentials retain their existing separate authentication policy and are not assigned a fabricated password-provider context.
- New dialect-specific migration 032 rotates every existing account's session version and expires pending OAuth state and authorization-code exchanges once. Console credentials fail the existing persisted session-version comparison. Account/profile data, identities, role grants, console records and relationships survive. Re-running migrations does not invalidate freshly issued sessions. Legacy JWTs lacking context are rejected even without version inference.
- Updated API documentation describes context and required upgrade reauthentication. Updated older test call sites to select local explicitly, adjusted historic migration expectations and raw property-test payloads, and replaced direct LDAP token fixtures with persisted-version assertions or correctly scoped Entra tokens. The password-ownership HTTP regression uses a deliberately constructed legacy mixed account and a local token. No LDAP authentication bypass was added.

**Verification: exact commands, outcomes, and external log reference:**

All state-changing, network-documentation and verification commands are recorded in append-only `~/.agents/logs/pabawi.jsonl`. Evidence is retained under `/tmp/pabawi-ldap-p5-*`. Used the previously verified Node 24.21.0 archive, PostgreSQL fixture and local OpenLDAP image. No new dependency, image or archive download occurred, so there were no new downloaded artifacts requiring a ClamAV scan.

- Focused provider/upgrade/shared-service/Entra checks passed: 40 tests in five files, including both adapters.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:62420/ldap_package5a_verified npm run test --workspace=backend -- test/database/provider-bound-sessions.test.ts test/database/migration-016-convergence.test.ts test/properties/auth/token-validity.property.test.ts test/integration/shared-authentication.test.ts test/integration/EntraIdAuthFlow.test.ts > /tmp/pabawi-ldap-p5-focused.log 2>&1
~~~

New evidence includes local/Entra context through issuance and rotation, a real signed Entra callback/code exchange plus HTTP refresh, multiple-provider enrollment without inference, signed malformed/foreign-user context, tampered signatures, identity deletion, local-scope disablement, revocation, null email and shared service use across route guards/MCP/stream revalidation. Fresh SQLite/PostgreSQL and populated pre-032 upgrades prove one-time invalidation while preserving identity, account, grant and console records. Existing regressions cover revoked refresh reuse and revocation between pair signing steps.

- Fixture startup used existing local artifacts:

~~~bash
docker start pabawi-ldap-p1-postgres
docker exec pabawi-ldap-p1-postgres createdb -U postgres ldap_package5a_acceptance
docker run --detach --name pabawi-ldap-p5-openldap --pull never -p 127.0.0.1::1389 -p 127.0.0.1::1636 pabawi-ldap-fixture:package3-verified
mkdir -p /tmp/pabawi-ldap-p5-tls && docker cp pabawi-ldap-p5-openldap:/fixture/tls/ca.pem /tmp/pabawi-ldap-p5-tls/ca.pem
~~~

Published ports: PostgreSQL 62420, LDAPS 51397, StartTLS 51396. Earlier retained `postgres` database had migration-031 checksum drift and was not repaired or reset. Fresh disposable databases removed that fixture limitation. Initial test failures from legacy payload/migration assumptions, missing ConfigService test secret length and the local-scope/password-hash constraint were corrected. Build initially found one unused route audit instance, removed before acceptance.

- Full backend acceptance on final production source passed: 248 files passed, one skipped; 4020 tests passed, two skipped, one todo. Includes local/Entra, authorization and transport regressions, migrations/concurrency on both adapters and live OpenLDAP LDAPS/StartTLS.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:62420/ldap_package5a_acceptance TEST_LDAP_LDAPS_PORT=51397 TEST_LDAP_STARTTLS_PORT=51396 TEST_LDAP_CA_FILE=/tmp/pabawi-ldap-p5-tls/ca.pem npm run test --workspace=backend > /tmp/pabawi-ldap-p5-backend-final-acceptance.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run build:backend > /tmp/pabawi-ldap-p5-build-final.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run lint > /tmp/pabawi-ldap-p5-lint-final.log 2>&1
~~~

Backend build and both workspace linters passed. Frontend source and response DTOs are unchanged, so frontend tests/component checks were not rerun.

- Documentation contracts pass all five checks independent of pre-existing version consistency. The complete run has the two existing metadata failures described below.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH node --test scripts/documentation/contracts.test.mjs > /tmp/pabawi-ldap-p5-doc-contracts.log 2>&1
PATH=/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin:$PATH bash scripts/quality/secret-scan.sh > /tmp/pabawi-ldap-p5-secrets-full.log 2>&1
~~~

The tracked scan retains four unchanged findings. Additional scan of all 49 changed/new files passes with zero new unreviewed findings (`/tmp/pabawi-ldap-p5-secret-comparison.log`). Exact scanner/comparison commands are in the external log. Synthetic test credentials are annotated; no baseline exception was added. The comparison proves flagged files, baseline and relevant release metadata match starting commit `ac20696` byte-for-byte.

Final documentation-only checks retain the same two metadata failures (`/tmp/pabawi-ldap-p5-doc-contracts-final.log`), and the changed/new-file secret comparison passes after handoff publication. `git diff --check` passed. `docker stop pabawi-ldap-p5-openldap pabawi-ldap-p1-postgres` stopped both acceptance servers; containers, databases, public CA and evidence are retained. Prior handoff records are preserved verbatim. No commit, push, PR, deployment or repository cleanup occurred.

**Pre-existing failures:**

- Base `ac20696` has package metadata 1.6.0 while lockfile/OpenAPI metadata remains 1.5.1; CHANGELOG.md also lacks the required dated release entry. Two documentation contracts fail: release-version consistency and OpenAPI-version coherence. These are outside package 5A; no release metadata was changed here.
- Full tracked-tree secret scan reports four unchanged findings: one in backend/package.json, two in backend/src/cli/resetUserPassword.ts and one in backend/test/unit/cli/resetUserPassword.test.ts. The reviewed baseline is unchanged.
- One full rerun hit an existing logging property failure, seed 1994789662, path `6:0:0`, vector `['error', ' ', 'z', 'bolt', 'z']`. The field-order property uses `indexOf('[z]')` for both component and operation, so equal labels resolve to the same first marker. LoggerService and this test match base byte-for-byte. Deterministic compiled-logger reproduction confirms two correctly ordered markers while the property's indices are equal (`/tmp/pabawi-ldap-p5-logging-reproducer.log`); its exact command is in the external log. No logging code or property test was changed. The final full acceptance rerun passed.

**Remaining work and blockers:** No package-5A acceptance blocker remains. Package 5B is pending and blocks public LDAP authentication. The release-documentation and tracked-tree secret failures above remain release blockers; the unrelated logging property remains a known intermittent verification defect. Actual AD environment/credentials remain unavailable and block package-7 interoperability/support claims. The previously recorded decommissioned DN-parser dependency still requires maintenance review before release. The old retained PostgreSQL database has drifted migration checksums; use a new disposable database for acceptance rather than changing migration history.

**Decisions or discoveries affecting the next package:**

- Extend the existing AuthenticationContext union/validator and shared assertSessionEligible seam for LDAP only when complete credential, explicit-role and freshness enforcement is ready. Add directory ID to LDAP context, resolve the exact database identity/metadata owner and configured directory, and never infer provider from account enrollments. Refresh must force LDAP validation; pair issuance must reuse the already authoritative login/refresh result without incorrectly extending freshness. Local/Entra paths must remain independent of directory availability.
- REST middleware and `req.revalidateAuth` now use the shared service. StreamingExecutionManager.subscribe installs SessionAuthorization around that callback; journal SSE uses the same request callback. McpRouter captures the opening callback for its stored session, checks it on subsequent requests/idle intervals and exposes it to tool handlers. Add LDAP deadline/race/outage coverage through all these paths in 5B.
- Console REST guards share the service, but websocket authorization still goes through ConsoleSessionManager.assertSessionAuthorized, which checks account session version and console permission only. Console session rows currently retain no authentication context. Package 5B must carry the verified request provider/identity/directory context through reservation and persistence, wire the shared eligibility dependency into the manager, and enforce it during upgrade, initial relay, idle checks and both delivery directions. Do not use account-level identity guessing or rely only on console REST middleware.
- Shared provisioning and LdapMappingService.withRevision still own their transactions. Package 5B must form a single atomic account/profile/grant/freshness publication transaction, combine mapping/config revisions with database-time lease owner/expiry/fencing checks, and prevent stale work from restoring removed grants. Null validation state is never eligibility. Positive revocation remains terminal; transient failures cannot extend freshness or erase authoritative grants.
- Migration 032 is now part of the sequence and intentionally invalidates legacy sessions. Do not edit 031 or 032 when adding console context or other new schema requirements; add another forward migration.

**Next action and acceptance criterion still to satisfy:** Start package 5B. Implement explicit LDAP login/discovery and provider-aware throttling, atomic grant/profile reconciliation, persisted freshness with cross-process leases/fencing, forced refresh and every REST/SSE/MCP/console enforcement path. Keep LDAP login/token issuance unavailable until all package-5B transport, deadline, revocation and race acceptance checks pass.


## Handoff 2026-10-21 Codex package 5B

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 5B, LDAP login and all transport checks, complete. Package 5 is complete. Package 6 is next eligible. LDAP HTTP authentication is now available when configured; frontend provider selection and mapping/diagnostic controls remain package 6 work.

**Branch, base commit, completion commit or uncommitted paths:** Branch `151`, base `3fee4b3ab95ac158a26eaf4110ab3d077a880455`. Starting tree was clean. Package 5A is committed as `7f58092`; its table reference has been corrected. Read AGENTS.md, code-change/git/Context7 instructions, progress and latest handoffs. Verified migration 031, provisioning ownership, mappings/revisions, provider-bound sessions and configured authentication wiring against source and focused tests on both adapters. KiroGraph reported 210 pending files and omitted LDAP services; used filesystem inspection without changing its index. No completion commit was created. Changed/new paths:

~~~text
backend/.env.example
backend/src/container/DIContainer.ts
backend/src/database/migrations/033_ldap_validation_decisions.postgres.sql
backend/src/database/migrations/033_ldap_validation_decisions.sqlite.sql
backend/src/database/migrations/034_console_authentication_context.postgres.sql
backend/src/database/migrations/034_console_authentication_context.sqlite.sql
backend/src/middleware/authMiddleware.ts
backend/src/middleware/securityMiddleware.ts
backend/src/routes/auth.ts
backend/src/routes/console.ts
backend/src/routes/journal.ts
backend/src/server.ts
backend/src/services/AuthenticationService.ts
backend/src/services/ConsoleSessionManager.ts
backend/src/services/LdapAuthenticationService.ts
backend/src/services/LdapDirectoryService.ts
backend/src/services/LdapMappingService.ts
backend/src/services/SessionAuthorization.ts
backend/src/services/UserService.ts
backend/src/types/express.d.ts
backend/test/database/BatchLifecycleMigration.test.ts
backend/test/database/ldap-authentication.test.ts
backend/test/database/migration-integration.test.ts
backend/test/database/provider-bound-sessions.test.ts
backend/test/helpers/consoleUser.ts
backend/test/helpers/ldapAuthentication.ts
backend/test/integration/ldap-authentication.test.ts
backend/test/integration/shared-authentication.test.ts
backend/test/properties/consoleAuditLog.property.test.ts
backend/test/properties/consoleConcurrentLimit.property.test.ts
backend/test/properties/consoleRbacTermination.property.test.ts
backend/test/properties/consoleSessionRecord.property.test.ts
backend/test/properties/consoleTokenValidation.property.test.ts
backend/test/security/console-lifecycle.test.ts
backend/test/security/ldap-transports.test.ts
backend/test/security/session-revocation.test.ts
backend/test/unit/services/LdapDirectoryService.test.ts
docs/api.md
docs/configuration.md
docs/internal/plans/ldap-authentication.md
docs/openapi.yaml
scripts/documentation/contracts.test.mjs
~~~

**Completed scope and changed interfaces:**

- `LdapAuthenticationService.authenticate(loginName, password)` returns a committed proof containing the account, exact identity/directory and session version only after credential, eligibility and explicit-role validation. It never implements JWT signing. `assertEligible(userId, identityId, directoryId, expectedVersion, force)` verifies exact ownership/configuration and is injected into the existing AuthenticationService through the configured container. There is no provider inference, implicit linking, default LDAP role or credential replay. A proven zero-role account is committed without tokens for later manual assignment. Suspension remains locally owned.
- `UserService.withFederatedUser(input, publish)` owns one transaction for account/identity/profile creation or refresh and the database-only publication callback. `createFederatedUser` delegates to it and preserves existing Entra behavior. `LdapMappingService.lockRevision` participates in that transaction; `withRevision` still owns its standalone transaction. No nested transactions or directory I/O inside database transactions were introduced. Publication reconciles only the authenticating identity's grants and retains separate mapping provenance. Manual grants and other identity sources survive. Effective role and permission-cache invalidation continue through the existing view and database triggers.
- New forward migration 033 adds `decision_started_at` and `decision_sequence` to LDAP validation state and `validation_sequence` to directory state on both adapters. The directory counter orders reads even when timestamps are identical. Migration 034 adds nullable `console_sessions.auth_context`; existing rows survive but cannot upgrade without provable context. Migrations 031/032 and existing identity/grant keys are unchanged. Fresh and populated upgrade tests pass on SQLite and PostgreSQL. Historic migration-count assertions now include 033/034.
- Successful freshness is persisted from database time before directory I/O, with mapping/configuration revisions. Strict freshness is `last_validated_at + interval > database_now`, including the exact deadline. Null state never authorizes access. Config fingerprints include validated settings and configured CA contents; startup initializes the fingerprint once and invalidates incompatible freshness. Serving processes must share configuration; an older running process cannot switch the stored revision back during a request.
- Lookup-only revalidation is single-flight per identity/session version in process. Cross-process conditional leases use database time, owner/expiry and monotonically increasing fencing generation. Remote waiters compare a completed validation generation under the same directory lock before acquiring another lease, closing the publication/reacquisition race found during acceptance. Successful and positive-negative publication checks current mapping/config revisions, account session version, lease ownership/expiry/generation and decision order. Expired or superseded work rolls back profile/grant changes. Release is owner/generation conditional. Credential proofs are independent and fence older work when published.
- Confirmed ineligibility or loss of all explicit roles withdraws LDAP-owned grants, clears freshness, advances the decision generation and rotates the existing account-wide session version. Previously revoked tokens remain invalid after recovery/new login. Transient, incomplete, limited and malformed directory work neither advances freshness nor erases grants. Existing otherwise valid tokens recover after a fresh check. Unchanged periodic validation emits no audit event; entitlement changes and positive revocation emit safe identity/directory/mapping IDs and reason codes.
- Access/refresh context now accepts exactly `{ provider: 'ldap', identityId, directoryId }` in addition to the existing local/Entra shapes. Issuance, verification, refresh, REST request revalidation and console use the shared eligibility dependency. Refresh always forces validation; subsequent pair issuance reuses authoritative persisted freshness without resetting its timestamp. Refresh validation failure leaves the inbound refresh token available for retry. Local and Entra remain independent of directory availability.
- `POST /api/auth/ldap/login` accepts only nonempty username/password with 1024/4096 UTF-8 byte limits, preserves submitted login case/whitespace and password, and never falls through. Its strict schema replaces generic body sanitization for this exact path. Provider discovery advertises only enabled/name/help URL and remains visible during outages. Safe statuses are 401 for generic credential rejection, 403 for proven denied access, 429 for throttling/capacity and 503 for unavailable/incomplete validation; disabled LDAP returns 404. API/OpenAPI/configuration/env contracts are current.
- Existing IP authentication throttling includes LDAP. Existing database failure/temporary-lockout accounting uses a distinct `ldap:` key followed by SHA-256 of JSON `["ldap", directoryId, submittedLogin]`. Five failures in fifteen minutes lock that provider/directory/login key for fifteen minutes. A valid successful login clears its key. Other directories and local accounts have independent counters. LDAP login audit labels include the safe directory ID, not passwords or complete directory entries.
- Console reservations now require verified auth context and the originating session version, check the shared service before reservation, compare that version under the account lock, and persist the context. ConsoleSessionManager receives the shared authentication dependency and revalidates exact persisted context on upgrade, initial relay, idle checks and both delivery directions through the existing proxy/SessionAuthorization path. Legacy/null/malformed context fails closed.
- Corrected the previous handoff's journal claim: the request carried `req.revalidateAuth`, but neither journal SSE send loop invoked it. Both node/global journal streams now use SessionAuthorization for idle and per-delivery checks plus current journal permission. `finish()` drains authorized queued sends before ending a finite response. Execution SSE and MCP already reached the shared seam; LDAP tests now prove blocked pending output, delayed-result rejection and idle enforcement. Already dispatched infrastructure work is not cancelled.
- Prerequisite service review found three boundary errors relevant to public login: TLS/protocol failures previously retried all endpoints, ambiguous immutable revalidation was classified as positive ineligibility, and rejected lookup credentials looked like a bad user password. Failover now permits only known transient transport errors/timeouts; ambiguity is INCOMPLETE_RESULT; lookup credential rejection is UNAVAILABLE and does not consume a submitted user's failure budget. Dedicated directory tests preserve user-bind rejection without retries and diagnostic redaction.

**Verification: exact commands, outcomes, and external log reference:**

All state-changing, fixture and verification commands are recorded in append-only `~/.agents/logs/pabawi.jsonl`. Evidence is retained under `/tmp/pabawi-ldap-p5b-*`. Used the retained, previously verified Node 24.21.0 installation, PostgreSQL 17.11 fixture and synthetic OpenLDAP image. No package, image or archive download occurred; no new downloaded artifact required a ClamAV scan.

- Initial prerequisite run passed 43 tests; 28 PostgreSQL cases were initially skipped until the fixture started. Later focused provisioning/mapping/authentication tests passed all 78 cases across both adapters. Dedicated LDAP HTTP/core/transport acceptance passed 63 tests, including real LDAPS/StartTLS HTTP issuance and refresh.
- Started the retained PostgreSQL fixture and created new `ldap_package5b_verified` and `ldap_package5b_acceptance` databases. Restarting the old OpenLDAP container failed because its entrypoint reseeds an existing database; it was retained unchanged. Created a fresh retained container from the existing image and copied only its generated public CA:

~~~bash
docker start pabawi-ldap-p1-postgres
docker exec pabawi-ldap-p1-postgres createdb -U postgres ldap_package5b_verified
docker exec pabawi-ldap-p1-postgres createdb -U postgres ldap_package5b_acceptance
docker run --detach --name pabawi-ldap-p5b-openldap --pull never -p 127.0.0.1::1389 -p 127.0.0.1::1636 pabawi-ldap-fixture:package3-verified
mkdir -p /tmp/pabawi-ldap-p5b-tls && docker cp pabawi-ldap-p5b-openldap:/fixture/tls/ca.pem /tmp/pabawi-ldap-p5b-tls/ca.pem
~~~

Acceptance endpoints were PostgreSQL 49305, LDAP StartTLS 50819 and LDAPS 50820 on loopback. These ports may change when fixtures are restarted; create another fresh OpenLDAP container rather than reseeding retained data.

- Final full backend acceptance on final production source passed: 251 files passed, one skipped; 4085 tests passed, two skipped, one todo. Includes local/Entra regressions, both database adapters/upgrades/concurrency, real OpenLDAP directory and HTTP flows, fake database-clock deadline tests, revision/fencing races, REST, execution/journal SSE, MCP and VNC/terminal console enforcement.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:49305/ldap_package5b_acceptance TEST_LDAP_LDAPS_PORT=50820 TEST_LDAP_STARTTLS_PORT=50819 TEST_LDAP_CA_FILE=/tmp/pabawi-ldap-p5b-tls/ca.pem npm run test --workspace=backend > /tmp/pabawi-ldap-p5b-backend-verified.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run build:backend > /tmp/pabawi-ldap-p5b-build-final.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run lint > /tmp/pabawi-ldap-p5b-lint-final.log 2>&1
~~~

Build and both workspace linters pass. Frontend source/DTOs are unchanged, so frontend tests/component checks were not rerun. Initial acceptance caught and corrected a remote coalescing race, old migration-count/console-context fixtures, scanner annotation placement and the lookup diagnostic expectation. Initial source lint findings were corrected before final acceptance.

- All seven documentation contracts pass, including release metadata and public LDAP route coverage. The tracked-tree secret scan is clean with 176 reviewed findings. A separate all-files scan covers all 42 changed/new files, including untracked source/test/migration files, and compares hashes against the unchanged reviewed baseline and starting HEAD. It reports zero new findings. The stronger all-files mode also exposes the unchanged synthetic PostgreSQL URL at backend/.env.example:40, excluded by the default scanner. A retained HEAD copy proves that sample line and finding hash are unchanged; no baseline exception or unrelated sample edit was made. Exact commands and outcomes are in the external log. No new baseline entry was accepted. Final documentation and scan evidence is recorded in `/tmp/pabawi-ldap-p5b-doc-contracts-handoff.log`, `/tmp/pabawi-ldap-p5b-secrets-handoff.log` and `/tmp/pabawi-ldap-p5b-secrets-changed.log`.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH node --test scripts/documentation/contracts.test.mjs > /tmp/pabawi-ldap-p5b-doc-contracts-handoff.log 2>&1
PATH=/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin:$PATH bash scripts/quality/secret-scan.sh > /tmp/pabawi-ldap-p5b-secrets-handoff.log 2>&1
~~~

**Pre-existing failures:** All-files scanning additionally reports the unchanged synthetic database URL described above; the standard tracked-tree scan passes. The previous handoff's release metadata and tracked-scan blockers were resolved by base commit `3fee4b3`, which updates release metadata and the reviewed secret baseline. They no longer reproduce; neither the baseline nor release metadata was changed in this package. One full run reproduced the already recorded logging field-order property defect: seed -1583974006, path `97:0:0:0`, vector `["error", " ", "R", "bolt", "R"]`. Both LoggerService and its property test match HEAD byte-for-byte. The property uses the same first `indexOf('[R]')` for component and operation; the logger emits both correctly. Deterministic compiled-logger evidence in `/tmp/pabawi-ldap-p5b-logging-reproducer.log` reports component index 33, incorrect property operation index 33, actual operation index 44. No logging source/test was changed. The final full rerun passes; the intermittent verification defect remains recorded.

Fixture shutdown completed with `docker stop pabawi-ldap-p5b-openldap pabawi-ldap-p1-postgres`; both exited successfully. Containers, databases, public CA and evidence remain retained. Current versions were verified as Node 24.21.0, PostgreSQL 17.11 and Debian OpenLDAP 2.6.10+dfsg-1. `git diff --check` passes and the external command log parses as JSON Lines.

**Remaining work and blockers:** No package-5B acceptance blocker remains. Package 6 is pending and blocks the login/mapping/diagnostics UI and full operator walkthrough. Actual AD access/credentials remain unavailable and block package-7 interoperability/support claims. The previously recorded decommissioned DN-parser dependency still requires maintenance review before release. Real Proxmox console compatibility remains unverified; local websocket fixtures prove authorization enforcement only. The old retained PostgreSQL database with historic checksum drift must not be reused for acceptance. No push, PR, deployment or destructive repository cleanup occurred.

**Decisions or discoveries affecting the next package:** Use the implemented discovery metadata and explicit LDAP route, preserve credentials without local password-creation rules, and do not add fallback between providers. User/group identity and mapping labels come from the server. Null contacts and LDAP-owned profile/password restrictions remain server-enforced. The common container must remain the authentication composition root; console callers must supply verified context/version, never infer a provider from enrollments. SQL freshness/decision/lease state is authoritative across workers. Configuration changes require coordinated restart; directory ID remains stable across endpoints. Keep API/configuration contracts aligned while completing frontend/operator docs.

**Next action and acceptance criterion still to satisfy:** Start package 6. Add common discovery and explicit password-provider selection, role mapping and restricted diagnostics controls, source/profile ownership UI, and the operator guide/RBAC documentation. Verify browser/UI flows, nullable contacts, directory-valid short credentials, permission guards, local/Entra regressions, frontend tests/build/lint, component checks and documentation contracts. Preserve the real AD and dependency-review release blockers until evidence resolves them.


## Handoff 2026-10-21 Codex package 6

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 6, frontend and operator documentation, complete. Package 7 is next eligible. No package-6 acceptance blocker remains. LDAP release readiness still requires the real AD and dependency-maintenance work recorded below.

**Branch, base commit, completion commit or uncommitted paths:** Branch `151`, base `56ea384192f1e9baf53911549b05be20bf257b6d`. Starting tree was clean. Package 5B is now committed as `56ea384`, correcting its earlier working-tree reference. Read AGENTS.md, code-change/git/Context7 instructions, progress and latest handoffs. Verified prerequisite routes, provisioning, ownership, mapping/revision contracts, provider-bound sessions and shared eligibility seams against source and tests. KiroGraph reported 215 pending files and omitted LDAP services; used filesystem inspection without changing its index. No completion commit was created. Changed/new paths:

~~~text
backend/.env.example
backend/src/routes/users.ts
backend/src/services/UserService.ts
backend/test/database/ldap-mappings.test.ts
backend/test/fixtures/ldap/README.md
backend/test/fixtures/ldap/ui-server.ts
backend/test/integration/ldap-account-ownership.test.ts
docs/api.md
docs/configuration.md
docs/integrations/ldap.md
docs/internal/plans/ldap-authentication.md
docs/openapi.yaml
docs/permissions-rbac.md
e2e/ldap-ui/ldap.spec.ts
frontend/src/components/LdapAdministration.svelte
frontend/src/components/LdapAdministration.test.ts
frontend/src/components/RoleDetailDialog.svelte
frontend/src/components/UserDetailDialog.svelte
frontend/src/components/user-contact-nullability.test.ts
frontend/src/lib/auth.svelte.ts
frontend/src/lib/auth.test.ts
frontend/src/lib/authProviders.svelte.test.ts
frontend/src/lib/authProviders.svelte.ts
frontend/src/lib/entraIdAuth.svelte.test.ts
frontend/src/lib/entraIdAuth.svelte.ts
frontend/src/lib/ldapApi.test.ts
frontend/src/lib/ldapApi.ts
frontend/src/lib/userAdministration.ts
frontend/src/pages/LoginPage.svelte
frontend/src/pages/LoginPage.test.ts
frontend/src/pages/RoleManagementPage.svelte
frontend/src/pages/UserManagementPage.svelte
playwright.config.ts
playwright.ldap.config.ts
~~~

**Completed scope and changed interfaces:**

- `authProviders.svelte.ts` now owns common provider discovery, five-second timeout, disabled-provider reset, safe HTTP(S) help URLs and local emergency fallback on discovery failure. `entraIdAuth.svelte.ts` retains only SSO code exchange and its errors. Login explicitly selects Local or the configured directory; Entra keeps its redirect button. Switching clears password/validation state. LDAP uses nonempty 1024/4096-byte input limits, preserves submitted case/whitespace and accepts short directory credentials. Failed login never changes provider, retries or falls through.
- `authManager.login(credentials, provider = 'local')` uses exactly the selected endpoint and the existing token/localStorage state. Both legacy string and structured error responses render safe messages. Temporary refresh HTTP 429/503 and network errors now retain credentials for a later retry and show a warning; they establish no fresh authorization. Definitive refresh rejection still clears the session. Successful refresh clears the warning. Local/Entra regressions and retry recovery are covered.
- `LdapAdministration.svelte` is mounted in Role Management and role details only with the existing administrator page boundary plus loaded `rbac:admin`. It supports scoped group search, empty results, opaque cursor continuation with the original filter, create/change-role/enable/disable/remove mappings, stored outage labels and reload. Creation submits only group subject and role ID. Diagnostics use configured lookup-only endpoints, exact optional username and up to 20 enabled mapped groups. Passed/failed stages, timings and safe codes remain visible even for HTTP 422/429/503 reports. The dedicated client never replays directory work. UI removal requires confirmation; every backend administration guard remains independently enforced.
- Added protected, additive user-administration DTO fields without schema or authentication-contract changes. `UserService.getAdministrationMetadata(users, directory?)` batches sources, current directory login and profile ownership. `GET /api/users` and `GET /api/users/:id` expose `authentication: { profileReadOnly, sources }` through existing `users:read` guards. Source objects contain server-supplied provider/name and optional directory ID/login; no user subject, DN, token or credential. Public authentication user DTOs remain unchanged.
- User details also expose `roleSources` from manual, identity-owned and retained legacy grants. The UI labels provenance and removes only manual assignments, reloading the effective union so an overlapping LDAP grant survives. LDAP account display/login/source is searchable in user management; null email, absent names and read-only profile/password behavior render correctly. Long reserved usernames wrap without overlapping email. Suspension and manual entitlement controls remain available under their existing permissions.
- Added `docs/integrations/ldap.md` with OpenLDAP/AD examples, actual defaults, positive policy/status visibility, TLS/failover, exclusions, diagnostics, mapping/manual enrollment, outage/recovery and upgrade reauthentication. Configuration/env, API/OpenAPI and RBAC docs link or describe implemented behavior. The guide explicitly retains unverified AD and Proxmox claims and the DN-parser maintenance gate.
- Added a reproducible loopback-only browser fixture using an in-memory database, real auth/session/admin HTTP code and synthetic directory responses. `playwright.ldap.config.ts` starts its own server on 127.0.0.1:3186 and builds the frontend. The default Playwright config excludes this suite. Browser evidence is UI/HTTP contract coverage, not LDAP protocol or AD evidence. No production authentication seam was weakened for fixtures.

**Verification: exact commands, outcomes, and external log reference:**

All mutating, fixture, network-documentation and verification commands are recorded in append-only `~/.agents/logs/pabawi.jsonl`. Evidence is retained under `/tmp/pabawi-ldap-p6-*`. Used the retained Node 24.21.0 runtime and PostgreSQL fixture. No packages, archives or images were downloaded; no new artifact required a ClamAV scan.

- Initial prerequisite check passed 34 tests with three live LDAP cases skipped. Its command and output are in the external log and `/tmp/pabawi-ldap-p6-prerequisites.log`. Focused user HTTP/ownership verification passed 147 tests.
- Restarted the retained PostgreSQL container, created a new acceptance database, and verified its loopback endpoint as 55712. Both-adapter provisioning/session/mapping acceptance, including the new source/provenance case, passed all 56 tests:

~~~bash
docker start pabawi-ldap-p1-postgres
docker port pabawi-ldap-p1-postgres
docker exec pabawi-ldap-p1-postgres createdb -U postgres ldap_package6_verified
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55712/ldap_package6_verified npm run test --workspace=backend -- test/database/ldap-mappings.test.ts test/database/federated-provisioning.test.ts test/database/provider-bound-sessions.test.ts > /tmp/pabawi-ldap-p6-adapters.log 2>&1
~~~

- Full backend regression passed: 250 files passed, two skipped; 4075 tests passed, 15 skipped and one todo. Includes SQLite/PostgreSQL migrations and concurrency plus local/Entra/auth/transport regressions. Live OpenLDAP endpoints were not supplied in this session, so the live directory cases were skipped. Earlier package-5B real LDAP evidence remains historical evidence, not a fresh run here.
- Final full frontend regression passed all 63 files and 1079 tests. Focused refresh/provider/API regressions passed 53 tests. Final workspace lint passed with zero warnings; component checking reports zero errors with an unchanged zero baseline.
- Both production builds passed. Used separate frontend/backend build commands; the browser fixture also builds the production frontend. Vite retains its existing large-chunk warning.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55712/ldap_package6_verified npm run test --workspace=backend > /tmp/pabawi-ldap-p6-backend-final.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run test --workspace=frontend > /tmp/pabawi-ldap-p6-frontend-final-source.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run build:backend > /tmp/pabawi-ldap-p6-build-backend-final.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run build:frontend > /tmp/pabawi-ldap-p6-build-frontend-final.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run lint > /tmp/pabawi-ldap-p6-lint-complete.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run check:components > /tmp/pabawi-ldap-p6-components-final-source.log 2>&1
~~~

- Browser skill setup and documented recovery reported no available browser connection. Used the existing repository Playwright test runner with the new isolated fixture. All three Chromium cases passed: explicit short LDAP credentials and denial without fallback; local administrator mapping/diagnostics/null-contact profile flows; and denied non-administrator page access. Inspected retained screenshots `/tmp/pabawi-ldap-p6-mappings.png` and `/tmp/pabawi-ldap-p6-profile.png`.
- Browser acceptance found and corrected a restored-session race: provider discovery must not depend on permissions having finished loading at page mount. Public discovery now starts independently; private controls still wait for both guards. Initial fixture startup also exposed CommonJS top-level-await incompatibility; it now uses an async entrypoint. Initial static/scanner findings and a shadowed test variable were corrected before final gates.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH node_modules/.bin/playwright test --config playwright.ldap.config.ts > /tmp/pabawi-ldap-p6-browser-final-source.log 2>&1
~~~

- All seven documentation contracts pass. Standard tracked secret scanning passes with 176 reviewed findings. Separate all-files scanning covers all changed and untracked files and reports zero new findings without changing `.secrets.baseline`. It exposes the same pre-existing synthetic PostgreSQL URL at `backend/.env.example:40` previously recorded by package 5B; the exact line matches starting HEAD. The retained scan script/report are `/tmp/pabawi-ldap-p6-final-scan.py` and `/tmp/pabawi-ldap-p6-secrets-changed-report.json`. Password-state/type/string literals flagged by the scanner were annotated as nonsecrets, without adding baseline exceptions.
- `git diff --check` and external JSON Lines log validation pass. The PostgreSQL fixture was stopped with `docker stop pabawi-ldap-p1-postgres`; its container/database and all evidence are retained. Playwright stopped its isolated HTTP server normally.

**Pre-existing failures:** No blocking repository gate reproduced. The full frontend suite emits existing jsdom document-navigation notices, and Vite emits its existing bundle-size warning. All-files scanning still exposes the unchanged synthetic environment URL described above. The prior handoff's intermittent logger property defect did not reproduce and was not changed.

**Remaining work and blockers:** No package-6 blocker. Actual AD access/credentials remain unavailable and block package-7 interoperability and support claims. Review or replace the decommissioned DN-parser dependency before release. Live OpenLDAP end-to-end and the full rollout acceptance matrix remain package-7 work in this session. Real Proxmox console interoperability remains unverified separately from authorization fixtures. Do not reuse the historic PostgreSQL database with checksum drift. No push, PR, deployment, real-directory access or destructive repository cleanup occurred.

**Decisions or discoveries affecting the next package:** Keep provider discovery separate from directory availability and asynchronously loaded permissions. Use server-provided administration metadata, never infer account source from reserved usernames or email. Preserve manual and mapped grant provenance when rendering or editing users. Temporary client refresh failure must not discard the server-retryable credential or imply new eligibility. The browser fixture deliberately tests HTTP/UI contracts with synthetic directory responses; real LDAP and AD evidence must remain separate.

**Next action and acceptance criterion still to satisfy:** Start package 7. Audit every acceptance row, rerun real OpenLDAP in both TLS modes, obtain real AD access for GUID/account-policy/nested/large-membership/failover cases, verify both adapters and worker/transport races on the final release candidate, resolve dependency maintenance, and finish the observed deployment procedure. Missing real AD evidence is an explicit blocker, not a waived test.


## Handoff 2026-10-21 Codex package 7

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 7, interoperability and rollout, partially implemented and verified.
Status is `blocked`: real AD evidence, DN-parser maintenance and deployment-environment restore/rollout
rehearsal remain open. Passing local acceptance does not complete package 7 or authorize release.

**Branch, base commit, completion commit or uncommitted paths:** Branch `151`, base
`55c8107a43401a5709bb0f1635da666c1c01bf86`. Starting tree was clean. Package 6 is committed as
`55c8107`; its previous uncommitted reference in the progress table was corrected. Read AGENTS.md,
code-change/git/Context7 instructions, the progress table, package-7 scope and latest handoffs.
Verified the shared container composition, provider discovery/UI, account/source ownership, schema,
mapping and session contracts against current source and tests. KiroGraph has 225 pending files and
does not index LDAP symbols; used filesystem inspection without changing its index.
No completion commit was created. Changed/new paths:

~~~text
backend/src/services/AuthenticationService.ts
backend/test/database/ldap-authentication.test.ts
backend/test/database/provider-bound-sessions.test.ts
backend/test/fixtures/ldap/README.md
backend/test/fixtures/ldap/validation-worker.ts
backend/test/integration/ldap-rollout.test.ts
docs/integrations/ldap.md
docs/internal/plans/ldap-acceptance.md
docs/internal/plans/ldap-authentication.md
~~~

**Completed scope and changed interfaces:**

- Added [acceptance evidence](ldap-acceptance.md), mapping all fourteen plan rows to executable cases,
  separating live OpenLDAP, synthetic AD/protocol, actual worker-process and browser evidence.
- Added live HTTP rollout cases for SQLite/PostgreSQL and LDAPS/StartTLS. Each creates only uniquely
  named synthetic directory entries and removes its own entries at teardown, preserving seed data.
  Real bind/provisioning/mapping/refresh code proves zero-role enrollment without tokens, manual
  enrollment, mapped-role preservation after manual withdrawal, user move/rename with the same
  immutable account, profile refresh/null contacts, terminal policy revocation, group rename/recreation,
  remapping by new immutable subject and separate identity after user DN/login recreation.
- Added a separate Node worker fixture and six both-adapter process-boundary cases. These exercise
  the unchanged production authentication algorithm through distinct OS processes and independent
  database connections, proving overlapping forced-check coalescing, expired-lease fencing and
  mapping-revision rejection. Worker directory responses are controlled synthetic data. They provide
  real process coordination evidence, separate from LDAP protocol evidence.
- The live rollout exposed an existing PostgreSQL security defect: the shared failed-login upsert
  used an ambiguous unqualified counter. PostgreSQL rejected the statement before temporary-lockout
  enforcement, affecting both local and provider-scoped LDAP login. The new both-adapter regression
  reproduced the failure on starting production source, then passed after qualifying
  `login_attempt_counters.cumulative_failed_attempts`. SQLite behavior is preserved. No migration,
  dependency version, public API, environment setting or token contract changed.
- Expanded the fixture guide and operator staged upgrade procedure. It explains consistent backups
  including SQLite WAL contents, coordinated worker replacement, automatic migrations through 034,
  provider reauthentication, mapping/policy tests, outage/recovery, equivalent endpoint failover,
  matched backup/artifact restoration and the deployment rehearsal still required.
- Rechecked pinned primary registry metadata: `@ldapjs/dn@1.1.0` and transitive
  `@ldapjs/asn1@2.0.0` remain explicitly decommissioned. The installed `ldapts@9.2.0`
  DN export is a builder/equality class without the current string-parser/scope API; replacing it
  directly would change the security contract. No dependency-maintenance exception was accepted.
  A maintained replacement or explicit maintenance ownership, with DN-semantics regression coverage,
  remains required before release.

**Verification: exact commands, outcomes, and external log reference:**

All mutating, fixture, network metadata and verification commands are in append-only
`~/.agents/logs/pabawi.jsonl`. Evidence is retained under `/tmp/pabawi-ldap-p7-*`.
Used the retained supported Node 24.21.0 runtime, PostgreSQL 17.11 and OpenLDAP
2.6.10+dfsg-1. Fixture image:
`sha256:69cef797be2e96d15304a4f632d34639d8c5caa47a61bbd307c7c49bd99377dc`.
No package, archive or image was downloaded. Primary registry JSON metadata was downloaded;
ClamAV 1.5.4 scanned it and the copied public fixture CA, two files, zero infections.

Fixture commands:

~~~bash
docker start pabawi-ldap-p1-postgres
docker exec pabawi-ldap-p1-postgres createdb -U postgres ldap_package7_verified
docker run --detach --name pabawi-ldap-p7-openldap --pull never -p 127.0.0.1::1389 -p 127.0.0.1::1636 pabawi-ldap-fixture:package3-verified
mkdir -p /tmp/pabawi-ldap-p7-tls && docker cp pabawi-ldap-p7-openldap:/fixture/tls/ca.pem /tmp/pabawi-ldap-p7-tls/ca.pem && docker port pabawi-ldap-p7-openldap && docker port pabawi-ldap-p1-postgres
~~~

Acceptance endpoints were PostgreSQL 61764, LDAP StartTLS 61777 and LDAPS 61778 on loopback.
Use another fresh OpenLDAP container for the next session; its seed-on-start entrypoint does not
support reusing a populated fixture database. The old historical PostgreSQL database with migration
checksum drift was not reused.

- Prerequisite run: five files, all 85 cases passed with real TLS endpoints and both adapters.
- Live mutation matrix: all four adapter/TLS combinations passed.
- Lockout regression: starting PostgreSQL source failed and allowed a correct local password after
  five failures, with the ambiguous-column error in `lockout-red.log`. After the fix, both-adapter
  counter plus live mutation run passed all 18 cases (`lockout-green.log`).
- Focused database authentication passed all 50 cases, including the six actual process-boundary
  cases (`workers.log`).
- Final full backend acceptance passed: 252 files passed, one skipped; 4100 tests passed, two skipped,
  one todo. Includes live directory/HTTP mutation, both database adapters, upgrades, shared local/Entra
  regressions, races and every protected transport fixture.
- Full frontend regression passed all 63 files and 1079 tests. All three isolated Chromium UI/HTTP
  cases passed. Browser fixture setup built the production frontend; backend production build passed.
  Separate build commands preserve the established package-6 approach.
- Both workspace linters passed with zero warnings; component check reported zero errors and an
  unchanged zero baseline.

Final commands:

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:61764/ldap_package7_verified TEST_LDAP_LDAPS_PORT=61778 TEST_LDAP_STARTTLS_PORT=61777 TEST_LDAP_CA_FILE=/tmp/pabawi-ldap-p7-tls/ca.pem npm run test --workspace=backend > /tmp/pabawi-ldap-p7-backend.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run test --workspace=frontend > /tmp/pabawi-ldap-p7-frontend.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run build:backend > /tmp/pabawi-ldap-p7-build-backend.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run lint > /tmp/pabawi-ldap-p7-lint.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run check:components > /tmp/pabawi-ldap-p7-components.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH node_modules/.bin/playwright test --config playwright.ldap.config.ts > /tmp/pabawi-ldap-p7-browser.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH node --test scripts/documentation/contracts.test.mjs > /tmp/pabawi-ldap-p7-contracts.log 2>&1
PATH=/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin:$PATH bash scripts/quality/secret-scan.sh > /tmp/pabawi-ldap-p7-secrets.log 2>&1
PATH=/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin:$PATH python3 /tmp/pabawi-ldap-p7-final-scan.py > /tmp/pabawi-ldap-p7-secrets-changed.log 2>&1
~~~

All seven documentation contracts passed. Standard tracked secret scan passes with 176 reviewed
findings. Explicit all-files scanning covers all nine changed/new files and reports zero new findings
without changing `.secrets.baseline`. Unlike earlier sessions, this change does not touch the
environment example containing the previously recorded synthetic URL, so that unrelated finding is
outside its explicit changed-file scan.

Fixture shutdown completed successfully:

~~~bash
docker stop pabawi-ldap-p7-openldap pabawi-ldap-p1-postgres
~~~

Containers, the fresh database, public CA, image and logs are retained. Final `git diff --check` and
external JSON Lines validation pass. Initial fixture-only failures (missing accepted test signing key
and reuse of a rotated refresh credential) were corrected before final acceptance; they were not
production authentication regressions.

**Pre-existing failures:** The PostgreSQL counter defect was reproduced and fixed in scope.
No repository-wide blocking gate reproduced on final source. Existing frontend jsdom navigation
notices remain; the earlier logger property defect did not reproduce. Historic AD/parser release
blockers remain unresolved. No baseline entry, historical migration or unrelated logging code changed.

**Remaining work and blockers:** No authorized real AD environment/configuration was supplied or used.
Real AD TLS and equivalent-controller failover, binary GUID queries, policy/status visibility,
nested matching rules and large/ranged membership remain mandatory acceptance blockers.
The DN-parser maintenance gate remains open after current metadata review. Deployment-environment
backup restoration and the complete staged rollout have not been rehearsed; no production procedure
is claimed as observed. Real Proxmox provider compatibility remains separately unverified.
No remote push, PR, production deployment, real-directory access or destructive repository cleanup occurred.

**Decisions or discoveries affecting the next package:** Shared PostgreSQL counter SQL must remain
qualified to preserve both local and LDAP throttling. Actual OS-process tests now supplement the
earlier independent-connection evidence. Live mutation fixtures must preserve shared seed objects and
use unique records. Keep AD evidence separate from OpenLDAP, protocol mocks and browser fixtures.
The new acceptance report is the current audit index, not a release waiver.

**Next action and acceptance criterion still to satisfy:** Resume package 7 from its blocked gates.
Obtain an authorized actual AD test environment through local secret references; complete its
matrix without exporting personal directory data. Resolve parser maintenance with preserved parsed-DN
semantics, rerun the current candidate checks after any source/dependency change, and rehearse
backup/restore and coordinated upgrade in the target staging environment. Mark complete only when
every acceptance row has the required real evidence and the operational rehearsal passes.


## Handoff 2026-10-21 Codex package 7 continuation

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 7 continuation. Available local work is implemented and verified:
owned DN parsing, populated backup/restore/upgrade rehearsals, real LDAP transport outages on both
adapters/TLS modes and an executable acceptance runner. Package 7 remains blocked on actual AD.
Packaging cleanup also awaits the explicit deletion confirmation described below.

**Branch, base commit, completion commit or uncommitted paths:** Branch 151, base
55c8107a43401a5709bb0f1635da666c1c01bf86. This session started with the preceding package-7 working
tree and preserved it. No commit was created. Current changed/new files are the preceding handoff's
paths plus:

~~~text
backend/src/config/ldap.ts
backend/src/config/ldapDn.ts
backend/src/services/LdapDirectoryService.ts
backend/test/config/LdapDn.test.ts
backend/test/database/ldap-upgrade-recovery.test.ts
backend/test/helpers/ldapAuthentication.ts
backend/test/helpers/ldapTransport.ts
backend/test/security/ldap-transports.test.ts
e2e/ldap-ui/ldap.spec.ts
package.json
playwright.ldap.config.ts
scripts/acceptance/ldap.mjs
~~~

The combined working tree has 21 changed/new files. Read current AGENTS.md, the progress/acceptance
tables, latest handoffs, code discipline and Context7 instructions. The existing graph remains
incomplete for LDAP; direct source inspection covered every changed production caller.

**Completed scope and changed interfaces:**

- Runtime configuration, bind locator comparisons, scope checks and nested-group identity checks
  now use project-owned config/ldapDn.ts. Reviewed current primary standards, registry metadata,
  pinned ldapts source and a community fork before choosing a narrow owned module rather than a
  second complete LDAP stack. No new npm package was installed.
- The parser bounds input to 8192 bytes, validates attribute descriptors/OIDs and escaped UTF-8,
  preserves empty values and unordered multi-valued RDN assertions, rejects duplicates/malformed
  syntax and compares parsed suffixes. Descriptor case normalizes; values remain exact, without
  guessing schema matching, OID aliases or broad case folding. Complete definite-length BER with
  single-octet tags stays opaque and is never guessed to equal text; unsupported encodings fail
  closed. Tests include RFC-style vectors, invalid Unicode/BER/syntax, escaped scope injection and
  200 randomized Unicode cases. This is conservative locator equality, not a full directory schema
  matching engine. Pabawi owns maintenance of this module.
- The obsolete @ldapjs/dn dependency/lock entries and backend/src/types/ldapjs-dn.d.ts are deliberately
  unchanged pending confirmation. The user-supplied instructions explicitly require confirmation
  before deleting files. A concrete asynchronous approval request named the file and dependency;
  no affirmative reply has arrived. Do not infer approval from elapsed time. Runtime imports are
  removed, but do not report dependency cleanup or its release gate complete yet.
- Added ldap-upgrade-recovery.test.ts. Populated migration-030 SQLite state includes committed data
  in a nonempty WAL and uses VACUUM INTO; PostgreSQL uses matching-version pg_dump custom format and
  pg_restore with exit-on-error/single-transaction into another fresh database. The cases preserve
  identities, explicit Entra enrollment, roles, group membership and audit links; verify upgrades
  through 034, legacy reauthentication, local login, Entra-bound issuance/rotation, and restart
  without repeated session invalidation. They prove rollback of an intentionally failing fixture-only
  migration, restore the exact original snapshot, then successfully repeat the upgrade.
  Backups, databases and evidence are retained. No shipped migration changed.
- The transport suite now runs nine scenarios in five configurations: synthetic SQLite plus actual
  LDAPS/StartTLS on SQLite/PostgreSQL. The new helper uses a loopback TCP relay for actual connection
  interruption and creates unique directory entries for positive-policy mutations. Eligibility is
  not mocked in live cases. REST/refresh, execution/journal SSE, delayed MCP results, VNC/terminal
  delivery and idle/upgrade checks fail closed. It verifies unchanged failed freshness, retained
  retryable refresh credentials, local emergency login and transient recovery. Infrastructure
  payloads/upstream adapters remain local fixtures; no real Proxmox claim is made.
- Added npm run test:ldap and scripts/acceptance/ldap.mjs. The runner creates unique isolated local
  containers, discovers loopback ports, scans retained fixture artifacts, records image IDs/versions,
  runs backend/frontend/browser/build/lint/component/contracts/secrets, appends exact commands to
  the external log and stops its own fixtures in finally without deleting containers or data.
  --focused supports iterations; --build-fixture is an explicit source build. Existing local images
  are used without pull by default. Playwright screenshots/results now live with runner evidence.
- Updated fixture/operator documentation and the acceptance matrix with actual local recovery
  instructions, parser semantics and remaining release boundaries.

**Verification: exact commands, outcomes, and external log reference:**

Append-only command log: ~/.agents/logs/pabawi.jsonl. Subcommands started by the runner and PostgreSQL
backup/restore tests also append there. No pushes, PRs, production deployment or personal-directory
access occurred.

Focused parser/configuration/service acceptance passed 111 cases, including randomized Unicode.
The first runner passed 210 focused checks; the first live TLS transport expansion passed 226.
Both adapter recovery result manifests report all nine rehearsal stages passed.

The final complete runner command was:

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH:/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin npm run test:ldap -- --ldap-image pabawi-ldap-fixture:package3-verified --output-root /tmp > /tmp/pabawi-ldap-p7b-full-run.log 2>&1
~~~

Result: passed=true in /tmp/pabawi-ldap-acceptance-sGktn2/result.json.

- Full backend: 254 files passed, one skipped; 4176 tests passed, two skipped and one todo.
  Includes both adapters, live TLS/HTTP/mutations, all 45 transport cases, independent OS workers,
  populated upgrades and actual backup/restore. Evidence: 015-npm.log.
- Full frontend: 63 files and 1079 cases passed (016-npm.log).
- All three Chromium cases and the production frontend build passed; screenshots are retained
  under browser-results in that evidence directory (017-node.log).
- Backend production build, both workspace linters, zero-error component gate, all seven
  documentation contracts and tracked-tree secret scan passed (018 through 022 logs).
- Environment manifest records Node 24.21.0, OpenLDAP 2.6.10+dfsg-1 and PostgreSQL 17.11.
  LDAP image ID remains sha256:69cef797be2e96d15304a4f632d34639d8c5caa47a61bbd307c7c49bd99377dc;
  PostgreSQL image ID is sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3.
  Dynamic ports and retained container/database names are in environment.json and the recovery
  result manifests. Historical PostgreSQL data with checksum drift was never reused.
- Runner startup scanned 20 retained fixture/package/CA files with ClamAV 1.5.4, zero infections.
  Only primary registry JSON metadata was downloaded this session, no new npm archives/images.
  Its two retained JSON files also pass real ClamAV scanning.
- Failure cleanup was tested with an isolated temporary scanner returning 19. The runner exited 1,
  retained a failed result, ran no acceptance tests and stopped both of its fixtures. Expected
  rejection evidence: /tmp/pabawi-ldap-acceptance-IjDzAQ/result.json and
  /tmp/pabawi-ldap-p7b-failure-cleanup.log. Real ClamAV subsequently scanned those copied artifacts
  successfully. Docker inspection confirmed all normal/failure-path containers are exited.
- Explicit all-files scanning over all 21 changed/new files reports no new findings; baseline
  remains unchanged. Final documentation/whitespace/log checks and scans are in the external log
  and /tmp/pabawi-ldap-p7b-* artifacts.

**Pre-existing failures:** No blocking repository gate reproduced. Existing jsdom navigation notices
and browser color-environment warnings remain. The first parser fixture had an incorrectly written
dangling-escape literal, and initial lint rejected a non-null assertion; both were corrected before
the final full run. The intentional scanner rejection is expected failure-path evidence, not malware
or a release-candidate test failure. Previously recorded logger intermittency did not reproduce.

**Remaining work and blockers:** Actual AD is unavailable, as the user explicitly confirmed.
Its GUID, policy/status visibility, nested matching-rule, large membership and equivalent-controller
failover evidence remains mandatory for the original plan. Dependency/declaration removal awaits
explicit deletion approval. Local database recovery and actual LDAP transport rehearsals now pass;
target-environment storage/service/secret handling still requires its own staging validation before
any deployment. Actual Proxmox provider compatibility remains separately unverified.

**Decisions or discoveries affecting the next package:** Keep client DN values exact and directory
identity immutable; do not replace parsed scope with lowercased strings or assume unknown BER matches
text. The maintained code is intentionally narrow and has no new package graph. The runner retains
its containers/databases and uses fresh names every run, avoiding seed-on-restart and checksum drift.
An expected readiness probe can be nonzero before success; result.json distinguishes final acceptance
status. Both normal shutdown and scanner-failure shutdown are now observed.

**Next action and acceptance criterion still to satisfy:** On explicit approval, remove only the named
obsolete type declaration and unused @ldapjs/dn dependency/lock entries, confirm its transitive packages
are no longer required, and verify the resulting package graph plus parser/build/LDAP regressions.
Then update this approval gate in the progress/evidence documents. Obtain actual AD later and complete
every outstanding AD matrix row. Do not mark package 7 complete or claim real AD support until that
evidence exists. Production deployment still requires the repository's separate confirmation.


## Handoff 2026-10-21 Codex package 7 approved cleanup

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 7 approved parser packaging cleanup, complete. The user replied
"approved" to removal of the obsolete declaration and unused dependency. This supersedes the pending
approval statements in earlier handoffs. Package 7 remains blocked on real AD interoperability;
local OpenLDAP, transport, worker and recovery evidence remains passing.

**Branch, base commit, completion commit or uncommitted paths:** Branch 151, base 55c8107.
Preserved all earlier uncommitted work. This cleanup additionally changes backend/package.json
and package-lock.json, deletes backend/src/types/ldapjs-dn.d.ts, and updates the current acceptance,
operator and progress documents. No commit was created.

**Completed scope and changed interfaces:** Removed @ldapjs/dn, its unused @ldapjs/asn1 and
process-warning transitives, and the obsolete declaration. Runtime code already uses the owned
bounded parser and did not change in this cleanup. The before/after lockfile assertion proves exactly
those three package entries were removed, no package was added, and the only surviving entry change
is removal of @ldapjs/dn from the backend workspace dependencies. Every remaining package entry is
byte-for-byte equivalent as parsed JSON. The three unused installed package directories are absent.
No historic migration, provider/session contract or parser semantics changed.

**Verification: exact commands, outcomes, and external log reference:**

All mutation and verification commands append to ~/.agents/logs/pabawi.jsonl. Before snapshots and
the structural graph comparison are retained in /tmp/pabawi-ldap-p7c-*.

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm uninstall @ldapjs/dn --workspace=backend --ignore-scripts --offline --no-audit --no-fund > /tmp/pabawi-ldap-p7c-uninstall.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run test:ldap -- --focused --ldap-image pabawi-ldap-fixture:package3-verified --output-root /tmp > /tmp/pabawi-ldap-p7c-acceptance.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run build:backend > /tmp/pabawi-ldap-p7c-build.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run lint > /tmp/pabawi-ldap-p7c-lint.log 2>&1
~~~

- Offline removal reports exactly three packages removed. No downloads or lifecycle scripts ran.
  Graph proof: /tmp/pabawi-ldap-p7c-lock-verified.json.
- Focused post-removal acceptance passes all ten files and 247 cases. Includes owned parser/config,
  real OpenLDAP in both TLS modes, both database adapters, all transport scenarios, independent
  worker processes and populated backup/restore/upgrade rehearsals.
  /tmp/pabawi-ldap-acceptance-3jP2T7/result.json reports passed=true; command and case outputs,
  actual environment, image IDs and recovery backups are retained in that directory.
- Backend production build and both workspace linters pass without the obsolete declaration or
  installed packages. Frontend source is unchanged; its preceding 1079-test/three-browser-case
  full-run evidence remains applicable and was not needlessly rerun.
- The runner scanned 20 retained fixture/CA files with ClamAV and stopped both isolated containers
  successfully. Containers and databases remain retained; no new image or archive was downloaded.
- Final documentation contracts, whitespace checks, tracked-tree scan, changed-file scan and
  external JSON Lines validation pass. The generated lockfile has removal-only changes and is
  covered by the exact structural graph assertion; the explicit content scanner covers the other
  22 existing changed/new files. The deleted declaration has no remaining content to scan.
  No reviewed secret-baseline entry was added or changed.

**Pre-existing failures:** No repository verification blocker reproduced. KiroGraph context returned
an FTS syntax error for the task description; the already known stale LDAP index was not changed,
and targeted source/manifest inspection supplied the required context.

**Remaining work and blockers:** Parser maintenance/packaging approval is resolved. Actual AD
GUID/account-state/nested/large-membership/failover evidence remains unavailable and blocks completing
the original plan. Target-environment staging and production deployment remain separate operational
work. Real Proxmox provider compatibility remains unverified. No push, PR, deployment or unrelated
deletion occurred.

**Decisions or discoveries affecting the next package:** Keep the project-owned parser and its
regressions. Do not reinstall the decommissioned packages as a workaround. Existing earlier handoffs
describe the former approval gate for history; current progress and acceptance documents record it
closed.

**Next action and acceptance criterion still to satisfy:** Obtain an authorized real AD environment
when available and complete every outstanding AD acceptance row. Keep package 7 blocked until that
evidence exists. Use the reproducible acceptance runner for candidate changes and rehearse the target
deployment's storage/service/secret procedures before deployment.


## Handoff 2026-10-21 Codex package 7 CI and harness

**Date and agent:** 2026-10-21, Codex.

**Package and checkpoint:** Package 7 CI integration, opt-in AD harness and runner failure/interruption
checks implemented. Package 7 remains blocked until actual AD evidence exists. No AD configuration
was requested, no actual directory was accessed and no remote infrastructure was provisioned.

**Branch, base commit, completion commit or uncommitted paths:** Branch `151`. Initial HEAD was
`55c8107`; the existing package-7 work was committed concurrently as `7389784` during this session.
Preserved the original staged changes, the concurrent commit and later staging activity. This agent
created no commit and did not change the index. Additional changed/new paths:

- `.github/workflows/ci.yml`, `package.json`, `playwright.ldap.config.ts`.
- `scripts/acceptance/ldap.mjs`, `ldap-report.mjs`, `ldap.test.mjs`, `ci.test.mjs`, `ad.mjs`,
  `ad-config.mjs` and `ad.test.mjs`, all under `scripts/acceptance/`.
- `backend/test/fixtures/ldap/README.md`, `ad-lab.ts`, `ad-lab.example.json`, `tsconfig.ad.json`,
  plus `backend/test/unit/ad-lab.test.ts`.
- `docs/internal/plans/ldap-authentication.md` and `ldap-acceptance.md`.

**Completed scope and changed interfaces:**

CI uses a fail-fast=false PostgreSQL 15/17 matrix and the existing approved npm-install pattern.
The owned acceptance runner builds OpenLDAP, exercises both TLS modes with SQLite/PostgreSQL and
runs the separate LDAP Chromium configuration with `--focused --browser`. It checks actual server
major version with `--postgres-major`, rejects missing/skipped/failed live and browser results, and
retains JSON/JUnit, recovery archives/manifests, browser HTML and failure screenshots/traces on all
outcomes. Upload scope is synthetic acceptance data only, with private keys, downloads and CA files
excluded. No AD configuration or data enters this CI job.

`npm run test:ldap:ad` provides strict explicit lab configuration and private local secret-file
references. Absent configuration returns unavailable/not-run, adVerified=false, exit 1. Offline mode
validates settings, CA, secret permissions/resolved paths and parsed OU boundaries without connecting.
Only `--execute` opens a directory connection. The worker prepares both TLS modes, binary GUID
queries, user/group rename/recreation, observable disabled/expired/password-expired/locked accounts,
nested matching-rule/traversal, ranged large membership and controlled primary-transport failover to
an equivalent actual controller. Mutations require generated-child scope, an ownership marker and
unchanged GUID. Cleanup touches only owned objects and records incomplete work as failure. Synthetic
ownership journals retain relative object names for manual investigation without directory topology
or credentials. Actual execution and AD compatibility remain unverified.

`npm run test:ldap:runner` automates scanner/readiness/subprocess/deadline failures and SIGINT/SIGTERM,
including interrupted Docker creation and detached descendants that ignore SIGTERM. The optional
LDAP_RUNNER_REAL_FAILURES=1 mode uses actual Docker containers. Fixes record attempted creation before
Docker returns, give each readiness operation a separate deadline, preserve environment evidence on
failure, stop new work after cancellation, terminate descendants across process groups and inspect
shutdown. Signal exits are retained separately from numeric exit codes. Containers, volumes/data,
archives and evidence are never removed automatically.

**Verification: exact commands, outcomes, and external log reference:**

Every mutation/network/verification command is recorded in `~/.agents/logs/pabawi.jsonl`, including
runner child commands. The external `/tmp/pabawi-p7-command.py` wrapper logs literal multiline shell
commands after completion. Documentation/source/status reads were read-only. No npm package was
added or installed and no lockfile dependency changed. Actionlint 1.7.12 was downloaded from its
upstream release, verified against the published SHA-256 and scanned with real ClamAV after execution.

Commands from the repository root (supported Node prefix is explicit):

~~~bash
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run test:ldap -- --focused --browser --ldap-image pabawi-ldap-fixture:package3-verified --postgres-image postgres:15 --postgres-major 15 --output-root /tmp/pabawi-p7-candidate15 > /tmp/pabawi-p7-candidate15.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run test:ldap -- --focused --browser --ldap-image pabawi-ldap-fixture:package3-verified --postgres-image postgres:17 --postgres-major 17 --output-root /tmp/pabawi-p7-candidate17 > /tmp/pabawi-p7-candidate17.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run test:ldap -- --focused --browser --build-fixture --ldap-image pabawi-ldap-fixture:acceptance-ci-p7 --postgres-image postgres:17 --postgres-major 17 --output-root /tmp/pabawi-p7-built17 > /tmp/pabawi-p7-built17.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH node --test scripts/acceptance/*.test.mjs > /tmp/pabawi-p7-runner-final.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH LDAP_RUNNER_REAL_FAILURES=1 node --test scripts/acceptance/ldap.test.mjs > /tmp/pabawi-p7-runner-real-final.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run test --workspace=backend -- test/unit/ad-lab.test.ts > /tmp/pabawi-p7-ad-unit.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH node backend/node_modules/typescript/bin/tsc --project backend/test/fixtures/ldap/tsconfig.ad.json > /tmp/pabawi-p7-ad-types.log 2>&1
/tmp/pabawi-p7-actionlint/actionlint .github/workflows/ci.yml > /tmp/pabawi-p7-actionlint.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run build:backend > /tmp/pabawi-p7-next-build-backend.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run build:frontend > /tmp/pabawi-p7-next-build-frontend.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run lint > /tmp/pabawi-p7-next-lint.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH npm run check:components > /tmp/pabawi-p7-next-components.log 2>&1
PATH=/tmp/pabawi-node24/node-v24.21.0-darwin-arm64/bin:$PATH node --test scripts/documentation/contracts.test.mjs > /tmp/pabawi-p7-next-contracts.log 2>&1
PATH=/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin:$PATH bash scripts/quality/secret-scan.sh > /tmp/pabawi-p7-next-secrets.log 2>&1
PATH=/Users/al/.cache/pre-commit/repovdso_3ip/py_env-python3/bin:$PATH python3 /tmp/pabawi-ldap-p7-final-scan.py > /tmp/pabawi-p7-next-secrets-changed.log 2>&1
git diff HEAD --check
~~~

Each of the three live runs passes 252 cases, zero skipped, and all three dedicated browser cases.
They used OpenLDAP 2.6.10 with PostgreSQL 15.17/17.11 and the supported Node 24.21.0 runtime. A later
standalone ownership/cancellation regression increases the AD fixture-only suite to six passing cases.
The default Node contracts cover 14 cases including a complete valid offline AD configuration, strict
secret references, unavailable reporting, workflow wiring, report enforcement and lifecycle failures.
Actual-Docker regressions additionally cover real fixture shutdown and interrupted creation. Test
counts and retained case paths are in the final logs. Builds, workspace lint, component checks,
fixture typechecking, actionlint and all seven documentation contracts pass. The tracked secret scan
passes with 176 reviewed findings; the explicit changed/untracked-file scan finds zero new findings
without modifying `.secrets.baseline`. Whitespace and external JSON Lines validation pass.

Retained successful evidence:

- `/tmp/pabawi-p7-candidate15/pabawi-ldap-acceptance-BP4dyF`.
- `/tmp/pabawi-p7-candidate17/pabawi-ldap-acceptance-mmfqO5`.
- `/tmp/pabawi-p7-built17/pabawi-ldap-acceptance-FMdXtp`.
- `/tmp/pabawi-p7-session-evidence.json` indexes versions, image IDs and independent shutdown
  verification. The real failure log contains exact additional `/var/folders/...` evidence paths;
  synthetic CLI regression directories also remain retained there. No private keys were copied.
- `/tmp/pabawi-p7-failure-clamav.log` records an independent real scan including intentionally
  scanner-rejected downloads. Fixture copies are otherwise scanned by the runner itself.

The workflow was validated locally, including fixture build, real protocols, browser commands and
artifact generation. No GitHub-hosted Actions execution, remote workflow trigger or deployment occurred.

**Pre-existing failures:** KiroGraph omitted the acceptance scripts and LDAP context, consistent with
its previously stale/incomplete index; targeted source/caller inspection supplied context without
reindexing. Direct ad-hoc tsc initially selected root TypeScript 6/Node 20 declarations; using the
backend compiler and existing Node TLS declarations passes. The detached-grandchild red regression
confirmed a real intermediate orchestration defect; its log is `/tmp/pabawi-p7-detached-red.log`.
The first real failure-suite rerun used an unrealistically short normal readiness budget under load,
so one subprocess case failed before its intended injection. Separating normal startup from the
readiness-failure budget resolves it. Scanner findings on synthetic invalid-config vectors were
reviewed and line-locally annotated. No unresolved repository gate reproduced on the final candidate.

**Remaining work and blockers:** Actual Microsoft AD DS protocol/schema/policy/replication and
large-directory evidence remain unavailable. The opt-in harness is prepared and locally tested,
not actual AD acceptance. Target-environment staging and production operations remain separate work;
real Proxmox interoperability is separately unverified. Package 7 stays blocked. No push, PR,
deployment, remote workflow trigger, real-directory access, branch/file deletion or destructive
repository cleanup was performed by this agent.

**Decisions or discoveries affecting the next package:** The runtime authentication implementation,
owned parser, migrations and dependency cleanup remain intact. Preserve all historical handoffs and
this distinction between actual protocols, simulated provider/browser responses, harness safety and
actual AD compatibility. Keep secret-bearing AD configuration outside CI artifacts and the repository.

**Next action and acceptance criterion still to satisfy:** When separately authorized actual AD
access exists, review the opt-in fixture guide and run the prepared matrix in that disposable lab.
Keep actual AD evidence separate from mocks, OpenLDAP and Samba. Complete package 7 only when every
required AD acceptance row has real passing evidence and the target deployment rehearsal is satisfied.
