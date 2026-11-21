"use client";

import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/Brand";
import { PLANS, type Flags, type Institute, type overview, type Platform, type Plan } from "@/lib/platform";
import { isBdMobile, waLink } from "@/lib/site";

// ClassBARI staff panel. Staff-only, so English only. Data: /api/platform/admin + /api/leads (ADMIN_TOKEN).
type Lead = { name: string; phone: string; size: string; at: string };
type Data = Platform & { overview: ReturnType<typeof overview>; smsLive: boolean; errors?: { at: string; where: string; message: string }[]; alertsOn?: boolean };
const TABS = ["Overview", "Institutes", "Enquiries", "Support", "Announcements", "Features", "SMS", "Plans", "AI answers", "Activity"] as const;
type Tab = (typeof TABS)[number];
const TOKEN_KEY = "classbari-admin-token"; // this tab only; closed tab = logged out
const FLAG_INFO: Record<keyof Flags, [string, string]> = {
  liveGame: ["Live quiz game", "Teachers host a game, students join with a PIN at /play."],
  handwriting: ["Handwriting reader", "Students turn a photo of notes into text (needs the OCR service)."],
  publicCourses: ["Public course pages", "/courses and each batch's public page."],
  signups: ["New teacher sign-ups", "Turn off to pause /signup (existing users still log in)."],
  sms: ["SMS to guardians", "Absent notices and fee reminders by SMS. Each SMS costs money."],
};
const card = "rounded-[16px] bg-white p-5";
const btn = "rounded-full px-4 py-2 text-sm font-bold";
const input = "h-10 rounded-[10px] border border-outline bg-white px-3 text-sm";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const taka = (n: number) => `৳${n.toLocaleString("en-IN")}`;

