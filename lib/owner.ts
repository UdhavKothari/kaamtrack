// Owner sign-in with Google. Web Crypto only, because proxy.ts may run outside Node.
// Who gets in: the admins in OWNER_EMAILS, plus the accounts an admin adds on the Settings page. All share the one board.
export const OWNER_COOKIE = "kt_owner";
export const STATE_COOKIE = "kt_oauth";
export const SESSION_DAYS = 30;

// Pages and APIs that stay open with no sign-in:
//  - the job worker's link page and its status and note APIs (one lot, by its secret token)
//  - Meta's webhook (checks its own signature) and the daily cron (checks its own secret)
//  - the sign-in page and the Google sign-in steps themselves
const OPEN = [
  /^\/s\/[^/]+$/, /^\/api\/lots\/[0-9a-f]{16}(\/note)?$/, /^\/api\/whatsapp\/webhook$/, /^\/api\/cron\/[^/]+$/,
  /^\/login$/, /^\/api\/auth\/(google|google\/callback|logout)$/,
];
export const isOpenPath = (pathname: string) => OPEN.some((re) => re.test(pathname));

export type AuthConfig = { clientId: string; secret: string; emails: string[] };

// Sign-in is on only when all three settings exist. The session key is the Google client secret, so there is
// no extra secret to manage. ponytail: rotating the client secret signs everyone out; add SESSION_SECRET if that bites.
export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const secret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const emails = (env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return clientId && secret && emails.length ? { clientId, secret, emails } : null;
}

async function hmac(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode("kaamtrack-session-v1|" + data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Cookie value: <expiry ms>:<email>:<signature>. It can't be made or changed without the key.
export async function signSession(email: string, key: string, now = Date.now()): Promise<string> {
  const exp = now + SESSION_DAYS * 86_400_000;
  const e = encodeURIComponent(email.toLowerCase());
  return `${exp}:${e}:${await hmac(key, `${exp}:${e}`)}`;
}

// The signed-in email, or "" if the cookie is missing, forged or expired. Whether that email is still allowed in
// is a separate check (canEnter), because the Settings list can change after someone signs in.
export async function readSession(value: string | undefined, cfg: AuthConfig, now = Date.now()): Promise<string> {
  const [exp, raw, sig] = (value ?? "").split(":");
  if (!exp || !raw || !sig || !(Number(exp) > now)) return "";
  let email: string;
  try {
    email = decodeURIComponent(raw); // Next's cookie reader may already have decoded %40 to @; both forms are fine
  } catch {
    return "";
  }
  if (!sameString(sig, await hmac(cfg.secret, `${exp}:${encodeURIComponent(email)}`))) return "";
  return email;
}

export const isAdmin = (email: string, cfg: AuthConfig) => cfg.emails.includes(email.toLowerCase());

// Admins always get in; anyone else must be on the Settings list (looked up with `onList`).
export const canEnter = async (email: string, cfg: AuthConfig, onList: (email: string) => Promise<boolean>) =>
  !!email && (isAdmin(email, cfg) || (await onList(email.toLowerCase())));

// A plain email address check for the Settings field (Google checks the account itself at sign-in).
export const isEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Check the identity Google sent back (the id_token's payload, read straight from Google's token endpoint over HTTPS).
// Returns the verified email, or why not. Whether that email is allowed in is canEnter's job.
export function checkGoogleClaims(claims: unknown, cfg: AuthConfig, now = Date.now()): { email: string } | { error: string } {
  const c = (claims && typeof claims === "object" ? claims : {}) as Record<string, unknown>;
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") return { error: "bad-token" };
  if (c.aud !== cfg.clientId) return { error: "bad-token" };
  if (!(typeof c.exp === "number" && c.exp * 1000 > now)) return { error: "bad-token" };
  const email = typeof c.email === "string" ? c.email.toLowerCase() : "";
  if (!email || c.email_verified !== true) return { error: "unverified" };
  return { email };
}

// Only send people back to a path on this site.
export const safeNext = (next: string | null | undefined) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

// Compare without stopping at the first difference.
export function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

export const cookie = (name: string, value: string, maxAgeSec: number, secure: boolean) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`;
