
import { Injectable } from '@angular/core';
import { createWorker } from 'tesseract.js';
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface OcrByPage {
  page: number;
  text: string;
  method: 'text-extract' | 'ocr';
}

export interface OcrFormFieldsByPage {
  page: number;                       // 1-indexed
  fields: Record<string, string>;
}

export interface OcrResult {
  text: string;
  byPage: OcrByPage[];
  /**
   * Flat AcroForm field values keyed by field name. Populated only when the
   * PDF contains a fillable form (e.g. Nevada Health Solutions). Empty object
   * otherwise. Use this in preference to OCR text whenever it is non-empty —
   * field values come straight from the PDF and are not subject to OCR error.
   *
   * NOTE: when a PDF stitches together multiple copies of the SAME template
   * (e.g. two NHS forms with identical field names on different pages), this
   * flat map only retains page 1's values — later pages overwrite earlier
   * ones in pdf.js's getFieldObjects() output and we deliberately keep the
   * first occurrence to preserve historical behaviour. For multi-form PDFs
   * the caller should split first and re-extract per split, OR consume
   * `formFieldsByPage` below directly.
   */
  formFields: Record<string, string>;
  /**
   * AcroForm field values grouped by page (1-indexed). Empty array when the
   * PDF has no live AcroForm. Each entry contains ONLY the fields whose
   * widget annotations live on that page, so multi-form PDFs with duplicated
   * field names are disambiguated cleanly.
   */
  formFieldsByPage: OcrFormFieldsByPage[];
}

export interface OcrWord {
  text: string;
  x0: number; y0: number; x1: number; y1: number;
  line: number;
}

export type ProgressFn = (p: { phase: 'pdf-text' | 'ocr' | 'done'; progress: number; page?: number; pages?: number }) => void;

@Injectable({ providedIn: 'root' })
export class PdfOcrService {
  private tessWorker: any = null;
  private pdfWorkerSet = false;

  constructor() {
    if (!this.pdfWorkerSet) {
      try {
        // If you host pdf.worker.js yourself, set it here (optional)
        // GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.js';
        this.pdfWorkerSet = true;
      } catch { }
    }
  }

  /** Public: extract best-effort text from a PDF (text layer first, then OCR fallback) */
  async extract(file: File, onProgress?: ProgressFn): Promise<OcrResult> {
    // Always try AcroForm fields first — they are 100% reliable when present.
    // We do this regardless of whether we end up OCR'ing, because some forms
    // have BOTH a printed template AND fillable fields.
    const { flat: formFields, byPage: formFieldsByPage } = await this.tryExtractFormFieldsAll(file);

    const textResult = await this.tryPdfText(file, onProgress);
    const combined = textResult.byPage.map(p => p.text).join('\\n\\n');
    const needsOcr = combined.trim().length < 200;

    if (!needsOcr) {
      const normalized = this.normalize(combined);
      return {
        text: normalized,
        byPage: textResult.byPage.map(p => ({ ...p, text: this.normalize(p.text) })),
        formFields,
        formFieldsByPage,
      };
    }

    const ocrResult = await this.ocrAllPages(file, onProgress);
    const normalized = this.normalize(ocrResult.byPage.map(p => p.text).join('\\n\\n'));
    return {
      text: normalized,
      byPage: ocrResult.byPage.map(p => ({ ...p, text: this.normalize(p.text) })),
      formFields,
      formFieldsByPage,
    };
  }

  /**
   * Public: extract AcroForm field values from a fillable PDF.
   * Returns an empty object if the PDF has no form fields, the call fails, or
   * the document is not a fillable form. Never throws.
   *
   * Field values are normalized:
   *   - text fields  → trimmed string ('' if empty)
   *   - checkboxes   → 'Yes' if checked, 'Off' if not
   *   - radios       → the selected export value
   */
  async extractFormFields(file: File): Promise<Record<string, string>> {
    return this.tryExtractFormFields(file);
  }

  // ---------------- Internals ----------------

