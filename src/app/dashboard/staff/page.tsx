import { redirect } from "next/navigation";

import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  inviteStaff,
  removeStaff,
  toggleStaff,
  updateStaffRole,
} from "@/lib/actions/staff";
import { formatDate, roleLabel } from "@/lib/format";
import { canManage, requireRestaurant } from "@/lib/restaurant";
import type { StaffRow } from "@/lib/types/database";

export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

const ASSIGNABLE = ["admin", "cashier", "waiter", "kitchen"] as const;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { supabase, restaurant } = await requireRestaurant();

  if (!canManage(restaurant.role)) {
    redirect("/dashboard");
  }

  const { data, error: staffError } = await supabase.rpc("list_staff", {
    p_restaurant_id: restaurant.id,
  });

  const staff: StaffRow[] = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team"
        title="Staff"
        description="Roles decide what the database allows. Create an account with a password, or attach someone who already signed up."
      />

      <Flash error={error ?? staffError?.message} ok={ok} />

      <section className="card">
        <h2 className="text-base font-semibold">Add a team member</h2>
        <form
          action={inviteStaff}
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_1fr_auto]"
        >
          <input type="hidden" name="restaurant_id" value={restaurant.id} />
          <div>
            <label className="label" htmlFor="staff-email">
              Email
            </label>
            <input
              id="staff-email"
              name="email"
              type="email"
              required
              className="input"
              placeholder="cashier@example.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="staff-role">
              Role
            </label>
            <select id="staff-role" name="role" className="input" defaultValue="waiter">
              {ASSIGNABLE.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="staff-password">
              Initial password <span className="muted">(optional)</span>
            </label>
            <input
              id="staff-password"
              name="password"
              type="text"
              minLength={8}
              className="input"
              placeholder="Leave empty to attach an existing account"
              autoComplete="off"
            />
          </div>
          <div className="flex items-end">
            <SubmitButton className="btn btn-primary w-full">Add member</SubmitButton>
          </div>
        </form>
        <p className="mt-3 text-xs leading-relaxed muted">
          Give a password to create the account right away — hand it over in
          person or over a secure channel, and the person changes it under{" "}
          <strong>Account</strong> after their first sign-in. Leave it empty to
          attach someone who already signed up; they keep their own password.
        </p>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="text-base font-semibold">Members</h2>

        {staff.length === 0 ? (
          <p className="mt-4 text-sm muted">No members loaded.</p>
        ) : (
          <table className="mt-4 w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide muted">
                <th className="pb-2 font-medium">Member</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Joined</th>
                <th className="pb-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {staff.map((member) => (
                <tr key={member.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium">
                      {member.email}
                      {member.is_self ? (
                        <span className="ml-2 badge border-line bg-canvas text-muted">
                          You
                        </span>
                      ) : null}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    {member.role === "owner" ? (
                      <span className="text-sm">Owner</span>
                    ) : (
                      <form action={updateStaffRole} className="flex items-center gap-2">
                        <input
                          type="hidden"
                          name="restaurant_id"
                          value={restaurant.id}
                        />
                        <input type="hidden" name="id" value={member.id} />
                        <select
                          name="role"
                          defaultValue={member.role}
                          className="input w-32 py-1 text-sm"
                        >
                          {ASSIGNABLE.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </select>
                        <SubmitButton className="btn btn-ghost px-2 py-1 text-xs">
                          Save
                        </SubmitButton>
                      </form>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={
                        member.is_active
                          ? "badge border-good/20 bg-good-soft text-good"
                          : "badge border-bad/20 bg-bad-soft text-bad"
                      }
                    >
                      {member.is_active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs muted">
                    {formatDate(member.joined_at, restaurant.timezone)}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {member.role !== "owner" ? (
                        <>
                          <form action={toggleStaff}>
                            <input
                              type="hidden"
                              name="restaurant_id"
                              value={restaurant.id}
                            />
                            <input type="hidden" name="id" value={member.id} />
                            {member.is_active ? null : (
                              <input type="hidden" name="active" value="on" />
                            )}
                            <SubmitButton className="btn btn-ghost px-2 py-1 text-xs">
                              {member.is_active ? "Suspend" : "Activate"}
                            </SubmitButton>
                          </form>
                          <form action={removeStaff}>
                            <input
                              type="hidden"
                              name="restaurant_id"
                              value={restaurant.id}
                            />
                            <input type="hidden" name="id" value={member.id} />
                            <SubmitButton className="btn btn-ghost px-2 py-1 text-xs text-bad">
                              Remove
                            </SubmitButton>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
