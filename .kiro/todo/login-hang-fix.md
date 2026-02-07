# Login Page Hang Issue - FIXED

## Problem

After entering credentials, the login page remained stuck at "Signing in..." with no errors in frontend or backend logs. The browser would hang indefinitely.

## Root Cause

The app initialization flow had a race condition:

1. User navigates to `/login` → App shows loading screen while waiting for `coordinator.initialize()`
2. User logs in successfully → `auth.login()` succeeds
3. Login page tries to navigate to home page via `router.navigate()`
4. **BUT** the app is still showing the loading screen because `coordinator.initialize()` hasn't completed
5. The router navigation is blocked because the app hasn't finished initializing
6. Result: Stuck at "Signing in..." forever

## Solution

Modified the initialization flow to allow public routes (login, setup) to render before initialization completes:

### Changes Made

1. **App.svelte** - Allow public routes to render without waiting for initialization:
   - Modified rendering logic to show login/setup pages even when `coordinator.state.status !== 'loaded'`
   - Skip initialization when on login page initially
   - Only show navigation and footer when fully initialized

2. **LoginPage.svelte** - Trigger initialization after successful login:
   - Import `getInitializationCoordinator`
   - After successful login, check if app is initialized
   - If not initialized, call `coordinator.initialize()` before navigating
   - This ensures the app is ready before showing the home page

3. **InitializationCoordinator.svelte.ts** - Increased timeouts and improved error handling:
   - Increased `menuBuildTimeout` from 5s to 30s (plugin loading can be slow)
   - Increased `totalTimeout` from 15s to 45s
   - Added better progress reporting during menu build
   - Added more descriptive error messages for timeouts

4. **MenuBuilder.svelte.ts** - Made plugin loading more resilient:
   - Catch and log errors during individual plugin registration
   - Continue with menu build even if some plugins fail to load
   - Don't throw errors that would block the entire initialization

## Testing

1. Navigate to `http://localhost:5173`
2. Should redirect to login page (no loading screen)
3. Enter credentials and click "Sign in"
4. Should show "Signing in..." briefly
5. After login succeeds, should initialize the app (show "Building Menu" progress)
6. Should navigate to home page once initialization completes

## Menu Build Timeout Issue

If you see "Menu initialization failed: Failed to build menu: Menu build timeout":

### Causes

- Slow plugin loading (many plugins or large plugin files)
- Slow network connection to backend API
- Backend taking too long to respond to `/api/integrations/menu`

### Solutions

1. **Increase timeout** (already done - now 30 seconds)
2. **Check backend logs** for slow API responses
3. **Reduce plugin count** if you have many plugins
4. **Check network** - ensure backend is accessible at `http://localhost:3000`

### Debugging

Check browser console for detailed logs:

- Plugin loading progress
- Widget registration status
- API call timing
- Specific error messages

## Verbosity Control

### Backend Logging

Control via `LOG_LEVEL` environment variable in `backend/.env`:

```bash
# Options: error, warn, info, debug
LOG_LEVEL=warn
```

### Frontend Logging

Vite dev server verbosity is controlled by Vite itself. To reduce output:

```bash
# In frontend/package.json, modify the dev script:
"dev": "vite --logLevel warn"
```

Or run directly:

```bash
cd frontend
npm run dev -- --logLevel warn
```

### Current Behavior

- Backend: Uses LoggerService with LOG_LEVEL env var (defaults to 'info')
- Frontend: Vite dev server shows all output by default
- No silent mode needed - logs are helpful for debugging

## Related Files

- `frontend/src/App.svelte`
- `frontend/src/pages/LoginPage.svelte`
- `frontend/src/lib/initialization/InitializationCoordinator.svelte.ts`
- `frontend/src/lib/navigation/MenuBuilder.svelte.ts`
- `backend/src/services/LoggerService.ts`
