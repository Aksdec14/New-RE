-- ============================================================================
-- 090000_platform
-- Shared plumbing: a non-exposed `private` schema for helpers, tenant-scoped
-- counters, and the audit trigger function.
--
-- Why a separate schema:
--   * PostgREST only exposes `public` (plus graphql_public). Anything in
--     `private` cannot be called over the REST API.
--   * SECURITY DEFINER helpers live here so RLS policies can call them without
--     recursing into the very policies being evaluated.
-- ============================================================================

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Keep `private` out of the exposed API surface defensively.
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenant-scoped counters (order numbers, KOT numbers, bill numbers)
--
-- Invoice serial numbers must be sequential per restaurant, so a global
-- sequence is not usable. `insert ... on conflict do update ... returning`
-- takes a row lock, which makes concurrent calls safe.
-- ---------------------------------------------------------------------------
create table private.counters (
  restaurant_id uuid not null,
  scope text not null,
  value bigint not null default 0 check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, scope)
);

create or replace function private.next_counter(p_restaurant_id uuid, p_scope text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
begin
  insert into private.counters (restaurant_id, scope, value)
  values (p_restaurant_id, p_scope, 1)
  on conflict (restaurant_id, scope)
    do update set value = private.counters.value + 1, updated_at = now()
  returning value into v_value;

  return v_value;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit trigger
--
-- Attached to the tables that matter for disputes: prices, discounts, voids,
-- role changes, and subscription state. The acting user comes from the JWT;
-- the reason comes from the transaction-local `app.audit_reason` setting that
-- privileged RPCs fill in before making a change.
--
-- Plpgsql bodies are not resolved at creation time, so this can live here
-- before public.audit_log exists.
-- ---------------------------------------------------------------------------
create or replace function private.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_restaurant_id uuid;
  v_actor_id uuid;
  v_actor_role text;
  v_reason text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_old := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_row := to_jsonb(new);
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
  else
    v_row := to_jsonb(new);
    v_new := to_jsonb(new);
  end if;

  v_restaurant_id := (v_row ->> 'restaurant_id')::uuid;
  v_actor_id := auth.uid();
  v_reason := nullif(current_setting('app.audit_reason', true), '');

  -- When the restaurant itself is being deleted, this trigger still fires for
  -- every cascading child delete, but the parent row is already gone. Inserting
  -- an audit row would violate audit_log_restaurant_id_fkey. Skip it: the
  -- tenant's audit history is removed with the tenant (on delete cascade).
  if v_restaurant_id is not null
     and not exists (
       select 1 from public.restaurants r where r.id = v_restaurant_id
     ) then
    return null;
  end if;

  if v_actor_id is not null then
    select m.role into v_actor_role
    from public.memberships m
    where m.restaurant_id = v_restaurant_id
      and m.user_id = v_actor_id;
  end if;

  insert into public.audit_log (
    restaurant_id, actor_id, actor_role, action, table_name, record_id,
    before, after, reason
  )
  values (
    v_restaurant_id, v_actor_id, v_actor_role, lower(tg_op), tg_table_name,
    (v_row ->> 'id')::uuid, v_old, v_new, v_reason
  );

  return null;
end;
$$;
