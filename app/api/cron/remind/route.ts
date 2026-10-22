import { listLots } from "@/lib/store";
import { dueForReminder, todayIST } from "@/lib/lots";
import { remindLot } from "@/lib/conversation";
import { whatsappMode } from "@/lib/whatsapp";

export const maxDuration = 60;

// Called once a day by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
// A lot is reminded at most once per day, and a failed send is retried the next day.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (whatsappMode() === "off") return Response.json({ skipped: "WhatsApp automation is off" });
  const origin = new URL(req.url).origin;
  const today = todayIST();
  const due = (await listLots()).filter((l) => dueForReminder(l, today)).slice(0, 50);

  const results: { token: string; ok: boolean; error?: string }[] = [];
  for (const lot of due) {
    try {
      await remindLot(lot, origin);
      results.push({ token: lot.token, ok: true });
    } catch (e) {
      results.push({ token: lot.token, ok: false, error: e instanceof Error ? e.message : "failed" });
    }
  }
  return Response.json({ due: due.length, sent: results.filter((r) => r.ok).length, results });
}
