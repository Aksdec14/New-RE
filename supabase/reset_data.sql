-- ===========================================================================
-- reset_data.sql — wipe ALL workspace + auth data, keep schema and functions
--
-- What this does on the cloud project:
--   * clears every workspace's data (menu, tables, orders, bills, staff…)
--   * clears auth.users (all accounts; sessions, refresh tokens and
--     identities follow via ON DELETE CASCADE)
--   * resets per-tenant counters (they live in private.counters rows), so
--     bill #1 / order #1 start fresh
--   * KEEPS: the 14-table schema, RLS policies, all SECURITY DEFINER
--           functions (create_restaurant, list_staff, invite_staff…)
--           and the seeded plans rows (trial / starter / growth)
--
-- Usage: Supabase dashboard -> SQL editor -> New query -> paste -> Run.
-- The "Run without RLS / Run and enable RLS?" prompt either way is fine.
--
-- Note on hosting: the SQL editor runs as the `postgres` role, which does not
-- own the auth schema — so TRUNCATE (and RESTART IDENTITY) on auth tables
-- fails with "must be owner of sequence". A plain DELETE is permitted and
-- used here instead.
--
-- After running: sign up fresh -> confirm email -> onboarding -> test.
-- ===========================================================================

begin;

-- 1. Application data. CASCADE sweeps the child tables in one statement.
truncate table
  public.audit_log,
  public.subscription_events,
  public.daily_summaries,
  public.payments,
  public.bills,
  public.order_items,
  public.orders,
  public.dining_tables,
  public.menu_items,
  public.categories,
  public.memberships,
  public.subscriptions,
  public.restaurants,
  private.counters;

-- 2. Auth accounts as DML: postgres may not TRUNCATE auth.*, but may delete.
--    Sessions, refresh tokens and identities cascade away with the user.
delete from auth.users;

commit;

-- ===========================================================================
-- Verify — every count should be 0 except plans_kept (3).
-- ===========================================================================
select
  (select count(*) from public.restaurants)      as restaurants,
  (select count(*) from public.memberships)      as memberships,
  (select count(*) from public.categories)       as categories,
  (select count(*) from public.menu_items)       as menu_items,
  (select count(*) from public.orders)           as orders,
  (select count(*) from public.bills)            as bills,
  (select count(*) from public.audit_log)        as audit_rows,
  (select count(*) from private.counters)        as counters,
  (select count(*) from public.plans)            as plans_kept,
  (select count(*) from auth.users)              as users;
