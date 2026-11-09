import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { SubmitButton } from "@/components/submit-button";
import { createRestaurant } from "@/lib/actions/restaurant";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Set up your restaurant" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; new?: string }>;
}) {
  const { error, new: addingAnother } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: existing } = await supabase
    .from("v_my_restaurants")
    .select("id")
    .limit(1);

  if (existing && existing.length > 0 && !addingAnother) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-3">
        <BrandMark />
        <div>
          <p className="text-sm font-medium">Resto POS</p>
          <p className="text-xs muted">Step 1 of 1 · create your workspace</p>
        </div>
      </div>

      <div className="card">
        <h1 className="text-2xl font-semibold tracking-tight">
          {addingAnother ? "Add another workspace" : "Set up your restaurant"}
        </h1>
        <p className="mt-2 text-sm muted">
          This creates the workspace, makes you the owner, and sets it up as a
          free space — no trial, no payment, nothing expires.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-bad/20 bg-bad-soft px-3.5 py-3 text-sm text-bad"
          >
            {error}
          </p>
        ) : null}

        <form action={createRestaurant} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Restaurant name
            </label>
            <input
              id="name"
              name="name"
              required
              maxLength={120}
              className="input"
              placeholder="Spice Route"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="phone">
                Phone <span className="muted">(optional)</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                className="input"
                placeholder="+91 98765 43210"
              />
            </div>

            <div>
              <label className="label" htmlFor="state_code">
                GST state code <span className="muted">(optional)</span>
              </label>
              <input
                id="state_code"
                name="state_code"
                inputMode="numeric"
                maxLength={2}
                pattern="[0-9]{2}"
                className="input"
                placeholder="29"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="gstin">
              GSTIN <span className="muted">(optional, add later)</span>
            </label>
            <input
              id="gstin"
              name="gstin"
              maxLength={15}
              className="input uppercase"
              placeholder="29ABCDE1234F1Z5"
            />
          </div>

          <div>
            <label className="label" htmlFor="address">
              Address <span className="muted">(optional)</span>
            </label>
            <textarea
              id="address"
              name="address"
              rows={3}
              className="input resize-y"
              placeholder="Printed on bills and KOTs"
            />
          </div>

          <SubmitButton pendingLabel="Creating workspace…">
            Create workspace
          </SubmitButton>
        </form>
      </div>

      <p className="mt-6 text-xs leading-relaxed muted">
        You can invite cashiers, waiters and kitchen staff once the workspace exists.
        The owner account should have MFA enabled before the first live service.
      </p>
    </div>
  );
}
