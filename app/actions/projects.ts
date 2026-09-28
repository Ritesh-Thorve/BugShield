'use server'

import { eq } from 'drizzle-orm'
import { count, desc, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, scans, vulnerabilities } from '@/lib/db/schema'
import type { CreateProjectData } from '@/lib/types/project'

async function fetchGitHubRepositoryCode(repository: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(repository);
  } catch {
    throw new Error('Enter a valid public GitHub repository URL.');
  }

  const [owner, repo] = parsedUrl.pathname.split('/').filter(Boolean);
  if (parsedUrl.hostname !== 'github.com' || !owner || !repo) {
    throw new Error('Enter a URL in the form https://github.com/owner/repository.');
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'sekiato-app',
  };
  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!repoResponse.ok) {
    throw new Error(repoResponse.status === 404
      ? 'Repository not found or private. Only public GitHub repositories can be scanned.'
      : `GitHub could not load this repository (HTTP ${repoResponse.status}).`);
  }

  const repoData = await repoResponse.json();
  const treeResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(repoData.default_branch)}?recursive=1`,
    { headers },
  );
  if (!treeResponse.ok) {
    throw new Error(`GitHub could not list repository files (HTTP ${treeResponse.status}).`);
  }

  const treeData = await treeResponse.json();
  if (treeData.truncated) {
    throw new Error('GitHub truncated this repository file listing, so a complete scan is not possible through its API.');
  }
  const allowedExtensions = new Set([
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'php', 'java', 'c', 'cc', 'cpp', 'h', 'hh', 'hpp', 'cs', 'go', 'rb', 'rs', 'swift', 'kt', 'kts', 'scala', 'sql', 'sh', 'bash', 'yml', 'yaml', 'json', 'toml', 'ini', 'xml', 'html', 'css', 'conf', 'properties', 'env',
  ]);
  const excludedPath = /(^|\/)(\.git|node_modules|vendor|dist|build|coverage|\.next|target|Pods|\.venv|venv)(\/|$)/i;
  const excludedFile = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|composer\.lock|poetry\.lock|Gemfile\.lock|go\.sum)$/i;
  const files = (Array.isArray(treeData.tree) ? treeData.tree : [])
    .filter((item: { type?: string; path?: string }) => {
      const filePath = item.path ?? '';
      const name = filePath.split('/').pop() ?? '';
      const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : name.toLowerCase();
      return item.type === 'blob'
        && allowedExtensions.has(extension)
        && !excludedPath.test(filePath)
        && !excludedFile.test(filePath);
    });
  if (!files.length) {
    throw new Error('No supported source or configuration files were found in this repository.');
  }

  const sources: string[] = [];
  let totalCharacters = 0;
  const maximumCharacters = 50 * 1024 * 1024;
  for (let index = 0; index < files.length; index += 8) {
    const batch = files.slice(index, index + 8);
    const batchSources = await Promise.all(batch.map(async (file: { path: string }) => {
      const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
      const response = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(repoData.default_branch)}/${encodedPath}`,
        { headers: { 'User-Agent': 'sekiato-app' } },
      );
      if (!response.ok) {
        throw new Error(`Could not download ${file.path} from GitHub (HTTP ${response.status}); scan stopped to avoid partial results.`);
      }
      return { path: file.path, text: await response.text() };
    }));

    for (const source of batchSources) {
      totalCharacters += source.text.length;
      if (totalCharacters > maximumCharacters) {
        throw new Error('Repository source exceeds the 50 MB scan limit; no partial scan was saved.');
      }
      sources.push(`// File: ${source.path}\n${source.text}`);
    }
  }

  const code = sources.join('\n\n');
  if (!code.trim()) {
    throw new Error('No readable source files were found in this repository.');
  }
  return code;
}

