# Locked workspace builds; native addons are compiled on the target platform.
FROM --platform=$BUILDPLATFORM node:24.21.0-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY scripts/supply-chain/install-approved.mjs ./scripts/supply-chain/install-approved.mjs
ENV npm_config_build_from_source=true npm_config_nodedir=/usr/local
RUN npm ci --ignore-scripts --no-audit --no-fund && npm run install:approved
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY scripts/compilation/backend.mjs ./scripts/compilation/backend.mjs
RUN npm run build:frontend && npm run build:backend
RUN npm sbom --workspace=frontend --omit=dev --sbom-format=cyclonedx > frontend.cdx.json

FROM node:24.21.0-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS backend-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY scripts/supply-chain/install-approved.mjs ./scripts/supply-chain/install-approved.mjs
ENV npm_config_build_from_source=true npm_config_nodedir=/usr/local
RUN npm ci --workspace=backend --omit=dev --ignore-scripts --no-audit --no-fund && npm run install:approved
# Keep both hoisted and workspace-local packages in their locked locations.
RUN mkdir -p backend/node_modules

# Stage 3: Install OpenBolt from OpenVox upstream packages
FROM node:24.21.0-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS bolt-builder

# hadolint ignore=DL3008
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && curl -fsSLO https://apt.voxpupuli.org/openvox8-release-debian12.deb \
    && echo "f10b71b2317c2a919ef1c00a2b5d2d00ac825632323f801601466a9200dc3122  openvox8-release-debian12.deb" | sha256sum -c - \
    && dpkg -i openvox8-release-debian12.deb \
    && rm openvox8-release-debian12.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends openbolt=5.6.0-1+debian12 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Stage 4: Production image
FROM node:24.21.0-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
ARG TARGETPLATFORM
ARG BUILDPLATFORM

# Add metadata labels
LABEL org.opencontainers.image.title="Pabawi"
LABEL org.opencontainers.image.description="Puppet Ansible Bolt Awesome Web Interface"
LABEL org.opencontainers.image.version="1.5.0"
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
WORKDIR /app/backend

# Copy built backend
COPY --from=backend-deps /app/package.json /app/.npmrc /app/
COPY --from=backend-deps /app/package-lock.json /app/root-lock.json
COPY --from=build /app/frontend.cdx.json /app/sbom/frontend.cdx.json
COPY --from=build --chown=pabawi:pabawi /app/backend/dist ./dist
COPY --from=backend-deps --chown=pabawi:pabawi /app/node_modules /app/node_modules
COPY --from=backend-deps --chown=pabawi:pabawi /app/backend/node_modules ./node_modules
COPY --from=build --chown=pabawi:pabawi /app/backend/package.json ./

# Copy only database migrations (not copied by TypeScript compiler)
# This avoids copying TypeScript sources into the runtime image
COPY --from=build --chown=pabawi:pabawi /app/backend/src/database/migrations ./dist/database/migrations

# Copy built frontend to public directory
COPY --from=build --chown=pabawi:pabawi /app/frontend/dist ./public

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
