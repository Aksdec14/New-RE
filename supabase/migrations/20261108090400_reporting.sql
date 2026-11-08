-- ============================================================================
-- 090400_reporting
-- Pre-computed daily sales plus the immutable audit trail.
--
-- Reports read daily_summaries so a year of bills never has to be scanned at
-- dinner service. The summary is recomputed for the affected day whenever a
-- bill or payment changes.
-- ============================================================================

create table public.daily_summaries (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  summary_date date not null,
  orders_count integer not null default 0,
  bills_count integer not null default 0,
  void_bills_count integer not null default 0,
  gross_sales numeric(14, 2) not null default 0,
  discounts numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  net_sales numeric(14, 2) not null default 0,
  void_amount numeric(14, 2) not null default 0,
  cash_total numeric(14, 2) not null default 0,
  card_total numeric(14, 2) not null default 0,
  upi_total numeric(14, 2) not null default 0,
  other_total numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, summary_date)
);

comment on table public.daily_summaries is
  'Derived, idempotent aggregate. Safe to rebuild from bills + payments at any time.';

create or replace function private.refresh_daily_summary(
  p_restaurant_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_orders integer := 0;
  v_bills integer := 0;
  v_void_bills integer := 0;
  v_gross numeric(14, 2) := 0;
  v_discounts numeric(14, 2) := 0;
  v_tax numeric(14, 2) := 0;
  v_net numeric(14, 2) := 0;
  v_void_amount numeric(14, 2) := 0;
  v_cash numeric(14, 2) := 0;
  v_card numeric(14, 2) := 0;
  v_upi numeric(14, 2) := 0;
  v_other numeric(14, 2) := 0;
begin
  select r.timezone into v_timezone
  from public.restaurants r
  where r.id = p_restaurant_id;

  -- Guards for cascading deletes (restaurant removal) and bad input.
  if v_timezone is null or p_date is null then
    return;
  end if;

  select
    count(*) filter (where b.status <> 'void'),
    count(*) filter (where b.status = 'void'),
    coalesce(sum(b.subtotal) filter (where b.status <> 'void'), 0),
    coalesce(sum(b.discount_amount) filter (where b.status <> 'void'), 0),
    coalesce(sum(b.tax_total) filter (where b.status <> 'void'), 0),
    coalesce(sum(b.total) filter (where b.status <> 'void'), 0),
    coalesce(sum(b.total) filter (where b.status = 'void'), 0)
  into v_bills, v_void_bills, v_gross, v_discounts, v_tax, v_net, v_void_amount
  from public.bills b
  where b.restaurant_id = p_restaurant_id
    and (b.issued_at at time zone v_timezone)::date = p_date;

  select count(*)
  into v_orders
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.status <> 'cancelled'
    and (o.created_at at time zone v_timezone)::date = p_date;

  select
    coalesce(sum(p.amount) filter (where p.mode = 'cash'), 0),
    coalesce(sum(p.amount) filter (where p.mode = 'card'), 0),
    coalesce(sum(p.amount) filter (where p.mode = 'upi'), 0),
    coalesce(sum(p.amount) filter (where p.mode not in ('cash', 'card', 'upi')), 0)
  into v_cash, v_card, v_upi, v_other
  from public.payments p
  join public.bills b on b.id = p.bill_id
  where p.restaurant_id = p_restaurant_id
    and b.status <> 'void'
    and (coalesce(b.paid_at, b.issued_at) at time zone v_timezone)::date = p_date;

  insert into public.daily_summaries as ds (
    restaurant_id, summary_date, orders_count, bills_count, void_bills_count,
    gross_sales, discounts, tax_total, net_sales, void_amount,
    cash_total, card_total, upi_total, other_total, updated_at
  )
  values (
    p_restaurant_id, p_date, v_orders, v_bills, v_void_bills,
    v_gross, v_discounts, v_tax, v_net, v_void_amount,
    v_cash, v_card, v_upi, v_other, now()
  )
  on conflict (restaurant_id, summary_date) do update set
    orders_count = excluded.orders_count,
    bills_count = excluded.bills_count,
    void_bills_count = excluded.void_bills_count,
    gross_sales = excluded.gross_sales,
    discounts = excluded.discounts,
    tax_total = excluded.tax_total,
    net_sales = excluded.net_sales,
    void_amount = excluded.void_amount,
    cash_total = excluded.cash_total,
    card_total = excluded.card_total,
    upi_total = excluded.upi_total,
    other_total = excluded.other_total,
    updated_at = now();
end;
$$;

create or replace function private.on_bill_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_timezone text;
  v_date date;
begin
  v_restaurant_id := coalesce(new.restaurant_id, old.restaurant_id);

  select r.timezone into v_timezone
  from public.restaurants r
  where r.id = v_restaurant_id;

  if v_timezone is null then
    return null;
  end if;

  v_date := (coalesce(new.issued_at, old.issued_at) at time zone v_timezone)::date;

  if v_date is null then
    return null;
  end if;

  perform private.refresh_daily_summary(v_restaurant_id, v_date);

  -- A bill edited across midnight should also refresh the old day.
  if tg_op = 'UPDATE'
     and (old.issued_at at time zone v_timezone)::date <> v_date then
    perform private.refresh_daily_summary(
      v_restaurant_id,
      (old.issued_at at time zone v_timezone)::date
    );
  end if;

  return null;
end;
$$;

create trigger bills_refresh_daily_summary
  after insert or update of status, total, paid_at on public.bills
  for each row execute function private.on_bill_change();

create or replace function private.on_payment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_timezone text;
  v_bill_id uuid;
  v_date date;
begin
  v_restaurant_id := coalesce(new.restaurant_id, old.restaurant_id);
  v_bill_id := coalesce(new.bill_id, old.bill_id);

  select r.timezone into v_timezone
  from public.restaurants r
  where r.id = v_restaurant_id;

  select (coalesce(b.paid_at, b.issued_at) at time zone v_timezone)::date
  into v_date
  from public.bills b
  where b.id = v_bill_id;

  perform private.refresh_daily_summary(v_restaurant_id, v_date);

  return null;
end;
$$;

create trigger payments_refresh_daily_summary
  after insert or update or delete on public.payments
  for each row execute function private.on_payment_change();

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  actor_id uuid,
  actor_role text,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index audit_log_restaurant_created_idx
  on public.audit_log (restaurant_id, created_at desc);
create index audit_log_record_idx
  on public.audit_log (table_name, record_id);

-- Price edits, discounts, voids, role changes and subscription changes are the
-- disputes that actually happen. Order line inserts are intentionally excluded
-- to keep the log readable; line updates (voids) are included.
create trigger menu_items_audit
  after insert or update or delete on public.menu_items
  for each row execute function private.audit_trigger();

create trigger bills_audit
  after insert or update or delete on public.bills
  for each row execute function private.audit_trigger();

create trigger payments_audit
  after insert or update or delete on public.payments
  for each row execute function private.audit_trigger();

create trigger order_items_audit
  after update or delete on public.order_items
  for each row execute function private.audit_trigger();

create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function private.audit_trigger();

create trigger subscriptions_audit
  after insert or update or delete on public.subscriptions
  for each row execute function private.audit_trigger();
