// src/app/pdfjs.worker.ts
// Use the SAME entry everywhere you use pdf.js
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Must be a STRING and must be HTTP-served (not file://)
GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs';
// If you copied pdf.worker.mjs instead, use:
// GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.mjs';
