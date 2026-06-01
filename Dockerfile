# Stage 1: Build frontend with Vite
FROM --platform=$BUILDPLATFORM node:20-bookworm-slim AS frontend-builder
ARG TARGETPLATFORM
ARG BUILDPLATFORM

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
FROM --platform=$BUILDPLATFORM node:20-bookworm-slim AS backend-builder
ARG TARGETPLATFORM
ARG BUILDPLATFORM

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install --no-audit

# Copy backend source
COPY backend/ ./

# Build backend
RUN npm run build

# Stage 2.5: Install backend production dependencies
# This runs on the target platform to ensure native modules (like sqlite3) are built correctly
FROM node:20-bookworm-slim AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev --no-audit

# Stage 3: Install OpenBolt from OpenVox upstream packages
FROM node:20-bookworm-slim AS bolt-builder

# hadolint ignore=DL3008
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && curl -sO https://apt.voxpupuli.org/openvox8-release-debian12.deb \
    && dpkg -i openvox8-release-debian12.deb \
    && rm openvox8-release-debian12.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends openbolt \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Stage 4: Production image
FROM node:20-bookworm-slim
ARG TARGETPLATFORM
ARG BUILDPLATFORM

# Add metadata labels
LABEL org.opencontainers.image.title="Pabawi"
LABEL org.opencontainers.image.description="Puppet Ansible Bolt Awesome Web Interface"
LABEL org.opencontainers.image.version="1.3.0"
LABEL org.opencontainers.image.vendor="example42"
LABEL org.opencontainers.image.source="https://github.com/example42/pabawi"

# Install only runtime dependencies
# hadolint ignore=DL3008
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    bash \
    openssh-client \
    git \
    coreutils \
    ansible \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Copy Bolt installation from upstream package builder stage
COPY --from=bolt-builder /opt/puppetlabs /opt/puppetlabs
RUN ln -s /opt/puppetlabs/bolt/bin/bolt /usr/local/bin/bolt

# Create non-root user
RUN groupadd -g 1001 pabawi && \
    useradd -u 1001 -g pabawi -m -s /bin/bash pabawi

# Create application directory
WORKDIR /app

# Copy built backend
COPY --from=backend-builder --chown=pabawi:pabawi /app/backend/dist ./dist
COPY --from=backend-deps --chown=pabawi:pabawi /app/backend/node_modules ./node_modules
COPY --from=backend-builder --chown=pabawi:pabawi /app/backend/package*.json ./

# Copy only database migrations (not copied by TypeScript compiler)
# This avoids copying TypeScript sources into the runtime image
COPY --from=backend-builder --chown=pabawi:pabawi /app/backend/src/database/migrations ./dist/database/migrations

# Copy built frontend to public directory
COPY --from=frontend-builder --chown=pabawi:pabawi /app/frontend/dist ./public

# Create /opt/pabawi directory tree for all runtime data
RUN mkdir -p /opt/pabawi/data \
             /opt/pabawi/bolt-project \
             /opt/pabawi/control-repo \
             /opt/pabawi/ansible \
             /opt/pabawi/certs \
             /opt/pabawi/ssh \
    && chown -R pabawi:pabawi /opt/pabawi

# Copy entrypoint script
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Switch to non-root user
USER pabawi

ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/opt/pabawi/data/pabawi.db \
    BOLT_PROJECT_PATH=/opt/pabawi/bolt-project \
    HIERA_CONTROL_REPO_PATH=/opt/pabawi/control-repo \
    ANSIBLE_PROJECT_PATH=/opt/pabawi/ansible \
    SSH_CONFIG_PATH=/opt/pabawi/ssh/config \
    SSH_DEFAULT_KEY=/opt/pabawi/ssh/id_rsa \
    # Integration settings (disabled by default)
    PUPPETDB_ENABLED=false \
    PUPPETSERVER_ENABLED=false \
    HIERA_ENABLED=false \
    ANSIBLE_ENABLED=false \
    PROXMOX_ENABLED=false \
    AWS_ENABLED=false \
    SSH_ENABLED=false

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/server.js"]
