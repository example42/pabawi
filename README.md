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

## Documentation

See `docs/` directory for detailed documentation.
