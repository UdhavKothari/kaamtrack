import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyEdit, filterLots, formFromLot, isArchived, isStorablePhoto, cleanExtraction, daysOut, dueForReminder, isOverdue, isToken, minutesUntilRemindable, missingFields, newLot,
  cleanNote, facilitiesOf, cleanExtractions, formFromBody, normalizePhone, nudgeLink, qtyText, stageTotals, toMetres, withNote, publicLot, reminderParams, rowsToLots, showDate, STATUSES,
} from "../lib/lots.ts";
import { sendReminder } from "../lib/whatsapp.ts";

const good = { job_worker: "A", facility: "Shree Dyeing House", quality: "60 gram georgette", phone: "98765 43210", process: "printing", quantity: "40", unit: "thaan", promised_date: "2026-11-01", challan_no: "ML1/26", taka: "12", marka: "PO-9" };

test("good AI output becomes a full card", () => {
  const r = cleanExtraction({
    is_challan: true, job_worker: "Shree Dyeing", facility: " Shree Mills ", quality: "dull satin", job_worker_phone: "+91 98765-43210", process: "Dyeing", quantity: 1200,
    unit: "metres", promised_date: "2026-10-28", unclear_fields: [],
  });
  assert.equal(r.isChallan, true);
  assert.deepEqual(r.form, { job_worker: "Shree Dyeing", facility: "Shree Mills", phone: "9876543210", process: "dyeing", quality: "dull satin", quantity: "1200", unit: "metres", promised_date: "2026-10-28", challan_no: "", taka: "", marka: "" });
  assert.deepEqual(r.unclear, []);
  assert.deepEqual(missingFields(r.form), []);
});

test("bad or missing AI output becomes blank, unclear and required", () => {
  const r = cleanExtraction({ is_challan: "yes", job_worker: null, job_worker_phone: "GJ05 AB 1234", process: "washing", quantity: -5, unit: "kg", promised_date: "31/02/2026" });
  assert.equal(r.isChallan, false);
  assert.deepEqual(r.form, { job_worker: "", facility: "", phone: "", process: "", quality: "", quantity: "", unit: "metres", promised_date: "", challan_no: "", taka: "", marka: "" });
  assert.deepEqual(r.unclear.sort(), ["job_worker", "phone", "process", "promised_date", "quantity"]);
  assert.deepEqual(missingFields(r.form), ["job_worker", "phone", "process", "quantity", "promised_date"]);
  assert.deepEqual(cleanExtraction(null).form.job_worker, "");
  assert.equal(cleanExtraction("garbage").isChallan, false);
});

