// Runs the challan prompt on every photo in test-challans/ and compares with expected.json.
// Usage: npm run eval   (needs GEMINI_API_KEY in .env.local; Node strips the TypeScript types in lib/)
import { readFile, readdir } from "node:fs/promises";
import { readChallan } from "../lib/ai.ts";
import { cleanExtractions, todayIST } from "../lib/lots.ts";

const dir = new URL("../test-challans/", import.meta.url);
// Strip the byte-order mark Windows Notepad adds, or JSON.parse fails.
const expected = JSON.parse((await readFile(new URL("expected.json", dir), "utf8").catch(() => "{}")).replace(/^﻿/, ""));
const photos = (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const fields = ["job_worker", "process", "quantity", "unit", "promised_date"];
const norm = (v) => String(v ?? "").trim().toLowerCase();

let right = 0, total = 0, slowest = 0;
for (const f of photos) {
  const mime = /\.png$/i.test(f) ? "image/png" : /\.webp$/i.test(f) ? "image/webp" : "image/jpeg";
  const started = performance.now();
  let result;
  try {
    result = cleanExtractions(await readChallan((await readFile(new URL(f, dir))).toString("base64"), mime, todayIST())).cards[0];
  } catch (e) {
    console.log(`✖ ${f}: ${e.message}`);
    continue;
  }
  const secs = (performance.now() - started) / 1000;
  slowest = Math.max(slowest, secs);
  const want = expected[f];
  const marks = want
    ? fields.map((k) => {
        const ok = norm(result.form[k]) === norm(want[k]);
        total++;
        if (ok) right++;
        return `${ok ? "✔" : "✖"} ${k}=${result.form[k] || "∅"}${ok ? "" : ` (want ${want[k] || "∅"})`}`;
      })
    : fields.map((k) => `${k}=${result.form[k] || "∅"}`);
  console.log(`${f}  ${secs.toFixed(1)}s  challan=${result.isChallan}  unclear=[${result.unclear}]\n   ${marks.join("  ")}`);
}
console.log(`\n${photos.length} photos · slowest ${slowest.toFixed(1)}s` + (total ? ` · fields right ${right}/${total} (${Math.round((100 * right) / total)}%)` : ""));
