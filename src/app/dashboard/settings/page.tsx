import Link from "next/link";
import { redirect } from "next/navigation";

import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { updateRestaurant } from "@/lib/actions/settings";
import { formatDate, roleLabel } from "@/lib/format";
import { canManage, requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { supabase, restaurant } = await requireRestaurant();

  if (!canManage(restaurant.role)) {
    redirect("/dashboard");
  }

  const { data: profile } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", restaurant.id)
    .single();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Details printed on every bill and used to compute GST. Only owners and admins can change these."
      />

      <Flash error={error} ok={ok} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="text-base font-semibold">Restaurant details</h2>

          <form action={updateRestaurant} className="mt-4 space-y-4">
            <input type="hidden" name="id" value={restaurant.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={profile?.name ?? restaurant.name}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="legal_name">
                  Legal name
                </label>
                <input
                  id="legal_name"
                  name="legal_name"
                  defaultValue={profile?.legal_name ?? ""}
                  className="input"
                  placeholder="For invoices, optional"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="gstin">
                  GSTIN
                </label>
                <input
                  id="gstin"
                  name="gstin"
                  maxLength={15}
                  className="input uppercase"
                  defaultValue={profile?.gstin ?? ""}
                  placeholder="29ABCDE1234F1Z5"
                />
              </div>
              <div>
                <label className="label" htmlFor="state_code">
                  State code
                </label>
                <input
                  id="state_code"
                  name="state_code"
                  inputMode="numeric"
                  maxLength={2}
                  pattern="[0-9]{2}"
                  className="input"
                  defaultValue={profile?.state_code ?? ""}
                  placeholder="29"
                />
              </div>
              <div>
                <label className="label" htmlFor="timezone">
                  Timezone
                </label>
                <select
                  id="timezone"
                  name="timezone"
                  className="input"
                  defaultValue={profile?.timezone ?? "Asia/Kolkata"}
                >
                  <option value="Asia/Kolkata">Asia/Kolkata</option>
                  <option value="Asia/Dubai">Asia/Dubai</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="address">
                Address
              </label>
              <textarea
                id="address"
                name="address"
                rows={3}
                className="input resize-y"
                defaultValue={profile?.address ?? ""}
                placeholder="Printed on bills"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="phone">
                  Phone
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  className="input"
                  defaultValue={profile?.phone ?? ""}
                />
              </div>
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="input"
                  defaultValue={profile?.email ?? ""}
                />
              </div>
            </div>

            <SubmitButton className="btn btn-primary">
              Save details
            </SubmitButton>
          </form>
        </section>

        <section className="space-y-4">
          <div className="card text-sm">
            <h2 className="text-base font-semibold">Workspace</h2>
            <dl className="mt-4 space-y-3">
              <div className="flex justify-between gap-3">
                <dt className="muted">Your role</dt>
                <dd>{roleLabel(restaurant.role)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="muted">Plan</dt>
                <dd>Free — no expiry</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="muted">Created</dt>
                <dd>
                  {formatDate(restaurant.created_at, restaurant.timezone)}
                </dd>
              </div>
              <div>
                <dt className="muted">Workspace ID</dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {restaurant.id}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card text-sm">
            <h2 className="text-base font-semibold">Another outlet?</h2>
            <p className="mt-2 text-sm muted">
              You can run up to 3 workspaces from one account. Bills, menus and
              staff stay separate per workspace.
            </p>
            <Link href="/onboarding?new=1" className="btn btn-ghost mt-4">
              Add another workspace
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