export default function Admin() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<Data | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);

  const load = useCallback(async (tok: string) => {
    const h = { Authorization: `Bearer ${tok}` };
    const [p, l] = await Promise.all([fetch("/api/platform/admin", { headers: h }), fetch("/api/leads", { headers: h })]);
    if (!p.ok) {
      setAuthed(false);
      sessionStorage.removeItem(TOKEN_KEY);
      setError(p.status === 401 ? "Wrong token, or ADMIN_TOKEN isn't set on the server." : `Server error (${p.status}).`);
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, tok);
    setAuthed(true);
    setError("");
    setData(await p.json());
    setLeads(l.ok ? (await l.json()).leads : []);
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      load(saved);
    }
  }, [load]);

  /** Every change: POST, then reload so the screen shows what the server saved. */
  const act = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/platform/admin", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) alert(`Not saved: ${(await res.json().catch(() => ({}))).error ?? res.status}`);
    await load(token);
  };

  if (!authed || !data)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface px-4">
        <Logo />
        <h1 className="text-2xl font-bold">Staff admin</h1>
        <form onSubmit={(e) => { e.preventDefault(); load(token); }} className={`${card} flex w-full max-w-sm flex-col gap-3`}>
          <input type="password" required value={token} onChange={(e) => setToken(e.target.value)} placeholder="Admin token" aria-label="Admin token" className="h-12 rounded-xl border border-outline px-4" />
          <button type="submit" className="h-12 rounded-full bg-primary font-bold text-on-primary">Open</button>
          {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
        </form>
      </div>
    );

  const o = data.overview;
  const openTickets = data.tickets.filter((t) => t.status === "open").length;
  const newLeads = leads.filter((l) => (data.leadStatus[`${l.at}|${l.phone}`] ?? "new") === "new").length;
  const badge: Partial<Record<Tab, number>> = { Support: openTickets, Enquiries: newLeads };

  return (
    <div className="min-h-dvh bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-outline-variant bg-white px-4 py-3 md:px-8">
        <Logo />
        <span className="rounded-full bg-surface-container px-3 py-1 text-sm font-bold">Staff admin</span>
        {data.maintenance && <span className="rounded-full bg-[#fff3cd] px-3 py-1 text-sm font-bold text-[#664d03]">Maintenance ON</span>}
        <button type="button" onClick={() => load(token)} className={`${btn} ml-auto bg-surface-container text-primary`}>Refresh</button>
        <button type="button" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setAuthed(false); setToken(""); }} className={`${btn} bg-surface-container`}>Log out</button>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:flex-row md:px-8">
        <nav data-slide aria-label="Admin sections" className="flex gap-1 overflow-x-auto md:w-48 md:shrink-0 md:flex-col">
          {TABS.map((x) => (
            <button key={x} type="button" aria-current={tab === x ? "page" : undefined} onClick={() => setTab(x)} className={`flex shrink-0 items-center justify-between gap-2 rounded-full px-4 py-2.5 text-left font-semibold ${tab === x ? "bg-primary text-on-primary" : "hover:bg-surface-container"}`}>
              {x}
              {!!badge[x] && <span className="rounded-full bg-error px-2 text-xs text-white">{badge[x]}</span>}
            </button>
          ))}
        </nav>

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <h1 className="text-2xl font-bold">{tab}</h1>

          {tab === "Overview" && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ["Institutes", o.institutes, `${o.newThisMonth} new this month`],
                  ["Monthly income", taka(o.monthlyIncome), "active institutes × plan price"],
                  ["Trials ending ≤ 7 days", o.trialsEndingSoon, "call them before it ends"],
                  ["Open support requests", o.openTickets, `${newLeads} new enquiries`],
                ].map(([k, v, s]) => (
                  <div key={k} className={card}>
                    <p className="text-sm text-on-surface-variant">{k}</p>
                    <p className="text-3xl font-bold">{v}</p>
                    <p className="text-xs text-on-surface-variant">{s}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-on-surface-variant">Push notifications: <b>{data.push.length}</b> phones/browsers subscribed · {data.pushSent.day === new Date().toISOString().slice(0, 10) ? data.pushSent.count : 0} sent today</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className={card}>
                  <h2 className="mb-2 font-bold">By status</h2>
                  {(["trial", "active", "suspended"] as const).map((s) => <p key={s} className="flex justify-between capitalize"><span>{s}</span><b>{o.byStatus[s] ?? 0}</b></p>)}
                </div>
                <div className={card}>
                  <h2 className="mb-2 font-bold">By plan</h2>
                  {PLANS.map((p) => <p key={p} className="flex justify-between capitalize"><span>{p}</span><b>{o.byPlan[p] ?? 0}</b></p>)}
                </div>
              </div>
            </>
          )}

          {tab === "Institutes" && <Institutes list={data.institutes} act={act} />}

          {tab === "Enquiries" && (
            <>
              <p className="text-sm text-on-surface-variant">From the landing-page form. If LEADS_WEBHOOK_URL is set, new enquiries go there instead.</p>
              {leads.length === 0 && <p className="text-on-surface-variant">No enquiries yet.</p>}
              {leads.map((l) => {
                const key = `${l.at}|${l.phone}`;
                return (
                  <div key={key} className={`${card} flex flex-wrap items-center gap-3`}>
                    <span className="flex min-w-48 flex-1 flex-col">
                      <b>{l.name}</b>
                      <span className="text-sm text-on-surface-variant">{l.phone} · {l.size} · {when(l.at)}</span>
                    </span>
                    <Contact phone={l.phone} />
                    <select value={data.leadStatus[key] ?? "new"} onChange={(e) => act({ type: "lead", key, status: e.target.value })} aria-label={`Status of ${l.name}`} className={input}>
                      <option value="new">New</option>
                      <option value="called">Called</option>
                      <option value="won">Signed up</option>
                      <option value="lost">Not interested</option>
                    </select>
                  </div>
                );
              })}
            </>
          )}

          {tab === "Support" && (
            <>
              {data.tickets.length === 0 && <p className="text-on-surface-variant">No support requests yet. People write in from /support.</p>}
              {data.tickets.map((t) => (
                <article key={t.id} className={`${card} flex flex-col gap-2 ${t.status === "closed" ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{t.name}</b>
                    <span className="rounded-full bg-surface-container px-2 text-xs font-bold capitalize">{t.role}</span>
                    <span className="text-sm text-on-surface-variant">{t.contact} · {when(t.createdAt)}</span>
                    <span className={`ml-auto rounded-full px-2 text-xs font-bold ${t.status === "open" ? "bg-error text-white" : "bg-surface-container"}`}>{t.status}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{t.message}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Contact phone={t.contact} />
                    <Note value={t.note} label={`Note for ${t.name}`} onSave={(note) => act({ type: "ticket", id: t.id, note })} />
                    <button type="button" onClick={() => act({ type: "ticket", id: t.id, status: t.status === "open" ? "closed" : "open" })} className={`${btn} bg-primary text-on-primary`}>
                      {t.status === "open" ? "Mark solved" : "Reopen"}
                    </button>
                  </div>
                </article>
              ))}
            </>
          )}

          {tab === "Announcements" && <Announcements data={data} act={act} />}
          {tab === "Announcements" && <PremiumInstitute token={token} />}
          {tab === "Overview" && <Errors data={data} />}
          {tab === "AI answers" && <SavedAnswers token={token} />}

          {tab === "Features" && (
            <>
              <p className="text-sm text-on-surface-variant">Switches apply to everyone at once, within a page load. The server also refuses switched-off features.</p>
              {(Object.keys(FLAG_INFO) as (keyof Flags)[]).map((k) => (
                <label key={k} className={`${card} flex items-center gap-4`}>
                  <span className="flex-1">
                    <b>{FLAG_INFO[k][0]}</b>
                    <span className="block text-sm text-on-surface-variant">{FLAG_INFO[k][1]}</span>
                  </span>
                  <input type="checkbox" role="switch" checked={data.flags[k]} onChange={(e) => act({ type: "flag", key: k, on: e.target.checked })} className="h-6 w-6 accent-[var(--color-primary)]" />
                  <span className={`w-10 text-sm font-bold ${data.flags[k] ? "text-primary" : "text-error"}`}>{data.flags[k] ? "On" : "Off"}</span>
                </label>
              ))}
            </>
          )}

          {tab === "SMS" && <Sms data={data} act={act} />}

          {tab === "Plans" && (
            <>
              <p className="text-sm text-on-surface-variant">Monthly price per plan. Used for the income figure; it does not charge anyone.</p>
              {PLANS.map((p) => <Price key={p} plan={p} value={data.prices[p]} act={act} />)}
            </>
          )}

          {tab === "Activity" && (
            <div className={`${card} flex flex-col divide-y divide-outline-variant`}>
              {data.audit.length === 0 && <p className="text-on-surface-variant">Nothing yet. Every change made here is listed.</p>}
              {data.audit.map((a, i) => (
                <p key={i} className="flex flex-wrap gap-x-3 py-2 text-sm">
                  <span className="text-on-surface-variant">{when(a.at)}</span>
                  <b className="capitalize">{a.action}</b>
                  <span className="break-all">{a.detail}</span>
                </p>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

type Act = (body: Record<string, unknown>) => Promise<void>;

function Contact({ phone }: { phone: string }) {
  if (phone.includes("@")) return <a href={`mailto:${phone}`} className={`${btn} bg-surface-container text-primary`}>Email</a>;
  if (!isBdMobile(phone)) return null;
  return (
    <>
      <a href={`tel:${phone}`} className={`${btn} bg-surface-container text-primary`}>Call</a>
      <a href={waLink(phone)} target="_blank" rel="noreferrer" className={`${btn} bg-[#128c7e] text-white`}>WhatsApp</a>
    </>
  );
}

function Note({ value, label, onSave }: { value: string; label: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <span className="flex flex-1 gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Internal note" aria-label={label} className={`${input} min-w-40 flex-1`} />
      {v !== value && <button type="button" onClick={() => onSave(v)} className={`${btn} bg-secondary-container`}>Save note</button>}
    </span>
  );
}

function Institutes({ list, act }: { list: Institute[]; act: Act }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const shown = list.filter((i) => (status === "all" || i.status === status) && `${i.name} ${i.owner} ${i.phone} ${i.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email…" aria-label="Search institutes" className={`${input} min-w-56 flex-1`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className={input}>
          <option value="all">All ({list.length})</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      {shown.length === 0 && <p className="text-on-surface-variant">{list.length ? "No match." : "No sign-ups yet. Teachers appear here when they sign up at /signup."}</p>}
      {shown.map((i) => (
        <article key={i.id} className={`${card} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-lg">{i.name}</b>
            {i.firstBatch && <span className="text-sm text-on-surface-variant">· {i.firstBatch}</span>}
            <span className="ml-auto text-xs text-on-surface-variant">Joined {when(i.createdAt)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{i.owner} · {i.phone}{i.email && ` · ${i.email}`}</span>
            <Contact phone={i.phone} />
          </div>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1 font-semibold">Plan
              <select value={i.plan} onChange={(e) => act({ type: "institute", id: i.id, plan: e.target.value })} aria-label={`Plan of ${i.name}`} className={`${input} capitalize`}>
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold">Status
              <select value={i.status} onChange={(e) => {
                if (e.target.value === "suspended" && !confirm(`Suspend ${i.name}? Note: suspension is recorded here; blocking their login needs the Supabase accounts.`)) return;
                act({ type: "institute", id: i.id, status: e.target.value });
              }} aria-label={`Status of ${i.name}`} className={input}>
                <option value="trial">Trial</option>
                <option value="active">Active (paying)</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold">Trial ends
              <input type="date" value={i.trialEnds} onChange={(e) => e.target.value && act({ type: "institute", id: i.id, trialEnds: e.target.value })} aria-label={`Trial end of ${i.name}`} className={input} />
            </label>
            <Note value={i.note} label={`Note for ${i.name}`} onSave={(note) => act({ type: "institute", id: i.id, note })} />
          </div>
        </article>
      ))}
    </>
  );
}

function Announcements({ data, act }: { data: Data; act: Act }) {
  const [b, setB] = useState(data.broadcast);
  useEffect(() => setB(data.broadcast), [data.broadcast]);
  return (
    <>
      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="font-bold">Banner on every page</h2>
        <label className="flex flex-col gap-1 text-sm font-semibold">English<input value={b.en} maxLength={300} onChange={(e) => setB({ ...b, en: e.target.value })} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Bangla (optional; English is shown if empty)<input value={b.bn} maxLength={300} onChange={(e) => setB({ ...b, bn: e.target.value })} className={input} /></label>
        <label className="flex items-center gap-2 text-sm font-semibold">Style
          <select value={b.level} onChange={(e) => setB({ ...b, level: e.target.value as "info" | "warning" })} className={input}>
            <option value="info">Info (green)</option>
            <option value="warning">Warning (yellow)</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!b.en.trim()} onClick={() => act({ type: "broadcast", ...b, on: true })} className={`${btn} bg-primary text-on-primary disabled:opacity-50`}>{data.broadcast.on ? "Update banner" : "Show banner"}</button>
          {data.broadcast.on && <button type="button" onClick={() => act({ type: "broadcast", ...b, on: false })} className={`${btn} bg-surface-container`}>Hide banner</button>}
        </div>
        <p className="text-sm text-on-surface-variant">Now: {data.broadcast.on ? <b>showing</b> : "hidden"}</p>
      </section>
      <section className={`${card} flex flex-wrap items-center gap-3`}>
        <span className="flex-1">
          <h2 className="font-bold">Maintenance notice</h2>
          <span className="text-sm text-on-surface-variant">Shows a yellow “under maintenance” line on every page (in the visitor&apos;s language). The app keeps working.</span>
        </span>
        <button type="button" onClick={() => act({ type: "maintenance", on: !data.maintenance })} className={`${btn} ${data.maintenance ? "bg-error text-white" : "bg-surface-container"}`}>
          {data.maintenance ? "Turn off maintenance notice" : "Turn on maintenance notice"}
        </button>
      </section>
    </>
  );
}

function Price({ plan, value, act, label, unit = "৳ / month" }: { plan: Plan; value: number; act: Act; label?: string; unit?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); act({ type: "price", plan, amount: Number(v) }); }} className={`${card} flex flex-wrap items-center gap-3`}>
      <b className="min-w-20 capitalize">{label ?? plan}</b>
      <label className="flex items-center gap-2 text-sm">{unit}
        <input type="number" min={0} step={1} required value={v} onChange={(e) => setV(e.target.value)} aria-label={label ?? `${plan} price`} className={`${input} w-32`} />
      </label>
      {v !== String(value) && <button type="submit" className={`${btn} bg-primary text-on-primary`}>Save</button>}
    </form>
  );
}

