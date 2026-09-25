"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { adminFetch, isReauthRequired } from "@/ui/admin-fetch";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Field, Select } from "@/ui/input";

const ROLES = [
  "student",
  "mentor",
  "event_host",
  "content_editor",
  "verification_reviewer",
  "moderator",
  "finance",
  "admin",
  "super_admin",
] as const;

export function GrantRoleForm({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<(typeof ROLES)[number]>("moderator");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await adminFetch(`/api/v1/admin/users/${userId}/roles`, { body: { role } });
      router.refresh();
    } catch (err) {
      if (isReauthRequired(err)) {
        router.push(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't grant that role.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-ink">Grant a role</h2>
      <p className="mb-3 text-xs text-ink-muted">
        super_admin only, step-up required (docs/06 §7.9). Roles are additive — there is no revoke
        route yet.
      </p>
      <form onSubmit={submit} className="flex items-end gap-2">
        <Field label="Role" htmlFor="role" className="flex-1">
          <Select id="role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Granting…" : "Grant"}
        </Button>
      </form>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </Card>
  );
}
