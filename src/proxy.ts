import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canOpen } from "@/lib/access";
import { REAL_AUTH } from "@/lib/auth-mode";
import { crossSite } from "@/lib/same-site";

// Demo guard: the role chosen at /login is kept in a cookie (anyone can set it — demo only).
const demoAllowed: Record<string, string[]> = {
  institute: ["institute"],
  teacher: ["teacher", "institute"], // institute owners can also preview the instructor view
  student: ["student", "teacher", "institute"], // teachers & institute can preview student view
  parent: ["parent", "institute"],
  settings: ["student", "teacher", "institute", "parent"],
};

const toLogin = (request: NextRequest, error?: string) => {
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  if (error) login.searchParams.set("error", error);
  return NextResponse.redirect(login);
};

export async function proxy(request: NextRequest) {
  const area = request.nextUrl.pathname.split("/")[1];
  if (area === "api") {
    // So another website can never act as a signed-in person.
    return crossSite(request) ? NextResponse.json({ error: "cross-site request" }, { status: 403 }) : NextResponse.next();
  }
  if (!REAL_AUTH) {
    const role = request.cookies.get("edunest-role")?.value ?? "";
    return demoAllowed[area]?.includes(role) ? NextResponse.next() : toLogin(request);
  }

  // Real accounts: refresh the Supabase session cookie, then ask the database what this person may open.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return toLogin(request);
  const { data } = await supabase.rpc("my_access");
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  return canOpen(area, roles) ? response : toLogin(request, "no-access");
}

// /api/data is left out: the proxy holds a whole body in memory (cut at 10 MiB) before any route code runs, and a restore
// is bigger. The route checks the origin itself and reads with a cap that only owners and managers get past.
export const config = {
  matcher: ["/institute/:path*", "/teacher/:path*", "/student/:path*", "/parent/:path*", "/settings", "/api/((?!data$).*)"],
};
