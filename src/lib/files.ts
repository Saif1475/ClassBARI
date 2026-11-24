// Small-file helpers. Demo: files live in localStorage as data URLs, so they must stay tiny.
import { REAL_AUTH } from "./auth-mode.ts";
import { shrinkImage } from "./image.ts";
import { csvText } from "./sheet.ts";

export const MAX_UPLOAD_BYTES = REAL_AUTH ? 5 * 1024 * 1024 : 800 * 1024;

export const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/** A photo type the server takes as it is (data-access.ts handIn/upload); HEIC, AVIF, BMP and friends are turned into JPEG first. */
export const SENDABLE_PHOTO = /^image\/(png|jpeg|webp|gif)$/;
/** A photo, also when the browser gives no type for it (desktop Chrome does that for .heic). */
export const isPhoto = (file: File) => file.type.startsWith("image/") || (!file.type && /\.(heic|heif|avif|bmp)$/i.test(file.name));

/** A chosen file as a data URL. A photo over the limit, or of a type the server refuses, is made into a smaller JPEG (phone photos are several MB); any other file over it, or a photo the browser can't read: null. */
export async function uploadData(file: File): Promise<string | null> {
  if (file.size <= MAX_UPLOAD_BYTES && (SENDABLE_PHOTO.test(file.type) || !isPhoto(file))) return readAsDataUrl(file);
  return isPhoto(file) ? shrinkImage(file, 1600, 0.8).catch(() => null) : null;
}

/** A teacher's paper or answer key: the server keeps it as plain text, so a small photo the browser can't read (HEIC in desktop Chrome) still goes as it is. */
export const uploadPaper = async (file: File) => (await uploadData(file)) ?? (file.size <= MAX_UPLOAD_BYTES ? readAsDataUrl(file) : null);

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

/** Download rows as a UTF-8 CSV (Excel-friendly). */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob(["﻿" + csvText(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
