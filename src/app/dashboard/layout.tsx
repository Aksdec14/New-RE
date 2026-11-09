import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { logout } from "@/lib/actions/auth";
import { roleLabel } from "@/lib/format";
import { canBill, canManage, requireRestaurant } from "@/lib/restaurant";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { restaurant, workspaces, user } = await requireRestaurant();

  const items = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/menu", label: "Menu" },
    { href: "/dashboard/orders", label: "Orders" },
    { href: "/dashboard/tables", label: "Tables" },
  ];

  if (canBill(restaurant.role)) {
    items.push({ href: "/dashboard/billing", label: "Billing" });
  }

  if (canManage(restaurant.role)) {
    items.push(
      { href: "/dashboard/reports", label: "Reports" },
      { href: "/dashboard/staff", label: "Staff" },
      { href: "/dashboard/settings", label: "Settings" },
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur print:hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex items-center gap-3">
              <BrandMark />
              <div className="leading-tight">
                <p className="text-sm font-medium">Resto POS</p>
                <p className="text-[0.6875rem] muted">
                  {roleLabel(restaurant.role)}
                  {user.email ? ` · ${user.email}` : ""}
                </p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <WorkspaceSwitcher
                restaurant={restaurant}
                workspaces={workspaces}
              />
              <form action={logout}>
                <button type="submit" className="btn btn-ghost px-3 py-1.5">
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <DashboardNav
              items={[...items, { href: "/dashboard/account", label: "Account" }]}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
