type PdfSection = {
  title: string;
  lines: string[];
};

export type LegalPdfInput = {
  reportId: string;
  generatedAt: string;
  familyName: string;
  generatedBy: string;
  verification: string;
  reportHash: string;
  sections: PdfSection[];
};

type LayoutLine = {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 50;
const RIGHT = 50;
const BODY_TOP = 735;
const BODY_BOTTOM = 70;

function normalizePdfText(value: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/[“”]/g, '"'],
    [/[‘’]/g, "'"],
    [/[–—]/g, '-'],
    [/…/g, '...'],
    [/€/g, 'EUR'],
    [/•/g, '-'],
  ];

  let text = value;
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);

  let result = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char === '\n' || char === '\r' || char === '\t') result += ' ';
    else if (code >= 32 && code <= 255) result += char;
    else result += '?';
  }
  return result;
}

function escapePdfString(value: string): string {
  return normalizePdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(value: string, size: number, indent = 0): string[] {
  const usableWidth = PAGE_WIDTH - LEFT - RIGHT - indent;
  const maxChars = Math.max(24, Math.floor(usableWidth / Math.max(4.8, size * 0.52)));
  const normalized = normalizePdfText(value).trim();
  if (!normalized) return [''];

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxChars && !current) {
      for (let start = 0; start < word.length; start += maxChars) {
        lines.push(word.slice(start, start + maxChars));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function buildPages(input: LegalPdfInput): LayoutLine[][] {
  const pages: LayoutLine[][] = [[]];
  let pageIndex = 0;
  let y = BODY_TOP;

  const currentPage = (): LayoutLine[] => {
    const page = pages[pageIndex];
    if (!page) throw new Error('PDF page allocation failed');
    return page;
  };

  const newPage = (): void => {
    pages.push([]);
    pageIndex += 1;
    y = BODY_TOP;
  };

  const addText = (
    text: string,
    options: { size?: number; bold?: boolean; indent?: number; gapBefore?: number; gapAfter?: number } = {},
  ): void => {
    const size = options.size ?? 10;
    const bold = options.bold ?? false;
    const indent = options.indent ?? 0;
    const gapBefore = options.gapBefore ?? 0;
    const gapAfter = options.gapAfter ?? 4;
    const lineHeight = Math.max(12, size * 1.35);

    y -= gapBefore;
    for (const line of wrapText(text, size, indent)) {
      if (y - lineHeight < BODY_BOTTOM) newPage();
      currentPage().push({ text: line, x: LEFT + indent, y, size, bold });
      y -= lineHeight;
    }
    y -= gapAfter;
  };

  addText('DUECASE - REPORT DI INTEGRITA FAMILIARE', { size: 17, bold: true, gapAfter: 8 });
  addText(`Report ID: ${input.reportId}`, { size: 9, gapAfter: 2 });
  addText(`Famiglia: ${input.familyName}`, { size: 10, bold: true, gapAfter: 2 });
  addText(`Generato da: ${input.generatedBy}`, { size: 9, gapAfter: 2 });
  addText(`Timestamp applicativo UTC: ${input.generatedAt}`, { size: 9, gapAfter: 10 });
  addText(
    'Documento prodotto dal sistema DueCase. Gli hash SHA-256 consentono di verificare l integrita tecnica dei dati al momento dell esportazione. Il timestamp indicato e applicativo e non costituisce una marca temporale qualificata eIDAS.',
    { size: 8.5, gapAfter: 12 },
  );

  for (const section of input.sections) {
    addText(section.title.toUpperCase(), { size: 12, bold: true, gapBefore: 6, gapAfter: 6 });
    if (section.lines.length === 0) {
      addText('Nessun dato presente.', { size: 9, indent: 8, gapAfter: 7 });
      continue;
    }

    for (const line of section.lines) addText(line, { size: 9, indent: 8, gapAfter: 4 });
  }

  addText('VERIFICA CRITTOGRAFICA', { size: 12, bold: true, gapBefore: 8, gapAfter: 6 });
  addText(`SHA-256 dataset: ${input.reportHash}`, { size: 8.5, gapAfter: 5 });
  addText(`Stringa di verifica: ${input.verification}`, { size: 8.5, gapAfter: 5 });
  addText('Algoritmo messaggi: SHA-256(text|sender_id|created_at UTC ISO-8601).', { size: 8.5, gapAfter: 5 });

  return pages;
}

function pageContent(page: LayoutLine[], pageNumber: number, pageCount: number, input: LegalPdfInput): Buffer {
  const commands: string[] = [];
  const text = (x: number, y: number, size: number, bold: boolean, value: string): void => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${size.toFixed(1)} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${escapePdfString(value)}) Tj ET`);
  };

  text(LEFT, 805, 8.5, true, 'DUECASE');
  text(LEFT, 791, 7.5, false, `Report ${input.reportId}`);
  commands.push(`0.6 w ${LEFT} 778 m ${PAGE_WIDTH - RIGHT} 778 l S`);

  for (const line of page) text(line.x, line.y, line.size, line.bold, line.text);

  commands.push(`0.5 w ${LEFT} 52 m ${PAGE_WIDTH - RIGHT} 52 l S`);
  text(LEFT, 36, 7, false, `SHA-256 ${input.reportHash.slice(0, 24)}...`);
  text(PAGE_WIDTH - RIGHT - 78, 36, 7, false, `Pagina ${pageNumber}/${pageCount}`);

  return Buffer.from(commands.join('\n'), 'latin1');
}

export function createLegalReportPdf(input: LegalPdfInput): Buffer {
  const pages = buildPages(input);
  const objects: Array<Buffer | undefined> = [];
  const pageNumbers = pages.map((_, index) => 5 + index * 2);

  objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii');
  objects[2] = Buffer.from(`<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`, 'ascii');
  objects[3] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'ascii');
  objects[4] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'ascii');

  pages.forEach((page, index) => {
    const pageObject = 5 + index * 2;
    const contentObject = pageObject + 1;
    const stream = pageContent(page, index + 1, pages.length, input);
    objects[pageObject] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`,
      'ascii',
    );
    objects[contentObject] = Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'ascii'),
      stream,
      Buffer.from('\nendstream', 'ascii'),
    ]);
  });

  const header = Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'latin1');
  const chunks: Buffer[] = [header];
  const offsets: number[] = [0];
  let offset = header.length;
  const maxObject = objects.length - 1;

  for (let index = 1; index <= maxObject; index += 1) {
    const object = objects[index];
    if (!object) throw new Error(`Missing PDF object ${index}`);
    offsets[index] = offset;
    const prefix = Buffer.from(`${index} 0 obj\n`, 'ascii');
    const suffix = Buffer.from('\nendobj\n', 'ascii');
    chunks.push(prefix, object, suffix);
    offset += prefix.length + object.length + suffix.length;
  }

  const xrefOffset = offset;
  const xrefLines = [`xref`, `0 ${maxObject + 1}`, '0000000000 65535 f '];
  for (let index = 1; index <= maxObject; index += 1) {
    const objectOffset = offsets[index];
    if (objectOffset === undefined) throw new Error(`Missing PDF offset ${index}`);
    xrefLines.push(`${String(objectOffset).padStart(10, '0')} 00000 n `);
  }

  const trailer = Buffer.from(
    `${xrefLines.join('\n')}\ntrailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    'ascii',
  );
  chunks.push(trailer);
  return Buffer.concat(chunks);
}
