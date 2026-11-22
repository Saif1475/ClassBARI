"use client";

import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/Brand";
import { PLANS, type Flags, type Institute, type overview, type Platform, type Plan } from "@/lib/platform";
import { isBdMobile, waLink } from "@/lib/site";
import { PACKS } from "@/lib/ai-chat";
import { packUntil } from "@/lib/pay";

// ClassBARI staff panel. Staff-only, so English only. Data: /api/platform/admin + /api/leads (ADMIN_TOKEN).
type Lead = { name: string; phone: string; size: string; at: string };
type Data = Platform & { overview: ReturnType<typeof overview>; smsLive: boolean; errors?: { at: string; where: string; message: string }[]; alertsOn?: boolean };
const TABS = ["Overview", "Payments", "Institutes", "Subscriptions", "Students", "AI control", "API keys", "Enquiries", "Support", "Announcements", "Features", "SMS", "Plans", "AI answers", "Activity"] as const;
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
          {tab === "Payments" && <Payments token={token} />}
          {tab === "Subscriptions" && <Subscriptions token={token} act={act} />}
          {tab === "Students" && <Students token={token} />}
          {tab === "AI control" && <AiControl token={token} act={act} />}
          {tab === "API keys" && <ApiKeys token={token} />}

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
type Payment = { id: string; created_at: string; institute: string; payer_email: string; payer_role: string; kind: string; item: string; student_id: number | null; months: number; amount: number; method: string; sender: string; trx_id: string; status: string; reason: string | null };
/** bKash / Nagad payments: check each TrxID in the bKash or Nagad app (amount and sender must match), then approve. */
function Payments({ token }: { token: string }) {
  const [list, setList] = useState<Payment[]>([]);
  const [msg, setMsg] = useState("Loading…");
  const load = async () => {
    const res = await fetch("/api/platform/admin/payments", { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json().catch(() => ({}));
    setList(res.ok ? d.payments : []);
    setMsg(res.ok ? "" : d.error ?? "Failed to load");
  };
  useEffect(() => void load(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (p: Payment, approve: boolean) => {
    const reason = approve ? "" : window.prompt("Why? The payer sees this. (Leave empty for: we couldn't find that transaction.)") ?? null;
    if (reason === null) return;
    if (approve && !window.confirm(`Approve ৳${p.amount} by ${p.method} from ${p.sender}, TrxID ${p.trx_id}?\nCheck it in the ${p.method} app first.`)) return;
    const res = await fetch("/api/platform/admin/payments", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, approve, reason }) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? (approve ? `Approved${d.until ? `: on until ${d.until}` : ""}` : "Rejected") : d.error ?? "Failed");
    void load();
  };
  const waiting = list.filter((p) => p.status === "pending");
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <h2 className="font-bold">Payments ({waiting.length} waiting)</h2>
      <p className="text-sm text-on-surface-variant">Open the bKash or Nagad app, find the transaction by its TrxID, and check the amount and the sender's number before approving. An approved AI pack switches on at once; an approved plan makes the institute active. The payer gets a notification either way.</p>
      {msg && <p role="status" className="text-sm font-semibold">{msg}</p>}
      {!msg && !list.length && <p className="text-sm text-on-surface-variant">No payments yet.</p>}
      {list.map((p) => (
        <article key={p.id} className={`flex flex-wrap items-center gap-3 rounded-[12px] px-4 py-3 text-sm ${p.status === "pending" ? "bg-tertiary-container" : "bg-surface-container"}`}>
          <div className="min-w-0 flex-1">
            <p className="font-bold">৳{p.amount.toLocaleString("en-IN")} · {p.method} · TrxID <span className="font-mono">{p.trx_id}</span> · from {p.sender}</p>
            <p className="text-on-surface-variant">{p.kind === "ai_pack" ? `AI pack ৳${p.item}, student #${p.student_id}` : `Plan ${p.item}`} · {p.months} month(s) · {p.payer_email} ({p.payer_role}) · {p.institute} · {new Date(p.created_at).toLocaleString()}</p>
            {p.status !== "pending" && <p className="font-semibold">{p.status}{p.reason ? `: ${p.reason}` : ""}</p>}
          </div>
          {p.status === "pending" && (
            <span className="flex gap-2">
              <button type="button" onClick={() => void decide(p, true)} className={`${btn} bg-primary text-on-primary`}>Approve</button>
              <button type="button" onClick={() => void decide(p, false)} className={`${btn} bg-white text-error`}>Reject</button>
            </span>
          )}
        </article>
      ))}
    </section>
  );
}

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

/** GET an admin route; `msg` says what went wrong (or "" when fine). */
function useAdminGet<T>(token: string, url: string) {
  const [data, setData] = useState<T | null>(null);
  const [msg, setMsg] = useState("Loading…");
  const load = useCallback(async () => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json().catch(() => ({}));
    setData(res.ok ? d : null);
    setMsg(res.ok ? "" : d.error ?? `Failed to load (${res.status})`);
  }, [token, url]);
  useEffect(() => void load(), [load]);
  return { data, msg, setMsg, load };
}
const today = () => new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10); // Dhaka date

