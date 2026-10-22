// Owner passcode helpers. Web Crypto only, because proxy.ts may run outside Node.
export const OWNER_COOKIE = "kt_owner";

// Pages and APIs that stay open with no passcode:
//  - the job worker's link page and its status API (one lot, by its secret token)
//  - Meta's webhook (checks its own signature) and the daily cron (checks its own secret)
//  - the sign-in page and API themselves
const OPEN = [/^\/s\/[^/]+$/, /^\/api\/lots\/[0-9a-f]{16}$/, /^\/api\/whatsapp\/webhook$/, /^\/api\/cron\/[^/]+$/, /^\/login$/, /^\/api\/login$/];
export const isOpenPath = (pathname: string) => OPEN.some((re) => re.test(pathname));

// The cookie holds a keyed hash of a fixed phrase, never the passcode, and can't be made without the passcode.
export async function ownerToken(passcode: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(passcode), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("kaamtrack-owner-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compare without stopping at the first difference.
export function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
