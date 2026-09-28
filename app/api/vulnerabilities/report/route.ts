import { NextResponse } from 'next/server';
import { getVulnerabilities } from '@/app/actions/projects';
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type RGB } from 'pdf-lib';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const COLORS = {
  navy: rgb(0.07, 0.16, 0.25),
  ink: rgb(0.13, 0.17, 0.2),
  muted: rgb(0.39, 0.44, 0.48),
  line: rgb(0.83, 0.87, 0.89),
  panel: rgb(0.95, 0.96, 0.97),
  white: rgb(1, 1, 1),
};

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawTextBlock(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; width: number; size: number; font: PDFFont; color: RGB; lineHeight?: number },
) {
  const { x, width, size, font, color, lineHeight = size * 1.45 } = options;
  let y = options.y;
  for (const line of wrapText(text, font, size, width)) {
    if (y < 54) break;
    if (line) page.drawText(line, { x, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

function cleanPdfText(text: string) {
  return text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?')
    .replace(/\t/g, '  ');
}

function titleCase(value: string | null) {
  return (value || 'Unknown').replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSeverityColor(severity: string | null): RGB {
  switch ((severity || '').toLowerCase()) {
    case 'critical': return rgb(0.72, 0.08, 0.12);
    case 'high': return rgb(0.82, 0.28, 0.08);
    case 'medium': return rgb(0.7, 0.48, 0.03);
    case 'low': return rgb(0.08, 0.38, 0.57);
    default: return rgb(0.32, 0.36, 0.4);
  }
}

function drawPageHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, section: string) {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 48, width: PAGE_WIDTH, height: 48, color: COLORS.navy });
  page.drawText('BUGSHIELD', { x: MARGIN, y: PAGE_HEIGHT - 30, size: 10, font: bold, color: COLORS.white });
  page.drawText(section.toUpperCase(), { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(section.toUpperCase(), 8), y: PAGE_HEIGHT - 30, size: 8, font: regular, color: rgb(0.78, 0.86, 0.9) });
}

function drawPageFooter(page: PDFPage, regular: PDFFont, pageNumber: number) {
  page.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: PAGE_WIDTH - MARGIN, y: 40 }, thickness: 0.7, color: COLORS.line });
  page.drawText('CONFIDENTIAL  |  Pattern-based security assessment', { x: MARGIN, y: 25, size: 7, font: regular, color: COLORS.muted });
  const label = `Page ${pageNumber}`;
  page.drawText(label, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(label, 8), y: 25, size: 8, font: regular, color: COLORS.muted });
}

function recommendationFor(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes('sql') || normalized.includes('nosql')) return 'Use parameterized queries or the database driver query builder. Validate input, but do not rely on input filtering as the primary defense.';
  if (normalized.includes('html') || normalized.includes('cross-site scripting') || normalized.includes('xss')) return 'Avoid writing untrusted values to HTML. Use framework escaping or safe text APIs; sanitize only when rendering intentional HTML.';
  if (normalized.includes('shell') || normalized.includes('command')) return 'Avoid shell execution. Use a process API with a fixed executable and separate argument array, and validate allowed arguments.';
  if (normalized.includes('path traversal') || normalized.includes('file inclusion')) return 'Resolve paths against an allowed base directory, reject traversal outside it, and use an allowlist of permitted files.';
  if (normalized.includes('server-side request forgery') || normalized.includes('ssrf')) return 'Allowlist trusted hosts and schemes, reject private/link-local IP ranges, and validate the final resolved destination after redirects.';
  if (normalized.includes('credential')) return 'Revoke and rotate the exposed credential. Load secrets from a managed secret store or environment configuration and keep them out of source control.';
  if (normalized.includes('deserialization')) return 'Do not deserialize untrusted data with unsafe object-capable formats. Use a safe parser and validate the resulting schema.';
  if (normalized.includes('xxe') || normalized.includes('xml')) return 'Disable external entity and DTD processing in the XML parser, or use a hardened parser configuration.';
  if (normalized.includes('tls') || normalized.includes('cors') || normalized.includes('cookie')) return 'Use secure production defaults and explicitly restrict trusted origins, TLS verification, and cookie flags.';
  if (normalized.includes('random')) return 'Use a cryptographically secure random number generator for tokens, keys, and security-sensitive identifiers.';
  if (normalized.includes('redirect')) return 'Validate redirect destinations against a strict allowlist or accept only local relative paths.';
  if (normalized.includes('memory')) return 'Use bounds-checked APIs and validate buffer lengths before copying or formatting data.';
  return 'Review the data flow at this location, validate untrusted input, and use the platform’s safe API for this operation.';
}

