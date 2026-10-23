import { cookie, OWNER_COOKIE } from "@/lib/owner";

// Sign out: clear the session cookie and go back to the sign-in page.
export async function POST(req: Request) {
  const secure = new URL(req.url).protocol === "https:";
  return new Response(null, { status: 303, headers: { Location: "/login", "Set-Cookie": cookie(OWNER_COOKIE, "", 0, secure) } });
}
