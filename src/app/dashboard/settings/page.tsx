import type { Metadata } from "next";
import { getDb } from "@/server/platform/db/client";
import { getStudentProfile } from "@/server/modules/profiles";
import { requireViewer } from "@/server/views/viewer";
import { AccountForm } from "./account-form";
import { EmailCard } from "./email-card";
import { SettingsSection } from "./section";
import { StudentProfileForm } from "./student-profile-form";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountSettingsPage() {
  const { user } = await requireViewer("/dashboard/settings");
  const profile = await getStudentProfile(await getDb(), user.id);

  return (
    <div className="space-y-10">
      <SettingsSection
        id="profile-heading"
        title="Profile"
        description="Your name and the time zone we show every session time in."
      >
        <AccountForm displayName={user.displayName} timezone={user.timezone} />
      </SettingsSection>
      <SettingsSection
        id="email-heading"
        title="Email"
        description="Where we send booking confirmations and sign-in links."
      >
        <EmailCard email={user.email} verified={user.emailVerified} />
      </SettingsSection>
      <SettingsSection
        id="about-heading"
        title="About you"
        description="Optional context that helps mentors prepare for your sessions."
      >
        <StudentProfileForm
          initial={{
            headline: profile?.headline ?? "",
            bioMd: profile?.bioMd ?? "",
            visibility: profile?.visibility ?? "logged_in",
          }}
        />
      </SettingsSection>
    </div>
  );
}
