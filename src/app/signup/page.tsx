import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { signup } from "@/lib/actions/auth";

export const metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthShell
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-ink underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <h2 className="text-2xl font-semibold tracking-tight">Create your account</h2>
      <p className="mt-2 text-sm muted">
        You get a 14-day trial with every feature unlocked. No card required.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-bad/20 bg-bad-soft px-3.5 py-3 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}

      <form action={signup} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            placeholder="owner@restaurant.in"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="input"
            placeholder="At least 8 characters"
          />
        </div>

        <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>

        <p className="text-xs leading-relaxed muted">
          By continuing you agree to the terms of service and privacy policy. Enable MFA
          on owner and admin accounts once your restaurant is live.
        </p>
      </form>
    </AuthShell>
  );
}
