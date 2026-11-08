import { redirect } from "next/navigation";

import { SyncStatus } from "@/components/sync-status";
import { formatDate, roleLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { MyRestaurantRow } from "@/lib/types/database";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const TONE = {
  good: {
    box: "border-good/20 bg-good-soft",
    dot: "bg-good",
    title: "text-good",
  },
  warn: {
    box: "border-warn/20 bg-warn-soft",
    dot: "bg-warn",
    title: "text-warn",
  },
  bad: {
    box: "border-bad/20 bg-bad-soft",
    dot: "bg-bad",
    title: "text-bad",
  },
} as const;

type Tone = keyof typeof TONE;

function subscriptionState(restaurant: MyRestaurantRow): {
  tone: Tone;
  title: string;
  detail: string;
} {
  if (!restaurant.is_writable) {
    return {
      tone: "bad",
      title: "Workspace is read-only",
      detail: `The subscription ended on ${formatDate(
        restaurant.valid_until,
        restaurant.timezone,
      )} and the grace period is over. Reading data and exporting stay available; creating orders, bills and menu edits are blocked by RLS.`,
    };
  }

  if (restaurant.in_grace) {
    return {
      tone: "warn",
      title: "Grace period",
      detail: `Payment is overdue. The workspace becomes read-only once the ${
        restaurant.grace_period_days ?? 7
      }-day grace window ends.`,
    };
  }

  if (restaurant.days_left <= 15) {
    return {
      tone: "warn",
      title: `${restaurant.days_left} day${
        restaurant.days_left === 1 ? "" : "s"
      } left`,
      detail: `Plan is valid until ${formatDate(
        restaurant.valid_until,
        restaurant.timezone,
      )}.`,
    };
  }

  return {
    tone: "good",
    title: "Subscription active",
    detail: `Valid until ${formatDate(
      restaurant.valid_until,
      restaurant.timezone,
    )}.`,
  };
}

function SetupNotice({ message }: { message: string }) {
  return (
    <div className="card max-w-2xl">
      <h1 className="text-xl font-semibold">Database is not ready</h1>
      <p className="mt-2 text-sm muted">
        The app is connected, but the Phase 0 schema is missing or the migrations
        have not been applied to this project.
      </p>
      <p className="mt-4 rounded-lg bg-canvas px-3 py-2 font-mono text-xs">
        {message}
      </p>
      <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm">
        <li>
          Run <code className="font-mono text-xs">npx supabase link</code> and{" "}
          <code className="font-mono text-xs">npx supabase db push</code>.
        </li>
        <li>
          Verify locally first:{" "}
          <code className="font-mono text-xs">npm run db:test</code>.
        </li>
        <li>Reload this page.</li>
      </ol>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("v_my_restaurants")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    return <SetupNotice message={error.message} />;
  }

  const restaurant = data?.[0];

  if (!restaurant) {
    redirect("/onboarding");
  }

  const [menuResult, tableResult, openOrderResult] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id),
    supabase
      .from("dining_tables")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .in("status", ["new", "preparing", "served"]),
  ]);

  const stats = [
    { label: "Menu items", value: menuResult.count ?? 0 },
    { label: "Tables", value: tableResult.count ?? 0 },
    { label: "Open orders", value: openOrderResult.count ?? 0 },
  ];

  const state = subscriptionState(restaurant);
  const tone = TONE[state.tone];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] muted">
            Workspace
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {restaurant.name}
          </h1>
          <p className="mt-1 text-sm muted">
            {roleLabel(restaurant.role)} ·{" "}
            {restaurant.gstin ?? "GSTIN not set"} · {restaurant.timezone}
          </p>
        </div>

        <span className="badge border-line bg-surface text-ink">
          {restaurant.plan_name ?? "No plan"} ·{" "}
          {restaurant.subscription_status ?? "unknown"}
        </span>
      </div>

      <section
        className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${tone.box}`}
        aria-live="polite"
      >
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
        <div>
          <p className={`text-sm font-semibold ${tone.title}`}>{state.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink/70">{state.detail}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Plan &amp; billing</h2>
              <p className="mt-1 text-sm muted">
                Entitlements are checked in Postgres on every write, not just in the UI.
              </p>
            </div>
            <span className="badge border-line bg-canvas text-muted">
              Manual renewal · Phase 4
            </span>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide muted">Plan</dt>
              <dd className="mt-1 text-sm font-medium">
                {restaurant.plan_name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide muted">Valid until</dt>
              <dd className="mt-1 text-sm font-medium">
                {formatDate(restaurant.valid_until, restaurant.timezone)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide muted">Days left</dt>
              <dd className="mt-1 text-sm font-medium">
                {restaurant.is_writable ? restaurant.days_left : 0}
              </dd>
            </div>
          </dl>

          <p className="mt-6 rounded-xl bg-canvas px-4 py-3 text-xs leading-relaxed muted">
            Read-only mode is enforced by the{" "}
            <code className="font-mono">private.is_writable()</code> check inside every
            write policy and RPC. Exports keep working. There is no payment gateway
            yet: renewals are recorded by the operator and appear here as a new{" "}
            <code className="font-mono">valid_until</code>. Expiry banners at 15, 7 and
            3 days arrive with the subscription screen in Phase 4.
          </p>
        </div>

        <div className="card">
          <h2 className="text-base font-semibold">At a glance</h2>
          <dl className="mt-5 space-y-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-sm muted">{stat.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs leading-relaxed muted">
            Counts come straight from Postgres and are already filtered by RLS.
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <h2 className="text-base font-semibold">Offline readiness</h2>
          <div className="mt-4">
            <SyncStatus />
          </div>
          <p className="mt-4 text-xs leading-relaxed muted">
            The IndexedDB queue and idempotent RPCs are in place. Connecting the queue
            to the order screen is Phase 3, and it is not optional: service must survive
            a dropped connection.
          </p>
        </div>

        <div className="card">
          <h2 className="text-base font-semibold">Security posture</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              "RLS on every tenant table, keyed on restaurant_id",
              "Bill totals and GST computed only in Postgres",
              "Role checks inside policies and RPCs",
              "Audit log for price edits, discounts and voids",
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span className="leading-snug text-ink/75">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2 className="text-base font-semibold">Verify locally</h2>
          <p className="mt-2 text-sm muted">
            The policy suite runs against a throwaway Postgres cluster, no Docker
            required.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-ink px-4 py-3 font-mono text-xs leading-relaxed text-white/85">
{`npm run db:test

# 83 assertions
# ALL TESTS PASSED`}
          </pre>
          <p className="mt-4 text-xs leading-relaxed muted">
            It proves Restaurant B cannot read Restaurant A&apos;s data, that expired
            tenants are read-only, and that kitchen users cannot bill.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Phase 0 checklist</h2>
          <span className="badge border-good/20 bg-good-soft text-good">Complete</span>
        </div>

        <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {[
            "Schema, indexes and updated_at triggers",
            "RLS policies for every tenant table",
            "Server-side bill totals, GST split and discounts",
            "Audit trail for prices, voids and roles",
            "Subscription read-only gating with grace period",
            "Auth, onboarding and owner bootstrap",
            "PWA shell and offline write queue",
            "83-assertion policy and billing test suite",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 text-good" aria-hidden>
                ✓
              </span>
              <span className="text-ink/80">{item}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
          <span className="font-medium">Next:</span> Phase 1 — menu and category CRUD,
          table layout, order taking, printable 58mm/80mm bills and KOTs, daily report.
        </div>
      </section>

      <p className="pb-4 text-xs muted">
        Signed in as {user.email}. Phase 0 scaffold · schema version 2026-11-08.
      </p>
    </div>
  );
}
