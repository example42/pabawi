---
id: 01-docs-rewrite
title: Documentation Rewrite
edition: Pabawi
depends_on: []
source_files:
  - docs/architecture.md
  - docs/configuration.md
  - docs/user-guide.md
  - docs/api.md
  - docs/permissions-rbac.md
  - docs/troubleshooting.md
  - docs/development.md
  - docs/integrations/bolt.md
  - docs/integrations/puppetdb.md
  - docs/integrations/puppetserver.md
  - docs/integrations/hiera.md
  - docs/integrations/ansible.md
  - docs/integrations/ssh.md
  - docs/integrations/proxmox.md
  - docs/integrations/aws.md
  - docs/deployment/docker.md
  - docs/deployment/kubernetes.md
routes: []
models: []
test_files: []
data_flow: greenfield
last_synced: 2026-04-16
status: complete
phase: all
known_issues: []
---

# 01 — Documentation Rewrite

## Purpose

Rewrite all Pabawi documentation from scratch into a coherent, accurate, sharp set of 18 files that reflect the current v1.0.0 codebase. The existing 35-file docs/ directory has version drift (v0.5.0 references throughout), API coverage split across four redundant files, and a user guide that ignores five of eight integrations. The rewrite collapses redundancy, updates all content to match code reality, and applies a direct, concise writing style with no corporate fluff.

## Architecture

The new docs structure is flat where possible and grouped only when integration-specific detail warrants it.

```
docs/
├── architecture.md        ← plugin system, data flows, component diagram
├── configuration.md       ← all env vars, validated against ConfigService/Zod
├── user-guide.md          ← every UI feature across all 8 integrations
├── api.md                 ← single consolidated API reference (replaces 4 files)
├── permissions-rbac.md    ← RBAC model, roles, permissions
├── troubleshooting.md     ← pruned, accurate diagnostics
├── development.md         ← contributor guide (setup, test, lint, architecture)
├── integrations/
│   ├── bolt.md
│   ├── puppetdb.md
│   ├── puppetserver.md
│   ├── hiera.md
│   ├── ansible.md
│   ├── ssh.md
│   ├── proxmox.md
│   └── aws.md
└── deployment/
    ├── docker.md           ← rewrite of docker-deployment.md
    └── kubernetes.md       ← rewrite of kubernetes-deployment.md
```

**Files removed (archived to docs/archive/ or deleted):**

- `description.md` — content merged into architecture.md
- `api-endpoints-reference.md` — merged into api.md
- `integrations-api.md` — merged into api.md
- `puppetdb-api.md` — merged into integrations/puppetdb.md
- `repo_structure_and_config.md` — merged into development.md
- `screenshots.md` — deleted (screenshots directory evaluated separately)
- `manage-tab-guide.md` — merged into user-guide.md
- `provisioning-guide.md` — merged into relevant integration docs
- `proxmox-setup-guide.md` — merged into integrations/proxmox.md
- `e2e-testing.md` — merged into development.md
- `docs/development/` (6 files) — internal; moved to docs/internal/
- `docs/plans/` — archived to docs/internal/
- `security-assessment-*.md` (2 files) — moved to docs/internal/

## Data Model

No database changes. All documentation is static markdown.

## API Endpoints

None. This is a docs-only task.

## Business Rules

### Writing style

- No version headers inside doc body ("Version: 0.5.0" — deleted everywhere)
- Every sentence earns its place. No padding, no "this guide will walk you through"
- Code blocks for all commands, env vars, API examples
- Tables over bullet lists where comparison is the point
- No "Note:" callouts that restate the obvious

### Content accuracy rules

- Every env var listed in configuration.md must exist in `backend/src/config/`
- Every API route in api.md must exist in `backend/src/routes/`
- Every integration described in integrations/*.md must have a corresponding plugin in `backend/src/integrations/`
- Version references: use v1.0.0 throughout, or omit version entirely

### File scope rules

- Each integration gets exactly one file in integrations/
- API reference and integration API content live in api.md only — no duplicates
- Deployment-specific content (Docker volumes, env_file syntax) lives in deployment/ only
- development.md is for contributors only — no end-user content

## Data Flow

Greenfield — this task generates documentation, not code. No data flows to trace.

## Dependencies

None. This is the first MDD doc for this project.

## Known Issues

None at start. The following are pre-existing problems this rewrite resolves:

| Issue | Affected Files |
|---|---|
| Version mismatch (v0.5.0 vs v1.0.0) | user-guide.md, description.md |
| API docs split 4 ways | api.md, api-endpoints-reference.md, integrations-api.md, puppetdb-api.md |
| user-guide.md missing Ansible, SSH, Proxmox, AWS | user-guide.md |
| Internal noise in public docs | docs/development/, docs/plans/, security-assessment-*.md |
| Redundant integration guides | proxmox-setup-guide.md, manage-tab-guide.md, provisioning-guide.md |