  private normalize(s: string): string {
    return (s || '')
      .replace(/\\r/g, '\\n')
      .replace(/[ \\t]+\\n/g, '\\n')
      .replace(/\\u00A0/g, ' ')
      .replace(/-\\n(?=\\w)/g, '')
      .replace(/\\n{3,}/g, '\\n\\n')
      .trim();
  }

  /**
   * Walks the PDF's AcroForm dictionary via pdf.js getFieldObjects() and returns
   * a flat name → value map. Defensive: returns {} on any error.
   */
  private async tryExtractFormFields(file: File): Promise<Record<string, string>> {
    return (await this.tryExtractFormFieldsAll(file)).flat;
  }

  /**
   * Extracts AcroForm fields BOTH as a flat map AND as a per-page array.
   *
   * Flat-map behaviour matches the legacy contract: if the same field name
   * appears on multiple pages, the FIRST occurrence wins. Per-page maps
   * preserve every distinct value, so callers handling multi-form PDFs can
   * pull each form's data without name collisions.
   */
  private async tryExtractFormFieldsAll(file: File): Promise<{
    flat: Record<string, string>;
    byPage: OcrFormFieldsByPage[];
  }> {
    const empty = { flat: {} as Record<string, string>, byPage: [] as OcrFormFieldsByPage[] };
    try {
      const data = await file.arrayBuffer();
      const pdf: PDFDocumentProxy = await getDocument({ data }).promise;

      // getFieldObjects is available in pdfjs-dist for AcroForm PDFs.
      // Returns: Promise<Record<string, FieldObject[]> | null>
      const fieldObjs: Record<string, any[]> | null =
        typeof (pdf as any).getFieldObjects === 'function'
          ? await (pdf as any).getFieldObjects()
          : null;

      if (!fieldObjs) return empty;

      // Stage 1: build per-occurrence records and remember each one's page.
      // pdf.js FieldObject exposes `page` as a 0-indexed number on each entry.
      const perPage = new Map<number, Record<string, string>>();
      const flat: Record<string, string> = {};

      for (const [name, arr] of Object.entries(fieldObjs)) {
        if (!Array.isArray(arr) || arr.length === 0) continue;

        for (const f of arr as any[]) {
          // pdf.js exposes value either as `value` (current) or `defaultValue`
          let v: any = f?.value ?? f?.defaultValue ?? '';
          if (v == null) v = '';
          if (typeof v !== 'string') v = String(v);
          v = v.replace(/^\/+/, '').trim();

          // Some checkbox "off" states come through as empty string — normalize.
          if (f?.type === 'checkbox' || f?.type === 'radiobutton') {
            if (!v || v.toLowerCase() === 'off') v = 'Off';
          }

          // 0-indexed → 1-indexed for our public API.
          const pageNum = Number.isFinite(f?.page) ? Number(f.page) + 1 : 1;
          if (!perPage.has(pageNum)) perPage.set(pageNum, {});
          perPage.get(pageNum)![name] = v;

          // Flat map: keep the first occurrence so legacy single-form callers
          // see the same value they always have.
          if (!(name in flat)) flat[name] = v;
        }
      }

      const byPage: OcrFormFieldsByPage[] = Array.from(perPage.entries())
        .sort(([a], [b]) => a - b)
        .map(([page, fields]) => ({ page, fields }));

      return { flat, byPage };
    } catch (err) {
      // Most non-fillable PDFs will land here — that's expected, not an error.
      console.debug('[PdfOcrService] extractFormFields: no AcroForm or read failed', err);
      return empty;
    }
  }

  private async ensureTessWorker(): Promise<any> {
    if (this.tessWorker) return this.tessWorker;
    const w: any = await (createWorker as any)(); // keep typings loose for wider version compatibility
    await w.load();
    // Some tesseract.js type defs expose `reinitialize` instead of `initialize`
    if (typeof w.reinitialize === 'function') {
      await w.reinitialize('eng');
    } else if (typeof w.initialize === 'function') {
      await w.initialize('eng');
    }
    this.tessWorker = w;
    return this.tessWorker;
  }

