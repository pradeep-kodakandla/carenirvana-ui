// ============================================================================
// Multi-Form PDF Detector & Splitter
// ----------------------------------------------------------------------------
// A single uploaded PDF often contains MORE THAN ONE prior auth form
// (e.g. one NHS form per page, or two separate Texas TDI submissions stapled
// together). The OCR pipeline assumes "one file = one form" — so when this
// happens the extractors mash both patients together and silently lose data.
//
// This helper looks at PER-PAGE text (and optional per-page AcroForm field
// maps), groups pages into logical "forms" by detecting the template HEADER
// on each page, and splits the source PDF into one File per form using pdf-lib.
//
// Detection is deliberately conservative:
//   - We require a recognised template marker (NHS / Texas / AZ / Georgia)
//   - A new form starts every time the marker appears AS A PAGE HEADER
//   - Pages without a header are appended to the previous form (continuation)
//   - If only ONE form is detected, splitting is skipped — caller falls
//     through to the normal single-file pipeline.
// ============================================================================

import { PDFDocument } from 'pdf-lib';

export interface PageText {
  page: number;          // 1-indexed to match PdfOcrService.byPage
  text: string;
}

export interface FormSpan {
  /** 1-indexed inclusive page range of this form within the source PDF */
  pageRange: [number, number];
  /** Display label, e.g. "Form 1 of 2 (NHS)" */
  label: string;
  /** Detected template — used so the pipeline can hint the right adapter */
  template: 'NHS' | 'Texas' | 'Arizona' | 'Georgia' | 'Generic';
}

export interface SplitResult {
  span: FormSpan;
  /** A new File containing only this form's pages, ready to feed the pipeline */
  file: File;
}

// ── Header markers — anchored to wording that ONLY appears on the first page
// of each respective template. Keep these strict; over-matching here causes
// false splits.
const HEADERS: Array<{ template: FormSpan['template']; re: RegExp }> = [
  { template: 'NHS',     re: /NEVADA\s+HEALTH\s+SOLUTIONS\s*[\r\n]*PRIOR\s+AUTHORIZATION/i },
  { template: 'Texas',   re: /TEXAS\s+STANDARD\s+PRIOR\s+AUTHORIZATION\s+REQUEST\s+FORM/i },
  { template: 'Arizona', re: /(?:CSO-1179A|COMPREHENSIVE\s+MEDICAL\s+AND\s+DENTAL\s+PROGRAM)/i },
  { template: 'Georgia', re: /Georgia\s+Medical\s+Prior\s+Authorization\s+Request\s+Form/i },
];

/**
 * Walks the per-page text and groups pages into forms. A new form begins on
 * every page whose text contains a known template header. Pages without a
 * header are treated as continuation pages of the previous form.
 *
 * Returns a single FormSpan covering all pages when no header is detected,
 * which keeps the existing single-file pipeline behaviour intact.
 */
export function detectForms(byPage: PageText[]): FormSpan[] {
  if (!byPage?.length) return [];

  const detect = (text: string): FormSpan['template'] | null => {
    for (const h of HEADERS) if (h.re.test(text)) return h.template;
    return null;
  };

  // Walk pages, opening a new span every time a header is hit.
  const spans: Array<{ start: number; end: number; template: FormSpan['template'] }> = [];
  for (const p of byPage) {
    const t = detect(p.text || '');
    if (t) {
      spans.push({ start: p.page, end: p.page, template: t });
    } else if (spans.length) {
      // Continuation page — extend the last form.
      spans[spans.length - 1].end = p.page;
    } else {
      // Pages before any header — treat as a generic span we'll merge later.
      spans.push({ start: p.page, end: p.page, template: 'Generic' });
    }
  }

  // If we never saw a header, emit a single generic span.
  if (spans.length === 0) {
    return [{
      pageRange: [byPage[0].page, byPage[byPage.length - 1].page],
      label: 'Document',
      template: 'Generic',
    }];
  }

  const total = spans.length;
  return spans.map((s, i) => ({
    pageRange: [s.start, s.end] as [number, number],
    template: s.template,
    label:
      total === 1
        ? `Document (${s.template})`
        : `Form ${i + 1} of ${total} (${s.template}, p${s.start}${s.start === s.end ? '' : `–${s.end}`})`,
  }));
}

/** Convenience: did detection actually find more than one logical form? */
export function isMultiForm(spans: FormSpan[]): boolean {
  return spans.filter(s => s.template !== 'Generic').length > 1
      || (spans.length > 1 && spans.every(s => s.template !== 'Generic'));
}

/**
 * Physically splits the source PDF into one File per FormSpan using pdf-lib.
 * Splits are derived from the original document's pages — no re-rendering,
 * so visual fidelity is preserved.
 *
 * The returned filenames embed the form index so child faxes are easy to
 * identify in the listing (e.g. "OriginalName_Form1of2.pdf").
 */
export async function splitByForms(source: File, spans: FormSpan[]): Promise<SplitResult[]> {
  if (!spans.length) return [];

  const ab     = await source.arrayBuffer();
  const srcPdf = await PDFDocument.load(ab, { ignoreEncryption: true });

  const dot       = source.name.lastIndexOf('.');
  const baseName  = dot >= 0 ? source.name.slice(0, dot) : source.name;
  const ext       = dot >= 0 ? source.name.slice(dot)    : '.pdf';

  const out: SplitResult[] = [];
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const [start, end] = span.pageRange;

    const child = await PDFDocument.create();
    // pdf-lib uses 0-indexed pages; our spans are 1-indexed.
    const indices = Array.from({ length: end - start + 1 }, (_, k) => start - 1 + k);
    const copied  = await child.copyPages(srcPdf, indices);
    copied.forEach(p => child.addPage(p));

    const bytes = await child.save();
    const fileName =
      spans.length === 1
        ? source.name
        : `${baseName}_Form${i + 1}of${spans.length}${ext}`;

    const file = new File(
      [new Blob([bytes], { type: 'application/pdf' })],
      fileName,
      { type: 'application/pdf' }
    );

    out.push({ span, file });
  }

  return out;
}
