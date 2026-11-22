import { aiDefaults, aiWindow, modelMenu, MODELS, PROVIDERS } from "@/lib/ai-chat";
import { modelReady, PROVIDER_KEY } from "@/lib/ai-providers";
import { spendByInstitute } from "@/lib/admin-server";
import { REAL_AUTH } from "@/lib/auth-mode";
import { admin, aiSpent } from "@/lib/data-server";
import { isAdmin, readPlatform } from "@/lib/platform-server";

export const dynamic = "force-dynamic";

/**
 * ClassBARI admin: the AI settings (what the panel changed, and the code / .env.local values used otherwise), every
 * provider and model with its on/off switch and whether its key is set, and this month's AI spending.
 * Changes go through POST /api/platform/admin { type: "ai", key, value }.
 */
export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ai = (await readPlatform()).ai;
  const packOf = Object.fromEntries(modelMenu(1500).map((m) => [m.id, m.pack])); // the smallest pack that has each model
  const since = `${aiWindow().day.slice(0, 7)}-01`;
  let spend: { total: number; byInstitute: { name: string; usd: number }[] } | null = null;
  if (REAL_AUTH) {
    const [total, by, { data: names }] = await Promise.all([aiSpent(since), spendByInstitute(since), admin().from("institutes").select("id, name, code")]);
    const name = Object.fromEntries((names ?? []).map((i) => [i.id, `${i.name} (${i.code})`]));
    spend = { total, byInstitute: Object.entries(by).map(([id, usd]) => ({ name: name[id] ?? id, usd })).sort((a, b) => b.usd - a.usd) };
  }
  return Response.json({
    settings: ai,
    defaults: aiDefaults(ai), // caps shown from the margin and rate in use
    since,
    spend,
    providers: PROVIDERS.map((id) => ({ id, key: PROVIDER_KEY[id], keySet: !!process.env[PROVIDER_KEY[id]], on: !ai.offProviders?.includes(id) })),
    models: Object.entries(MODELS).map(([id, m]) => ({ id, label: m.label, provider: m.provider, price: m.price, pack: packOf[id] ?? null, on: !ai.offModels?.includes(id), ready: modelReady(id) })),
  });
}
