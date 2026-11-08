-- ============================================================================
-- 090300_orders
-- Orders, order lines, bills and payments.
--
-- Rule: these tables have SELECT policies only. Every mutation goes through a
-- SECURITY DEFINER function in 090600_functions.sql, which is where role
-- checks, status transitions, totals and idempotency are enforced. That is the
-- only practical way to stop a kitchen user from rewriting a price, or a
-- browser from inventing a bill total.
-- ============================================================================

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  -- Sequential per restaurant, allocated by private.next_counter().
  order_number bigint not null,
  kot_number bigint,
  table_id uuid references public.dining_tables (id) on delete set null,
  order_type text not null default 'dine_in'
    check (order_type in ('dine_in', 'takeaway', 'delivery', 'online')),
  status text not null default 'new'
    check (status in ('new', 'preparing', 'served', 'billed', 'cancelled')),
  cover_count integer not null default 1 check (cover_count between 0 and 100),
  customer_name text,
  customer_phone text,
  notes text,
  -- Denormalised running totals, kept in sync by a trigger on order_items.
  -- These are proforma; the bill is the legal record.
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  tax_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  -- Client-generated idempotency key: retrying a queued order after a network
  -- blip must return the original order, not create a second one.
  client_id uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, order_number),
  unique (restaurant_id, client_id)
);

create index orders_restaurant_created_idx
  on public.orders (restaurant_id, created_at desc);
create index orders_open_idx
  on public.orders (restaurant_id, status) where status in ('new', 'preparing', 'served');
create index orders_table_idx
  on public.orders (table_id) where status in ('new', 'preparing', 'served');

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();

alter table public.dining_tables
  add constraint dining_tables_current_order_fkey
  foreign key (current_order_id) references public.orders (id) on delete set null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  -- Snapshots: a later price or name edit must not rewrite history.
  item_name text not null,
  hsn_code text,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  tax_rate numeric(5, 2) not null check (tax_rate between 0 and 28),
  quantity numeric(10, 3) not null check (quantity > 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  line_total numeric(12, 2) not null default 0,
  line_tax numeric(12, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'void')),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_restaurant_created_idx on public.order_items (restaurant_id, created_at desc);

create trigger order_items_set_updated_at
  before update on public.order_items
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bills
-- ---------------------------------------------------------------------------
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  -- One bill per order for now. Re-billing after a void needs an explicit
  -- reopen flow, which is out of scope for Phase 0.
  order_id uuid not null unique references public.orders (id) on delete restrict,
  bill_number bigint not null,
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  discount_percent numeric(5, 2),
  taxable_total numeric(12, 2) not null default 0,
  cgst_total numeric(12, 2) not null default 0,
  sgst_total numeric(12, 2) not null default 0,
  igst_total numeric(12, 2) not null default 0,
  tax_total numeric(12, 2) not null default 0,
  round_off numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid', 'void')),
  -- Per-rate GST split, e.g.
  -- [{"rate":5,"taxable":270.00,"cgst":6.75,"sgst":6.75,"igst":0}]
  tax_breakup jsonb not null default '[]'::jsonb,
  is_interstate boolean not null default false,
  customer_name text,
  customer_gstin text,
  idempotency_key uuid,
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, bill_number),
  unique (restaurant_id, idempotency_key)
);

create index bills_restaurant_created_idx
  on public.bills (restaurant_id, created_at desc);
create index bills_unpaid_idx
  on public.bills (restaurant_id, status) where status in ('unpaid', 'partial');
create index bills_restaurant_paid_idx
  on public.bills (restaurant_id, paid_at desc) where status = 'paid';

create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  bill_id uuid not null references public.bills (id) on delete cascade,
  mode text not null check (mode in ('cash', 'card', 'upi', 'wallet', 'credit', 'other')),
  amount numeric(12, 2) not null check (amount > 0),
  reference text,
  -- Idempotency for offline-retried payment captures.
  client_id uuid,
  received_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index payments_bill_idx on public.payments (bill_id);
create index payments_restaurant_created_idx on public.payments (restaurant_id, created_at desc);
create unique index payments_restaurant_client_key
  on public.payments (restaurant_id, client_id) where client_id is not null;
