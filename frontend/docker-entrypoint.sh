#!/bin/sh
set -e

run_with_retries() {
  description="$1"
  shift

  max_attempts=12
  delay_seconds=5
  attempt=1

  while true; do
    echo "[entrypoint] ${description} (attempt ${attempt}/${max_attempts})"

    if "$@"; then
      return 0
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[entrypoint] ${description} failed after ${max_attempts} attempts" >&2
      return 1
    fi

    echo "[entrypoint] waiting ${delay_seconds}s before retry" >&2
    attempt=$((attempt + 1))
    sleep "$delay_seconds"
  done
}

if [ "${CRM_AUTO_PRISMA_CLIENT:-}" = "sqlite" ]; then
  sqlite_db_url="${SQLITE_DATABASE_URL:-}"

  if [ -z "$sqlite_db_url" ]; then
    echo "[entrypoint] SQLite runtime requires SQLITE_DATABASE_URL" >&2
    exit 1
  fi

  case "$sqlite_db_url" in
    file:*)
      ;;
    *)
      echo "[entrypoint] SQLite runtime requires SQLITE_DATABASE_URL with file: URL" >&2
      exit 1
      ;;
  esac

  run_with_retries "Generating Prisma SQLite client" npm run db:generate:sqlite
  run_with_retries "Applying SQLite schema" npm run db:push:sqlite
  run_with_retries "Configuring SQLite demo runtime" npm run db:configure:sqlite

  if [ "${RUN_SEED_ON_START:-}" = "true" ]; then
    run_with_retries "Seeding SQLite demo data" npm run db:seed:sqlite
  else
    echo "[entrypoint] Skipping SQLite seed: set RUN_SEED_ON_START=true to run db:seed:sqlite"
  fi

  if [ "${DEMO_RESET_LOOP_ENABLED:-}" = "true" ]; then
    echo "[entrypoint] Starting SQLite demo runtime with guarded reset loop"
    exec npm run start:demo:sqlite -- --hostname 0.0.0.0 --port 3000
  fi

  exec npm run start -- --hostname 0.0.0.0 --port 3000
fi

run_with_retries "Running Prisma migrations" npx prisma migrate deploy

if [ "${RUN_SEED_ON_START:-}" = "true" ]; then
  run_with_retries "Seeding foundation data" node prisma/seed.mjs
else
  echo "[entrypoint] Skipping seed: set RUN_SEED_ON_START=true to run prisma/seed.mjs"
fi

exec npm run start -- --hostname 0.0.0.0 --port 3000
