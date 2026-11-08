-- ============================================================================
-- 090700_rls
-- Row level security, grants and the read view used by the app shell.
--
-- Shape of every policy:
--   * SELECT  -> is the caller an active member of this restaurant?
--   * INSERT/UPDATE/DELETE -> member + role + subscription writable.
--   * Orders, order_items, bills, payments have no write policy at all:
--     mutations go through the SECURITY DEFINER functions.
-- ============================================================================

alter table public.restaurants enable row level security;
alter table public.plans enable row level security;
alter table public.memberships enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.dining_tables enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.bills enable row level security;
alter table public.payments enable row level security;
alter table public.daily_summaries enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- Tenant / staff
-- ---------------------------------------------------------------------------
create policy restaurants_select on public.restaurants
  for select to authenticated
  using (private.is_member(id));

create policy restaurants_update on public.restaurants
  for update to authenticated
  using (private.has_role(id, array['owner', 'admin']) and private.is_writable(id))
  with check (private.has_role(id, array['owner', 'admin']) and private.is_writable(id));

create policy plans_select on public.plans
  for select to anon, authenticated
  using (true);

create policy memberships_select on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_role(restaurant_id, array['owner', 'admin'])
  );

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    private.has_role(restaurant_id, array['owner', 'admin'])
    and private.is_writable(restaurant_id)
    and (role <> 'owner' or private.has_role(restaurant_id, array['owner']))
  );

create policy memberships_update on public.memberships
  for update to authenticated
  using (
    private.has_role(restaurant_id, array['owner', 'admin'])
    and private.is_writable(restaurant_id)
    -- Only an owner may touch an owner row.
    and (role <> 'owner' or private.has_role(restaurant_id, array['owner']))
  )
  with check (
    private.has_role(restaurant_id, array['owner', 'admin'])
    and private.is_writable(restaurant_id)
    and (role <> 'owner' or private.has_role(restaurant_id, array['owner']))
  );

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (
    private.has_role(restaurant_id, array['owner', 'admin'])
    and private.is_writable(restaurant_id)
    and user_id <> (select auth.uid())
    and (role <> 'owner' or private.has_role(restaurant_id, array['owner']))
  );

create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (private.is_member(restaurant_id));

create policy subscription_events_select on public.subscription_events
  for select to authenticated
  using (private.has_role(restaurant_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create policy categories_select on public.categories
  for select to authenticated
  using (private.is_member(restaurant_id));

create policy categories_insert on public.categories
  for insert to authenticated
  with check (private.has_role(restaurant_id, array['owner', 'admin']) and private.is_writable(restaurant_id));

create policy categories_update on public.categories
  for update to authenticated
  using (private.has_role(restaurant_id, array['owner', 'admin']) and private.is_writable(restaurant_id))
  with check (private.has_role(restaurant_id, array['owner', 'admin']) and private.is_writable(restaurant_id));

create policy categories_delete on public.categories
  for delete to authenticated
  using (private.has_role(restaurant_id, array['owner', 'admin']) and private.is_writable(restaurant_id));

create policy menu_items_select on public.menu_items
  for select to authenticated
  using (private.is_member(restaurant_id));

create policy menu_items_insert on public.menu_items
  for insert to authenticated
  with check (private.has_role(restaurant_id, array['owner', 'admin']) and private.is_writable(restaurant_id));

create policy menu_items_update on public.menu_items
  for update to authenticated
  using (private.has_role(restaurant_id, array['owner', 'admin']) and private.is_writable(restaurant_id))
  with check (private.has_role(restaurant_id, array['owner', 'admin']) and private.is_writable(restaurant_id));

create policy menu_items_delete on public.menu_items
  for delete to authenticated
  using (private.has_role(restaurant_id, array['owner', 'admin']) and private.is_writable(restaurant_id));

create policy dining_tables_select on public.dining_tables
  for select to authenticated
  using (private.is_member(restaurant_id));

create policy dining_tables_insert on public.dining_tables
  for insert to authenticated
  with check (
    private.has_role(restaurant_id, array['owner', 'admin', 'cashier'])
    and private.is_writable(restaurant_id)
  );

create policy dining_tables_update on public.dining_tables
  for update to authenticated
  using (
    private.has_role(restaurant_id, array['owner', 'admin', 'cashier', 'waiter'])
    and private.is_writable(restaurant_id)
  )
  with check (
    private.has_role(restaurant_id, array['owner', 'admin', 'cashier', 'waiter'])
    and private.is_writable(restaurant_id)
  );

create policy dining_tables_delete on public.dining_tables
  for delete to authenticated
  using (private.has_role(restaurant_id, array['owner', 'admin']) and private.is_writable(restaurant_id));

-- ---------------------------------------------------------------------------
-- Orders, bills, payments: read-only to clients. Writes are RPC-only.
-- ---------------------------------------------------------------------------
create policy orders_select on public.orders
  for select to authenticated
  using (private.is_member(restaurant_id));

create policy order_items_select on public.order_items
  for select to authenticated
  using (private.is_member(restaurant_id));

create policy bills_select on public.bills
  for select to authenticated
  using (private.has_role(restaurant_id, array['owner', 'admin', 'cashier']));

create policy payments_select on public.payments
  for select to authenticated
  using (private.has_role(restaurant_id, array['owner', 'admin', 'cashier']));

create policy daily_summaries_select on public.daily_summaries
  for select to authenticated
  using (private.has_role(restaurant_id, array['owner', 'admin', 'cashier']));

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (private.has_role(restaurant_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- Convenience view for the app shell. security_invoker keeps the caller's RLS
-- in force, so this cannot be used to read another tenant.
-- ---------------------------------------------------------------------------
create or replace view public.v_my_restaurants
with (security_invoker = on) as
select
  r.id,
  r.name,
  r.gstin,
  r.currency,
  r.timezone,
  r.settings,
  m.role,
  s.plan_id,
  p.name as plan_name,
  s.status as subscription_status,
  s.valid_until,
  s.grace_period_days,
  private.is_writable(r.id) as is_writable,
  coalesce(private.days_left(r.id), 0) as days_left,
  (s.status in ('trialing', 'active', 'past_due')
    and s.valid_until is not null
    and now() >= s.valid_until) as in_grace,
  r.created_at
from public.restaurants r
join public.memberships m
  on m.restaurant_id = r.id
 and m.user_id = (select auth.uid())
 and m.is_active
left join public.subscriptions s on s.restaurant_id = r.id
left join public.plans p on p.id = s.plan_id
where r.is_active;

comment on view public.v_my_restaurants is
  'Restaurants the current user belongs to, with role and subscription state.';

-- ---------------------------------------------------------------------------
-- Grants
--
-- RLS decides rows, but table privileges are the first gate. Authenticated
-- users get read on everything tenant-scoped, and write only on the tables
-- that are safe to edit directly. The RPC-only tables get no write grant.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.menu_items to authenticated;
grant insert, update, delete on public.dining_tables to authenticated;
grant insert, update, delete on public.memberships to authenticated;
grant update on public.restaurants to authenticated;

grant select on public.plans to anon;
grant select on public.v_my_restaurants to authenticated;

-- SECURITY DEFINER functions default to EXECUTE for PUBLIC. Close that first.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;

-- Future objects should not silently re-open access.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables from anon;
