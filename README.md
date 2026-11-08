# Resto POS — Phase 0

The foundation for the Supabase-based restaurant SaaS in the plan: schema,
row level security, server-side GST billing, subscription gating, an
offline-capable Next.js shell, and a test suite that proves tenant isolation.

Phase 0 is deliberately boring: no menu screens, no order pad, no payment
gateway yet. What exists is the part that is expensive to get wrong later.

---

## What works right now

- **Multi-tenant schema** — every tenant table carries `restaurant_id`, uses
  UUID primary keys, and is indexed on `(restaurant_id, created_at)`.
- **RLS on all 14 tables**, with a single isolation rule plus role and
  subscription checks on writes.
- **Server-side money** — `generate_bill()` computes subtotal, discount,
  per-slab GST, CGST/SGST/IGST split and totals in Postgres. The browser cannot
  send a total.
- **Idempotency** — orders, bills and payments accept client-generated keys, so
  offline retries never duplicate.
- **Subscription gating** — expired tenants become read-only (reads and
  exports keep working) after the grace period, enforced inside policies and
  RPCs. Renewals are recorded manually by the operator; there is no payment
  gateway yet.
- **Audit trail** — price edits, discounts, voids, role changes and subscription
  changes are recorded with actor, role and reason.
- **Sequential per-tenant numbering** for orders, KOTs and bills.
- **Auth + onboarding** — email/password sign-up, session refresh middleware,
  and a `create_restaurant()` RPC that atomically creates the tenant, makes the
  caller owner, and starts the trial.
- **PWA shell** — manifest, service worker, offline page, and an IndexedDB
  write queue with idempotency keys (queue wiring lands in Phase 3).
- **83 passing security assertions** against a real Postgres instance.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL + anon key
```

### Option A — local Supabase (needs Docker)

```bash
npx supabase start
npx supabase db reset          # migrations + seed
npm run dev
```

`supabase start` prints the local API URL and anon key for `.env.local`.
Local email confirmations are disabled in `supabase/config.toml`.

### Option B — hosted Supabase

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
npm run dev
```

Then open <http://localhost:3000>, sign up, and complete the one-step onboarding.

> Email confirmations are enabled on hosted projects by default. If sign-up
> lands on "check your email", confirm the link (or disable confirmations in
> Authentication → Providers → Email while developing).

---

## Verify it yourself

```bash
npm run db:test
```

This needs **no Docker**. It uses your local PostgreSQL binaries (`initdb`,
`pg_ctl`, `psql`) to create a throwaway cluster, applies a Supabase shim, runs
every migration, loads fixtures, and executes `supabase/tests/rls_policies.sql`
inside a transaction that rolls back.

```
→ platform shim
→ migrations
→ fixtures
→ RLS + billing tests
...
ALL TESTS PASSED
```

What the suite actually proves:

| Area | Examples |
| --- | --- |
| Isolation | Restaurant B reads 0 rows from Restaurant A (orders, menu, view) |
| Anonymous | `anon` can read plans, cannot read tenant tables or call RPCs |
| Roles | Waiter/kitchen cannot edit prices; kitchen cannot bill or cancel |
| Money | 300 + 100 items at 5% + 18% → tax 33, total 433; discount → tax on discounted value |
| GST | Intra-state split into equal CGST/SGST, per-slab breakup stored |
| Read-only | Expired tenant can read, cannot edit menu, add categories or create orders |
| Tampering | Clients cannot update bills, payments or subscriptions directly |
| Idempotency | Same client_id returns the same order; same payment key returns the same payment |
| Audit | Price edits and bill voids are logged with actor role and reason |
| Operator path | `service_role` can extend a subscription manually |

You can also point it at a live project:

```bash
psql "$DATABASE_URL" -f supabase/tests/rls_policies.sql
```

The suite is plain SQL rather than pgTAP so it runs anywhere without extensions.

---

## Database at a glance

