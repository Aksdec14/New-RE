import { BrandMark } from "@/components/brand-mark";
import { logout } from "@/lib/actions/auth";

const NAV = [
  { label: "Overview", active: true },
  { label: "Menu", active: false },
  { label: "Orders", active: false },
  { label: "Billing", active: false },
  { label: "Reports", active: false },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="text-sm font-medium">Resto POS</span>
            <span className="badge border-line bg-surface text-muted">Phase 0</span>
          </div>

          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((item) =>
              item.active ? (
                <span
                  key={item.label}
                  className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white"
                >
                  {item.label}
                </span>
              ) : (
                <span
                  key={item.label}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted"
                  title="Arriving in a later phase"
                >
                  {item.label}
                  <span className="text-[0.625rem] uppercase tracking-wide text-muted/60">
                    soon
                  </span>
                </span>
              ),
            )}
          </nav>

          <form action={logout} className="ml-auto">
            <button type="submit" className="btn btn-ghost">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
