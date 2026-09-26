import { PageHeader } from "@/ui/page-header";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader title="Settings" description="Your account, profile and sign-in security." />
      <SettingsTabs />
      <div className="mt-8">{children}</div>
    </div>
  );
}
