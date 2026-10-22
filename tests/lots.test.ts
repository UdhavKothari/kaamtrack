import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanExtraction, daysOut, isOverdue, isToken, missingFields, newLot, rowsToLots, STATUSES } from "../lib/lots.ts";

test("good AI output becomes a full card", () => {
  const r = cleanExtraction({
    is_challan: true, job_worker: "Shree Dyeing", process: "Dyeing", quantity: 1200, unit: "metres",
    promised_date: "2026-10-28", unclear_fields: [],
  });
  assert.equal(r.isChallan, true);
  assert.deepEqual(r.form, { job_worker: "Shree Dyeing", process: "dyeing", quantity: "1200", unit: "metres", promised_date: "2026-10-28" });
  assert.deepEqual(r.unclear, []);
  assert.deepEqual(missingFields(r.form), []);
});

test("bad or missing AI output becomes blank, unclear and required", () => {
  const r = cleanExtraction({ is_challan: "yes", job_worker: null, process: "washing", quantity: -5, unit: "kg", promised_date: "31/02/2026" });
  assert.equal(r.isChallan, false);
  assert.deepEqual(r.form, { job_worker: "", process: "", quantity: "", unit: "metres", promised_date: "" });
  assert.deepEqual(r.unclear.sort(), ["job_worker", "process", "promised_date", "quantity"]);
  assert.deepEqual(missingFields(r.form), ["job_worker", "process", "quantity", "promised_date"]);
  assert.deepEqual(cleanExtraction(null).form.job_worker, "");
  assert.equal(cleanExtraction("garbage").isChallan, false);
});

test("missingFields rejects whitespace, zero and impossible dates", () => {
  assert.deepEqual(
    missingFields({ job_worker: "  ", process: "dyeing", quantity: "0", unit: "thaan", promised_date: "2026-02-30" }),
    ["job_worker", "quantity", "promised_date"],
  );
});

test("overdue only when promised date passed and not dispatched", () => {
  assert.equal(isOverdue({ promised_date: "2026-10-21", status: "In process" }, "2026-10-22"), true);
  assert.equal(isOverdue({ promised_date: "2026-10-22", status: "In process" }, "2026-10-22"), false);
  assert.equal(isOverdue({ promised_date: "2026-10-01", status: "Dispatched" }, "2026-10-22"), false);
});

test("days out counts India calendar days", () => {
  // 20 Oct 23:00 IST = 20 Oct 17:30 UTC
  assert.equal(daysOut({ created_at: "2026-10-20T17:30:00.000Z" }, "2026-10-22"), 2);
  // 20 Oct 19:00 UTC is already 21 Oct in India
  assert.equal(daysOut({ created_at: "2026-10-20T19:00:00.000Z" }, "2026-10-22"), 1);
});

test("new lots get a valid token and start as Sent; only 4 statuses exist", () => {
  const lot = newLot({ job_worker: " A ", process: "printing", quantity: "40", unit: "thaan", promised_date: "2026-11-01" });
  assert.ok(isToken(lot.token));
  assert.equal(lot.status, "Sent");
  assert.equal(lot.job_worker, "A");
  assert.equal(lot.quantity, 40);
  assert.deepEqual(STATUSES, ["Received", "In process", "Ready", "Dispatched"]);
  assert.equal(isToken("../../etc"), false);
});

test("sheet rows are normalised and junk rows dropped", () => {
  const lots = rowsToLots([{ token: "0123456789abcdef", quantity: "12.5", row_number: 2 }, {}, { token: "bad" }]);
  assert.equal(lots.length, 1);
  assert.equal(lots[0].quantity, 12.5);
  assert.deepEqual(rowsToLots({ message: "Workflow was started" }), []);
});
