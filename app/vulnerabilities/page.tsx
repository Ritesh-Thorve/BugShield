"use client";

import { useState } from "react";
import { VulnerabilityList } from "@/components/vulnerabilities/vulnerability-list";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardShell } from "@/components/dashboard/shell";
import { VulnerabilityFilters } from "@/components/vulnerabilities/vulnerability-filters";
import { Button } from "@/components/ui/button";

export default function VulnerabilitiesPage() {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Vulnerabilities"
        description="Review and fix security issues"
      >
        <Button onClick={() => window.open('/api/vulnerabilities/report')}>
          Download Report
        </Button>
      </DashboardHeader>
      <VulnerabilityFilters
        search={search}
        severity={severity}
        status={status}
        onSearchChange={setSearch}
        onSeverityChange={setSeverity}
        onStatusChange={setStatus}
      />
      <VulnerabilityList search={search} severity={severity} status={status} />
    </DashboardShell>
  );
}
