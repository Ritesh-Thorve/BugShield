import { Metadata } from "next";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardShell } from "@/components/dashboard/shell";
import { VulnerabilityOverview } from "@/components/dashboard/vulnerability-overview";
import { RecentScans } from "@/components/dashboard/recent-scans";
import { ProjectStats } from "@/components/dashboard/project-stats";
import { getDashboardData } from "@/app/actions/projects";
import { VulnerabilityPriorityList } from "@/components/dashboard/vulnerability-priority-list";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dashboard - BugShield",
  description: "Monitor and manage your project vulnerabilities",
};

export default async function DashboardPage() {
  const dashboard = await getDashboardData();

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Security overview"
        description={`Your repository security at a glance · Updated ${new Date().toLocaleString()}`}
      >
        {dashboard.stats.projects > 0 ? <NewProjectButton /> : null}
      </DashboardHeader>

      {dashboard.stats.projects === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Start with your first repository</h2>
                <p className="max-w-xl text-sm text-muted-foreground">Add a public GitHub repository or upload a source file to run a security scan and see findings here.</p>
              </div>
            </div>
            <NewProjectButton />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <ProjectStats stats={dashboard.stats} />
          </div>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
            <VulnerabilityPriorityList findings={dashboard.priorityFindings} criticalCount={dashboard.stats.criticalFindings} />
            <RecentScans scans={dashboard.recentScans} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
            <VulnerabilityOverview data={dashboard.chart} />
            <Card>
              <CardContent className="flex h-full min-h-40 flex-col items-start justify-center gap-3 p-6">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Repositories</div>
                <p className="text-sm text-muted-foreground">{dashboard.stats.projects} {dashboard.stats.projects === 1 ? "project is" : "projects are"} being tracked for security issues.</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/projects">Manage projects <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </DashboardShell>
  );
}