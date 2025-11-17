# Docker Improvements TODO

## High Priority

### Generate Package Lock Files

- [ ] Generate `package-lock.json` for frontend

  ```bash
  cd frontend && npm install --package-lock-only
  ```

- [ ] Generate `package-lock.json` for backend

  ```bash
  cd backend && npm install --package-lock-only
  ```

- [ ] Update Dockerfile to use `npm ci` instead of `npm install` for deterministic builds
- [ ] Commit lock files to version control

### Add Image Metadata

- [ ] Add LABEL instructions to Dockerfile with:
  - `org.opencontainers.image.version` - Application version
  - `org.opencontainers.image.title` - "Pabawi"
  - `org.opencontainers.image.description` - Project description
  - `org.opencontainers.image.authors` - Maintainer info
  - `org.opencontainers.image.created` - Build timestamp

## Medium Priority

### Optimize Image Size

- [ ] Install only production dependencies in final stage
  - Create separate production install step with `npm ci --omit=dev`
  - Current image: 440MB (includes dev dependencies)
- [ ] Consider using `node:20-alpine` distroless variant if available
- [ ] Analyze layer sizes with `docker history` and optimize largest layers

### Enhance .dockerignore

- [ ] Review and add patterns for:
  - Editor backup files (`*.bak`, `*~`)
  - OS-specific files (`.DS_Store`, `Thumbs.db`)
  - Any project-specific temporary files
- [ ] Verify all test fixtures and mock data are excluded

## Low Priority

### Build Optimization

- [ ] Add `--frozen-lockfile` equivalent once lock files are in place
- [ ] Consider using BuildKit cache mounts for npm cache:

  ```dockerfile
  RUN --mount=type=cache,target=/root/.npm npm ci
  ```

- [ ] Add multi-platform build support if needed (linux/amd64, linux/arm64)

### Security Enhancements

- [ ] Set up automated vulnerability scanning (Trivy, Snyk, etc.)
- [ ] Pin Ruby gem version for Bolt CLI instead of using latest
- [ ] Consider using specific digest for base image:

  ```dockerfile
  FROM node:20-alpine@sha256:...
  ```

### Documentation

- [ ] Add build instructions to README
- [ ] Document required environment variables
- [ ] Add troubleshooting section for common build issues
- [ ] Document volume mount requirements

## Completed ✓

- [x] Fixed health check endpoint from `/api/config` to `/api/health`
- [x] Added `--no-audit` flag to npm install commands
- [x] Verified Dockerfile builds successfully
- [x] Confirmed .dockerignore is properly configured
- [x] Validated multi-stage build structure
- [x] Confirmed non-root user implementation
- [x] Verified health check configuration