function Sms({ data, act }: { data: Data; act: Act }) {
  const today = new Date().toISOString().slice(0, 10);
  const used = data.smsLog.filter((e) => e.at.startsWith(today) && e.status !== "failed").length;
  return (
    <>
      <div className={`${card} flex flex-col gap-1`}>
        <p className="font-bold">{data.smsLive ? "Live: SMS are really sent (SMS_API_KEY is set)." : "Test mode: SMS are only saved here, not sent."}</p>
        {!data.smsLive && <p className="text-sm text-on-surface-variant">To send for real, buy SMS credit from a provider and put SMS_API_KEY (and SMS_SENDER_ID) in .env.local, then restart.</p>}
        <p className="text-sm">Today: <b>{used}</b> of {data.smsDailyLimit} {data.flags.sms ? "" : "· switched off in Features"}</p>
      </div>
      <Price plan={"smsLimit" as Plan} value={data.smsDailyLimit} act={(b) => act({ type: "smsLimit", amount: b.amount })} label="Daily limit (whole site)" unit="SMS / day" />
      <div className={`${card} flex flex-col divide-y divide-outline-variant`}>
        {data.smsLog.length === 0 && <p className="text-on-surface-variant">No SMS yet.</p>}
        {data.smsLog.slice(0, 200).map((e, i) => (
          <p key={i} className="flex flex-wrap gap-x-3 py-2 text-sm">
            <span className="text-on-surface-variant">{when(e.at)}</span>
            <b>{e.to}</b>
            <span className={`rounded-full px-2 text-xs font-bold ${e.status === "failed" ? "bg-error text-white" : "bg-surface-container"}`}>{e.status}</span>
            <span className="min-w-0 flex-1 break-words">{e.text}</span>
          </p>
        ))}
      </div>
    </>
  );
}

