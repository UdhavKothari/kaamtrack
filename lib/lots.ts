// Plain rules for lots. No AI here: everything is checkable and never guesses.

export const PROCESSES = ["dyeing", "printing", "embroidery", "other"];
export const UNITS = ["metres", "thaan"];
export const STATUSES = ["Received", "In process", "Ready", "Dispatched"];
export const FIRST_STATUS = "Sent";

// What the lot card edits. Strings because they come from form inputs; "" means blank.
export type LotForm = {
  job_worker: string;
  phone: string;
  process: string;
  quantity: string;
  unit: string;
  promised_date: string;
};

// One lot as stored. `phone` is the job worker's WhatsApp number as 91XXXXXXXXXX.
export type Lot = {
  token: string;
  created_at: string;
  job_worker: string;
  phone: string;
  process: string;
  quantity: number;
  unit: string;
  promised_date: string;
  status: string;
  status_updated_at: string;
  last_reminded_at: string;
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
    phone: localPhone(normalizePhone(r.job_worker_phone)),
    process: PROCESSES.includes(process) ? process : "",
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
    job_worker: f.job_worker.trim(),
    phone: normalizePhone(f.phone),
    process: f.process,
    quantity: Number(f.quantity),
    unit: UNITS.includes(f.unit) ? f.unit : "metres",
    promised_date: f.promised_date,
    status: FIRST_STATUS,
    status_updated_at: at,
    last_reminded_at: "",
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
        phone: normalizePhone(l.phone),
        process: String(l.process ?? ""),
        quantity: Number(l.quantity) || 0,
        unit: String(l.unit ?? ""),
        promised_date: String(l.promised_date ?? ""),
        status: String(l.status ?? FIRST_STATUS),
        status_updated_at: String(l.status_updated_at ?? ""),
        last_reminded_at: String(l.last_reminded_at ?? ""),
      };
    });
}

export function publicLot(lot: Lot): PublicLot {
  const { phone, ...rest } = lot;
  return { ...rest, has_phone: !!phone };
}

export function whatsappLink(lot: Pick<Lot, "token" | "quantity" | "unit" | "process" | "promised_date">, origin: string) {
  const text =
    `KaamTrack lot: ${lot.quantity} ${lot.unit}, ${lot.process}, promised ${showDate(lot.promised_date)}.\n` +
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
  `${lot.quantity} ${lot.unit}`,
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
