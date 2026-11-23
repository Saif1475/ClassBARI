"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { GlassSlider, Logo, TextSizeSlider } from "@/components/Brand";
import { PasswordInput } from "@/components/PasswordInput";
import { strongPassword } from "@/components/auth/StepLogin";
import { PushToggle } from "@/components/PushToggle";
import { SlidingSegmented } from "@/components/SlidingSegmented";
import { SeatBillingCard } from "@/components/teacher/SeatBillingCard";
import { useLang, type Lang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import { getRole, type Role } from "@/lib/role";
import { logOut } from "@/lib/logout";
import { REAL_AUTH } from "@/lib/auth-mode";
import { isBdMobile } from "@/lib/site";
import { supabaseLater } from "@/lib/supabase/later";
import { applyThemeMode, applyTone, readThemeMode, readTone, type ThemeMode, type Tone } from "@/lib/theme";

const HOME: Record<Role, string> = { student: "/student", teacher: "/teacher", institute: "/institute", parent: "/parent" };
const card = "flex flex-col gap-4 rounded-[18px] border border-outline-variant bg-white p-5";
const box = "h-12 rounded-xl border border-outline bg-transparent px-4 text-base";
const field = "flex flex-col gap-1.5 text-sm font-semibold text-on-surface-variant";

/** One settings page for every role; each sees the parts that apply to them. */
export default function Settings() {
  const { t } = useLang();
  const S = t.settings;
  const lms = useLms();
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => setRole(getRole()), []);
  if (!lms.ready || !role) return null;
  const staff = role === "teacher" || role === "institute";

  return (
    <div className="min-h-dvh px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <Link href={HOME[role]} className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-4 py-2 text-sm font-bold text-primary">
            <Icon name="back" size={16} /> {S.back}
          </Link>
          <Logo />
        </div>
        <h1 className="text-3xl font-bold">{S.title}</h1>

        {staff ? <TeacherProfile institute={role === "institute"} /> : role === "student" ? <StudentProfile /> : <GuardianProfile />}
        <Appearance />
        {REAL_AUTH && <Password />}
        {(REAL_AUTH || !staff) && <Notifications role={role} />}
        {role === "institute" && <SeatBillingCard totalStudents={lms.students.length} />}
        {staff && <Backup />}

        <section className={card}>
          <h2 className="text-lg font-bold">{S.help}</h2>
          <div className="flex flex-wrap gap-2">
            {[["/support", t.support.link], ["/privacy", t.landing.privacy], ["/terms", t.landing.terms]].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-full bg-surface-container px-4 py-2 text-sm font-bold text-primary">{label}</Link>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">{REAL_AUTH ? S.versionReal : S.version}</p>
        </section>

        <button
          type="button"
          onClick={async () => {
            await logOut();
            router.push("/login");
          }}
          className="h-13 rounded-full bg-error-container text-base font-bold text-on-error-container"
        >
          {t.common.logOut}
        </button>
      </div>
    </div>
  );
}

function Appearance() {
  const { t, lang, setLang } = useLang();
  const S = t.settings;
  const [mode, setMode] = useState<ThemeMode>("system");
  const [tone, setTone] = useState<Tone>("green");
  useEffect(() => (setMode(readThemeMode()), setTone(readTone())), []);
  return (
    <section className={card}>
      <h2 className="text-lg font-bold">{S.appearance}</h2>
      <div className={field}>
        {S.colours}
        <div role="radiogroup" aria-label={S.colours} className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
          {([["green", S.toneGreen, ["#157347", "#a8ecc4", "#f0f8f2"]], ["sky", S.toneSky, ["#1976b8", "#ffd6e4", "#fbfcfe"]]] as [Tone, string, string[]][]).map(([id, label, dots]) => (
            <button key={id} type="button" role="radio" aria-checked={tone === id} onClick={() => (setTone(id), applyTone(id))} className={`flex min-h-14 items-center gap-3 rounded-xl border-2 bg-white px-3 py-2 text-left text-sm font-bold text-on-surface ${tone === id ? "border-primary" : "border-transparent"}`}>
              <span aria-hidden className="flex shrink-0 -space-x-1.5">
                {dots.map((c) => <span key={c} className="h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: c }} />)}
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={field}>
        {S.theme}
        <SlidingSegmented<ThemeMode>
          ariaLabel={S.theme}
          value={mode}
          onChange={(m) => {
            setMode(m);
            applyThemeMode(m);
          }}
          options={[
            { value: "light", label: `☀︎ ${S.light}` },
            { value: "dark", label: `☾ ${S.dark}` },
            { value: "system", label: `◐ ${S.system}` },
          ]}
          buttonClassName="min-h-11 px-2 py-1.5 text-[13px] font-bold leading-tight sm:px-4 sm:text-sm"
          className="bg-white/70"
        />
      </div>
      <div className={field}>
        {t.common.textSize}
        <TextSizeSlider />
      </div>
      <div className={field}>
        {S.glass}
        <GlassSlider />
      </div>
      <div className={field}>
        {t.common.language}
        <SlidingSegmented<Lang>
          ariaLabel={t.common.language}
          value={lang}
          onChange={setLang}
          options={[{ value: "en", label: "English" }, { value: "bn", label: "বাংলা", className: "font-[family-name:var(--font-bn-label),var(--font-bangla)]" }]}
          className="bg-white/70"
        />
      </div>
    </section>
  );
}

/** Change the password while logged in. */
function Password() {
  const { t } = useLang();
  const S = t.settings;
  const A = t.auth;
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strongPassword(password)) return setMsg({ ok: false, text: A.passwordRule });
    if (password !== again) return setMsg({ ok: false, text: A.passwordsDiffer });
    setBusy(true);
    const { error } = await (await supabaseLater()).auth.updateUser({ password });
    setBusy(false);
    // The password they already have is fine; a project set to ask for a fresh login first sends them to "Forgot password?".
    if (error && error.code !== "same_password") return setMsg({ ok: false, text: error.code === "weak_password" ? A.passwordRule : error.code === "reauthentication_needed" ? S.passwordAgainLogin : A.resendSoon });
    setPassword("");
    setAgain("");
    setMsg({ ok: true, text: S.passwordChanged });
  };
  return (
    <form className={card} onSubmit={change}>
      <h2 className="text-lg font-bold">{S.password}</h2>
      <p className="text-sm text-on-surface-variant">{S.passwordHelp} {A.passwordRule}</p>
      <label className={field}>{A.password}<PasswordInput required autoComplete="new-password" minLength={8} value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} className={box} /></label>
      <label className={field}>{A.passwordAgain}<PasswordInput required autoComplete="new-password" value={again} onChange={(e) => { setAgain(e.target.value); setMsg(null); }} className={box} /></label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-primary" : "text-error"}`}>{msg.text}</p>}
      <button type="submit" disabled={busy} className="h-12 self-start rounded-full bg-primary px-6 font-bold text-on-primary disabled:opacity-60">{S.changePassword}</button>
    </form>
  );
}

function Notifications({ role }: { role: Role }) {
  const { t } = useLang();
  const lms = useLms();
  const N = t.notify;
  const batches =
    role === "student"
      ? [lms.students.find((s) => s.id === lms.meId)?.batch ?? ""]
      : [...new Set(lms.students.filter((s) => lms.parentChildren.includes(s.id)).map((s) => s.batch))];
  // With real accounts: one switch per kind of notification, the same for the website and the phone apps.
  const [prefs, setPrefs] = useState<{ groups: (keyof typeof N.groups)[]; off: string[] } | null>(null);
  useEffect(() => {
    if (REAL_AUTH) void fetch("/api/notify").then((r) => (r.ok ? r.json() : null)).then(setPrefs).catch(() => {});
  }, []);
  const flip = (g: string) => {
    if (!prefs) return;
    const off = prefs.off.includes(g) ? prefs.off.filter((x) => x !== g) : [...prefs.off, g];
    setPrefs({ ...prefs, off });
    void fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ off }) });
  };
  return (
    <section className={card}>
      <h2 className="text-lg font-bold">{N.title}</h2>
      <PushToggle role={role === "student" ? "student" : "parent"} batches={batches.filter(Boolean)} />
      <p className="text-sm text-on-surface-variant">{REAL_AUTH ? N.help : t.settings.notificationsHelp}</p>
      {prefs && (
        <div className="flex flex-col divide-y divide-outline-variant">
          {prefs.groups.map((g) => (
            <label key={g} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 py-2 font-semibold">
              {N.groups[g]}
              <input type="checkbox" role="switch" checked={!prefs.off.includes(g)} onChange={() => flip(g)} className="h-6 w-11 shrink-0 accent-primary" />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function TeacherProfile({ institute }: { institute: boolean }) {
  const { t } = useLang();
  const S = t.settings;
  const lms = useLms();
  const myName = institute || !lms.teacherLogin ? lms.teacherName : lms.teacherLogin;
  const me = lms.staff.find((s) => s.name === myName);
  const [name, setName] = useState(myName);
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [inst, setInst] = useState(lms.instituteName || "");
  const [bkash, setBkash] = useState(lms.site.bkash);
  const [saved, setSaved] = useState(false);
  const [bad, setBad] = useState(false);
  return (
    <form
      className={card}
      onSubmit={(e) => {
        e.preventDefault();
        if ((phone && !isBdMobile(phone)) || (bkash && !isBdMobile(bkash))) return setBad(true);
        setBad(false);
        lms.updateStaffProfile(myName, name, phone);
        if (institute) {
          lms.setInstituteName(inst);
          lms.updateSite({ bkash: bkash.trim() });
        }
        setSaved(true);
      }}
    >
      <h2 className="text-lg font-bold">{S.profile}</h2>
      <label className={field}>{S.yourName}<input required maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} className={box} /></label>
      <label className={field}>{S.phone}<input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} placeholder="01XXXXXXXXX" className={box} /><span className="font-normal">{REAL_AUTH ? S.phoneHelpReal : S.phoneHelp}</span></label>
      {institute && (
        <>
          <label className={field}>{S.instituteName}<input required={REAL_AUTH} maxLength={80} value={inst} onChange={(e) => { setInst(e.target.value); setSaved(false); }} placeholder={lms.teacherName} className={box} /><span className="font-normal">{S.instituteHelp}</span></label>
          <label className={field}>{t.website.bkash}<input type="tel" value={bkash} onChange={(e) => { setBkash(e.target.value); setSaved(false); }} placeholder="01XXXXXXXXX" className={box} /><span className="font-normal">{t.website.bkashHelp}</span></label>
        </>
      )}
      {institute && REAL_AUTH && <InstituteCode />}
      {bad && <p role="alert" className="text-sm font-semibold text-error">{t.teacher.phoneInvalid}</p>}
      <button type="submit" className="h-12 self-start rounded-full bg-primary px-6 font-bold text-on-primary">{saved ? `${S.saved} ✓` : S.save}</button>
    </form>
  );
}

function StudentProfile() {
  const { t } = useLang();
  const S = t.settings;
  const lms = useLms();
  const me = lms.students.find((s) => s.id === lms.meId) ?? lms.students[0];
  if (!me) return null;
  const rows: [string, string][] = [[S.yourName, me.name], ["Gmail", me.email], [t.roster.batch, me.batch], [t.common.roll, String(me.id)], [S.guardian, `${me.guardianName} · ${me.phone}`]];
  return <ReadOnly title={S.profile} rows={rows} note={S.askInstitute} />;
}

function GuardianProfile() {
  const { t } = useLang();
  const S = t.settings;
  const lms = useLms();
  const kids = lms.students.filter((s) => lms.parentChildren.includes(s.id));
  const g = kids[0];
  if (!g) return null;
  const rows: [string, string][] = [[S.yourName, g.guardianName], ["Gmail", g.guardianEmail], [S.phone, g.phone], ...kids.map((k): [string, string] => [S.child, `${k.name} · ${k.batch}`])];
  return <ReadOnly title={S.profile} rows={rows} note={S.askInstitute} />;
}

function ReadOnly({ title, rows, note }: { title: string; rows: [string, string][]; note: string }) {
  return (
    <section className={card}>
      <h2 className="text-lg font-bold">{title}</h2>
      <dl className="flex flex-col divide-y divide-outline-variant">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex flex-wrap justify-between gap-2 py-2.5">
            <dt className="text-sm text-on-surface-variant">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-on-surface-variant">{note}</p>
    </section>
  );
}

function Backup() {
  const { t } = useLang();
  const S = t.settings;
  const lms = useLms();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const download = () => {
    const url = URL.createObjectURL(new Blob([lms.exportBackup()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `instanton-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className={card}>
      <h2 className="text-lg font-bold">{S.backup}</h2>
      <p className="text-sm text-on-surface-variant">{S.backupHelp}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={download} className="h-11 rounded-full bg-primary px-5 font-bold text-on-primary">⬇ {S.download}</button>
        <label className="flex h-11 cursor-pointer items-center rounded-full bg-secondary-container px-5 font-bold text-on-secondary-container">
          ⬆ {S.restore}
          <input
            type="file"
            accept="application/json,.json"
            aria-label={S.restore}
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f || !window.confirm(S.restoreQ)) return;
              const ok = lms.importBackup(await f.text());
              setMsg({ ok, text: ok ? S.restored : S.badBackup });
            }}
          />
        </label>
        {!REAL_AUTH && <button type="button" onClick={() => window.confirm(t.teacher.confirmReset) && lms.resetDemoData()} className="h-11 rounded-full bg-surface-container px-5 font-bold text-error">{t.teacher.resetDemo}</button>}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-primary" : "text-error"}`}>{msg.text}</p>}
    </section>
  );
}

/** The code families type at "Find your institute" on the login screen. */
function InstituteCode() {
  const { t } = useLang();
  const [card, setCard] = useState<{ name: string; code: string; listed?: boolean } | null>(null);
  const toggle = async (listed: boolean) => {
    const res = await fetch("/api/institutes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listed }) });
    if (res.ok) setCard(await res.json());
  };
  useEffect(() => {
    fetch("/api/institutes?mine=1").then((r) => (r.ok ? r.json() : null)).then(setCard).catch(() => {});
  }, []);
  if (!card) return null;
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface-container p-4">
      <span className="text-sm font-semibold text-on-surface-variant">{t.auth.instituteCode}</span>
      <span className="font-mono text-2xl font-extrabold tracking-widest text-primary">{card.code}</span>
      <span className="text-sm text-on-surface-variant">{t.auth.instituteCodeHelp}</span>
      <label className="mt-2 flex items-start gap-3 text-sm font-semibold">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={card.listed !== false} onChange={(e) => void toggle(e.target.checked)} />
        <span>
          {t.auth.listedLabel}
          <span className="block font-normal text-on-surface-variant">{t.auth.listedHelp}</span>
        </span>
      </label>
    </div>
  );
}
