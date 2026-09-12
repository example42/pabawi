# Diagnostic data and workload limits

Diagnostics use the same recursive redaction policy in the backend and browser.
It covers API request/response logs and previews, buffered logs, expert-mode
metadata and errors, crash JSON, native reports, and support-copy output.
Operational inventory, facts and execution results retain their own authorization
contract; diagnostic redaction does not rewrite those results.

## Secret handling

Credential fields (including nested arrays and serialized JSON), authentication
and cookie headers, URL userinfo, credential query parameters, OAuth codes/state,
stream tickets, bearer/basic credentials, JWTs and PEM private keys are redacted.
Redaction happens before preview truncation. Native reports exclude environment
variables; exports also suppress legacy environment and command-line fields.
Viewing and downloading an old crash report applies the current policy instead
of serving its original bytes. Invalid JSON is omitted. Symlinks and files outside
the application's `crash-*.json` / `report-*.json` naming convention are excluded.

Support-copy storage and cookie collection remains opt-in. When enabled, it
exports at most 100 names per store, with every value redacted. Diagnostic strings
have a 16 KiB character limit; traversal stops at depth 12, 100 items per
collection, 2,000 visited values and a 64 KiB aggregate text budget. Buffered log
entries use an 8 KiB aggregate text budget. Oversized values and circular
references receive explicit omission markers.

This is pattern-based sanitization, not a guarantee that an arbitrary unlabeled
secret embedded in provider prose can be recognized. Review support material
before sharing it. Existing files may still contain secrets at rest until removed
by retention or an administrator; exported copies are sanitized immediately.

Access and refresh tokens still live in browser localStorage. This preserves the
current bearer-client protocol and makes same-origin script compromise a token
theft risk. Diagnostic exports exclude those values. Moving refresh credentials
to HttpOnly cookies requires a separate CSRF and cross-origin protocol change.

## Retention

`PABAWI_CRASH_DUMP_DIR`, read through ConfigService, selects the crash directory.
Before configuration loads, startup diagnostics use `<cwd>/crash-dumps`.
Application-generated files have mode 0600 and their directory mode 0700.
Retention runs on writes, API access, startup and hourly:

| Limit | Value |
| --- | --- |
| Maximum file age | Seven days, based on modification time |
| Maximum retained files | 20, newest first |
| Maximum individual file size | 2 MiB |
| Maximum combined file size | 10 MiB |

Expired, oversized and excess application-named regular files are removed.
The request recorder retains at most 1,000 in-flight and 200 completed requests.
Backend logs retain 2,000 bounded entries in memory. Uploaded frontend logs retain
at most 100 entries per correlation ID and 100 IDs, with a five-minute lifetime
based on server receipt time and cleanup each minute. Browser pending uploads
retain at most 100 entries. Stdout/stderr retention belongs to the process
supervisor or log collector; configure its disk quota and retention separately.

## Workload budgets

All budgets are process-local, matching the supported single-process deployment.

| Boundary | Budget |
| --- | --- |
| Local credential attempts | 10 per IP per 15 minutes |
| Refresh exchange | 30 per IP per minute |
| Entra login/callback/token combined | 30 per IP and 300 globally per 15 minutes |
| MCP HTTP requests | 100 per authenticated account per minute |
| MCP open HTTP requests | Four per account, 20 globally |
| MCP provider tool operations | Four per account, 20 globally |
| MCP sessions | Ten per account, 100 globally, 24-hour maximum lifetime |

SSO exemptions use the actual method and router-relative path. Query text never
creates an exemption. MCP account budgets span JWT/static authentication and
session IDs. Provider capacity is held until the tool promise settles, including
after client disconnection or session closure. There is no automatic replay or
cancellation of the upstream query. HTTP budget exhaustion returns 429 and retry
headers; tool-capacity exhaustion returns an MCP tool error.

Express leaves `trust proxy` disabled. Forwarded headers cannot choose a limiter
identity. Direct clients use their socket IP; clients behind a reverse proxy
share that proxy's pre-authentication IP budget. Authenticated REST/MCP budgets
still distinguish accounts. Do not enable unrestricted proxy trust to work
around shared budgets. A topology with client-IP forwarding needs an explicit
trusted-proxy policy and ingress limits before it can be supported.
