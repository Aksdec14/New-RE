import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { SyncStatus } from "@/components/sync-status";
import {
  ORDER_STATUS_LABELS,
  formatAmount,
  formatDateTime,
  todayIn,
} from "@/lib/format";
import { canBill, canManage, requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, restaurant, user } = await requireRestaurant();
  const today = todayIn(restaurant.timezone);

  const [summaryResult, openOrders, tables, menuCount, recentOrders] =
    await Promise.all([
      supabase
        .from("daily_summaries")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("summary_date", today)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurant.id)
        .in("status", ["new", "preparing", "served"]),
      supabase
        .from("dining_tables")
        .select("status")
        .eq("restaurant_id", restaurant.id),
      supabase
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurant.id),
      supabase
        .from("orders")
        .select("id, order_number, status, total, created_at, order_type")
        .eq("restaurant_id", restaurant.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const summary = summaryResult.data;
  const occupied =
    tables.data?.filter((table) => table.status === "occupied").length ?? 0;
  const tableCount = tables.data?.length ?? 0;

  const stats = [
    {
      label: "Net sales today",
      value: formatAmount(summary?.net_sales ?? 0),
      hint: `${summary?.bills_count ?? 0} bill(s)`,
    },
    {
      label: "Open orders",
      value: String(openOrders.count ?? 0),
      hint: "new, preparing or served",
    },
    {
      label: "Tables busy",
      value: `${occupied}/${tableCount}`,
      hint: "occupied right now",
    },
    {
      label: "Menu items",
      value: String(menuCount.count ?? 0),
      hint: "available and sold out",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title={restaurant.name}
        description={`${restaurant.gstin ?? "GSTIN not set"} · ${restaurant.timezone} · free plan`}
        action={
          <>
            {canBill(restaurant.role) ? (
              <Link href="/dashboard/orders/new" className="btn btn-primary">
                New order
              </Link>
            ) : null}
            {canManage(restaurant.role) ? (
              <Link href="/dashboard/menu" className="btn btn-ghost">
                Manage menu
              </Link>
            ) : null}
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card">
            <p className="text-xs uppercase tracking-wide muted">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {stat.value}
            </p>
            <p className="mt-1 text-xs muted">{stat.hint}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Recent orders</h2>
            <Link
              href="/dashboard/orders"
              className="text-sm font-medium text-accent hover:underline"
            >
              View all
            </Link>
          </div>

          {recentOrders.data && recentOrders.data.length > 0 ? (
            <div className="mt-4 divide-y divide-line">
              {recentOrders.data.map((order) => (
                <Link
                  key={order.id}
                  href={`/dashboard/orders/${order.id}`}
                  className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-accent"
                >
                  <div>
                    <p className="text-sm font-medium">
                      #{order.order_number}
                      <span className="ml-2 text-xs font-normal muted">
                        {order.order_type.replace("_", " ")}
                      </span>
                    </p>
                    <p className="text-xs muted">
                      {formatDateTime(order.created_at, restaurant.timezone)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {formatAmount(order.total)}
                    </p>
                    <p className="text-xs muted">
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-6 rounded-xl bg-canvas px-4 py-6 text-sm muted">
              No orders yet.{" "}
              <Link
                href="/dashboard/orders/new"
                className="font-medium text-accent hover:underline"
              >
                Take the first order
              </Link>
              .
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="text-base font-semibold">Quick actions</h2>
            <div className="mt-4 grid gap-2">
              <Link href="/dashboard/orders/new" className="btn btn-ghost justify-start">
                Take an order
              </Link>
              <Link href="/dashboard/menu" className="btn btn-ghost justify-start">
                Add a menu item
              </Link>
              <Link href="/dashboard/tables" className="btn btn-ghost justify-start">
                Set up tables
              </Link>
              {canManage(restaurant.role) ? (
                <Link href="/dashboard/staff" className="btn btn-ghost justify-start">
                  Invite staff
                </Link>
              ) : null}
            </div>
          </div>

          <div className="card">
            <h2 className="text-base font-semibold">Sync status</h2>
            <div className="mt-3">
              <SyncStatus />
            </div>
          </div>
        </div>
      </section>

      <p className="pb-4 text-xs muted">
        Signed in as {user.email}. Totals are computed in Postgres, never in the
        browser.
      </p>
    </div>
  );
}
