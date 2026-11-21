"use client";

import { useFileUrl } from "@/lib/file-store";

/** Link that opens a PDF/file, including ones uploaded to this browser. */
export function FileLink({ url, className, children }: { url: string; className?: string; children: React.ReactNode }) {
  const href = useFileUrl(url);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}