type Sub = { id: string; name: string; code: string; premium: boolean; createdAt: string; students: number; seats: number; plan: Plan; paidUntil: string; suspended: boolean; aiUsd: number };
/** Each institute's plan, paid-until date, seats, premium and suspension. */
function Subscriptions({ token, act }: { token: string; act: Act }) {
  const { data, msg, setMsg, load } = useAdminGet<{ institutes: Sub[] }>(token, "/api/platform/admin/institutes");
  const [q, setQ] = useState("");
  const change = async (body: Record<string, unknown>) => (await act(body), void load());
  const premium = async (i: Sub, on: boolean) => {
    const res = await fetch("/api/platform/admin/premium", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ code: i.code, premium: on }) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? "" : d.error ?? "Failed");
    void load();
  };
  const list = (data?.institutes ?? []).filter((i) => `${i.name} ${i.code}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <p className="text-sm text-on-surface-variant">Every institute with a real account. Seats: students now / the plan&apos;s limit. A suspended institute can still sign in and look, but no change is saved and they see a message saying so.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code…" aria-label="Search institutes" className={`${input} min-w-56`} />
      {msg && <p role="status" className="text-sm font-semibold">{msg}</p>}
      {data && !list.length && <p className="text-on-surface-variant">No institutes.</p>}
      {list.map((i) => (
        <article key={i.id} className={`${card} flex flex-col gap-3 ${i.suspended ? "ring-2 ring-error" : ""}`}>
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-lg">{i.name}</b>
            <span className="rounded-full bg-surface-container px-2 font-mono text-xs">{i.code}</span>
            {i.suspended && <span className="rounded-full bg-error px-2 text-xs font-bold text-white">Suspended</span>}
            <span className="ml-auto text-xs text-on-surface-variant">Since {when(i.createdAt)}</span>
          </div>
          <p className="text-sm">Seats <b className={i.students > i.seats ? "text-error" : ""}>{i.students} / {i.seats}</b> · AI this month <b>${i.aiUsd.toFixed(2)}</b></p>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1 font-semibold">Plan
              <select value={i.plan} onChange={(e) => change({ type: "sub", id: i.id, name: i.name, plan: e.target.value })} aria-label={`Plan of ${i.name}`} className={`${input} capitalize`}>
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold">Paid until
              <input type="date" value={i.paidUntil} onChange={(e) => change({ type: "sub", id: i.id, name: i.name, paidUntil: e.target.value })} aria-label={`Paid until for ${i.name}`} className={input} />
            </label>
            <button type="button" onClick={() => premium(i, !i.premium)} className={`${btn} ${i.premium ? "bg-primary text-on-primary" : "bg-surface-container"}`}>{i.premium ? "Premium ON (turn off)" : "Make premium"}</button>
            <button type="button" onClick={() => (i.suspended || confirm(`Suspend ${i.name}? Nobody there can save changes until you unsuspend it.`)) && change({ type: "suspend", id: i.id, name: i.name, on: !i.suspended })} className={`${btn} ${i.suspended ? "bg-primary text-on-primary" : "bg-error text-white"}`}>
              {i.suspended ? "Unsuspend" : "Suspend"}
            </button>
          </div>
        </article>
      ))}
    </>
  );
}

type StudentRow = { institute: string; instituteName: string; code: string; id: number; name: string; email: string; batch: string; pack: number | null; until: string | null; paid: boolean; tokens: number; costUsd: number; questions: number; limit: number };
/** Students of every institute: their AI pack, and this 12-hour window's use. */
function Students({ token }: { token: string }) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const { data, msg, setMsg, load } = useAdminGet<{ total: number; resetsAt: string; students: StudentRow[] }>(token, `/api/platform/admin/students?q=${encodeURIComponent(search)}`);
  const send = async (body: Record<string, unknown>, done: string) => {
    const res = await fetch("/api/platform/admin/students", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    await load();
    setMsg(res.ok ? done : d.error ?? "Failed");
  };
  return (
    <>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), setSearch(q))}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, institute or code" aria-label="Search students" className={`${input} min-w-0 flex-1`} />
        <button type="submit" className={`${btn} bg-primary text-on-primary`}>Search</button>
      </form>
      {msg && <p role="status" className="text-sm font-semibold">{msg}</p>}
      {data && <p className="text-sm text-on-surface-variant">{data.total} found{data.total > data.students.length ? `, first ${data.students.length} shown` : ""}. This AI window refills {when(data.resetsAt)}.</p>}
      {data?.students.map((s) => <StudentCard key={`${s.institute}:${s.id}`} s={s} send={send} />)}
    </>
  );
}

function StudentCard({ s, send }: { s: StudentRow; send: (body: Record<string, unknown>, done: string) => Promise<void> }) {
  const [pack, setPack] = useState(String(s.pack ?? 150));
  const [until, setUntil] = useState(s.until && s.until >= today() ? s.until : packUntil(undefined, today(), 1));
  const who = { institute: s.institute, id: s.id };
  return (
    <article className={`${card} flex flex-col gap-2 text-sm`}>
      <p className="flex flex-wrap items-center gap-2">
        <b className="text-base">{s.name}</b>
        <span className="text-on-surface-variant">{s.email} · {s.batch} · {s.instituteName} ({s.code})</span>
      </p>
      <p>
        AI: {s.paid ? <b>pack ৳{s.pack ?? 150} until {s.until}</b> : <b>free{s.until ? ` (pack ended ${s.until})` : ""}</b>} · this window {s.tokens.toLocaleString()} of {s.limit.toLocaleString()} tokens, ${s.costUsd.toFixed(4)}, {s.questions} questions
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 font-semibold">Pack
          <select value={pack} onChange={(e) => setPack(e.target.value)} aria-label={`Pack for ${s.name}`} className={input}>
            {PACKS.map((p) => <option key={p} value={p}>৳{p}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold">Until
          <input type="date" value={until} min={today()} onChange={(e) => setUntil(e.target.value)} aria-label={`Pack end for ${s.name}`} className={input} />
        </label>
        <button type="button" onClick={() => setUntil(packUntil(until, today(), 1))} className={`${btn} bg-surface-container`}>+1 month</button>
        <button type="button" onClick={() => confirm(`Give ${s.name} the ৳${pack} pack until ${until}? (No payment is recorded.)`) && send({ ...who, action: "pack", pack: Number(pack), until }, "Pack saved")} className={`${btn} bg-primary text-on-primary`}>{s.paid ? "Save pack" : "Give pack"}</button>
        {s.paid && <button type="button" onClick={() => confirm(`Stop ${s.name}'s AI pack now?`) && send({ ...who, action: "stop" }, "Pack stopped")} className={`${btn} bg-error text-white`}>Stop pack</button>}
        <button type="button" onClick={() => confirm(`Reset ${s.name}'s AI use for this 12-hour window? (It still counts in the month's spending.)`) && send({ ...who, action: "reset" }, "AI window reset")} className={`${btn} bg-surface-container`}>Reset AI window</button>
      </div>
    </article>
  );
}

