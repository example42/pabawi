# Pabawi

<table>
<tr>
<td width="150">
  <img src="frontend/favicon/web-app-manifest-512x512.png" alt="Pabawi Logo" width="128" height="128">
</td>
<td>
  <h3>Version 0.4.0 - Puppet And Bolt Awesome Web Interface</h3>
  <p>Pabawi is a web frontend for infrastructure management, inventory and remote execution. It currently provides integrations with Puppet, Bolt, PuppetDB, and Hiera. It supports both Puppet Enterprise and Open Source Puppet / OpenVox. It provides a unified web interface for managing infrastructure, executing commands, viewing system information, and tracking operations across your entire environment.</p>
</td>
</tr>
</table>

## Security Notice

**⚠️ IMPORTANT: Pabawi is designed for local use by Puppet administrators and developers on their workstations.**

- **No Built-in Authentication**: Pabawi currently has no user authentication or authorization system
- **Localhost Access Only**: The application should only be accessed via `localhost` or `127.0.0.1`
- **Network Access Not Recommended**: Do not expose Pabawi directly to network access without external authentication
- **Production Deployment**: If network access is required, use a reverse proxy (nginx, Apache) with proper authentication and SSL termination
- **Privileged Operations**: Pabawi can execute commands and tasks on your infrastructure - restrict access accordingly

For production or multi-user environments, implement external authentication through a reverse proxy before allowing network access.

## Features

### Core Capabilities

- **Multi-Source Inventory**: View and manage nodes from Bolt inventory, PuppetDB, and Puppetserver
- **Command Execution**: Run ad-hoc commands on remote nodes with whitelist security
- **Task Execution**: Execute Bolt tasks with parameter support
- **Puppet Integration**: Trigger Puppet agent runs with full configuration control
- **Package Management**: Install and manage packages across your infrastructure
- **Execution History**: Track all operations with detailed results and re-execution capability
- **Dynamic Inventory**: Automatically discover nodes from PuppetDB
- **Node Facts**: View comprehensive system information from Puppet agents
- **Puppet Reports**: Browse detailed Puppet run reports with metrics and resource changes
- **Catalog Inspection**: Examine compiled Puppet catalogs and resource relationships
- **Event Tracking**: Monitor individual resource changes and failures over time
- **PQL Queries**: Filter nodes using PuppetDB Query Language
- **Hiera Data Browser**: Explore hierarchical configuration data and key usage analysis

### Advanced Features

- **Re-execution**: Quickly repeat previous operations with preserved or modified parameters
- **Expert Mode**: View complete command lines and full output for debugging and auditing
- **Real-time Streaming**: Monitor command and task execution with live output
- **Multi-Source Architecture**: Seamlessly integrate data from multiple backend systems
- **Graceful Degradation**: Continue operating when individual integrations are unavailable

## Project Structure

```text
padawi/
├── frontend/          # Svelte 5 + Vite frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Page components
│   │   └── lib/           # Utilities and stores
│   ├── package.json
│   └── vite.config.ts
├── backend/           # Node.js + TypeScript API server
│   ├── src/
│   │   ├── bolt/          # Bolt integration
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
│   ├── configuration.md
│   ├── api.md
│   ├── user-guide.md
│   ├── puppetdb-integration-setup.md
│   ├── puppetdb-api.md
│   └── v0.2-features-guide.md
└── package.json       # Root workspace configuration
```

## Prerequisites

- Node.js 20+
- npm 9+
- Bolt CLI installed and configured

## Installation

```bash
# Install all dependencies
npm run install:all
```

## Development

```bash
# Run backend (port 3000)
npm run dev:backend

# Run frontend (port 5173)
npm run dev:frontend
```

### Accessing the Application

**⚠️ Security Reminder: Access Pabawi only via localhost for security**

**Development Mode** (when running both servers separately):

- **Frontend UI**: <http://localhost:5173> (Main application interface)
- **Backend API**: <http://localhost:3000/api> (API endpoints)

**Production Mode** (Docker or built application):

- **Application**: <http://localhost:3000> (Frontend and API served together)
- The backend serves the built frontend as static files

