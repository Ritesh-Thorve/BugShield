'use server'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, vulnerabilities } from '@/lib/db/schema'
import type { CreateProjectData } from '@/lib/types/project'

const FALLBACK_PORTS: Record<string, string> = {
  cpp: 'http://127.0.0.1:8000/predict',
  'c++': 'http://127.0.0.1:8000/predict',
  js: 'http://127.0.0.1:8001/predict',
  php: 'http://127.0.0.1:8003/predict',
};

function normalizeFileType(repository: string) {
  return (repository.split('.').pop() ?? '').trim().toLowerCase();
}

function getLocalAnalysis(code: string, fileType: string) {
  const source = code.toLowerCase();
  const matches = {
    injection: /(eval\s*\(|document\.cookie|innerhtml|outerhtml|new\s+function|exec\s*\(|system\s*\(|shell_exec\s*\(|mysqli_query\s*\(|\$_get\[|\$_post\[|strcpy\s*\(|gets\s*\()/i,
    sensitive: /(api[_-]?key|secret|token|password|private[_-]?key)/i,
    unsafeRead: /(fs\.readFile|file_get_contents|readFileSync|http\.request|fetch\s*\()/i,
  };

  const isVulnerable = Object.values(matches).some((pattern) => pattern.test(code));

  if (isVulnerable) {
    const severity =
      /(eval\s*\(|innerhtml|document\.cookie|exec\s*\(|system\s*\(|strcpy\s*\(|gets\s*\()/i.test(code)
        ? 'high'
        : /(mysqli_query\s*\(|\$_get\[|\$_post\[|fetch\s*\()/i.test(code)
          ? 'medium'
          : 'low';

    let description = 'Unsafe pattern detected in the uploaded code.';

    if (fileType === 'js' || fileType === 'jsx' || fileType === 'ts' || fileType === 'tsx') {
      description = 'The code contains unsafe dynamic execution or DOM injection patterns that can lead to XSS or code injection.';
    } else if (fileType === 'php') {
      description = 'The code uses direct request data or command execution without validation, which can expose injection or command execution risks.';
    } else if (fileType === 'cpp' || fileType === 'c++' || fileType === 'c') {
      description = 'The code uses unsafe string or command execution APIs that can result in buffer overflows or command injection.';
    }

    return {
      title: 'Security Vulnerability Detected',
      severity,
      description,
      status: 'Vulnerable',
      location: 'Local code analysis',
    };
  }

  return {
    title: 'No Vulnerability Found',
    severity: 'low',
    description: 'No high-confidence vulnerability pattern was detected in the uploaded source code.',
    status: 'Clean',
    location: 'Local code analysis',
  };
}

function normalizeRemoteResult(fileType: string, result: any) {
  if (fileType === 'cpp' || fileType === 'c++') {
    const analysis = result?.BugShield_Analysis ?? result ?? {};
    return {
      title: analysis?.vulnerability_status === 'Vulnerable' ? 'Security Vulnerability Detected' : 'No Vulnerability Found',
      severity: analysis?.severity ?? 'high',
      description: analysis?.explanation ?? 'No explanation provided.',
      status: analysis?.vulnerability_status ?? 'Clean',
    };
  }

  if (fileType === 'js') {
    return {
      title: result?.status === 'Vulnerable' ? 'Security Vulnerability Detected' : 'No Vulnerability Found',
      severity: result?.severity ?? 'low',
      description: result?.description ?? 'No description provided.',
      status: result?.status ?? 'Clean',
    };
  }

  if (fileType === 'php') {
    return {
      title: result?.name ?? 'Security Scan Result',
      severity: result?.severity ?? 'low',
      description: `${result?.description ?? 'No description provided.'} ${result?.vulnerable_code ?? ''}`.trim(),
      status: result?.status ?? 'Clean',
    };
  }

  return {
    title: 'Security Scan Result',
    severity: 'low',
    description: 'No analysis data returned.',
    status: 'Clean',
  };
}

export async function getProjects() {
  return await db.select().from(projects)
}

export async function getVulnerabilities() {
  return await db.select().from(vulnerabilities)
}

export async function saveProject(data: CreateProjectData) {
  const id = globalThis.crypto.randomUUID()
  const fileType = normalizeFileType(data.repository)

  await db.insert(projects).values({
    id,
    name: data.name,
    repository: data.repository,
    code: data.code,
    status: 'pending',
    issues: 0,
    lastScan: new Date(),
  })

  const url = FALLBACK_PORTS[fileType] ?? ''
  const vulnId = globalThis.crypto.randomUUID()

  let result: any = null;

  if (url) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: data.code }),
      });

      if (response.ok) {
        result = await response.json();
      }
    } catch (error) {
      console.warn(`Scanner backend unavailable for ${fileType}:`, error)
    }
  }

  const analysis = result ? normalizeRemoteResult(fileType, result) : getLocalAnalysis(data.code, fileType)

  await db.insert(vulnerabilities).values({
    id: vulnId,
    projectId: id,
    title: analysis.title,
    severity: analysis.severity,
    description: analysis.description,
    code: data.code,
    location: data.repository,
    status: analysis.status,
    createdAt: new Date(),
  })

  await db.update(projects).set({
    status: 'completed',
    issues: analysis.status === 'Vulnerable' ? 1 : 0,
    lastScan: new Date(),
  }).where(eq(projects.id, id))

  return { id }
}