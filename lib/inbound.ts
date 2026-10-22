// What a job worker's WhatsApp reply means and how the app answers. Pure logic: no network, no Redis.
// The same code runs for a real Meta message and for the on-screen simulator.
import { normalizePhone, STATUSES, type Lot } from "./lots.ts";

export const MENU = "Reply 1 Received, 2 In process, 3 Ready, 4 Dispatched.";

export type Msg = {
  id: string;
  at: string;
  dir: "in" | "out" | "note";
  kind: "reminder" | "reply" | "confirmation" | "clarification" | "status";
  text: string;
  provider: "mock" | "meta" | "worker";
  state?: "sent" | "delivered" | "read" | "failed";
  error?: string;
};
export type NewMsg = Omit<Msg, "id" | "at"> & { id?: string; at?: string };

// Words we understand, besides the numbers 1-4. Easy to extend: add a phrase to the right list.
// Hindi is written in English letters (and a few in Devanagari) the way people type it on WhatsApp.
export const PHRASES: Record<string, string[]> = {
  Received: ["received", "recieved", "mil gaya", "mil gya", "mila", "aa gaya", "aagaya", "मिल गया"],
  "In process": ["in process", "inprocess", "process", "processing", "chalu", "chalu hai", "chal raha hai", "shuru", "चालू"],
  Ready: ["ready", "taiyar", "tayyar", "tyar", "ho gaya", "ho gya", "hogaya", "done", "complete", "completed", "finished", "ban gaya", "तैयार", "हो गया"],
  Dispatched: ["dispatched", "dispatch", "sent", "bhej diya", "bhej di", "nikal gaya", "nikal diya", "delivered", "भेज दिया", "निकल गया"],
};

const normalizeText = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// "3" or "3 1200" -> menu status (rest = anything after the number, used to name a lot).
// Otherwise look for one status phrase; two different statuses in one message means we don't guess.
export function parseReply(text: string): { status: string | null; rest: string } {
  const norm = normalizeText(text);
  const menu = norm.match(/^([1-4])(?:\s+(.*))?$/);
  if (menu) return { status: STATUSES[Number(menu[1]) - 1], rest: menu[2] ?? "" };

  const padded = ` ${norm} `;
  const hits = Object.entries(PHRASES)
    .filter(([, phrases]) => phrases.some((p) => padded.includes(` ${p} `)))
    .map(([status]) => status);
  return { status: hits.length === 1 ? hits[0] : null, rest: norm };
}

export type Resolved = { kind: "lot"; lot: Lot } | { kind: "ask"; lots: Lot[] } | { kind: "none" };

// Which lot is this reply about? Only this sender's lots that aren't Dispatched yet.
// One lot: that one. Several: the one named by its quantity, else the most recently reminded, else ask.
export function resolveLot(lots: Lot[], phone: string, rest: string): Resolved {
  const open = lots.filter((l) => l.phone === phone && l.status !== "Dispatched");
  if (!open.length) return { kind: "none" };
  if (open.length === 1) return { kind: "lot", lot: open[0] };

  const numbers: string[] = rest.match(/\d+/g) ?? [];
  const named = open.filter((l) => numbers.includes(String(l.quantity)));
  if (named.length === 1) return { kind: "lot", lot: named[0] };

  const reminded = open.filter((l) => l.last_reminded_at).sort((a, b) => b.last_reminded_at.localeCompare(a.last_reminded_at));
  if (!named.length && reminded.length) return { kind: "lot", lot: reminded[0] };
  return { kind: "ask", lots: open };
}

export type Deps = {
  listLots: () => Promise<Lot[]>;
  setStatus: (token: string, status: string, at: string) => Promise<Lot | null>;
  claim: (messageId: string) => Promise<boolean>; // false if Meta redelivered a message we already handled
  record: (token: string, m: NewMsg) => Promise<unknown>;
  reply: (lot: Lot, text: string, kind: Msg["kind"]) => Promise<void>;
};

export type Outcome = "updated" | "unclear" | "ask" | "ignored" | "duplicate";

export async function handleInbound(
  msg: { from: string; text: string; id?: string },
  d: Deps,
  now = new Date(),
): Promise<{ outcome: Outcome; status?: string; lot?: Lot }> {
  if (msg.id && !(await d.claim(msg.id))) return { outcome: "duplicate" };

  const phone = normalizePhone(msg.from);
  const parsed = parseReply(msg.text);
  const found = resolveLot(await d.listLots(), phone, parsed.rest);
  if (found.kind === "none") return { outcome: "ignored" }; // not a number we sent to; say nothing

  // With several candidate lots and no way to choose, the conversation is logged on the first one.
  const anchor = found.kind === "lot" ? found.lot : found.lots[0];
  await d.record(anchor.token, { dir: "in", kind: "reply", text: msg.text, provider: "worker", id: msg.id });

  if (!parsed.status) {
    await d.reply(anchor, `Sorry, I didn't understand. ${MENU}`, "clarification");
    return { outcome: "unclear" };
  }
  if (found.kind === "ask") {
    const n = STATUSES.indexOf(parsed.status) + 1;
    await d.reply(anchor, `Which lot? Reply like "${n} ${anchor.quantity}" (status number, then the lot's quantity), or tap your link.`, "clarification");
    return { outcome: "ask" };
  }

  const lot = found.lot;
  const updated = await d.setStatus(lot.token, parsed.status, now.toISOString());
  await d.record(lot.token, { dir: "note", kind: "status", text: `Status changed to ${parsed.status} from a WhatsApp reply`, provider: "worker" });
  await d.reply(lot, `Thanks. Your ${lot.process} lot of ${lot.quantity} ${lot.unit} is marked ${parsed.status} ✓`, "confirmation");
  return { outcome: "updated", status: parsed.status, lot: updated ?? lot };
}

// In simulation nothing is delivered for real, so a message shows as delivered a few seconds after it was sent.
export const MOCK_DELIVERY_MS = 3000;
export function displayState(m: Msg, now = new Date()) {
  const late = now.getTime() - Date.parse(m.at) > MOCK_DELIVERY_MS;
  return m.provider === "mock" && m.dir === "out" && m.state === "sent" && late ? "delivered" : m.state;
}
