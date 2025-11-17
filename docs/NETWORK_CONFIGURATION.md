# Network Configuration Guide

This guide explains how to configure the application to listen on different network interfaces.

## Default Behavior

- **NPM/Development**: Listens on `localhost` (127.0.0.1) - only accessible from the same machine
- **Docker**: Listens on `0.0.0.0` (all interfaces) - required for Docker port mapping to work

## Configuration

The application uses the `HOST` environment variable to control which network interface to bind to.

### Option 1: NPM Execution (Development)

#### Listen on localhost (default - recommended for security)

```bash
# In backend/.env or root .env
HOST=localhost
PORT=3000

# Run the application
cd backend
npm run dev
```

The server will be accessible at: `http://localhost:3000`

#### Listen on all interfaces (accessible from network)

```bash
# In backend/.env or root .env
HOST=0.0.0.0
PORT=3000

# Run the application
cd backend
npm run dev
```

The server will be accessible at: `http://<your-ip>:3000`

#### One-time override

```bash
# Temporary override without changing .env
HOST=localhost PORT=3000 npm run dev

# Or for all interfaces
HOST=0.0.0.0 PORT=3000 npm run dev
```

### Option 2: Docker Execution

#### Using docker-compose (recommended)

The `docker-compose.yml` is already configured to listen on `0.0.0.0` inside the container (required for Docker networking).

```bash
# Start with docker-compose
docker-compose up

# Or in detached mode
docker-compose up -d
```

The server will be accessible at: `http://localhost:3000` (mapped from container)

To change the external port:

```bash
# Edit docker-compose.yml or use environment variable
PORT=8080 docker-compose up
```

#### Using Docker directly

```bash
# Build the image
docker build -t pabawi:latest .

# Run with default settings (listens on 0.0.0.0 inside container)
docker run -p 3000:3000 \
  -v $(pwd)/data:/data \
  -v $(pwd)/test-bolt-project:/bolt-project:ro \
  pabawi:latest

# Run on different port
docker run -p 8080:3000 \
  -v $(pwd)/data:/data \
  -v $(pwd)/test-bolt-project:/bolt-project:ro \
  pabawi:latest
```

#### Override Docker host binding (advanced)

If you need to change the host binding inside the container:

```bash
# Listen on localhost only (won't work with Docker port mapping!)
docker run -p 3000:3000 \
  -e HOST=localhost \
  -v $(pwd)/data:/data \
  -v $(pwd)/test-bolt-project:/bolt-project:ro \
  pabawi:latest

# Listen on specific interface
docker run -p 3000:3000 \
  -e HOST=172.17.0.1 \
  -v $(pwd)/data:/data \
  -v $(pwd)/test-bolt-project:/bolt-project:ro \
  pabawi:latest
```

**Note**: Setting `HOST=localhost` in Docker will prevent external access even with port mapping. Keep it as `0.0.0.0` for Docker deployments.

## Security Considerations

### Development (NPM)

- Use `HOST=localhost` to prevent network access
- Only your local machine can access the application
- Recommended for development on untrusted networks

### Production (Docker)

- Docker containers need `HOST=0.0.0.0` for port mapping to work
- Use firewall rules to restrict access
- Consider using a reverse proxy (nginx, traefik) for additional security
- Enable HTTPS/TLS for production deployments

## Troubleshooting

### Cannot access server from browser

1. Check if server is running:

   ```bash
   # Look for "Backend server running on localhost:3000"
   ```

2. Verify the host configuration:

   ```bash
   # Check environment variables
   echo $HOST
   echo $PORT
   ```

3. Test with curl:

   ```bash
   # Test localhost
   curl http://localhost:3000/api/health
   
   # Test all interfaces (if HOST=0.0.0.0)
   curl http://127.0.0.1:3000/api/health
   ```

### Docker container not accessible

1. Verify container is running:

   ```bash
   docker ps
   ```

2. Check port mapping:

   ```bash
   docker port pabawi-dev
   ```

3. Verify HOST is set to 0.0.0.0:

   ```bash
   docker exec pabawi-dev env | grep HOST
   ```

4. Check container logs:

   ```bash
   docker logs pabawi-dev
   ```

### Port already in use

```bash
# Find process using the port
lsof -i :3000

# Kill the process (replace PID)
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev
```

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `localhost` (npm)<br>`0.0.0.0` (docker) | Network interface to bind to |
| `PORT` | `3000` | Port number to listen on |
| `NODE_ENV` | `development` | Environment mode |

## Examples

### Scenario 1: Local development (secure)

```bash
# backend/.env
HOST=localhost
PORT=3000

npm run dev
# Access: http://localhost:3000
```

### Scenario 2: Testing from mobile device on same network

```bash
# backend/.env
HOST=0.0.0.0
PORT=3000

npm run dev
# Access: http://192.168.1.100:3000 (your machine's IP)
```

### Scenario 3: Docker production deployment

```bash
# docker-compose.yml already configured
docker-compose up -d
# Access: http://localhost:3000 (or your server's IP)
```

### Scenario 4: Multiple instances

```bash
# Terminal 1
HOST=localhost PORT=3000 npm run dev

# Terminal 2
HOST=localhost PORT=3001 npm run dev
```
