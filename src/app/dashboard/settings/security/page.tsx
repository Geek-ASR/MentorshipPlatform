import type { Metadata } from "next";
import { getEnv } from "@/config/env";
import { getDb } from "@/server/platform/db/client";
import { systemClock } from "@/server/platform/clock";
import { getSetting } from "@/server/platform/settings/settings";
import { mfaStatus } from "@/server/modules/auth";
import { requireViewer } from "@/server/views/viewer";
import { SettingsSection } from "../section";
import { PasswordForm } from "./password-form";
import { SessionsCard } from "./sessions-card";
import { TwoStepCard } from "./two-step-card";

export const metadata: Metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const { user } = await requireViewer("/dashboard/settings/security");
  const db = await getDb();
  const now = systemClock.now();
  const [minLength, mfa] = await Promise.all([
    getSetting(db, "auth.password_min_length", now),
    mfaStatus(user.id, { db, clock: systemClock, mfaEncryptionKey: getEnv().MFA_ENCRYPTION_KEY }),
  ]);

  return (
    <div className="space-y-10">
      <SettingsSection
        id="password-heading"
        title="Password"
        description="Changing it signs out every other device."
      >
        <PasswordForm email={user.email} minLength={minLength} />
      </SettingsSection>
      <SettingsSection
        id="two-step-heading"
        title="2-step verification"
        description="A second check at sign-in keeps your account safe even if your password leaks."
      >
        <TwoStepCard email={user.email} enabled={mfa.enabled} />
      </SettingsSection>
      <SettingsSection
        id="devices-heading"
        title="Where you're signed in"
        description="Active sessions on this account."
      >
        <SessionsCard email={user.email} />
      </SettingsSection>
    </div>
  );
}
