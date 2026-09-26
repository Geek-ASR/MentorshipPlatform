"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/ui/cn";

const TABS = [
  { href: "/dashboard/settings", label: "Account" },
  { href: "/dashboard/settings/security", label: "Security" },
  { href: "/dashboard/settings/safety", label: "Safety" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="mt-6 border-b border-line">
      <ul className="-mb-px flex gap-6">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-ink"
                    : "border-transparent text-ink-muted hover:border-line hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
