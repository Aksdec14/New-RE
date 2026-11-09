"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

export function DashboardNav({ items }: { items: Item[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="-mx-1 flex items-center gap-1 overflow-x-auto pb-1 text-sm"
      aria-label="Workspace"
    >
      {items.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "shrink-0 rounded-lg bg-ink px-3 py-1.5 font-medium text-white"
                : "shrink-0 rounded-lg px-3 py-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
