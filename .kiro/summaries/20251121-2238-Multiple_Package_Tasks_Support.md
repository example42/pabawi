# Multiple Package Tasks Support Implementation

**Date:** November 21, 2025, 22:38  
**Update:** Changed default configuration to use tp::install only

## Summary

Updated the package installation feature to support multiple package installation tasks with different parameter
mappings. By default, only `tp::install` (Tiny Puppet) is configured, with the ability to add alternative tasks like
the built-in `package` task or other custom modules.

## Key Changes

### Backend Changes

1. **Configuration Schema** (`backend/src/config/schema.ts`)
   - Changed from single task configuration to array of tasks
   - Added `PackageTaskConfig` type with parameter mapping
   - Default configuration now includes only `tp::install`
   - Each task has: name, label, and parameterMapping object

2. **Configuration Service** (`backend/src/config/ConfigService.ts`)
   - Loads package tasks from `BOLT_PACKAGE_TASKS` environment variable (JSON array)
   - Falls back to default configuration if not provided
   - Removed old `packageInstallTask` and `packageInstallModule` methods
   - Added `getPackageTasks()` method

3. **Bolt Service** (`backend/src/bolt/BoltService.ts`)
   - Updated `installPackage()` to accept parameter mapping configuration
   - Automatically maps generic parameters to task-specific ones
   - Converts ensure values for built-in package task:
     - `present` → `install`
     - `absent` → `uninstall`
     - `latest` → `upgrade`

4. **Package Routes** (`backend/src/routes/packages.ts`)
   - Added `GET /api/package-tasks` endpoint to fetch available tasks
   - Updated `POST /api/nodes/:id/install-package` to accept `taskName` parameter
   - Validates selected task against configured tasks
   - Uses task-specific parameter mapping for execution

5. **Server Configuration** (`backend/src/server.ts`)
   - Validates all configured package tasks on startup
   - Shows checkmark (✓) for available tasks
   - Shows warning (✗) for missing tasks
   - Passes package tasks array to router

### Frontend Changes

1. **Package Install Interface** (`frontend/src/components/PackageInstallInterface.svelte`)
   - Added task selector dropdown
   - Fetches available tasks from `/api/package-tasks` endpoint
   - Auto-selects first task when loaded
   - Conditionally shows settings field based on task support
   - Validates task selection before submission
   - Sends `taskName` with installation request

### Configuration Files

Updated all `.env` files to document the new configuration format:

- Default: `tp::install` only
- Shows how to add additional tasks via `BOLT_PACKAGE_TASKS` JSON array
- Includes example for adding built-in `package` task

## Default Configuration

**Single Task (Default):**

```json
[
  {
    "name": "tp::install",
    "label": "Tiny Puppet",
    "parameterMapping": {
      "packageName": "app",
      "ensure": "ensure",
      "version": "version",
      "settings": "settings"
    }
  }
]
```

**Multiple Tasks (Optional):**

```json
[
  {
    "name": "tp::install",
    "label": "Tiny Puppet",
    "parameterMapping": {
      "packageName": "app",
      "ensure": "ensure",
      "version": "version",
      "settings": "settings"
    }
  },
  {
    "name": "package",
    "label": "Package (built-in)",
    "parameterMapping": {
      "packageName": "name",
      "ensure": "action",
      "version": "version"
    }
  }
]
```

## Parameter Mapping

The system maps generic form parameters to task-specific parameters:

### tp::install (Tiny Puppet)

- `packageName` → `app`
- `ensure` → `ensure` (present/absent/latest)
- `version` → `version`
- `settings` → `settings` (JSON object)

### package (built-in)

- `packageName` → `name`
- `ensure` → `action` (install/uninstall/upgrade)
- `version` → `version`
- No settings support

## API Endpoints

### GET /api/package-tasks

Returns list of available package installation tasks.

**Response:**

```json
{
  "tasks": [
    {
      "name": "tp::install",
      "label": "Tiny Puppet",
      "parameterMapping": {
        "packageName": "app",
        "ensure": "ensure",
        "version": "version",
        "settings": "settings"
      }
    }
  ]
}
```

### POST /api/nodes/:id/install-package

Install a package using the selected task.

**Request:**

```json
{
  "taskName": "tp::install",
  "packageName": "nginx",
  "ensure": "present",
  "version": "1.18.0",
  "settings": {
    "option1": "value1"
  },
  "expertMode": false
}
```

## Adding Custom Tasks

To add a custom package installation task:

1. Set the `BOLT_PACKAGE_TASKS` environment variable with a JSON array
2. Include your custom task configuration with:
   - `name`: The Bolt task name (e.g., `mymodule::install`)
   - `label`: Display name for the UI
   - `parameterMapping`: Map generic parameters to task-specific ones

**Example:**

```bash
BOLT_PACKAGE_TASKS='[{"name":"tp::install","label":"Tiny Puppet","parameterMapping":{"packageName":"app","ensure":"ensure","version":"version","settings":"settings"}},{"name":"mymodule::install","label":"My Custom Installer","parameterMapping":{"packageName":"package","ensure":"state","version":"ver"}}]'
```

## Benefits

1. **Flexibility**: Support for multiple package management systems
2. **Extensibility**: Easy to add new package installation tasks
3. **Compatibility**: Handles different parameter naming conventions
4. **User-Friendly**: Clear task selection in UI
5. **Validation**: Server validates task availability on startup
6. **Default Simplicity**: Single task by default, add more as needed

## Testing

- ✅ Backend builds successfully
- ✅ Frontend builds successfully
- ✅ Server validates tasks on startup
- ✅ Task selector loads available tasks
- ✅ Parameter mapping works correctly
- ✅ Settings field shows/hides based on task support

## Usage

1. Navigate to node detail page
2. Expand "Install Packages" section
3. Select package task (if multiple available)
4. Enter package name
5. Configure ensure, version, and settings as needed
6. Click "Install Package"
7. Monitor execution and view results

## Notes

- Default configuration uses only `tp::install` from example42/tp module
- Built-in `package` task can be added via environment variable
- Custom tasks can be added by following the parameter mapping pattern
- Server logs show which tasks are available vs. missing
- Settings field only appears for tasks that support it (e.g., tp::install)
- Ensure values are automatically converted for built-in package task

## Files Modified

- `backend/src/config/schema.ts`
- `backend/src/config/ConfigService.ts`
- `backend/src/bolt/BoltService.ts`
- `backend/src/routes/packages.ts`
- `backend/src/server.ts`
- `frontend/src/components/PackageInstallInterface.svelte`
- `.env`
- `.env.example`
- `backend/.env.example`
