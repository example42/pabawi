# Add Classification Mode Toggle for Hiera Keys

## Feature Request

Add a toggle in the Hiera tab that allows users to switch between two classification modes:

1. **Found Keys Mode** (current): Keys with resolved values are "used"
2. **Class-Matched Mode** (future): Only keys matching included classes are "used"

## Current Implementation

- Frontend has toggle UI implemented
- Currently both modes show the same results (found keys)
- Info message explains the limitation

## Backend Changes Needed

### 1. Add Classification Mode Parameter

- Modify `GET /api/integrations/hiera/nodes/:nodeId/data` endpoint
- Add query parameter: `?classificationMode=found|classes`
- Default to `found` for backward compatibility

### 2. Update HieraService

- File: `backend/src/integrations/hiera/HieraService.ts`
- Method: `classifyKeyUsage()`
- Add parameter for classification mode
- Implement both classification strategies:

  ```typescript
  if (classificationMode === 'found') {
    // Current logic: found keys are "used"
    for (const [keyName, resolution] of keys) {
      if (resolution.found) {
        usedKeys.add(keyName);
      } else {
        unusedKeys.add(keyName);
      }
    }
  } else if (classificationMode === 'classes') {
    // Future logic: class-matched keys are "used"
    // This requires fixing class detection first
    const includedClasses = await this.getIncludedClasses(nodeId);
    // ... existing class matching logic
  }
  ```

### 3. Update API Route

- File: `backend/src/routes/hiera.ts`
- Parse `classificationMode` query parameter
- Pass to `HieraService.getNodeHieraData()`

### 4. Update Types

- File: `backend/src/integrations/hiera/types.ts`
- Add `ClassificationMode` type: `'found' | 'classes'`
- Update relevant interfaces

## Frontend Implementation

- ✅ Toggle UI added
- ✅ State management implemented
- ✅ Info message for class-matched mode
- ⏳ API call needs to include classification mode parameter

## Dependencies

- **Prerequisite**: Fix class detection (see `hiera-class-detection-fix.md`)
- Class-matched mode will only work properly after class detection is fixed

## Success Criteria

- [ ] Toggle switches between two distinct classification modes
- [ ] Found Keys mode: shows all keys with resolved values as "used"
- [ ] Class-Matched mode: shows only keys matching catalog classes as "used"
- [ ] API parameter controls backend classification logic
- [ ] Backward compatibility maintained (default to "found" mode)

## Priority

Low - Enhancement feature, current functionality works well

## UI Mockup

```
Classification: [Found Keys] [Class-Matched]
```

Where:

- **Found Keys**: Current behavior (39 used, 1941 unused)
- **Class-Matched**: Future behavior (depends on actual class matching)
