# Pabawi Workspace Analysis

**Date**: 2025-02-27  
**Version**: 0.10.0  
**Purpose**: Comprehensive overview of Pabawi application structure, technology stack, and infrastructure setup for Azure integration planning

## Executive Summary

Pabawi is a **unified web interface for infrastructure management and remote execution** that aggregates multiple automation tools (Puppet, Bolt, Ansible, PuppetDB, Puppetserver, Hiera) through a plugin-based architecture. It's a **full-stack Node.js application** with a Svelte 5 frontend and Express backend, currently deployed via Docker with **no existing cloud provider integration** (AWS, Azure, GCP).

---

## 1. Application Type & Purpose

### What is Pabawi?

**Type**: Web application (SPA + REST API backend)

**Core Function**:

- Unified command & control interface for infrastructure automation
- Multi-source inventory aggregation (Bolt, PuppetDB, Ansible, SSH)
- Remote command/task execution with real-time streaming
- Node facts, Puppet reports, catalog inspection, Hiera data browsing
- Execution history tracking and re-execution capability

**Key Features**:

- Multi-source inventory from Bolt, PuppetDB, Ansible, SSH
- Ad-hoc command execution with whitelist security
- Bolt task execution with parameter discovery
- Package management across infrastructure
- Real-time streaming output
- Expert mode with full command lines and debug output
- Graceful degradation when integrations unavailable

---

## 2. Technology Stack

### Frontend

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Svelte | 5.0.0 |
| Build Tool | Vite | 7.2.2 |
| Styling | Tailwind CSS | 3.4.3 |
| Testing | Vitest | 4.0.8 |
| Testing Library | @testing-library/svelte | 5.0.0 |
| Language | TypeScript | 5.4.5 |
| Linting | ESLint | 9.39.1 |

**Frontend Structure**:

