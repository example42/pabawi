#!/usr/bin/env bash
# Pabawi Interactive Setup Script
# Run this after cloning the repository to configure, install, and start the application.
set -euo pipefail

# ── Colours & helpers ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { printf "${CYAN}ℹ ${RESET}%s\n" "$*"; }
success() { printf "${GREEN}✔ ${RESET}%s\n" "$*"; }
warn()    { printf "${YELLOW}⚠ ${RESET}%s\n" "$*"; }
error()   { printf "${RED}✖ ${RESET}%s\n" "$*"; }
header()  { printf "\n${BOLD}${CYAN}── %s ──${RESET}\n\n" "$*"; }

# Resolve project root (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/backend/.env"

# ── Pre-flight checks ───────────────────────────────────────────────────────
header "Pabawi Setup"

# Check Node.js
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Please install Node.js 18+ and try again."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if (( NODE_MAJOR < 18 )); then
  error "Node.js 18+ is required (found v${NODE_VERSION})."
  exit 1
fi
success "Node.js v${NODE_VERSION} detected"

# Check npm
if ! command -v npm &>/dev/null; then
  error "npm is not found. Please install npm and try again."
  exit 1
fi
success "npm $(npm -v) detected"

# Check Bolt CLI
if command -v bolt &>/dev/null; then
  BOLT_AVAILABLE=true
  success "Bolt $(bolt --version 2>/dev/null | head -1) detected"
else
  BOLT_AVAILABLE=false
  warn "Bolt CLI not found — Bolt integration will default to disabled"
fi

# Check Puppet / OpenVox agent
PUPPET_SSL_DIR="/etc/puppetlabs/puppet/ssl"
if command -v puppet &>/dev/null; then
  PUPPET_AVAILABLE=true
  success "Puppet $(puppet --version 2>/dev/null) detected"
elif command -v openvox &>/dev/null; then
  PUPPET_AVAILABLE=true
  success "OpenVox $(openvox --version 2>/dev/null) detected"
else
  PUPPET_AVAILABLE=false
  warn "Puppet/OpenVox agent not found — PuppetDB & Puppetserver integrations will default to disabled"
fi

# Detect SSL certs when puppet agent is available
PUPPET_SSL_CA=""
PUPPET_SSL_CERT=""
PUPPET_SSL_KEY=""
if [[ "$PUPPET_AVAILABLE" == "true" && -d "$PUPPET_SSL_DIR" ]]; then
  PUPPET_SSL_CA="${PUPPET_SSL_DIR}/certs/ca.pem"
  HOST_CERT="${PUPPET_SSL_DIR}/certs/$(hostname -f 2>/dev/null || hostname).pem"
  HOST_KEY="${PUPPET_SSL_DIR}/private_keys/$(hostname -f 2>/dev/null || hostname).pem"
  if [[ -f "$HOST_CERT" ]]; then PUPPET_SSL_CERT="$HOST_CERT"; fi
  if [[ -f "$HOST_KEY" ]];  then PUPPET_SSL_KEY="$HOST_KEY"; fi
  if [[ -n "$PUPPET_SSL_CERT" && -n "$PUPPET_SSL_KEY" ]]; then
    success "Puppet SSL certs found in ${PUPPET_SSL_DIR}"
  else
    warn "Puppet SSL directory exists but host certs not found — will skip SSL config"
    PUPPET_SSL_CA=""
    PUPPET_SSL_CERT=""
    PUPPET_SSL_KEY=""
  fi
fi

# Check Ansible CLI
if command -v ansible &>/dev/null; then
  ANSIBLE_AVAILABLE=true
  success "Ansible $(ansible --version 2>/dev/null | head -1 | awk '{print $NF}' | tr -d '[]') detected"
else
  ANSIBLE_AVAILABLE=false
  warn "Ansible CLI not found — Ansible integration will default to disabled"
fi

# ── Helper: prompt with default ──────────────────────────────────────────────
# Usage: ask VARNAME "Prompt text" "default_value"
ask() {
  local varname="$1" prompt="$2" default="${3:-}"
  local value
  if [[ -n "$default" ]]; then
    printf "${BOLD}%s${RESET} [${GREEN}%s${RESET}]: " "$prompt" "$default"
  else
    printf "${BOLD}%s${RESET}: " "$prompt"
  fi
  read -r value
  value="${value:-$default}"
  eval "$varname=\"\$value\""
}

