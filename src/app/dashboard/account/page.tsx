import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { changePassword } from "@/lib/actions/account";
import { roleLabel } from "@/lib/format";
import { requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { user, restaurant } = await requireRestaurant();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        eyebrow="You"
        title="Your account"
        description="Change your sign-in password. Each member does this for their own account."
      />

      <Flash error={error} ok={ok} />

      <section className="card text-sm">
        <h2 className="text-base font-semibold">Signed-in identity</h2>
        <dl className="mt-3 space-y-2">
          <div className="flex justify-between gap-3">
            <dt className="muted">Email</dt>
            <dd className="truncate">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="muted">Role here</dt>
            <dd>{roleLabel(restaurant.role)}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h2 className="text-base font-semibold">Change password</h2>

        <form action={changePassword} className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="current-password">
              Current password
            </label>
            <input
              id="current-password"
              name="current_password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              name="new_password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
            />
            <p className="mt-1 text-xs muted">At least 8 characters.</p>
          </div>

          <div>
            <label className="label" htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              name="confirm_password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
            />
          </div>

          <SubmitButton className="btn btn-primary">Update password</SubmitButton>
        </form>
      </section>
    </div>
  );
}
