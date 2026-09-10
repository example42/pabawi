# Initial administrator enrollment

Before first start, generate an installation-specific bootstrap token with
`openssl rand -hex 32` and store it as `PABAWI_BOOTSTRAP_TOKEN` in `backend/.env`
(or the container's environment file or deployment secret). Generate it
independently of `JWT_SECRET`. The interactive `scripts/setup.sh` generates both.
Restrict the environment file to the operator and application account. Do not
commit it or place the token in a URL, command-line argument or shared log.

Keep first-start access private using a loopback binding, SSH tunnel or restricted
ingress. Use HTTPS for remote access. Open the setup form, enter the bootstrap
token and administrator details, and choose the registration policy. Merely
reaching an unconfigured installation does not authorize enrollment. Missing or
invalid tokens return 403, and an unset token disables enrollment. Configured
tokens must contain 32 to 512 characters; use the random generation command above.

For API clients, `POST /api/setup/initialize` requires the
`X-Pabawi-Bootstrap-Token` header. Its JSON body contains `username`, `email`,
`password`, `firstName`, `lastName`, `allowSelfRegistration` and
`defaultNewUserRole` (a role ID or null). Success returns 201; subsequent
authorized attempts return 409. `GET /api/setup/status` is public and never
returns the token.

The claim, administrator account and setup configuration commit in one database
transaction. Concurrent requests, including separate application connections,
have one winner. If account creation or configuration saving fails, everything
rolls back and the same token can be used to retry after fixing the cause. If the
response is lost, check setup status and try logging in before retrying enrollment.

After success, remove `PABAWI_BOOTSTRAP_TOKEN` from deployment configuration and
restart the application. A persisted completion marker keeps enrollment closed
even if the administrator is later deactivated or loses administrator status.
Migration 028 also records completion for existing installations with an
administrator, including inactive administrators.

An older installation may already contain an administrator from an incomplete
setup. It remains closed to public enrollment. Use the existing administrator to
review settings; if unavailable, restore a consistent pre-failure backup or use
your controlled database/account recovery process. Preserve the failed database
for diagnosis. Do not delete accounts or the completion marker to reopen the
public setup flow.
