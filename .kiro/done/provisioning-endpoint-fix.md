# Provisioning Endpoint Fix

## Issue

The frontend was calling `/api/integrations/provisioning` but this endpoint didn't exist in the backend, causing a JSON parse error: "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"

## Root Cause

The backend was returning an HTML error page (likely a 404) instead of JSON because the endpoint was missing.

## Solution Implemented

1. Created `backend/src/routes/integrations/provisioning.ts` with a GET endpoint that returns available provisioning integrations
2. Updated `backend/src/routes/integrations.ts` to mount the provisioning router with authentication and RBAC middleware
3. The endpoint now returns a list of integrations with their capabilities in the expected format

## Files Changed

- `pabawi/backend/src/routes/integrations/provisioning.ts` (new)
- `pabawi/backend/src/routes/integrations.ts` (updated)

## Testing Required

- Verify the endpoint returns proper JSON when authenticated
- Test that the frontend ProvisionPage loads without errors
- Verify Proxmox integration is discovered and displayed

## Status

✅ Backend endpoint created
✅ Health status integration added
✅ Tested - Provision page loads successfully

The endpoint now properly reflects the Proxmox integration's health status:

- `connected`: Health check passed
- `degraded`: Health check failed (e.g., API unreachable)
- `not_configured`: Plugin not initialized or disabled
