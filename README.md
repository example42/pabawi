# Pabawi

Version 0.1.0 - Web interface for Bolt automation tool

## Project Structure

```
pabawi/
├── frontend/          # Svelte 5 + Vite frontend
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── backend/           # Node.js + TypeScript API server
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
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
- **Frontend UI**: http://localhost:5173 (Main application interface)
- **Backend API**: http://localhost:3000/api (API endpoints)

**Production Mode** (Docker or built application):
- **Application**: http://localhost:3000 (Frontend and API served together)
- The backend serves the built frontend as static files

## Build

```bash
# Build both frontend and backend
npm run build
```

## Configuration

Copy `backend/.env.example` to `backend/.env` and configure:

```env
PORT=3000
BOLT_PROJECT_PATH=.
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST=["ls","pwd","whoami"]
EXECUTION_TIMEOUT=300000
LOG_LEVEL=info
DATABASE_PATH=./data/executions.db
```

## Testing

```bash
npm test
```

## Docker Deployment

### Building the Docker Image

```bash
docker build -t pabawi:latest .
```

### Running with Docker

```bash
# Using the provided script
./scripts/docker-run.sh

# Or manually
docker run -d \
  --name pabawi \
  -p 3000:3000 \
  -v $(pwd)/test-bolt-project:/bolt-project:ro \
  -v $(pwd)/data:/data \
  -e COMMAND_WHITELIST_ALLOW_ALL=false \
  pabawi:latest
```

Access the application at http://localhost:3000

### Running with Docker Compose

```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

Access the application at http://localhost:3000

### Environment Variables

Copy `.env.example` to `.env` and configure as needed. Key variables:

- `PORT`: Application port (default: 3000)
- `BOLT_PROJECT_PATH`: Path to Bolt project directory
- `COMMAND_WHITELIST_ALLOW_ALL`: Allow all commands (default: false)
- `COMMAND_WHITELIST`: JSON array of allowed commands
- `EXECUTION_TIMEOUT`: Timeout in milliseconds (default: 300000)
- `LOG_LEVEL`: Logging level (default: info)

### Volume Mounts

- `/bolt-project`: Mount your Bolt project directory (read-only)
- `/data`: Persistent storage for SQLite database

### Troubleshooting

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

## Documentation

See `docs/` directory for detailed documentation.
