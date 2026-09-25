import Link from "next/link";
import { STAFF_ROLES, findUserById } from "@/server/modules/auth";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { getDb } from "@/server/platform/db/client";
import { AdminSidebarNav } from "@/ui/admin-shell";
import { Logo } from "@/ui/logo";
import { SignOutButton } from "./sign-out-button";

export default async function AdminDashboardLayout({ children }: LayoutProps<"/admin">) {
  const actor = await requireStaffPage([...STAFF_ROLES], "/admin");
  const user = await findUserById(await getDb(), actor.userId);

  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[240px_1fr]">
      <aside className="border-line hidden border-r bg-surface p-4 md:block">
        <Link href="/admin" className="mb-6 block px-3">
          <Logo />
        </Link>
        <AdminSidebarNav />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="border-line flex h-14 items-center justify-between border-b bg-surface px-4">
          <p className="text-sm font-medium text-ink md:hidden">Admin</p>
          <div className="ml-auto flex items-center gap-3 text-sm text-ink-muted">
            <span>{user?.email}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