type AiData = {
  settings: { budgetUsd?: number; freeOn?: boolean; freeDaily?: number; freeWindowUsd?: number; packMonthlyUsd?: Record<string, number>; packDaily?: Record<string, number> };
  defaults: { budgetUsd: number; freeOn: boolean; freeDaily: number; freeWindowUsd: number; packMonthlyUsd: Record<string, number>; packDaily: Record<string, number> };
  since: string;
  spend: { total: number; byInstitute: { name: string; usd: number }[] } | null;
  providers: { id: string; key: string; keySet: boolean; on: boolean }[];
  models: { id: string; label: string; provider: string; price: [number, number, number]; pack: number | null; on: boolean; ready: boolean }[];
};
/** AI switches, limits and budget. A blank box means the value from the code / .env.local (shown as the placeholder). */
function AiControl({ token, act }: { token: string; act: Act }) {
  const { data, msg, load } = useAdminGet<AiData>(token, "/api/platform/admin/ai");
  if (!data) return <p role="status" className="text-sm font-semibold">{msg}</p>;
  const set = async (body: Record<string, unknown>) => (await act({ type: "ai", ...body }), void load());
  const { settings: s, defaults: d } = data;
  const swatch = (on: boolean, change: (on: boolean) => void, label: string) => (
    <label className="flex items-center gap-2 text-sm font-bold">
      <input type="checkbox" role="switch" checked={on} onChange={(e) => change(e.target.checked)} aria-label={label} className="h-5 w-5 accent-[var(--color-primary)]" />
      <span className={on ? "text-primary" : "text-error"}>{on ? "On" : "Off"}</span>
    </label>
  );
  return (
    <>
      <section className={`${card} flex flex-col gap-2`}>
        <h2 className="font-bold">This month&apos;s AI spending (since {data.since})</h2>
        {data.spend ? (
          <>
            <p className="text-2xl font-bold">${data.spend.total.toFixed(2)} <span className="text-sm font-normal text-on-surface-variant">of ${(s.budgetUsd ?? d.budgetUsd).toFixed(2)} budget</span></p>
            {data.spend.byInstitute.slice(0, 20).map((x) => <p key={x.name} className="flex justify-between text-sm"><span>{x.name}</span><b>${x.usd.toFixed(3)}</b></p>)}
            <p className="text-xs text-on-surface-variant">Spending is not recorded per model (the server log has a line for each answer).</p>
          </>
        ) : <p className="text-sm text-on-surface-variant">Only with real accounts (Supabase).</p>}
      </section>
      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="font-bold">Limits</h2>
        <p className="text-sm text-on-surface-variant">Empty box: the value from the code or .env.local (shown greyed). Save with Enter; clear the box and save to go back to it.</p>
        <Setting label="Monthly AI budget (US$, whole site)" value={s.budgetUsd} def={d.budgetUsd} step="0.01" onSave={(v) => set({ key: "budgetUsd", value: v })} />
        <div className="flex flex-wrap items-center gap-3"><b className="text-sm">Free plan (students without a pack)</b>{swatch(s.freeOn ?? d.freeOn, (on) => set({ key: "freeOn", value: on }), "Free plan")}</div>
        <Setting label="Free plan: tokens a day (half per 12-hour window)" value={s.freeDaily} def={d.freeDaily} onSave={(v) => set({ key: "freeDaily", value: v })} />
        <Setting label="Free plan: most money per 12-hour window (US$)" value={s.freeWindowUsd} def={d.freeWindowUsd} step="0.0001" onSave={(v) => set({ key: "freeWindowUsd", value: v })} />
        {PACKS.map((p) => <Setting key={p} label={`Pack ৳${p}: tokens a day`} value={s.packDaily?.[p]} def={d.packDaily[p]} onSave={(v) => set({ key: "packDaily", pack: p, value: v })} />)}
        {PACKS.map((p) => <Setting key={`cap${p}`} label={`Pack ৳${p}: AI money cap per student per month (US$)`} value={s.packMonthlyUsd?.[p]} def={d.packMonthlyUsd[p]} step="0.1" onSave={(v) => set({ key: "packMonthlyUsd", pack: p, value: v })} />)}
      </section>
      <section className={`${card} flex flex-col gap-2`}>
        <h2 className="font-bold">Providers</h2>
        {data.providers.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
            <b className="w-24 capitalize">{p.id}</b>
            <span className={p.keySet ? "text-primary" : "text-error"}>{p.key} {p.keySet ? "set" : "missing"}</span>
            <span className="ml-auto">{swatch(p.on, (on) => set({ key: "provider", id: p.id, value: on }), `Provider ${p.id}`)}</span>
          </div>
        ))}
      </section>
      <section className={`${card} flex flex-col gap-2`}>
        <h2 className="font-bold">Models</h2>
        <p className="text-sm text-on-surface-variant">A model switched off (or whose provider is off) is hidden from students&apos; pickers and never used by the chat.</p>
        {data.models.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="min-w-48 flex-1"><b>{m.label}</b> <span className="font-mono text-xs text-on-surface-variant">{m.id}</span></span>
            <span className="text-on-surface-variant">{m.pack === null ? "staff only" : m.pack ? `from ৳${m.pack}` : "free"} · ${m.price[0]}/${m.price[1]} per M</span>
            {!m.ready && <span className="text-xs font-bold text-error">no key</span>}
            {swatch(m.on, (on) => set({ key: "model", id: m.id, value: on }), `Model ${m.label}`)}
          </div>
        ))}
      </section>
    </>
  );
}

