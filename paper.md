from pathlib import Path

content = r'''---
title: "BugShield: A Heuristic Source-Code Security Scanning and Findings-Management Platform for Web Applications"
authors:
  - name: Ritesh Thorve
    affiliation: 1
affiliations:
  - name: Independent Researcher
    index: 1
date: 23 October 2026
---

# Summary

BugShield is a web-based tool intended to support preliminary security reviews of web-application source code. It provides workflows for submitting source code or referencing a public Git repository, running heuristic checks for selected insecure coding patterns and potentially exposed secrets, reviewing findings with severity and source-location context, tracking findings, and generating PDF reports. The project is implemented with Next.js, React, TypeScript, Tailwind CSS, PostgreSQL, Drizzle ORM, and `pdf-lib`. BugShield is intended to assist developers, cybersecurity students, and security practitioners during early-stage review; it does not replace expert assessment, dedicated security testing, or verification of findings.

# Statement of need

Web applications often contain insecure coding patterns and accidentally committed credentials. Identifying these issues early can reduce the effort required to investigate and remediate them. However, developers and learners may benefit from a single workflow that connects source submission, automated checks, evidence review, status tracking, and report generation.

BugShield addresses this workflow need by presenting scan results in a dashboard and organizing findings by severity, source location, evidence, and remediation status. Users can review reported issues, search or filter results, retain scan history, and export a PDF report for follow-up. The tool is designed for authorized assessments of source code and repositories. It is intended for preliminary triage rather than as a guarantee that an application is secure.

# Software design

BugShield is organized as a web application with a Next.js App Router interface and server-side actions and API handlers. React and TypeScript implement the user interface and application logic, while Tailwind CSS provides styling. PostgreSQL stores application data through Drizzle ORM and its schema/migration layer. PDF reports are generated using `pdf-lib`.

The main workflow consists of:

1. **Source submission:** A user provides source material or a public Git repository reference for an authorized review.
2. **Heuristic scanning:** The scanner evaluates supported source content against implemented detection patterns, including selected insecure coding patterns and potential secret exposure.
3. **Finding presentation:** Results are presented with available severity classification, file and line references, evidence, and remediation guidance.
4. **Review and tracking:** Dashboard metrics, search and filtering, scan history, and finding status support triage and follow-up.
5. **Reporting:** Users can generate a PDF report summarizing scan findings.

The scanner's coverage is determined by the implemented rules and the source formats it can process. A match is an indicator that should be investigated, not proof of exploitability. Similarly, the absence of a finding does not establish that the code is free of vulnerabilities. The architecture permits the detection rules and supported workflows to be extended as the project evolves.

# Limitations

BugShield's findings depend on the implemented heuristic patterns and supported input formats. Heuristic checks can produce false positives and false negatives, and complex business-logic flaws may not be identified. Repository access, source completeness, and configuration can affect scan coverage. Results should be validated by a qualified reviewer and, where appropriate, corroborated with testing and other security tools. BugShield should only be used on source code and repositories that the user is authorized to assess.

# Availability

Source code: <https://github.com/Ritesh-Thorve/BugShield>

The software version, licence, installation instructions, supported runtime versions, and reproducible test instructions should be documented in the repository before submission. Replace or expand this section with the exact release/tag and setup instructions that are present in the repository. Do not claim a release or licence unless it has actually been published.

# Acknowledgements

No external funding or specific acknowledgements are stated in this draft. Add any applicable funding, institutional support, or contributions before submission.

# References

- OWASP Foundation. *OWASP Top 10: The Ten Most Critical Web Application Security Risks*. <https://owasp.org/www-project-top-ten/>.
- Gitleaks. *Gitleaks: Find secrets with Gitleaks*. <https://github.com/gitleaks/gitleaks>.
- Semgrep. *Semgrep: Lightweight static analysis for many languages*. <https://semgrep.dev/>.
'''

path = Path("/mnt/data/paper.md")
path.write_text(content, encoding="utf-8")
print(f"Created {path}")
