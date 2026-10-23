// Replays the checks we used to run by hand, against a running copy of the app. Cleans up after itself.
//   node scripts/smoke.mjs [baseUrl]      (default http://localhost:3000, or set BASE_URL)
// If Google sign-in is on, set GOOGLE_CLIENT_SECRET and OWNER_EMAILS in this shell (as in Vercel) so the script can make its own session.
import { signSession } from "../lib/owner.ts";
const BASE = (process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
// A real, tiny JPEG (1x1 pixel) to stand in for a challan photo.
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

let cookie = "";
let failed = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON (an image or a page) */ }
  return { status: res.status, json, text, type: res.headers.get("content-type") ?? "", setCookie: res.headers.get("set-cookie") ?? "", location: res.headers.get("location") ?? "" };
}

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) failed++;
}

const lot = { job_worker: "SMOKE TEST dyers", phone: "90000 00099", process: "dyeing", quantity: "321", unit: "metres", promised_date: "2026-10-20" };
const tokens = [];

try {
  const signedIn = !!(process.env.GOOGLE_CLIENT_SECRET && process.env.OWNER_EMAILS);
  if (signedIn) {
    // Same cookie the Google sign-in sets, for the first owner email. Needs the same secret as the site.
    cookie = `kt_owner=${await signSession(process.env.OWNER_EMAILS.split(",")[0].trim(), process.env.GOOGLE_CLIENT_SECRET.trim())}`;
    check("signed-in session is accepted", (await call("GET", "/api/lots")).status === 200);
    const google = await call("GET", "/api/auth/google");
    const who = "smoke-test@example.com";
    const added = await call("POST", "/api/settings", { email: who });
    check("an admin can add an account in Settings", added.status === 200 && added.json?.staff?.includes(who), `status ${added.status}`);
    const removed = await call("DELETE", "/api/settings", { email: who });
    check("an admin can remove it again", removed.status === 200 && !removed.json?.staff?.includes(who), `status ${removed.status}`);
    check("Settings refuses something that isn't an email", (await call("POST", "/api/settings", { email: "not an email" })).status === 400);
    check("Sign in with Google goes to Google's account chooser", google.status === 302 && google.location.startsWith("https://accounts.google.com/"), `${google.status} ${google.location.slice(0, 40)}`);
  }

  // Saving a lot: required fields and phone rules
  check("save without a phone is refused", (await call("POST", "/api/lots", { ...lot, phone: "" })).status === 400);
  check("save with a bad phone is refused", (await call("POST", "/api/lots", { ...lot, phone: "12345" })).status === 400);
  check("save with a missing quantity is refused", (await call("POST", "/api/lots", { ...lot, quantity: "0" })).status === 400);
  const a = await call("POST", "/api/lots", lot);
  check("save a good lot", a.status === 200 && a.json?.status === "Sent", `status ${a.status}`);
  if (a.json?.token) tokens.push(a.json.token);
  const token = a.json?.token;
  check("the saved lot never returns the phone number", !!a.json && !("phone" in a.json) && a.json.has_phone === true);

  // The board
  const list = await call("GET", "/api/lots");
  const row = list.json?.find((l) => l.token === token);
  check("the lot is on the board, overdue, with no phone number anywhere", !!row && row.overdue === true && !list.text.includes("9000000099"));

  // The job worker's link: open to anyone, one lot, four statuses
  check("worker link loads the lot", (await call("GET", `/api/lots/${token}`)).status === 200);
  const tap = await call("POST", `/api/lots/${token}`, { status: "In process" });
  check("worker taps In process", tap.status === 200 && tap.json?.status === "In process");
  check("board shows the new status", (await call("GET", "/api/lots")).json?.find((l) => l.token === token)?.status === "In process");
  check("an unknown status is refused", (await call("POST", `/api/lots/${token}`, { status: "Hacked" })).status === 400);
  check("an unknown link is not found", (await call("POST", "/api/lots/0123456789abcdef", { status: "Ready" })).status === 404);

  // Owner edit
  const form = await call("GET", `/api/lots/${token}/edit`);
  check("edit form has the phone as 10 digits", form.json?.form?.phone === "9000000099", JSON.stringify(form.json));
  const edited = await call("POST", `/api/lots/${token}/edit`, { ...form.json.form, quantity: "654" });
  check("edit saves", edited.status === 200 && edited.json?.quantity === 654);
  check("edit keeps the status", edited.json?.status === "In process");

  // Free WhatsApp nudge
  const nudge = await call("POST", `/api/lots/${token}/nudge`);
  check("nudge returns a chat link with the reminder typed in", nudge.status === 200 && nudge.json?.url?.startsWith("https://wa.me/919000000099?text="));

  // Kept challan photo
  const b = await call("POST", "/api/lots", { ...lot, photo: TINY_JPEG });
  if (b.json?.token) tokens.push(b.json.token);
  check("a lot saved with a photo remembers it", b.status === 200 && b.json?.has_photo === true);
  const photo = await call("GET", `/api/lots/${b.json?.token}/photo`);
  check("the photo comes back as a JPEG", photo.status === 200 && photo.type.includes("image/jpeg"), `${photo.status} ${photo.type}`);
  check("a lot with no photo has none", (await call("GET", `/api/lots/${token}/photo`)).status === 404);
  const evil = await call("POST", "/api/lots", { ...lot, photo: "data:image/png;base64,AAAA" });
  if (evil.json?.token) tokens.push(evil.json.token);
  check("a non-JPEG photo is ignored, the lot still saves", evil.status === 200 && evil.json?.has_photo === false);

  // Sign-in (only when it is on)
  if (signedIn) {
    const saved = cookie;
    cookie = "";
    check("signed out, the board API is locked", (await call("GET", "/api/lots")).status === 401);
    check("signed out, the board page goes to sign-in", (await call("GET", "/")).location.includes("/login"));
    check("signed out, the worker link still works", (await call("GET", `/api/lots/${token}`)).status === 200);
    cookie = "kt_owner=" + saved.slice(9).replace(/:[0-9a-f]+$/, ":" + "0".repeat(64));
    check("a forged session is refused", (await call("GET", "/api/lots")).status === 401);
    cookie = saved;
  }
} catch (e) {
  console.log("FAIL  the script hit an error:", e instanceof Error ? e.message : e);
  failed++;
} finally {
  // Clean up every lot this run made
  for (const t of tokens) await call("POST", `/api/lots/${t}/delete`).catch(() => {});
  if (tokens.length) {
    const gone = (await call("GET", `/api/lots/${tokens[0]}`)).status === 404;
    check("deleted lots are gone and their links stop working", gone);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
