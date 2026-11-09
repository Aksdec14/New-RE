import Link from "next/link";
import { notFound } from "next/navigation";

import { Flash } from "@/components/flash";
import { LiveRefresh } from "@/components/live-refresh";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  addOrderItems,
  generateBill,
  recordPayment,
  updateOrderStatus,
  voidBill,
  voidOrderItem,
} from "@/lib/actions/orders";
import {
  BILL_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_MODE_LABELS,
  formatAmount,
  formatDateTime,
  formatPercent,
} from "@/lib/format";
import { canBill, requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "Order" };
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  new: "border-accent/20 bg-accent-soft text-accent",
  preparing: "border-warn/20 bg-warn-soft text-warn",
  served: "border-good/20 bg-good-soft text-good",
  billed: "border-line bg-canvas text-muted",
  cancelled: "border-bad/20 bg-bad-soft text-bad",
};

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const { supabase, restaurant } = await requireRestaurant();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!order) {
    notFound();
  }

  const [itemsResult, billResult, tablesResult, menuResult] = await Promise.all([
    supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("bills")
      .select("*")
      .eq("order_id", order.id)
      .maybeSingle(),
    supabase
      .from("dining_tables")
      .select("id, label")
      .eq("restaurant_id", restaurant.id),
    supabase
      .from("menu_items")
      .select("id, name, price, tax_rate, is_veg, category_id")
      .eq("restaurant_id", restaurant.id)
      .eq("is_available", true)
      .order("name", { ascending: true }),
  ]);

  const items = itemsResult.data ?? [];
  const bill = billResult.data;
  const menuItems = menuResult.data ?? [];
  const tableLabel = order.table_id
    ? (tablesResult.data ?? []).find((table) => table.id === order.table_id)?.label
    : null;

  const payments = bill
    ? (await supabase.from("payments").select("*").eq("bill_id", bill.id)).data ?? []
    : [];

  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = bill ? Math.max(0, bill.total - paid) : 0;

  const biller = canBill(restaurant.role);
  const kitchen = restaurant.role === "kitchen";
  const orderOpen = ["new", "preparing", "served"].includes(order.status);

  const transitions: Array<{ value: string; label: string }> = [];
  if (order.status === "new") {
    transitions.push({ value: "preparing", label: "Start preparing" });
    transitions.push({ value: "served", label: "Mark served" });
  }
  if (order.status === "preparing") {
    transitions.push({ value: "served", label: "Mark served" });
  }
  if (orderOpen && biller) {
    transitions.push({ value: "cancelled", label: "Cancel order" });
  }

  return (
    <div className="space-y-6">
      <LiveRefresh table="orders" column="id" value={order.id} />
      <LiveRefresh table="order_items" column="order_id" value={order.id} />
      <PageHeader
        eyebrow="Order"
        title={`#${order.order_number}`}
        description={`${order.order_type.replace("_", " ")}${tableLabel ? ` · ${tableLabel}` : ""}${
          order.cover_count > 0 ? ` · ${order.cover_count} cover(s)` : ""
        } · ${formatDateTime(order.created_at, restaurant.timezone)}`}
        action={
          <>
            <span className={`badge ${STATUS_STYLES[order.status] ?? ""}`}>
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </span>
            <Link href="/dashboard/orders" className="btn btn-ghost">
              All orders
            </Link>
          </>
        }
      />

      <Flash error={error} ok={ok} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Items</h2>
            <span className="text-xs muted">
              {items.filter((item) => item.status === "active").length} active
            </span>
          </div>

          <div className="mt-4 divide-y divide-line">
            {items.map((item) => (
              <div key={item.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {item.item_name}
                      {item.status === "void" ? (
                        <span className="badge border-bad/20 bg-bad-soft text-bad">
                          Void
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs muted">
                      {item.quantity} × {formatAmount(item.unit_price)} · GST{" "}
                      {formatPercent(item.tax_rate)}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    {formatAmount(item.quantity * item.unit_price)}
                  </p>
                </div>

                {biller && item.status === "active" && orderOpen ? (
                  <form
                    action={voidOrderItem}
                    className="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input
                      name="reason"
                      className="input w-56 py-1 text-xs"
                      placeholder="Reason for void"
                      required
                      minLength={3}
                    />
                    <SubmitButton className="btn btn-ghost px-2 py-1 text-xs text-bad">
                      Void item
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            ))}
          </div>

          <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="muted">Subtotal</dt>
              <dd className="tabular-nums">{formatAmount(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="muted">Tax</dt>
              <dd className="tabular-nums">{formatAmount(order.tax_total)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatAmount(order.total)}</dd>
            </div>
          </dl>
        </section>

        <div className="space-y-4">
          {transitions.length > 0 ? (
            <section className="card">
              <h2 className="text-base font-semibold">Move the ticket</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {transitions.map((transition) => (
                  <form key={transition.value} action={updateOrderStatus}>
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="status" value={transition.value} />
                    <SubmitButton
                      className={
                        transition.value === "cancelled"
                          ? "btn btn-ghost px-3 py-1.5 text-bad"
                          : "btn btn-primary px-3 py-1.5"
                      }
                    >
                      {transition.label}
                    </SubmitButton>
                  </form>
                ))}
              </div>
              {kitchen ? (
                <p className="mt-3 text-xs muted">
                  Kitchen accounts can only move tickets to preparing or served.
                </p>
              ) : null}
            </section>
          ) : null}

          {order.customer_name || order.customer_phone || order.notes ? (
            <section className="card text-sm">
              <h2 className="text-base font-semibold">Customer</h2>
              <dl className="mt-3 space-y-1">
                {order.customer_name ? (
                  <div className="flex justify-between gap-3">
                    <dt className="muted">Name</dt>
                    <dd>{order.customer_name}</dd>
                  </div>
                ) : null}
                {order.customer_phone ? (
                  <div className="flex justify-between gap-3">
                    <dt className="muted">Phone</dt>
                    <dd>{order.customer_phone}</dd>
                  </div>
                ) : null}
                {order.notes ? (
                  <div>
                    <dt className="muted">Notes</dt>
                    <dd className="mt-1">{order.notes}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {biller && orderOpen ? (
            <section className="card">
              <h2 className="text-base font-semibold">Billing</h2>

              {bill ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="muted">Bill</span>
                    <span className="font-medium">#{bill.bill_number}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted">Status</span>
                    <span className={`badge ${STATUS_STYLES[order.status] ?? ""}`}>
                      {BILL_STATUS_LABELS[bill.status] ?? bill.status}
                    </span>
                  </div>
                  <Link
                    href={`/dashboard/billing/${bill.id}`}
                    className="btn btn-primary w-full"
                  >
                    Open bill
                  </Link>
                </div>
              ) : (
                <form action={generateBill} className="mt-3 space-y-3">
                  <input type="hidden" name="order_id" value={order.id} />

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Discount ₹</label>
                      <input
                        name="discount_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={0}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">or %</label>
                      <input
                        name="discount_percent"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        className="input"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Payment</label>
                    <select name="payment_mode" className="input" defaultValue="">
                      <option value="">Leave unpaid</option>
                      <option value="cash">Cash — settle now</option>
                      <option value="card">Card — settle now</option>
                      <option value="upi">UPI — settle now</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="is_interstate" />
                    Inter-state supply (IGST)
                  </label>

                  <SubmitButton className="btn btn-primary w-full" pendingLabel="Billing…">
                    Generate bill
                  </SubmitButton>
                </form>
              )}
            </section>
          ) : null}

          {bill ? (
            <section className="card">
              <h2 className="text-base font-semibold">Payments</h2>
              {payments.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex justify-between gap-3">
                      <span className="muted">
                        {PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </span>
                      <span className="tabular-nums">
                        {formatAmount(payment.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm muted">No payments yet.</p>
              )}

              <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-medium">
                <span>Balance</span>
                <span className="tabular-nums">{formatAmount(balance)}</span>
              </div>

              {biller && bill.status !== "void" && balance > 0 ? (
                <form action={recordPayment} className="mt-4 space-y-2">
                  <input type="hidden" name="bill_id" value={bill.id} />
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={balance}
                    className="input"
                  />
                  <select name="mode" className="input" defaultValue="cash">
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="upi">UPI</option>
                    <option value="wallet">Wallet</option>
                    <option value="credit">Credit</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    name="reference"
                    className="input"
                    placeholder="Reference (optional)"
                  />
                  <SubmitButton className="btn btn-primary w-full">
                    Record payment
                  </SubmitButton>
                </form>
              ) : null}

              {biller && bill.status !== "void" ? (
                <form action={voidBill} className="mt-4 space-y-2 border-t border-line pt-3">
                  <input type="hidden" name="bill_id" value={bill.id} />
                  <input
                    name="reason"
                    className="input py-1.5 text-xs"
                    placeholder="Reason for voiding the bill"
                    required
                    minLength={3}
                  />
                  <SubmitButton className="btn btn-ghost w-full text-bad">
                    Void bill
                  </SubmitButton>
                </form>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      {orderOpen && menuItems.length > 0 ? (
        <section className="card">
          <details>
            <summary className="cursor-pointer text-base font-semibold">
              Add more items
            </summary>
            <form action={addOrderItems} className="mt-4 space-y-3">
              <input type="hidden" name="order_id" value={order.id} />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {menuItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.name}
                      <span className="ml-1 text-xs muted">
                        {formatAmount(item.price)}
                      </span>
                    </span>
                    <input
                      name={`qty_${item.id}`}
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={0}
                      className="input w-16 py-1 text-center"
                    />
                  </label>
                ))}
              </div>
              <SubmitButton className="btn btn-primary px-4 py-2">
                Add selected items
              </SubmitButton>
            </form>
          </details>
        </section>
      ) : null}
    </div>
  );
}