# Usage: ask_yn VARNAME "Prompt text" "y/n default"
ask_yn() {
  local varname="$1" prompt="$2" default="${3:-n}"
  local hint value
  if [[ "$default" == "y" ]]; then hint="Y/n"; else hint="y/N"; fi
  printf "${BOLD}%s${RESET} [${GREEN}%s${RESET}]: " "$prompt" "$hint"
  read -r value
  value="${value:-$default}"
  case "$value" in
    [yY]*) eval "$varname=true" ;;
    *)     eval "$varname=false" ;;
  esac
}

# ── Check for existing .env ─────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  warn "An existing backend/.env file was found."
  ask_yn OVERWRITE "Overwrite it?" "n"
  if [[ "$OVERWRITE" != "true" ]]; then
    info "Keeping existing .env file."
    SKIP_ENV=true
  else
    SKIP_ENV=false
  fi
else
  SKIP_ENV=false
fi

# ── Sample Data Mode Selection ──────────────────────────────────────────────
SAMPLE_MODE=""
BOLT_SAMPLE_PATH=""
ANSIBLE_SAMPLE_PATH=""
ANSIBLE_SAMPLE_INVENTORY=""
SSH_SAMPLE_PATH=""
HIERA_SAMPLE_PATH=""

if [[ "$SKIP_ENV" != "true" ]]; then
  header "Sample Data"
  info "Pabawi ships with sample inventories for demo and development."
  echo ""
  echo "  1) ${BOLD}Default samples${RESET}      – Realistic multi-tier infrastructure (~80 nodes)"
  echo "  2) ${BOLD}Stress test samples${RESET}   – Large-scale inventories for UI stress testing (2,000+ nodes)"
  echo "  3) ${BOLD}Custom directories${RESET}    – Provide your own paths to Bolt/Ansible/SSH/Hiera"
  echo ""
  printf "${BOLD}Choose sample mode [1/2/3]${RESET} [${GREEN}1${RESET}]: "
  read -r SAMPLE_MODE
  SAMPLE_MODE="${SAMPLE_MODE:-1}"

  case "$SAMPLE_MODE" in
    1)
      success "Using default sample integrations (samples/integrations/)"
      BOLT_SAMPLE_PATH="./samples/integrations/bolt"
      ANSIBLE_SAMPLE_PATH="./samples/integrations/ansible"
      ANSIBLE_SAMPLE_INVENTORY="./samples/integrations/ansible/inventory/hosts.yml"
      SSH_SAMPLE_PATH="./samples/integrations/ssh/config"
      HIERA_SAMPLE_PATH="./samples/integrations/puppet"
      ;;
    2)
      success "Using stress test samples (samples/stresstest/)"
      BOLT_SAMPLE_PATH="./samples/stresstest/bolt"
      ANSIBLE_SAMPLE_PATH="./samples/stresstest/ansible"
      ANSIBLE_SAMPLE_INVENTORY="./samples/stresstest/ansible/inventory/hosts.yml"
      SSH_SAMPLE_PATH="./samples/stresstest/ssh/config"
      HIERA_SAMPLE_PATH="./samples/integrations/puppet"
      info "Stress test samples do not include Puppet/Hiera data. Configure Hiera manually if needed."
      # Offer to regenerate with a custom count
      ask_yn REGEN_STRESS "Regenerate stress test inventories with a custom node count?" "n"
      if [[ "$REGEN_STRESS" == "true" ]]; then
        ask STRESS_NODE_COUNT "Number of nodes to generate" "2000"
        info "Generating ${STRESS_NODE_COUNT} nodes…"
        if command -v node &>/dev/null; then
          node "$PROJECT_ROOT/samples/stresstest/generate.js" "$STRESS_NODE_COUNT"
          success "Stress test inventories regenerated with ${STRESS_NODE_COUNT} nodes"
        else
          error "Node.js required to regenerate. Using pre-generated files."
        fi
      fi
      ;;
    3)
      success "Custom directories — you'll configure paths in the integration prompts below."
      ;;
    *)
      warn "Invalid choice, using default samples."
      SAMPLE_MODE="1"
      BOLT_SAMPLE_PATH="./samples/integrations/bolt"
      ANSIBLE_SAMPLE_PATH="./samples/integrations/ansible"
      ANSIBLE_SAMPLE_INVENTORY="./samples/integrations/ansible/inventory/hosts.yml"
      SSH_SAMPLE_PATH="./samples/integrations/ssh/config"
      HIERA_SAMPLE_PATH="./samples/integrations/puppet"
      ;;
  esac
