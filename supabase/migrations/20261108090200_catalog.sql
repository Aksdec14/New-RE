-- ============================================================================
-- 090200_catalog
-- Menu categories, menu items and dining tables.
--
-- Price and tax live on the menu item and are snapshotted onto every order
-- line, so historical bills never change when a price is edited tomorrow.
-- ============================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_restaurant_name_key
  on public.categories (restaurant_id, lower(name));

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  -- Tax-exclusive selling price. Tax is computed server-side, never trusted
  -- from the client.
  price numeric(12, 2) not null check (price >= 0),
  tax_rate numeric(5, 2) not null default 5.00 check (tax_rate between 0 and 28),
  hsn_code text,
  is_veg boolean not null default true,
  is_available boolean not null default true,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_items_restaurant_category_idx
  on public.menu_items (restaurant_id, category_id, sort_order);
create index menu_items_available_idx
  on public.menu_items (restaurant_id) where is_available;

create trigger menu_items_set_updated_at
  before update on public.menu_items
  for each row execute function private.set_updated_at();

-- Named `dining_tables` rather than `tables` to avoid confusion with
-- information_schema / catalog relations everywhere in SQL and tooling.
create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 40),
  seats integer not null default 4 check (seats between 1 and 100),
  floor text,
  status text not null default 'free'
    check (status in ('free', 'occupied', 'reserved', 'cleaning')),
  -- Set while an order is open on the table; FK added in the orders migration.
  current_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, label)
);

create index dining_tables_restaurant_status_idx
  on public.dining_tables (restaurant_id, status);

create trigger dining_tables_set_updated_at
  before update on public.dining_tables
  for each row execute function private.set_updated_at();
