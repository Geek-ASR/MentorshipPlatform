"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

type NavItem = { href: string; label: string };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { label: "", items: [{ href: "/admin", label: "Overview" }] },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/mentor-applications", label: "Mentor applications" },
      { href: "/admin/verification", label: "Verification" },
    ],
  },
  {
    label: "Content",
    items: [{ href: "/admin/articles", label: "Articles & guides" }],
  },
  {
    label: "Trust & safety",
    items: [
      { href: "/admin/cases", label: "Cases" },
      { href: "/admin/reports", label: "Reports" },
      { href: "/admin/appeals", label: "Appeals" },
      { href: "/admin/disputes", label: "Disputes" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/bookings", label: "Bookings" },
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/transfers", label: "Transfers" },
      { href: "/admin/commission-rules", label: "Commission rules" },
    ],
  },
  {
    label: "Config",
    items: [
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/policy-rules", label: "Policy rules" },
      { href: "/admin/feature-flags", label: "Feature flags" },
    ],
  },
  {
    label: "Ops",
    items: [
      { href: "/admin/outbox", label: "Outbox & jobs" },
      { href: "/admin/webhook-events", label: "Webhook events" },
      { href: "/admin/audit-log", label: "Audit log" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminSidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="space-y-6">
      {NAV.map((group) => (
        <div key={group.label || "root"}>
          {group.label ? (
            <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-[var(--radius-control)] px-3 py-2 text-sm",
                      active
                        ? "bg-primary text-on-primary font-medium"
                        : "text-ink-muted hover:bg-primary-soft hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
