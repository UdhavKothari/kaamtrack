import { NextResponse, type NextRequest } from "next/server";
import { isOpenPath, OWNER_COOKIE, ownerToken, sameString } from "@/lib/owner";

// Runs before every page and API call. With OWNER_PASSCODE unset it does nothing, so the passcode is off until switched on.
// Job worker pages and Meta/cron endpoints are listed as open in lib/owner.ts.
export async function proxy(req: NextRequest) {
  const passcode = process.env.OWNER_PASSCODE;
  if (!passcode) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next();

  const cookie = req.cookies.get(OWNER_COOKIE)?.value ?? "";
  if (sameString(cookie, await ownerToken(passcode))) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