fi

# ── Generate backend/.env ───────────────────────────────────────────────────
if [[ "$SKIP_ENV" != "true" ]]; then
  header "Core Configuration"

  ask PORT "Server port" "3000"
  ask HOST "Host address (use 0.0.0.0 to listen on all interfaces)" "localhost"
  ask LOG_LEVEL "Log level (error, warn, info, debug)" "info"

  # ── Integrations ─────────────────────────────────────────────────────────
  header "Integrations"

  # ── Bolt integration ─────────────────────────────────────────────────────
  if [[ "$BOLT_AVAILABLE" == "true" ]]; then
    BOLT_DEFAULT="y"
  else
    BOLT_DEFAULT="n"
  fi
  ask_yn BOLT_ENABLED "Enable Bolt integration?" "$BOLT_DEFAULT"
  BOLT_PROJECT_PATH="."
  COMMAND_WHITELIST_ALLOW_ALL="false"
  COMMAND_WHITELIST='["ls","pwd","whoami","uptime","cat","df","free"]'
  if [[ "$BOLT_ENABLED" == "true" ]]; then
    bolt_default="${BOLT_SAMPLE_PATH:-./samples/integrations/bolt}"
    if [[ "$SAMPLE_MODE" == "3" ]]; then
      ask BOLT_PROJECT_PATH "Bolt project directory" "$bolt_default"
    else
      BOLT_PROJECT_PATH="$bolt_default"
      info "Bolt project path: $BOLT_PROJECT_PATH"
    fi
    ask_yn COMMAND_WHITELIST_ALLOW_ALL "Allow ALL commands? (not recommended for shared/production use)" "n"
    if [[ "$COMMAND_WHITELIST_ALLOW_ALL" != "true" ]]; then
      ask COMMAND_WHITELIST "Allowed commands (JSON array)" "$COMMAND_WHITELIST"
    fi
  fi

  # ── PuppetDB integration ─────────────────────────────────────────────────
  if [[ "$PUPPET_AVAILABLE" == "true" ]]; then
    PUPPETDB_DEFAULT="y"
  else
    PUPPETDB_DEFAULT="n"
  fi
  ask_yn PUPPETDB_ENABLED "Enable PuppetDB integration?" "$PUPPETDB_DEFAULT"
  PUPPETDB_SERVER_URL=""
  PUPPETDB_TOKEN=""
  PUPPETDB_SSL_ENABLED="false"
  PUPPETDB_SSL_CA_VAL=""
  PUPPETDB_SSL_CERT_VAL=""
  PUPPETDB_SSL_KEY_VAL=""
  PUPPETDB_PORT="8081"
  if [[ "$PUPPETDB_ENABLED" == "true" ]]; then
    ask PUPPETDB_SERVER_URL "PuppetDB server URL" "https://$(hostname -f 2>/dev/null || hostname)"
    ask PUPPETDB_PORT "PuppetDB port" "8081"
    ask PUPPETDB_TOKEN "PuppetDB token (leave empty if using SSL certs)" ""
    if [[ -n "$PUPPET_SSL_CERT" ]]; then
      ask_yn PUPPETDB_SSL_ENABLED "Use Puppet SSL certs for PuppetDB?" "y"
      if [[ "$PUPPETDB_SSL_ENABLED" == "true" ]]; then
        ask PUPPETDB_SSL_CA_VAL "SSL CA path" "$PUPPET_SSL_CA"
        ask PUPPETDB_SSL_CERT_VAL "SSL cert path" "$PUPPET_SSL_CERT"
        ask PUPPETDB_SSL_KEY_VAL "SSL key path" "$PUPPET_SSL_KEY"
      fi
    fi
  fi

  # ── Puppetserver integration ─────────────────────────────────────────────
  if [[ "$PUPPET_AVAILABLE" == "true" ]]; then
    PUPPETSERVER_DEFAULT="y"
  else
    PUPPETSERVER_DEFAULT="n"
  fi
  ask_yn PUPPETSERVER_ENABLED "Enable Puppetserver integration?" "$PUPPETSERVER_DEFAULT"
  PUPPETSERVER_SERVER_URL=""
  PUPPETSERVER_TOKEN=""
  PUPPETSERVER_SSL_ENABLED="false"
  PUPPETSERVER_SSL_CA_VAL=""
  PUPPETSERVER_SSL_CERT_VAL=""
  PUPPETSERVER_SSL_KEY_VAL=""
  PUPPETSERVER_PORT="8140"
  if [[ "$PUPPETSERVER_ENABLED" == "true" ]]; then
    ask PUPPETSERVER_SERVER_URL "Puppetserver URL" "https://$(hostname -f 2>/dev/null || hostname)"
    ask PUPPETSERVER_PORT "Puppetserver port" "8140"
    ask PUPPETSERVER_TOKEN "Puppetserver token (leave empty if using SSL certs)" ""
    if [[ -n "$PUPPET_SSL_CERT" ]]; then
      ask_yn PUPPETSERVER_SSL_ENABLED "Use Puppet SSL certs for Puppetserver?" "y"
      if [[ "$PUPPETSERVER_SSL_ENABLED" == "true" ]]; then
        ask PUPPETSERVER_SSL_CA_VAL "SSL CA path" "$PUPPET_SSL_CA"
        ask PUPPETSERVER_SSL_CERT_VAL "SSL cert path" "$PUPPET_SSL_CERT"
        ask PUPPETSERVER_SSL_KEY_VAL "SSL key path" "$PUPPET_SSL_KEY"
      fi
    fi
  fi

  # ── Hiera integration ───────────────────────────────────────────────────
  ask_yn HIERA_ENABLED "Enable Hiera integration?" "n"
  HIERA_CONTROL_REPO_PATH=""
  if [[ "$HIERA_ENABLED" == "true" ]]; then
    hiera_default="${HIERA_SAMPLE_PATH:-/etc/puppetlabs/code/environments/production}"
    if [[ "$SAMPLE_MODE" == "3" ]]; then
      ask HIERA_CONTROL_REPO_PATH "Hiera control repo path" "$hiera_default"
    else
      if [[ -n "$hiera_default" ]]; then
        HIERA_CONTROL_REPO_PATH="$hiera_default"
        info "Hiera control repo path: $HIERA_CONTROL_REPO_PATH"
      else
        ask HIERA_CONTROL_REPO_PATH "Hiera control repo path" "/etc/puppetlabs/code/environments/production"
      fi
    fi
  fi

  # ── Ansible integration ─────────────────────────────────────────────────
  if [[ "$ANSIBLE_AVAILABLE" == "true" ]]; then
    ANSIBLE_DEFAULT="y"
  else
    ANSIBLE_DEFAULT="n"
  fi
  ask_yn ANSIBLE_ENABLED "Enable Ansible integration?" "$ANSIBLE_DEFAULT"
  ANSIBLE_PROJECT_PATH=""
  ANSIBLE_INVENTORY_PATH=""
  if [[ "$ANSIBLE_ENABLED" == "true" ]]; then
    ansible_default="${ANSIBLE_SAMPLE_PATH:-./samples/integrations/ansible}"
    ansible_inv_default="${ANSIBLE_SAMPLE_INVENTORY:-./samples/integrations/ansible/inventory/hosts.yml}"
    if [[ "$SAMPLE_MODE" == "3" ]]; then
      ask ANSIBLE_PROJECT_PATH "Ansible project path" "$ansible_default"
      ask ANSIBLE_INVENTORY_PATH "Ansible inventory path" "$ansible_inv_default"
    else
      ANSIBLE_PROJECT_PATH="$ansible_default"
      ANSIBLE_INVENTORY_PATH="$ansible_inv_default"
      info "Ansible project path: $ANSIBLE_PROJECT_PATH"
      info "Ansible inventory path: $ANSIBLE_INVENTORY_PATH"
    fi
  fi

  # ── SSH integration ──────────────────────────────────────────────────────
  ask_yn SSH_ENABLED "Enable SSH integration?" "n"
  SSH_CONFIG_PATH=""
  SSH_DEFAULT_USER=""
  SSH_DEFAULT_KEY=""
  SSH_SUDO_ENABLED="false"
  if [[ "$SSH_ENABLED" == "true" ]]; then
    ssh_default="${SSH_SAMPLE_PATH:-$HOME/.ssh/config}"
    if [[ "$SAMPLE_MODE" == "3" ]]; then
      ask SSH_CONFIG_PATH "SSH config path" "$ssh_default"
    else
      SSH_CONFIG_PATH="$ssh_default"
      info "SSH config path: $SSH_CONFIG_PATH"
    fi
    ask SSH_DEFAULT_USER "Default SSH user (leave empty for current user)" ""
    ask SSH_DEFAULT_KEY "Default SSH private key path (leave empty for agent)" ""
    ask_yn SSH_SUDO_ENABLED "Enable sudo for SSH commands?" "n"
  fi

  # ── Write .env file ─────────────────────────────────────────────────────
  header "Writing backend/.env"

  cat > "$ENV_FILE" <<EOF
