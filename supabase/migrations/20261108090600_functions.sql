-- ============================================================================
-- 090600_functions
-- All writes to orders, order_items, bills and payments go through these
-- SECURITY DEFINER functions. They are the security boundary: each one
-- validates the caller's membership, role, subscription state and inputs, and
-- computes money in the database.
--
-- Every function sets `search_path = ''` and fully qualifies names, so a
-- malicious search_path cannot hijack a table or function reference.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Onboarding: create tenant + owner membership + trial subscription atomically
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
  v_trial_days integer;
  v_grace_days integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'restaurant name is required' using errcode = '22023';
  end if;

  -- Keep the free trial from being farmed by one account.
  if (
    select count(*)
    from public.memberships m
    where m.user_id = v_uid
      and m.role = 'owner'
  ) >= 3 then
    raise exception 'this account already owns 3 workspaces' using errcode = '22023';
  end if;

  select coalesce(max(trial_days), 14), coalesce(max(grace_period_days), 7)
  into v_trial_days, v_grace_days
  from public.plans
  where id = 'trial';

  insert into public.restaurants (
    name, gstin, state_code, address, phone, timezone, created_by
  )
  values (
    trim(p_name), p_gstin, p_state_code, p_address, p_phone, coalesce(p_timezone, 'Asia/Kolkata'), v_uid
  )
  returning id into v_restaurant_id;

  insert into public.memberships (restaurant_id, user_id, role, joined_at)
  values (v_restaurant_id, v_uid, 'owner', now());

  insert into public.subscriptions (
    restaurant_id, plan_id, status, valid_until, grace_period_days,
    current_period_start, current_period_end
  )
  values (
    v_restaurant_id, 'trial', 'trialing',
    now() + make_interval(days => v_trial_days), v_grace_days,
    now(), now() + make_interval(days => v_trial_days)
  );

  return v_restaurant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function private.compute_order_item_amounts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_net numeric;
begin
  v_net := round(new.quantity * new.unit_price, 2) - new.discount_amount;

  if v_net < 0 then
    raise exception 'line discount cannot exceed the line amount' using errcode = '22023';
  end if;

  new.line_total := round(v_net, 2);
  new.line_tax := round(v_net * new.tax_rate / 100, 2);

  return new;
end;
$$;

create trigger order_items_compute_amounts
  before insert or update of quantity, unit_price, discount_amount, tax_rate
  on public.order_items
  for each row execute function private.compute_order_item_amounts();

create or replace function private.recalculate_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2);
  v_tax numeric(12, 2);
  v_total numeric(12, 2);
begin
  select
    coalesce(sum(oi.quantity * oi.unit_price), 0),
    coalesce(sum(oi.discount_amount), 0),
    coalesce(sum(oi.line_tax), 0)
  into v_subtotal, v_discount, v_tax
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.status = 'active';

  v_subtotal := round(v_subtotal, 2);
  v_tax := round(v_tax, 2);
  v_total := round(v_subtotal - v_discount + v_tax, 2);

  update public.orders
  set subtotal = v_subtotal,
      discount_amount = v_discount,
      tax_total = v_tax,
      total = v_total
  where id = p_order_id;
end;
$$;

