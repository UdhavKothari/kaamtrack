import { setMessageState } from "@/lib/store";
import { processInbound } from "@/lib/conversation";
import { parseWebhook, verifySignature } from "@/lib/webhook";

// Meta's webhook. Inert until WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET are set and Meta points here.

// Meta calls this once when you save the webhook URL, to check you own it.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === expected) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Meta calls this for every reply and delivery receipt. Always answer 200 quickly once the signature is good,
// or Meta keeps retrying.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET ?? "")) {
    return new Response("Bad signature", { status: 401 });
  }

  try {
    const { messages, statuses } = parseWebhook(JSON.parse(raw));
    for (const m of messages) await processInbound(m);
    for (const s of statuses) await setMessageState(s.id, s.state, s.error);
  } catch (e) {
    console.error("webhook failed", e);
  }
  return new Response("ok", { status: 200 });
}
