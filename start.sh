#!/usr/bin/env bash
# Start everything Uptime Watch needs for local development:
#   Postgres, Redis and ClickHouse (Docker containers), then the API,
#   one worker per region, the pusher and the frontend.
# Every service's output is shown here with a prefix. Ctrl+C stops them all.
#
#   ./start.sh            start everything
#   START_FE=0 ./start.sh skip the frontend
#
# Container names default to the ones on this machine; override them with
# PG_CONTAINER, REDIS_CONTAINER and CLICKHOUSE_CONTAINER.
# Works with macOS's built-in bash 3.2.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PG_CONTAINER="${PG_CONTAINER:-loving_brown}"
REDIS_CONTAINER="${REDIS_CONTAINER:-intelligent_dubinsky}"
CLICKHOUSE_CONTAINER="${CLICKHOUSE_CONTAINER:-uptime-clickhouse}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-postgres}"
API_PORT="${API_PORT:-3000}"
FE_PORT="${FE_PORT:-3001}"
START_FE="${START_FE:-1}"

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; green=$'\033[32m'; reset=$'\033[0m'
info() { printf '%s\n' "${bold}▸${reset} $*"; }
fail() { printf '%s\n' "${red}✘ $*${reset}" >&2; exit 1; }

# ------------------------------------------------------------- preflight

command -v docker >/dev/null || fail "Docker isn't installed."
command -v bun >/dev/null || fail "Bun isn't installed: https://bun.sh"
docker info >/dev/null 2>&1 || fail "Docker isn't running. Start Docker Desktop, then run this again."

for port in "$API_PORT" "$FE_PORT"; do
  if [ "$port" = "$FE_PORT" ] && [ "$START_FE" != "1" ]; then continue; fi
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Port $port is already in use (pid $(lsof -ti tcp:"$port" -sTCP:LISTEN | head -1)). Stop that process first: kill \$(lsof -ti tcp:$port)"
  fi
done

[ -d "$ROOT/node_modules" ] || { info "Installing dependencies"; (cd "$ROOT" && bun install); }

# ------------------------------------------------------------ containers

start_container() {
  local name="$1"
  docker inspect "$name" >/dev/null 2>&1 \
    || fail "No container named $name. Create it with the docker run command in README.md, or set ${2}=<your container>."
  if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != "true" ]; then
    info "Starting container $name"
    docker start "$name" >/dev/null
  fi
}

wait_for() {
  local label="$1"; shift
  local tries=0
  until "$@" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || fail "$label didn't become ready within 60 s."
    sleep 1
  done
  printf '%s\n' "  ${green}✔${reset} $label ready"
}

start_container "$PG_CONTAINER" PG_CONTAINER
start_container "$REDIS_CONTAINER" REDIS_CONTAINER
start_container "$CLICKHOUSE_CONTAINER" CLICKHOUSE_CONTAINER
wait_for "Postgres" docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER"
wait_for "Redis" docker exec "$REDIS_CONTAINER" redis-cli ping
wait_for "ClickHouse" curl -sf "http://localhost:8123/ping"

REGIONS="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT id || ' ' || name FROM region ORDER BY name")"
[ -n "$REGIONS" ] || fail "The region table is empty. Add a region first, e.g.:
  docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -c \"INSERT INTO region (id, name) VALUES ('region1', 'region1');\""

# -------------------------------------------------------------- services

# Job control gives each service its own process group, so stopping one
# also stops its children (e.g. `next dev` under `bun run dev`).
set -m
PIDS=()

# Stop every service on Ctrl+C, on any failure, and when the script exits.
# The services finish their current work on SIGTERM.
cleanup() {
  trap - INT TERM EXIT
  printf '\n%s\n' "${bold}▸${reset} Stopping all services…"
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  printf '%s\n' "${green}✔${reset} Stopped. The containers are still running (docker stop to stop them)."
}
trap cleanup INT TERM EXIT

# run <label> <colour code> <dir> <command...>: start in the background,
# prefixing each output line with the label.
run() {
  local label="$1" colour="$2" dir="$3"; shift 3
  (
    cd "$ROOT/$dir"
    "$@" 2>&1 | while IFS= read -r line; do
      printf '\033[%sm%-14s\033[0m %s\n' "$colour" "$label" "$line"
    done
  ) &
  PIDS+=("$!")
}

info "Starting services"
run "api" "35" "apps/api" env PORT="$API_PORT" bun --watch index.ts
# One worker per region; each region is its own Redis consumer group.
while read -r region_id region_name; do
  [ -n "$region_id" ] || continue
  run "worker:$region_name" "36" "apps/worker" env REGION_ID="$region_id" WORKER_ID="local-$region_name" bun --watch index.ts
done <<EOF
$REGIONS
EOF
run "pusher" "33" "apps/pusher" bun --watch index.ts
if [ "$START_FE" = "1" ]; then
  run "fe" "34" "apps/fe" env API_URL="http://localhost:$API_PORT" bun run dev
fi

# Print the addresses once the API answers.
(
  for _ in $(seq 1 60); do
    curl -sf "http://localhost:$API_PORT/health" >/dev/null 2>&1 && break
    sleep 1
  done
  printf '\n%s\n' "${bold}Uptime Watch is running${reset}"
  [ "$START_FE" = "1" ] && printf '  Dashboard     http://localhost:%s   %s(demo / demo1234)%s\n' "$FE_PORT" "$dim" "$reset"
  [ "$START_FE" = "1" ] && printf '  Status page   http://localhost:%s/status/demo\n' "$FE_PORT"
  printf '  API           http://localhost:%s\n' "$API_PORT"
  printf '  API docs      http://localhost:%s/docs\n' "$API_PORT"
  printf '  %sCtrl+C stops everything (the containers keep running).%s\n\n' "$dim" "$reset"
) &
PIDS+=("$!")

wait
