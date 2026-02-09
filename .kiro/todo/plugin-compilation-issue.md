# CRITICAL: Plugin Compilation Issue

## Date: 2026-02-08

## Issue

Four plugins (hiera, puppetdb, puppetserver, ssh) are not loading because their TypeScript backend code has not been compiled to JavaScript.

## Root Cause

The PluginLoader expects compiled JavaScript files (`plugin.js` or `backend/index.js`), but these plugins only have TypeScript source files:

```
[2026-02-08T14:13:15.636Z] ERROR [PluginLoader] [loadPlugin] Failed to load plugin module: /Users/al/Documents/GITHUB/pabawi/plugins/native/hiera 
{"error":"Error: No valid entry point found for plugin at /Users/al/Documents/GITHUB/pabawi/plugins/native/hiera: Cannot find module '/Users/al/Documents/GITHUB/pabawi/plugins/native/hiera/plugin.js'"}
```

## Affected Plugins

1. **hiera** - Has TypeScript files in `backend/` but no compiled `.js` files
2. **puppetdb** - Has TypeScript files in `backend/` but no compiled `.js` files  
3. **puppetserver** - Has TypeScript files in `backend/` but no compiled `.js` files
4. **ssh** - Has TypeScript files in `backend/` but no compiled `.js` files

## Working Plugins

- **ansible** - Has compiled `.js` files in `backend/`
- **bolt** - Has compiled `.js` files in `backend/`

## Current State

- API returns only 2 plugins (ansible, bolt) instead of 6
- Navigation only shows 2 plugins
- Users cannot access hiera, puppetdb, puppetserver, or ssh functionality

## Compilation Attempt

Attempted to compile hiera plugin resulted in TypeScript errors:

```
plugins/native/hiera/backend/index.ts(150,28): error TS2345: Argument of type 'HieraService' is not assignable to parameter of type 'HieraServiceInterface'.
```

## Required Actions

1. **Fix TypeScript compilation errors** in all 4 plugins
2. **Set up build process** for plugins (either individual or centralized)
3. **Add build scripts** to ensure plugins are compiled before backend starts
4. **Update CI/CD** to compile plugins as part of build process
5. **Document plugin development workflow** including compilation steps

## Temporary Workaround

None - plugins must be compiled to work.

## Impact

- **HIGH**: 4 out of 6 native plugins are non-functional
- Users cannot access 67% of plugin functionality
- Navigation and integration type views are incomplete
- Checkpoint 14 cannot pass until this is resolved

## Next Steps

1. Fix TypeScript errors in each plugin
2. Compile all plugins
3. Verify all 6 plugins load successfully
4. Re-run checkpoint 14 verification
