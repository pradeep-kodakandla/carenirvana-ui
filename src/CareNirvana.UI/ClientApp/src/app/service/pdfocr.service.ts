
import { Injectable } from '@angular/core';
import { createWorker } from 'tesseract.js';
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface OcrByPage {
  page: number;
  text: string;
  method: 'text-extract' | 'ocr';
}

export interface OcrResult {
  text: string;
  byPage: OcrByPage[];
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
    const textResult = await this.tryPdfText(file, onProgress);
    const combined = textResult.byPage.map(p => p.text).join('\\n\\n');
    const needsOcr = combined.trim().length < 200;

    if (!needsOcr) {
      const normalized = this.normalize(combined);
      return { text: normalized, byPage: textResult.byPage.map(p => ({ ...p, text: this.normalize(p.text) })) };
    }

    const ocrResult = await this.ocrAllPages(file, onProgress);
    const normalized = this.normalize(ocrResult.byPage.map(p => p.text).join('\\n\\n'));
    return { text: normalized, byPage: ocrResult.byPage.map(p => ({ ...p, text: this.normalize(p.text) })) };
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
      const pageText = (content.items as any[]).map((i: any) => (i.str ?? '')).join(' ').replace(/\\s+/g, ' ').trim();
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
