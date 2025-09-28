import { Component, DestroyRef, signal } from '@angular/core';
import { PdfOcrService, OcrResult } from 'src/app/service/pdfocr.service';


@Component({
  selector: 'app-faxes',
  templateUrl: './faxes.component.html',
  styleUrl: './faxes.component.css'
})
export class FaxesComponent {

  result: OcrResult | null = null;
  student?: { name?: string; studentNumber?: string; address?: string };
  isProcessing = false;
  error: string | null = null;
  progress = 0;
  //error = signal<string | null>(null);

  constructor(private ocr: PdfOcrService, private destroyRef: DestroyRef) { }

  async onFileChosen(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isProcessing = true;
    this.error = null;
    this.result = null;
    this.student = undefined;
    this.progress = 0;

    try {
      const res = await this.ocr.extract(file, {
        dpi: 160,
        onProgress: (p) => (this.progress = p),
        // ocrAllPages: false, // keep your default
      });
      this.result = res;

      // ⬇️ NEW: only keep parsed fields for UI
      this.student = res.fields;
      console.log('Parsed student info:', this.student);
    } catch (e: any) {
      this.error = e?.message ?? 'Failed to process PDF.';
    } finally {
      this.isProcessing = false;
    }
  }

}