| Table | Purpose |
| --- | --- |
| `restaurants` | Tenant record: name, GSTIN, state code, address, timezone, settings |
| `plans` | Global plan catalogue (the one table without `restaurant_id`) |
| `memberships` | `auth.users` → restaurant, with role `owner/admin/cashier/waiter/kitchen` |
| `subscriptions` | One current plan per tenant, `valid_until`, grace days, renewal notes |
| `subscription_events` | Append-only renewal history with actor and details |
| `categories`, `menu_items` | Menu, tax-exclusive price, tax rate, availability |
| `dining_tables` | Tables, seats, live status (`free/occupied/reserved/cleaning`) |
| `orders`, `order_items` | Orders with status flow and price/name **snapshots** |
| `bills`, `payments` | Final invoice, GST breakup, split payments |
| `daily_summaries` | Derived daily totals, refreshed on bill/payment change |
| `audit_log` | Who changed what, with before/after JSON and reason |

Key functions:

| Function | Notes |
| --- | --- |
| `public.create_restaurant(...)` | Tenant + owner membership + trial, atomically |
| `public.create_order(...)` | Idempotent, validates table/menu ownership, snapshots prices |
| `public.add_order_items(...)` | Only while the order is new/preparing |
| `public.update_order_status(...)` | Kitchen may only set `preparing`/`served` |
| `public.void_order_item(...)` | Requires a reason, admin/cashier only |
| `public.generate_bill(...)` | Computes all totals, marks order billed, optional payment |
| `public.record_payment(...)` | Split payments, rejects overpayment, idempotent |
| `public.void_bill(...)` | Requires reason, admin/owner only |
| `public.set_table_status(...)` | Floor status changes for service staff |

Private helpers live in the non-exposed `private` schema: `is_member`,
`has_role`, `is_writable`, `assert_role`, `assert_can_write`, `next_counter`,
`refresh_daily_summary`, and the audit trigger.

---

## Security model

### One isolation rule

Every policy starts from `private.is_member(restaurant_id)`, which is
`SECURITY DEFINER` so reading `memberships` cannot recurse into the
`memberships` policy.

```sql
create policy orders_select on public.orders
  for select to authenticated
  using (private.is_member(restaurant_id));
```

### Writes are split in two

| Table | Client writes | Who |
| --- | --- | --- |
| `restaurants` | direct `UPDATE` | owner, admin |
| `memberships`, `categories`, `menu_items`, `dining_tables` | direct CRUD | role-gated in policy |
| `orders`, `order_items`, `bills`, `payments` | **RPC only** | validated inside the function |
| `subscriptions` | service role only | operator renewal (no gateway) |
| `daily_summaries`, `audit_log` | derived | triggers only |

Orders, bills and payments have no insert/update/delete policy at all. This is
intentional: RLS cannot express "the kitchen may change `status` but not
`total`", and column-level grants cannot distinguish application roles. The
RPCs are the only place those invariants can be enforced, so they are the only
way in.

### Subscription read-only mode

`private.is_writable()` is true only while the row is `trialing`, `active` or
`past_due` **and** `now() < valid_until + grace_period_days`. It is called:

- in every write policy's `USING`/`WITH CHECK`;
- at the top of every mutating RPC.

No subscription row means **not writable** (fail closed). Reads are never
gated, so reports and exports keep working after expiry.

### Numbers nobody can guess

Orders, KOTs and bills use `private.next_counter(restaurant_id, scope)`, an
atomic upsert on a per-tenant counter row. Bill numbers are sequential per
restaurant, not global.

### Money rules

- Prices are stored tax-exclusive as `numeric(12,2)`.
- Discounts (flat or percent) reduce the taxable value before GST.
- GST is computed per tax slab, then split 50/50 into CGST/SGST, or into IGST
  when `p_is_interstate` is true.
- Bill totals are frozen on the bill row; `order_items` keep a snapshot of the
  menu item's name, price and tax rate.
- One bill per order, so billing is naturally idempotent.
- `round_off` exists for future rupee rounding and is currently 0.

