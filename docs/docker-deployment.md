# Docker Deployment Guide

This guide covers deploying Pabawi with Docker, including configuration for PuppetDB, Puppetserver, and Hiera integrations.

## Table of Contents

- [Quick Start](#quick-start)
- [Docker Images](#docker-images)
- [Environment Variables](#environment-variables)
- [Volume Mounts](#volume-mounts)
- [Integration Configuration](#integration-configuration)
- [Docker Compose](#docker-compose)
- [SSL Certificate Setup](#ssl-certificate-setup)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## Quick Start

### Basic Deployment (Bolt Only)

```bash
# Build the image
docker build -t pabawi:latest .

# Run with basic Bolt integration
docker run -d \
  --name pabawi \
  -p 127.0.0.1:3000:3000 \
  -v $(pwd)/bolt-project:/bolt-project:ro \
  -v $(pwd)/data:/data \
  -e COMMAND_WHITELIST_ALLOW_ALL=false \
  -e COMMAND_WHITELIST='["ls","pwd","whoami","uptime"]' \
  pabawi:latest
```

### Running Without Building (Using Published Image)

```bash
# Run directly from Docker Hub (no git clone needed)
docker run -d \
  --name pabawi \
  --user "$(id -u):1001" \
  -p 127.0.0.1:3000:3000 \
  --platform "amd64" \
  -v "$(pwd):/bolt-project:ro" \
  -v "$(pwd)/data:/data" \
  -v "$(pwd)/certs:/certs" \
  -v "$HOME/.ssh:/home/pabawi/.ssh" \
  --env-file ./env \
  example42/pabawi:latest
```

**Notes:**

- `--user "$(id -u):1001"`: Your user must be able to read all the mounted files
- `--platform "amd64"`: Use `amd64` or `arm64` depending on your architecture
- Volume paths in your `.env` file must be relative to the container filesystem

### Full Integration Deployment

```bash
# Run with all integrations enabled
docker run -d \
  --name pabawi \
  -p 127.0.0.1:3000:3000 \
  -v $(pwd)/bolt-project:/bolt-project:ro \
  -v $(pwd)/control-repo:/control-repo:ro \
  -v $(pwd)/ssl-certs:/ssl-certs:ro \
  -v $(pwd)/data:/data \
  -e PUPPETDB_ENABLED=true \
  -e PUPPETDB_SERVER_URL=https://puppetdb.example.com \
  -e PUPPETDB_SSL_ENABLED=true \
  -e PUPPETDB_SSL_CA=/ssl-certs/ca.pem \
  -e PUPPETDB_SSL_CERT=/ssl-certs/client.pem \
  -e PUPPETDB_SSL_KEY=/ssl-certs/client-key.pem \
  -e PUPPETSERVER_ENABLED=true \
  -e PUPPETSERVER_SERVER_URL=https://puppet.example.com \
  -e PUPPETSERVER_SSL_ENABLED=true \
  -e PUPPETSERVER_SSL_CA=/ssl-certs/ca.pem \
  -e PUPPETSERVER_SSL_CERT=/ssl-certs/client.pem \
  -e PUPPETSERVER_SSL_KEY=/ssl-certs/client-key.pem \
  -e HIERA_ENABLED=true \
  -e HIERA_CONTROL_REPO_PATH=/control-repo \
  -e HIERA_FACT_SOURCE_PREFER_PUPPETDB=true \
  pabawi:latest
```

## Volume Mount Reference

**Important: Path Configuration**
The paths you reference in your `.env` file (like `BOLT_PROJECT_PATH` or `PUPPETDB_SSL_CA`) must be the paths **inside the container**, not the paths on your host machine.

The volume mounts map your local host files to these container paths. You can mount as many or as few volumes as needed depending on which integrations you are using.

| Kind of data | Path on host | Volume mount option | Env setting |
| ------------ | ------------ | ------------------- | ----------- |
| Bolt project dir | `$HOME/bolt-project` | `-v "${HOME}/bolt-project:/bolt:ro"` | `BOLT_PROJECT_PATH=/bolt` |
| Control Repo | `$HOME/control-repo` | `-v "${HOME}/control-repo:/control-repo:ro"` | `HIERA_CONTROL_REPO_PATH=/control-repo` |
| Pabawi Data | `$HOME/pabawi/data` | `-v "${HOME}/pabawi/data:/data"` | `DATABASE_PATH=/data/pabawi.db` |
| Puppet certs - CA | `$HOME/puppet/certs/ca.pem` | `-v "${HOME}/puppet/certs:/certs"` | `PUPPETSERVER_SSL_CA=/certs/ca.pem` |
| Puppet certs - User cert | `$HOME/puppet/certs/pabawi.pem` | `-v "${HOME}/puppet/certs:/certs"` | `PUPPETDB_SSL_CERT=/certs/pabawi.pem` |
| Puppet certs - User key | `$HOME/puppet/certs/private/pabawi.pem` | `-v "${HOME}/puppet/certs:/certs"` | `PUPPETDB_SSL_KEY=/certs/private/pabawi.pem` |

**Note:** `PUPPETSERVER_SSL_*` settings can use the same paths as the corresponding `PUPPETDB_SSL_*` ones.

## Docker Images

### Available Images

- **Standard (Ubuntu-based)**: `pabawi:latest` - Full-featured with all dependencies
- **Alpine**: `pabawi:alpine` - Smaller image with Alpine Linux base
- **Ubuntu**: `pabawi:ubuntu` - Explicit Ubuntu base (same as standard)

### Building Images

```bash
# Standard Ubuntu-based image
docker build -t pabawi:latest .

# Alpine-based image (smaller)
docker build -f Dockerfile.alpine -t pabawi:alpine .

# Ubuntu-based image (explicit)
docker build -f Dockerfile.ubuntu -t pabawi:ubuntu .
```

### Multi-architecture Support

```bash
# Build for multiple architectures
docker buildx build --platform linux/amd64,linux/arm64 -t pabawi:latest .
```

## Environment Variables

Pabawi is configured using environment variables. For a complete reference of all available variables, including Core, Bolt, and Integration settings, please consult the **[Configuration Guide](./configuration.md)**.

You can pass these variables to the Docker container using the `-e` flag:

```bash
docker run -d \
  -e PORT=3000 \
  -e LOG_LEVEL=info \
  -e PUPPETDB_ENABLED=true \
  pabawi:latest
```

Or by referencing an environment file (recommended):

```bash
docker run --env-file .env pabawi:latest
```

## Volume Mounts

### Required Volumes

```bash
# Bolt project (required)
-v /path/to/bolt-project:/bolt-project:ro

# Database storage (required)
-v /path/to/data:/data
```

### Optional Volumes

```bash
# SSL certificates for integrations
-v /path/to/ssl-certs:/ssl-certs:ro

# Hiera control repository
-v /path/to/control-repo:/control-repo:ro

# Local fact files (if not using PuppetDB)
-v /path/to/facts:/facts:ro

# SSH keys for Bolt connections
-v ~/.ssh:/root/.ssh:ro
```

### Volume Permissions

The container runs as user ID 1001. Ensure volumes have correct permissions:

```bash
# Set ownership for data directory
sudo chown -R 1001:1001 /path/to/data

# Make other directories readable
sudo chmod -R 755 /path/to/bolt-project
sudo chmod -R 755 /path/to/control-repo
sudo chmod -R 600 /path/to/ssl-certs/*.pem
```

## Integration Configuration

### PuppetDB Setup

1. **Prepare SSL certificates** (if not using tokens):

   ```bash
   # Copy certificates to local directory
   mkdir -p ./ssl-certs
   cp /etc/puppetlabs/puppet/ssl/certs/ca.pem ./ssl-certs/
   cp /etc/puppetlabs/puppet/ssl/certs/client.pem ./ssl-certs/
   cp /etc/puppetlabs/puppet/ssl/private_keys/client.pem ./ssl-certs/client-key.pem
   
   # Set correct permissions
   chmod 644 ./ssl-certs/ca.pem ./ssl-certs/client.pem
   chmod 600 ./ssl-certs/client-key.pem
   ```

2. **Test connectivity**:

   ```bash
   # Test PuppetDB connection
   curl --cacert ./ssl-certs/ca.pem \
        --cert ./ssl-certs/client.pem \
        --key ./ssl-certs/client-key.pem \
        https://puppetdb.example.com:8081/pdb/meta/v1/version
   ```

### Puppetserver Setup

1. **Use same SSL certificates** as PuppetDB (if both are on same Puppet infrastructure)

2. **Test connectivity**:

   ```bash
   # Test Puppetserver connection
   curl --cacert ./ssl-certs/ca.pem \
        --cert ./ssl-certs/client.pem \
        --key ./ssl-certs/client-key.pem \
        https://puppet.example.com:8140/status/v1/simple
   ```

### Hiera Setup

1. **Prepare control repository**:

   ```bash
   # Clone your control repository
   git clone https://github.com/your-org/control-repo.git
   
   # Verify structure
   ls -la control-repo/
   # Should contain: hiera.yaml, data/, manifests/, modules/
   ```

2. **Verify hiera.yaml**:

   ```yaml
   # control-repo/hiera.yaml
   version: 5
   defaults:
     datadir: data
     data_hash: yaml_data
   hierarchy:
     - name: "Per-node data"
       path: "nodes/%{trusted.certname}.yaml"
     - name: "Per-environment data"
       path: "environments/%{server_facts.environment}.yaml"
     - name: "Common data"
       path: "common.yaml"
   ```

## Docker Compose

The project includes a `docker-compose.yml` that uses the published image from Docker Hub.

### Basic Usage

```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down

# Rebuild and restart (if using local build)
docker-compose up -d --build
```

### Default Configuration

The included `docker-compose.yml` provides:

```yaml
services:
  app:
    image: example42/pabawi:latest
    container_name: pabawi
    env_file:
      - .env
    volumes:
      # Bolt project directory (read-only)
      - ./bolt-project:/bolt-project:ro
      # SQLite database persistence
      - ./data:/data
      # SSL certificates for PuppetDB/Puppetserver (optional)
      # - /path/to/ssl/certs:/ssl-certs:ro
      # Hiera control repository (optional)
      # - /path/to/control-repo:/control-repo:ro
    ports:
      - "${PORT:-3000}:3000"
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      start_period: 5s
      retries: 3
    restart: unless-stopped
    networks:
      - pabawi-network

networks:
  pabawi-network:
    driver: bridge
```

### Enabling Integrations

1. **Create your `.env` file** from the example:

   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`** to configure your integrations (see [Environment Variables](#environment-variables))

3. **Uncomment volume mounts** in `docker-compose.yml` for the integrations you need:

   ```yaml
   volumes:
     - ./bolt-project:/bolt-project:ro
     - ./data:/data
     # Uncomment and adjust paths as needed:
     - /path/to/ssl/certs:/ssl-certs:ro
     - /path/to/control-repo:/control-repo:ro
   ```

4. **Start the service**:

   ```bash
   docker-compose up -d
   ```

### Localhost-Only Access

For security, bind to localhost only by setting in your `.env`:

```env
PORT=127.0.0.1:3000
```

Or modify the ports section directly:

```yaml
ports:
  - "127.0.0.1:3000:3000"
```

### Custom Configuration

For more advanced setups, you can extend the configuration:

```yaml
version: '3.8'

services:
  pabawi:
    image: example42/pabawi:latest
    container_name: pabawi
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - ./bolt-project:/bolt-project:ro
      - ./data:/data
      - ./ssl-certs:/ssl-certs:ro
      - ./control-repo:/control-repo:ro
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0
      - DATABASE_PATH=/data/executions.db
      - BOLT_PROJECT_PATH=/bolt-project
      - LOG_LEVEL=info
      
      # Security
      - COMMAND_WHITELIST_ALLOW_ALL=false
      - COMMAND_WHITELIST=["ls","pwd","whoami","uptime"]
      
      # PuppetDB Integration
      - PUPPETDB_ENABLED=${PUPPETDB_ENABLED:-false}
      - PUPPETDB_SERVER_URL=${PUPPETDB_SERVER_URL}
      - PUPPETDB_PORT=${PUPPETDB_PORT:-8081}
      - PUPPETDB_SSL_ENABLED=${PUPPETDB_SSL_ENABLED:-true}
      - PUPPETDB_SSL_CA=${PUPPETDB_SSL_CA:-/ssl-certs/ca.pem}
      - PUPPETDB_SSL_CERT=${PUPPETDB_SSL_CERT:-/ssl-certs/client.pem}
      - PUPPETDB_SSL_KEY=${PUPPETDB_SSL_KEY:-/ssl-certs/client-key.pem}
      
      # Puppetserver Integration
      - PUPPETSERVER_ENABLED=${PUPPETSERVER_ENABLED:-false}
      - PUPPETSERVER_SERVER_URL=${PUPPETSERVER_SERVER_URL}
      - PUPPETSERVER_PORT=${PUPPETSERVER_PORT:-8140}
      - PUPPETSERVER_SSL_ENABLED=${PUPPETSERVER_SSL_ENABLED:-true}
      - PUPPETSERVER_SSL_CA=${PUPPETSERVER_SSL_CA:-/ssl-certs/ca.pem}
      - PUPPETSERVER_SSL_CERT=${PUPPETSERVER_SSL_CERT:-/ssl-certs/client.pem}
      - PUPPETSERVER_SSL_KEY=${PUPPETSERVER_SSL_KEY:-/ssl-certs/client-key.pem}
      
      # Hiera Integration
      - HIERA_ENABLED=${HIERA_ENABLED:-false}
      - HIERA_CONTROL_REPO_PATH=${HIERA_CONTROL_REPO_PATH:-/control-repo}
      - HIERA_FACT_SOURCE_PREFER_PUPPETDB=${HIERA_FACT_SOURCE_PREFER_PUPPETDB:-true}
      
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
    user: "1001:1001"

volumes:
  pabawi-data:
```

### Environment File

Create `.env` file for configuration:

```env
# PuppetDB Integration
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
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

### Running with Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f pabawi

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build
```

## SSL Certificate Setup

### Generating Certificates

Use the provided script to generate certificates with proper extensions:

```bash
# Generate certificate with cli_auth extension
./scripts/generate-pabawi-cert.sh

# Sign on Puppetserver
puppetserver ca sign --certname pabawi

# Download signed certificate
./scripts/generate-pabawi-cert.sh --download
```

### Manual Certificate Setup

If you prefer manual setup:

```bash
# Create certificate directory
mkdir -p ./ssl-certs

# Copy CA certificate
cp /etc/puppetlabs/puppet/ssl/certs/ca.pem ./ssl-certs/

# Generate private key
openssl genrsa -out ./ssl-certs/pabawi-key.pem 2048

# Create certificate signing request
openssl req -new \
  -key ./ssl-certs/pabawi-key.pem \
  -out ./ssl-certs/pabawi.csr \
  -subj "/CN=pabawi"

# Submit CSR to Puppetserver (adjust URL)
curl -X PUT \
  --cacert ./ssl-certs/ca.pem \
  --data-binary @./ssl-certs/pabawi.csr \
  https://puppet.example.com:8140/puppet-ca/v1/certificate_request/pabawi

# Sign certificate on Puppetserver
puppetserver ca sign --certname pabawi

# Download signed certificate
curl --cacert ./ssl-certs/ca.pem \
  https://puppet.example.com:8140/puppet-ca/v1/certificate/pabawi \
  -o ./ssl-certs/pabawi.pem

# Set permissions
chmod 644 ./ssl-certs/ca.pem ./ssl-certs/pabawi.pem
chmod 600 ./ssl-certs/pabawi-key.pem
```

### Certificate Verification

```bash
# Verify certificate
openssl x509 -in ./ssl-certs/pabawi.pem -text -noout

# Test PuppetDB connection
curl --cacert ./ssl-certs/ca.pem \
     --cert ./ssl-certs/pabawi.pem \
     --key ./ssl-certs/pabawi-key.pem \
     https://puppetdb.example.com:8081/pdb/meta/v1/version
```

## Troubleshooting

### Container Won't Start

**Check logs**:

```bash
docker logs pabawi
```

**Common issues**:

- Volume permission errors (fix with `chown -R 1001:1001`)
- Missing required files (bolt-project/inventory.yaml)
- Invalid environment variables

### Integration Connection Failures

**PuppetDB connection failed**:

```bash
# Test from container
docker exec pabawi curl -k https://puppetdb.example.com:8081/pdb/meta/v1/version

# Check certificate paths
docker exec pabawi ls -la /ssl-certs/

# Verify certificate content
docker exec pabawi openssl x509 -in /ssl-certs/client.pem -text -noout
```

**Puppetserver connection failed**:

```bash
# Test from container
docker exec pabawi curl -k https://puppet.example.com:8140/status/v1/simple

# Check SSL configuration
docker exec pabawi openssl s_client -connect puppet.example.com:8140 -CAfile /ssl-certs/ca.pem
```

**Hiera integration issues**:

```bash
# Check control repository mount
docker exec pabawi ls -la /control-repo/

# Verify hiera.yaml
docker exec pabawi cat /control-repo/hiera.yaml

# Check hieradata
docker exec pabawi find /control-repo/data -name "*.yaml" | head -10
```

### Performance Issues

**High memory usage**:

- Reduce cache TTL values
- Limit concurrent executions
- Use Alpine image for smaller footprint

**Slow responses**:

- Increase timeout values
- Enable caching
- Check network connectivity to integrations

### Database Issues

**Database locked errors**:

```bash
# Stop container
docker stop pabawi

# Check database file
ls -la ./data/executions.db

# Remove lock files
rm -f ./data/executions.db-*

# Restart container
docker start pabawi
```

**Permission errors**:

```bash
# Fix data directory permissions
sudo chown -R 1001:1001 ./data
```

## Security Considerations

**⚠️ Security Note**: Pabawi should only be exposed via localhost. If you run Pabawi on a remote node, use SSH port forwarding:

```bash
# SSH port forwarding for remote access
ssh -L 3000:localhost:3000 user@your-pabawi-host
```

If you want to allow Pabawi access to different users, configure a reverse proxy with authentication.

### Network Security

- **Localhost only**: Access Pabawi only via localhost
- **SSH tunneling**: Use SSH port forwarding for remote access
- **Reverse proxy**: Implement authentication via nginx/Apache for network access
- **Firewall**: Restrict container network access

### SSL/TLS

- **Certificate validation**: Always use `SSL_REJECT_UNAUTHORIZED=true` in production
- **Certificate rotation**: Regularly rotate SSL certificates
- **Secure storage**: Protect private keys with appropriate file permissions

### Container Security

- **Non-root user**: Container runs as UID 1001 (non-root)
- **Read-only mounts**: Mount sensitive directories as read-only
- **Resource limits**: Set memory and CPU limits
- **Security scanning**: Regularly scan images for vulnerabilities

### Example Security Configuration

```yaml
# docker-compose.yml security enhancements
services:
  pabawi:
    # ... other configuration ...
    
    # Resource limits
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'
    
    # Security options
    security_opt:
      - no-new-privileges:true
    
    # Read-only root filesystem (requires writable /tmp)
    read_only: true
    tmpfs:
      - /tmp
    
    # Drop capabilities
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID
```

### SSH Port Forwarding

For secure remote access:

```bash
# Forward port 3000 from remote workstation
ssh -L 3000:localhost:3000 user@workstation.example.com

# Access via local browser
open http://localhost:3000
```

## Additional Resources

- [Configuration Guide](./configuration.md)
- [PuppetDB Integration Setup](./integrations/puppetdb.md)
- [Puppetserver Setup](./uppetserver-integration-setup.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [API Documentation](./api.md)
