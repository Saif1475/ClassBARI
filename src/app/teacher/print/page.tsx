"use client";

import QRCode from "qrcode";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { QR_PREFIX } from "@/components/student/MyQr";
import { OmrSheet } from "@/components/teacher/tools/OmrSheet";
import { fmtDate } from "@/lib/dates";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { itemScores, useLms } from "@/lib/lms-store";
import { meritList } from "@/lib/quiz";

/**
 * Print-only pages (no menus): ?kind=merit&item= · idcards&batch= · admit&item= · certificate&batch=&type=completion|merit[&item=] · omr&n=&title=
 * The teacher opens it from Tools and presses Print (or "Save as PDF").
 */
export default function PrintPage() {
  // The page is pre-built as static HTML, so read the query in the browser.
  return (
    <Suspense>
      <Print />
    </Suspense>
  );
}

function Print() {
  const sp = useSearchParams();
  useEffect(() => {
    // paper is white: print pages always use the light look
    const html = document.documentElement, wasDark = html.classList.contains("dark");
    html.classList.remove("dark");
    return () => void (wasDark && html.classList.add("dark"));
  }, []);
  const q = Object.fromEntries(sp.entries()) as Record<string, string | undefined>;
  const { t } = useLang();
  const lms = useLms();
  if (!lms.ready) return null;
  const item = lms.modules.flatMap((m) => m.items.map((it) => ({ ...it, batch: m.batch }))).find((it) => String(it.id) === q.item);
  const batchName = q.batch ?? item?.batch ?? "";
  const students = lms.students.filter((s) => s.batch === batchName).sort((a, b) => a.id - b.id);
  const institute = lms.instituteName || lms.teacherName;

  return (
    <div className="min-h-dvh bg-white p-6 text-black print:p-0">
      <button type="button" onClick={() => window.print()} className="mb-6 h-12 rounded-full bg-primary px-6 font-bold text-on-primary print:hidden">
        {t.printing.print}
      </button>
      {q.kind === "merit" && item && (
        <section className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold">{t.merit.title(item.title)}</h1>
          <p className="mb-4 text-sm">{institute} · {item.batch}</p>
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b-2 border-black text-left"><th className="py-1">{t.merit.rank}</th><th>{t.common.roll}</th><th>{t.merit.name}</th><th className="text-right">{t.merit.marks}</th></tr></thead>
            <tbody>
              {meritList(itemScores(item)).map((r) => (
                <tr key={r.id} className="border-b border-gray-300"><td className="py-1">{r.rank}</td><td>{r.id}</td><td>{lms.students.find((s) => s.id === r.id)?.name ?? "—"}</td><td className="text-right">{r.score} / {item.points ?? 30}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {q.kind === "idcards" && (
        <div className="grid grid-cols-2 gap-4 print:gap-3">
          {students.map((s) => (
            <Card key={s.id} title={institute} sub={t.printing.idCard}>
              <div className="flex gap-3">
                <Photo src={s.photo} name={s.name} />
                <div className="flex flex-1 flex-col text-sm">
                  <b className="text-base">{s.name}</b>
                  <span>{t.common.roll}: {s.id}</span>
                  <span>{s.batch}</span>
                  <span>{t.printing.guardian}: {s.phone}</span>
                </div>
                <Qr text={`${QR_PREFIX}${s.id}`} />
              </div>
            </Card>
          ))}
        </div>
      )}
      {q.kind === "admit" && item && (
        <div className="grid grid-cols-2 gap-4 print:gap-3">
          {students.map((s) => (
            <Card key={s.id} title={institute} sub={t.printing.admitCard}>
              <div className="flex gap-3">
                <Photo src={s.photo} name={s.name} />
                <div className="flex flex-1 flex-col text-sm">
                  <b className="text-base">{s.name}</b>
                  <span>{t.printing.exam}: {item.title}</span>
                  {item.dueDate && <span>{t.printing.date}: {fmtDate(item.dueDate, "en")}</span>}
                  <span>{t.printing.seat}: <b>{s.id}</b></span>
                </div>
              </div>
              <p className="mt-2 border-t border-gray-300 pt-1 text-[10px]">{t.printing.admitRules}</p>
            </Card>
          ))}
        </div>
      )}
      {q.kind === "certificate" && (
        <Certificates type={q.type === "merit" ? "merit" : "completion"} item={item} students={students} institute={institute} batch={batchName} />
      )}
      {q.kind === "omr" && <OmrSheet questions={Math.min(100, Math.max(5, Number(q.n) || 50))} title={q.title ?? ""} institute={institute} />}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid rounded-[10px] border-2 border-[#006a60] p-3">
      <div className="mb-2 flex items-baseline justify-between border-b border-[#006a60] pb-1">
        <b className="text-[#006a60]">{title}</b>
        <span className="text-xs font-bold uppercase">{sub}</span>
      </div>
      {children}
      <p className="mt-1 text-right text-[9px] text-gray-500">ClassBARI</p>
    </div>
  );
}

function Photo({ src, name }: { src?: string; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt={name} className="h-24 w-20 rounded object-cover" />;
  return <span className="flex h-24 w-20 items-center justify-center rounded bg-gray-100 text-3xl font-bold text-gray-500">{name.charAt(0)}</span>;
}

function Qr({ text }: { text: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => void QRCode.toDataURL(text, { width: 160, margin: 0 }).then(setSrc).catch(() => {}), [text]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="QR" className="h-20 w-20" /> : <span className="h-20 w-20" />;
}

function Certificates({ type, item, students, institute, batch }: { type: "completion" | "merit"; item?: { title: string; points?: number } & Parameters<typeof itemScores>[0]; students: { id: number; name: string }[]; institute: string; batch: string }) {
  const { t, lang } = useLang();
  const C = t.printing;
  const list =
    type === "merit" && item
      ? meritList(itemScores(item)).filter((r) => r.rank <= 3).map((r) => ({ st: students.find((s) => s.id === r.id), rank: r.rank })).filter((x) => x.st)
      : students.map((st) => ({ st, rank: 0 }));
  return (
    <>
      {list.map(({ st, rank }) => (
        <div key={st!.id} className="mx-auto mb-8 flex aspect-[1.414] max-w-3xl break-after-page flex-col items-center justify-center gap-4 border-[10px] border-double border-[#006a60] p-10 text-center">
          <p className="text-lg font-bold tracking-widest text-[#006a60]">{institute}</p>
          <h1 className="text-4xl font-bold">{type === "merit" ? C.meritTitle : C.completionTitle}</h1>
          <p>{C.presentedTo}</p>
          <p className="border-b-2 border-black px-8 text-3xl font-bold italic">{st!.name}</p>
          <p className="max-w-lg">{type === "merit" && item ? C.meritText(rank, item.title) : C.completionText(batch)}</p>
          <div className="mt-6 flex w-full justify-between px-10 text-sm">
            <span className="border-t border-black px-6 pt-1">{fmtDate(new Date().toISOString(), lang)}</span>
            <span className="border-t border-black px-6 pt-1">{C.signature}</span>
          </div>
          <p className="text-[10px] text-gray-500">ClassBARI</p>
        </div>
      ))}
    </>
  );
}
