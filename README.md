# Pabawi

<table>
<tr>
<td width="150">
  <img src="frontend/favicon/web-app-manifest-512x512.png" alt="Pabawi Logo" width="128" height="128">
</td>
<td>
  <h3>Classic Infrastructures Command & Control Awesomeness</h3>
  <p>Pabawi is a web frontend for infrastructure management, inventory and remote execution. It currently provides integrations with Puppet, Bolt, Ansible, PuppetDB, Hiera and SSH. It supports both Puppet Enterprise and Open Source Puppet / OpenVox. It provides a unified web interface for managing infrastructure, executing commands, viewing system information, and tracking operations across your entire environment.</p>
</td>
</tr>
</table>

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Screenshots](#screenshots)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Manual Setup](#manual-setup)
  - [Using Docker Image](#using-docker-image)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development and Contributing](#development-and-contributing)
- [Roadmap](#roadmap)
- [License](#license)
- [Support](#support)
- [Acknowledgments](#acknowledgments)

## Features

- **Multi-Source Inventory**: Nodes from Bolt, PuppetDB, Ansible, SSH
- **Command Execution**: Ad-hoc commands on remote nodes with whitelist security
- **Task Execution**: Bolt tasks with automatic parameter discovery
- **Package Management**: Install and manage packages across infrastructure
- **Execution History**: Track operations with re-execution capability
- **Node Facts**: System information from Puppet agents
- **Puppet Reports**: Run reports with metrics and resource changes
- **Catalog Inspection**: Compiled catalogs, resource relationships, cross-environment diff
- **Event Tracking**: Resource changes and failures over time
- **Hiera Data Browser**: Hierarchical configuration data and key usage analysis
- **Real-time Streaming**: Live output for command and task execution
- **Expert Mode**: Full command lines and debug output
- **Graceful Degradation**: Continues operating when individual integrations are unavailable

## Project Structure

```text
pabawi/
├── frontend/          # Svelte 5 + Vite frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Page components
│   │   └── lib/           # Utilities and stores
│   ├── package.json
│   └── vite.config.ts
├── backend/           # Node.js + TypeScript API server
│   ├── src/
│   │   ├── bolt/          # Bolt integration (temp)
│   │   ├── integrations/  # Plugin architecture
│   │   │   ├── bolt/      # Bolt plugin
│   │   │   ├── puppetdb/  # PuppetDB integration
│   │   │   ├── puppetserver/ # Puppetserver integration
│   │   │   └── hiera/     # Hiera integration
│   │   ├── database/      # SQLite database
│   │   ├── routes/        # API endpoints
│   │   └── services/      # Business logic
│   ├── test/              # Unit and integration tests
│   ├── package.json
│   └── tsconfig.json
├── docs/              # Documentation
└── package.json       # Root workspace configuration
```

## Screenshots

> **📸 [View Complete Screenshots Gallery](docs/screenshots.md)**

<img src="docs/screenshots/pabawi-screenshots.png" alt="Pabawi Screenshots" width="1024">

## Prerequisites

- **Node.js 20+** and **npm 9+** (or a container engine for Docker deployment)
- **Bolt CLI** — for Bolt integration ([setup](docs/integrations/bolt.md))
- **Ansible CLI** — for Ansible integration ([setup](docs/integrations/ansible.md))
- **Puppet/OpenVox agent** — for PuppetDB ([setup](docs/integrations/puppetdb.md)) and Puppetserver ([setup](docs/integrations/puppetserver.md)) integrations; provides SSL certs
- **Control repo** — for Hiera integration ([setup](docs/integrations/hiera.md))

## Installation

### Quick Start

The fastest way to get Pabawi running after cloning:

```bash
git clone https://github.com/example42/pabawi
cd pabawi
./scripts/setup.sh
```

The interactive setup script will:

1. **Check prerequisites** — Node.js, npm, and optionally Bolt, Ansible, Puppet/OpenVox CLIs
2. **Generate `backend/.env`** — core settings and integrations (Bolt, PuppetDB, Puppetserver, Hiera, Ansible, SSH) with smart defaults based on detected tools and SSL certs
3. **Install dependencies** — `npm run install:all` (with confirmation)
4. **Start the application** — development mode, full-stack build, or exit

### Manual Setup

If you prefer to configure things yourself:

```bash
git clone https://github.com/example42/pabawi
cd pabawi

# Install dependencies
npm run install:all

# Create your configuration (use .env.example as reference)
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

# Start in development mode
npm run dev:backend    # Port 3000
npm run dev:frontend   # Port 5173

# Or build and serve everything from the backend
npm run dev:fullstack  # Port 3000
```

### Using Docker Image

To start Pabawi with Docker Compose using the default configuration:

```bash
# HINT to keep things simple: Create a dedicated directory where to place:
# data dir for SQLite
# certs dir for puppetdb / puppetserver integration
# control-repo dir for hiera integration
# bolt-project dir for Bolt integration (could also be your control-repo dir) 
mkdir pabawi/
cd pabawi
# Create your configuration file in your current directory (paths in .env are relative to the container)
vi .env

# Run the example42/pabawi image mounting your pabawi dir 
docker run -d \
  --name pabawi \
  --user "$(id -u):1001" \
  -p 127.0.0.1:3000:3000 \
  -v "$(pwd)/pabawi:/pabawi" \
  --env-file ".env" \
  example42/pabawi:latest
```

This will start the application at <http://localhost:3000>.

For comprehensive Docker deployment instructions including all integrations, see the [Docker Deployment Guide](docs/docker-deployment.md).

## Configuration

Pabawi uses a `backend/.env` file for all configuration. The interactive setup script (`scripts/setup.sh`) generates this file for you. You can also use `backend/.env.example` as a reference template.

Key configuration areas:

- **Core** — port, host, log level
- **Bolt** — project path, command whitelist, execution timeout
- **PuppetDB / Puppetserver** — server URL, SSL certificates, token
- **Hiera** — control repo path, environments
- **Ansible** — project path, inventory path
- **SSH** — config path, default user/key, sudo, connection pool limits

For the complete configuration reference, see the [Configuration Guide](docs/configuration.md).

For API details, see the [Integrations API Documentation](docs/integrations-api.md).

## Troubleshooting

For solutions to common issues including installation, configuration, and integration problems, please refer to the comprehensive [Troubleshooting Guide](docs/troubleshooting.md).

## Development and Contributing

For development and contributions guidelines check the [Development Guide](docs/development.md).

For details of the repository files and configurations check the [Repository Structure](docs/repo_structure_and_config.md) document.

## Roadmap

**Planned**: Tiny Puppet integration, scheduled executions, custom dashboards, audit logging, CLI tool. Under evaluation: Terraform, AWS/Azure CLI, Kubernetes, Choria, Icinga.

### Version History

- **v0.8.0**: RBC authentication. SSH integrations. Inventory groups
- **v0.7.0**: Ansible Integration. Used classed aware hiera lookups
- **v0.6.0**: Code consolidation and fixing
- **v0.5.0**: Report filtering, puppet run history visualization, enhanced expert mode with frontend logging
- **v0.4.0**: Hiera integration, puppetserver CA management removal, enhanced plugin architecture
- **v0.3.0**: Puppetserver integration, interface enhancements
- **v0.2.0**: PuppetDB integration, re-execution, expert mode enhancements
- **v0.1.0**: Initial release with Bolt integration

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

- [Technical Summary](docs/description.md) | [Architecture](docs/architecture.md) | [Configuration](docs/configuration.md) | [User Guide](docs/user-guide.md)
- [API Reference](docs/api.md) | [Integrations API](docs/integrations-api.md) | [API Endpoints](docs/api-endpoints-reference.md) | [Error Codes](docs/error-codes.md)
- [Bolt](docs/integrations/bolt.md) | [Ansible](docs/integrations/ansible.md) | [Hiera](docs/integrations/hiera.md) | [PuppetDB](docs/integrations/puppetdb.md) | [Puppetserver](docs/integrations/puppetserver.md)
- [Authentication](docs/authentication.md) | [E2E Testing](docs/e2e-testing.md) | [Troubleshooting](docs/troubleshooting.md) | [Development](docs/development.md) | [Repo Structure](docs/repo_structure_and_config.md)

For help: check the docs, enable expert mode for diagnostics, or [open a GitHub issue](https://github.com/example42/pabawi/issues) with version info, config (sanitized), reproduction steps, and error messages.

## Acknowledgments

Pabawi builds on: [Puppet/OpenVox](https://puppet.com), [Bolt](https://puppet.com/docs/bolt), [PuppetDB](https://puppet.com/docs/puppetdb), [Svelte 5](https://svelte.dev), [Node.js](https://nodejs.org), [TypeScript](https://www.typescriptlang.org), [SQLite](https://sqlite.org). Thanks to all contributors and the Puppet community.
