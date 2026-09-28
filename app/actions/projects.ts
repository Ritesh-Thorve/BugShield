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

function isGitHubRepoUrl(value: string) {
  return /github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i.test(value);
}

async function fetchGitHubRepositoryCode(repository: string) {
  const match = repository.match(/github\.com\/([^/]+)\/([^/]+)(?:\/.*)?$/i);
  if (!match) {
    return '';
  }

  const [, owner, repo] = match;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;

  const treeResponse = await fetch(apiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sekiato-app',
    },
  });

  if (!treeResponse.ok) {
    return '';
  }

  const treeData = await treeResponse.json();
  const files = Array.isArray(treeData?.tree)
    ? treeData.tree.filter((item: any) => item && item.type === 'blob' && !item.path.startsWith('.git'))
    : [];

  const textExtensions = new Set([
    'js', 'jsx', 'ts', 'tsx', 'py', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rb', 'rs', 'swift', 'yaml', 'yml', 'json', 'sql', 'sh', 'bash', 'css', 'html', 'xml'
  ]);

  const snippets: string[] = [];

  for (const file of files) {
    const path = file.path as string;
    const extension = path.split('.').pop()?.toLowerCase() ?? '';

    if (!textExtensions.has(extension)) {
      continue;
    }

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`;
    try {
      const rawResponse = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'sekiato-app',
        },
      });

      if (!rawResponse.ok) {
        continue;
      }

      const contentType = rawResponse.headers.get('content-type') ?? '';
      if (contentType.includes('application/octet-stream') || contentType.includes('image/')) {
        continue;
      }

      const text = await rawResponse.text();
      if (!text || text.length > 400000) {
        continue;
      }

      snippets.push(`// File: ${path}\n${text}`);
    } catch {
      continue;
    }
  }

  return snippets.join('\n\n');
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
  const repoValue = data.repository ?? ''
  let rawCode = data.code ?? ''

  if (!rawCode.trim() && isGitHubRepoUrl(repoValue)) {
    rawCode = await fetchGitHubRepositoryCode(repoValue)
  }

  const fileType = normalizeFileType(repoValue)

  await db.insert(projects).values({
    id,
    name: data.name,
    repository: repoValue,
    code: rawCode,
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

  const analysis = result ? normalizeRemoteResult(fileType, result) : getLocalAnalysis(rawCode, fileType)

  if (!rawCode.trim()) {
    const fallbackAnalysis = {
      title: 'No source code was available for scanning',
      severity: 'low',
      description: 'The project repository could not be fetched or it contains no readable source code files.',
      status: 'Clean',
    };

    await db.insert(vulnerabilities).values({
      id: vulnId,
      projectId: id,
      title: fallbackAnalysis.title,
      severity: fallbackAnalysis.severity,
      description: fallbackAnalysis.description,
      code: rawCode,
      location: repoValue,
      status: fallbackAnalysis.status,
      createdAt: new Date(),
    })

    await db.update(projects).set({
      status: 'completed',
      issues: 0,
      lastScan: new Date(),
    }).where(eq(projects.id, id))

    return { id }
  }

  await db.insert(vulnerabilities).values({
    id: vulnId,
    projectId: id,
    title: analysis.title,
    severity: analysis.severity,
    description: analysis.description,
    code: rawCode,
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