function findVulnerabilities(code: string, sourceName = 'Uploaded source') {
  const rules = [
    { title: 'Dynamic code execution', severity: 'high', description: 'Dynamic evaluation can execute attacker-controlled input.', pattern: /\beval\s*\(|\bnew\s+Function\s*\(/i },
    { title: 'Unsafe HTML injection (XSS)', severity: 'high', description: 'Writing data to an HTML sink can enable cross-site scripting.', pattern: /\.innerHTML\s*=|\.outerHTML\s*=|document\.write\s*\(|dangerouslySetInnerHTML/i },
    { title: 'Potential cross-site scripting', severity: 'medium', description: 'Unescaped user-controlled output may be interpreted as HTML or script.', pattern: /\bres\.send\s*\(\s*(req\.|request\.)|\bhtml_safe\b|\bsafe\s*\|/i },
    { title: 'Unsafe shell execution', severity: 'high', description: 'Shell execution with dynamic input can enable command injection.', pattern: /\b(shell_exec|system|passthru|popen|child_process\.exec|execSync)\s*\(|\bexec\s*\(/i },
    { title: 'Subprocess with shell enabled', severity: 'high', description: 'Enabling shell execution for subprocess calls risks command injection.', pattern: /subprocess\.[\w]+\([^\n]*shell\s*=\s*True/i },
    { title: 'Unsafe PHP file inclusion', severity: 'high', description: 'Including a path derived from request input can enable file inclusion or traversal.', pattern: /\b(include|require)(_once)?\s*\(?\s*[^;]*(\$_(GET|POST|REQUEST|FILES))/i },
    { title: 'Path traversal risk', severity: 'high', description: 'A user-controlled path is passed to a file read/write operation without visible validation.', pattern: /(readFile|readFileSync|createReadStream|writeFile|sendFile|open)\s*\([^\n]*(req\.(query|params|body)|request\.(GET|POST)|\$_(GET|POST|REQUEST))/i },
    { title: 'Unsafe memory operation', severity: 'high', description: 'Unbounded memory-copy or formatting functions can cause buffer overflows.', pattern: /\b(strcpy|strcat|sprintf|gets|memcpy)\s*\(/i },
    { title: 'Potential SQL injection', severity: 'high', description: 'SQL query construction appears to combine query text with untrusted input; use parameterized queries.', pattern: /(query|execute|raw)\s*\([^\n]*(\$_(GET|POST|REQUEST)|\+\s*(req\.|request\.)|\$\{.*(?:req|params|input))/i },
    { title: 'Potential NoSQL injection', severity: 'high', description: 'Request data is used directly in a database filter, which may allow query-operator injection.', pattern: /(find|findOne|updateOne|deleteOne)\s*\(\s*(req\.(body|query)|request\.(json|form))/i },
    { title: 'Potential server-side request forgery', severity: 'high', description: 'A request URL appears to be derived from user input; validate and allowlist destinations.', pattern: /(fetch|axios\.(get|post)|requests\.(get|post)|http\.get)\s*\(\s*(req\.|request\.|userInput|url\b)/i },
    { title: 'Insecure deserialization', severity: 'high', description: 'Deserializing untrusted data can lead to code execution or object injection.', pattern: /(pickle\.loads|yaml\.load\s*\((?![^)]*SafeLoader)|unserialize\s*\(|ObjectInputStream|JavaScriptSerializer)/i },
    { title: 'Potential XXE', severity: 'high', description: 'XML parsing should disable external entity resolution for untrusted XML.', pattern: /(DocumentBuilderFactory|SAXParserFactory|XMLReader|etree\.parse|lxml\.etree)/i },
    { title: 'Weak cryptographic hash', severity: 'medium', description: 'MD5 or SHA-1 is unsuitable for security-sensitive hashing.', pattern: /(md5|sha1|createHash\s*\(\s*['"](?:md5|sha1))/i },
    { title: 'Insecure TLS verification', severity: 'high', description: 'TLS certificate verification appears disabled, allowing man-in-the-middle attacks.', pattern: /(rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|CERT_NONE)/i },
    { title: 'Permissive CORS configuration', severity: 'medium', description: 'Wildcard CORS combined with credentials can expose authenticated responses.', pattern: /(Access-Control-Allow-Origin['"]?\s*[,=:]\s*['"]\*|origin\s*:\s*['"]\*['"])/i },
    { title: 'Hardcoded credential', severity: 'high', description: 'A credential-like value appears hardcoded; move secrets to a secure secret store.', pattern: /(?:api[_-]?key|client[_-]?secret|password|passwd|token|secret)\s*[:=]\s*['"][^'"]{8,}['"]/i },
    { title: 'Insecure random number generator', severity: 'medium', description: 'Non-cryptographic randomness must not be used for tokens, keys, or security-sensitive identifiers.', pattern: /(Math\.random\s*\(|random\.random\s*\(|new Random\s*\()/i },
    { title: 'Unsafe open redirect', severity: 'medium', description: 'Redirect destination may be controlled by user input; validate against an allowlist.', pattern: /(redirect|location\.href)\s*\(?\s*(req\.(query|body)|request\.(GET|POST)|\$_(GET|POST))/i },
    { title: 'Potential ReDoS', severity: 'medium', description: 'Nested or ambiguous repetition in a regular expression may cause excessive backtracking.', pattern: /new RegExp\s*\([^\n]*(req\.|request\.|userInput)|\/\([^)]*[+*][^)]*\)[+*]/i },
    { title: 'Unsafe cookie configuration', severity: 'medium', description: 'Cookie configuration should enable HttpOnly, Secure, and an appropriate SameSite policy.', pattern: /(cookie|setCookie)\s*\([^\n]*(httpOnly\s*:\s*false|secure\s*:\s*false|sameSite\s*:\s*false)/i },
    { title: 'Debug mode enabled', severity: 'medium', description: 'Debug mode can expose sensitive diagnostics and should be disabled in production.', pattern: /(DEBUG\s*=\s*True|debug\s*:\s*true|app\.run\([^\n]*debug\s*=\s*True)/i },
  ];

  const findings: Array<{ title: string; severity: string; description: string; location: string; code: string }> = [];
  let currentFile = sourceName;
  let currentLine = 0;
  for (const line of code.split('\n')) {
    const fileMarker = line.match(/^\/\/ File: (.+)$/);
    if (fileMarker) {
      currentFile = fileMarker[1];
      currentLine = 0;
      continue;
    }
    currentLine += 1;
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        findings.push({
          title: rule.title,
          severity: rule.severity,
          description: rule.description,
          location: `${currentFile}:${currentLine}`,
          code: line.trim().slice(0, 1000),
        });
      }
    }
  }
  return findings;
}

export async function getProjects() {
  return await db.select().from(projects)
}

export async function getVulnerabilities() {
  return await db.select({
    id: vulnerabilities.id,
    projectId: vulnerabilities.projectId,
    title: vulnerabilities.title,
    severity: vulnerabilities.severity,
    description: vulnerabilities.description,
    code: vulnerabilities.code,
    location: vulnerabilities.location,
    status: vulnerabilities.status,
    createdAt: vulnerabilities.createdAt,
    repository: projects.repository,
  }).from(vulnerabilities).leftJoin(projects, eq(vulnerabilities.projectId, projects.id));
}

export async function getDashboardData() {
  const [projectCount] = await db.select({ value: count() }).from(projects);
  const [openCount] = await db.select({ value: count() }).from(vulnerabilities).where(eq(vulnerabilities.status, 'open'));
  const [scanCount] = await db.select({ value: count() }).from(scans);
  const [resolvedCount] = await db.select({ value: count() }).from(vulnerabilities).where(eq(vulnerabilities.status, 'fixed'));
  const [allFindings] = await db.select({ value: count() }).from(vulnerabilities);

  const recentProjects = await db.select({
    id: projects.id,
    name: projects.name,
    repository: projects.repository,
    status: projects.status,
    issues: projects.issues,
    lastScan: projects.lastScan,
  }).from(projects).orderBy(desc(projects.lastScan)).limit(6);
  const scannedProjectRows = await db.select({
    id: projects.id,
    name: projects.name,
    issues: projects.issues,
    lastScan: projects.lastScan,
  }).from(projects).where(gte(projects.lastScan, new Date(0)));

  const recentScans = await db.select({
    id: scans.id,
    projectId: scans.projectId,
    status: scans.status,
    startedAt: scans.startedAt,
    completedAt: scans.completedAt,
    projectName: projects.name,
    issues: projects.issues,
  }).from(scans).leftJoin(projects, eq(scans.projectId, projects.id))
    .orderBy(desc(scans.startedAt)).limit(6);
  const projectsWithScanHistory = await db.select({ projectId: scans.projectId }).from(scans);

  const recentFindings = await db.select({
    severity: vulnerabilities.severity,
    createdAt: vulnerabilities.createdAt,
  }).from(vulnerabilities).where(gte(vulnerabilities.createdAt, new Date(Date.now() - 5 * 30 * 24 * 60 * 60 * 1000)));

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index), 1);
    return {
      name: date.toLocaleString('en', { month: 'short' }),
      year: date.getFullYear(),
      month: date.getMonth(),
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
  });

  for (const finding of recentFindings) {
    if (!finding.createdAt) continue;
    const month = months.find((item) => item.month === finding.createdAt!.getMonth() && item.year === finding.createdAt!.getFullYear());
    if (!month) continue;
    const severity = finding.severity.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
    if (severity in month) month[severity] += 1;
  }

  const scannedProjectIds = new Set(projectsWithScanHistory.map((scan) => scan.projectId).filter(Boolean));
  const legacyScanRows = scannedProjectRows
    .filter((project) => project.lastScan && !scannedProjectIds.has(project.id))
    .map((project) => ({
      id: `legacy-${project.id}`,
      projectId: project.id,
      status: 'completed',
      startedAt: project.lastScan,
      completedAt: project.lastScan,
      projectName: project.name,
      issues: project.issues,
    }));
  const dashboardRecentScans = [...recentScans, ...legacyScanRows]
    .sort((left, right) => (right.startedAt?.getTime() ?? 0) - (left.startedAt?.getTime() ?? 0))
    .slice(0, 6);
  const legacyScanCount = scannedProjectRows.filter((project) => project.lastScan && !scannedProjectIds.has(project.id)).length;
  const findingTotal = allFindings.value;
  return {
    stats: {
      projects: projectCount.value,
      openFindings: openCount.value,
      scans: scanCount.value + legacyScanCount,
      resolvedRate: findingTotal ? Math.round((resolvedCount.value / findingTotal) * 100) : 0,
    },
    chart: months.map(({ name, critical, high, medium, low }) => ({ name, critical, high, medium, low })),
    recentProjects,
    recentScans: dashboardRecentScans,
  };
}

export async function saveProject(data: CreateProjectData) {
  const repoValue = data.repository.trim();
  const rawCode = data.code?.trim()
    ? data.code
    : await fetchGitHubRepositoryCode(repoValue);
  const id = globalThis.crypto.randomUUID();
  await db.insert(projects).values({
    id,
    name: data.name.trim(),
    repository: repoValue,
    code: rawCode,
    status: 'scanning',
    issues: 0,
    lastScan: new Date(),
  });
  const findings = findVulnerabilities(rawCode, repoValue);
  const completedAt = new Date();
  if (findings.length) {
    await db.insert(vulnerabilities).values(findings.map((finding) => ({
      id: globalThis.crypto.randomUUID(),
      projectId: id,
      title: finding.title,
      severity: finding.severity,
      description: finding.description,
      code: finding.code,
      location: finding.location,
      status: 'open',
      createdAt: new Date(),
    })));
  }
  await db.update(projects).set({
    status: 'completed',
    issues: findings.length,
    lastScan: completedAt,
  }).where(eq(projects.id, id));
  await db.insert(scans).values({
    projectId: id,
    status: 'completed',
    startedAt: completedAt,
    completedAt,
  });

  return { id, findings: findings.length };
}

export async function scanProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error('Project not found.');

  const code = project.repository.startsWith('https://github.com/')
    ? await fetchGitHubRepositoryCode(project.repository)
    : project.code ?? '';
  if (!code.trim()) throw new Error('No source code is available to scan.');

  const findings = findVulnerabilities(code, project.repository);
  const completedAt = new Date();
  await db.delete(vulnerabilities).where(eq(vulnerabilities.projectId, projectId));
  if (findings.length) {
    await db.insert(vulnerabilities).values(findings.map((finding) => ({
      id: globalThis.crypto.randomUUID(),
      projectId,
      title: finding.title,
      severity: finding.severity,
      description: finding.description,
      code: finding.code,
      location: finding.location,
      status: 'open',
      createdAt: new Date(),
    })));
  }
  await db.update(projects).set({
    code,
    status: 'completed',
    issues: findings.length,
    lastScan: completedAt,
  }).where(eq(projects.id, projectId));
  await db.insert(scans).values({
    projectId,
    status: 'completed',
    startedAt: completedAt,
    completedAt,
  });
  return { findings: findings.length };
}

export async function deleteProject(projectId: string) {
  await db.delete(vulnerabilities).where(eq(vulnerabilities.projectId, projectId));
  await db.delete(scans).where(eq(scans.projectId, projectId));
  await db.delete(projects).where(eq(projects.id, projectId));
}