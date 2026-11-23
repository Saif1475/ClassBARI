// Server only: what the ClassBARI admin panel reads across every institute (real accounts).
import { admin } from "./data-server";
import type { LmsState } from "./lms-actions";

/** Every row of a query, 1000 at a time (the API's page size). */
export async function every<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return out;
  }
}

export type InstituteRow = { id: string; name: string; code: string; premium: boolean; created_at: string; students: LmsState["students"] };

/**
 * Every institute with its student list. shortcut: reads every institute's students on each call; fine for a few
 * hundred institutes, move the search into the database (a view over institute_data) when it gets slow.
 */
export async function institutesWithStudents(): Promise<InstituteRow[]> {
  const db = admin();
  const [insts, docs] = await Promise.all([
    every<{ id: string; name: string; code: string; premium: boolean; created_at: string }>((a, b) => db.from("institutes").select("id, name, code, premium, created_at").order("created_at").range(a, b)),
    every<{ institute_id: string; students: unknown }>((a, b) => db.from("institute_data").select("institute_id, students:state->students").order("institute_id").range(a, b)),
  ]);
  const byId = new Map(docs.map((d) => [d.institute_id, Array.isArray(d.students) ? (d.students as LmsState["students"]) : []]));
  return insts.map((i) => ({ ...i, students: byId.get(i.id) ?? [] }));
}

/** AI money used since a day, by institute (from ai_usage; the chats, Ask AI and PDF highlighting all count there). */
export async function spendByInstitute(since: string) {
  const db = admin();
  const rows = await every<{ institute_id: string; cost_usd: number | string }>((a, b) => db.from("ai_usage").select("institute_id, cost_usd").gte("day", since).order("user_key").order("day").order("slot").range(a, b));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.institute_id] = (out[r.institute_id] ?? 0) + Number(r.cost_usd);
  return out;
}