**Network Access**: If you need to access Pabawi from other machines, use SSH port forwarding or implement a reverse proxy with proper authentication. Never expose Pabawi directly to the network without authentication.

## Build

```bash
# Build both frontend and backend
npm run build
```

## Configuration

### Basic Configuration

Copy `backend/.env.example` to `backend/.env` and configure:

```env
# Server Configuration
PORT=3000
BOLT_PROJECT_PATH=.
LOG_LEVEL=info
DATABASE_PATH=./data/executions.db

# Security
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST=["ls","pwd","whoami"]
BOLT_EXECUTION_TIMEOUT=300000
```

### PuppetDB Integration (Optional)

To enable PuppetDB integration, add to `backend/.env`:

```env
# Enable PuppetDB
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081

# Token based Authentication (Puppet Enterprise only - use certificates for Open Source Puppet)
PUPPETDB_TOKEN=your-token-here

# SSL Configuration
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/path/to/ca.pem
PUPPETDB_SSL_CERT=/path/to/cert.pem
PUPPETDB_SSL_KEY=/path/to/key.pem
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true

# Connection Settings
PUPPETDB_TIMEOUT=30000
PUPPETDB_RETRY_ATTEMPTS=3
PUPPETDB_CACHE_TTL=300000
```

See [PuppetDB Integration Setup Guide](docs/puppetdb-integration-setup.md) for detailed configuration instructions.

### Hiera Integration (Optional)

To enable Hiera integration, add to `backend/.env`:

```env
# Enable Hiera
HIERA_ENABLED=true
HIERA_CONTROL_REPO_PATH=/path/to/control-repo

# Optional Configuration
HIERA_CONFIG_PATH=hiera.yaml
HIERA_ENVIRONMENTS=["production","development"]

# Fact Source Configuration
HIERA_FACT_SOURCE_PREFER_PUPPETDB=true
HIERA_FACT_SOURCE_LOCAL_PATH=/path/to/facts

# Cache Configuration
HIERA_CACHE_ENABLED=true
HIERA_CACHE_TTL=300000
HIERA_CACHE_MAX_ENTRIES=10000

# Code Analysis Configuration
HIERA_CODE_ANALYSIS_ENABLED=true
HIERA_CODE_ANALYSIS_LINT_ENABLED=true
```

The Hiera integration requires:
- A valid Puppet control repository with `hiera.yaml` configuration
- Hieradata files in the configured data directories
- Node facts (from PuppetDB or local files) for hierarchy interpolation

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

## Development Pre-commit Hooks

This project uses pre-commit hooks to ensure code quality and security before commits.

### Setup

```bash
# Install pre-commit (requires Python)
pip install pre-commit

# Or using homebrew on macOS
brew install pre-commit

# Install the git hooks
pre-commit install
pre-commit install --hook-type commit-msg
```

### What Gets Checked

- **Code Quality**: ESLint, TypeScript type checking
- **Security**: Secret detection, private key detection
- **File Checks**: Trailing whitespace, file size limits, merge conflicts
- **Docker**: Dockerfile linting with hadolint
- **Markdown**: Markdown linting and formatting
- **Shell Scripts**: ShellCheck validation
- **Commit Messages**: Conventional commit format enforcement
- **Duplicate Files**: Prevents files with suffixes like `_fixed`, `_backup`, etc.

### Manual Run

```bash
# Run all hooks on all files
pre-commit run --all-files

# Run specific hook
pre-commit run eslint --all-files

# Update hooks to latest versions
pre-commit autoupdate
```

### Bypassing Hooks (Use Sparingly)

```bash
# Skip pre-commit hooks (not recommended)
git commit --no-verify -m "message"
```

## Docker Deployment

For comprehensive Docker deployment instructions including all integrations, see the [Docker Deployment Guide](docs/docker-deployment.md).

### Quick Start

### Building the Docker Image

```bash
# Using the provided script
./scripts/docker-run.sh

# Or manually executing from your Bolt Project dir
docker run -d \
  --name padawi \
  -p 3000:3000 \
  -v $(pwd):/bolt-project:ro \
  -v $(pwd)/data:/data \
  -e BOLT_COMMAND_WHITELIST_ALLOW_ALL=false \
  example42/padawi:latest
```

