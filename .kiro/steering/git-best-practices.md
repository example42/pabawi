---
title: Git Best Practices
inclusion: always
---

## Commit Messages

- Use conventional commit format: `type(scope): description`
- Types: feat, fix, docs, style, refactor, test, chore
- Keep first line under 50 characters
- Use imperative mood ("Add feature" not "Added feature")
- Include body for complex changes

## Branching

- Use feature branches for new development
- Keep main/master branch stable and deployable
- Use descriptive branch names (feature/user-auth, fix/login-bug)
- Delete merged branches to keep repository clean

## Workflow

- Pull latest changes before starting work
- Commit frequently with logical chunks
- Use interactive rebase to clean up history before merging
- Review code before merging (pull requests)

## Repository Management

- Use .gitignore to exclude build artifacts and secrets
- Keep repository size manageable (use Git LFS for large files)
- Tag releases with semantic versioning
- Document branching strategy in README

## Security

- Never commit secrets, API keys, or passwords
- Use environment variables for configuration
- Review commits for sensitive information
- Use signed commits when possible

## Pre-Commit Hooks

This project uses [pre-commit](https://pre-commit.com) with the following hooks that must pass before every commit:

### File Quality

- `trailing-whitespace` — strips trailing whitespace (excludes `.md`)
- `end-of-file-fixer` — ensures files end with a newline (excludes `.svg`)
- `mixed-line-ending` — enforces LF line endings
- `check-added-large-files` — blocks files over 1000KB
- `check-merge-conflict` — prevents committing merge conflict markers
- `check-case-conflict` — catches filename case collisions
- `check-yaml` / `check-json` — validates YAML and JSON syntax
- `no-commit-to-branch` — blocks direct commits to `main` / `master`

### Security

- `detect-private-key` — prevents committing private keys
- `detect-secrets` (Yelp) — scans for hardcoded secrets using a baseline file (`.secrets.baseline`)
  - For false positives (e.g. variable names containing "password", "secret", "token"), add an inline `// pragma: allowlist secret` comment on the flagged line
  - Excludes: `package-lock.json`, `.env.example`, `docs/`, test files, `e2e/`

### Linting and Type Checking

- `eslint` — runs `npm run lint` on JS/TS files
- `tsc-backend` — runs `tsc --noEmit` in `backend/` for TypeScript type checking
- `tsc-frontend` — runs `tsc --noEmit` in `frontend/` for TypeScript type checking
- `hadolint` — lints Dockerfiles (ignores DL3008, DL3009)
- `markdownlint` — lints and auto-fixes Markdown files
- `shellcheck` — checks shell scripts (severity: warning+)

### Code Hygiene

- `no-duplicate-files` — blocks files with suffixes like `_fixed`, `_clean`, `_backup`, `_old`, `_new`, `_copy`, `.bak`

### Commit Messages

- `conventional-pre-commit` — enforces [Conventional Commits](https://www.conventionalcommits.org/) format on commit messages

### When Writing Code

- Always ensure new code passes all pre-commit hooks before committing
- When `detect-secrets` flags a false positive, add `// pragma: allowlist secret` (or `# pragma: allowlist secret` for Python/YAML) as an inline comment on the flagged line
- Never disable or skip pre-commit hooks — fix the underlying issue instead
- Run `pre-commit run --all-files` to validate the entire codebase when in doubt
