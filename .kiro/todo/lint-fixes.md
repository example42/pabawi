# Lint Fixes Required

## Summary

32 lint errors remaining. Progress: 73 → 32 errors fixed.

## Remaining Issues by Category

### Template Literal Expressions (11 errors)

Files need number values wrapped in String() or converted to string:

- hiera.ts: lines 823, 1208, 1546, 1830 (3 instances)
- puppetdb.ts: lines 1437, 1748
- inventory.ts: lines 318, 669
- streaming.ts: line 247
- tasks.ts: line 341
- PuppetRunHistoryService.ts: lines 58, 102

### Type Safety Issues (5 errors)

- executions.ts:766 - Unsafe argument type `any`
- executions.ts:828 - Unnecessary conditional/optional chain (2 errors)
- puppet.ts:125 - Unsafe assignment of `any`
- utils.ts:181 - Redundant type constituents

### Object Stringification (6 errors)

- ExpertModeService.ts:489, 491 - join() and value stringification
- ExpertModeService.ts:500, 501 (3 instances) - Prefer nullish coalescing

### Other (3 errors)

- PuppetRunHistoryService.ts:158 - Forbidden non-null assertion
- apiResponse.ts:44, 82, 221 - Unnecessary type parameters (3 instances)

## Next Steps

Most errors are straightforward template literal fixes. The type safety issues may require more careful refactoring.