# Pabawi Configuration
# Generated by scripts/setup.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# See docs/configuration.md for full reference.

# ── Core ─────────────────────────────────────────────
PORT=${PORT}
HOST=${HOST}
LOG_LEVEL=${LOG_LEVEL}
DATABASE_PATH=./data/executions.db
BOLT_EXECUTION_TIMEOUT=300000

# ── Caching & Performance ───────────────────────────
CACHE_INVENTORY_TTL=30000
CACHE_FACTS_TTL=300000
CONCURRENT_EXECUTION_LIMIT=5
MAX_QUEUE_SIZE=50
EOF

  # Append Bolt integration when enabled
  if [[ "$BOLT_ENABLED" == "true" ]]; then
    cat >> "$ENV_FILE" <<EOF

# ── Bolt Integration ─────────────────────────────────
BOLT_PROJECT_PATH=${BOLT_PROJECT_PATH}
COMMAND_WHITELIST_ALLOW_ALL=${COMMAND_WHITELIST_ALLOW_ALL}
COMMAND_WHITELIST=${COMMAND_WHITELIST}
COMMAND_WHITELIST_MATCH_MODE=exact
EOF
  fi

  # Append optional integrations only when enabled
  if [[ "$PUPPETDB_ENABLED" == "true" ]]; then
    cat >> "$ENV_FILE" <<EOF

