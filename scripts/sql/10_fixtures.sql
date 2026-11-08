-- ============================================================================
-- Deterministic fixtures for the RLS / billing test suite.
--
-- Loaded as the superuser (RLS bypassed) by scripts/db-test.sh. Re-runnable.
-- ============================================================================

delete from auth.users;
delete from public.restaurants;

-- idempotent in case the migration was edited after a first run
insert into public.plans (id, name, price_monthly, trial_days, grace_period_days)
values ('trial', 'Free trial', 0, 14, 7)
on conflict (id) do nothing;

-- Quoted because `user` is reserved.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner-a@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'waiter-a@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'kitchen-a@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'cashier-a@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'admin-a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'owner-b@test.local'),
  ('cccccccc-0000-0000-0000-000000000001', 'owner-c@test.local'),
  ('dddddddd-0000-0000-0000-000000000001', 'outsider@test.local');

insert into public.restaurants (id, name, state_code, timezone, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Spice Route', '29', 'Asia/Kolkata',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'Coastal Kitchen', '29', 'Asia/Kolkata',
   'bbbbbbbb-0000-0000-0000-000000000001'),
  ('33333333-3333-3333-3333-333333333333', 'Lapsed Diner', '29', 'Asia/Kolkata',
   'cccccccc-0000-0000-0000-000000000001');

insert into public.memberships (restaurant_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'waiter'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'kitchen'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000004', 'cashier'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000005', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'owner'),
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-0000-0000-0000-000000000001', 'owner');

insert into public.subscriptions (
  restaurant_id, plan_id, status, valid_until, grace_period_days
) values
  ('11111111-1111-1111-1111-111111111111', 'growth', 'active',
   now() + interval '30 days', 7),
  ('22222222-2222-2222-2222-222222222222', 'starter', 'active',
   now() + interval '30 days', 7),
  -- Expired 30 days ago with a 7 day grace window: read-only.
  ('33333333-3333-3333-3333-333333333333', 'starter', 'active',
   now() - interval '30 days', 7);

insert into public.categories (id, restaurant_id, name, sort_order) values
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'Breakfast', 0),
  ('c0000000-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', 'Mains', 0),
  ('c0000000-0000-4000-8000-000000000003', '33333333-3333-3333-3333-333333333333', 'Snacks', 0);

insert into public.menu_items (
  id, restaurant_id, category_id, name, price, tax_rate, is_available
) values
  ('e0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-4000-8000-000000000001', 'Masala Dosa', 300.00, 5.00, true),
  ('e0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-4000-8000-000000000001', 'Filter Coffee', 100.00, 18.00, true),
  ('e0000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-4000-8000-000000000001', 'Sold Out Idli', 50.00, 5.00, false),
  ('e0000000-0000-4000-8000-000000000004', '22222222-2222-2222-2222-222222222222',
   'c0000000-0000-4000-8000-000000000002', 'Biryani', 250.00, 5.00, true),
  ('e0000000-0000-4000-8000-000000000005', '33333333-3333-3333-3333-333333333333',
   'c0000000-0000-4000-8000-000000000003', 'Samosa', 40.00, 5.00, true);

insert into public.dining_tables (id, restaurant_id, label, seats) values
  ('70000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'T1', 4);
