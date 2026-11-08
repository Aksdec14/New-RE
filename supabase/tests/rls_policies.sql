-- ============================================================================
-- RLS + billing policy tests
--
-- These are the tests that matter before a real restaurant touches the system.
-- They run inside one transaction and roll back, so the fixture data is never
-- mutated and the suite is repeatable.
--
-- Run locally:     ./scripts/db-test.sh
-- Run on Supabase: psql "$DATABASE_URL" -f supabase/tests/rls_policies.sql
--
-- Expected output: one NOTICE per passing assertion, then ALL TESTS PASSED.
-- Any failure raises and exits non-zero.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

begin;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.assert(p_ok boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'ok  %', p_label;
end;
$$;

create or replace function tests.assert_raises(
  p_sql text,
  p_label text,
  p_sqlstate text default null
)
returns void
language plpgsql
as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate;

    if p_sqlstate is not null and v_state <> p_sqlstate then
      raise exception 'FAIL: % (expected sqlstate %, got %: %)',
        p_label, p_sqlstate, v_state, sqlerrm;
    end if;

    raise notice 'ok  % [%]', p_label, v_state;
    return;
  end;

  raise exception 'FAIL: % (no error raised)', p_label;
end;
$$;

-- Set the JWT claims the same way PostgREST does. Role switching itself is done
-- with `set local role` because SET ROLE is not allowed inside a function.
create or replace function tests.claims(p_user uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ===========================================================================
-- 1. Structural checks
-- ===========================================================================
select tests.assert(
  (select count(*) from pg_tables where schemaname = 'public' and rowsecurity) >= 14,
  'RLS is enabled on every tenant table'
);

select tests.assert(
  (select count(*) from pg_policies where schemaname = 'public') >= 20,
  'policies are installed'
);

-- ===========================================================================
-- 2. Anonymous callers
-- ===========================================================================
set local role anon;

select tests.assert(
  (select count(*) from public.plans) = 3,
  'anon can read the public plan catalogue'
);

select tests.assert_raises(
  'select count(*) from public.menu_items',
  'anon cannot read tenant data',
  '42501'
);

select tests.assert_raises(
  $$ select public.create_restaurant('Anonymous Hack') $$,
  'anon cannot call the onboarding RPC',
  '42501'
);

reset role;

-- ===========================================================================
-- 3. A signed-in user with no membership
-- ===========================================================================
select tests.claims('dddddddd-0000-0000-0000-000000000001');
set local role authenticated;

select tests.assert(
  (select count(*) from public.restaurants) = 0,
  'a user with no membership sees no restaurants'
);

select tests.assert_raises(
  format(
    'select public.create_order(p_restaurant_id => %L, p_client_id => gen_random_uuid(), p_items => %L::jsonb)',
    '11111111-1111-1111-1111-111111111111',
    '[{"menu_item_id":"e0000000-0000-4000-8000-000000000001","quantity":1}]'
  ),
  'an outsider cannot create an order in someone else''s restaurant',
  '42501'
);

select tests.assert_raises(
  $$ insert into public.memberships (restaurant_id, user_id, role)
     values ('11111111-1111-1111-1111-111111111111',
             'dddddddd-0000-0000-0000-000000000001', 'owner') $$,
  'an outsider cannot add themselves to another restaurant',
  '42501'
);

reset role;

-- ===========================================================================
-- 4. Order creation, server-side totals, idempotency
-- ===========================================================================
select tests.claims('aaaaaaaa-0000-0000-0000-000000000001');
set local role authenticated;

select public.create_order(
  p_restaurant_id => '11111111-1111-1111-1111-111111111111',
  p_client_id => 'a0000000-0000-4000-8000-000000000001',
  p_items => '[
    {"menu_item_id":"e0000000-0000-4000-8000-000000000001","quantity":1},
    {"menu_item_id":"e0000000-0000-4000-8000-000000000002","quantity":1}
  ]'::jsonb,
  p_table_id => '70000000-0000-4000-8000-000000000001'
) as order1 \gset

select tests.assert(
  (select subtotal from public.orders where id = :'order1') = 400.00,
  'order subtotal is computed from item snapshots (400)'
);

select tests.assert(
  (select tax_total from public.orders where id = :'order1') = 33.00,
  'order tax is computed server-side (15 + 18)'
);

select tests.assert(
  (select total from public.orders where id = :'order1') = 433.00,
  'order total is 433'
);

select tests.assert(
  (select status from public.dining_tables where id = '70000000-0000-4000-8000-000000000001') = 'occupied',
  'creating an order marks the table occupied'
);

select tests.assert(
  public.create_order(
    p_restaurant_id => '11111111-1111-1111-1111-111111111111',
    p_client_id => 'a0000000-0000-4000-8000-000000000001',
    p_items => '[{"menu_item_id":"e0000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb
  ) = :'order1',
  'retrying with the same client_id returns the original order'
);

select tests.assert(
  (select count(*) from public.orders where restaurant_id = '11111111-1111-1111-1111-111111111111') = 1,
  'the retry did not create a duplicate order'
);

select tests.assert_raises(
  format(
    'select public.create_order(p_restaurant_id => %L, p_client_id => gen_random_uuid(), p_items => %L::jsonb)',
    '11111111-1111-1111-1111-111111111111',
    '[{"menu_item_id":"e0000000-0000-4000-8000-000000000003","quantity":1}]'
  ),
  'an unavailable menu item is rejected',
  '22023'
);

select tests.assert_raises(
  format(
    'select public.create_order(p_restaurant_id => %L, p_client_id => gen_random_uuid(), p_items => %L::jsonb, p_table_id => %L)',
    '11111111-1111-1111-1111-111111111111',
    '[{"menu_item_id":"e0000000-0000-4000-8000-000000000001","quantity":1}]',
    '70000000-0000-4000-8000-000000000001'
  ),
  'a second open order on the same table is rejected',
  '23505'
);

reset role;

-- ===========================================================================
-- 5. Tenant isolation on reads
-- ===========================================================================
select tests.claims('bbbbbbbb-0000-0000-0000-000000000001');
set local role authenticated;

select tests.assert(
  (select count(*) from public.orders) = 0,
  'restaurant B cannot read restaurant A orders'
);

select tests.assert(
  (select count(*) from public.menu_items
   where restaurant_id = '11111111-1111-1111-1111-111111111111') = 0,
  'restaurant B cannot read restaurant A menu items'
);

select tests.assert(
  (select count(*) from public.restaurants) = 1
    and (select name from public.restaurants) = 'Coastal Kitchen',
  'restaurant B sees only its own tenant row'
);

select tests.assert(
  (select count(*) from public.v_my_restaurants) = 1,
  'the app view is tenant scoped'
);

select tests.assert_raises(
  format('select public.generate_bill(p_order_id => %L)', :'order1'),
  'restaurant B cannot bill restaurant A''s order',
  '42501'
);

reset role;

-- ===========================================================================
-- 6. Role checks on direct writes + audit trail
-- ===========================================================================
select tests.claims('aaaaaaaa-0000-0000-0000-000000000002'); -- waiter
set local role authenticated;

with updated as (
  update public.menu_items set price = 999.00
  where id = 'e0000000-0000-4000-8000-000000000001'
  returning 1
)
select tests.assert(
  (select count(*) from updated) = 0,
  'a waiter cannot edit menu prices (RLS filters the row)'
);

reset role;

select tests.claims('aaaaaaaa-0000-0000-0000-000000000003'); -- kitchen
set local role authenticated;

with updated as (
  update public.menu_items set price = 999.00
  where id = 'e0000000-0000-4000-8000-000000000001'
  returning 1
)
select tests.assert(
  (select count(*) from updated) = 0,
  'a kitchen user cannot edit menu prices'
);

reset role;

select tests.claims('aaaaaaaa-0000-0000-0000-000000000001'); -- owner
set local role authenticated;

with updated as (
  update public.menu_items set price = 350.00
  where id = 'e0000000-0000-4000-8000-000000000001'
  returning price
)
select tests.assert(
  (select price from updated) = 350.00,
  'the owner can edit a menu price'
);

select tests.assert(
  (select unit_price from public.order_items where order_id = :'order1' limit 1) = 300.00,
  'editing a price does not rewrite existing order lines'
);

reset role;

select tests.assert(
  exists (
    select 1 from public.audit_log
    where table_name = 'menu_items'
      and record_id = 'e0000000-0000-4000-8000-000000000001'
      and action = 'update'
      and (after ->> 'price')::numeric = 350.00
  ),
  'the price edit is recorded in the audit log'
);

select tests.assert(
  exists (
    select 1 from public.audit_log
    where table_name = 'menu_items'
      and actor_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and actor_role = 'owner'
  ),
  'the audit log records who acted and in which role'
);

-- Put the price back so later expectations use the fixture price.
select tests.claims('aaaaaaaa-0000-0000-0000-000000000001');
set local role authenticated;
update public.menu_items set price = 300.00
where id = 'e0000000-0000-4000-8000-000000000001';
reset role;

-- ===========================================================================
-- 6b. Staff management: an admin cannot take over the tenant
-- ===========================================================================
select tests.claims('aaaaaaaa-0000-0000-0000-000000000005'); -- admin
set local role authenticated;

with updated as (
  update public.memberships set role = 'cashier'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select tests.assert(
  (select count(*) from updated) = 0,
  'an admin cannot change the owner''s role'
);

with deleted as (
  delete from public.memberships
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select tests.assert(
  (select count(*) from deleted) = 0,
  'an admin cannot remove the owner'
);

with updated as (
  update public.memberships set role = 'cashier'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
  returning role
)
select tests.assert(
  (select role from updated) = 'cashier',
  'an admin can change a non-owner role'
);

select tests.assert_raises(
  $$ update public.memberships set role = 'owner'
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000005' $$,
  'an admin cannot promote themselves to owner',
  '42501'
);

reset role;

-- Restore the waiter role for the later bill-visibility tests.
select tests.claims('aaaaaaaa-0000-0000-0000-000000000005');
set local role authenticated;
update public.memberships set role = 'waiter'
where user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
reset role;

-- ===========================================================================
-- 7. Order status flow
-- ===========================================================================
select tests.claims('aaaaaaaa-0000-0000-0000-000000000003'); -- kitchen
set local role authenticated;

select public.update_order_status(p_order_id => :'order1', p_status => 'preparing');

select tests.assert(
  (select status from public.orders where id = :'order1') = 'preparing',
  'kitchen can mark an order preparing'
);

select public.update_order_status(p_order_id => :'order1', p_status => 'served');

select tests.assert(
  (select status from public.orders where id = :'order1') = 'served',
  'kitchen can mark an order served'
);

select tests.assert_raises(
  format('select public.update_order_status(p_order_id => %L, p_status => %L)', :'order1', 'cancelled'),
  'kitchen cannot cancel an order',
  '42501'
);

select tests.assert_raises(
  format('select public.generate_bill(p_order_id => %L)', :'order1'),
  'kitchen cannot generate a bill',
  '42501'
);

reset role;

-- ===========================================================================
-- 8. Billing: GST, discounts, split payments
-- ===========================================================================
select tests.claims('aaaaaaaa-0000-0000-0000-000000000004'); -- cashier
set local role authenticated;

select public.generate_bill(
  p_order_id => :'order1',
  p_payment_mode => 'cash'
) as bill1 \gset

select tests.assert(
  (select bill_number from public.bills where id = :'bill1') = 1,
  'the first bill for a tenant is numbered 1'
);

select tests.assert(
  (select subtotal from public.bills where id = :'bill1') = 400.00,
  'bill subtotal is 400'
);

select tests.assert(
  (select tax_total from public.bills where id = :'bill1') = 33.00,
  'bill tax is 33'
);

select tests.assert(
  (select cgst_total from public.bills where id = :'bill1') = 16.50
    and (select sgst_total from public.bills where id = :'bill1') = 16.50
    and (select igst_total from public.bills where id = :'bill1') = 0.00,
  'intra-state GST is split evenly into CGST and SGST'
);

select tests.assert(
  (select total from public.bills where id = :'bill1') = 433.00,
  'bill total is 433'
);

select tests.assert(
  jsonb_array_length((select tax_breakup from public.bills where id = :'bill1')) = 2,
  'tax breakup has one bucket per GST slab'
);

select tests.assert(
  (select status from public.bills where id = :'bill1') = 'paid',
  'billing with a payment mode marks the bill paid'
);

select tests.assert(
  (select count(*) from public.payments where bill_id = :'bill1') = 1,
  'exactly one payment was recorded'
);

select tests.assert(
  (select status from public.orders where id = :'order1') = 'billed',
  'the order is marked billed'
);

select tests.assert(
  (select status from public.dining_tables where id = '70000000-0000-4000-8000-000000000001') = 'cleaning',
  'billing releases the table for cleaning'
);

select tests.assert(
  public.generate_bill(p_order_id => :'order1') = :'bill1',
  're-billing the same order returns the existing bill'
);

select tests.assert(
  (select count(*) from public.bills where restaurant_id = '11111111-1111-1111-1111-111111111111') = 1,
  're-billing did not create a duplicate bill'
);

select tests.assert(
  (select net_sales from public.daily_summaries
   where restaurant_id = '11111111-1111-1111-1111-111111111111'
     and summary_date = (now() at time zone 'Asia/Kolkata')::date) = 433.00,
  'daily summary is updated when a bill is paid'
);

select tests.assert(
  (select cash_total from public.daily_summaries
   where restaurant_id = '11111111-1111-1111-1111-111111111111'
     and summary_date = (now() at time zone 'Asia/Kolkata')::date) = 433.00,
  'daily summary splits the cash total'
);

-- A waiter can take orders but cannot see or create bills.
reset role;

select tests.claims('aaaaaaaa-0000-0000-0000-000000000002'); -- waiter
set local role authenticated;

select public.create_order(
  p_restaurant_id => '11111111-1111-1111-1111-111111111111',
  p_client_id => 'a0000000-0000-4000-8000-000000000002',
  p_items => '[{"menu_item_id":"e0000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb
) as order2 \gset

select tests.assert_raises(
  format('select public.generate_bill(p_order_id => %L)', :'order2'),
  'a waiter cannot generate a bill',
  '42501'
);

select tests.assert(
  (select count(*) from public.bills) = 0,
  'a waiter cannot read bills'
);

reset role;

-- Owner bills order2 with a flat discount; tax must be computed on the
-- discounted taxable value.
select tests.claims('aaaaaaaa-0000-0000-0000-000000000001');
set local role authenticated;

select public.generate_bill(
  p_order_id => :'order2',
  p_discount_amount => 30
) as bill2 \gset

select tests.assert(
  (select taxable_total from public.bills where id = :'bill2') = 270.00,
  'discount reduces the taxable value to 270'
);

select tests.assert(
  (select tax_total from public.bills where id = :'bill2') = 13.50,
  'GST is charged on the discounted value (13.50)'
);

select tests.assert(
  (select total from public.bills where id = :'bill2') = 283.50,
  'discounted bill total is 283.50'
);

select tests.assert(
  (select status from public.bills where id = :'bill2') = 'unpaid',
  'a bill generated without a payment mode is unpaid'
);

select public.record_payment(
  p_bill_id => :'bill2', p_mode => 'upi', p_amount => 100
);

select tests.assert(
  (select status from public.bills where id = :'bill2') = 'partial',
  'a part payment marks the bill partial'
);

select tests.assert_raises(
  format('select public.record_payment(p_bill_id => %L, p_mode => %L, p_amount => 1000)', :'bill2', 'cash'),
  'a payment larger than the outstanding amount is rejected',
  '22023'
);

select public.record_payment(
  p_bill_id => :'bill2', p_mode => 'cash', p_amount => 183.50
);

select tests.assert(
  (select status from public.bills where id = :'bill2') = 'paid',
  'settling the balance marks the bill paid'
);

select tests.assert(
  (select coalesce(sum(amount), 0) from public.payments where bill_id = :'bill2') = 283.50,
  'payments add up to the bill total'
);

-- Idempotent payment capture (offline retry).
select public.create_order(
  p_restaurant_id => '11111111-1111-1111-1111-111111111111',
  p_client_id => 'a0000000-0000-4000-8000-000000000003',
  p_items => '[{"menu_item_id":"e0000000-0000-4000-8000-000000000002","quantity":1}]'::jsonb
) as order3 \gset

select public.generate_bill(p_order_id => :'order3') as bill3 \gset

select public.record_payment(
  p_bill_id => :'bill3', p_mode => 'card', p_amount => 118,
  p_client_id => 'f0000000-0000-4000-8000-000000000001'
);

select tests.assert(
  public.record_payment(
    p_bill_id => :'bill3', p_mode => 'card', p_amount => 118,
    p_client_id => 'f0000000-0000-4000-8000-000000000001'
  ) is not null,
  'retrying a payment with the same client_id is idempotent'
);

select tests.assert(
  (select count(*) from public.payments where bill_id = :'bill3') = 1,
  'the retried payment was not captured twice'
);

-- ===========================================================================
-- 9. Voids
-- ===========================================================================
select public.create_order(
  p_restaurant_id => '11111111-1111-1111-1111-111111111111',
  p_client_id => 'a0000000-0000-4000-8000-000000000004',
  p_items => '[{"menu_item_id":"e0000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb
) as order4 \gset

select public.generate_bill(p_order_id => :'order4', p_payment_mode => 'upi') as bill4 \gset

select public.void_bill(p_bill_id => :'bill4', p_reason => 'customer cancelled after billing');

select tests.assert(
  (select status from public.bills where id = :'bill4') = 'void',
  'a bill can be voided with a reason'
);

select tests.assert(
  (select void_reason from public.bills where id = :'bill4') = 'customer cancelled after billing',
  'the void reason is stored on the bill'
);

select tests.assert(
  (select net_sales from public.daily_summaries
   where restaurant_id = '11111111-1111-1111-1111-111111111111'
     and summary_date = (now() at time zone 'Asia/Kolkata')::date) = 834.50,
  'void bills are excluded from net sales (433 + 283.50 + 118)'
);

select tests.assert(
  (select void_amount from public.daily_summaries
   where restaurant_id = '11111111-1111-1111-1111-111111111111'
     and summary_date = (now() at time zone 'Asia/Kolkata')::date) = 315.00,
  'voided amounts are tracked separately'
);

reset role;

select tests.assert(
  exists (
    select 1 from public.audit_log
    where table_name = 'bills'
      and record_id = :'bill4'
      and reason = 'customer cancelled after billing'
  ),
  'the void reason is written to the audit log'
);

select tests.assert(
  (select count(*) from public.audit_log
   where restaurant_id = '11111111-1111-1111-1111-111111111111') > 0,
  'audit rows carry the restaurant id'
);

-- ===========================================================================
-- 10. Expired subscription => read-only, reads still allowed
-- ===========================================================================
select tests.claims('cccccccc-0000-0000-0000-000000000001');
set local role authenticated;

select tests.assert(
  (select count(*) from public.menu_items) = 1,
  'an expired tenant can still read its menu'
);

select tests.assert(
  (select is_writable from public.v_my_restaurants) = false,
  'the app view reports an expired tenant as read-only'
);

with updated as (
  update public.menu_items set price = 99.00
  where restaurant_id = '33333333-3333-3333-3333-333333333333'
  returning 1
)
select tests.assert(
  (select count(*) from updated) = 0,
  'an expired tenant cannot edit the menu'
);

select tests.assert_raises(
  format(
    'select public.create_order(p_restaurant_id => %L, p_client_id => gen_random_uuid(), p_items => %L::jsonb)',
    '33333333-3333-3333-3333-333333333333',
    '[{"menu_item_id":"e0000000-0000-4000-8000-000000000005","quantity":1}]'
  ),
  'an expired tenant cannot create orders',
  '42501'
);

select tests.assert_raises(
  $$ insert into public.categories (restaurant_id, name)
     values ('33333333-3333-3333-3333-333333333333', 'Should Fail') $$,
  'an expired tenant cannot add categories',
  '42501'
);

reset role;

-- ===========================================================================
-- 11. Clients cannot tamper with money or entitlements
-- ===========================================================================
select tests.claims('aaaaaaaa-0000-0000-0000-000000000001');
set local role authenticated;

select tests.assert_raises(
  format('update public.bills set total = 1 where id = %L', :'bill1'),
  'a client cannot edit a bill total',
  '42501'
);

select tests.assert_raises(
  $$ update public.subscriptions
     set valid_until = now() + interval '10 years' $$,
  'a client cannot extend its own subscription',
  '42501'
);

select tests.assert_raises(
  format('insert into public.payments (restaurant_id, bill_id, mode, amount) values (%L, %L, %L, 1)',
    '11111111-1111-1111-1111-111111111111', :'bill1', 'cash'),
  'a client cannot insert a payment directly',
  '42501'
);

reset role;

-- ===========================================================================
-- 12. Operator path (service_role)
-- ===========================================================================
set local role service_role;

update public.subscriptions
set status = 'active', valid_until = now() + interval '30 days'
where restaurant_id = '33333333-3333-3333-3333-333333333333';

select tests.assert(
  (select valid_until > now() from public.subscriptions
   where restaurant_id = '33333333-3333-3333-3333-333333333333'),
  'the service role can extend a subscription manually'
);

reset role;

-- ===========================================================================
-- 13. Subscription countdown used by the expiry banners
-- ===========================================================================
select tests.claims('aaaaaaaa-0000-0000-0000-000000000001');
set local role authenticated;

select tests.assert(
  (select days_left from public.v_my_restaurants) between 29 and 30,
  'the view exposes days left for the expiry banner'
);

select tests.assert(
  (select plan_name from public.v_my_restaurants) = 'Growth',
  'the view exposes the current plan'
);

reset role;

-- ===========================================================================
-- 14. Onboarding RPC (create tenant + owner + trial atomically)
-- ===========================================================================
select tests.claims('dddddddd-0000-0000-0000-000000000001');
set local role authenticated;

select public.create_restaurant('Test Kitchen', p_state_code => '29') as new_restaurant \gset

select tests.assert(
  (select role from public.memberships
   where restaurant_id = :'new_restaurant'
     and user_id = 'dddddddd-0000-0000-0000-000000000001') = 'owner',
  'onboarding makes the caller the owner'
);

select tests.assert(
  (select count(*) from public.memberships
   where restaurant_id = :'new_restaurant') = 1,
  'onboarding does not create extra memberships'
);

select tests.assert(
  (select plan_id from public.subscriptions
   where restaurant_id = :'new_restaurant') = 'trial'
    and (select status from public.subscriptions
         where restaurant_id = :'new_restaurant') = 'trialing',
  'onboarding starts a trialing subscription on the trial plan'
);

select tests.assert(
  (select valid_until > now() + interval '13 days'
   from public.subscriptions
   where restaurant_id = :'new_restaurant'),
  'the trial length comes from the plans table (14 days)'
);

select tests.assert(
  (select is_writable from public.v_my_restaurants
   where id = :'new_restaurant') = true,
  'a freshly onboarded tenant is writable'
);

reset role;

select 'ALL TESTS PASSED' as result;

rollback;