# ── PuppetDB Integration ────────────────────────────
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=${PUPPETDB_SERVER_URL}
PUPPETDB_PORT=${PUPPETDB_PORT}
EOF
    [[ -n "$PUPPETDB_TOKEN" ]] && echo "PUPPETDB_TOKEN=${PUPPETDB_TOKEN}" >> "$ENV_FILE"
    if [[ "$PUPPETDB_SSL_ENABLED" == "true" ]]; then
      cat >> "$ENV_FILE" <<EOF
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=${PUPPETDB_SSL_CA_VAL}
PUPPETDB_SSL_CERT=${PUPPETDB_SSL_CERT_VAL}
PUPPETDB_SSL_KEY=${PUPPETDB_SSL_KEY_VAL}
EOF
    fi
  fi

  if [[ "$PUPPETSERVER_ENABLED" == "true" ]]; then
    cat >> "$ENV_FILE" <<EOF

# ── Puppetserver Integration ────────────────────────
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=${PUPPETSERVER_SERVER_URL}
PUPPETSERVER_PORT=${PUPPETSERVER_PORT}
EOF
    [[ -n "$PUPPETSERVER_TOKEN" ]] && echo "PUPPETSERVER_TOKEN=${PUPPETSERVER_TOKEN}" >> "$ENV_FILE"
    if [[ "$PUPPETSERVER_SSL_ENABLED" == "true" ]]; then
      cat >> "$ENV_FILE" <<EOF
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=${PUPPETSERVER_SSL_CA_VAL}
PUPPETSERVER_SSL_CERT=${PUPPETSERVER_SSL_CERT_VAL}
PUPPETSERVER_SSL_KEY=${PUPPETSERVER_SSL_KEY_VAL}
EOF
    fi
  fi

  if [[ "$HIERA_ENABLED" == "true" ]]; then
    cat >> "$ENV_FILE" <<EOF

# ── Hiera Integration ───────────────────────────────
HIERA_ENABLED=true
HIERA_CONTROL_REPO_PATH=${HIERA_CONTROL_REPO_PATH}
EOF
  fi

  if [[ "$ANSIBLE_ENABLED" == "true" ]]; then
    cat >> "$ENV_FILE" <<EOF

# ── Ansible Integration ─────────────────────────────
ANSIBLE_ENABLED=true
ANSIBLE_PROJECT_PATH=${ANSIBLE_PROJECT_PATH}
ANSIBLE_INVENTORY_PATH=${ANSIBLE_INVENTORY_PATH}
EOF
  fi

  if [[ "$SSH_ENABLED" == "true" ]]; then
    cat >> "$ENV_FILE" <<EOF

