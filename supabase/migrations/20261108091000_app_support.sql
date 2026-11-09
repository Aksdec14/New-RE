-- ============================================================================
-- 091000_app_support
--
-- Application-layer support for the Phase 1 UI:
--
--   * create_restaurant now provisions a permanent free workspace instead of a
--     14-day trial. There is no payment gateway, so no tenant ever expires.
--   * list_staff joins memberships to auth.users so owners/admins can see the
--     email of each member without exposing auth.users to the client.
--   * invite_staff lets an owner/admin attach an existing account by email.
--     Accounts must sign up first; the UI says so.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Onboarding: create tenant + owner membership + permanent free subscription
-- ---------------------------------------------------------------------------
create or replace function public.create_restaurant(
  p_name text,
  p_phone text default null,
  p_address text default null,
  p_gstin text default null,
  p_state_code text default null,
  p_timezone text default 'Asia/Kolkata'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'restaurant name is required' using errcode = '22023';
  end if;

  -- One account may run a few outlets, but not farm the system.
  if (
    select count(*)
    from public.memberships m
    where m.user_id = v_uid
      and m.role = 'owner'
  ) >= 3 then
    raise exception 'this account already owns 3 workspaces' using errcode = '22023';
  end if;

  insert into public.restaurants (
    name, gstin, state_code, address, phone, timezone, created_by
  )
  values (
    trim(p_name), p_gstin, p_state_code, p_address, p_phone,
    coalesce(p_timezone, 'Asia/Kolkata'), v_uid
  )
  returning id into v_restaurant_id;

  insert into public.memberships (restaurant_id, user_id, role, joined_at)
  values (v_restaurant_id, v_uid, 'owner', now());

  -- Free forever: a far-future validity keeps the existing is_writable()
  -- machinery intact without ever asking for money.
  insert into public.subscriptions (
    restaurant_id, plan_id, status, valid_until, grace_period_days,
    current_period_start, current_period_end
  )
  values (
    v_restaurant_id, 'trial', 'active',
    now() + interval '100 years', 0,
    now(), now() + interval '100 years'
  );

  return v_restaurant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff directory. SECURITY DEFINER because auth.users is not exposed to
-- PostgREST; the role check keeps it tenant-scoped.
-- ---------------------------------------------------------------------------
create or replace function public.list_staff(p_restaurant_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  role text,
  is_active boolean,
  joined_at timestamptz,
  is_self boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  perform private.assert_role(p_restaurant_id, array['owner', 'admin']);

  return query
  select
    m.id,
    m.user_id,
    u.email::text,
    m.role,
    m.is_active,
    m.joined_at,
    m.user_id = v_uid
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.restaurant_id = p_restaurant_id
  order by
    case m.role
      when 'owner' then 0
      when 'admin' then 1
      when 'cashier' then 2
      when 'waiter' then 3
      else 4
    end,
    m.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attach an existing account to a workspace by email.
-- ---------------------------------------------------------------------------
create or replace function public.invite_staff(
  p_restaurant_id uuid,
  p_email text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_user_id uuid;
  v_membership_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  perform private.assert_role(p_restaurant_id, array['owner', 'admin']);
  perform private.assert_can_write(p_restaurant_id);

  if p_role not in ('admin', 'cashier', 'waiter', 'kitchen') then
    raise exception 'role must be admin, cashier, waiter or kitchen'
      using errcode = '22023';
  end if;

  if v_email = '' then
    raise exception 'email is required' using errcode = '22023';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_user_id is null then
    raise exception 'no account for %. Ask them to sign up first.', v_email
      using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.memberships m
    where m.restaurant_id = p_restaurant_id
      and m.user_id = v_user_id
  ) then
    raise exception '% is already a member of this workspace', v_email
      using errcode = '23505';
  end if;

  insert into public.memberships (
    restaurant_id, user_id, role, invited_by, joined_at
  )
  values (
    p_restaurant_id, v_user_id, p_role, v_uid, now()
  )
  returning id into v_membership_id;

  return v_membership_id;
end;
$$;

-- New functions do not inherit the earlier blanket grant, so be explicit.
revoke execute on function public.list_staff(uuid) from public, anon;
revoke execute on function public.invite_staff(uuid, text, text) from public, anon;
grant execute on function public.list_staff(uuid) to authenticated, service_role;
grant execute on function public.invite_staff(uuid, text, text) to authenticated, service_role;
grant execute on function public.create_restaurant(text, text, text, text, text, text)
  to authenticated, service_role;
