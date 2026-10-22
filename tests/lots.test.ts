import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanExtraction, daysOut, dueForReminder, isOverdue, isToken, minutesUntilRemindable, missingFields, newLot,
  normalizePhone, nudgeLink, publicLot, reminderParams, rowsToLots, showDate, STATUSES,
} from "../lib/lots.ts";
import { sendReminder } from "../lib/whatsapp.ts";

const good = { job_worker: "A", phone: "98765 43210", process: "printing", quantity: "40", unit: "thaan", promised_date: "2026-11-01" };

test("good AI output becomes a full card", () => {
  const r = cleanExtraction({
    is_challan: true, job_worker: "Shree Dyeing", job_worker_phone: "+91 98765-43210", process: "Dyeing", quantity: 1200,
    unit: "metres", promised_date: "2026-10-28", unclear_fields: [],
  });
  assert.equal(r.isChallan, true);
  assert.deepEqual(r.form, { job_worker: "Shree Dyeing", phone: "9876543210", process: "dyeing", quantity: "1200", unit: "metres", promised_date: "2026-10-28" });
  assert.deepEqual(r.unclear, []);
  assert.deepEqual(missingFields(r.form), []);
});

test("bad or missing AI output becomes blank, unclear and required", () => {
  const r = cleanExtraction({ is_challan: "yes", job_worker: null, job_worker_phone: "GJ05 AB 1234", process: "washing", quantity: -5, unit: "kg", promised_date: "31/02/2026" });
  assert.equal(r.isChallan, false);
  assert.deepEqual(r.form, { job_worker: "", phone: "", process: "", quantity: "", unit: "metres", promised_date: "" });
  assert.deepEqual(r.unclear.sort(), ["job_worker", "phone", "process", "promised_date", "quantity"]);
  assert.deepEqual(missingFields(r.form), ["job_worker", "phone", "process", "quantity", "promised_date"]);
  assert.deepEqual(cleanExtraction(null).form.job_worker, "");
  assert.equal(cleanExtraction("garbage").isChallan, false);
});

test("missingFields rejects whitespace, zero, impossible dates and bad phones", () => {
  assert.deepEqual(
    missingFields({ job_worker: "  ", phone: "12345", process: "dyeing", quantity: "0", unit: "thaan", promised_date: "2026-02-30" }),
    ["job_worker", "phone", "quantity", "promised_date"],
  );
});

test("phones: Indian mobiles in any common format, nothing else", () => {
  for (const ok of ["9876543210", "98765 43210", "+91 98765 43210", "919876543210", "09876543210", "(98765) 43-210"]) {
    assert.equal(normalizePhone(ok), "919876543210", ok);
  }
  for (const bad of ["", "12345", "5876543210", "98765432101", "+1 415 555 0100", "GJ05AB1234", null, undefined]) {
    assert.equal(normalizePhone(bad), "", String(bad));
  }
});

test("overdue only when promised date passed and not dispatched", () => {
  assert.equal(isOverdue({ promised_date: "2026-10-21", status: "In process" }, "2026-10-22"), true);
  assert.equal(isOverdue({ promised_date: "2026-10-22", status: "In process" }, "2026-10-22"), false);
  assert.equal(isOverdue({ promised_date: "2026-10-01", status: "Dispatched" }, "2026-10-22"), false);
});

test("dates show day first, bad dates pass through", () => {
  assert.equal(showDate("2026-10-28"), "28/10/2026");
  assert.equal(showDate("not a date"), "not a date");
});

test("days out counts India calendar days", () => {
  // 20 Oct 23:00 IST = 20 Oct 17:30 UTC
  assert.equal(daysOut({ created_at: "2026-10-20T17:30:00.000Z" }, "2026-10-22"), 2);
  // 20 Oct 19:00 UTC is already 21 Oct in India
  assert.equal(daysOut({ created_at: "2026-10-20T19:00:00.000Z" }, "2026-10-22"), 1);
});

test("new lots get a valid token, a normalised phone, and start as Sent; only 4 statuses exist", () => {
  const lot = newLot({ ...good, job_worker: " A " });
  assert.ok(isToken(lot.token));
  assert.equal(lot.status, "Sent");
  assert.equal(lot.job_worker, "A");
  assert.equal(lot.phone, "919876543210");
  assert.equal(lot.quantity, 40);
  assert.deepEqual(STATUSES, ["Received", "In process", "Ready", "Dispatched"]);
  assert.equal(isToken("../../etc"), false);
});

