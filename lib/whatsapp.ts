// Sends the reminder through Meta's WhatsApp Cloud API with an approved template.
// Business-started messages must use a template; the template text lives in Meta's WhatsApp Manager.
import { reminderParams, type Lot } from "./lots.ts";

const API = "https://graph.facebook.com/v26.0";

// True once the Meta token and test/real number are configured; the board only offers automatic sending then.
export const whatsappReady = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

export async function sendReminder(lot: Lot, origin: string): Promise<string> {
  const token = process.env.WHATSAPP_TOKEN;
  const numberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !numberId) throw new Error("WhatsApp reminders are not set up yet.");

  const res = await fetch(`${API}/${numberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: `+${lot.phone}`,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE ?? "lot_reminder",
        language: { code: process.env.WHATSAPP_LANG ?? "en" },
        components: [{ type: "body", parameters: reminderParams(lot, origin).map((text) => ({ type: "text", text })) }],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `WhatsApp error ${res.status}`);
  return data?.messages?.[0]?.id ?? "";
}
