// Server only: who may use the student AI (the chat and its Highlight tool), with their plan as the admin panel set it.
import { freePlan, packPlan } from "./ai-chat";
import { modelReady } from "./ai-providers";
import { REAL_AUTH } from "./auth-mode";
import { loadPart, whoIs } from "./data-server";
import { dayKey } from "./dates";
import { readPlatform } from "./platform-server";

/** The signed-in student and their pack, or the answer that says why not. */
export async function gate(request: Request) {
  if (!REAL_AUTH) return { error: Response.json({ error: "demo mode" }, { status: 404 }) };
  const me = await whoIs(request);
  if (!me) return { error: Response.json({ error: "sign in" }, { status: 401 }) };
  if (me.who.role !== "student") return { error: Response.json({ locked: "students" }, { status: 403 }) };
  const { students } = await loadPart(me.institute, "students"); // only the student list, not the whole institute
  const student = students.find((s) => s.id === me.who.studentIds[0]);
  if (!student) return { error: Response.json({ error: "sign in" }, { status: 401 }) };
  const paid = !!student.premiumUntil && student.premiumUntil >= dayKey();
  const ai = (await readPlatform()).ai; // models, providers and limits as set in the admin panel
  const plan = paid ? packPlan(student.aiPack, ai) : freePlan(ai); // no pack (or it ended): the free plan
  return { me, student, plan, ai, models: plan.models.filter(modelReady) };
}

