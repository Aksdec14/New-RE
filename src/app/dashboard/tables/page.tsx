import { Flash } from "@/components/flash";
import { LiveRefresh } from "@/components/live-refresh";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  createTable,
  deleteTable,
  setTableStatus,
  updateTable,
} from "@/lib/actions/tables";
import { TABLE_STATUS_LABELS } from "@/lib/format";
import { canBill, canManage, requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "Tables" };
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  free: "border-good/20 bg-good-soft text-good",
  occupied: "border-bad/20 bg-bad-soft text-bad",
  reserved: "border-warn/20 bg-warn-soft text-warn",
  cleaning: "border-line bg-canvas text-muted",
};

const NEXT_STATUS: Record<string, { value: string; label: string }> = {
  free: { value: "reserved", label: "Reserve" },
  reserved: { value: "free", label: "Unreserve" },
  occupied: { value: "cleaning", label: "Mark cleaning" },
  cleaning: { value: "free", label: "Mark free" },
};

export default async function TablesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { supabase, restaurant } = await requireRestaurant();

  const desk = canBill(restaurant.role);
  const manager = canManage(restaurant.role);

  const { data, error: queryError } = await supabase
    .from("dining_tables")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("floor", { ascending: true })
    .order("label", { ascending: true });

  const tables = data ?? [];

  return (
    <div className="space-y-6">
      <LiveRefresh table="dining_tables" column="restaurant_id" value={restaurant.id} />
      <PageHeader
        eyebrow="Floor"
        title="Tables"
        description="Table state is shared live through Supabase Realtime, so the floor and the counter see the same thing."
      />

      <Flash error={error ?? queryError?.message} ok={ok} />

      {desk ? (
        <section className="card">
          <h2 className="text-base font-semibold">Add a table</h2>
          <form
            action={createTable}
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_1fr_auto]"
          >
            <input type="hidden" name="restaurant_id" value={restaurant.id} />
            <div>
              <label className="label" htmlFor="table-label">
                Label
              </label>
              <input
                id="table-label"
                name="label"
                required
                maxLength={40}
                className="input"
                placeholder="T1"
              />
            </div>
            <div>
              <label className="label" htmlFor="table-seats">
                Seats
              </label>
              <input
                id="table-seats"
                name="seats"
                type="number"
                min="1"
                max="100"
                defaultValue={4}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="table-floor">
                Floor
              </label>
              <input
                id="table-floor"
                name="floor"
                className="input"
                placeholder="Ground"
              />
            </div>
            <div className="flex items-end">
              <SubmitButton className="btn btn-primary w-full">Add table</SubmitButton>
            </div>
          </form>
        </section>
      ) : null}

      {tables.length === 0 ? (
        <div className="card">
          <p className="text-sm muted">
            No tables yet.{" "}
            {desk
              ? "Add your first table above."
              : "Ask an owner, admin or cashier to set up the floor."}
          </p>
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((table) => {
            const next = NEXT_STATUS[table.status];
            return (
              <div key={table.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{table.label}</p>
                    <p className="text-xs muted">
                      {table.seats} seats
                      {table.floor ? ` · ${table.floor}` : ""}
                    </p>
                  </div>
                  <span className={`badge ${STATUS_STYLES[table.status] ?? ""}`}>
                    {TABLE_STATUS_LABELS[table.status] ?? table.status}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {next ? (
                    <form action={setTableStatus}>
                      <input type="hidden" name="id" value={table.id} />
                      <input type="hidden" name="status" value={next.value} />
                      <SubmitButton className="btn btn-ghost px-3 py-1.5 text-xs">
                        {next.label}
                      </SubmitButton>
                    </form>
                  ) : null}

                  {table.status !== "free" ? (
                    <form action={setTableStatus}>
                      <input type="hidden" name="id" value={table.id} />
                      <input type="hidden" name="status" value="free" />
                      <SubmitButton className="btn btn-ghost px-3 py-1.5 text-xs">
                        Free
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>

                {desk ? (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-muted hover:text-ink">
                      Edit table
                    </summary>
                    <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
                      <form action={updateTable} className="space-y-2">
                        <input
                          type="hidden"
                          name="restaurant_id"
                          value={restaurant.id}
                        />
                        <input type="hidden" name="id" value={table.id} />
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input
                            name="label"
                            defaultValue={table.label}
                            className="input"
                            required
                          />
                          <input
                            name="seats"
                            type="number"
                            min="1"
                            defaultValue={table.seats}
                            className="input"
                          />
                          <input
                            name="floor"
                            defaultValue={table.floor ?? ""}
                            className="input"
                            placeholder="Floor"
                          />
                        </div>
                        <SubmitButton className="btn btn-primary px-3 py-1.5">
                          Save
                        </SubmitButton>
                      </form>

                      {manager ? (
                        <form action={deleteTable} className="mt-2">
                          <input
                            type="hidden"
                            name="restaurant_id"
                            value={restaurant.id}
                          />
                          <input type="hidden" name="id" value={table.id} />
                          <SubmitButton className="btn btn-ghost px-3 py-1.5 text-bad">
                            Delete table
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