### Running with PuppetDB Integration

```bash
docker run -d \
  --name padawi \
  -p 3000:3000 \
  -v $(pwd):/bolt-project:ro \
  -v $(pwd)/data:/data \
  -e BOLT_COMMAND_WHITELIST_ALLOW_ALL=false \
  -e PUPPETDB_ENABLED=true \
  -e PUPPETDB_SERVER_URL=https://puppetdb.example.com \
  -e PUPPETDB_PORT=8081 \
  -e PUPPETDB_TOKEN=your-token-here \
  -e PUPPETDB_SSL_ENABLED=true \
  example42/padawi:0.4.0
```

### Running with Hiera Integration

```bash
docker run -d \
  --name padawi \
  -p 3000:3000 \
  -v $(pwd):/bolt-project:ro \
  -v $(pwd)/control-repo:/control-repo:ro \
  -v $(pwd)/data:/data \
  -e BOLT_COMMAND_WHITELIST_ALLOW_ALL=false \
  -e HIERA_ENABLED=true \
  -e HIERA_CONTROL_REPO_PATH=/control-repo \
  -e HIERA_FACT_SOURCE_PREFER_PUPPETDB=true \
  example42/padawi:0.4.0
```

Access the application at <http://localhost:3000>

**⚠️ Security Note**: Only access via localhost. For remote access, use SSH port forwarding:
```bash
# SSH port forwarding for remote access
ssh -L 3000:localhost:3000 user@your-workstation
```

```bash
docker build -t pabawi:latest .
```

### Running with Docker Compose

The docker-compose.yml file includes comprehensive configuration for all integrations:

```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

#### Enabling Integrations

To enable integrations, create a `.env` file in the project root with your configuration:

```env
# PuppetDB Integration
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_TOKEN=your-token-here
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/ssl-certs/ca.pem
PUPPETDB_SSL_CERT=/ssl-certs/client.pem
PUPPETDB_SSL_KEY=/ssl-certs/client-key.pem

# Puppetserver Integration
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/ssl-certs/ca.pem
PUPPETSERVER_SSL_CERT=/ssl-certs/client.pem
PUPPETSERVER_SSL_KEY=/ssl-certs/client-key.pem

# Hiera Integration
HIERA_ENABLED=true
HIERA_CONTROL_REPO_PATH=/control-repo
HIERA_ENVIRONMENTS=["production","staging"]
HIERA_FACT_SOURCE_PREFER_PUPPETDB=true
```

#### Volume Mounts for Integrations

Update the docker-compose.yml volumes section to include your SSL certificates and control repository:

```yaml
volumes:
  # Existing mounts
  - ./bolt-project:/bolt-project:ro
  - ./data:/data
  
  # SSL certificates for PuppetDB/Puppetserver
  - /path/to/ssl/certs:/ssl-certs:ro
  
  # Hiera control repository
  - /path/to/control-repo:/control-repo:ro
