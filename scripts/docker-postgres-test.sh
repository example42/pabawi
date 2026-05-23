#!/usr/bin/env bash
# =============================================================================
# Pabawi — PostgreSQL test harness
# =============================================================================
# Builds the app image from local source, brings up an isolated Docker
# Compose stack with PostgreSQL, and verifies the app reaches a healthy
# state. Useful when the published example42/pabawi:latest image lags
# behind main and lacks PostgreSQL migration support.
#
# Subcommands:
#   start     Build the image, start the stack, wait until healthy,
#             hit /api/health, and exit 0 on success.
#   stop      Stop the stack and remove containers (image and volumes
#             retained).
#   destroy   Stop the stack, remove volumes, and delete the built image.
#   status    Show docker compose ps for the stack.
#   logs      Follow logs for the stack.
#   help      Print this usage.
#
# Environment overrides (rare):
#   COMPOSE_PROJECT  Compose project name. Default: pabawi-postgres-test
#   IMAGE_TAG        Built image tag. Default: pabawi:postgres-test
#   APP_PORT         Host port for the app. Default: 3001
#                    (also set as HOST_APP_PORT in docker-postgres-test.env;
#                    keep them in sync)
#   READY_TIMEOUT    Seconds to wait for app health. Default: 180
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-postgres-test.compose.yml"
ENV_FILE="${SCRIPT_DIR}/docker-postgres-test.env"

COMPOSE_PROJECT="${COMPOSE_PROJECT:-pabawi-postgres-test}"
IMAGE_TAG="${IMAGE_TAG:-pabawi:postgres-test}"
APP_PORT="${APP_PORT:-3001}"
READY_TIMEOUT="${READY_TIMEOUT:-180}"

# --- output ------------------------------------------------------------------
if [ -t 1 ]; then
    C_RED=$'\033[0;31m'
    C_GREEN=$'\033[0;32m'
    C_YELLOW=$'\033[1;33m'
    C_BOLD=$'\033[1m'
    C_RESET=$'\033[0m'
else
    C_RED=""; C_GREEN=""; C_YELLOW=""; C_BOLD=""; C_RESET=""
fi

log()  { printf '%s[pgtest]%s %s\n' "${C_BOLD}" "${C_RESET}" "$*"; }
ok()   { printf '%s[pgtest] OK%s %s\n' "${C_GREEN}" "${C_RESET}" "$*"; }
warn() { printf '%s[pgtest] WARN%s %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
err()  { printf '%s[pgtest] ERR%s %s\n' "${C_RED}" "${C_RESET}" "$*" >&2; }

# --- helpers -----------------------------------------------------------------
require_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        err "docker is not installed or not on PATH."
        exit 2
    fi
    if ! docker compose version >/dev/null 2>&1; then
        err "docker compose v2 plugin is required (try \`docker compose version\`)."
        exit 2
    fi
}

# Wrapper around `docker compose` with the harness's project + files baked in.
dc() {
    docker compose \
        --project-name "${COMPOSE_PROJECT}" \
        --file "${COMPOSE_FILE}" \
        --env-file "${ENV_FILE}" \
        "$@"
}

usage() {
    sed -n '2,/^# ===/p' "$0" | sed 's/^# \{0,1\}//;s/^=.*$//' | head -n 30
}

# --- subcommands -------------------------------------------------------------
cmd_start() {
    require_docker
    log "building image ${IMAGE_TAG} from ${SCRIPT_DIR%/scripts}/Dockerfile"
    dc build app

    log "starting stack (project=${COMPOSE_PROJECT})"
    dc up --detach --wait --wait-timeout "${READY_TIMEOUT}" || {
        err "stack failed to reach a healthy state within ${READY_TIMEOUT}s"
        log "recent app logs:"
        dc logs --tail 80 app || true
        log "recent postgres logs:"
        dc logs --tail 40 postgres || true
        exit 1
    }

    log "verifying GET http://localhost:${APP_PORT}/api/health"
    local body http_code
    if ! body=$(curl --silent --show-error --max-time 10 \
        --write-out $'\n%{http_code}' \
        "http://localhost:${APP_PORT}/api/health"); then
        err "curl to /api/health failed"
        dc logs --tail 80 app || true
        exit 1
    fi
    http_code="${body##*$'\n'}"
    body="${body%$'\n'*}"

    if [ "${http_code}" != "200" ]; then
        err "/api/health returned HTTP ${http_code}"
        printf '%s\n' "${body}"
        exit 1
    fi

    if ! printf '%s' "${body}" | grep -q '"status":"ok"'; then
        err "/api/health did not report status=ok:"
        printf '%s\n' "${body}"
        exit 1
    fi

    ok "app is healthy on http://localhost:${APP_PORT} (postgres backend)"
    log "stack status:"
    dc ps
}

cmd_stop() {
    require_docker
    log "stopping stack (project=${COMPOSE_PROJECT}); image ${IMAGE_TAG} retained"
    dc down --remove-orphans
    ok "stack stopped"
}

cmd_destroy() {
    require_docker
    log "destroying stack and removing volumes (project=${COMPOSE_PROJECT})"
    dc down --volumes --remove-orphans
    if docker image inspect "${IMAGE_TAG}" >/dev/null 2>&1; then
        log "removing image ${IMAGE_TAG}"
        docker image rm "${IMAGE_TAG}" >/dev/null
        ok "image ${IMAGE_TAG} removed"
    else
        warn "image ${IMAGE_TAG} not present; skipping"
    fi
    ok "destroy complete"
}

cmd_status() {
    require_docker
    dc ps
}

cmd_logs() {
    require_docker
    dc logs --follow --tail 200
}

# --- dispatch ----------------------------------------------------------------
main() {
    local subcommand="${1:-help}"
    shift || true

    case "${subcommand}" in
        start)   cmd_start "$@" ;;
        stop)    cmd_stop "$@" ;;
        destroy) cmd_destroy "$@" ;;
        status)  cmd_status "$@" ;;
        logs)    cmd_logs "$@" ;;
        help|-h|--help) usage ;;
        *)
            err "unknown subcommand: ${subcommand}"
            usage
            exit 2
            ;;
    esac
}

main "$@"
