// Glue between the pure reply logic (inbound.ts), the senders (whatsapp.ts) and Redis (store.ts).
import { handleInbound, type Deps, type Msg } from "./inbound.ts";
import { reminderMessage, type Lot } from "./lots.ts";
import { claimMessage, listLots, logMessage, markReminded, setStatus } from "./store.ts";
import { sendReminder, sendText, whatsappMode } from "./whatsapp.ts";

const deps: Deps = {
  listLots,
  setStatus,
  claim: claimMessage,
  record: (token, m) => logMessage(token, m),
  // An answer to the job worker. A failed send is logged as failed so the owner can see it, never thrown.
  reply: async (lot: Lot, text: string, kind: Msg["kind"]) => {
    try {
      const sent = await sendText(lot.phone, text);
      await logMessage(lot.token, { dir: "out", kind, text, provider: sent.provider, state: "sent", id: sent.id });
    } catch (e) {
      await logMessage(lot.token, { dir: "out", kind, text, provider: whatsappMode(), state: "failed", error: e instanceof Error ? e.message : "send failed" });
    }
  },
};

// One job worker message in (from Meta's webhook or the simulator).
export const processInbound = (msg: { from: string; text: string; id?: string }) => handleInbound(msg, deps);

// Send the reminder, record it in the lot's WhatsApp timeline, and stamp the lot as reminded.
export async function remindLot(lot: Lot, origin: string): Promise<void> {
  const sent = await sendReminder(lot, origin);
  await logMessage(lot.token, { dir: "out", kind: "reminder", text: reminderMessage(lot, origin), provider: sent.provider, state: "sent", id: sent.id });
  await markReminded(lot.token, new Date().toISOString());
}
