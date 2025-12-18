# Pabawi

Version 0.3.0 - Unified Remote Execution Interface

Pabawi is a general-purpose remote execution platform that integrates multiple infrastructure management tools including Puppet Bolt and PuppetDB. It provides a unified web interface for managing infrastructure, executing commands, viewing system information, and tracking operations across your entire environment.

## Features

### Core Capabilities

- **Multi-Source Inventory**: View and manage nodes from Bolt inventory and PuppetDB
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
│   │   │   └── puppetdb/  # PuppetDB integration
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

**Development Mode** (when running both servers separately):

- **Frontend UI**: <http://localhost:5173> (Main application interface)
- **Backend API**: <http://localhost:3000/api> (API endpoints)

**Production Mode** (Docker or built application):

- **Application**: <http://localhost:3000> (Frontend and API served together)
- The backend serves the built frontend as static files

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

### Building the Docker Image

```bash
docker build -t padawi:latest .
```

### Running with Docker

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
  example42/padawi:0.3.0
```

Access the application at <http://localhost:3000>

### Running with Docker Compose

```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

Access the application at <http://localhost:3000>

## Screenshots

### Multi-Source Inventory

View nodes from Bolt and PuppetDB with clear source attribution:

```
[Screenshot: Inventory page showing nodes from multiple sources with source badges]
```

### PuppetDB Integration

Access comprehensive Puppet data including facts, reports, catalogs, and events:

```
[Screenshot: Node detail page with PuppetDB tabs showing reports and catalog]
```

### Re-execution

Quickly repeat operations with preserved parameters:

```
[Screenshot: Executions page with re-execute buttons]
```

### Expert Mode

View complete command lines and full output for debugging:

```
[Screenshot: Expert mode showing full command line and output with search]
```

### Integration Status

Monitor health of all configured integrations:

```
[Screenshot: Home page with integration status dashboard]
```

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

**Important:** Token-based authentication is only available with Puppet Enterprise. Open Source Puppet and OpenVox installations must use certificate-based authentication.

See [Configuration Guide](docs/configuration.md) for complete reference.

### Volume Mounts

- `/bolt-project`: Mount your Bolt project directory (read-only)
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

= **v0.3.0**: Puppetserver integration, interface enhancements
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
- [Puppetserver Setup](docs/PUPPETSERVER_SETUP.md) - Puppetserver configuration guide
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
