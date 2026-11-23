import { PROVIDERS } from "@/lib/ai-chat";
import { checkProvider } from "@/lib/ai-providers";
import { isAdmin, jsonBody } from "@/lib/platform-server";

export const dynamic = "force-dynamic";

// Every setting the server reads from .env.local. secret: must never be shared. Only "set or missing" leaves the server.
// Keep in step with the code: `grep -rhoE "process\.env\.[A-Z0-9_]+" src`.
const KEYS: { group: string; name: string; secret: boolean; check?: (typeof PROVIDERS)[number] }[] = [
  { group: "AI", name: "ANTHROPIC_API_KEY", secret: true, check: "anthropic" },
  { group: "AI", name: "GEMINI_API_KEY", secret: true, check: "google" },
  { group: "AI", name: "DASHSCOPE_API_KEY", secret: true, check: "qwen" },
  { group: "AI", name: "OPENAI_API_KEY", secret: true, check: "openai" },
  { group: "AI", name: "OPENROUTER_API_KEY", secret: true, check: "openrouter" },
  ...["GEMINI_BASE_URL", "DASHSCOPE_BASE_URL", "OPENAI_BASE_URL", "AI_CHAT_MODEL", "AI_PDF_MODEL", "AI_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD", "AI_FREE_WINDOW_USD", "USD_TO_BDT", "AI_CACHE_SIMILARITY", "AI_CACHE_TIMEOUT_MS", "OCR_SERVICE_URL", "IMAGE_FLAG_AT", "IMAGE_CHECK_TIMEOUT_MS"].map((name) => ({ group: "AI", name, secret: false })),
  { group: "Database", name: "NEXT_PUBLIC_SUPABASE_URL", secret: false },
  { group: "Database", name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", secret: false },
  { group: "Database", name: "SUPABASE_SERVICE_ROLE_KEY", secret: true },
  { group: "Database", name: "NEXT_PUBLIC_AUTH_MODE", secret: false },
  { group: "Database", name: "PLATFORM_FILE", secret: false },
  { group: "Notifications", name: "FIREBASE_SERVICE_ACCOUNT", secret: true }, // a file path; the file itself is the secret
  { group: "Notifications", name: "VAPID_PUBLIC_KEY", secret: false },
  { group: "Notifications", name: "VAPID_PRIVATE_KEY", secret: true },
  { group: "Notifications", name: "NOTIFY_TIMER", secret: false },
  { group: "SMS", name: "SMS_API_KEY", secret: true },
  { group: "SMS", name: "SMS_API_URL", secret: false },
  { group: "SMS", name: "SMS_SENDER_ID", secret: false },
  { group: "Payments", name: "PAY_BKASH_NUMBER", secret: false },
  { group: "Payments", name: "PAY_NAGAD_NUMBER", secret: false },
  { group: "Server", name: "ADMIN_TOKEN", secret: true },
  { group: "Server", name: "CRON_SECRET", secret: true },
  { group: "Server", name: "ALERT_WEBHOOK_URL", secret: true },
  { group: "Server", name: "LEADS_WEBHOOK_URL", secret: true },
  { group: "Server", name: "RATE_LIMIT_OFF", secret: false },
  { group: "Server", name: "BEHIND_CLOUDFLARE", secret: false },
  { group: "Website", name: "NEXT_PUBLIC_SITE_URL", secret: false },
  { group: "Website", name: "NEXT_PUBLIC_JITSI_DOMAIN", secret: false },
  { group: "Website", name: "NEXT_PUBLIC_WHATSAPP_NUMBER", secret: false },
  { group: "Website", name: "NEXT_PUBLIC_CONTACT_EMAIL", secret: false },
  ...["STUDENT", "TEACHER", "INSTITUTE", "GUARDIAN"].map((a) => ({ group: "Android apps", name: `ANDROID_SHA256_${a}`, secret: false })),
];

/** Instanton Campus admin: each setting's name and whether it is set. Never a value. */
export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ keys: KEYS.map((k) => ({ ...k, set: !!process.env[k.name]?.trim() })) });
}

/** Check an AI provider's key with its free "list models" endpoint: { provider } → { ok, status }. */
export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const p = (await jsonBody(request))?.provider;
  if (!PROVIDERS.includes(p as (typeof PROVIDERS)[number])) return Response.json({ error: "bad provider" }, { status: 400 });
  return Response.json(await checkProvider(p as (typeof PROVIDERS)[number]));
}
