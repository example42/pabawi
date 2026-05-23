#!/bin/bash
set -e

# Base directory for all Pabawi data
PABAWI_BASE="${PABAWI_BASE:-/opt/pabawi}"
DATA_DIR="${PABAWI_BASE}/data"

# Database backend: sqlite (default) or postgres. ConfigService validates
# this at startup; we only inspect it here to decide whether to provision
# the SQLite file.
DB_TYPE="${DB_TYPE:-sqlite}"

if [ "${DB_TYPE}" = "sqlite" ]; then
    # Create data directory if it doesn't exist (e.g., fresh volume mount)
    if [ ! -d "${DATA_DIR}" ]; then
        mkdir -p "${DATA_DIR}"
    fi

    # Ensure data directory is writable
    if [ ! -w "${DATA_DIR}" ]; then
        echo "Error: ${DATA_DIR} directory is not writable by user $(id -u)"
        echo "Please ensure the mounted volume has correct permissions:"
        echo "  sudo chown -R 1001:1001 ${DATA_DIR}"
        exit 1
    fi

    # Create database file if it doesn't exist
    DB_FILE="${DATABASE_PATH:-${DATA_DIR}/pabawi.db}"
    if [ ! -f "${DB_FILE}" ]; then
        touch "${DB_FILE}"
    fi
fi

# Execute the main command
exec "$@"
