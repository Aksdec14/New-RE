import { BrandMark } from "@/components/brand-mark";

const HIGHLIGHTS = [
  "Bill totals and GST are computed inside Postgres, never in the browser.",
  "Every row is isolated by restaurant_id through row level security.",
  "An expired subscription makes the workspace read-only, not unreachable.",
  "Orders and payments carry idempotency keys, so offline retries are safe.",
];

export function AuthShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark inverted />
          <span className="text-sm font-medium tracking-wide">Resto POS</span>
        </div>

        <div className="max-w-md">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-white/45">
            Phase 0 · foundation
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.15] tracking-tight">
            Billing that holds up on a bad night of internet.
          </h1>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed text-white/70">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/35">
          Next.js · Supabase Postgres · PWA
        </p>
      </aside>

      <main className="flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="text-sm font-medium">Resto POS</span>
          </div>

          {children}

          {footer ? <div className="mt-8 text-sm muted">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
