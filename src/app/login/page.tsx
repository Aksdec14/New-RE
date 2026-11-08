import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { login } from "@/lib/actions/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message, next } = await searchParams;

  return (
    <AuthShell
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
      <p className="mt-2 text-sm muted">
        Use the email you signed up with. Staff PIN sign-in lands in Phase 2.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-bad/20 bg-bad-soft px-3.5 py-3 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="mt-5 rounded-xl border border-good/20 bg-good-soft px-3.5 py-3 text-sm text-good"
        >
          {message}
        </p>
      ) : null}

      <form action={login} className="mt-6 space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <div>
          <label className="label" htmlFor="email">
            Email
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
            autoComplete="current-password"
            required
            minLength={8}
            className="input"
            placeholder="••••••••"
          />
        </div>

        <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}
