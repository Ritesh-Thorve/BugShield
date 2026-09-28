"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { saveProject } from "@/app/actions/projects";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";

declare global {
  interface Window {
    addProject: (name: string, code: string) => void;
  }
}

export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitProject = async (name: string, repository: string, code?: string) => {
    await saveProject({
      name,
      repository,
      code,
    });

    window.addProject?.(name, code ?? "");
    setOpen(false);
    setProjectName("");
    setGithubUrl("");
    setFileName("");
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const nextProjectName = projectName.trim() || file.name.replace(/\.[^/.]+$/, "");
    setProjectName(nextProjectName);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const code = e.target?.result as string;
      if (!code) return;

      await submitProject(nextProjectName, file.name, code);
    };

    reader.readAsText(file);
  };

  const handleGithubSubmit = async () => {
    const trimmedUrl = githubUrl.trim();
    if (!trimmedUrl) return;

    const nextProjectName = projectName.trim() || "GitHub Project";
    setProjectName(nextProjectName);

    await submitProject(nextProjectName, trimmedUrl, "");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new project</DialogTitle>
          <DialogDescription>
            Add a GitHub URL or upload a file to create a new project
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="projectName">Project Name</Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="githubUrl">GitHub URL</Label>
            <div className="flex gap-2">
              <Input
                id="githubUrl"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repository"
              />
              <Button type="button" variant="secondary" onClick={handleGithubSubmit}>
                Add URL
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider text-muted-foreground">
              <span className="bg-background px-2">Or</span>
            </div>
          </div>

          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.php"
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {fileName || "Upload File"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}