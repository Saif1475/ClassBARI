import { publicView } from "@/lib/platform";
import { readPlatform } from "@/lib/platform-server";

export const dynamic = "force-dynamic";

/** Banner, maintenance notice and feature switches for every visitor. */
export async function GET() {
  return Response.json(publicView(await readPlatform()), { headers: { "Cache-Control": "no-store" } });
}
