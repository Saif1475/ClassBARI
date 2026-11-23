import { APPS } from "@/lib/apps";

/**
 * /.well-known/assetlinks.json: tells Android that the three Instanton Campus apps may open this site full-screen
 * (without it they show a browser address bar). Each app's signing fingerprint comes from Play Console →
 * Test and release → App integrity → App signing, put in .env.local as e.g.
 *   ANDROID_SHA256_STUDENT=AB:CD:…   ANDROID_SHA256_TEACHER=…   ANDROID_SHA256_GUARDIAN=…
 * (several fingerprints for one app: separate with commas — e.g. your upload key and Google's key).
 */
export function GET() {
  const list = Object.values(APPS).flatMap((app) => {
    const prints = (process.env[`ANDROID_SHA256_${app.sub.toUpperCase()}`] || "").split(",").map((s) => s.trim()).filter(Boolean);
    return prints.length
      ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: app.pkg, sha256_cert_fingerprints: prints } }]
      : [];
  });
  return Response.json(list, { headers: { "Cache-Control": "public, max-age=3600" } });
}