---

## Offline design

`src/lib/offline/queue.ts` stores mutations in IndexedDB:

```ts
const mutation = await enqueue("create_order", payload);
// mutation.idempotencyKey is sent as p_client_id
```

Replay stops on the first failure so a payment can never sync before its bill.
`create_order`, `generate_bill` and `record_payment` all look up the key before
inserting, which makes retries safe.

What is deliberately **not** done yet (Phase 3): wiring the queue to the order
screen, background sync registration, conflict UI, and cached menu for offline
browsing. The data model is ready for it.

---

## Project layout

```
src/
  app/
    login/, signup/            auth pages (server actions)
    onboarding/                create_restaurant form
    dashboard/                 workspace overview
    offline/                   cached offline fallback
    auth/callback/             PKCE code exchange
  components/                  shell, sync status, submit button
  lib/
    actions/                   server actions (auth, restaurant)
    offline/queue.ts           IndexedDB queue + idempotency keys
    supabase/                  browser, server, admin, middleware clients
    types/database.ts          hand-written types (regenerate with db:types)
  middleware.ts                session refresh + route protection
supabase/
  migrations/                  schema, RLS, functions, realtime
  tests/rls_policies.sql       83-assertion security suite
  seed.sql                     optional demo tenant
scripts/
  db-test.sh                   throwaway Postgres + migrations + tests
  sql/00_supabase_shim.sql     local auth/roles/realtime shim
  sql/10_fixtures.sql          deterministic tenants and users
```

---

## Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | RLS still applies |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Bypasses RLS. Operator jobs and exports |
| `NEXT_PUBLIC_SITE_URL` | server | Origin used in confirmation emails |

`src/lib/supabase/admin.ts` throws if it is ever imported into a browser bundle.

---

## Before real customers

These are dashboard/ops tasks, not code:

- [ ] Enable **MFA (TOTP)** for owner and admin accounts; enforce it in the app.
- [ ] Configure auth **rate limits** and a custom SMTP provider.
- [ ] Upgrade to Supabase **Pro**; enable daily backups and PITR.
- [ ] Move to a region close to your restaurants (Mumbai for India).
- [ ] Keep subscription changes behind `service_role` until the operator panel
      exists; record the UPI/cash reference in `subscription_events.details`.
- [ ] Rotate the service-role key if it ever appears in a log or client bundle.
- [ ] Add Sentry, uptime alerts and a support channel.
- [ ] Review RLS policies with a second pair of eyes and re-run the suite
      against the production project.
- [ ] Check current Supabase Realtime connection limits for your plan; only
      `orders`, `order_items`, `dining_tables` and `bills` are published.
- [ ] Test 58mm and 80mm printing on the actual printer before the pilot.
- [ ] Publish terms and a privacy policy (DPDP Act).

---

## Phase map

| Phase | Status |
| --- | --- |
| 0 · Setup, schema, RLS, tests | **Done** |
| 1 · Core billing UI (menu, orders, bills, prints, reports) | Next |
| 2 · Realtime kitchen/waiter screens, PIN switching, audit UI | Schema ready |
| 3 · Offline mode wired into the order screen | Queue + idempotency ready |
| 4 · Plans, manual renewal, expiry banners, read-only | Gating + service-role path ready |
| 5 · Launch hardening, monitoring, legal, pilot | Ops checklist above |
| 6 · Inventory, multi-branch, online ordering | Not started |

---

## Deliberate deferrals

- No menu/order UI yet; Phase 0 is the data and security layer.
- No payment gateway. Subscriptions are extended manually through
  `service_role`; the model, gating and operator write path are in place and
  tested.
- Inter-state GST is a per-bill flag (`p_is_interstate`); automatically deriving
  it from place of supply is Phase 1.
- One workspace per page load. Multi-branch is Phase 6.
- `src/lib/types/database.ts` is hand-written so the repo builds without the
  Supabase CLI. Regenerate it with `npm run db:types` once the local stack runs.
