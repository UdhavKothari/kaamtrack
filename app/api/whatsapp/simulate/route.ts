import { getLot } from "@/lib/store";
import { processInbound } from "@/lib/conversation";
import { whatsappMode } from "@/lib/whatsapp";

// Simulator: "reply as the job worker". Runs exactly the code a real WhatsApp message from Meta would run.
// Only available while simulating; the number is looked up here so the browser never sees it.
export async function POST(req: Request) {
  if (whatsappMode() !== "mock") return Response.json({ error: "The simulator is off when real WhatsApp is on." }, { status: 403 });

  const { token, text } = (await req.json().catch(() => ({}))) as { token?: string; text?: string };
  if (!token || typeof text !== "string" || !text.trim() || text.length > 500) {
    return Response.json({ error: "Type a reply first." }, { status: 400 });
  }
  try {
    const lot = await getLot(token);
    if (!lot?.phone) return Response.json({ error: "Lot not found" }, { status: 404 });
    const result = await processInbound({ from: lot.phone, text: text.trim() });
    return Response.json({ outcome: result.outcome, status: result.status ?? null });
  } catch (e) {
    console.error("simulate failed", e);
    return Response.json({ error: "Couldn't run the simulated reply." }, { status: 502 });
  }
}
