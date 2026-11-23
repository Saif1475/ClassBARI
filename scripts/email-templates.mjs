// Uploads the Instanton Campus email templates (supabase/email-templates/*.html) to a Supabase project's Auth settings.
//   node scripts/email-templates.mjs main     (or: test)
// Needs SUPABASE_ACCESS_TOKEN (Supabase → Account → Access Tokens) in .env.local. Changes ONLY the three
// templates and their subjects. Never prints the token.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const target = process.argv[2];
const url = env[target === "test" ? "TEST_SUPABASE_URL" : target === "main" ? "NEXT_PUBLIC_SUPABASE_URL" : ""];
if (!url) {
  console.error("Say which project: node scripts/email-templates.mjs main   (or test)");
  process.exit(1);
}
const token = env.SUPABASE_ACCESS_TOKEN;
if (!token?.startsWith("sbp_")) {
  console.error("Add SUPABASE_ACCESS_TOKEN=sbp_… to .env.local first (Supabase → Account → Access Tokens).");
  process.exit(1);
}
const ref = new URL(url).hostname.split(".")[0];
const t = (f) => readFileSync(`supabase/email-templates/${f}`, "utf8");
const body = {
  mailer_subjects_confirmation: "Confirm your Instanton Campus email · ইমেইল নিশ্চিত করুন",
  mailer_templates_confirmation_content: t("confirm-signup.html"),
  mailer_subjects_recovery: "Set a new Instanton Campus password · নতুন পাসওয়ার্ড দিন",
  mailer_templates_recovery_content: t("reset-password.html"),
  mailer_subjects_email_change: "Confirm your new email · নতুন ইমেইল নিশ্চিত করুন",
  mailer_templates_email_change_content: t("change-email.html"),
};
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`✗ Supabase said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const saved = await res.json();
const ok = Object.keys(body).every((k) => saved[k] === body[k]);
console.log(ok ? `✓ ${target} project: 3 email templates and subjects saved` : "Saved, but Supabase returned different values — check the Templates page.");
