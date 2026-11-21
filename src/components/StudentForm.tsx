"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms, type StudentInput, type StudentRecord } from "@/lib/lms-store";
import { validateStudent, type StudentContact } from "@/lib/site";

const box = "h-11 rounded-xl border border-outline bg-white px-3 text-sm text-on-surface outline-none";
const label = "flex flex-col gap-1 text-xs font-bold text-on-surface-variant";

/**
 * Student + guardian details with Gmail accounts. `full` adds batch, mode and first-month fee
 * (teacher enrolment); the invite and public course pages use the short version with a fixed batch.
 */
export function StudentForm({
  initial,
  batch,
  batches,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<StudentRecord>; // with an id: editing that student; without: a pre-filled new student
  batch?: string; // fixed batch (invite link / public course)
  batches?: string[]; // teacher picks the batch
  submitLabel: string;
  onSubmit: (input: StudentInput & { feePaid: boolean }) => void;
}) {
  const { t } = useLang();
  const R = t.roster;
  const lms = useLms();
  const [f, setF] = useState({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    studentPhone: initial?.studentPhone ?? "",
    dob: initial?.dob ?? "",
    school: initial?.school ?? "",
    address: initial?.address ?? "",
    guardianName: initial?.guardianName ?? "",
    guardianEmail: initial?.guardianEmail ?? "",
    phone: initial?.phone ?? "",
    batch: initial?.batch ?? batch ?? batches?.[0] ?? "",
    mode: initial?.mode ?? ("offline" as "offline" | "online"),
    gender: (initial?.gender ?? "") as "" | "male" | "female",
    feePaid: true,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof StudentContact, string>>>({});
  const [genderMissing, setGenderMissing] = useState(false);
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const field = (k: keyof StudentContact | "dob" | "school" | "address", text: string, type = "text", hint?: string, autoComplete?: string) => {
    const err = errors[k as keyof StudentContact];
    return (
      <label className={label}>
        {text}
        <input type={type} value={f[k]} onChange={up(k)} autoComplete={autoComplete} aria-invalid={!!err} className={`${box} ${err ? "border-error" : ""}`} />
        {hint && !err && <span className="font-normal">{hint}</span>}
        {err && <span role="alert" className="font-semibold text-error">{err}</span>}
      </label>
    );
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const found = validateStudent(f, [...lms.students, ...lms.waiting], initial?.id); // a Gmail waiting for approval is taken too
        setErrors(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, R.errors[v]])));
        const noGender = !!batches && !f.gender; // the institute's own form must say male or female
        setGenderMissing(noGender);
        if (Object.keys(found).length || noGender) return;
        onSubmit({ ...f, gender: f.gender || undefined, batch: batch ?? f.batch });
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold text-primary">{R.studentSection}</legend>
        {field("name", R.name, "text", undefined, "name")}
        <label className={label}>
          {R.gender}
          <select value={f.gender} onChange={(e) => (up("gender")(e), setGenderMissing(false))} aria-invalid={genderMissing} className={`${box} ${genderMissing ? "border-error" : ""}`}>
            <option value="">{R.genderPick}</option>
            <option value="male">{R.male}</option>
            <option value="female">{R.female}</option>
          </select>
          {genderMissing && <span role="alert" className="font-semibold text-error">{R.genderRequired}</span>}
        </label>
        {field("email", R.email, "email", R.emailHint, "email")}
        {field("studentPhone", R.studentPhone, "tel")}
        {field("dob", R.dob, "date")}
        {batches && field("school", R.school)}
        {batches && field("address", R.address)}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold text-primary">{R.guardianSection}</legend>
        {field("guardianName", R.guardianName)}
        {field("guardianEmail", R.guardianEmail, "email", R.guardianEmailHint)}
        {field("phone", R.guardianPhone, "tel")}
      </fieldset>

      {batches && (
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-bold text-primary">{R.classSection}</legend>
          <label className={label}>
            {R.batch}
            <select value={f.batch} onChange={up("batch")} className={box}>
              {batches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className={label}>
            {t.student.mode}
            <select value={f.mode} onChange={up("mode")} className={box}>
              <option value="offline">{t.teacher.offlineMode}</option>
              <option value="online">{t.teacher.onlineMode}</option>
            </select>
          </label>
          {!initial?.id && (
            <label className={label}>
              {t.teacher.feeStatusLabel}
              <select value={f.feePaid ? "paid" : "due"} onChange={(e) => setF({ ...f, feePaid: e.target.value === "paid" })} className={box}>
                <option value="paid">{t.teacher.feePaidOpt}</option>
                <option value="due">{t.common.due}</option>
              </select>
            </label>
          )}
        </fieldset>
      )}

      <button type="submit" className="h-12 self-start rounded-full bg-primary px-6 font-bold text-on-primary">{submitLabel}</button>
    </form>
  );
}
