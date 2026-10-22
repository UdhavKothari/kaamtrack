// Meta's WhatsApp webhook: the signature check and reading the payload. Written to Meta's documented shapes.
import { createHmac, timingSafeEqual } from "node:crypto";

// Meta signs the raw body with the app secret and sends "sha256=<hex>" in X-Hub-Signature-256.
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = header.slice(7);
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export type InboundMessage = { from: string; text: string; id: string };
export type DeliveryStatus = { id: string; state: "sent" | "delivered" | "read" | "failed"; error?: string };

type Loose = Record<string, any>; // Meta's payload is deeply nested; every access below is optional-chained

// Pulls out the worker's replies (typed text, template buttons, interactive buttons) and delivery receipts.
export function parseWebhook(payload: unknown): { messages: InboundMessage[]; statuses: DeliveryStatus[] } {
  const messages: InboundMessage[] = [];
  const statuses: DeliveryStatus[] = [];
  const p = payload as Loose;
  for (const entry of p?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value: Loose = change?.value ?? {};
      for (const m of value.messages ?? []) {
        const text = m?.text?.body ?? m?.button?.text ?? m?.interactive?.button_reply?.title ?? m?.interactive?.list_reply?.title;
        if (typeof m?.from === "string" && typeof m?.id === "string" && typeof text === "string") {
          messages.push({ from: m.from, text, id: m.id });
        }
      }
      for (const s of value.statuses ?? []) {
        if (typeof s?.id === "string" && ["sent", "delivered", "read", "failed"].includes(s?.status)) {
          statuses.push({ id: s.id, state: s.status, error: s?.errors?.[0]?.message ?? s?.errors?.[0]?.title });
        }
      }
    }
  }
  return { messages, statuses };
}