test("missingFields rejects whitespace, zero, impossible dates and bad phones", () => {
  assert.deepEqual(
    missingFields({ job_worker: "  ", facility: "", quality: "", phone: "12345", process: "dyeing", quantity: "0", unit: "thaan", promised_date: "2026-02-30", challan_no: "", taka: "", marka: "" }),
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

test("editing keeps the link, status and history; only the card's fields change; the phone round-trips", () => {
  const lot = { ...newLot(good), token: "0123456789abcdef", status: "Ready", last_reminded_at: "2026-11-01T04:00:00.000Z" };
  const f = formFromLot(lot);
  assert.deepEqual(f, { job_worker: "A", facility: "Shree Dyeing House", phone: "9876543210", process: "printing", quality: "60 gram georgette", quantity: "40", unit: "thaan", promised_date: "2026-11-01", challan_no: "ML1/26", taka: "12", marka: "PO-9" });
  const edited = applyEdit(lot, { ...f, job_worker: "  B Dyers ", phone: "+91 90000 00033", quantity: "55" });
  assert.equal(edited.token, lot.token);
  assert.equal(edited.status, "Ready");
  assert.equal(edited.created_at, lot.created_at);
  assert.equal(edited.last_reminded_at, lot.last_reminded_at);
  assert.equal(edited.job_worker, "B Dyers");
  assert.equal(edited.phone, "919000000033");
  assert.equal(edited.quantity, 55);
  assert.deepEqual(applyEdit(lot, f), lot);
});

test("board views: filters, search, and a week-old Dispatched lot moving to the Archive", () => {
  const now = new Date("2026-11-10T10:00:00.000Z");
  const row = (job_worker: string, status: string, status_updated_at: string, overdue = false, facility = "", quality = "") => ({ job_worker, status, status_updated_at, overdue, facility, quality, quantity: 1, unit: "lots" });
  const lots = [
    row("Shree Dyeing", "Ready", "2026-11-09T10:00:00.000Z"),
    row("Laxmi Prints", "In process", "2026-11-05T10:00:00.000Z", true),
    row("Om Embroidery", "Dispatched", "2026-11-09T10:00:00.000Z"),
    row("Old Dispatch", "Dispatched", "2026-11-01T10:00:00.000Z"),
  ];
  const names = (l: typeof lots) => l.map((x) => x.job_worker);
  assert.deepEqual(names(filterLots(lots, "all", "", now)), ["Shree Dyeing", "Laxmi Prints", "Om Embroidery"]); // archived hidden
  assert.deepEqual(names(filterLots(lots, "archive", "", now)), ["Old Dispatch"]);
  assert.deepEqual(names(filterLots(lots, "overdue", "", now)), ["Laxmi Prints"]);
  assert.deepEqual(names(filterLots(lots, "Ready", "", now)), ["Shree Dyeing"]);
  assert.deepEqual(names(filterLots(lots, "Dispatched", "", now)), ["Om Embroidery"]); // the old one is archived
  assert.deepEqual(names(filterLots(lots, "all", "  EMB ", now)), ["Om Embroidery"]); // case-insensitive, trimmed
  assert.deepEqual(names(filterLots(lots, "archive", "old", now)), ["Old Dispatch"]);
  assert.equal(isArchived({ status: "Dispatched", status_updated_at: "" }, now), false); // no date: never hide
  assert.equal(isArchived({ status: "Ready", status_updated_at: "2026-01-01T00:00:00.000Z" }, now), false); // only Dispatched archives
});

test("kept photos: only small JPEG data URLs are accepted", () => {
  const ok = "data:image/jpeg;base64," + "A".repeat(1000);
  assert.equal(isStorablePhoto(ok), true);
  assert.equal(isStorablePhoto("data:image/png;base64,AAAA"), false);
  assert.equal(isStorablePhoto("data:image/jpeg;base64,<script>"), false);
  assert.equal(isStorablePhoto("https://evil.example/x.jpg"), false);
  assert.equal(isStorablePhoto("data:image/jpeg;base64," + "A".repeat(450_000)), false); // too big for Upstash's free plan
  assert.equal(isStorablePhoto(undefined), false);
  assert.equal(isStorablePhoto(12345), false);
  assert.equal(newLot(good).has_photo, false);
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
  // default is off: nothing is sent; the simulator is opt-in
  await assert.rejects(sendReminder(lot, "https://x.app"), /switched off/);
  process.env.WHATSAPP_MODE = "mock";
  assert.equal((await sendReminder(lot, "https://x.app")).provider, "mock");
  delete process.env.WHATSAPP_MODE;
});

test("lots convert to metres (1 lot = 1200 m); thaan is shown but not counted", () => {
  assert.equal(toMetres(2, "lots"), 2400);
  assert.equal(toMetres(500, "metres"), 500);
  assert.equal(toMetres(40, "thaan"), 0);
  assert.equal(qtyText({ quantity: 3, unit: "lots" }), "3 lots (3600 m)");
  assert.equal(qtyText({ quantity: 40, unit: "thaan" }), "40 thaan");
});

test("search and facility filter, chart totals, facility list", () => {
  const now = new Date("2026-11-10T10:00:00.000Z");
  const row = (job_worker: string, facility: string, quality: string, status: string, quantity: number, unit: string) =>
    ({ job_worker, facility, quality, status, quantity, unit, status_updated_at: "2026-11-09T10:00:00.000Z", overdue: false });
  const lots = [
    row("Ramesh", "Shree Mills", "60 gram georgette", "Ready", 2, "lots"),
    row("Suresh", "Om Prints", "dull satin", "Sent", 500, "metres"),
    row("Mahesh", "Shree Mills", "", "Ready", 1, "lots"),
    row("Old", "", "", "Received", 10, "thaan"),
  ];
  const w = (l: typeof lots) => l.map((x) => x.job_worker);
  assert.deepEqual(w(filterLots(lots, "all", "", now, "Shree Mills")), ["Ramesh", "Mahesh"]);
  assert.deepEqual(w(filterLots(lots, "all", "om pri", now)), ["Suresh"]); // facility search
  assert.deepEqual(w(filterLots(lots, "all", "GEORGETTE", now)), ["Ramesh"]); // quality search
  assert.deepEqual(w(filterLots(lots, "Ready", "", now, "Om Prints")), []);
  assert.deepEqual(facilitiesOf(lots), [{ name: "Om Prints", count: 1 }, { name: "Shree Mills", count: 2 }]);
  assert.deepEqual(stageTotals(lots).map((s) => [s.status, s.lots, s.metres]), [["Sent", 1, 500], ["Received", 1, 0], ["In process", 0, 0], ["Ready", 2, 3600], ["Dispatched", 0, 0]]);
});

test("voice notes: Gemini's reading is cleaned, a typed note wins, only the last NOTES_KEPT stay", () => {
  const at = "2026-11-01T05:00:00.000Z";
  const v = cleanNote({ transcript: " 20 metre kam hai ", summary: "20 m short", problem: true, new_date: "2026-11-05" }, "In process", at);
  assert.deepEqual(v, { at, status: "In process", text: "20 metre kam hai", voice: true, summary: "20 m short", problem: true, new_date: "2026-11-05" });
  const bad = cleanNote({ transcript: "ok", problem: "yes", new_date: "31/02" }, "Ready", at);
  assert.equal(bad.problem, false);
  assert.equal(bad.new_date, "");
  const typed = cleanNote({ transcript: "ignored" }, "Ready", at, "Will be ready Friday");
  assert.deepEqual([typed.text, typed.voice], ["Will be ready Friday", false]);
  let lot = newLot(good);
  for (let i = 0; i < 12; i++) lot = withNote(lot, { ...typed, text: `n${i}` });
  assert.equal(lot.notes.length, 10);
  assert.equal(lot.notes[9].text, "n11");
});

test("a printed mill challan page: To-party company, person in brackets, totals, taka and marka come through", () => {
  const raw = {
    is_challan: true,
    challans: [
      { challan_no: " ML09702/26 ", facility: "RAVI EXPORTS DYEING & PRINTING", job_worker: "Manish", job_worker_phone: "02616623489",
        process: "dyeing", quality: "PENCIL", quantity: 1034, unit: "metres", taka: 12, marka: "4773*12/INDIGO/PO-1054", promised_date: null, unclear_fields: [] },
      { challan_no: "ML09707/26", facility: "RAVI EXPORTS DYEING & PRINTING", job_worker: "Manish", job_worker_phone: null,
        process: "finishing", quality: "VOLTA", quantity: 282, unit: "metres", taka: "4", marka: null, promised_date: null, unclear_fields: [] },
    ],
  };
  const r = cleanExtractions(raw);
  assert.equal(r.isChallan, true);
  assert.equal(r.cards.length, 2);
  const [a, b] = r.cards.map((c) => c.form);
  assert.deepEqual([a.challan_no, a.facility, a.job_worker, a.quality, a.quantity, a.unit, a.taka, a.marka], ["ML09702/26", "RAVI EXPORTS DYEING & PRINTING", "Manish", "PENCIL", "1034", "metres", "12", "4773*12/INDIGO/PO-1054"]);
  assert.equal(a.phone, ""); // the sender's landline is never taken as the job worker's mobile
  assert.equal(b.process, "finishing");
  assert.equal(b.taka, "4");
  assert.deepEqual(missingFields(a), ["phone", "promised_date"]); // not on the challan: staff fill these
  assert.ok(r.cards[0].unclear.includes("promised_date"));
});

test("no challans read still gives one empty card; a non-number taka is dropped; at most 20 cards", () => {
  assert.equal(cleanExtractions({}).cards.length, 1);
  assert.equal(cleanExtractions({ is_challan: true, challans: [] }).isChallan, false);
  assert.equal(cleanExtractions({ is_challan: true, challans: [{ taka: "many" }] }).cards[0].form.taka, "");
  assert.equal(cleanExtractions({ is_challan: true, challans: Array(25).fill({}) }).cards.length, 20);
});

test("saved lots keep challan no., taka and marka, and search finds them", () => {
  const lot = newLot(formFromBody({ ...good, challan_no: " ML09703/26 ", taka: "8", marka: " JAI MAA TXT " }));
  assert.deepEqual([lot.challan_no, lot.taka, lot.marka], ["ML09703/26", 8, "JAI MAA TXT"]);
  assert.equal(formFromLot(lot).taka, "8");
  const row = { ...lot, overdue: false };
  assert.equal(filterLots([row], "all", "ml09703", new Date(lot.created_at)).length, 1);
  assert.equal(filterLots([row], "all", "jai maa", new Date(lot.created_at)).length, 1);
  assert.equal(newLot(formFromBody({ ...good, taka: "-3" })).taka, 0);
});

test("only a company on the challan: it fills the job worker too, flagged for checking", () => {
  const r = cleanExtractions({ is_challan: true, challans: [{ facility: "Shree Ganesh Dyeing House", job_worker: null, unclear_fields: [] }] });
  assert.equal(r.cards[0].form.job_worker, "Shree Ganesh Dyeing House");
  assert.ok(r.cards[0].unclear.includes("job_worker"));
});
