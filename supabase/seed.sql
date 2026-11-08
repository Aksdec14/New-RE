-- ============================================================================
-- Seed data for `supabase db reset`
--
-- Plans are inserted by migration 090500_reference_data.sql, so this file only
-- creates an optional demo tenant.
--
-- 1. Create a demo auth user first (Dashboard -> Authentication -> Add user,
--    email owner@demo.test), or sign up through the app.
-- 2. Run `supabase db reset` again.
--
-- Tenant creation normally happens through public.create_restaurant(), which
-- is also what the onboarding screen calls. The seed mirrors that flow.
-- ============================================================================

do $$
declare
  v_owner_id uuid;
  v_restaurant_id uuid;
  v_category_id uuid;
begin
  select id into v_owner_id
  from auth.users
  where email = 'owner@demo.test';

  if v_owner_id is null then
    raise notice 'Seed skipped: add an auth user with email owner@demo.test first.';
    return;
  end if;

  if exists (select 1 from public.memberships where user_id = v_owner_id) then
    raise notice 'Seed skipped: owner@demo.test already has a workspace.';
    return;
  end if;

  insert into public.restaurants (name, state_code, phone, created_by)
  values ('Demo Kitchen', '29', '+91 90000 00000', v_owner_id)
  returning id into v_restaurant_id;

  insert into public.memberships (restaurant_id, user_id, role, joined_at)
  values (v_restaurant_id, v_owner_id, 'owner', now());

  insert into public.subscriptions (
    restaurant_id, plan_id, status, valid_until, grace_period_days,
    current_period_start, current_period_end
  )
  values (
    v_restaurant_id, 'trial', 'trialing',
    now() + interval '14 days', 7, now(), now() + interval '14 days'
  );

  insert into public.categories (restaurant_id, name, sort_order)
  values (v_restaurant_id, 'Breakfast', 0)
  returning id into v_category_id;

  insert into public.menu_items (
    restaurant_id, category_id, name, price, tax_rate, is_veg
  )
  values
    (v_restaurant_id, v_category_id, 'Masala Dosa', 120.00, 5.00, true),
    (v_restaurant_id, v_category_id, 'Filter Coffee', 60.00, 5.00, true),
    (v_restaurant_id, v_category_id, 'Chicken Biryani', 280.00, 5.00, false);

  insert into public.dining_tables (restaurant_id, label, seats)
  values
    (v_restaurant_id, 'T1', 4),
    (v_restaurant_id, 'T2', 4),
    (v_restaurant_id, 'T3', 2);

  raise notice 'Demo workspace created for owner@demo.test (%).', v_restaurant_id;
end;
$$;