```

Access the application at <http://localhost:3000>

**⚠️ Security Note**: Only access via localhost. For remote access, use SSH port forwarding:
```bash
# SSH port forwarding for remote access
ssh -L 3000:localhost:3000 user@your-workstation
```

## Screenshots

> **📸 [View Complete Screenshots Gallery](docs/screenshots.md)** - Comprehensive visual documentation of all Pabawi features and interfaces.

### Dashboard and Inventory

<img src="docs/screenshots/home-dashboard.png" alt="Home Dashboard" width="400"> <img src="docs/screenshots/inventory-page.png" alt="Inventory Page" width="400">

*Home dashboard with integration status and node inventory with multi-source support*

### Node Management and Operations

<img src="docs/screenshots/node-detail-page.png" alt="Node Detail Page" width="400"> <img src="docs/screenshots/command-execution.png" alt="Command Execution" width="400">

*Node detail interface and command execution with real-time results*

### Advanced Features

<img src="docs/screenshots/execution-history.png" alt="Execution History" width="400"> <img src="docs/screenshots/expert-mode-output.png" alt="Expert Mode" width="400">

*Execution tracking with re-run capabilities and expert mode diagnostics*

## Environment Variables

Copy `.env.example` to `.env` and configure as needed. Key variables:

**Core Settings:**

- `PORT`: Application port (default: 3000)
- `BOLT_PROJECT_PATH`: Path to Bolt project directory
- `BOLT_COMMAND_WHITELIST_ALLOW_ALL`: Allow all commands (default: false)
- `BOLT_COMMAND_WHITELIST`: JSON array of allowed commands
- `BOLT_EXECUTION_TIMEOUT`: Timeout in milliseconds (default: 300000)
- `LOG_LEVEL`: Logging level (default: info)

**PuppetDB Integration (Optional):**

- `PUPPETDB_ENABLED`: Enable PuppetDB integration (default: false)
- `PUPPETDB_SERVER_URL`: PuppetDB server URL
- `PUPPETDB_PORT`: PuppetDB port (default: 8081)
- `PUPPETDB_TOKEN`: Authentication token (Puppet Enterprise only)
- `PUPPETDB_SSL_ENABLED`: Enable SSL (default: true)
- `PUPPETDB_SSL_CA`: Path to CA certificate
- `PUPPETDB_CACHE_TTL`: Cache duration in ms (default: 300000)

**Hiera Integration (Optional):**

- `HIERA_ENABLED`: Enable Hiera integration (default: false)
- `HIERA_CONTROL_REPO_PATH`: Path to Puppet control repository
- `HIERA_CONFIG_PATH`: Path to hiera.yaml (default: hiera.yaml)
- `HIERA_ENVIRONMENTS`: JSON array of environments (default: ["production"])
- `HIERA_FACT_SOURCE_PREFER_PUPPETDB`: Prefer PuppetDB for facts (default: true)
- `HIERA_CACHE_ENABLED`: Enable caching (default: true)
- `HIERA_CACHE_TTL`: Cache duration in ms (default: 300000)

**Important:** Token-based authentication is only available with Puppet Enterprise. Open Source Puppet and OpenVox installations must use certificate-based authentication.

See [Configuration Guide](docs/configuration.md) for complete reference.

### Volume Mounts

- `/bolt-project`: Mount your Bolt project directory (read-only)
- `/control-repo`: Mount your Puppet control repository for Hiera integration (read-only, optional)
- `/data`: Persistent storage for SQLite database

### Troubleshooting

### Common Issues

#### Database Permission Errors

If you see `SQLITE_CANTOPEN: unable to open database file`, the container user (UID 1001) doesn't have write access to the `/data` volume.

**On Linux:**

```bash
# Set correct ownership on the data directory
sudo chown -R 1001:1001 ./data
```

**On macOS/Windows:**
Docker Desktop handles permissions automatically. Ensure the directory exists:

```bash
mkdir -p ./data
```

**Using the docker-run.sh script:**
The provided script automatically handles permissions on Linux systems.

#### PuppetDB Connection Issues

If PuppetDB integration shows "Disconnected":

1. Verify PuppetDB is running and accessible
2. Check configuration in `backend/.env`
3. Test connectivity: `curl https://puppetdb.example.com:8081/pdb/meta/v1/version`
4. Review logs with `LOG_LEVEL=debug`
5. See [PuppetDB Integration Setup Guide](docs/puppetdb-integration-setup.md)

#### Hiera Integration Issues

If Hiera integration shows "Not Found" for all keys:

1. Verify control repository path is correct (`HIERA_CONTROL_REPO_PATH`)
2. Check `hiera.yaml` exists in control repository root
3. Ensure hieradata directories exist and contain YAML files
4. Verify node facts are available (PuppetDB or local files)
5. Check hierarchy path interpolation with available facts
6. Review logs with `LOG_LEVEL=debug` for detailed error messages

#### Expert Mode Not Showing Full Output

If expert mode doesn't show complete output:

1. Ensure expert mode is enabled (toggle in navigation)
2. Check execution was run with expert mode enabled
3. Verify database has `stdout` and `stderr` columns
4. For historical executions, only those run in v0.2.0+ have full output

See [Troubleshooting Guide](docs/troubleshooting.md) for more solutions.

## Contributing

We welcome contributions! Here's how you can help:

### Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include version information and configuration (sanitized)
- Provide steps to reproduce issues
- Enable expert mode and include relevant error details

