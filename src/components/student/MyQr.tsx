"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";

// shortcut: the code is fixed per student, so a screenshot could be shared; add a daily signed code with the backend.
export const QR_PREFIX = "edunest:student:";

/** The student's attendance QR code, shown on their dashboard. */
export function MyQr({ studentId, name }: { studentId: number; name: string }) {
  const { t } = useLang();
  const [src, setSrc] = useState("");
  useEffect(() => {
    // The QR drawing library is fetched here, when a code is shown, not with the whole dashboard.
    import("qrcode")
      .then((m) => m.default.toDataURL(`${QR_PREFIX}${studentId}`, { width: 360, margin: 1 }))
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [studentId]);
  return (
    <section className="flex flex-col items-center gap-2 rounded-[20px] border border-outline-variant bg-white p-5 text-center">
      <h2 className="text-lg font-bold">{t.qr.myCode}</h2>
      <p className="text-sm text-on-surface-variant">{t.qr.myCodeSub}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={`${t.qr.myCode}: ${name}`} width={220} height={220} className="rounded-[10px] bg-white p-2" />}
      <span className="font-semibold">{name}</span>
    </section>
  );
}
