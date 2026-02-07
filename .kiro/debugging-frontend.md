# Frontend Debugging Guide

## Browser Developer Tools

### Opening DevTools

- **Chrome/Edge**: `Cmd+Option+I` (Mac) or `F12` (Windows/Linux)
- **Firefox**: `Cmd+Option+I` (Mac) or `F12` (Windows/Linux)
- **Safari**: Enable Developer menu in Preferences, then `Cmd+Option+I`

### Console Tab

The console shows:

- Application logs (console.log, console.error, etc.)
- JavaScript errors and stack traces
- Network errors
- Svelte component warnings

**Key things to check:**

```javascript
// Filter console by level
// Click the filter dropdown: All levels, Errors, Warnings, Info, Verbose

// Common error patterns to look for:
// - "Failed to fetch" → Backend not running or CORS issue
// - "Timeout" → Request taking too long
// - "Cannot read property of undefined" → Data structure issue
// - "Module not found" → Import path issue
```

### Network Tab

Shows all HTTP requests:

1. Click "Network" tab
2. Reload page to capture all requests
3. Look for:
   - **Red requests** → Failed (check status code)
   - **Slow requests** → Performance issues (check time column)
   - **404s** → Missing endpoints
   - **500s** → Backend errors

**Useful filters:**

- `XHR` → API calls only
- `JS` → JavaScript files
- `All` → Everything

**Inspect a request:**

- Click on any request to see:
  - Headers (request/response)
  - Preview (formatted response)
  - Response (raw data)
  - Timing (how long each phase took)

### Sources Tab

Debug JavaScript code:

1. Click "Sources" tab
2. Navigate to your file in the file tree
3. Click line numbers to set breakpoints
4. Reload page to trigger breakpoints

**Breakpoint controls:**

- `F8` or ▶️ → Resume execution
- `F10` or ⤵️ → Step over (next line)
- `F11` or ⬇️ → Step into (enter function)
- `Shift+F11` or ⬆️ → Step out (exit function)

**Useful features:**

- **Watch expressions** → Monitor variable values
- **Call stack** → See function call chain
- **Scope** → View local/global variables
- **Conditional breakpoints** → Right-click line number

### Application Tab

Inspect browser storage:

- **Local Storage** → Check `pabawi_auth_tokens` and `pabawi_auth_user`
- **Session Storage** → Temporary data
- **Cookies** → Session cookies
- **Cache** → Service worker cache

**Clear storage:**

- Right-click on domain → Clear
- Or use "Clear site data" button

## Vite Dev Server

### Running with Debug Output

```bash
cd frontend

# Normal mode (default)
npm run dev

# Verbose mode (more logs)
npm run dev -- --debug

# Quiet mode (less noise)
npm run dev -- --logLevel warn

# Silent mode (errors only)
npm run dev -- --logLevel error
```

### Hot Module Replacement (HMR)

Vite automatically reloads when you save files:

- **Full reload** → HTML changes
- **Hot reload** → CSS/Svelte changes (preserves state)
- **Error overlay** → Shows compilation errors in browser

If HMR stops working:

1. Check console for errors
2. Restart dev server
3. Clear browser cache

### Build Errors

```bash
# Check for TypeScript errors
npm run lint

# Build for production (catches more errors)
npm run build

# Preview production build
npm run preview
```

## Application-Specific Debugging

### Authentication Issues

Check browser console for:

```javascript
// Auth state
console.log('Auth state:', auth.getState());

// Check if authenticated
console.log('Is authenticated:', auth.isAuthenticated);

// Check user
console.log('Current user:', auth.user);

// Check permissions
console.log('Permissions:', auth.permissions);
```

Check Local Storage:

1. Open DevTools → Application → Local Storage
2. Look for:
   - `pabawi_auth_tokens` → JWT tokens
   - `pabawi_auth_user` → User data and permissions

**Clear auth state:**

```javascript
// In browser console
localStorage.removeItem('pabawi_auth_tokens');
localStorage.removeItem('pabawi_auth_user');
location.reload();
```

### Initialization Issues

Check browser console for:

```javascript
// Initialization state
console.log('Coordinator state:', coordinator.state);

// Check if initialized
console.log('Is initialized:', coordinator.isInitialized());

// Check for errors
console.log('Last error:', coordinator.state.error);
```

**Common initialization errors:**

- "Backend readiness timeout" → Backend not responding
- "Menu build timeout" → Plugin loading too slow
- "Failed to fetch integration menu" → Backend API error

### Menu/Navigation Issues

Check browser console for:

```javascript
// Menu state
console.log('Menu:', menuBuilder.menu);

// Check if building
console.log('Is building:', menuBuilder.isBuilding);

// Check for errors
console.log('Last error:', menuBuilder.lastError);
```

### Plugin Loading Issues

Check browser console for:

```javascript
// Plugin loader state
import { getPluginLoader } from './lib/plugins';
const loader = getPluginLoader();

console.log('Loaded plugins:', loader.getLoadedPlugins());
console.log('Plugin count:', loader.getLoadedPlugins().length);
```

**Common plugin errors:**

- "Failed to load plugin" → Plugin file missing or malformed
- "Widget registration failed" → Widget component error
- "Invalid plugin manifest" → plugin.json schema error

### Router Issues

Check browser console for:

