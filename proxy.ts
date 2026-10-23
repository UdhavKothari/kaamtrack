import { NextResponse, type NextRequest } from "next/server";
import { authConfig, canEnter, isOpenPath, OWNER_COOKIE, readSession } from "@/lib/owner";
import { isOnAllowedList } from "@/lib/store";

// Runs before every page and API call. The owner side needs a Google sign-in from an admin (OWNER_EMAILS)
// or from an account an admin added on the Settings page. Job worker pages and Meta/cron endpoints are open (lib/owner.ts).

// ponytail: per-instance memory of who was allowed in the last minute, so the board's 10 s refresh doesn't read Redis
// every time. Removing someone takes effect within a minute; use a shared cache if that ever needs to be instant.
const recent = new Map<string, number>();
async function onList(email: string) {
  if ((recent.get(email) ?? 0) > Date.now()) return true;
  try {
    const ok = await isOnAllowedList(email);
    if (ok) recent.set(email, Date.now() + 60_000);
    return ok;
  } catch (e) {
    console.error("allow-list check failed", e); // Redis down: keep non-admins out rather than guess
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next();

  const cfg = authConfig();
  if (!cfg) {
    // Not set up: open for local development, but never on the live site.
    if (process.env.VERCEL_ENV !== "production") return NextResponse.next();
    return NextResponse.json({ error: "Sign-in is not set up. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and OWNER_EMAILS." }, { status: 503 });
  }

  const email = await readSession(req.cookies.get(OWNER_COOKIE)?.value, cfg);
  if (await canEnter(email, cfg, onList)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = email ? "?error=not-allowed" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
