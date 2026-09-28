"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, AlertTriangle, CheckCircle, GitFork } from "lucide-react";

interface ProjectStatsProps {
  stats: {
    projects: number;
    openFindings: number;
    scans: number;
    resolvedRate: number;
  };
}

export function ProjectStats({ stats }: ProjectStatsProps) {
  const items = [
    { title: "Total Projects", value: stats.projects, icon: GitFork, description: "Tracked repositories" },
    { title: "Open Findings", value: stats.openFindings, icon: AlertTriangle, description: "Awaiting resolution" },
    { title: "Total Scans", value: stats.scans, icon: Shield, description: "Recorded scan runs" },
    { title: "Resolved", value: `${stats.resolvedRate}%`, icon: CheckCircle, description: "Of recorded findings" },
  ];

  return (
    <>
      {items.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </>
  );
}