### Development

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Style

- Follow TypeScript best practices
- Use ESLint and Prettier configurations
- Write meaningful commit messages
- Add documentation for new features

### Testing

```bash
# Run unit and integration tests
npm test

# Run E2E tests
npm run test:e2e

# Run specific test suite
npm test --workspace=backend
```

## Roadmap

### Planned Features

- **Additional Integrations**: Ansible, Terraform, AWS CLI, Azure CLI, Kubernetes
- **Advanced Querying**: Visual query builder for PQL
- **Scheduled Executions**: Cron-like scheduling for recurring tasks
- **Webhooks**: Trigger actions based on external events
- **Custom Dashboards**: User-configurable dashboard widgets
- **RBAC**: Role-based access control
- **Audit Logging**: Comprehensive audit trail

### Version History

- **v0.4.0**: Hiera integration, puppetserver CA management removal, enhanced plugin architecture
- **v0.3.0**: Puppetserver integration, interface enhancements
- **v0.2.0**: PuppetDB integration, re-execution, expert mode enhancements
- **v0.1.0**: Initial release with Bolt integration

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

### Documentation

- [Architecture Documentation](docs/architecture.md) - System architecture and plugin design
- [Configuration Guide](docs/configuration.md)
- [User Guide](docs/user-guide.md)
- [API Documentation](docs/api.md)
- [PuppetDB Integration Setup](docs/puppetdb-integration-setup.md)

### Getting Help

1. Check the documentation
2. Review [Troubleshooting Guide](docs/troubleshooting.md)
3. Enable expert mode for detailed diagnostics
4. Search existing GitHub Issues
5. Create a new issue with:
   - Version information
   - Configuration (sanitized)
   - Steps to reproduce
   - Error messages and logs

### Community

- GitHub Issues: Bug reports and feature requests
- GitHub Discussions: Questions and community support
- Documentation: Comprehensive guides and references

## Acknowledgments

Pabawi builds on excellent open-source projects:

- **Puppet Bolt**: Remote task execution engine
- **PuppetDB**: Centralized Puppet data storage
- **Svelte 5**: Reactive UI framework
- **Node.js**: Backend runtime
- **TypeScript**: Type-safe development
- **SQLite**: Embedded database

Special thanks to all contributors and the Puppet community.

## Documentation

### Getting Started

- [Architecture Documentation](docs/architecture.md) - System architecture and plugin design
- [Configuration Guide](docs/configuration.md) - Complete configuration reference
- [User Guide](docs/user-guide.md) - Comprehensive user documentation
- [API Documentation](docs/api.md) - REST API reference

### API Reference

- [Integrations API Documentation](docs/integrations-api.md) - Complete API reference for all integrations
- [API Endpoints Reference](docs/api-endpoints-reference.md) - Quick reference table of all endpoints
- [Authentication Guide](docs/authentication.md) - Authentication setup and troubleshooting
- [Error Codes Reference](docs/error-codes.md) - Complete error code reference

### Integration Setup

- [PuppetDB Integration Setup](docs/puppetdb-integration-setup.md) - PuppetDB configuration guide
- [Puppetserver Setup](docs/uppetserver-integration-setup.md) - Puppetserver configuration guide
- [PuppetDB API Documentation](docs/puppetdb-api.md) - PuppetDB-specific API endpoints

### Additional Resources

- [E2E Testing Guide](docs/e2e-testing.md) - End-to-end testing documentation
- [Troubleshooting Guide](docs/troubleshooting.md) - Common issues and solutions

## Quick Start Guide

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Configure Bolt Project

Ensure you have a valid Bolt project with `inventory.yaml`:

```yaml
# bolt-project/inventory.yaml
groups:
  - name: linux-servers
    targets:
      - name: server-01
        uri: server-01.example.com
    config:
      transport: ssh
      ssh:
        user: admin
        private-key: ~/.ssh/id_rsa
```

### 3. Start Development Servers

```bash
# Terminal 1: Start backend
npm run dev:backend

# Terminal 2: Start frontend
npm run dev:frontend
```

### 4. Access the Application

- **Frontend**: <http://localhost:5173>
- **Backend API**: <http://localhost:3000/api>
