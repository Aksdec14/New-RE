import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export const metadata = { title: "Database setup" };

export default function SetupPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-3">
        <BrandMark />
        <div>
          <p className="text-sm font-medium">Resto POS</p>
          <p className="text-xs muted">Database setup required</p>
        </div>
      </div>

      <div className="card">
        <h1 className="text-2xl font-semibold tracking-tight">
          Database is not ready
        </h1>
        <p className="mt-2 text-sm muted">
          The app is connected to Supabase, but the schema is missing or the
          migrations have not been applied to this project.
        </p>

        <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Apply the migrations — in this repository run{" "}
            <code className="font-mono text-xs">npm run db:push</code> with your
            database connection string.
          </li>
          <li>
            Or paste <code className="font-mono text-xs">supabase/apply_all.sql</code>{" "}
            into the Supabase SQL editor.
          </li>
          <li>
            Verify locally first:{" "}
            <code className="font-mono text-xs">npm run db:test</code>.
          </li>
          <li>Reload this page.</li>
        </ol>

        <p className="mt-6 text-sm">
          <Link
            href="/dashboard"
            className="font-medium text-accent underline underline-offset-4"
          >
            Try again
          </Link>
        </p>
      </div>
    </div>
  );
}
