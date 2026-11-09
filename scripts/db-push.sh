#!/usr/bin/env bash
# =============================================================================
# Apply every migration to a real Supabase project, in order, with psql.
#
# Used when the Supabase CLI / Docker is not available. This is the same order
# `supabase db push` uses.
#
#   DATABASE_URL='postgresql://postgres.<ref>:<pw>@<host>:5432/postgres' \
#     ./scripts/db-push.sh
#
# Get the URL from the dashboard: Connect -> Session pooler (or Direct).
# Migrations are NOT idempotent: run this once per project. On a re-run the
# first "already exists" error stops the script on purpose.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="${1:-${DATABASE_URL:-}}"

if [[ -z "$DB_URL" ]]; then
  echo "usage: DATABASE_URL='postgresql://...' $0" >&2
  exit 1
fi

if ! command -v psql >/dev/null; then
  for dir in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql*/bin \
             /usr/local/opt/postgresql*/bin \
             /Applications/Postgres.app/Contents/Versions/*/bin; do
    if [ -x "$dir/psql" ]; then
      PATH="$dir:$PATH"
      break
    fi
  done
  export PATH
fi

echo "→ target: $(printf '%s' "$DB_URL" | sed -E 's#(://[^:]+):[^@]*@#\1:****@#')"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -tAc 'select 1' >/dev/null
echo "→ connected"

for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "  $(basename "$file")"
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$file" >/dev/null
done

echo "→ done. Tables now in project:"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -tAc \
  "select count(*) from pg_tables where schemaname = 'public' and rowsecurity"
echo "  tables with RLS enabled"
