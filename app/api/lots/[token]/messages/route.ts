import { lotMessages } from "@/lib/store";
import { displayState } from "@/lib/inbound";
import { whatsappMode } from "@/lib/whatsapp";

// The lot's WhatsApp timeline, oldest first, with delivery ticks.
export async function GET(_req: Request, ctx: RouteContext<"/api/lots/[token]/messages">) {
  const { token } = await ctx.params;
  try {
    const now = new Date();
    const messages = (await lotMessages(token)).map((m) => ({ ...m, state: displayState(m, now) }));
    return Response.json({ mode: whatsappMode(), messages });
  } catch (e) {
    console.error("messages failed", e);
    return Response.json({ error: "Couldn't load messages." }, { status: 502 });
  }
}
