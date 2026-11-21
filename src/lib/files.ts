// Small-file helpers. Demo: files live in localStorage as data URLs, so they must stay tiny.
import { REAL_AUTH } from "./auth-mode.ts";
import { shrinkImage } from "./image.ts";

export const MAX_UPLOAD_BYTES = REAL_AUTH ? 5 * 1024 * 1024 : 800 * 1024;

export const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/** A chosen file as a data URL. A photo over the limit is made smaller (phone photos are several MB); any other file over it: null. */
export async function uploadData(file: File): Promise<string | null> {
  if (file.size <= MAX_UPLOAD_BYTES) return readAsDataUrl(file);
  return file.type.startsWith("image/") ? shrinkImage(file, 1600, 0.8).catch(() => null) : null;
}

/**
 * Files other people uploaded may only open as pictures, PDFs, video or sound. A web page (HTML, SVG) opened from
 * our own address could act as the signed-in person, so anything else is turned into a plain download.
 */
const SAFE_TYPE = /^(image\/(png|jpe?g|gif|webp|avif|bmp|heic|heif)|application\/pdf|video\/[\w.+-]+|audio\/[\w.+-]+)$/i;
export const safeBlob = (blob: Blob) => (SAFE_TYPE.test(blob.type.split(";")[0].trim()) ? blob : new Blob([blob], { type: "application/octet-stream" }));

/** Browsers block opening data: URLs directly, so convert to a blob URL first. Also opens stored files (/api/files/…). */
export async function openDataUrl(dataUrl: string) {
  const blob = safeBlob(await (await fetch(dataUrl)).blob());
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Download rows as a UTF-8 CSV (Excel-friendly). Leading = + - @ are neutralised so cells can't run formulas. */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => `"${String(v).replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
