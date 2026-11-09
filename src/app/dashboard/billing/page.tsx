import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import {
  BILL_STATUS_LABELS,
  formatAmount,
  formatDateTime,
} from "@/lib/format";
import { canBill, requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  unpaid: "border-warn/20 bg-warn-soft text-warn",
  partial: "border-accent/20 bg-accent-soft text-accent",
  paid: "border-good/20 bg-good-soft text-good",
  void: "border-bad/20 bg-bad-soft text-bad",
};

export default async function BillingPage() {
  const { supabase, restaurant } = await requireRestaurant();

  if (!canBill(restaurant.role)) {
    redirect("/dashboard");
  }

  const [billsResult, ordersResult, paymentsResult] = await Promise.all([
    supabase
      .from("bills")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("issued_at", { ascending: false })
      .limit(40),
    supabase
      .from("orders")
      .select("id, order_number")
      .eq("restaurant_id", restaurant.id),
    supabase
      .from("payments")
      .select("bill_id, amount")
      .eq("restaurant_id", restaurant.id),
  ]);

  const bills = billsResult.data ?? [];
  const orderNumbers = new Map(
    (ordersResult.data ?? []).map((order) => [order.id, order.order_number]),
  );
  const paidByBill = new Map<string, number>();
  for (const payment of paymentsResult.data ?? []) {
    paidByBill.set(
      payment.bill_id,
      (paidByBill.get(payment.bill_id) ?? 0) + payment.amount,
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money"
        title="Bills"
        description="GST is computed per slab in Postgres. A bill can be settled in parts and voided with a reason."
      />

      {bills.length === 0 ? (
        <div className="card">
          <p className="text-sm muted">
            No bills yet. Bills are generated from an open order.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-line p-0">
          {bills.map((bill) => {
            const paid = paidByBill.get(bill.id) ?? 0;
            const balance = Math.max(0, bill.total - paid);

            return (
              <Link
                key={bill.id}
                href={`/dashboard/billing/${bill.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    Bill #{bill.bill_number}
                    <span className="ml-2 text-xs font-normal muted">
                      order #{orderNumbers.get(bill.order_id) ?? "—"}
                    </span>
                  </p>
                  <p className="text-xs muted">
                    {formatDateTime(bill.issued_at, restaurant.timezone)}
                  </p>
                </div>

                <span className={`badge ${STATUS_STYLES[bill.status] ?? ""}`}>
                  {BILL_STATUS_LABELS[bill.status] ?? bill.status}
                </span>

                <div className="w-32 text-right">
                  <p className="text-sm font-medium tabular-nums">
                    {formatAmount(bill.total)}
                  </p>
                  <p className="text-xs muted tabular-nums">
                    {balance > 0 ? `${formatAmount(balance)} due` : "settled"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
