# Supply-Chain Install Script Protection

## Context

An attempt was made to add LavaMoat `allow-scripts` + a blanket `.npmrc` `ignore-scripts=true`. The combination broke `npm install` because packages with legitimate install scripts (`bcrypt`, `@playwright/test`, native bindings) were silently blocked.

## Recommended Approach

Use `@lavamoat/allow-scripts` **without** a global `.npmrc` `ignore-scripts=true`. LavaMoat's mechanism is more granular — it blocks scripts by default and lets you whitelist only the packages that need them.

### Steps

1. Install the tooling:

   ```bash
   npm install --save-dev @lavamoat/allow-scripts
   npm install @lavamoat/preinstall-always-fail
   ```

2. Generate the allowlist from the current lockfile:

   ```bash
   npx allow-scripts auto
   ```

   This populates `package.json` → `lavamoat.allowScripts` with every package that declares an install script, set to `false` by default.

3. Review the generated list. Set `true` only for packages that genuinely need install scripts:

   - `bcrypt` — native `node-gyp` build
   - `@playwright/test` — downloads browser binaries
   - `better-sqlite3` or `sqlite3` — native compilation (if used)
   - `esbuild` / `@esbuild/*` — binary download
   - Any other native addon

4. **Do NOT add `.npmrc` with `ignore-scripts=true`** — it overrides LavaMoat and breaks everything.

5. Verify:

   ```bash
   rm -rf node_modules
   npm ci
   npm test
   npx playwright install  # if browsers are needed
   ```

6. Add a CI check that runs `npx allow-scripts` to catch new packages sneaking in install scripts without explicit approval.

### Why This Matters

Supply-chain attacks via malicious `postinstall` scripts are a real vector (event-stream, ua-parser-js, etc.). Controlling which packages can execute code at install time is a meaningful security layer — but it must be done with a proper allowlist, not a blanket ban that silently breaks the build.

## Priority

Low — security hardening, not a functional bug. Address when doing a dependency audit pass.
