import { readFile } from "node:fs/promises";
import path from "node:path";
import { APPS, appFrom } from "@/lib/apps";

/** iPhone home-screen icon: the Guardian icon on guardian.classbari.app, and so on; the Instanton Campus icon elsewhere. */
export async function GET(request: Request) {
  const app = appFrom((request.headers.get("host") ?? "").split(":")[0]);
  const name = app ? APPS[app].sub : "instanton";
  const png = await readFile(path.join(process.cwd(), "public", "apps", `${name}-ios.png`));
  return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
