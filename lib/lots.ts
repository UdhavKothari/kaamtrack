// Plain rules for lots. No AI here: everything is checkable and never guesses.

export const PROCESSES = ["dyeing", "printing", "embroidery", "other"];
// "thaan" (one roll of fabric, length varies) stays valid for old lots but the screens only offer metres and lots.
export const UNITS = ["metres", "lots", "thaan"];
export const LOT_METRES = 1200; // one "lot" = 1200 metres
export const STATUSES = ["Received", "In process", "Ready", "Dispatched"];
export const FIRST_STATUS = "Sent";

// ponytail: thaan length varies, so it is not counted in metre totals.
export const toMetres = (quantity: number, unit: string) => (unit === "lots" ? quantity * LOT_METRES : unit === "metres" ? quantity : 0);

// "3 lots (3600 m)", "800 metres", "40 thaan".
export const qtyText = (l: { quantity: number; unit: string }) => (l.unit === "lots" ? `${l.quantity} lots (${toMetres(l.quantity, l.unit)} m)` : `${l.quantity} ${l.unit}`);

// What the lot card edits. Strings because they come from form inputs; "" means blank.
export type LotForm = {
  job_worker: string;
  facility: string; // the company / unit the goods go to (optional)
  phone: string;
  process: string;
  quality: string; // fabric quality, e.g. "60 gram georgette" (optional)
  quantity: string;
  unit: string;
  promised_date: string;
};

// A remark from the job worker: typed, or a voice note that Gemini turned into text and a short summary.
export type Note = { at: string; status: string; text: string; voice: boolean; summary: string; problem: boolean; new_date: string };

// One lot as stored. `phone` is the job worker's WhatsApp number as 91XXXXXXXXXX.
export type Lot = {
  token: string;
  created_at: string;
  job_worker: string;
  facility: string;
  phone: string;
  process: string;
  quality: string;
  quantity: number;
  unit: string;
  promised_date: string;
  status: string;
  status_updated_at: string;
  last_reminded_at: string;
  has_photo: boolean; // the challan photo is kept (see savePhoto in store.ts)
  notes: Note[]; // newest last, at most NOTES_KEPT
};

// A lot as the browser sees it: the phone number never leaves the server.
export type PublicLot = Omit<Lot, "phone"> & { has_phone: boolean };

export const REQUIRED: (keyof LotForm)[] = ["job_worker", "phone", "process", "quantity", "promised_date"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function isValidDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Indian mobile numbers only. Returns 91XXXXXXXXXX, or "" when the input isn't one.
// ponytail: India only; swap in libphonenumber if job workers abroad ever matter.
export function normalizePhone(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return /^91[6-9]\d{9}$/.test(d) ? d : "";
}

// The 10 digits staff see and type; the stored form adds the 91.
export const localPhone = (normalized: string) => normalized.slice(2);

// Turn whatever the AI sent back into safe form values. Anything wrong becomes blank and unclear.
export function cleanExtraction(raw: unknown) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const unclear = new Set(Array.isArray(r.unclear_fields) ? r.unclear_fields.filter((f) => typeof f === "string") : []);

  const process = str(r.process).toLowerCase();
  const unit = str(r.unit).toLowerCase();
  const qty = typeof r.quantity === "number" ? r.quantity : Number(str(r.quantity));
  const date = str(r.promised_date);

  const form: LotForm = {
    job_worker: str(r.job_worker),
    facility: str(r.facility),
    phone: localPhone(normalizePhone(r.job_worker_phone)),
    process: PROCESSES.includes(process) ? process : "",
    quality: str(r.quality),
    quantity: Number.isFinite(qty) && qty > 0 ? String(qty) : "",
    unit: UNITS.includes(unit) ? unit : "metres",
    promised_date: isValidDate(date) ? date : "",
  };
  for (const k of REQUIRED) if (!form[k]) unclear.add(k);

  return { isChallan: r.is_challan === true, form, unclear: [...unclear] as string[] };
}

// Required fields that are blank or invalid. Save is allowed only when this is empty.
export function missingFields(f: LotForm): (keyof LotForm)[] {
  const qty = Number(f.quantity);
  return REQUIRED.filter((k) => {
    if (k === "quantity") return !(Number.isFinite(qty) && qty > 0);
    if (k === "promised_date") return !isValidDate(f.promised_date);
    if (k === "process") return !PROCESSES.includes(f.process);
    if (k === "phone") return !normalizePhone(f.phone);
    return !f[k].trim();
  });
}

export function makeToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export const isToken = (s: string) => /^[0-9a-f]{16}$/.test(s);

export function newLot(f: LotForm, now = new Date()): Lot {
  const at = now.toISOString();
  return {
    token: makeToken(),
    created_at: at,
    ...cardFields(f),
    status: FIRST_STATUS,
    status_updated_at: at,
    last_reminded_at: "",
    has_photo: false,
    notes: [],
  };
}