```
frontend/
├── src/
│   ├── components/    # UI components
│   ├── pages/         # Page components
│   └── lib/           # Utilities and stores
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

### Backend

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 20.x |
| Framework | Express | 4.19.2 |
| Language | TypeScript | 5.4.5 |
| Database | SQLite3 | 5.1.7 |
| Database (Alt) | PostgreSQL | 8.13.0 |
| Authentication | JWT | 9.0.2 |
| Password Hashing | bcrypt | 5.1.1 |
| Security | Helmet | 8.1.0 |
| Rate Limiting | express-rate-limit | 8.2.1 |
| CORS | cors | 2.8.5 |
| SSH | ssh2 | 1.17.0 |
| AWS SDK | @aws-sdk/client-ec2, @aws-sdk/client-sts | 3.700.0 |
| Config | dotenv | 16.4.5 |
| Validation | zod | 3.23.8 |
| YAML | yaml | 2.8.2 |
| Testing | Vitest | 4.0.9 |
| Testing | supertest | 7.0.0 |
| Dev Runtime | tsx | 4.7.2 |

**Backend Structure**:

```
backend/
├── src/
│   ├── config/           # Configuration service
│   ├── database/         # SQLite/PostgreSQL adapters
│   ├── integrations/     # Plugin architecture
│   │   ├── bolt/         # Bolt plugin
│   │   ├── puppetdb/     # PuppetDB integration
│   │   ├── puppetserver/ # Puppetserver integration
│   │   ├── hiera/        # Hiera integration
│   │   ├── ansible/      # Ansible plugin
│   │   ├── ssh/          # SSH plugin
│   │   ├── proxmox/      # Proxmox integration
│   │   └── types.ts      # Plugin interfaces
│   ├── routes/           # API endpoints
│   ├── services/         # Business logic
│   └── server.ts         # Express app entry
├── test/                 # Unit/integration tests
├── package.json
└── tsconfig.json
```

### Key Dependencies

**AWS Integration** (Already Present):

- `@aws-sdk/client-ec2` - EC2 operations
- `@aws-sdk/client-sts` - STS operations
- Indicates some AWS support already exists

**Database Support**:

- SQLite3 (default, file-based)
- PostgreSQL (alternative, for production)
- Adapter pattern allows easy addition of other databases

---

## 3. Deployment & Infrastructure

### Docker Configuration

**Dockerfile Strategy**:

- Multi-stage build (frontend builder → backend builder → production image)
- Base image: Ubuntu 24.04 (production)
- Includes: Node.js 20, Puppet/OpenVox, Bolt, Ansible, Ruby
- Non-root user: UID 1001 (pabawi)
- Health check: HTTP GET to `/api/health`
- Exposed port: 3000

**Docker Compose**:

- Single service deployment
- Volume mounts for:
  - Bolt project (read-only)
  - SQLite database persistence
  - SSL certificates (optional)
  - Hiera control repository (optional)
- Network: pabawi-network (bridge)
- Restart policy: unless-stopped
- Health checks enabled

**Alternative Dockerfiles**:

- `Dockerfile.alpine` - Alpine Linux base (smaller)
- `Dockerfile.ubuntu` - Explicit Ubuntu base

**Multi-Architecture Support**:

- Builds for linux/amd64 and linux/arm64
- Uses docker buildx for cross-platform builds

### Kubernetes Deployment

**Kubernetes Support** (Documented):

- Deployment manifest with 1 replica (SQLite limitation)
- ConfigMap for environment variables
- PersistentVolumeClaim for database storage
- Service for exposure
- Secrets for SSH keys and SSL certificates
- Liveness and readiness probes

**Limitation**: Single replica due to SQLite database (not shared)

### CI/CD Pipeline

**GitHub Actions Workflows**:

1. **CI Workflow** (`.github/workflows/ci.yml`):
   - Triggers: PR to main/develop, push to main/develop
   - Node 20.x matrix
   - Steps:
     - ESLint linting
     - TypeScript type checking (backend & frontend)
     - Unit tests (vitest)
     - Backend build
     - Frontend build
     - Docker image build test (no push)

2. **Publish Workflow** (`.github/workflows/publish.yml`):
   - Triggers: Git tags matching `v*.*.*`
   - Builds and pushes to GitHub Container Registry (ghcr.io)
   - Multi-architecture builds (amd64, arm64)
   - Semantic versioning tags
   - Artifact attestation
   - Automatic GitHub Release creation from CHANGELOG.md

**Registry**: GitHub Container Registry (ghcr.io)  
**Image Name**: `ghcr.io/example42/pabawi`

---

## 4. Current Cloud/Infrastructure Integration

### Existing Cloud Support

**AWS Integration** (Partial):

- AWS SDK dependencies present (`@aws-sdk/client-ec2`, `@aws-sdk/client-sts`)
- Indicates some AWS EC2/STS functionality exists
- **No dedicated AWS plugin found** in integrations directory
- Likely used for specific features, not as primary integration

**No Other Cloud Providers**:

- No Azure SDK dependencies
- No GCP SDK dependencies
- No Terraform/CloudFormation/Bicep files
- No infrastructure-as-code configuration

### Current Integrations (Non-Cloud)

**Execution Tools**:

1. **Bolt** - Puppet's execution tool (primary)
2. **Ansible** - Configuration management
3. **SSH** - Direct SSH connections

**Information Sources**:

1. **PuppetDB** - Puppet infrastructure data
2. **Puppetserver** - Puppet node management
3. **Hiera** - Hierarchical configuration data
4. **Proxmox** - Virtualization platform (partial)

**Plugin Architecture**:

- Base interface: `IntegrationPlugin`
- Types: ExecutionToolPlugin, InformationSourcePlugin
- All plugins extend `BasePlugin`
- Plugin registration via `IntegrationManager`
- Health check system with caching
- Node linking service for multi-source aggregation

---

## 5. Configuration & Environment

### Configuration Management

**ConfigService** (`backend/src/config/ConfigService.ts`):

- Loads from environment variables
- Parses integration-specific configs
- Validates configuration on startup
- Supports multiple integrations simultaneously

**Environment Variables** (from `.env.docker`):

**Core Settings**:

```
PORT=3000
HOST=localhost
LOG_LEVEL=info
DATABASE_PATH=/pabawi/data/pabawi.db
```

**Bolt Integration**:

```
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST=["ls","pwd","whoami","uptime"]
BOLT_EXECUTION_TIMEOUT=300000
BOLT_PROJECT_PATH=/pabawi/control-repo
```

**PuppetDB Integration**:

```
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppet.example.com
PUPPETDB_PORT=8081
PUPPETDB_TOKEN=
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/pabawi/certs/ca.pem
PUPPETDB_SSL_CERT=/pabawi/certs/pabawi.pem
PUPPETDB_SSL_KEY=/pabawi/certs/pabawi-key.pem
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true
```

**Puppetserver Integration**:

```
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_TOKEN=
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/pabawi/certs/ca.pem
PUPPETSERVER_SSL_CERT=/pabawi/certs/pabawi.pem
PUPPETSERVER_SSL_KEY=/pabawi/certs/pabawi-key.pem
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=true
```

**Hiera Integration**:

```
HIERA_ENABLED=true
HIERA_CONTROL_REPO_PATH=/pabawi/control-repo
HIERA_CONFIG_PATH=hiera.yaml
```

**Ansible Integration**:

```
ANSIBLE_ENABLED=true
ANSIBLE_PROJECT_PATH=/pabawi/ansible
ANSIBLE_INVENTORY_PATH=inventory/hosts
```

**SSH Integration**:

```
SSH_ENABLED=true
SSH_CONFIG_PATH=/pabawi/ssh/config
```

### Database Configuration

**SQLite** (Default):

- File-based database
- Path: `DATABASE_PATH` environment variable
- Single-file storage
- Limitation: Not suitable for multi-replica deployments

**PostgreSQL** (Alternative):

- Connection string via environment variable
- Adapter pattern in `backend/src/database/`
- Supports production deployments with multiple replicas

---

## 6. Project Structure & Key Files

### Root Level

```
pabawi/
├── frontend/              # Svelte 5 frontend
├── backend/               # Node.js/Express backend
├── docs/                  # User-facing documentation
├── e2e/                   # Playwright end-to-end tests
├── scripts/               # Setup and utility scripts
├── .github/workflows/     # CI/CD pipelines
├── .devcontainer/         # Dev container config
├── Dockerfile             # Production Docker image
├── Dockerfile.alpine      # Alpine variant
├── Dockerfile.ubuntu      # Ubuntu variant
├── docker-compose.yml     # Docker Compose config
├── package.json           # Root workspace config
├── .env.docker            # Docker environment template
├── .env.example           # Environment template
├── .pre-commit-config.yaml # Pre-commit hooks
└── README.md              # Main documentation
```

### Documentation Files (Relevant for Azure)

- `docs/docker-deployment.md` - Docker deployment guide
- `docs/kubernetes-deployment.md` - Kubernetes deployment guide
- `docs/configuration.md` - Configuration reference
- `docs/architecture.md` - System architecture
- `docs/integrations-api.md` - Integration plugin API

### Scripts

- `scripts/setup.sh` - Interactive setup script
- `scripts/docker-build-multiarch.sh` - Multi-arch Docker build
- `scripts/docker-run.sh` - Docker run helper
- `scripts/docker-run.ps1` - PowerShell Docker run helper
- `scripts/generate-pabawi-cert.sh` - SSL certificate generation

---

## 7. Database Architecture

### Current Database Support

**SQLite3** (Default):

- File-based, single-file database
- Located at `DATABASE_PATH` (default: `/data/pabawi.db`)
- Suitable for single-instance deployments
- Limitation: Database locking with multiple replicas

**PostgreSQL** (Alternative):

- Connection string: `DATABASE_URL` environment variable
- Suitable for production multi-replica deployments
- Adapter pattern allows easy switching

### Database Adapter Pattern

**Files**:

- `backend/src/database/DatabaseAdapter.ts` - Interface
- `backend/src/database/SQLiteAdapter.ts` - SQLite implementation
- `backend/src/database/PostgresAdapter.ts` - PostgreSQL implementation
- `backend/src/database/AdapterFactory.ts` - Factory for creating adapters

**Migrations**:

- `backend/src/database/MigrationRunner.ts` - Migration system
- Migrations stored in `backend/src/database/migrations/`
- Automatic migration on startup

---

## 8. Security Features

### Authentication & Authorization

- JWT-based authentication
- bcrypt password hashing
- Role-based access control (RBAC) framework
- Token-based API authentication

### Network Security

- Helmet.js for HTTP headers
- CORS configuration
- Rate limiting via express-rate-limit
- SSL/TLS support for integrations
- Certificate validation options

### Secrets Management

- Environment variables for sensitive data
- SSL certificates stored on filesystem
- SSH keys managed via SSH config
- No hardcoded secrets in code

### Pre-Commit Hooks

- detect-secrets scanning
- Private key detection
- Conventional commit enforcement
- ESLint and TypeScript type checking

---

## 9. Testing & Quality Assurance

### Testing Framework

- **Unit Tests**: Vitest
- **Integration Tests**: Vitest + supertest
- **E2E Tests**: Playwright
- **Test Coverage**: Property-based testing with fast-check

### Linting & Type Checking

- ESLint for code quality
- TypeScript strict mode
- Separate type checking for backend and frontend
- Pre-commit hooks enforce standards

### CI/CD Quality Gates

- All tests must pass
- ESLint must pass with zero warnings
- TypeScript type checking must pass
- Docker image must build successfully

---

## 10. Deployment Patterns

### Local Development

```bash
npm run dev:backend    # Port 3000
npm run dev:frontend   # Port 5173
npm run dev:fullstack  # Port 3000 (full-stack)
```

### Docker Deployment

```bash
docker run -d \
  --name pabawi \
  -p 127.0.0.1:3000:3000 \
  -v $(pwd)/bolt-project:/bolt-project:ro \
  -v $(pwd)/data:/data \
  --env-file .env \
  example42/pabawi:latest
