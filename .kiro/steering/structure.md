---
title: Project Structure
inclusion: always
---

## Top-Level Layout

```
pabawi/
├── frontend/              # Svelte 5 SPA
├── backend/               # Express API server
├── e2e/                   # Playwright E2E tests
├── docs/                  # User-facing documentation
├── scripts/               # Setup, build, and deployment scripts
├── samples/               # Sample configs and stress tests
├── .kiro/                 # AI-generated docs, specs, steering, hooks
├── package.json           # Root workspace config
├── docker-compose.yml     # Container orchestration
├── eslint.config.js       # Shared ESLint config
└── playwright.config.ts   # E2E test config
```

## Backend (`backend/src/`)

```
src/
├── server.ts              # Express app entry point
├── container/             # DI container (ServiceRegistry, DIContainer class)
├── plugins/               # Declarative plugin registry (replaces inline init blocks)
├── config/                # ConfigService + Zod schema for env validation
├── database/              # DB adapters (SQLite/Postgres), migrations, repositories
├── errors/                # Centralized error handling service
├── integrations/          # Plugin architecture for external tools
│   ├── BasePlugin.ts      # Abstract plugin base class
│   ├── IntegrationManager.ts  # Plugin lifecycle and health checks
│   ├── NodeLinkingService.ts  # Cross-integration node identity linking
│   ├── bolt/              # Puppet Bolt integration
│   ├── puppetdb/          # PuppetDB queries (with circuit breaker + retry)
│   ├── puppetserver/      # Puppetserver API integration
│   ├── hiera/             # Hiera data parsing and resolution
│   ├── ansible/           # Ansible inventory and playbook execution
│   ├── ssh/               # Direct SSH execution (connection pool)
│   ├── aws/               # AWS EC2 provisioning
│   ├── azure/             # Azure VM provisioning
│   └── proxmox/           # Proxmox VM/LXC provisioning
├── middleware/             # Auth, RBAC, security, error handler, expert mode
├── routes/                # Express route factories (one file per domain)
│   └── integrations/      # Integration-specific route handlers
├── services/              # Business logic (auth, groups, roles, execution, etc.)
│   └── journal/           # Node journal/notes service
├── types/                 # Shared type declarations (express.d.ts, mcp-sdk.d.ts)
├── utils/                 # Shared helpers (API responses, caching, passwords)
└── validation/            # Zod schemas and command whitelist validation
```

## Frontend (`frontend/src/`)

```
src/
├── main.ts                # App entry point
├── App.svelte             # Root component
├── app.css                # Global styles (Tailwind)
├── components/            # UI components (flat, one file per component)
├── pages/                 # Page-level components (route targets)
├── lib/                   # Shared utilities, stores, and types
│   ├── api.ts             # HTTP infrastructure (get, post, put, del, error handling)
│   ├── proxmoxApi.ts      # Proxmox provisioning API functions
│   ├── awsApi.ts          # AWS EC2 API functions
│   ├── azureApi.ts        # Azure VM API functions
│   ├── auth.svelte.ts     # Auth state (Svelte runes)
│   ├── router.svelte.ts   # Client-side routing
│   ├── validation.ts      # Input validation
│   ├── types/             # TypeScript type definitions
│   └── *.svelte.ts        # Reactive stores (expert mode, theme, toast, etc.)
└── __tests__/             # Shared test utilities and generators
```

## Key Patterns

- DI container (`container/DIContainer.ts`) provides `LoggerService`, `ExpertModeService`, `ConfigService` to route factories
- Plugin registry (`plugins/registry.ts`) declares all integrations; `server.ts` iterates it in a single loop
- Route files export factory functions (`createXxxRouter(container)`) — no module-level service instantiation
- Integration plugins extend `BasePlugin` and register with `IntegrationManager`
- Each integration has its own directory with Plugin, Service, and types files
- Routes delegate to services; services use integrations or repositories
- Frontend `api.ts` contains only HTTP infrastructure; domain-specific API functions live in `proxmoxApi.ts`, `awsApi.ts`, `azureApi.ts`
- Frontend components are flat in `components/` (no nested folders)
- Svelte runes files use `.svelte.ts` extension for reactive state
- Tests are co-located with source (`*.test.ts`) or in `__tests__/` directories
- Database migrations are sequential SQL files (`000_`, `001_`, etc.)
- Configuration flows through `ConfigService` backed by `backend/.env`
- Secrets (`JWT_SECRET` required, `PABAWI_LIFECYCLE_TOKEN` optional) accessed only via `ConfigService` accessors
