import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { displayState, handleInbound, parseReply, resolveLot, type Deps, type Msg, type NewMsg } from "../lib/inbound.ts";
import { newLot, REMINDER_TEMPLATE, reminderMessage, type Lot } from "../lib/lots.ts";
import { parseWebhook, verifySignature } from "../lib/webhook.ts";

const form = { job_worker: "Shree", facility: "", quality: "", challan_no: "", taka: "", marka: "", phone: "98765 43210", process: "dyeing", quantity: "1200", unit: "metres", promised_date: "2026-11-01" };
const mk = (over: Partial<Lot> = {}): Lot => ({ ...newLot(form), token: Math.random().toString(16).slice(2).padEnd(16, "0").slice(0, 16), ...over });
const PHONE = "919876543210";

test("replies: menu numbers, status words, Hindi words, and nothing ambiguous", () => {
  assert.equal(parseReply("3").status, "Ready");
  assert.equal(parseReply(" 1. ").status, "Received");
  assert.equal(parseReply("4").status, "Dispatched");
  assert.equal(parseReply("READY!!").status, "Ready");
  assert.equal(parseReply("kaam chalu hai").status, "In process");
  assert.equal(parseReply("माल तैयार").status, "Ready");
  assert.equal(parseReply("ho gaya sir").status, "Ready");
  assert.equal(parseReply("nikal gaya").status, "Dispatched");
  assert.equal(parseReply("5").status, null);
  assert.equal(parseReply("hello").status, null);
  assert.equal(parseReply("ready and dispatched").status, null); // two statuses: don't guess
  assert.equal(parseReply("already").status, null); // whole words only
  assert.deepEqual(parseReply("3 1200"), { status: "Ready", rest: "1200" });
});

test("which lot: only this sender's open lots; one lot wins; quantity names it; latest reminder wins; else ask", () => {
  const a = mk({ quantity: 1200 }), b = mk({ quantity: 800 }), other = mk({ phone: "919000000001" }), done = mk({ status: "Dispatched" });
  assert.equal(resolveLot([other], PHONE, "").kind, "none");
  assert.equal(resolveLot([done], PHONE, "").kind, "none");
  assert.equal((resolveLot([a, other, done], PHONE, "") as { lot: Lot }).lot, a);
  assert.equal((resolveLot([a, b], PHONE, "800") as { lot: Lot }).lot, b);
  const aR = { ...a, last_reminded_at: "2026-11-01T04:00:00.000Z" }, bR = { ...b, last_reminded_at: "2026-11-02T04:00:00.000Z" };
  assert.equal((resolveLot([aR, bR], PHONE, "") as { lot: Lot }).lot, bR);
  assert.equal(resolveLot([a, b], PHONE, "").kind, "ask"); // two open lots, nothing reminded, nothing named
  assert.equal(resolveLot([a, b], PHONE, "900").kind, "ask"); // a quantity that matches neither: don't guess
});

function fake(lots: Lot[]) {
  const log: { token: string; m: NewMsg }[] = [];
  const replies: { text: string; kind: Msg["kind"] }[] = [];
  const seen = new Set<string>();
  const deps: Deps = {
    listLots: async () => lots,
    setStatus: async (token, status, at) => {
      const l = lots.find((x) => x.token === token);
      if (!l) return null;
      Object.assign(l, { status, status_updated_at: at });
      return l;
    },
    claim: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
    record: async (token, m) => void log.push({ token, m }),
    reply: async (_lot, text, kind) => void replies.push({ text, kind }),
  };
  return { deps, log, replies };
}

test("a '3' reply sets Ready, logs the reply and the status note, and answers with a confirmation", async () => {
  const lot = mk();
  const { deps, log, replies } = fake([lot]);
  const r = await handleInbound({ from: "+91 98765 43210", text: "3", id: "wamid.1" }, deps);
  assert.equal(r.outcome, "updated");
  assert.equal(lot.status, "Ready");
  assert.deepEqual(log.map((l) => [l.m.dir, l.m.kind]), [["in", "reply"], ["note", "status"]]);
  assert.match(replies[0].text, /^Thanks\. Your dyeing lot of 1200 metres is marked Ready ✓/);
  assert.equal(replies[0].kind, "confirmation");
});