```

### Docker Compose

```bash
docker-compose up -d
```

### Kubernetes

- Single replica deployment (SQLite limitation)
- ConfigMap for configuration
- PersistentVolumeClaim for data
- Service for exposure
- Liveness/readiness probes

---

## 11. Key Observations for Azure Integration

### Strengths

1. **Plugin Architecture**: Easy to add new integrations (including Azure)
2. **Database Abstraction**: Adapter pattern allows Azure SQL/Cosmos DB support
3. **Environment-Based Config**: No code changes needed for cloud configuration
4. **Docker-Ready**: Already containerized for cloud deployment
5. **Kubernetes Support**: Can run on AKS
6. **Multi-Architecture**: Supports both amd64 and arm64

### Considerations for Azure

1. **Database**: Currently SQLite (single-instance). PostgreSQL or Azure SQL recommended for production
2. **Storage**: Volume mounts for data. Azure Storage or managed disks needed for cloud
3. **Secrets**: Environment variables. Azure Key Vault integration recommended
4. **Authentication**: JWT-based. Azure AD/Entra ID integration possible
5. **Monitoring**: No built-in cloud monitoring. Application Insights integration needed
6. **Networking**: Currently localhost-only. Azure networking/security groups needed
7. **CI/CD**: GitHub Actions to Azure DevOps or GitHub Actions with Azure deployment

### Existing AWS SDK

- AWS SDK already present (`@aws-sdk/client-ec2`, `@aws-sdk/client-sts`)
- Suggests pattern for adding Azure SDK
- Could indicate existing AWS integration to reference

---

## 12. Roadmap & Future Considerations

### Planned Features

- Tiny Puppet integration
- Scheduled executions
- Custom dashboards
- Audit logging
- CLI tool

### Under Evaluation

- Terraform integration
- AWS/Azure CLI integration
- Kubernetes integration
- Choria integration
- Icinga integration

### Potential Azure Integrations

- Azure VMs (similar to AWS EC2)
- Azure Automation
- Azure DevOps
- Azure Key Vault (secrets)
- Application Insights (monitoring)
- Azure SQL Database
- Azure Container Registry
- Azure Kubernetes Service (AKS)

---

## 13. Files Relevant for Azure Integration

### Configuration

- `backend/src/config/ConfigService.ts` - Add Azure config parsing
- `.env.example` - Add Azure environment variables
- `docs/configuration.md` - Document Azure settings

### Database

- `backend/src/database/AdapterFactory.ts` - Add Azure SQL adapter
- `backend/src/database/` - Create AzureSqlAdapter.ts

### Integrations

- `backend/src/integrations/types.ts` - Plugin interfaces
- `backend/src/integrations/` - Create azure/ subdirectory for Azure plugin

### Deployment

- `Dockerfile` - May need Azure-specific dependencies
- `docker-compose.yml` - Azure deployment variant
- `docs/kubernetes-deployment.md` - AKS deployment guide
- `.github/workflows/` - Azure deployment workflow

### Documentation

- `docs/` - Create azure-deployment.md
- `docs/integrations/` - Create azure.md for Azure integration setup

---

## 14. Summary Table

| Aspect | Current State | Notes |
|--------|---------------|-------|
| **Application Type** | Full-stack web app | Svelte frontend + Express backend |
| **Frontend Framework** | Svelte 5 | Modern, reactive framework |
| **Backend Runtime** | Node.js 20 | TypeScript, Express |
| **Database** | SQLite (default) | PostgreSQL alternative available |
| **Deployment** | Docker + Kubernetes | Multi-architecture support |
| **CI/CD** | GitHub Actions | Publishes to ghcr.io |
| **Cloud Providers** | None (AWS SDK present) | No Azure, GCP, or Terraform |
| **Plugin Architecture** | Yes | Extensible integration system |
| **Authentication** | JWT + bcrypt | RBAC framework exists |
| **Testing** | Vitest + Playwright | Unit, integration, E2E |
| **Security** | Helmet, rate limiting, SSL | Pre-commit hooks with secret detection |
| **Documentation** | Comprehensive | Docker, Kubernetes, integrations |
| **Monitoring** | Health checks only | No cloud monitoring integration |

---

## Recommendations for Azure Integration

1. **Start with Azure VM Integration**: Similar to existing AWS EC2 support
2. **Add Azure SQL Database Adapter**: For production deployments
3. **Implement Azure Key Vault**: For secrets management
4. **Create AKS Deployment Guide**: For Kubernetes deployments
5. **Add Azure DevOps CI/CD**: Alternative to GitHub Actions
6. **Integrate Application Insights**: For monitoring and logging
7. **Support Azure AD/Entra ID**: For authentication
8. **Create Azure Storage Integration**: For persistent volumes
