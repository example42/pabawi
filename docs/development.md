# Pabawi development

## Development run for easier debugging

```bash
# Run backend (port 3000)
npm run dev:backend

# Run frontend (port 5173)
npm run dev:frontend
```

Access the web frontend at <http://localhost:5173>.

Backend API endpoint: <http://localhost:3000/api>

## Build

```bash
# Build both frontend and backend
npm run build
```

## Testing

### Unit and Integration Tests

```bash
# Run all unit and integration tests
npm test

# Run backend tests only
npm test --workspace=backend

# Run frontend tests only
npm test --workspace=frontend
```

### End-to-End Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run E2E tests with UI (interactive)
npm run test:e2e:ui

# Run E2E tests in headed mode (visible browser)
npm run test:e2e:headed
```

See [E2E Testing Guide](docs/e2e-testing.md) for detailed information about end-to-end testing.

### Development Pre-commit Hooks

This project uses pre-commit hooks to ensure code quality and security before commits.

```bash
# Install pre-commit (requires Python)
pip install pre-commit

# Or using homebrew on macOS
brew install pre-commit

# Install the git hooks
pre-commit install
pre-commit install --hook-type commit-msg

# Run all hooks on all files
pre-commit run --all-files

# Run specific hook
pre-commit run eslint --all-files

# Update hooks to latest versions
pre-commit autoupdate
```

```bash
# Skip pre-commit hooks (not recommended)
git commit --no-verify -m "message"
```
