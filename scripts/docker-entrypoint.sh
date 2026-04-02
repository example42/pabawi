#!/bin/bash
set -e

# Create data directory if it doesn't exist (e.g., fresh volume mount)
if [ ! -d /data ]; then
    mkdir -p /data
fi

# Ensure data directory is writable
if [ ! -w /data ]; then
    echo "Error: /data directory is not writable by user $(id -u)"
    echo "Please ensure the mounted volume has correct permissions:"
    echo "  sudo chown -R 1001:1001 /path/to/data"
    exit 1
fi

# Create database file if it doesn't exist
if [ ! -f /data/pabawi.db ]; then
    touch /data/pabawi.db
fi

# Execute the main command
exec "$@"
