# BugShield

BugShield is a Next.js application for managing code projects, running heuristic security scans, reviewing findings, and exporting a PDF report.

> **Security notice:** The scanner uses source-code pattern matching. It can produce false positives and miss vulnerabilities; it is not a substitute for code review, a maintained SAST engine, dependency scanning, or penetration testing. Do not rely on it as a security certification.

## Features

- Clerk sign-in and sign-up
- Project management with either a public GitHub repository URL or a source-file upload
- Pattern-based source scanning with severity, file/line location, and matched-code excerpts
- Dashboard metrics, finding trends, priority findings, and recent scan activity
- Searchable and filterable vulnerability list
- PDF report with summary, findings register, source evidence, and remediation suggestions
- Account settings for provider tokens and scan/notification preferences

## Technology

- Next.js 16 App Router and React 18
- TypeScript and Tailwind CSS
- PostgreSQL with Drizzle ORM and Drizzle Kit
- Clerk authentication
- `pdf-lib` for PDF report generation

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL 14 or newer
- A Clerk application with the Next.js integration enabled

Public GitHub repository scans use the GitHub API and do not require a token. Private repositories are not currently supported by the repository scanner, even though the Settings page can store provider tokens.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` in the project root with these variables:

   ```dotenv
   DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/bugshield
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
   CLERK_SECRET_KEY=sk_test_replace_me
   ```

   Use values from your own Clerk instance. Never commit `.env.local`, paste credentials into issue trackers, or reuse development credentials in production.

3. Create a PostgreSQL database matching `DATABASE_URL`, then apply the Drizzle schema:

   ```bash
   npx drizzle-kit push
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Visit [http://localhost:3000](http://localhost:3000). Sign in through Clerk; the root route redirects to the dashboard.

## Available commands

```bash
npm run dev       # Start the Next.js development server
npm run build     # Create and type-check a production build
npm run start     # Start the production build (run npm run build first)
npx tsc --noEmit  # Run TypeScript checks without emitting files
```

The current `npm run lint` script is not operational with the installed Next.js version. There is no test script yet. Do not treat lint or automated tests as passing until those checks are added and configured.

## Using BugShield

1. Sign in or create an account through Clerk.
2. Open **Projects** and choose **New Project**.
3. Paste a public GitHub repository URL or upload a supported text source file.
4. Review scan findings from the dashboard or the **Vulnerabilities** page.
5. Use the project row's scan control to rescan or its delete control to remove a project and associated scan results.
6. Download a PDF report from the Vulnerabilities page.

The GitHub scanner downloads supported source/configuration files from the repository's default branch, skips common generated/dependency directories, and enforces a 50 MB combined-source limit. It stops with an error rather than reporting a partial scan if GitHub truncates its file listing or a source file cannot be downloaded. Uploaded-file scanning is intended for text source files.

## Database schema

Drizzle schema definitions are in `lib/db/schema.ts`. The current schema includes:

- `projects`: project name, repository, stored source, scan status, issue count, last scan time
- `scans`: scan status and start/completion timestamps
- `vulnerabilities`: finding title, severity, description, source excerpt, location, and status

Schema migrations are under `lib/db/migrations`. `drizzle-kit push` is convenient for local development; use reviewed, versioned migrations for production deployment.

## Production readiness

This codebase should not be deployed for multiple real users until project and finding queries are scoped to an authenticated owner. The current schema has no owner/user ID on projects, and server actions can operate on globally queried project and finding records. Add ownership constraints and a reviewed migration before exposing user data.

Before deployment:

- Rotate any credentials previously used in development and provision new production secrets.
- Configure production Clerk keys, allowed origins, and sign-in/sign-up settings.
- Use a managed PostgreSQL database, TLS connections, backups, connection pooling, and reviewed migrations.
- Resolve all high-severity dependency audit findings. In particular, review unused packages and run `npm audit` after dependency changes.
- Add a working linter, unit/integration tests, and CI checks.
- Add rate limits and timeouts for repository scans and PDF export.
- Decide how findings are retained, resolved, and deleted; currently the product has no scheduled scans or email delivery.
- Review scanner rules and verify every finding manually; patterns alone do not establish exploitability.

Check dependencies with:

```bash
npm audit
```

## Repository structure

```text
app/                 Next.js routes, server actions, and API handlers
components/          Dashboard, project, settings, vulnerability, and UI components
lib/db/              Drizzle database connection, schema, and migrations
lib/types/           Shared TypeScript types
public/              Static assets
```