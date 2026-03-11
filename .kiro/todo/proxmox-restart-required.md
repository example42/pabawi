# Proxmox Integration - Restart Required

## Issue

The backend server is showing "Cannot find module 'undici'" error during Proxmox initialization, even though the undici import has been removed from the source code.

## Root Cause

The server is running with cached/compiled code that still contains the old undici import. TypeScript compilation or Node.js module caching is serving the old version.

## Solution

Restart the backend server to pick up the updated code:

```bash
# Stop the current backend server (Ctrl+C if running in terminal)
# Then restart it
cd pabawi
npm run dev
```

## What Was Fixed

1. Removed undici import from ProxmoxClient.ts
2. Changed SSL configuration to use `NODE_TLS_REJECT_UNAUTHORIZED` environment variable instead of undici's Agent
3. This approach works with Node.js 18+ native fetch API

## Verification Steps

After restarting:

1. Check backend logs for successful Proxmox initialization
2. Visit the home page - Proxmox should show as "connected" (not "not initialized")
3. Health checks should pass without "fetch failed" errors

## Current Configuration

The .env file has correct Proxmox configuration:

- PROXMOX_ENABLED=true
- PROXMOX_HOST=minis.office.lab42
- PROXMOX_PORT=8006
- PROXMOX_TOKEN configured
- PROXMOX_SSL_REJECT_UNAUTHORIZED=false

## Expected Behavior After Restart

- Proxmox integration initializes successfully
- Health checks pass
- Integration shows as "connected" on home page
- Provision page shows Proxmox resources