test("stored rows are normalised, old rows without a phone still load, junk rows dropped", () => {
  const lots = rowsToLots([{ token: "0123456789abcdef", quantity: "12.5", row_number: 2 }, {}, { token: "bad" }]);
  assert.equal(lots.length, 1);
  assert.equal(lots[0].quantity, 12.5);
  assert.equal(lots[0].phone, "");
  assert.equal(lots[0].last_reminded_at, "");
  assert.deepEqual(rowsToLots({ message: "Workflow was started" }), []);
});

test("the browser never gets the phone number", () => {
  const pub = publicLot(newLot(good));
  assert.equal("phone" in pub, false);
  assert.equal(pub.has_phone, true);
  assert.equal(JSON.stringify(pub).includes("9876543210"), false);
});

test("reminders: due today or late, once a day, needs a number, never when dispatched", () => {
  const lot = newLot(good); // promised 2026-11-01
  assert.equal(dueForReminder(lot, "2026-10-31"), false);
  assert.equal(dueForReminder(lot, "2026-11-01"), true);
  assert.equal(dueForReminder(lot, "2026-11-05"), true);
  assert.equal(dueForReminder({ ...lot, status: "Dispatched" }, "2026-11-05"), false);
  assert.equal(dueForReminder({ ...lot, phone: "" }, "2026-11-05"), false);
  assert.equal(dueForReminder({ ...lot, last_reminded_at: "2026-11-05T04:00:00.000Z" }, "2026-11-05"), false);
  assert.equal(dueForReminder({ ...lot, last_reminded_at: "2026-11-04T04:00:00.000Z" }, "2026-11-05"), true);
});

test("nudge link opens the worker's chat with the reminder already typed", () => {
  const lot = { ...newLot(good), token: "0123456789abcdef" };
  const url = nudgeLink(lot, "https://x.app");
  assert.ok(url.startsWith("https://wa.me/919876543210?text="));
  assert.equal(
    decodeURIComponent(url.split("?text=")[1]),
    "Reminder: your printing lot of 40 thaan is due on 01/11/2026. Please tap your current status here: https://x.app/s/0123456789abcdef Thank you.",
  );
});

test("Remind now has a one-hour cooldown", () => {
  const now = new Date("2026-11-05T10:00:00.000Z");
  assert.equal(minutesUntilRemindable({ last_reminded_at: "" }, now), 0);
  assert.equal(minutesUntilRemindable({ last_reminded_at: "2026-11-05T09:45:00.000Z" }, now), 45);
  assert.equal(minutesUntilRemindable({ last_reminded_at: "2026-11-05T08:59:00.000Z" }, now), 0);
});

test("WhatsApp request: Meta template shape, the four values in order, errors surface Meta's message", async () => {
  const lot = { ...newLot(good), token: "0123456789abcdef" };
  assert.deepEqual(reminderParams(lot, "https://x.app"), ["printing", "40 thaan", "01/11/2026", "https://x.app/s/0123456789abcdef"]);

  process.env.WHATSAPP_MODE = "meta";
  process.env.WHATSAPP_TOKEN = "t";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  const realFetch = globalThis.fetch;
  let seen: { url: string; init: RequestInit } | undefined;
  try {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return Response.json({ messages: [{ id: "wamid.1" }] });
    }) as typeof fetch;
    assert.deepEqual(await sendReminder(lot, "https://x.app"), { id: "wamid.1", provider: "meta" });
    assert.match(seen!.url, /graph\.facebook\.com\/v\d+\.\d+\/123\/messages$/);
    const body = JSON.parse(String(seen!.init.body));
    assert.equal(body.to, "+919876543210");
    assert.equal(body.type, "template");
    assert.equal(body.template.name, "lot_reminder");
    assert.deepEqual(body.template.components[0].parameters.map((p: { text: string }) => p.text), reminderParams(lot, "https://x.app"));

    globalThis.fetch = (async () => Response.json({ error: { message: "(#131030) Recipient phone number not in allowed list" } }, { status: 400 })) as typeof fetch;
    await assert.rejects(sendReminder(lot, "https://x.app"), /not in allowed list/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.WHATSAPP_MODE;
  }
  // default mode is the simulator: nothing is sent
  assert.equal((await sendReminder(lot, "https://x.app")).provider, "mock");
});
