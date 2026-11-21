import { APPS } from "@/lib/apps";

/** Web manifest for one Android app (/manifests/guardian): name, icon and colour. Bubblewrap reads it when building the app. */
export async function GET(_request: Request, ctx: { params: Promise<{ app: string }> }) {
  const sub = (await ctx.params).app;
  const app = Object.values(APPS).find((a) => a.sub === sub);
  if (!app) return new Response(null, { status: 404 });
  return Response.json(
    {
      id: `/?app=${app.sub}`,
      name: app.name,
      short_name: app.short,
      description: "Classes, fees, exams and parent updates in one app.",
      start_url: "/login",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      categories: ["education"],
      background_color: "#eef7f4",
      theme_color: app.color,
      icons: [
        { src: `/apps/${app.sub}-192.png`, sizes: "192x192", type: "image/png" },
        { src: `/apps/${app.sub}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `/apps/${app.sub}-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