// The fields the lot card edits, cleaned for storing.
const cardFields = (f: LotForm) => ({
  job_worker: f.job_worker.trim(),
  facility: f.facility.trim(),
  phone: normalizePhone(f.phone),
  process: f.process,
  quality: f.quality.trim(),
  quantity: Number(f.quantity),
  unit: UNITS.includes(f.unit) ? f.unit : "metres",
  promised_date: f.promised_date,
});

// The kept challan photo must be a small JPEG data URL (the browser shrinks it to about 1100px).
// Upstash's free plan rejects requests over 1 MB, so stay well under.
export const isStorablePhoto = (s: unknown): s is string => typeof s === "string" && s.length <= 450_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(s);

// The lot card's values for an existing lot (used when editing); the phone shows as the 10 digits staff type.
export const formFromLot = (lot: Lot): LotForm => ({
  job_worker: lot.job_worker,
  facility: lot.facility,
  phone: localPhone(lot.phone),
  process: lot.process,
  quality: lot.quality,
  quantity: String(lot.quantity),
  unit: lot.unit,
  promised_date: lot.promised_date,
});

// An edited lot keeps its link, status and history; only the card's fields change.
export const applyEdit = (lot: Lot, f: LotForm): Lot => ({ ...lot, ...cardFields(f) });

export const NOTES_KEPT = 10;

// Add a job worker's remark to a lot (newest last, oldest dropped past NOTES_KEPT).
export const withNote = (lot: Lot, note: Note): Lot => ({ ...lot, notes: [...lot.notes, note].slice(-NOTES_KEPT) });

// Turn Gemini's reading of a voice note into a safe Note. Nothing wrong ever blocks the note itself.
export function cleanNote(raw: unknown, status: string, at: string, typed = ""): Note {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const date = str(r.new_date);
  return {
    at,
    status,
    text: (typed || str(r.transcript)).slice(0, 1000),
    voice: !typed,
    summary: str(r.summary).slice(0, 300),
    problem: r.problem === true,
    new_date: isValidDate(date) ? date : "",
  };
}

// 2026-10-28 -> 28/10/2026, the way dates are written in Surat.
export const showDate = (ymd: string) => (isValidDate(ymd) ? ymd.split("-").reverse().join("/") : ymd);

// Surat time, as YYYY-MM-DD.
export const todayIST = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const dayNumber = (ymd: string) => Date.parse(ymd + "T00:00:00Z") / 86_400_000;

export function isOverdue(lot: Pick<Lot, "promised_date" | "status">, today: string) {
  return lot.status !== "Dispatched" && isValidDate(lot.promised_date) && lot.promised_date < today;
}

export function daysOut(lot: Pick<Lot, "created_at">, today: string) {
  const sent = todayIST(new Date(lot.created_at));
  return Math.max(0, Math.round(dayNumber(today) - dayNumber(sent)));
}

// ---- Board views ----

export const ARCHIVE_AFTER_DAYS = 7;

// A Dispatched lot leaves the main board a week after it was dispatched; the Archive view still shows it.
export function isArchived(lot: Pick<Lot, "status" | "status_updated_at">, now = new Date()) {
  const when = Date.parse(lot.status_updated_at);
  return lot.status === "Dispatched" && !isNaN(when) && now.getTime() - when > ARCHIVE_AFTER_DAYS * 86_400_000;
}

export type Filter = "all" | "overdue" | "archive" | (typeof STATUSES)[number] | typeof FIRST_STATUS;
export const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: FIRST_STATUS, label: "Sent" },
  { key: "Received", label: "Received" },
  { key: "In process", label: "In process" },
  { key: "Ready", label: "Ready" },
  { key: "Dispatched", label: "Dispatched" },
  { key: "archive", label: "Archive" },
];

type Viewable = Pick<Lot, "status" | "status_updated_at" | "job_worker" | "facility" | "quality" | "quantity" | "unit"> & { overdue: boolean };

// What the board shows for a status filter, the search box (job worker, facility or fabric quality) and an
// optional exact facility. Archive is separate; everything else hides archived lots.
export function filterLots<T extends Viewable>(lots: T[], filter: Filter, query = "", now = new Date(), facility = ""): T[] {
  const q = query.trim().toLowerCase();
  return lots.filter((l) => {
    if (isArchived(l, now) !== (filter === "archive")) return false;
    if (filter === "overdue" && !l.overdue) return false;
    if (filter !== "all" && filter !== "overdue" && filter !== "archive" && l.status !== filter) return false;
    if (facility && l.facility !== facility) return false;
    return !q || [l.job_worker, l.facility, l.quality].some((s) => s.toLowerCase().includes(q));
  });
}

