#!/usr/bin/env bash
# =============================================================================
# Regenerate the paste-into-the-dashboard SQL bundles from
# supabase/migrations/*.sql.
#
#   ./scripts/build-apply-all.sh
#
# Writes:
#   supabase/apply_all.sql         migrations only (fresh, empty public schema)
#   supabase/reset_and_apply.sql   drops the known legacy tables first, then
#                                  applies every migration
#
# Both are wrapped in one transaction, so any failure rolls everything back.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/supabase/apply_all.sql"
RESET_OUT="$ROOT/supabase/reset_and_apply.sql"

# Tables left behind by the earlier POS schema in this Supabase project. All
# were verified empty before being dropped. Project-specific on purpose.
LEGACY_TABLES=(
  bill_orders
  order_events
  order_items
  bills
  payments
  orders
  menu_items
  categories
  sessions
  clients
  tables
  users
  restaurants
)

write_header() {
  local title="$1" extra="$2"
  echo "-- ============================================================================"
  echo "-- $title"
  echo "--"
  echo "-- Everything in supabase/migrations, concatenated in order, wrapped in one"
  echo "-- transaction. Paste this into the Supabase SQL Editor and press Run."
  echo "-- Generated file: regenerate with scripts/build-apply-all.sh."
  if [[ -n "$extra" ]]; then
    echo "--"
    echo "-- $extra"
  fi
  echo "-- ============================================================================"
}

write_migrations() {
  local file
  for file in "$ROOT"/supabase/migrations/*.sql; do
    echo
    echo "-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>"
    echo "-- $(basename "$file")"
    echo "-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    cat "$file"
  done
}

write_footer() {
  echo
  echo "commit;"
  echo
  echo "select count(*) as tables_with_rls"
  echo "from pg_tables where schemaname = 'public' and rowsecurity;"
}

{
  write_header "apply_all.sql" ""
  echo
  echo "begin;"
  write_migrations
  write_footer
} > "$OUT"

{
  write_header "reset_and_apply.sql" \
    "DESTRUCTIVE: drops the empty legacy POS tables first. Verified 0 rows each."
  echo
  echo "begin;"
  echo
  echo "-- ---- legacy schema cleanup ----------------------------------------------"
  for table in "${LEGACY_TABLES[@]}"; do
    echo "drop table if exists public.$table cascade;"
  done
  write_migrations
  write_footer
} > "$RESET_OUT"

printf 'wrote %s (%s bytes)\n' "$OUT" "$(wc -c < "$OUT" | tr -d ' ')"
printf 'wrote %s (%s bytes)\n' "$RESET_OUT" "$(wc -c < "$RESET_OUT" | tr -d ' ')"
