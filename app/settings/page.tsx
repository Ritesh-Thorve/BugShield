import { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardShell } from "@/components/dashboard/shell";

export const metadata: Metadata = {
  title: "Settings - BugShield",
  description: "Manage your account and security preferences",
};

export default function SettingsPage() {
  return (
    <DashboardShell>
      <DashboardHeader
        heading="Settings"
        description="Manage your account and security preferences"
      />
      <SettingsForm />
    </DashboardShell>
  );
}