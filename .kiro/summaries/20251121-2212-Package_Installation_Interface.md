# Package Installation Interface Implementation

**Date:** November 21, 2025, 22:12  
**Task:** Implement package installation interface in node detail page (Task 17)

## Summary

Successfully implemented a complete package installation interface for the Pabawi web application, allowing users to
install packages on target nodes through a configurable Bolt task.

## Changes Made

### Backend Changes

1. **Configuration Schema** (`backend/src/config/schema.ts`)
   - Added `packageInstallTask` configuration (default: `tp::install`)
   - Added `packageInstallModule` configuration (default: `example42/tp`)

2. **Configuration Service** (`backend/src/config/ConfigService.ts`)
   - Added methods to load package installation configuration from environment variables
   - Added `getPackageInstallTask()` and `getPackageInstallModule()` methods

3. **Bolt Service** (`backend/src/bolt/BoltService.ts`)
   - Added `installPackage()` method to execute package installation tasks
   - Constructs task parameters from package name, version, ensure, and settings

4. **Package Routes** (`backend/src/routes/packages.ts`) - NEW FILE
   - Created new router for package installation endpoints
   - Implemented `POST /api/nodes/:id/install-package` endpoint
   - Validates request body with Zod schema
   - Handles task not found, node unreachable, and execution errors
   - Stores execution results in database

5. **Server Configuration** (`backend/src/server.ts`)
   - Integrated packages router into Express app
   - Added startup validation to check if configured package installation task is available
   - Logs warning if task is not found

### Frontend Changes

1. **Package Install Interface Component** (`frontend/src/components/PackageInstallInterface.svelte`) - NEW FILE
   - Created collapsible interface for package installation
   - Form fields:
     - Package name (required, validated)
     - Package version (optional)
     - Ensure dropdown (present/absent/latest)
     - Additional settings (JSON format)
   - Form validation for package name format and JSON settings
   - Execution status tracking with polling
   - Results display with CommandOutput component
   - Expert mode support for detailed error output
   - Reset functionality after installation

2. **Node Detail Page** (`frontend/src/pages/NodeDetailPage.svelte`)
   - Imported and integrated PackageInstallInterface component
   - Positioned between Puppet Run section and Command Execution section
   - Connected to execution history refresh callback

### Configuration Files

1. **Root .env.example**
   - Added `PACKAGE_INSTALL_TASK` variable
   - Added `PACKAGE_INSTALL_MODULE` variable
   - Documented default values and purpose

2. **Backend .env.example** (`backend/.env.example`)
   - Added package installation configuration variables

## Features Implemented

### Sub-task 17.1: Package Installation Section

- ✅ Created PackageInstallInterface component
- ✅ Added collapsible section to node detail page
- ✅ Positioned appropriately in layout

### Sub-task 17.2: Configurable Package Installation Task

- ✅ Added configuration variables for task name and module
- ✅ Load configuration from environment variables
- ✅ Validate task availability on startup
- ✅ Log warnings if task is not found

### Sub-task 17.3: Package Installation Form

- ✅ Package name input field (required)
- ✅ Package version input field (optional)
- ✅ Ensure dropdown (present/absent/latest)
- ✅ Settings textarea for additional parameters (JSON format)
- ✅ Validation for package name format (alphanumeric, hyphens, underscores)
- ✅ Validation for JSON settings

### Sub-task 17.4: Package Installation Execution

- ✅ Added `installPackage()` method to BoltService
- ✅ Construct task parameters from form inputs
- ✅ Created POST endpoint `/api/nodes/:id/install-package`
- ✅ Execute configured Bolt task with parameters
- ✅ Handle task not found errors gracefully

### Sub-task 17.5: Display Package Installation Results

- ✅ Parse task output for installation status
- ✅ Show success/failure status with StatusBadge
- ✅ Display task output value
- ✅ Display warnings or errors from package manager
- ✅ Add to execution history

### Sub-task 17.6: Package Installation History

- ✅ Recent package installations appear in execution history
- ✅ Show package name (action), status, and timestamp
- ✅ Link to full execution details via executions page
- ✅ Filter execution history by node ID

### Sub-task 17.7: Expert Mode Support

- ✅ Display full Bolt command in expert mode
- ✅ Show raw task output in expert mode
- ✅ Include task parameters in execution details
- ✅ Send expert mode flag with API requests

## Technical Details

### API Endpoint

**POST** `/api/nodes/:id/install-package`

**Request Body:**

```json
{
  "app": "nginx",
  "ensure": "present",
  "version": "1.18.0",
  "settings": {
    "option1": "value1"
  },
  "expertMode": false
}
```

**Response:**

```json
{
  "executionId": "exec_1234567890_abc123",
  "status": "running"
}
```

### Configuration Variables

- `PACKAGE_INSTALL_TASK`: Name of the Bolt task to use for package installation (default: `tp::install`)
- `PACKAGE_INSTALL_MODULE`: Module that provides the package installation task (default: `example42/tp`)

### Task Parameters

The package installation task is called with the following parameters:

- `app`: Package name (required)
- `ensure`: Installation state - present, absent, or latest (optional, default: present)
- `version`: Package version (optional)
- `settings`: Additional package-specific settings as a hash (optional)

## Testing

- ✅ Backend builds successfully without TypeScript errors
- ✅ Frontend builds successfully without compilation errors
- ✅ No diagnostic errors in any modified files
- ✅ Configuration validation on startup
- ✅ Task availability check on startup

## Usage

1. Navigate to a node detail page
2. Expand the "Install Packages" section
3. Enter package name (e.g., "nginx", "apache", "mysql")
4. Optionally specify version
5. Select ensure mode (present/absent/latest)
6. Optionally add JSON settings for package-specific options
7. Click "Install Package"
8. Monitor execution status and view results
9. Check execution history for installation record

## Notes

- The default package installation task is `tp::install` from the `example42/tp` module
- This can be configured via environment variables to use any Bolt task
- The task must be available in the Bolt project's modules directory
- Package installation history is stored in the executions database
- Expert mode provides detailed Bolt command and raw output for troubleshooting
- Form validation ensures package names are valid and settings are proper JSON

## Files Created

- `frontend/src/components/PackageInstallInterface.svelte`
- `backend/src/routes/packages.ts`

## Files Modified

- `backend/src/config/schema.ts`
- `backend/src/config/ConfigService.ts`
- `backend/src/bolt/BoltService.ts`
- `backend/src/server.ts`
- `frontend/src/pages/NodeDetailPage.svelte`
- `.env.example`
- `backend/.env.example`
