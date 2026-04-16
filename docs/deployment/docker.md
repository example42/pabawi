# Docker Deployment

## Quick Start

```bash
# Using published image
docker run -d \
  --name pabawi \
  --user "$(id -u):1001" \
  -p 127.0.0.1:3000:3000 \
  --platform "amd64" \
  -v "$(pwd)/bolt-project:/opt/pabawi/bolt-project:ro" \
  -v "$(pwd)/data:/opt/pabawi/data" \
  --env-file ./env \
  example42/pabawi:latest
```

`--user "$(id -u):1001"` — your user must be able to read all mounted files.

## Building the Image

```bash
docker build -t pabawi:latest .
docker build -f Dockerfile.alpine -t pabawi:alpine .  # smaller
```

**Multi-arch:**

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t pabawi:latest .
```

## Volume Mounts

All paths in `.env` must be **container paths** (under `/opt/pabawi/`), not host paths.

| Data | Host → Container | Env setting |
|---|---|---|
| SQLite DB | `./data` → `/opt/pabawi/data` | `DATABASE_PATH=/opt/pabawi/data/pabawi.db` |
| Bolt project | `./bolt-project` → `/opt/pabawi/bolt-project` | `BOLT_PROJECT_PATH=/opt/pabawi/bolt-project` |
| Control repo | `./control-repo` → `/opt/pabawi/control-repo` | `HIERA_CONTROL_REPO_PATH=/opt/pabawi/control-repo` |
| Ansible | `./ansible` → `/opt/pabawi/ansible` | `ANSIBLE_PROJECT_PATH=/opt/pabawi/ansible` |
| SSL certs | `./certs` → `/opt/pabawi/certs` | `PUPPETDB_SSL_CA=/opt/pabawi/certs/ca.pem` |
| SSH keys | `~/.ssh` → `/opt/pabawi/ssh` | `SSH_DEFAULT_KEY=/opt/pabawi/ssh/id_rsa` |

**Permissions:** The container runs as UID 1001.

```bash
chown -R 1001:1001 ./data
chmod 755 ./bolt-project ./control-repo
chmod 600 ./certs/*.pem ./certs/*.key
```

## Docker Compose

```yaml
services:
  pabawi:
    image: example42/pabawi:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    user: "${UID:-1000}:1001"
    env_file: .env
    volumes:
      - ./bolt-project:/opt/pabawi/bolt-project:ro
      - ./control-repo:/opt/pabawi/control-repo:ro
      - ./ansible:/opt/pabawi/ansible:ro
      - ./certs:/opt/pabawi/certs:ro
      - ~/.ssh:/opt/pabawi/ssh:ro
      - ./data:/opt/pabawi/data
```

## Example `.env` for Docker

```bash
# Server
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
DATABASE_PATH=/opt/pabawi/data/pabawi.db

# Bolt
BOLT_PROJECT_PATH=/opt/pabawi/bolt-project
BOLT_EXECUTION_TIMEOUT=300000
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST='["uptime","df -h","free -m"]'
COMMAND_WHITELIST_MATCH_MODE=exact

# PuppetDB (example)
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_SSL_CA=/opt/pabawi/certs/ca.pem
PUPPETDB_SSL_CERT=/opt/pabawi/certs/client.crt
PUPPETDB_SSL_KEY=/opt/pabawi/certs/client.key

# Hiera (example)
HIERA_ENABLED=true
HIERA_CONTROL_REPO_PATH=/opt/pabawi/control-repo

# Safety
ALLOW_DESTRUCTIVE_PROVISIONING=false
```

See [configuration.md](../configuration.md) for all available variables.

## SSL Certificate Setup

Copy Puppet SSL certs from the Puppetserver host:

```bash
mkdir -p ./certs
scp puppet.example.com:/etc/puppetlabs/puppet/ssl/certs/ca.pem ./certs/
scp puppet.example.com:/etc/puppetlabs/puppet/ssl/certs/pabawi.pem ./certs/client.crt
scp puppet.example.com:/etc/puppetlabs/puppet/ssl/private_keys/pabawi.pem ./certs/client.key
chmod 644 ./certs/ca.pem ./certs/client.crt
chmod 600 ./certs/client.key
```

## Troubleshooting

```bash
# View logs
docker logs pabawi -f

# Enter the container
docker exec -it pabawi /bin/sh

# Check health
curl http://localhost:3000/api/health
```

| Problem | Fix |
|---|---|
| Permission denied on volume | Check ownership (`chown -R 1001:1001 ./data`) and mode |
| "Bolt project not found" | Check `BOLT_PROJECT_PATH` is `/opt/pabawi/bolt-project` (container path) |
| SSL errors | Verify cert permissions (600) and that CA matches the server cert |
| Container exits immediately | Check `docker logs pabawi` for config validation errors |