create or replace function private.on_order_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalculate_order_totals(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

create trigger order_items_recalculate_order
  after insert or update or delete on public.order_items
  for each row execute function private.on_order_item_change();

-- Inserts lines for an order from a JSON array:
--   [{"menu_item_id": "<uuid>", "quantity": 2, "notes": "no onion"}]
create or replace function private.insert_order_items(p_order_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_expected integer;
  v_inserted integer;
begin
  select * into v_order from public.orders where id = p_order_id;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one item is required' using errcode = '22023';
  end if;

  v_expected := jsonb_array_length(p_items);

  insert into public.order_items (
    restaurant_id, order_id, menu_item_id, item_name, hsn_code,
    unit_price, tax_rate, quantity, notes, created_by
  )
  select
    v_order.restaurant_id,
    v_order.id,
    m.id,
    m.name,
    m.hsn_code,
    m.price,
    m.tax_rate,
    (i ->> 'quantity')::numeric,
    nullif(i ->> 'notes', '')::text,
    auth.uid()
  from jsonb_array_elements(p_items) as i
  join public.menu_items m
    on m.id = (i ->> 'menu_item_id')::uuid
   and m.restaurant_id = v_order.restaurant_id
   and m.is_available;

  get diagnostics v_inserted = row_count;

  if v_inserted <> v_expected then
    raise exception 'one or more items are invalid, unavailable or belong to another restaurant'
      using errcode = '22023';
  end if;

  return v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_restaurant_id uuid,
  p_client_id uuid,
  p_items jsonb,
  p_table_id uuid default null,
  p_order_type text default 'dine_in',
  p_cover_count integer default 1,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_existing uuid;
  v_order_number bigint;
  v_kot_number bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  perform private.assert_role(p_restaurant_id, array['owner', 'admin', 'cashier', 'waiter']);
  perform private.assert_can_write(p_restaurant_id);

  -- Idempotency: a retried offline order returns the original id.
  select o.id into v_existing
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.client_id = p_client_id;

  if v_existing is not null then
    return v_existing;
  end if;

  if p_table_id is not null then
    if not exists (
      select 1 from public.dining_tables t
      where t.id = p_table_id and t.restaurant_id = p_restaurant_id
    ) then
      raise exception 'table not found' using errcode = 'P0002';
    end if;

    if exists (
      select 1 from public.orders o
      where o.table_id = p_table_id
        and o.status in ('new', 'preparing', 'served')
    ) then
      raise exception 'table already has an open order' using errcode = '23505';
    end if;
  end if;

  v_order_number := private.next_counter(p_restaurant_id, 'order');
  v_kot_number := private.next_counter(p_restaurant_id, 'kot');

  insert into public.orders (
    restaurant_id, order_number, kot_number, table_id, order_type, cover_count,
    customer_name, customer_phone, notes, client_id, created_by
  )
  values (
    p_restaurant_id, v_order_number, v_kot_number, p_table_id,
    coalesce(p_order_type, 'dine_in'), greatest(coalesce(p_cover_count, 1), 0),
    p_customer_name, p_customer_phone, p_notes, p_client_id, v_uid
  )
  returning id into v_order_id;

  perform private.insert_order_items(v_order_id, p_items);

  if p_table_id is not null then
    update public.dining_tables
    set status = 'occupied', current_order_id = v_order_id
    where id = p_table_id;
  end if;

  return v_order_id;
end;
$$;

create or replace function public.add_order_items(p_order_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  perform private.assert_role(v_order.restaurant_id, array['owner', 'admin', 'cashier', 'waiter']);
  perform private.assert_can_write(v_order.restaurant_id);

  if v_order.status not in ('new', 'preparing') then
    raise exception 'cannot add items to an order with status %', v_order.status
      using errcode = '22023';
  end if;

  perform private.insert_order_items(p_order_id, p_items);
end;
$$;

create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_is_kitchen boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  perform private.assert_member(v_order.restaurant_id);
  perform private.assert_can_write(v_order.restaurant_id);

  -- Kitchen staff may only move the ticket along; they cannot cancel orders.
  select private.has_role(v_order.restaurant_id, array['kitchen']) into v_is_kitchen;

  if v_is_kitchen then
    if p_status not in ('preparing', 'served') then
      raise exception 'kitchen users may only mark orders preparing or served'
        using errcode = '42501';
    end if;
  else
    perform private.assert_role(
      v_order.restaurant_id,
      array['owner', 'admin', 'cashier', 'waiter']
    );
  end if;

  if p_status = 'cancelled' then
    perform private.assert_role(v_order.restaurant_id, array['owner', 'admin', 'cashier']);
  end if;

  if v_order.status = 'billed' then
    raise exception 'bill already generated for this order' using errcode = '22023';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'order is already cancelled' using errcode = '22023';
  end if;

  if not (
    (v_order.status = 'new' and p_status in ('preparing', 'served', 'cancelled'))
    or (v_order.status = 'preparing' and p_status in ('served', 'cancelled'))
    or (v_order.status = 'served' and p_status = 'cancelled')
  ) then
    raise exception 'invalid status transition % -> %', v_order.status, p_status
      using errcode = '22023';
  end if;

  update public.orders
  set status = p_status,
      closed_at = case when p_status = 'cancelled' then now() else closed_at end
  where id = p_order_id;

  if p_status = 'cancelled' then
    perform set_config('app.audit_reason', 'order cancelled', true);

    if v_order.table_id is not null then
      update public.dining_tables
      set status = 'free', current_order_id = null
      where id = v_order.table_id;
    end if;
  end if;
end;
$$;

create or replace function public.void_order_item(p_order_item_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
  v_order public.orders;
begin
  select * into v_item from public.order_items where id = p_order_item_id;

  if not found then
    raise exception 'order item not found' using errcode = 'P0002';
  end if;

  select * into v_order from public.orders where id = v_item.order_id for update;

  perform private.assert_role(v_order.restaurant_id, array['owner', 'admin', 'cashier']);
  perform private.assert_can_write(v_order.restaurant_id);

  if v_item.status = 'void' then
    return;
  end if;

  if v_order.status = 'billed' then
    raise exception 'cannot void an item on a billed order; void the bill instead'
      using errcode = '22023';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'a reason is required to void an item' using errcode = '22023';
  end if;

  perform set_config('app.audit_reason', trim(p_reason), true);

  update public.order_items
  set status = 'void'
  where id = p_order_item_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Billing
--
-- Totals are computed here and only here. The browser may send a discount, but
-- it can never send a total.
-- ---------------------------------------------------------------------------
create or replace function public.generate_bill(
  p_order_id uuid,
  p_discount_amount numeric default 0,
  p_discount_percent numeric default null,
  p_payment_mode text default null,
  p_idempotency_key uuid default null,
  p_is_interstate boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_existing uuid;
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2);
  v_taxable numeric(12, 2);
  v_breakup jsonb;
  v_cgst numeric(12, 2) := 0;
  v_sgst numeric(12, 2) := 0;
  v_igst numeric(12, 2) := 0;
  v_tax numeric(12, 2);
  v_total numeric(12, 2);
  v_bill_id uuid;
  v_bill_number bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  perform private.assert_role(v_order.restaurant_id, array['owner', 'admin', 'cashier']);
  perform private.assert_can_write(v_order.restaurant_id);

  -- One bill per order makes this naturally idempotent.
  select b.id into v_existing from public.bills b where b.order_id = p_order_id;
  if v_existing is not null then
    return v_existing;
  end if;

  if p_idempotency_key is not null then
    select b.id into v_existing
    from public.bills b
    where b.restaurant_id = v_order.restaurant_id
      and b.idempotency_key = p_idempotency_key;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'cannot bill a cancelled order' using errcode = '22023';
  end if;

  select coalesce(sum(oi.quantity * oi.unit_price - oi.discount_amount), 0)
  into v_subtotal
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.status = 'active';

  v_subtotal := round(v_subtotal, 2);

  if v_subtotal <= 0 then
    raise exception 'order has no billable items' using errcode = '22023';
  end if;

  if p_discount_percent is not null then
    if p_discount_percent < 0 or p_discount_percent > 100 then
      raise exception 'discount percent must be between 0 and 100' using errcode = '22023';
    end if;
    v_discount := round(v_subtotal * p_discount_percent / 100, 2);
  else
    v_discount := round(coalesce(p_discount_amount, 0), 2);
  end if;

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'discount must be between 0 and the order subtotal' using errcode = '22023';
  end if;

  v_taxable := v_subtotal - v_discount;

  -- GST is computed per tax slab on the discounted taxable value, then split
  -- into CGST/SGST (intra-state) or IGST (inter-state).
  with buckets as (
    select
      oi.tax_rate as rate,
      sum(oi.quantity * oi.unit_price - oi.discount_amount) as bucket_amount
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.status = 'active'
    group by oi.tax_rate
  ),
  taxed as (
    select
      rate,
      round(bucket_amount * v_taxable / v_subtotal, 2) as taxable,
      round(round(bucket_amount * v_taxable / v_subtotal, 2) * rate / 100, 2) as tax
    from buckets
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rate', rate,
        'taxable', taxable,
        'cgst', case when p_is_interstate then 0 else round(tax / 2, 2) end,
        'sgst', case when p_is_interstate then 0 else tax - round(tax / 2, 2) end,
        'igst', case when p_is_interstate then tax else 0 end
      ) order by rate
    ),
    '[]'::jsonb
  )
  into v_breakup
  from taxed;

  select
    coalesce(sum((e ->> 'cgst')::numeric), 0),
    coalesce(sum((e ->> 'sgst')::numeric), 0),
    coalesce(sum((e ->> 'igst')::numeric), 0)
  into v_cgst, v_sgst, v_igst
  from jsonb_array_elements(v_breakup) as e;

  v_tax := round(v_cgst + v_sgst + v_igst, 2);
  v_total := round(v_taxable + v_tax, 2);
  v_bill_number := private.next_counter(v_order.restaurant_id, 'bill');

  insert into public.bills (
    restaurant_id, order_id, bill_number, subtotal, discount_amount, discount_percent,
    taxable_total, cgst_total, sgst_total, igst_total, tax_total, total,
    status, tax_breakup, is_interstate, idempotency_key, created_by,
    customer_name, issued_at, paid_at
  )
  values (
    v_order.restaurant_id, p_order_id, v_bill_number, v_subtotal, v_discount, p_discount_percent,
    v_taxable, v_cgst, v_sgst, v_igst, v_tax, v_total,
    case when p_payment_mode is null then 'unpaid' else 'paid' end,
    v_breakup, coalesce(p_is_interstate, false), p_idempotency_key, v_uid,
    v_order.customer_name, now(),
    case when p_payment_mode is null then null else now() end
  )
  returning id into v_bill_id;

  update public.orders
  set status = 'billed', closed_at = now()
  where id = p_order_id;

  if v_order.table_id is not null then
    update public.dining_tables
    set status = 'cleaning', current_order_id = null
    where id = v_order.table_id;
  end if;

  if p_payment_mode is not null then
    insert into public.payments (restaurant_id, bill_id, mode, amount, received_by)
    values (v_order.restaurant_id, v_bill_id, p_payment_mode, v_total, v_uid);
  end if;

  return v_bill_id;
end;
$$;

create or replace function public.record_payment(
  p_bill_id uuid,
  p_mode text,
  p_amount numeric,
  p_reference text default null,
  p_client_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_bill public.bills;
  v_existing uuid;
  v_paid numeric(12, 2);
  v_payment_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_bill from public.bills where id = p_bill_id for update;

  if not found then
    raise exception 'bill not found' using errcode = 'P0002';
  end if;

  perform private.assert_role(v_bill.restaurant_id, array['owner', 'admin', 'cashier']);
  perform private.assert_can_write(v_bill.restaurant_id);

  if p_client_id is not null then
    select p.id into v_existing
    from public.payments p
    where p.restaurant_id = v_bill.restaurant_id
      and p.client_id = p_client_id;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if v_bill.status = 'void' then
    raise exception 'cannot take payment for a void bill' using errcode = '22023';
  end if;

  if v_bill.status = 'paid' then
    raise exception 'bill is already fully paid' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be greater than zero' using errcode = '22023';
  end if;

  select coalesce(sum(p.amount), 0) into v_paid
  from public.payments p
  where p.bill_id = p_bill_id;

  if v_paid + p_amount > v_bill.total + 0.005 then
    raise exception 'payment exceeds the outstanding amount (outstanding %)',
      round(v_bill.total - v_paid, 2)
      using errcode = '22023';
  end if;

  insert into public.payments (
    restaurant_id, bill_id, mode, amount, reference, client_id, received_by
  )
  values (
    v_bill.restaurant_id, p_bill_id, p_mode, round(p_amount, 2), p_reference, p_client_id, v_uid
  )
  returning id into v_payment_id;

  v_status := case
    when v_paid + p_amount >= v_bill.total - 0.005 then 'paid'
    else 'partial'
  end;

  update public.bills
  set status = v_status,
      paid_at = case when v_status = 'paid' then now() else paid_at end
  where id = p_bill_id;

  return v_payment_id;
end;
$$;

create or replace function public.void_bill(p_bill_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_bill from public.bills where id = p_bill_id for update;

  if not found then
    raise exception 'bill not found' using errcode = 'P0002';
  end if;

  perform private.assert_role(v_bill.restaurant_id, array['owner', 'admin']);
  perform private.assert_can_write(v_bill.restaurant_id);

  if v_bill.status = 'void' then
    return;
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'a reason is required to void a bill' using errcode = '22023';
  end if;

  perform set_config('app.audit_reason', trim(p_reason), true);

  update public.bills
  set status = 'void',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = trim(p_reason)
  where id = p_bill_id;
end;
$$;

create or replace function public.set_table_status(p_table_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table public.dining_tables;
begin
  select * into v_table from public.dining_tables where id = p_table_id;

  if not found then
    raise exception 'table not found' using errcode = 'P0002';
  end if;

  perform private.assert_role(v_table.restaurant_id, array['owner', 'admin', 'cashier', 'waiter']);
  perform private.assert_can_write(v_table.restaurant_id);

  if p_status not in ('free', 'occupied', 'reserved', 'cleaning') then
    raise exception 'invalid table status %', p_status using errcode = '22023';
  end if;

  update public.dining_tables
  set status = p_status,
      current_order_id = case when p_status = 'free' then null else current_order_id end
  where id = p_table_id;
end;
$$;
