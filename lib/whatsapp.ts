// WhatsApp sending. Two providers behind one switch (WHATSAPP_MODE):
//   mock (default): nothing leaves the app; messages are recorded and shown in the simulator.
//   meta: Meta's WhatsApp Cloud API with the approved template (reminders) or plain text (replies, free inside 24h).
import { reminderParams, type Lot } from "./lots.ts";

const API = "https://graph.facebook.com/v26.0";

export type Provider = "mock" | "meta";
export const whatsappMode = (): Provider => (process.env.WHATSAPP_MODE === "meta" ? "meta" : "mock");

// The board offers automatic sending when simulating, or when Meta's token and number are configured.
export const whatsappReady = () => whatsappMode() === "mock" || !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

async function metaSend(to: string, payload: Record<string, unknown>): Promise<string> {
  const token = process.env.WHATSAPP_TOKEN;
  const numberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !numberId) throw new Error("WhatsApp reminders are not set up yet.");

  const res = await fetch(`${API}/${numberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: `+${to}`, ...payload }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `WhatsApp error ${res.status}`);
  return data?.messages?.[0]?.id ?? "";
}

const mockId = () => `mock-${crypto.randomUUID().slice(0, 12)}`;

// Business-started reminder: must be the approved template.
export async function sendReminder(lot: Lot, origin: string): Promise<{ id: string; provider: Provider }> {
  if (whatsappMode() === "mock") return { id: mockId(), provider: "mock" };
  const id = await metaSend(lot.phone, {
    type: "template",
    template: {
      name: process.env.WHATSAPP_TEMPLATE ?? "lot_reminder",
      language: { code: process.env.WHATSAPP_LANG ?? "en" },
      components: [{ type: "body", parameters: reminderParams(lot, origin).map((text) => ({ type: "text", text })) }],
    },
  });
  return { id, provider: "meta" };
}

// Free-form text, allowed because the job worker messaged first (24-hour window).
export async function sendText(phone: string, text: string): Promise<{ id: string; provider: Provider }> {
  if (whatsappMode() === "mock") return { id: mockId(), provider: "mock" };
  return { id: await metaSend(phone, { type: "text", text: { body: text } }), provider: "meta" };
}
