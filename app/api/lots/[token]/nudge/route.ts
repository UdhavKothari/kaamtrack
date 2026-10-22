import { getLot } from "@/lib/store";
import { nudgeLink } from "@/lib/lots";

// "Nudge on WhatsApp": returns a wa.me link to this job worker's chat with the reminder typed in. Free; nothing is sent from here.
export async function POST(req: Request, ctx: RouteContext<"/api/lots/[token]/nudge">) {
  const { token } = await ctx.params;
  try {
    const lot = await getLot(token);
    if (!lot) return Response.json({ error: "Lot not found" }, { status: 404 });
    if (!lot.phone) return Response.json({ error: "This lot has no WhatsApp number." }, { status: 400 });
    return Response.json({ url: nudgeLink(lot, new URL(req.url).origin) });
  } catch (e) {
    console.error("nudge failed", e);
    return Response.json({ error: "Couldn't prepare the reminder." }, { status: 502 });
  }
}
