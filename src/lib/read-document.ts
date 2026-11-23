// Reads text from a PDF or a photo in the browser. Typed PDFs use their text layer (fast);
// scanned pages and photos go through OCR (tesseract.js, English + Bangla).
// Nothing is uploaded: the file stays on the device. Tesseract downloads its language data
// (a few MB) from the jsDelivr CDN the first time it's used.
import type { Worker } from "tesseract.js";
import type { Piece } from "./student-import.ts";

export const MAX_PAGES = 30;

export type Progress = { step: "loadingOcr" | "reading" | "ocr"; page?: number; pages?: number };

/** `pieces`: also where each piece of text sits ("Import students" finds a list's columns from them). */
export async function readDocument(file: Blob, onProgress: (p: Progress) => void, want: { pieces?: boolean } = {}): Promise<{ text: string; truncated: boolean; pieces: Piece[] }> {
  let worker: Worker | null = null;
  const pieces: Piece[] = [];
  const ocr = async (image: Blob | HTMLCanvasElement, page: number) => {
    if (!worker) {
      onProgress({ step: "loadingOcr" });
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker(["eng", "ben"]);
    }
    const { data } = await worker.recognize(image, {}, { text: true, blocks: !!want.pieces });
    for (const b of data.blocks ?? []) for (const para of b.paragraphs) for (const l of para.lines) for (const w of l.words) pieces.push({ str: w.text, x: w.bbox.x0, y: (w.bbox.y0 + w.bbox.y1) / 2, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0, page });
    return data.text;
  };

  try {
    if (file.type.startsWith("image/")) {
      onProgress({ step: "ocr", page: 1, pages: 1 });
      return { text: await ocr(file, 1), truncated: false, pieces };
    }

    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const out: string[] = [];
    for (let n = 1; n <= pages; n++) {
      onProgress({ step: "reading", page: n, pages });
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("");
      const typed = pieces.length;
      if (want.pieces) for (const it of content.items) if ("str" in it && it.str.trim()) pieces.push({ str: it.str, x: it.transform[4], y: -it.transform[5], w: it.width, h: it.height || Math.hypot(it.transform[2], it.transform[3]), page: n });
      // Little or no text layer: it's a scanned page, so render it and OCR the image.
      if (text.replace(/\s/g, "").length < 30) {
        onProgress({ step: "ocr", page: n, pages });
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        pieces.length = typed; // the few words a scanned page has as text are read again from its picture
        text = await ocr(canvas, n);
      }
      out.push(text);
    }
    return { text: out.join("\n\n"), truncated: doc.numPages > MAX_PAGES, pieces };
  } finally {
    await (worker as Worker | null)?.terminate();
  }
}
