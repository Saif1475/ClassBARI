import { aiWindow, freePlan, packPlan, PACKS, previousWindow, windowTokens } from "@/lib/ai-chat";
import { institutesWithStudents } from "@/lib/admin-server";
import { REAL_AUTH } from "@/lib/auth-mode";
import { act, admin } from "@/lib/data-server";
import { dayKey } from "@/lib/dates";
import { isAdmin, jsonBody, readPlatform, updatePlatform } from "@/lib/platform-server";

export const dynamic = "force-dynamic";

const userKey = (institute: string, id: number) => `${institute}:student:${id}`;

/** ClassBARI admin: students of every institute matching ?q= (name, email, institute name or code), with their AI pack and this 12-hour window's use. */
export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const all = await institutesWithStudents();
  const found = all
    .flatMap((i) => i.students.map((s) => ({ i, s })))
    .filter(({ i, s }) => !q || `${s.name} ${s.email ?? ""} ${i.name} ${i.code}`.toLowerCase().includes(q));
  const shown = found.slice(0, 100);
  const w = aiWindow();
  const { data: use } = shown.length
    ? await admin().from("ai_usage").select("user_key, tokens, cost_usd, questions").eq("day", w.day).eq("slot", w.slot).in("user_key", shown.map(({ i, s }) => userKey(i.id, s.id)))
    : { data: [] };
  const used = new Map((use ?? []).map((u) => [u.user_key as string, u]));
  const ai = (await readPlatform()).ai;
  const today = dayKey();
  return Response.json({
    total: found.length,
    resetsAt: w.resetsAt,
    students: shown.map(({ i, s }) => {
      const paid = !!s.premiumUntil && s.premiumUntil >= today;
      const u = used.get(userKey(i.id, s.id));
      return {
        institute: i.id, instituteName: i.name, code: i.code, id: s.id, name: s.name, email: s.email ?? "", batch: s.batch,
        pack: s.aiPack ?? null, until: s.premiumUntil ?? null, paid,
        tokens: Number(u?.tokens ?? 0), costUsd: Number(u?.cost_usd ?? 0), questions: Number(u?.questions ?? 0),
        limit: windowTokens((paid ? packPlan(s.aiPack, ai) : freePlan(ai)).daily),
      };
    }),
  });
}

/**
 * Change one student's AI: { institute, id, action: "pack", pack, until } gives, extends or changes a pack;
 * "stop" ends it now; "reset" frees this 12-hour window (its use stays counted in the month's spending).
 */
export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const b = await jsonBody(request);
  const institute = typeof b?.institute === "string" && /^[0-9a-f-]{36}$/.test(b.institute) ? b.institute : "";
  const id = Number(b?.id);
  if (!b || !institute || !Number.isSafeInteger(id)) return Response.json({ error: "bad request" }, { status: 400 });
  const log = (detail: string) => updatePlatform((p) => void (p.audit.unshift({ at: new Date().toISOString(), action: "student AI", detail }), (p.audit.length = Math.min(p.audit.length, 500))));

  if (b.action === "reset") {
    // The rows are moved aside, not zeroed: the money was really spent and still counts for the monthly budget.
    const db = admin();
    const w = aiWindow();
    const stamp = Date.now();
    for (const x of [w, previousWindow(w)]) {
      const { error } = await db.from("ai_usage").update({ user_key: `${userKey(institute, id)}#reset-${stamp}` }).eq("user_key", userKey(institute, id)).eq("day", x.day).eq("slot", x.slot);
      if (error) return Response.json({ error: "reset failed" }, { status: 503 });
    }
    await log(`${institute} student #${id}: AI window reset`);
    return Response.json({ ok: true });
  }

  const stop = b.action === "stop";
  const pack = Number(b.pack);
  const until = String(b.until ?? "");
  if (!stop && (b.action !== "pack" || !(PACKS as readonly number[]).includes(pack) || !/^\d{4}-\d{2}-\d{2}$/.test(until))) return Response.json({ error: "Give a pack and an until date" }, { status: 400 });
  // The same change an owner makes in Settings, done as the institute's owner "ClassBARI" (like an approved payment).
  const system = { institute, who: { role: "owner" as const, name: "ClassBARI", studentIds: [] } };
  let name: string | null = null;
  await act(system, "setStudentPremium", [], Date.now(), (s) => {
    const st = s.students.find((x) => x.id === id);
    if (!st) return null;
    name = st.name || "student";
    return stop ? [id, null] : [id, until, pack];
  });
  if (name === null) return Response.json({ error: "student not found" }, { status: 404 });
  await log(`${name} (#${id}, ${institute}): ${stop ? "pack stopped" : `pack ৳${pack} until ${until}`}`);
  return Response.json({ ok: true });
}
