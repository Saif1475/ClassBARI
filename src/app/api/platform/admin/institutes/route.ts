import { aiWindow } from "@/lib/ai-chat";
import { institutesWithStudents, spendByInstitute } from "@/lib/admin-server";
import { REAL_AUTH } from "@/lib/auth-mode";
import { isAdmin, readPlatform } from "@/lib/platform-server";
import { PLAN_STUDENT_LIMIT } from "@/lib/seat-billing";

export const dynamic = "force-dynamic";

/**
 * Instanton Campus admin: every institute with its subscription (plan, paid until), seats used of the plan's limit, premium,
 * suspended, and this month's AI money. Changes go through POST /api/platform/admin ("sub", "suspend") and the premium route.
 */
export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const [all, p, spend] = await Promise.all([institutesWithStudents(), readPlatform(), spendByInstitute(`${aiWindow().day.slice(0, 7)}-01`)]);
  return Response.json({
    institutes: all.map((i) => ({
      id: i.id, name: i.name, code: i.code, premium: i.premium, createdAt: i.created_at,
      students: i.students.length, seats: PLAN_STUDENT_LIMIT,
      plan: p.subs[i.id]?.plan ?? "free", paidUntil: p.subs[i.id]?.paidUntil ?? "",
      suspended: p.suspended.includes(i.id), aiUsd: spend[i.id] ?? 0,
    })),
  });
}
