-- ============================================================================
-- 090100_tenancy
-- Restaurants (tenants), staff memberships, plans and subscriptions.
--
-- Every tenant-owned table carries `restaurant_id`. That column is the only
-- thing RLS keys on, so there is exactly one isolation rule to reason about.
-- ============================================================================

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  legal_name text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  state_code text check (state_code is null or state_code ~ '^[0-9]{2}$'),
  address text,
  phone text,
  email text,
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Kolkata',
  -- Free-form tenant preferences: bill footer, service charge, rounding, etc.
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.restaurants is
  'Tenant record. Created only through public.create_restaurant(), never by direct insert.';

create trigger restaurants_set_updated_at
  before update on public.restaurants
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Plans are a global catalogue, not tenant data. They are the one exception to
-- the "every table has restaurant_id" rule, and they are read-only to clients.
-- ---------------------------------------------------------------------------
create table public.plans (
  id text primary key,
  name text not null,
  description text,
  price_monthly numeric(10, 2) not null default 0 check (price_monthly >= 0),
  currency text not null default 'INR',
  trial_days integer not null default 0 check (trial_days between 0 and 365),
  grace_period_days integer not null default 7 check (grace_period_days between 0 and 60),
  max_staff integer check (max_staff is null or max_staff > 0),
  max_tables integer check (max_tables is null or max_tables > 0),
  features jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Staff membership. `role` is an application role, not a Postgres role, which
-- is why write access is enforced in RPCs as well as in RLS policies.
-- ---------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'cashier', 'waiter', 'kitchen')),
  is_active boolean not null default true,
  -- Phase 2: bcrypt hash for PIN login on a shared device. Never sent to clients.
  pin_hash text,
  invited_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

comment on column public.memberships.pin_hash is
  'Bcrypt hash of a 4-6 digit device PIN. Must be revoked from the authenticated role.';

create index memberships_user_idx on public.memberships (user_id) where is_active;
create index memberships_restaurant_role_idx on public.memberships (restaurant_id, role) where is_active;

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- One current subscription per restaurant. There is no payment gateway yet:
-- renewals are recorded manually by the operator, and every change is captured
-- in subscription_events so the history is traceable.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  valid_until timestamptz not null,
  grace_period_days integer not null default 7 check (grace_period_days between 0 and 60),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Free-form notes (UPI reference, who renewed it, invoice number, ...).
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function private.set_updated_at();

create table public.subscription_events (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  event_type text not null,
  -- Operator or system user who made the change. Null for automated jobs.
  actor_id uuid references auth.users (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index subscription_events_restaurant_created_idx
  on public.subscription_events (restaurant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Tenancy + entitlement helpers
--
-- These live after the tables because SQL-language functions are parsed at
-- creation time (unlike plpgsql). They are SECURITY DEFINER on purpose: they
-- must read `memberships` and `subscriptions` regardless of the caller's RLS,
-- otherwise a policy on `memberships` that calls `is_member()` would recurse
-- forever.
-- ---------------------------------------------------------------------------
create or replace function private.is_member(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.restaurant_id = p_restaurant_id
      and m.user_id = auth.uid()
      and m.is_active
  );
$$;

create or replace function private.has_role(p_restaurant_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.restaurant_id = p_restaurant_id
      and m.user_id = auth.uid()
      and m.is_active
      and m.role = any (p_roles)
  );
$$;

-- A restaurant stays writable while its subscription is current, plus a grace
-- window. No subscription row means "not writable" — fail closed.
create or replace function private.is_writable(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.restaurant_id = p_restaurant_id
      and s.status in ('trialing', 'active', 'past_due')
      and now() < s.valid_until + make_interval(days => s.grace_period_days)
  );
$$;

create or replace function private.days_left(p_restaurant_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    ceil(extract(epoch from (s.valid_until - now())) / 86400)::integer,
    0
  )
  from public.subscriptions s
  where s.restaurant_id = p_restaurant_id;
$$;

create or replace function private.assert_member(p_restaurant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_restaurant_id) then
    raise exception 'not a member of this restaurant' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.assert_role(p_restaurant_id uuid, p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role(p_restaurant_id, p_roles) then
    raise exception 'role % required for this action', array_to_string(p_roles, ' or ')
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.assert_can_write(p_restaurant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_writable(p_restaurant_id) then
    raise exception 'subscription is not active; workspace is read-only'
      using errcode = '42501';
  end if;
end;
$$;
