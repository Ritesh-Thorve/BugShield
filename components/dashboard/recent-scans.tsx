"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface RecentScansProps {
  className?: string;
  scans: Array<{
    id: string;
    projectName: string | null;
    status: string | null;
    startedAt: Date | null;
    issues: number | null;
  }>;
}

export function RecentScans({ className, scans }: RecentScansProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recent Scans</CardTitle>
      </CardHeader>
      <CardContent>
        {scans.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No scans have run yet. <Link className="underline underline-offset-4" href="/projects">Add a project</Link> to start.
          </div>
        ) : (
          <div className="space-y-5">
            {scans.map((scan) => (
              <div key={scan.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium">{scan.projectName || "Deleted project"}</p>
                  <p className="text-xs text-muted-foreground">
                    {scan.startedAt ? new Date(scan.startedAt).toLocaleString() : "Unknown time"}
                  </p>
                </div>
                <Badge variant={scan.status === "failed" ? "destructive" : "outline"}>
                  {scan.issues ?? 0} findings
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}