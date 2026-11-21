"use client";
// Teacher-uploaded PDFs and videos, kept in the browser's IndexedDB (localStorage is too small for video).
// Items store "local:<key>" as their url; useFileUrl turns that into a playable blob: URL.
// With real accounts, saveFile uploads to Supabase Storage instead (see /api/files).
import { useEffect, useState } from "react";
import { REAL_AUTH } from "./auth-mode";
import { safeBlob } from "./files";
import { supabaseLater } from "./supabase/later";

export const LOCAL_PREFIX = "local:";
export const MAX_FILE_BYTES = 300 * 1024 * 1024; // 300 MB
const DB = "edunest-files";
const STORE = "files";

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const run = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
  open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );

/** Saves the file and returns the url to store on the item. */
export async function saveFile(file: Blob): Promise<string> {
  if (REAL_AUTH) {
    // Real accounts: straight to the institute's file storage, so every device can open it.
    const res = await fetch("/api/files", { method: "POST" });
    if (!res.ok) throw new Error("upload refused");
    const { path, token, url } = (await res.json()) as { path: string; token: string; url: string };
    const { error } = await (await supabaseLater()).storage.from("files").uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });
    if (error) throw new Error(error.message);
    return url;
  }
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await run("readwrite", (s) => s.put(file, key));
  return LOCAL_PREFIX + key;
}

export const isLocalFile = (url?: string) => !!url?.startsWith(LOCAL_PREFIX);

/** The file behind a url: uploaded files from IndexedDB, anything else fetched. */
export async function loadFile(url: string): Promise<Blob> {
  if (isLocalFile(url)) {
    const blob = await run<Blob | undefined>("readonly", (s) => s.get(url.slice(LOCAL_PREFIX.length)));
    if (!blob) throw new Error("File not found on this device");
    return blob;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return safeBlob(await res.blob()); // someone else uploaded it: never let it open as a web page on our address
}

/** A url the browser can open: the url itself, or a blob: URL for uploaded files ("" while loading/missing). */
export function useFileUrl(url?: string) {
  const [resolved, setResolved] = useState(isLocalFile(url) ? "" : url ?? "");
  useEffect(() => {
    if (!isLocalFile(url)) return setResolved(url ?? "");
    let objectUrl = "";
    let alive = true;
    loadFile(url!)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (alive) setResolved(objectUrl);
      })
      .catch(() => alive && setResolved(""));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return resolved;
}
