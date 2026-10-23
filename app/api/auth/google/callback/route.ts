import { isOnAllowedList } from "@/lib/store";
import { authConfig, canEnter, checkGoogleClaims, cookie, OWNER_COOKIE, safeNext, sameString, signSession, STATE_COOKIE } from "@/lib/owner";

// Step 2 of Google sign-in: Google sends the owner back here with a one-time code.
// We swap the code for their identity directly with Google, check the account is an admin or on the Settings list, and set the session cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secure = url.protocol === "https:";
  const fail = (error: string) =>
    new Response(null, { status: 302, headers: { Location: `/login?error=${error}`, "Set-Cookie": cookie(STATE_COOKIE, "", 0, secure) } });

  const cfg = authConfig();
  if (!cfg) return fail("not-setup");
  if (url.searchParams.get("error")) return fail("cancelled"); // they closed Google's chooser

  const saved = /(?:^|;\s*)kt_oauth=([^;]*)/.exec(req.headers.get("cookie") ?? "")?.[1] ?? "";
  const [state, next] = saved.split(":");
  const code = url.searchParams.get("code");
  if (!code || !state || !sameString(state, url.searchParams.get("state") ?? "")) return fail("expired");

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.secret,
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    if (!res.ok || typeof data.id_token !== "string") throw new Error(`token ${res.status}`);
    // The token came straight from Google over HTTPS, so its contents can be read without re-checking the signature.
    const claims = JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64url").toString("utf8"));
    const result = checkGoogleClaims(claims, cfg);
    if ("error" in result) return fail(result.error);
    if (!(await canEnter(result.email, cfg, isOnAllowedList))) return fail("not-allowed");

    const headers = new Headers({ Location: safeNext(decodeURIComponent(next ?? "")) });
    headers.append("Set-Cookie", cookie(OWNER_COOKIE, await signSession(result.email, cfg.secret), 30 * 86_400, secure));
    headers.append("Set-Cookie", cookie(STATE_COOKIE, "", 0, secure));
    return new Response(null, { status: 302, headers });
  } catch (e) {
    console.error("google sign-in failed", e);
    return fail("google");
  }
}
