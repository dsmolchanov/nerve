"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/api-keys", label: "API Keys" },
  { href: "/billing", label: "Billing" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-card lg:flex lg:flex-col">
      <nav className="flex flex-1 flex-col gap-1 p-4">
        {NAV_ITEMS.map(({ href, label }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:bg-bg-1 hover:text-ink"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-4">
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted transition hover:bg-bg-1 hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