export async function GET() {
  try {
    const vulnerabilities = await getVulnerabilities();
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const counts = {
      critical: vulnerabilities.filter((item) => item.severity.toLowerCase() === 'critical').length,
      high: vulnerabilities.filter((item) => item.severity.toLowerCase() === 'high').length,
      medium: vulnerabilities.filter((item) => item.severity.toLowerCase() === 'medium').length,
      low: vulnerabilities.filter((item) => item.severity.toLowerCase() === 'low').length,
    };
    const repositories = [...new Set(vulnerabilities.map((item) => item.repository).filter(Boolean))];

    let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 202, width: PAGE_WIDTH, height: 202, color: COLORS.navy });
    page.drawText('BUGSHIELD  /  SECURITY ASSESSMENT', { x: MARGIN, y: PAGE_HEIGHT - 54, size: 9, font: bold, color: rgb(0.72, 0.84, 0.88) });
    page.drawText('Vulnerability Report', { x: MARGIN, y: PAGE_HEIGHT - 106, size: 30, font: bold, color: COLORS.white });
    page.drawText('Repository code review', { x: MARGIN, y: PAGE_HEIGHT - 134, size: 12, font: regular, color: rgb(0.87, 0.91, 0.93) });
    page.drawText(`Generated ${new Date().toLocaleString()}`, { x: MARGIN, y: PAGE_HEIGHT - 170, size: 9, font: regular, color: rgb(0.78, 0.85, 0.88) });

    page.drawText('EXECUTIVE SUMMARY', { x: MARGIN, y: PAGE_HEIGHT - 244, size: 10, font: bold, color: COLORS.navy });
    page.drawText(`${vulnerabilities.length} findings`, { x: MARGIN, y: PAGE_HEIGHT - 278, size: 23, font: bold, color: COLORS.ink });
    page.drawText(`Across ${repositories.length} ${repositories.length === 1 ? 'repository' : 'repositories'}`, { x: MARGIN, y: PAGE_HEIGHT - 299, size: 9, font: regular, color: COLORS.muted });

    const severityEntries = Object.entries(counts);
    const cardGap = 10;
    const cardWidth = (PAGE_WIDTH - MARGIN * 2 - cardGap * 3) / 4;
    const cardY = PAGE_HEIGHT - 382;
    severityEntries.forEach(([severity, amount], index) => {
      const x = MARGIN + index * (cardWidth + cardGap);
      const severityColor = getSeverityColor(severity);
      page.drawRectangle({ x, y: cardY, width: cardWidth, height: 58, color: COLORS.panel });
      page.drawRectangle({ x, y: cardY, width: 3, height: 58, color: severityColor });
      page.drawText(titleCase(severity).toUpperCase(), { x: x + 12, y: cardY + 36, size: 7, font: bold, color: COLORS.muted });
      page.drawText(String(amount), { x: x + 12, y: cardY + 13, size: 18, font: bold, color: severityColor });
    });

    page.drawText('SCAN SCOPE', { x: MARGIN, y: cardY - 32, size: 9, font: bold, color: COLORS.navy });
    const scopeText = repositories.length ? repositories.join('\n') : 'No repository findings are currently recorded.';
    const scopeEndY = drawTextBlock(page, cleanPdfText(scopeText), {
      x: MARGIN, y: cardY - 53, width: PAGE_WIDTH - MARGIN * 2, size: 9, font: regular, color: COLORS.ink, lineHeight: 13,
    });
    drawTextBlock(page, 'This report contains automated pattern-based findings. Validate each item in context before making remediation decisions.', {
      x: MARGIN, y: Math.min(scopeEndY - 20, 112), width: PAGE_WIDTH - MARGIN * 2, size: 8, font: regular, color: COLORS.muted,
    });

    if (vulnerabilities.length === 0) {
      page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 490, width: PAGE_WIDTH - MARGIN * 2, height: 58, color: COLORS.panel });
      page.drawText('No vulnerability findings were recorded for this report.', { x: MARGIN + 14, y: PAGE_HEIGHT - 466, size: 10, font: regular, color: COLORS.ink });
    }
    drawPageFooter(page, regular, 1);

    if (vulnerabilities.length > 0) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawPageHeader(page, bold, regular, 'Findings register');
      page.drawText('FINDINGS REGISTER', { x: MARGIN, y: PAGE_HEIGHT - 82, size: 16, font: bold, color: COLORS.ink });
      page.drawText('Prioritized list of detected issues', { x: MARGIN, y: PAGE_HEIGHT - 101, size: 9, font: regular, color: COLORS.muted });
      let registerY = PAGE_HEIGHT - 136;
      const rowHeight = 49;
      vulnerabilities.forEach((finding, index) => {
        if (registerY < 90) {
          drawPageFooter(page, regular, pdf.getPageCount());
          page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          drawPageHeader(page, bold, regular, 'Findings register');
          registerY = PAGE_HEIGHT - 82;
        }
        const rowBottom = registerY - rowHeight + 5;
        if (index % 2 === 0) page.drawRectangle({ x: MARGIN, y: rowBottom, width: PAGE_WIDTH - MARGIN * 2, height: rowHeight, color: COLORS.panel });
        page.drawRectangle({ x: MARGIN, y: rowBottom, width: 3, height: rowHeight, color: getSeverityColor(finding.severity) });
        page.drawText(`${String(index + 1).padStart(2, '0')}  ${cleanPdfText(finding.title).slice(0, 68)}`, { x: MARGIN + 12, y: registerY - 12, size: 9, font: bold, color: COLORS.ink });
        page.drawText(`${titleCase(finding.severity)}  |  ${cleanPdfText(finding.location || 'Location not recorded').slice(0, 75)}`, { x: MARGIN + 12, y: registerY - 27, size: 7, font: regular, color: COLORS.muted });
        page.drawText(`Detail ${index + 1}`, { x: PAGE_WIDTH - MARGIN - 52, y: registerY - 12, size: 7, font: regular, color: COLORS.navy });
        registerY -= rowHeight + 4;
      });
      drawPageFooter(page, regular, pdf.getPageCount());
    }

    vulnerabilities.forEach((finding, index) => {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      const severity = titleCase(finding.severity);
      const severityColor = getSeverityColor(finding.severity);
      drawPageHeader(page, bold, regular, `Finding ${String(index + 1).padStart(2, '0')}`);

      let y = PAGE_HEIGHT - 82;
      page.drawRectangle({ x: MARGIN, y: y - 26, width: 3, height: 38, color: severityColor });
      y = drawTextBlock(page, cleanPdfText(finding.title), { x: MARGIN + 13, y, width: PAGE_WIDTH - MARGIN * 2 - 100, size: 17, font: bold, color: COLORS.ink, lineHeight: 21 });
      page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 86, y: y + 4, width: 86, height: 20, color: severityColor });
      const severityLabel = severity.toUpperCase();
      page.drawText(severityLabel, { x: PAGE_WIDTH - MARGIN - 43 - bold.widthOfTextAtSize(severityLabel, 8) / 2, y: y + 10, size: 8, font: bold, color: COLORS.white });
      y -= 18;

      const metadata = [
        ['PROJECT', finding.repository || 'Unknown project'],
        ['STATUS', titleCase(finding.status)],
        ['SOURCE LOCATION', finding.location || 'Location not recorded'],
      ];
      for (const [label, value] of metadata) {
        page.drawText(label, { x: MARGIN, y, size: 7, font: bold, color: COLORS.muted });
        y -= 14;
        y = drawTextBlock(page, cleanPdfText(value), { x: MARGIN, y, width: PAGE_WIDTH - MARGIN * 2, size: 9, font: regular, color: COLORS.ink, lineHeight: 12 });
        y -= 9;
      }

      page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 4 }, thickness: 0.6, color: COLORS.line });
      y -= 14;
      page.drawText('ASSESSMENT', { x: MARGIN, y, size: 8, font: bold, color: COLORS.navy });
      y -= 17;
      y = drawTextBlock(page, cleanPdfText(finding.description || 'No explanation was provided by the scanner.'), {
        x: MARGIN, y, width: PAGE_WIDTH - MARGIN * 2, size: 9, font: regular, color: COLORS.ink,
      });
      y -= 14;

      page.drawText('EVIDENCE  /  MATCHED SOURCE', { x: MARGIN, y, size: 8, font: bold, color: COLORS.navy });
      y -= 15;
      const codeLines = cleanPdfText(finding.code || 'No source excerpt was saved.').split('\n').slice(0, 8);
      const codeHeight = Math.max(40, codeLines.length * 11 + 16);
      page.drawRectangle({ x: MARGIN, y: y - codeHeight + 7, width: PAGE_WIDTH - MARGIN * 2, height: codeHeight, color: COLORS.panel });
      for (const codeLine of codeLines) {
        if (y < 65) break;
        const fittedLine = wrapText(codeLine, regular, 7, PAGE_WIDTH - MARGIN * 2 - 24)[0] ?? '';
        page.drawText(fittedLine.slice(0, 125), { x: MARGIN + 12, y, size: 7, font: regular, color: COLORS.ink });
        y -= 11;
      }
      y -= 13;

      if (y > 80) {
        page.drawText('RECOMMENDED REMEDIATION', { x: MARGIN, y, size: 8, font: bold, color: COLORS.navy });
        y -= 16;
        drawTextBlock(page, recommendationFor(finding.title), {
          x: MARGIN, y, width: PAGE_WIDTH - MARGIN * 2, size: 9, font: regular, color: COLORS.ink,
        });
      }
      drawPageFooter(page, regular, pdf.getPageCount());
    });

    const pdfBytes = await pdf.save();
    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="bugshield-vulnerability-report.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('PDF Generation Error:', error);
    return new NextResponse('Unable to generate vulnerability report.', { status: 500 });
  }
}