```javascript
// Current route
console.log('Current path:', router.currentPath);
console.log('Current params:', router.currentParams);
console.log('Current query:', router.currentQuery);
```

Add debug logging to router:

```javascript
// In router.svelte.ts, add:
$effect(() => {
  console.log('[Router] Path changed:', router.currentPath);
});
```

## Svelte-Specific Debugging

### Svelte DevTools

Install browser extension:

- **Chrome**: [Svelte DevTools](https://chrome.google.com/webstore/detail/svelte-devtools/ckolcbmkjpjmangdbmnkpjigpkddpogn)
- **Firefox**: [Svelte DevTools](https://addons.mozilla.org/en-US/firefox/addon/svelte-devtools/)

Features:

- Component tree inspector
- Props and state viewer
- Event listener tracking
- Performance profiling

### Reactive State Debugging

Add logging to reactive statements:

```svelte
<script>
  let count = $state(0);
  
  // Debug state changes
  $effect(() => {
    console.log('[Debug] count changed:', count);
  });
  
  // Debug derived state
  const doubled = $derived.by(() => {
    console.log('[Debug] computing doubled');
    return count * 2;
  });
</script>
```

### Component Lifecycle Debugging

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  
  onMount(() => {
    console.log('[Component] Mounted');
    return () => {
      console.log('[Component] Cleanup');
    };
  });
  
  onDestroy(() => {
    console.log('[Component] Destroyed');
  });
</script>
```

## Common Issues and Solutions

### Issue: "Failed to fetch" errors

**Cause**: Backend not running or CORS issue

**Debug:**

1. Check if backend is running: `ps aux | grep tsx`
2. Check backend logs in terminal
3. Try accessing API directly: `curl http://localhost:3000/api/health`
4. Check Network tab for exact error

**Solution:**

```bash
# Start backend
cd backend
npm run dev
```

### Issue: White screen / blank page

**Cause**: JavaScript error preventing render

**Debug:**

1. Open Console tab
2. Look for red errors
3. Check if any files failed to load (Network tab)

**Solution:**

- Fix JavaScript errors
- Clear browser cache
- Restart dev server

### Issue: Changes not reflecting

**Cause**: HMR not working or cache issue

**Debug:**

1. Check console for HMR errors
2. Check if file is being watched by Vite

**Solution:**

```bash
# Hard refresh
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

# Or restart dev server
# Ctrl+C to stop, then npm run dev
```

### Issue: Slow page load

**Cause**: Large bundle or slow API calls

**Debug:**

1. Network tab → Check request timing
2. Performance tab → Record page load
3. Check bundle size: `npm run build`

**Solution:**

- Optimize imports (use dynamic imports)
- Reduce plugin count
- Check backend performance

### Issue: Login stuck / infinite loading

**Cause**: Initialization timeout or auth flow issue

**Debug:**

1. Console → Look for timeout errors
2. Network → Check `/api/auth/login` response
3. Application → Check Local Storage for tokens

**Solution:**

- Check backend logs
- Clear Local Storage
- Increase timeouts (already done)

## Advanced Debugging

### Enable Verbose Logging

Add to `frontend/src/lib/logger.svelte.ts`:

```typescript
// Set log level to debug
const LOG_LEVEL = 'debug';
```

### Add Custom Logging

```typescript
import { logger } from './lib/logger.svelte';

logger.debug('MyComponent', 'operation', 'Debug message', { data: 'value' });
logger.info('MyComponent', 'operation', 'Info message');
logger.warn('MyComponent', 'operation', 'Warning message');
logger.error('MyComponent', 'operation', 'Error message', error);
```

### Performance Profiling

```javascript
// In browser console
console.time('operation');
// ... code to measure ...
console.timeEnd('operation');

// Or use Performance API
const start = performance.now();
// ... code to measure ...
const end = performance.now();
console.log(`Operation took ${end - start}ms`);
```

### Memory Leaks

1. Open DevTools → Memory tab
2. Take heap snapshot
3. Perform actions
4. Take another snapshot
5. Compare snapshots to find leaks

## Quick Reference

### Essential Console Commands

```javascript
// Clear console
clear()

// Inspect object
console.dir(object)

// Table view
console.table(array)

// Group logs
console.group('Group name')
console.log('Item 1')
console.log('Item 2')
console.groupEnd()

// Stack trace
console.trace()

// Assert
console.assert(condition, 'Error message')
```

### Keyboard Shortcuts

- `Cmd+K` → Clear console
- `Cmd+F` → Search in current panel
- `Cmd+P` → Quick open file
- `Cmd+Shift+P` → Command palette
- `Esc` → Toggle console drawer

### Useful URLs

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:3000/api>
- Health check: <http://localhost:3000/api/health>
- Integration menu: <http://localhost:3000/api/integrations/menu>

## Getting Help

When reporting issues, include:

1. **Console errors** (screenshot or copy/paste)
2. **Network tab** (failed requests)
3. **Steps to reproduce**
4. **Browser and version**
5. **What you expected vs what happened**

Example:

```
Browser: Chrome 120
URL: http://localhost:5173/login
Error: "Menu build timeout"
Console: [screenshot]
Network: All requests successful
Steps: 1. Open app, 2. Login, 3. Wait, 4. Timeout error
Expected: Should load home page
Actual: Shows timeout error
```
