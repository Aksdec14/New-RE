import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import {
  BILL_STATUS_LABELS,
  formatAmount,
  formatDateTime,
} from "@/lib/format";
import { canBill, requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const SUMMARY_ROWS = [
  { key: "orders_count", label: "Orders" },
  { key: "bills_count", label: "Bills" },
  { key: "void_bills_count", label: "Voids" },
  { key: "gross_sales", label: "Gross" },
  { key: "discounts", label: "Discounts" },
  { key: "tax_total", label: "GST" },
  { key: "net_sales", label: "Net sales" },
  { key: "void_amount", label: "Void amount" },
  { key: "cash_total", label: "Cash" },
  { key: "card_total", label: "Card" },
  { key: "upi_total", label: "UPI" },
] as const;

type SummaryKey = (typeof SUMMARY_ROWS)[number]["key"];

const MONEY_KEYS = new Set<SummaryKey>([
  "gross_sales",
  "discounts",
  "tax_total",
  "net_sales",
  "void_amount",
  "cash_total",
  "card_total",
  "upi_total",
]);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { supabase, restaurant } = await requireRestaurant();

  if (!canBill(restaurant.role)) {
    return (
      <div className="card max-w-xl">
        <h1 className="text-lg font-semibold">Numbers for the counter</h1>
        <p className="mt-2 text-sm muted">
          Cashier accounts can view reports. Ask an owner to reach the audit
          trail instead.
        </p>
      </div>
    );
  }

  const { data, error: queryError } = await supabase
    .from("daily_summaries")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("summary_date", { ascending: false })
    .limit(14);

  const summaries = data ?? [];
  const totals: Record<SummaryKey, number> = {
    orders_count: 0,
    bills_count: 0,
    void_bills_count: 0,
    gross_sales: 0,
    discounts: 0,
    tax_total: 0,
    net_sales: 0,
    void_amount: 0,
    cash_total: 0,
    card_total: 0,
    upi_total: 0,
  };
  for (const summary of summaries) {
    for (const row of SUMMARY_ROWS) {
      totals[row.key] += Number(summary[row.key] ?? 0);
    }
  }
  const otherTotal = summaries.reduce(
    (sum, summary) => sum + Number(summary.other_total ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        description="Derived daily totals, refreshed by database triggers every time a bill or payment changes."
      />

      <Flash error={error ?? queryError?.message} ok={ok} />

      {summaries.length === 0 ? (
        <div className="card">
          <p className="text-sm muted">
            No summaries yet. Close your first bill and this fills up.
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                { key: "net_sales", label: "Net sales (period)" },
                { key: "tax_total", label: "GST collected" },
                { key: "bills_count", label: "Bills" },
                { key: "void_amount", label: "Voided" },
              ] as Array<{ key: SummaryKey; label: string }>
            ).map((stat) => (
              <div key={stat.key} className="card">
                <p className="text-xs uppercase tracking-wide muted">
                  {stat.label}
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">
                  {MONEY_KEYS.has(stat.key)
                    ? formatAmount(totals[stat.key])
                    : String(totals[stat.key])}
                </p>
              </div>
            ))}
          </section>

          <section className="card overflow-x-auto">
            <h2 className="text-base font-semibold">Last {summaries.length} trading days</h2>
            <table className="mt-4 w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide muted">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  {SUMMARY_ROWS.map((row) => (
                    <th key={row.key} className="pb-2 pr-3 text-right font-medium">
                      {row.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summaries.map((summary) => (
                  <tr key={summary.summary_date}>
                    <td className="py-2 pr-3 font-medium">
                      {formatDateTime(
                        `${summary.summary_date}T12:00:00Z`,
                        restaurant.timezone,
                      )}
                    </td>
                    {SUMMARY_ROWS.map((row) => {
                      const value = Number(summary[row.key] ?? 0);
                      return (
                        <td
                          key={row.key}
                          className="py-2 pr-3 text-right tabular-nums"
                        >
                          {MONEY_KEYS.has(row.key)
                            ? formatAmount(value)
                            : String(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-line font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  {SUMMARY_ROWS.map((row) => (
                    <td
                      key={row.key}
                      className="py-2 pr-3 text-right tabular-nums"
                    >
                      {MONEY_KEYS.has(row.key)
                        ? formatAmount(totals[row.key])
                        : String(totals[row.key])}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs muted">
              Other payment modes (wallet/credit): {formatAmount(otherTotal)}.
              Voided bills are excluded from net sales automatically.
            </p>
            <p className="mt-1 text-xs muted">
              {BILL_STATUS_LABELS.void}:{" "}
              {formatAmount(totals.void_amount)} across{" "}
              {totals.void_bills_count} bill(s).
            </p>
          </section>
        </>
      )}
    </div>
  );
}
