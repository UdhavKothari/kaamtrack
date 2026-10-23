import { addAllowed, allowedEmails, removeAllowed } from "@/lib/store";
import { authConfig, isAdmin, isEmail, OWNER_COOKIE, readSession } from "@/lib/owner";

// Owner only (the proxy lets only signed-in, allowed accounts reach this). Changing the list needs an admin.
const MAX = 100;

async function who(req: Request) {
  const cfg = authConfig();
  const raw = new RegExp(`(?:^|;\\s*)${OWNER_COOKIE}=([^;]*)`).exec(req.headers.get("cookie") ?? "")?.[1];
  const me = cfg ? await readSession(raw, cfg) : "";
  return { cfg, me, admin: !!cfg && !!me && isAdmin(me, cfg) };
}

export async function GET(req: Request) {
  const { cfg, me, admin } = await who(req);
  if (!cfg) return Response.json({ error: "Google sign-in isn't set up yet." }, { status: 503 });
  try {
    return Response.json({ me, admin, admins: cfg.emails, staff: await allowedEmails() });
  } catch (e) {
    console.error("load allowed emails failed", e);
    return Response.json({ error: "Couldn't load the list." }, { status: 502 });
  }
}

async function change(req: Request, add: boolean) {
  const { cfg, admin } = await who(req);
  if (!cfg) return Response.json({ error: "Google sign-in isn't set up yet." }, { status: 503 });
  if (!admin) return Response.json({ error: "Only an admin can change who signs in." }, { status: 403 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: unknown };
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!isEmail(e)) return Response.json({ error: "Enter a full email address, like name@gmail.com." }, { status: 400 });
  if (cfg.emails.includes(e)) return Response.json({ error: "That account is an admin. Admins are set in Vercel (OWNER_EMAILS)." }, { status: 400 });
  try {
    if (add) {
      const now = await allowedEmails();
      if (!now.includes(e) && now.length >= MAX) return Response.json({ error: `The list is full (${MAX}). Remove someone first.` }, { status: 400 });
      await addAllowed(e);
    } else {
      await removeAllowed(e);
    }
    return Response.json({ staff: await allowedEmails() });
  } catch (err) {
    console.error("change allowed emails failed", err);
    return Response.json({ error: "Couldn't save. Try again." }, { status: 502 });
  }
}

export const POST = (req: Request) => change(req, true);
export const DELETE = (req: Request) => change(req, false);
