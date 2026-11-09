import Link from "next/link";

import { LiveRefresh } from "@/components/live-refresh";
import { PageHeader } from "@/components/page-header";
import {
  ORDER_STATUS_LABELS,
  formatAmount,
  formatDateTime,
} from "@/lib/format";
import { canBill, requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  new: "border-accent/20 bg-accent-soft text-accent",
  preparing: "border-warn/20 bg-warn-soft text-warn",
  served: "border-good/20 bg-good-soft text-good",
  billed: "border-line bg-canvas text-muted",
  cancelled: "border-bad/20 bg-bad-soft text-bad",
};

export default async function OrdersPage() {
  const { supabase, restaurant } = await requireRestaurant();

  const [openResult, closedResult, tablesResult] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .in("status", ["new", "preparing", "served"])
      .order("created_at", { ascending: true }),
    supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .in("status", ["billed", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("dining_tables")
      .select("id, label")
      .eq("restaurant_id", restaurant.id),
  ]);

  const tableLabels = new Map(
    (tablesResult.data ?? []).map((table) => [table.id, table.label]),
  );
  const openOrders = openResult.data ?? [];
  const closedOrders = closedResult.data ?? [];

  return (
    <div className="space-y-6">
      <LiveRefresh table="orders" column="restaurant_id" value={restaurant.id} />
      <PageHeader
        eyebrow="Service"
        title="Orders"
        description="Every order carries a sequential number per tenant. Kitchen tickets update live."
        action={
          canBill(restaurant.role) || restaurant.role === "waiter" ? (
            <Link href="/dashboard/orders/new" className="btn btn-primary">
              New order
            </Link>
          ) : null
        }
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          Open orders{" "}
          <span className="ml-1 text-sm font-normal muted">
            ({openOrders.length})
          </span>
        </h2>

        {openOrders.length === 0 ? (
          <div className="card">
            <p className="text-sm muted">
              Nothing open right now.{" "}
              <Link
                href="/dashboard/orders/new"
                className="font-medium text-accent hover:underline"
              >
                Take an order
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="card divide-y divide-line p-0">
            {openOrders.map((order) => (
              <Link
                key={order.id}
                href={`/dashboard/orders/${order.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    #{order.order_number}
                    <span className="ml-2 text-xs font-normal muted">
                      {order.order_type.replace("_", " ")}
                      {order.table_id
                        ? ` · ${tableLabels.get(order.table_id) ?? "table"}`
                        : ""}
                    </span>
                  </p>
                  <p className="text-xs muted">
                    {formatDateTime(order.created_at, restaurant.timezone)}
                    {order.customer_name ? ` · ${order.customer_name}` : ""}
                  </p>
                </div>

                <span className={`badge ${STATUS_STYLES[order.status] ?? ""}`}>
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </span>

                <span className="w-24 text-right text-sm font-medium tabular-nums">
                  {formatAmount(order.total)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Recently closed</h2>

        {closedOrders.length === 0 ? (
          <div className="card">
            <p className="text-sm muted">No billed or cancelled orders yet.</p>
          </div>
        ) : (
          <div className="card divide-y divide-line p-0">
            {closedOrders.map((order) => (
              <Link
                key={order.id}
                href={`/dashboard/orders/${order.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">#{order.order_number}</p>
                  <p className="text-xs muted">
                    {formatDateTime(order.created_at, restaurant.timezone)}
                  </p>
                </div>
                <span className={`badge ${STATUS_STYLES[order.status] ?? ""}`}>
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </span>
                <span className="w-24 text-right text-sm font-medium tabular-nums">
                  {formatAmount(order.total)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
