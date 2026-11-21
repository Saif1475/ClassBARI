"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { QR_PREFIX } from "@/components/student/MyQr";

/** Camera scanner: each student QR code scanned marks that student present. */
export function QrAttendance({ students, onPresent, onClose }: { students: { id: number; name: string }[]; onPresent: (id: number) => void; onClose: () => void }) {
  const { t } = useLang();
  const Q = t.qr;
  const video = useRef<HTMLVideoElement>(null);
  const [seen, setSeen] = useState<number[]>([]);
  const [msg, setMsg] = useState(Q.scanning);
  const [error, setError] = useState("");
  const seenRef = useRef<number[]>([]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    // The QR reader is fetched when the scanner opens, not with the whole dashboard.
    let jsQR: typeof import("jsqr").default | undefined;
    import("jsqr").then((m) => (jsQR = m.default)).catch(() => setError(Q.noCamera));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tick = () => {
      const v = video.current;
      if (jsQR && v && ctx && v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        const id = code?.data.startsWith(QR_PREFIX) ? Number(code.data.slice(QR_PREFIX.length)) : null;
        if (code && id !== null) {
          const st = students.find((s) => s.id === id);
          if (!st) setMsg(Q.unknown);
          else if (!seenRef.current.includes(id)) {
            seenRef.current = [...seenRef.current, id];
            setSeen(seenRef.current);
            onPresent(id);
            setMsg(Q.marked(st.name));
            navigator.vibrate?.(80);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
        frame = requestAnimationFrame(tick);
      })
      .catch(() => setError(Q.noCamera));
    if (!navigator.mediaDevices) setError(Q.noCamera);
    return () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // Runs once per open; students/onPresent are stable for the dialog's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="qr-title" className="flex w-full max-w-md flex-col gap-3 rounded-t-[20px] bg-white p-5 sm:rounded-[20px]">
        <div className="flex items-center justify-between">
          <h2 id="qr-title" className="text-xl font-bold">{Q.scan}</h2>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container">
            <Icon name="close" size={18} />
          </button>
        </div>
        {error ? (
          <p role="alert" className="rounded-xl bg-error-container p-4 text-sm text-on-error-container">{error}</p>
        ) : (
          <video ref={video} muted playsInline className="aspect-square w-full rounded-xl bg-black object-cover" />
        )}
        <p role="status" aria-live="polite" className="font-semibold text-primary">{msg}</p>
        <p className="text-sm text-on-surface-variant">{Q.count(seen.length, students.length)}</p>
        <button type="button" onClick={onClose} className="h-11 rounded-full bg-primary font-bold text-on-primary">{Q.done}</button>
      </div>
    </div>
  );
}