  private async tryPdfText(file: File, onProgress?: ProgressFn): Promise<{ byPage: OcrByPage[] }> {
    const data = await file.arrayBuffer();
    const pdf: PDFDocumentProxy = await getDocument({ data }).promise;
    const byPage: OcrByPage[] = [];
    const total = pdf.numPages;

    for (let p = 1; p <= total; p++) {
      onProgress?.({ phase: 'pdf-text', progress: p / total, page: p, pages: total });
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();

      // Preserve line breaks. pdf.js exposes two signals:
      //   1. items[i].hasEOL — explicit end-of-line marker.
      //   2. items[i].transform[5] — the y translation (PDF y grows upward).
      // We honour hasEOL when present, and otherwise fall back to a y-delta
      // heuristic so stacked drawings (like the rendered value layer in
      // flattened forms) get one line per row instead of being smushed
      // together. Downstream adapters depend on \n separating logical fields.
      const items = content.items as any[];
      const parts: string[] = [];
      let lastY: number | undefined;
      const yTolerance = 2;

      for (const it of items) {
        const y = Number.isFinite(it?.transform?.[5]) ? Math.round(it.transform[5]) : undefined;
        const newLineByY = y !== undefined && lastY !== undefined && Math.abs(y - lastY) > yTolerance;

        if (newLineByY) parts.push('\n');
        parts.push(it?.str ?? '');
        if (it?.hasEOL) parts.push('\n');

        if (y !== undefined) lastY = y;
      }

      const pageText = parts
        .join(' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

      byPage.push({ page: p, text: pageText, method: 'text-extract' });
    }
    return { byPage };
  }

  private async ocrAllPages(file: File, onProgress?: ProgressFn): Promise<{ byPage: OcrByPage[] }> {
    const data = await file.arrayBuffer();
    const pdf: PDFDocumentProxy = await getDocument({ data }).promise;
    const total = pdf.numPages;
    const byPage: OcrByPage[] = [];
    const worker = await this.ensureTessWorker();

    for (let p = 1; p <= total; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      onProgress?.({ phase: 'ocr', progress: (p - 1) / total, page: p, pages: total });
      const { data: { text } } = await worker.recognize(canvas);
      byPage.push({ page: p, text: text || '', method: 'ocr' });
      onProgress?.({ phase: 'ocr', progress: p / total, page: p, pages: total });
    }
    onProgress?.({ phase: 'done', progress: 1, page: total, pages: total });
    return { byPage };
  }

  async ocrWords(file: File, pageNumber = 1, onProgress?: ProgressFn): Promise<OcrWord[]> {
    const data = await file.arrayBuffer();
    const pdf = await (getDocument({ data }).promise);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.25 }); // high DPI for better line fidelity
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const worker = await this.ensureTessWorker();
    onProgress?.({ phase: 'ocr', progress: 0, page: pageNumber, pages: pdf.numPages });
    const result: any = await worker.recognize(canvas);
    onProgress?.({ phase: 'ocr', progress: 1, page: pageNumber, pages: pdf.numPages });

    const words = (result?.data?.words ?? []) as Array<{
      text: string;
      bbox: { x0: number; x1: number; y0: number; y1: number };
      line: number;
    }>;

    // normalize to our shape
    return words.map(w => ({
      text: (w.text || '').trim(),
      x0: w.bbox?.x0 ?? 0,
      x1: w.bbox?.x1 ?? 0,
      y0: w.bbox?.y0 ?? 0,
      y1: w.bbox?.y1 ?? 0,
      line: (w as any).line ?? 0
    })).filter(w => w.text.length > 0);
  }

  async ocrPageText(file: File, pageNumber = 1, onProgress?: ProgressFn): Promise<string> {
    const data = await file.arrayBuffer();
    const pdf = await (getDocument({ data }).promise);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.25 }); // higher DPI improves OCR
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const worker = await this.ensureTessWorker();
    onProgress?.({ phase: 'ocr', progress: 0, page: pageNumber, pages: pdf.numPages });
    const { data: { text } } = await worker.recognize(canvas);
    onProgress?.({ phase: 'ocr', progress: 1, page: pageNumber, pages: pdf.numPages });
    return (text || '').replace(/\r/g, '\n');
  }
}
