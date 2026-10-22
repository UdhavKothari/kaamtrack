import { clientIp, OWNER_COOKIE, ownerToken, sameString } from "@/lib/owner";
import { rateLimited } from "@/lib/store";

// Owner sign-in: one shared passcode (OWNER_PASSCODE). Ten wrong tries per 15 minutes per address, then it waits.
export async function POST(req: Request) {
  const expected = process.env.OWNER_PASSCODE;
  if (!expected) return Response.json({ ok: true }); // passcode is off; nothing to sign in to

  try {
    if (await rateLimited(`login:${clientIp(req)}`, 10, 15 * 60)) {
      return Response.json({ error: "Too many tries. Wait a few minutes." }, { status: 429 });
    }
  } catch (e) {
    console.error("rate limit check failed", e); // don't lock the owner out because Redis hiccuped
  }

  const { passcode } = (await req.json().catch(() => ({}))) as { passcode?: string };
  if (typeof passcode !== "string" || !sameString(passcode, expected)) {
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }

  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${OWNER_COOKIE}=${await ownerToken(expected)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
  return res;
}