// For the tracking chart: lots and metres at each stage, in the order work moves.
export const FLOW = [FIRST_STATUS, ...STATUSES];
export const stageTotals = (lots: Pick<Lot, "status" | "quantity" | "unit">[]) =>
  FLOW.map((status) => {
    const here = lots.filter((l) => l.status === status);
    return { status, lots: here.length, metres: here.reduce((m, l) => m + toMetres(l.quantity, l.unit), 0) };
  });

// Facilities the lots have gone to, with how many lots each; the filter sheet lists them.
export function facilitiesOf(lots: Pick<Lot, "facility">[]) {
  const n = new Map<string, number>();
  for (const l of lots) if (l.facility) n.set(l.facility, (n.get(l.facility) ?? 0) + 1);
  return [...n].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

// Stored lots can be older than the current shape; fill gaps and drop junk rows.
export function rowsToLots(rows: unknown): Lot[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && typeof r === "object" && isToken(String((r as Lot).token)))
    .map((r) => {
      const l = r as Record<string, unknown>;
      return {
        token: String(l.token),
        created_at: String(l.created_at ?? ""),
        job_worker: String(l.job_worker ?? ""),
        facility: String(l.facility ?? ""),
        phone: normalizePhone(l.phone),
        process: String(l.process ?? ""),
        quality: String(l.quality ?? ""),
        quantity: Number(l.quantity) || 0,
        unit: String(l.unit ?? ""),
        promised_date: String(l.promised_date ?? ""),
        status: String(l.status ?? FIRST_STATUS),
        status_updated_at: String(l.status_updated_at ?? ""),
        last_reminded_at: String(l.last_reminded_at ?? ""),
        has_photo: l.has_photo === true,
        notes: Array.isArray(l.notes) ? (l.notes as Note[]) : [],
      };
    });
}

export function publicLot(lot: Lot): PublicLot {
  const { phone, ...rest } = lot;
  return { ...rest, has_phone: !!phone };
}

export function whatsappLink(lot: Pick<Lot, "token" | "quantity" | "unit" | "process" | "promised_date">, origin: string) {
  const text =
    `KaamTrack lot: ${qtyText(lot)}, ${lot.process}, promised ${showDate(lot.promised_date)}.\n` +
    `Please tap your status here (no login needed): ${origin}/s/${lot.token}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ---- Reminders ----

export const REMIND_COOLDOWN_MS = 60 * 60 * 1000;

// The reminder as plain text, worded like the Meta template so both routes say the same thing.
export const reminderText = (lot: Pick<Lot, "token" | "quantity" | "unit" | "process" | "promised_date">, origin: string) => {
  const [process, quantity, date, link] = reminderParams(lot, origin);
  return `Reminder: your ${process} lot of ${quantity} is due on ${date}. Please tap your current status here: ${link} Thank you.`;
};

// Free route: a wa.me link that opens this job worker's chat with the reminder typed in; the owner taps Send.
export const nudgeLink = (lot: Pick<Lot, "token" | "phone" | "quantity" | "unit" | "process" | "promised_date">, origin: string) =>
  `https://wa.me/${lot.phone}?text=${encodeURIComponent(reminderText(lot, origin))}`;

// The four values filled into the WhatsApp template, in order.
export const reminderParams = (lot: Pick<Lot, "token" | "quantity" | "unit" | "process" | "promised_date">, origin: string) => [
  lot.process,
  qtyText(lot),
  showDate(lot.promised_date),
  `${origin}/s/${lot.token}`,
];

// The approved WhatsApp template, with {{n}} slots. Meta needs this exact text approved in WhatsApp Manager;
// the simulator shows the same text, so what you see here is what a job worker will get.
export const REMINDER_TEMPLATE =
  "Reminder: your {{1}} lot of {{2}} is due on {{3}}. Please tap your current status here: {{4}} Or reply 1 Received, 2 In process, 3 Ready, 4 Dispatched. Thank you.";

export const renderTemplate = (template: string, params: string[]) =>
  template.replace(/\{\{(\d)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");

export const reminderMessage = (lot: Pick<Lot, "token" | "quantity" | "unit" | "process" | "promised_date">, origin: string) =>
  renderTemplate(REMINDER_TEMPLATE, reminderParams(lot, origin));

// Minutes to wait before this lot may be reminded again (0 = go ahead). Stops anyone spamming a job worker.
export function minutesUntilRemindable(lot: Pick<Lot, "last_reminded_at">, now = new Date()) {
  if (!lot.last_reminded_at) return 0;
  const wait = REMIND_COOLDOWN_MS - (now.getTime() - Date.parse(lot.last_reminded_at));
  return wait > 0 ? Math.ceil(wait / 60_000) : 0;
}

// The daily job reminds a lot at most once per day, only if it has a number and is due today or late.
export function dueForReminder(lot: Lot, today: string) {
  const remindedToday = !!lot.last_reminded_at && todayIST(new Date(lot.last_reminded_at)) === today;
  return !!lot.phone && lot.status !== "Dispatched" && isValidDate(lot.promised_date) && lot.promised_date <= today && !remindedToday;
}
