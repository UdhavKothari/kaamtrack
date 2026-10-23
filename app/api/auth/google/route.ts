import { authConfig, cookie, safeNext, STATE_COOKIE } from "@/lib/owner";

// Step 1 of Google sign-in: send the owner to Google's account chooser.
// A random "state" is kept in a short-lived cookie so the reply can't be forged by another site.
export async function GET(req: Request) {
  const cfg = authConfig();
  const url = new URL(req.url);
  if (!cfg) return Response.redirect(new URL("/login?error=not-setup", url), 302);

  const state = crypto.randomUUID().replace(/-/g, "");
  const next = safeNext(url.searchParams.get("next"));
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `${url.origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  }).toString();

  return new Response(null, {
    status: 302,
    headers: { Location: google.toString(), "Set-Cookie": cookie(STATE_COOKIE, `${state}:${encodeURIComponent(next)}`, 600, url.protocol === "https:") },
  });
}
