import { Injectable } from '@angular/core';
import { createWorker, PSM } from 'tesseract.js';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface StudentInfo {
  name?: string;
  studentNumber?: string;
  address?: string;
}

export interface OcrResult {
  text: string;
  byPage: { page: number; text: string; method: 'text-extract' | 'ocr' }[];
  fields?: StudentInfo;
}

function parseStudentInfo(text: string): StudentInfo {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const nonEmpty = lines.filter(Boolean);
  const joined = nonEmpty.join(' ');

  const studentNumber =
    joined.match(/\bStudent\s*Number\s*[:\-]?\s*([A-Za-z0-9\-]+)/i)?.[1] ??
    joined.match(/\bStudent\s*ID\s*[:\-]?\s*([A-Za-z0-9\-]+)/i)?.[1] ??
    joined.match(/\bID\s*[:\-]?\s*([A-Za-z0-9\-]+)/i)?.[1];

  const address =
    joined.match(/\bAddress\s*[:\-]?\s*(.+?)(?=\s{2,}|\bSCHEDULE\b|$)/i)?.[1]?.trim();

  let name =
    joined.match(/\bName\s*[:\-]?\s*([A-Za-z ,.'\-]+)/i)?.[1]?.trim();

  if (!name) {
    const idxSN = lines.findIndex(l => /student\s*number|student\s*id/i.test(l));
    if (idxSN > 0) {
      for (let i = idxSN - 1; i >= 0; i--) {
        const cand = lines[i];
        if (
          cand &&
          !/^\s*(student\s*number|student\s*id|address|schedule)\b/i.test(cand) &&
          !/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cand)
        ) {
          name = cand.trim();
          break;
        }
      }
    }
  }

  return { name, studentNumber, address };
}

@Injectable({ providedIn: 'root' })
export class PdfOcrService {
  async extract(file: File, opts?: { lang?: string; dpi?: number; ocrAllPages?: boolean; onProgress?: (p: number) => void }): Promise<OcrResult> {
    const lang = opts?.lang ?? 'eng';
    const dpi = opts?.dpi ?? 144;
    const report = opts?.onProgress ?? (() => { });

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;

    // Prepare Tesseract worker lazily (only if needed)
    let worker: any | null = null;
    const ensureWorker = async () => {
      if (worker) return worker;
      worker = await createWorker(lang, 1, {
        logger: m => {
          // m.progress is 0..1 during OCR. We'll map it per-page below.
        }
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO, // good general default
      });
      return worker;
    };

    const pages = pdf.numPages;
    const byPage: OcrResult['byPage'] = [];
    const perPageWeight = 1 / pages; // for progress

    for (let p = 1; p <= pages; p++) {
      // 1) Try text extraction first
      const page = await pdf.getPage(p);
      const textContent = await page.getTextContent();
      const extracted = (textContent.items ?? [])
        .map((it: any) => (it.str ?? '').trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (extracted && !opts?.ocrAllPages) {
        byPage.push({ page: p, text: extracted, method: 'text-extract' });
        report(perPageWeight * p);
        continue;
      }

      // 2) No selectable text (or ocrAllPages=true) => rasterize & OCR
      const viewport = page.getViewport({ scale: dpi / 72 }); // 72 user units per inch
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      // Render the page into canvas
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      // Ensure worker is ready
      const w = await ensureWorker();

      // Let’s hook per-page OCR progress into overall progress
      let lastProgress = 0;
      const localWorkerLogger = (m: any) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          // progress within this page from 0..1
          const overall = perPageWeight * (p - 1) + perPageWeight * m.progress;
          if (overall - lastProgress >= 0.01) { // throttle a bit
            report(overall);
            lastProgress = overall;
          }
        }
      };
      w.setLogger(localWorkerLogger);

      const { data } = await w.recognize(canvas);
      byPage.push({ page: p, text: (data?.text ?? '').trim(), method: 'ocr' });

      // Finalize this page progress
      report(perPageWeight * p);
      // Clean up big canvas memory
      canvas.width = 0; canvas.height = 0;
    }

    if (worker) await worker.terminate();

    const combinedText = byPage.map(b => b.text).join('\n\n').trim();

    // ✅ parse the fields
    const fields = parseStudentInfo(combinedText);

    // ✅ return fields along with text/byPage
    return { text: combinedText, byPage, fields };

    //return {
    //  text: byPage.map(b => b.text).join('\n\n').trim(),
    //  byPage
    //};
  }
}
