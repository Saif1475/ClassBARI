import { REAL_AUTH } from "@/lib/auth-mode";
import { loadPart, STAFF_ROLES, whoIs } from "@/lib/data-server";
import { bdMobile, checkSms, logSms } from "@/lib/platform";
import { isStaffRequest, jsonBody, updatePlatform } from "@/lib/platform-server";
import { sendSms } from "@/lib/sms-server";

/** Teacher → guardians SMS (absent notice, fee reminder). Body: { to: string[], text: string } */
export async function POST(request: Request) {
  // Demo: the role cookie is the guard, so the daily limit is what stops abuse.
  const me = REAL_AUTH ? await whoIs(request) : null;
  if (REAL_AUTH ? !me || !STAFF_ROLES.includes(me.who.role) : !(await isStaffRequest(request))) return Response.json({ error: "teachers only" }, { status: 403 });
  const body = await jsonBody(request);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  if (me) {
    // Real accounts: only to this institute's own families. Instanton Campus's SMS account must never text strangers.
    const state = await loadPart(me.institute, "students");
    const known = new Set(state.students.flatMap((s) => [s.phone, s.studentPhone ?? ""]).map(bdMobile));
    if (!Array.isArray(body.to) || body.to.some((n) => typeof n !== "string" || !bdMobile(n) || !known.has(bdMobile(n)))) return Response.json({ error: "bad recipients" }, { status: 400 });
  }

  // Check, send and log one request at a time so two teachers can't both slip under the daily limit.
  const res = await updatePlatform(async (p) => {
    const ok = checkSms(p, body.to, body.text, new Date(), me?.institute);
    if ("error" in ok) return ok;
    const status = await sendSms(ok.numbers, ok.text);
    const at = new Date().toISOString();
    logSms(p, ok.numbers.map((to) => ({ at, to, text: ok.text, status, ...(me ? { inst: me.institute } : {}) })));
    return { status, count: ok.numbers.length };
  });
  if ("error" in res) return Response.json(res, { status: res.error === "switched off" ? 403 : res.error === "daily limit reached" ? 429 : 400 });
  return Response.json(res, { status: res.status === "failed" ? 502 : 200 });
}
