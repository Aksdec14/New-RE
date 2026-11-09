import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { SubmitButton } from "@/components/submit-button";
import { recordPayment, voidBill } from "@/lib/actions/orders";
import {
  BILL_STATUS_LABELS,
  PAYMENT_MODE_LABELS,
  formatAmount,
  formatDateTime,
  formatPercent,
} from "@/lib/format";
import { canBill, requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "Bill" };
export const dynamic = "force-dynamic";

type TaxSlab = {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
};

export default async function BillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const { supabase, restaurant } = await requireRestaurant();

  if (!canBill(restaurant.role)) {
    redirect("/dashboard");
  }

  const { data: bill } = await supabase
    .from("bills")
    .select("*")
    .eq("id", id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!bill) {
    notFound();
  }

  const [paymentsResult, orderResult, itemsResult, profileResult] =
    await Promise.all([
      supabase
        .from("payments")
        .select("*")
        .eq("bill_id", bill.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("orders")
        .select("*")
        .eq("id", bill.order_id)
        .maybeSingle(),
      supabase
        .from("order_items")
        .select("*")
        .eq("order_id", bill.order_id)
        .order("created_at", { ascending: true }),
      supabase
        .from("restaurants")
        .select("*")
        .eq("id", restaurant.id)
        .single(),
    ]);

  const payments = paymentsResult.data ?? [];
  const order = orderResult.data;
  const items = (itemsResult.data ?? []).filter((item) => item.status === "active");
  const profile = profileResult.data;
  const slabs = (Array.isArray(bill.tax_breakup)
    ? bill.tax_breakup
    : []) as unknown as TaxSlab[];

  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(0, bill.total - paid);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Bill"
          title={`#${bill.bill_number}`}
          description={`Issued ${formatDateTime(bill.issued_at, restaurant.timezone)}`}
          action={
            <>
              <span className="badge border-line bg-canvas text-muted">
                {BILL_STATUS_LABELS[bill.status] ?? bill.status}
              </span>
              <PrintButton />
              <Link href="/dashboard/billing" className="btn btn-ghost">
                All bills
              </Link>
            </>
          }
        />

        <div className="mt-4">
          <Flash error={error} ok={ok} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="border-b border-line pb-4">
            <h2 className="text-xl font-semibold">{profile?.name}</h2>
            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed muted">
              {profile?.address ?? "Address not set"}
            </p>
            <p className="mt-1 text-xs muted">
              {profile?.phone ? `${profile.phone} · ` : ""}
              GSTIN {profile?.gstin ?? "—"}
            </p>
          </div>

          <div className="flex flex-wrap justify-between gap-3 py-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide muted">Bill</p>
              <p className="font-medium">#{bill.bill_number}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide muted">Order</p>
              <p className="font-medium">#{order?.order_number ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide muted">Date</p>
              <p className="font-medium">
                {formatDateTime(bill.issued_at, restaurant.timezone)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide muted">Customer</p>
              <p className="font-medium">{bill.customer_name ?? "Walk-in"}</p>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs uppercase tracking-wide muted">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 text-center font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">GST</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2">{item.item_name}</td>
                  <td className="py-2 text-center tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatAmount(item.unit_price)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatPercent(item.tax_rate)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatAmount(item.quantity * item.unit_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="muted">Subtotal</dt>
              <dd className="tabular-nums">{formatAmount(bill.subtotal)}</dd>
            </div>
            {bill.discount_amount > 0 ? (
              <div className="flex justify-between">
                <dt className="muted">
                  Discount
                  {bill.discount_percent
                    ? ` (${formatPercent(bill.discount_percent)})`
                    : ""}
                </dt>
                <dd className="tabular-nums">
                  −{formatAmount(bill.discount_amount)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="muted">Taxable value</dt>
              <dd className="tabular-nums">{formatAmount(bill.taxable_total)}</dd>
            </div>
            {bill.cgst_total > 0 ? (
              <div className="flex justify-between">
                <dt className="muted">CGST</dt>
                <dd className="tabular-nums">{formatAmount(bill.cgst_total)}</dd>
              </div>
            ) : null}
            {bill.sgst_total > 0 ? (
              <div className="flex justify-between">
                <dt className="muted">SGST</dt>
                <dd className="tabular-nums">{formatAmount(bill.sgst_total)}</dd>
              </div>
            ) : null}
            {bill.igst_total > 0 ? (
              <div className="flex justify-between">
                <dt className="muted">IGST</dt>
                <dd className="tabular-nums">{formatAmount(bill.igst_total)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatAmount(bill.total)}</dd>
            </div>
            {paid > 0 ? (
              <div className="flex justify-between text-good">
                <dt>Paid</dt>
                <dd className="tabular-nums">{formatAmount(paid)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between font-medium">
              <dt>Balance</dt>
              <dd className="tabular-nums">{formatAmount(balance)}</dd>
            </div>
          </dl>

          {slabs.length > 0 ? (
            <div className="mt-5 rounded-xl bg-canvas px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide muted">
                GST breakup
              </p>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left muted">
                    <th className="font-medium">Slab</th>
                    <th className="font-medium text-right">Taxable</th>
                    <th className="font-medium text-right">CGST</th>
                    <th className="font-medium text-right">SGST</th>
                    <th className="font-medium text-right">IGST</th>
                  </tr>
                </thead>
                <tbody>
                  {slabs.map((slab) => (
                    <tr key={slab.rate}>
                      <td>{formatPercent(slab.rate)}</td>
                      <td className="text-right tabular-nums">
                        {formatAmount(slab.taxable)}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatAmount(slab.cgst)}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatAmount(slab.sgst)}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatAmount(slab.igst)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {bill.void_reason ? (
            <p className="mt-4 rounded-xl border border-bad/20 bg-bad-soft px-3.5 py-3 text-sm text-bad">
              Voided: {bill.void_reason}
            </p>
          ) : null}

          <p className="mt-6 text-center text-xs muted">
            Thank you for dining with us. This is a computer-generated invoice.
          </p>
        </section>

        <div className="space-y-4 print:hidden">
          <section className="card">
            <h2 className="text-base font-semibold">Payments</h2>
            {payments.length === 0 ? (
              <p className="mt-3 text-sm muted">No payments recorded.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex justify-between gap-3 border-b border-line pb-2"
                  >
                    <span className="muted">
                      {PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                      <span className="block text-xs">
                        {formatDateTime(payment.created_at, restaurant.timezone)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatAmount(payment.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {bill.status !== "void" && balance > 0 ? (
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
          </section>

          {bill.status !== "void" ? (
            <section className="card">
              <h2 className="text-base font-semibold">Void this bill</h2>
              <p className="mt-1 text-xs muted">
                The bill stays in the audit trail. Stock and totals are adjusted
                by the database.
              </p>
              <form action={voidBill} className="mt-3 space-y-2">
                <input type="hidden" name="bill_id" value={bill.id} />
                <input
                  name="reason"
                  className="input"
                  placeholder="Reason"
                  required
                  minLength={3}
                />
                <SubmitButton className="btn btn-ghost w-full text-bad">
                  Void bill
                </SubmitButton>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
