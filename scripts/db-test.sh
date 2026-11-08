#!/usr/bin/env bash
# =============================================================================
# Apply every migration and the RLS test suite to a throwaway Postgres cluster.
#
# Used when Docker / the Supabase CLI is unavailable. Produces exactly the same
# schema that `supabase db reset` would, minus the platform services.
#
#   ./scripts/db-test.sh              # run migrations + tests, tear down
#   KEEP_DB=1 ./scripts/db-test.sh    # leave the cluster running for inspection
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PGTEST_PORT:-55433}"
BASE="${PGTEST_DIR:-${TMPDIR:-/tmp}/opencode/resto-db-test}"
KEEP_DB="${KEEP_DB:-0}"

# Make the script work on macOS Postgres.app/Homebrew and on CI images where
# initdb is not on PATH.
for dir in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql*/bin \
           /usr/local/opt/postgresql*/bin \
           /Applications/Postgres.app/Contents/Versions/*/bin; do
  if [ -x "$dir/initdb" ]; then
    PATH="$dir:$PATH"
    break
  fi
done
export PATH

if ! command -v initdb >/dev/null || ! command -v pg_ctl >/dev/null; then
  echo "initdb / pg_ctl not found. Install PostgreSQL 15+ (or use Docker + supabase CLI)." >&2
  exit 1
fi

cleanup() {
  if [[ "$KEEP_DB" == "1" ]]; then
    echo "kept cluster: $BASE (port $PORT)"
    return
  fi
  pg_ctl -D "$BASE/data" stop -m fast >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "$BASE"
mkdir -p "$BASE"

initdb -D "$BASE/data" -U postgres --auth=trust -E UTF8 >/dev/null
pg_ctl -D "$BASE/data" \
  -o "-p $PORT -k $BASE -c wal_level=logical -c fsync=off -c full_page_writes=off" \
  -l "$BASE/server.log" start >/dev/null

# Wait for the socket to accept connections instead of sleeping blindly.
attempts=0
until psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 50 ]; then
    echo "Postgres did not start; see $BASE/server.log" >&2
    exit 1
  fi
  sleep 0.2
done

export PGHOST="$BASE" PGPORT="$PORT" PGUSER=postgres

psql -X -q -d postgres -c "create database resto_test;"

run_sql() {
  psql -X -q -v ON_ERROR_STOP=1 -d resto_test -f "$1"
}

echo "→ platform shim"
run_sql "$ROOT/scripts/sql/00_supabase_shim.sql"

echo "→ migrations"
for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "  $(basename "$file")"
  run_sql "$file" >/dev/null
done

echo "→ fixtures"
run_sql "$ROOT/scripts/sql/10_fixtures.sql" >/dev/null

echo "→ RLS + billing tests"
run_sql "$ROOT/supabase/tests/rls_policies.sql"