type Saved = { id: number; question: string; answer: string; model: string; lang: string; hits: number; created_at: string };
/** AI answers kept for reuse: the most reused first. Read a few, delete any that are wrong or unsuitable. */
function SavedAnswers({ token }: { token: string }) {
  const [list, setList] = useState<Saved[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("Loading…");
  const load = async (search = q) => {
    const res = await fetch(`/api/platform/admin/answers?q=${encodeURIComponent(search)}`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json().catch(() => ({}));
    setList(res.ok ? d.answers : []);
    setTotal(res.ok ? d.total : 0);
    setMsg(res.ok ? "" : d.error ?? "Failed to load");
  };
  useEffect(() => void load(""), []); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (id: number) => {
    if (!window.confirm("Delete this saved answer? The next student who asks will get a fresh one.")) return;
    const res = await fetch("/api/platform/admin/answers", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) (setList((x) => x.filter((a) => a.id !== id)), setTotal((n) => n - 1));
    else setMsg("Delete failed");
  };
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <h2 className="font-bold">Saved AI answers ({total})</h2>
      <p className="text-sm text-on-surface-variant">Answers the AI gave once and that are reused when another student asks the same question. Each was checked by a second AI look before being kept. The most reused are on top: read a few now and then, and delete any that is wrong or unsuitable.</p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), void load())}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions" aria-label="Search questions" className={`${input} min-w-0 flex-1`} />
        <button type="submit" className={`${btn} bg-primary text-on-primary`}>Search</button>
      </form>
      {msg && <p role="status" className="text-sm font-semibold">{msg}</p>}
      {!msg && !list.length && <p className="text-sm text-on-surface-variant">No saved answers yet.</p>}
      {list.map((a) => (
        <details key={a.id} className="rounded-[10px] bg-surface-container px-3 py-2 text-sm">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 break-words font-bold">{a.question}</span>
            <span className="rounded-full bg-white px-2 text-xs font-bold">used {a.hits}×</span>
            <span className="text-xs text-on-surface-variant">{a.model} · {a.lang} · {new Date(a.created_at).toLocaleDateString()}</span>
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words">{a.answer}</p>
          <button type="button" onClick={() => void remove(a.id)} className={`${btn} mt-2 bg-error text-white`}>Delete this answer</button>
        </details>
      ))}
    </section>
  );
}

