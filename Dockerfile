# Stage 1: Build frontend with Vite
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm install --no-audit

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# Stage 2: Build backend TypeScript
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install --no-audit

# Copy backend source
COPY backend/ ./

# Build backend
RUN npm run build

# Stage 3: Production image with Node.js and Bolt CLI
FROM node:20-alpine

# Install Bolt CLI
RUN apk add --no-cache \
    ruby \
    ruby-dev \
    build-base \
    && gem install bolt --no-document \
    && apk del build-base ruby-dev

# Create non-root user
RUN addgroup -g 1001 -S pabawi && \
    adduser -u 1001 -S pabawi -G pabawi

# Create application directory
WORKDIR /app

# Copy built backend
COPY --from=backend-builder --chown=pabawi:pabawi /app/backend/dist ./dist
COPY --from=backend-builder --chown=pabawi:pabawi /app/backend/node_modules ./node_modules
COPY --from=backend-builder --chown=pabawi:pabawi /app/backend/package*.json ./

# Copy SQL schema file (not copied by TypeScript compiler)
COPY --from=backend-builder --chown=pabawi:pabawi /app/backend/src/database/schema.sql ./dist/database/

# Copy built frontend to public directory
COPY --from=frontend-builder --chown=pabawi:pabawi /app/frontend/dist ./public

# Create data directory for SQLite database
RUN mkdir -p /data && chown pabawi:pabawi /data

# Create bolt-project directory
RUN mkdir -p /bolt-project && chown pabawi:pabawi /bolt-project

# Switch to non-root user
USER pabawi

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/executions.db \
    BOLT_PROJECT_PATH=/bolt-project

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/server.js"]
