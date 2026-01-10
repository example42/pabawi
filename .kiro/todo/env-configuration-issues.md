# Environment Configuration Issues

## Issue

Several environment variables in `backend/.env` are not properly used or documented.

## Problems Identified

### 1. Incorrect Variable Name

- `STREAMING_BUFFER_SIZE=1024` should be `STREAMING_BUFFER_MS=100`
- The code expects `STREAMING_BUFFER_MS` but `.env` has `STREAMING_BUFFER_SIZE`

### 2. Unused Priority Variables

These variables are defined but not implemented in the codebase:

- `BOLT_PRIORITY=5`
- `PUPPETDB_PRIORITY=10`

### 3. Missing Documentation

The `.env.example` doesn't include some variables that are in the actual `.env` file.

## Recommended Actions

### Fix Variable Name

```bash
# Change this:
STREAMING_BUFFER_SIZE=1024

# To this:
STREAMING_BUFFER_MS=100
```

### Remove or Implement Priority Variables

Either:

1. Remove unused priority variables from `.env`
2. Or implement priority handling in the IntegrationManager

### Update .env.example

Add missing variables to `.env.example` with proper documentation.

## Priority

Medium - These don't break functionality but create confusion and technical debt.

## Files to Update

- `backend/.env` - Fix variable names
- `backend/.env.example` - Add missing variables
- Consider implementing priority system if needed