# ── SSH Integration ──────────────────────────────────
SSH_ENABLED=true
SSH_CONFIG_PATH=${SSH_CONFIG_PATH}
SSH_DEFAULT_PORT=22
SSH_HOST_KEY_CHECK=true
SSH_CONNECTION_TIMEOUT=30
SSH_COMMAND_TIMEOUT=300
SSH_MAX_CONNECTIONS=50
SSH_MAX_CONNECTIONS_PER_HOST=5
SSH_IDLE_TIMEOUT=300
SSH_CONCURRENCY_LIMIT=10
EOF
    [[ -n "$SSH_DEFAULT_USER" ]] && echo "SSH_DEFAULT_USER=${SSH_DEFAULT_USER}" >> "$ENV_FILE"
    [[ -n "$SSH_DEFAULT_KEY" ]]  && echo "SSH_DEFAULT_KEY=${SSH_DEFAULT_KEY}" >> "$ENV_FILE"
    if [[ "$SSH_SUDO_ENABLED" == "true" ]]; then
      cat >> "$ENV_FILE" <<EOF
SSH_SUDO_ENABLED=true
SSH_SUDO_COMMAND=sudo
SSH_SUDO_PASSWORDLESS=true
SSH_SUDO_USER=root
EOF
    fi
  fi

  success "backend/.env written successfully"
fi

# ── Install dependencies ─────────────────────────────────────────────────────
header "Dependencies"

ask_yn INSTALL_DEPS "Install Node.js dependencies now?" "y"
if [[ "$INSTALL_DEPS" == "true" ]]; then
  cd "$PROJECT_ROOT"
  info "Running npm install:all (this may take a minute)…"
  npm run install:all
  success "Dependencies installed"
else
  info "Skipping dependency installation. Run ${BOLD}npm run install:all${RESET} manually before starting."
fi

# ── Create data directory ────────────────────────────────────────────────────
mkdir -p "$PROJECT_ROOT/backend/data"

# ── Start the application ────────────────────────────────────────────────────
header "Ready to Start"

echo ""
info "How would you like to start Pabawi?"
echo ""
echo "  1) ${BOLD}Development${RESET}   – Backend (port 3000) + Frontend dev server (port 5173)"
echo "  2) ${BOLD}Full-stack${RESET}    – Build frontend, serve everything from backend (port 3000)"
echo "  3) ${BOLD}Exit${RESET}          – Just finish setup, start manually later"
echo ""
printf "${BOLD}Choose [1/2/3]${RESET} [${GREEN}1${RESET}]: "
read -r START_MODE
START_MODE="${START_MODE:-1}"

case "$START_MODE" in
  1)
    header "Starting Development Servers"
    info "Backend  → http://localhost:${PORT:-3000}"
    info "Frontend → http://localhost:5173"
    echo ""
    info "Press Ctrl+C to stop both servers."
    echo ""

    # Start backend in background, frontend in foreground
    cd "$PROJECT_ROOT"
    npm run dev:backend &
    BACKEND_PID=$!

    # Give the backend a moment to start
    sleep 2

    # Trap to cleanly stop backend when the script is interrupted
    cleanup() {
      echo ""
      info "Shutting down…"
      kill "$BACKEND_PID" 2>/dev/null || true
      wait "$BACKEND_PID" 2>/dev/null || true
      success "Servers stopped."
    }
    trap cleanup EXIT INT TERM

    npm run dev:frontend
    ;;

  2)
    header "Building & Starting Full-Stack"
    cd "$PROJECT_ROOT"
    info "Building frontend…"
    npm run build:frontend
    info "Copying frontend assets…"
    npm run copy:frontend
    info "Starting server on http://localhost:${PORT:-3000}"
    echo ""
    npm run dev:backend
    ;;

  3)
    echo ""
    success "Setup complete!"
    echo ""
    info "Start development servers:  ${BOLD}npm run dev:backend${RESET}  and  ${BOLD}npm run dev:frontend${RESET}"
    info "Or full-stack build:        ${BOLD}npm run dev:fullstack${RESET}"
    echo ""
    ;;

  *)
    warn "Invalid choice — exiting without starting."
    echo ""
    success "Setup complete! Start manually with npm run dev:backend / dev:frontend."
    ;;
esac
