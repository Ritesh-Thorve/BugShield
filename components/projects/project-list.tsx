"use client";


import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Trash2, Code, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteProject, getProjects, scanProject } from "@/app/actions/projects";

interface Project {
  id: string;
  name: string;
  repository: string;
  lastScan: string;
  status: string;
  issues: number;
  code?: string;
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadProjects() {
      try {
        const dbProjects = await getProjects();
        if (!mounted) return;
        setProjects(dbProjects.map(project => ({
          ...project,
          lastScan: project.lastScan ? new Date(project.lastScan).toLocaleString() : 'Never',
          status: project.status || 'unknown',
          issues: project.issues || 0,
          code: project.code || '',
        })));
        setError("");
      } catch (caughtError) {
        if (mounted) setError(caughtError instanceof Error ? caughtError.message : "Could not load projects.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadProjects();
    const refresh = () => loadProjects();
    window.addEventListener("projects:refresh", refresh);
    return () => {
      mounted = false;
      window.removeEventListener("projects:refresh", refresh);
    };
  }, []);

  const handleScan = async (projectId: string) => {
    setBusyProjectId(projectId);
    setError("");
    try {
      await scanProject(projectId);
      window.dispatchEvent(new Event("projects:refresh"));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not scan this project.");
    } finally {
      setBusyProjectId(null);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!window.confirm("Delete this project and its scan results?")) return;
    setBusyProjectId(projectId);
    setError("");
    try {
      await deleteProject(projectId);
      setProjects(current => current.filter(project => project.id !== projectId));
      if (selectedProject?.id === projectId) setSelectedProject(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not delete this project.");
    } finally {
      setBusyProjectId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading projects...</div>
      ) : projects.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          No projects yet. Add a project to begin scanning for vulnerabilities.
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Repository</TableHead>
                <TableHead>Last Scan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell>{project.repository}</TableCell>
                  <TableCell>{project.lastScan}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant={project.status === "failed" ? "destructive" : "outline"}>{project.status}</Badge>
                      <span className="text-xs text-muted-foreground">{project.issues} findings</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => setSelectedProject(project)}
                        disabled={!project.code}
                        title="View source code"
                      >
                        <Code className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleScan(project.id)} disabled={busyProjectId === project.id} title="Scan project">
                        {busyProjectId === project.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(project.id)} disabled={busyProjectId === project.id} title="Delete project">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {selectedProject?.code && (
        <Card className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Code Preview: {selectedProject.name}</h3>
            <Button variant="ghost" onClick={() => setSelectedProject(null)}>
              Close
            </Button>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <pre className="overflow-auto max-h-[500px] text-sm font-mono whitespace-pre-wrap">
              {selectedProject.code}
            </pre>
          </div>
        </Card>
      )}
    </div>
  );
}