test("redelivered messages are handled once; strangers get silence; junk gets the menu", async () => {
  const lot = mk();
  const { deps, replies } = fake([lot]);
  assert.equal((await handleInbound({ from: PHONE, text: "2", id: "wamid.2" }, deps)).outcome, "updated");
  assert.equal((await handleInbound({ from: PHONE, text: "2", id: "wamid.2" }, deps)).outcome, "duplicate");
  assert.equal(replies.length, 1);
  assert.equal((await handleInbound({ from: "919000000009", text: "3" }, deps)).outcome, "ignored");
  assert.equal(replies.length, 1);
  const r = await handleInbound({ from: PHONE, text: "what is this" }, deps);
  assert.equal(r.outcome, "unclear");
  assert.match(replies[1].text, /Reply 1 Received, 2 In process, 3 Ready, 4 Dispatched\./);
  assert.equal(lot.status, "In process"); // the junk reply changed nothing
});

test("with two open lots and no clue, the app asks instead of guessing", async () => {
  const a = mk({ quantity: 1200 }), b = mk({ quantity: 800 });
  const { deps, replies } = fake([a, b]);
  assert.equal((await handleInbound({ from: PHONE, text: "3" }, deps)).outcome, "ask");
  assert.match(replies[0].text, /^Which lot\? Reply like "3 1200"/);
  assert.equal(a.status, "Sent");
  assert.equal((await handleInbound({ from: PHONE, text: "3 800" }, deps)).outcome, "updated");
  assert.equal(b.status, "Ready");
  assert.equal(a.status, "Sent");
});

test("reminder text shown in the simulator is the approved template, filled in", () => {
  const lot = mk({ token: "0123456789abcdef" });
  assert.match(REMINDER_TEMPLATE, /\{\{1\}\}.*\{\{2\}\}.*\{\{3\}\}.*\{\{4\}\}/);
  assert.equal(
    reminderMessage(lot, "https://x.app"),
    "Reminder: your dyeing lot of 1200 metres is due on 01/11/2026. Please tap your current status here: https://x.app/s/0123456789abcdef Or reply 1 Received, 2 In process, 3 Ready, 4 Dispatched. Thank you.",
  );
});

test("simulated messages show as delivered a few seconds after sending; real ones show what Meta says", () => {
  const base: Msg = { id: "a", at: "2026-11-01T10:00:00.000Z", dir: "out", kind: "reminder", text: "", provider: "mock", state: "sent" };
  assert.equal(displayState(base, new Date("2026-11-01T10:00:01.000Z")), "sent");
  assert.equal(displayState(base, new Date("2026-11-01T10:00:10.000Z")), "delivered");
  assert.equal(displayState({ ...base, provider: "meta" }, new Date("2026-11-01T10:00:10.000Z")), "sent");
  assert.equal(displayState({ ...base, state: "failed" }, new Date("2026-11-01T10:00:10.000Z")), "failed");
});

test("webhook: signature accepted only when it matches the exact body and secret", () => {
  const body = JSON.stringify({ hello: "world" });
  const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
  assert.equal(verifySignature(body, sig, "s3cret"), true);
  assert.equal(verifySignature(body + " ", sig, "s3cret"), false);
  assert.equal(verifySignature(body, sig, "other"), false);
  assert.equal(verifySignature(body, null, "s3cret"), false);
  assert.equal(verifySignature(body, "sha256=abc", "s3cret"), false);
  assert.equal(verifySignature(body, sig, ""), false);
});

test("webhook payload: replies and delivery receipts are read; junk is ignored", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ id: "1", changes: [{ field: "messages", value: {
      messages: [
        { from: "919876543210", id: "wamid.A", type: "text", text: { body: "3" } },
        { from: "919876543210", id: "wamid.B", type: "button", button: { text: "Ready" } },
        { from: "919876543210", id: "wamid.C", type: "image" },
      ],
      statuses: [
        { id: "wamid.X", status: "delivered", recipient_id: "919876543210" },
        { id: "wamid.Y", status: "failed", errors: [{ message: "Recipient not in allowed list" }] },
        { id: "wamid.Z", status: "weird" },
      ],
    } }] }],
  };
  const r = parseWebhook(payload);
  assert.deepEqual(r.messages.map((m) => [m.id, m.text]), [["wamid.A", "3"], ["wamid.B", "Ready"]]);
  assert.deepEqual(r.statuses, [
    { id: "wamid.X", state: "delivered", error: undefined },
    { id: "wamid.Y", state: "failed", error: "Recipient not in allowed list" },
  ]);
  assert.deepEqual(parseWebhook(null), { messages: [], statuses: [] });
  assert.deepEqual(parseWebhook({ entry: "nope" }), { messages: [], statuses: [] });
});
