import Link from "next/link";

import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { createOrder } from "@/lib/actions/orders";
import { formatAmount, formatPercent } from "@/lib/format";
import { requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "New order" };
export const dynamic = "force-dynamic";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; table?: string }>;
}) {
  const { error, table: preselectedTable } = await searchParams;
  const { supabase, restaurant } = await requireRestaurant();

  if (restaurant.role === "kitchen") {
    return (
      <div className="card max-w-xl">
        <h1 className="text-lg font-semibold">Taking orders is not your role</h1>
        <p className="mt-2 text-sm muted">
          Kitchen accounts can move tickets between preparing and served, but
          cannot open orders. Ask an owner or admin to change your role.
        </p>
        <Link href="/dashboard/orders" className="btn btn-ghost mt-5">
          Back to orders
        </Link>
      </div>
    );
  }

  const [itemsResult, categoriesResult, tablesResult] = await Promise.all([
    supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("is_available", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("dining_tables")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("label", { ascending: true }),
  ]);

  const items = itemsResult.data ?? [];
  const categories = categoriesResult.data ?? [];
  const tables = tablesResult.data ?? [];

  const grouped = [
    ...categories.map((category) => ({
      category,
      items: items.filter((item) => item.category_id === category.id),
    })),
    { category: null, items: items.filter((item) => !item.category_id) },
  ].filter((group) => group.category !== null || group.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Service"
        title="New order"
        description="Set quantities and submit. Prices and tax are snapshotted by Postgres, so later price edits never change this bill."
      />

      <Flash error={error} />

      {items.length === 0 ? (
        <div className="card">
          <p className="text-sm muted">
            No available menu items.{" "}
            <Link
              href="/dashboard/menu"
              className="font-medium text-accent hover:underline"
            >
              Add items to the menu
            </Link>{" "}
            first.
          </p>
        </div>
      ) : (
        <form action={createOrder} className="space-y-5">
          <input type="hidden" name="restaurant_id" value={restaurant.id} />

          <section className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="order-type">
                Order type
              </label>
              <select
                id="order-type"
                name="order_type"
                className="input"
                defaultValue="dine_in"
              >
                <option value="dine_in">Dine in</option>
                <option value="takeaway">Takeaway</option>
                <option value="delivery">Delivery</option>
                <option value="online">Online</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="order-table">
                Table
              </label>
              <select
                id="order-table"
                name="table_id"
                className="input"
                defaultValue={preselectedTable ?? ""}
              >
                <option value="">No table</option>
                {tables.map((table) => (
                  <option
                    key={table.id}
                    value={table.id}
                    disabled={table.status === "occupied"}
                  >
                    {table.label} · {table.seats} seats
                    {table.status === "occupied" ? " (busy)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="order-covers">
                Covers
              </label>
              <input
                id="order-covers"
                name="cover_count"
                type="number"
                min="0"
                defaultValue={2}
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="order-customer">
                Customer
              </label>
              <input
                id="order-customer"
                name="customer_name"
                className="input"
                placeholder="Optional"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <label className="label" htmlFor="order-notes">
                Notes for the kitchen
              </label>
              <input
                id="order-notes"
                name="notes"
                className="input"
                placeholder="Less spicy, no onion…"
              />
            </div>
          </section>

          <section className="space-y-4">
            {grouped.map((group) => (
              <div key={group.category?.id ?? "uncategorised"} className="card">
                <h2 className="text-base font-semibold">
                  {group.category?.name ?? "Uncategorised"}
                </h2>

                <div className="mt-3 divide-y divide-line">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{item.name}</p>
                          <span
                            className={
                              item.is_veg
                                ? "badge border-good/20 bg-good-soft text-good"
                                : "badge border-bad/20 bg-bad-soft text-bad"
                            }
                          >
                            {item.is_veg ? "Veg" : "Non-veg"}
                          </span>
                        </div>
                        <p className="text-xs muted">
                          {formatAmount(item.price)} · GST{" "}
                          {formatPercent(item.tax_rate)}
                        </p>
                      </div>

                      <label className="flex items-center gap-2 text-sm">
                        <span className="muted">Qty</span>
                        <input
                          name={`qty_${item.id}`}
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={0}
                          inputMode="numeric"
                          className="input w-20 py-1 text-center"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-sm muted">
              Totals are computed when you submit.
            </p>
            <SubmitButton className="btn btn-primary w-auto px-6" pendingLabel="Creating…">
              Create order
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
