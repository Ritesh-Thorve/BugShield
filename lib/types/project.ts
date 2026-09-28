export type ProjectStatus = 'pending' | 'scanning' | 'completed' | 'failed';

export interface CreateProjectData {
  name: string;
  code?: string;
  repository: string;
}

export interface Project {
  id: string;
  name: string;
  repository: string;
  code: string | null;
  lastScan: Date | null;
  status: ProjectStatus;
  issues: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProjectWithCode = Project & {
  code: string;
};

export type ProjectSummary = Omit<Project, 'code'>;


export interface Vulnerability {
  id: string;
  projectId: string | null;
  title: string;
  severity: string;
  description: string | null;
  code: string | null;
  location: string | null;
  status: string | null;
  createdAt: Date | null;
}