/** What went wrong lately on the server or in people's browsers (newest first). */
function Errors({ data }: { data: Data }) {
  const list = data.errors ?? [];
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <h2 className="font-bold">Errors ({list.length})</h2>
      <p className="text-sm text-on-surface-variant">
        {data.alertsOn ? "Alerts are ON: each new error is also sent to your chat." : "Alerts are OFF: add ALERT_WEBHOOK_URL to the server settings to get errors on your phone."} Keys, emails and phone numbers are removed before saving.
      </p>
      {!list.length && <p className="text-sm font-semibold text-primary">No errors recorded ✓</p>}
      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {list.map((e, i) => (
          <div key={i} className="rounded-[10px] bg-surface-container px-3 py-2 text-sm">
            <p className="flex flex-wrap justify-between gap-2 font-bold"><span className="break-all">{e.where}</span><span className="font-normal text-on-surface-variant">{new Date(e.at).toLocaleString()}</span></p>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">{e.message}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Turn premium (highlighted PDFs, AI help) on or off for an institute, by the code shown in its Settings. */
function PremiumInstitute({ token }: { token: string }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const set = async (premium: boolean) => {
    const res = await fetch("/api/platform/admin/premium", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ code, premium }) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? `${d.name}: premium ${d.premium ? "ON — its PDFs are being read and highlighted" : "OFF"}` : d.error ?? "Failed");
  };
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <h2 className="font-bold">Premium institutes</h2>
      <p className="text-sm text-on-surface-variant">Premium institutes get highlighted PDFs (and AI help when it is switched on). Their teachers preview the highlights; students need premium from their institute.</p>
      <div className="flex flex-wrap gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Institute code, e.g. K7QM2P" aria-label="Institute code" className={input} />
        <button type="button" disabled={code.length < 4} onClick={() => set(true)} className={`${btn} bg-primary text-on-primary disabled:opacity-50`}>Make premium</button>
        <button type="button" disabled={code.length < 4} onClick={() => set(false)} className={`${btn} bg-surface-container disabled:opacity-50`}>Remove premium</button>
      </div>
      {msg && <p role="status" className="text-sm font-semibold">{msg}</p>}
    </section>
  );
}
