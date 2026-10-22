import { getLot } from "@/lib/store";
import { minutesUntilRemindable } from "@/lib/lots";
import { remindLot } from "@/lib/conversation";

// "Send reminder now": sends one WhatsApp reminder (real or simulated) and records it in the lot's timeline.
export async function POST(req: Request, ctx: RouteContext<"/api/lots/[token]/remind">) {
  const { token } = await ctx.params;
  try {
    const lot = await getLot(token);
    if (!lot) return Response.json({ error: "Lot not found" }, { status: 404 });
    if (!lot.phone) return Response.json({ error: "This lot has no WhatsApp number." }, { status: 400 });

    const wait = minutesUntilRemindable(lot);
    if (wait) return Response.json({ error: `Reminded recently. Try again in ${wait} min.` }, { status: 429 });

    await remindLot(lot, new URL(req.url).origin);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("remind failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't send the reminder." }, { status: 502 });
  }
}