function Setting({ label, value, def, step = "1", onSave }: { label: string; value: number | undefined; def: number; step?: string; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(value === undefined ? "" : String(value));
  useEffect(() => setV(value === undefined ? "" : String(value)), [value]);
  const changed = v !== (value === undefined ? "" : String(value));
  return (
    <form onSubmit={(e) => (e.preventDefault(), onSave(v.trim() === "" ? null : Number(v)))} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-48 flex-1">{label}</span>
      <input type="number" min={0} step={step} value={v} placeholder={String(def)} onChange={(e) => setV(e.target.value)} aria-label={label} className={`${input} w-36`} />
      {changed && <button type="submit" className={`${btn} bg-primary text-on-primary`}>Save</button>}
    </form>
  );
}

type KeyRow = { group: string; name: string; secret: boolean; set: boolean; check?: string };
/** Which server settings are set in .env.local. Values never leave the server; change them in .env.local and restart. */
function ApiKeys({ token }: { token: string }) {
  const { data, msg } = useAdminGet<{ keys: KeyRow[] }>(token, "/api/platform/admin/keys");
  const [checked, setChecked] = useState<Record<string, string>>({});
  const check = async (provider: string) => {
    setChecked((c) => ({ ...c, [provider]: "Checking…" }));
    const res = await fetch("/api/platform/admin/keys", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ provider }) });
    const d = await res.json().catch(() => ({}));
    setChecked((c) => ({ ...c, [provider]: d.ok ? "Works ✓" : `Not working (${d.status ?? d.error ?? res.status})` }));
  };
  return (
    <>
      <p className="text-sm text-on-surface-variant">Keys live only in .env.local on the server. This page shows whether each is set, never its value. To change one, edit .env.local and restart the server. &quot;Check&quot; asks the provider&apos;s free model list (no AI answer is paid for).</p>
      {msg && <p role="status" className="text-sm font-semibold">{msg}</p>}
      {[...new Set(data?.keys.map((k) => k.group))].map((g) => (
        <section key={g} className={`${card} flex flex-col gap-2`}>
          <h2 className="font-bold">{g}</h2>
          {data!.keys.filter((k) => k.group === g).map((k) => (
            <div key={k.name} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="min-w-56 flex-1 break-all font-mono">{k.name}</span>
              {k.secret && <span className="rounded-full bg-surface-container px-2 text-xs font-bold">secret</span>}
              <b className={k.set ? "text-primary" : "text-on-surface-variant"}>{k.set ? "Set" : "Not set"}</b>
              {k.check && k.set && <button type="button" onClick={() => void check(k.check!)} className={`${btn} bg-surface-container text-primary`}>Check</button>}
              {k.check && checked[k.check] && <span className="font-semibold">{checked[k.check]}</span>}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
