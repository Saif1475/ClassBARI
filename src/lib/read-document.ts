// Reads text from a PDF or a photo in the browser. Typed PDFs use their text layer (fast);
// scanned pages and photos go through OCR (tesseract.js, English + Bangla).
// Nothing is uploaded: the file stays on the device. Tesseract downloads its language data
// (a few MB) from the jsDelivr CDN the first time it's used.
import type { Worker } from "tesseract.js";

export const MAX_PAGES = 30;

export type Progress = { step: "loadingOcr" | "reading" | "ocr"; page?: number; pages?: number };

export async function readDocument(file: Blob, onProgress: (p: Progress) => void): Promise<{ text: string; truncated: boolean }> {
  let worker: Worker | null = null;
  const ocr = async (image: Blob | HTMLCanvasElement) => {
    if (!worker) {
      onProgress({ step: "loadingOcr" });
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker(["eng", "ben"]);
    }
    return (await worker.recognize(image)).data.text;
  };

  try {
    if (file.type.startsWith("image/")) {
      onProgress({ step: "ocr", page: 1, pages: 1 });
      return { text: await ocr(file), truncated: false };
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
      // Little or no text layer: it's a scanned page, so render it and OCR the image.
      if (text.replace(/\s/g, "").length < 30) {
        onProgress({ step: "ocr", page: n, pages });
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        text = await ocr(canvas);
      }
      out.push(text);
    }
    return { text: out.join("\n\n"), truncated: doc.numPages > MAX_PAGES };
  } finally {
    await (worker as Worker | null)?.terminate();
  }
}
